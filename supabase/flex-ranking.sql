-- 플렉스시티 ranking and "visit someone's town". Run once after flex.sql
-- (Supabase Dashboard → SQL Editor). Safe to re-run.
--
-- The ranking is a cached snapshot, recomputed at most once a minute when someone
-- opens it: one Upbit call prices every coin anyone holds.

create table if not exists public.flex_rankings (
  user_id uuid primary key references public.flex_accounts (user_id) on delete cascade,
  nickname text not null,
  worth numeric not null,
  top_item text,
  updated_at timestamptz not null default now()
);
alter table public.flex_rankings enable row level security;
revoke all on public.flex_rankings from anon, authenticated;

-- Recompute total worth (cash + coins at live price + items at resale 90%)
-- for everyone, or only for p_user.
drop function if exists public.flex_refresh_rankings();
create or replace function public.flex_refresh_rankings(p_user uuid default null)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  markets text;
  r extensions.http_response;
  prices jsonb := '{}'::jsonb;
  e jsonb;
begin
  select string_agg(distinct market, ',') into markets from flex_holdings where p_user is null or user_id = p_user;
  if markets is not null then
    begin
      select * into r from extensions.http_get('https://api.upbit.com/v1/ticker?markets=' || markets);
      if r.status = 200 then
        for e in select * from jsonb_array_elements(r.content::jsonb) loop
          prices := prices || jsonb_build_object(e ->> 'market', (e ->> 'trade_price')::numeric);
        end loop;
      end if;
    exception when others then null;   -- Upbit down or a delisted coin: value coins at cost
    end;
  end if;

  delete from flex_rankings where p_user is null or user_id = p_user;
  insert into flex_rankings (user_id, nickname, worth, top_item)
  select a.user_id, p.nickname,
         a.cash
         + coalesce((select sum(case when prices ? h.market then h.qty * (prices ->> h.market)::numeric else h.cost end)
                     from flex_holdings h where h.user_id = a.user_id), 0)
         + coalesce((select sum(floor(i.price * 0.9)) from flex_items fi cross join lateral flex_item(fi.item_id) i
                     where fi.user_id = a.user_id), 0),
         (select i.name from flex_items fi cross join lateral flex_item(fi.item_id) i
          where fi.user_id = a.user_id order by i.price desc nulls last limit 1)
  from flex_accounts a
  join profiles p on p.id = a.user_id
  where p_user is null or a.user_id = p_user;
end;
$$;

-- Top 100 plus the caller's own rank (if logged in and playing).
create or replace function public.flex_ranking()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  last timestamptz;
  mine jsonb;
begin
  -- Everyone is re-priced when the oldest row is over a minute old; the caller's own
  -- row is always fresh so their latest trades show up right away.
  select min(updated_at) into last from flex_rankings;
  if (last is null or last < now() - interval '60 seconds')
     and pg_try_advisory_xact_lock(hashtext('flex_refresh_rankings')) then
    perform flex_refresh_rankings();
  elsif uid is not null and exists (select 1 from flex_accounts where user_id = uid) then
    perform flex_refresh_rankings(uid);
  end if;
  last := now();

  select jsonb_build_object('rank', rk, 'nickname', nickname, 'worth', floor(worth), 'top_item', top_item) into mine
  from (select *, rank() over (order by worth desc) rk from flex_rankings) t
  where uid is not null and user_id = uid;

  return jsonb_build_object(
    'updated', (extract(epoch from coalesce(last, now())) * 1000)::bigint,
    'start', 1000000000,
    'total', (select count(*) from flex_rankings),
    'me', mine,
    'top', coalesce((
      select jsonb_agg(jsonb_build_object('rank', rk, 'nickname', nickname, 'worth', floor(worth), 'top_item', top_item, 'me', user_id = uid) order by rk, nickname)
      from (select *, rank() over (order by worth desc) rk from flex_rankings order by worth desc limit 100) t
    ), '[]'::jsonb)
  );
end;
$$;

-- Someone's town and avatar, for the "구경하기" view.
create or replace function public.flex_visit(p_nickname text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'nickname', p.nickname,
    'place', a.place,
    'avatar', a.avatar,
    'items', coalesce((select jsonb_agg(item_id) from flex_items where user_id = a.user_id), '[]'::jsonb),
    'worth', (select floor(worth) from flex_rankings where user_id = a.user_id)
  )
  from profiles p join flex_accounts a on a.user_id = p.id
  where p.nickname = p_nickname;
$$;

revoke execute on function public.flex_refresh_rankings(uuid) from public, anon, authenticated;
revoke execute on function public.flex_ranking(), public.flex_visit(text) from public;
grant execute on function public.flex_ranking(), public.flex_visit(text) to anon, authenticated;
