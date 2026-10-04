-- 플렉스시티 "청담 플렉스 거리": lots for the top players and the billboard feed.
-- Run once after flex-ranking.sql (Supabase Dashboard → SQL Editor). Safe to re-run.

-- Everything the street needs in one call:
--   lots: top 16 by worth with the house/car/special each shows on their lot
--   feed: the latest purchases worth 1억 or more (for the billboard)
create or replace function public.flex_street()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform flex_ranking();   -- refreshes the cached ranking when it's stale
  return jsonb_build_object(
    'lots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rank', t.rk, 'nickname', t.nickname, 'worth', floor(t.worth),
        'house', (select fi.item_id from flex_items fi cross join lateral flex_item(fi.item_id) i
                  where fi.user_id = t.user_id and fi.item_id like 'house-%' order by i.price desc limit 1),
        'car', (select fi.item_id from flex_items fi cross join lateral flex_item(fi.item_id) i
                where fi.user_id = t.user_id and fi.item_id like 'car-%' order by i.price desc limit 1),
        'special', (select fi.item_id from flex_items fi cross join lateral flex_item(fi.item_id) i
                    where fi.user_id = t.user_id and fi.item_id like 'sp-%'
                      and fi.item_id not in ('sp-yacht', 'sp-superyacht', 'sp-sub')
                    order by i.price desc limit 1)
      ) order by t.rk)
      from (select *, rank() over (order by worth desc) rk from flex_rankings order by worth desc limit 16) t
    ), '[]'::jsonb),
    'feed', coalesce((
      select jsonb_agg(jsonb_build_object('nickname', f.nickname, 'item', f.item_id,
                                          't', (extract(epoch from f.bought_at) * 1000)::bigint) order by f.bought_at desc)
      from (select p.nickname, fi.item_id, fi.bought_at
            from flex_items fi
            join profiles p on p.id = fi.user_id
            cross join lateral flex_item(fi.item_id) i
            where i.price >= 100000000
            order by fi.bought_at desc limit 12) f
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.flex_street() from public;
grant execute on function public.flex_street() to anon, authenticated;
