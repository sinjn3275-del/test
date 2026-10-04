-- 플렉스시티 social features: portfolio peek, likes, visitor counts, daily treasure
-- and missions, banners (현수막) and speech bubbles (말풍선).
-- Run once after flex-street.sql (Supabase Dashboard → SQL Editor). Safe to re-run.

create table if not exists public.flex_visits (
  day date not null,
  visitor uuid not null references public.flex_accounts (user_id) on delete cascade,
  host uuid not null references public.flex_accounts (user_id) on delete cascade,
  primary key (day, visitor, host)
);
create index if not exists flex_visits_host on public.flex_visits (host, day);

create table if not exists public.flex_likes (
  liker uuid not null references public.flex_accounts (user_id) on delete cascade,
  host uuid not null references public.flex_accounts (user_id) on delete cascade,
  at timestamptz not null default now(),
  primary key (liker, host)
);
create index if not exists flex_likes_host on public.flex_likes (host);

create table if not exists public.flex_daily (
  user_id uuid not null references public.flex_accounts (user_id) on delete cascade,
  day date not null,
  treasure boolean not null default false,
  missions boolean not null default false,
  primary key (user_id, day)
);

create table if not exists public.flex_signs (
  user_id uuid primary key references public.flex_accounts (user_id) on delete cascade,
  banner text,
  banner_until timestamptz,
  bubble text,
  bubble_until timestamptz
);

alter table public.flex_visits enable row level security;
alter table public.flex_likes enable row level security;
alter table public.flex_daily enable row level security;
alter table public.flex_signs enable row level security;
revoke all on public.flex_visits, public.flex_likes, public.flex_daily, public.flex_signs from anon, authenticated;

-- ===================================================================
-- Helpers
-- ===================================================================

create or replace function public.flex_today()
returns date
language sql
stable
as $$ select (now() at time zone 'Asia/Seoul')::date; $$;

-- Active banner/bubble of a user as {banner, bubble} (nulls when expired).
create or replace function public.flex_signs_of(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'banner', case when s.banner_until > now() then s.banner end,
    'banner_until', case when s.banner_until > now() then (extract(epoch from s.banner_until) * 1000)::bigint end,
    'bubble', case when s.bubble_until > now() then s.bubble end,
    'bubble_until', case when s.bubble_until > now() then (extract(epoch from s.bubble_until) * 1000)::bigint end)
  from (select 1) one left join flex_signs s on s.user_id = p_user;
$$;

-- Which street lot (0-15) hides today's treasure.
create or replace function public.flex_treasure_lot()
returns int
language sql
stable
as $$ select abs(hashtext('flex-treasure-' || flex_today()::text)) % 16; $$;

-- ===================================================================
-- Visiting, likes
-- ===================================================================

-- Someone's town, avatar, holdings and social counts. Counts a visit when a
-- logged-in player looks at someone else.
create or replace function public.flex_visit(p_nickname text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_host uuid;
begin
  select a.user_id into v_host from profiles p join flex_accounts a on a.user_id = p.id where p.nickname = p_nickname;
  if v_host is null then return null; end if;
  if uid is not null and uid <> v_host and exists (select 1 from flex_accounts where user_id = uid) then
    insert into flex_visits (day, visitor, host) values (flex_today(), uid, v_host) on conflict do nothing;
  end if;
  return (
    select jsonb_build_object(
      'nickname', p_nickname,
      'place', a.place,
      'avatar', a.avatar,
      'cash', a.cash,
      'items', coalesce((select jsonb_agg(item_id) from flex_items where user_id = v_host), '[]'::jsonb),
      'holdings', coalesce((select jsonb_object_agg(market, qty) from flex_holdings where user_id = v_host), '{}'::jsonb),
      'worth', (select floor(worth) from flex_rankings where user_id = v_host),
      'likes', (select count(*) from flex_likes where host = a.user_id),
      'liked', uid is not null and exists (select 1 from flex_likes where liker = uid and host = a.user_id),
      'visits_today', (select count(*) from flex_visits where host = a.user_id and day = flex_today()),
      'visits_total', (select count(*) from flex_visits where host = a.user_id),
      'me', uid = v_host
    ) || flex_signs_of(v_host)
    from flex_accounts a where a.user_id = v_host
  );
end;
$$;

-- Toggle a like. Returns {likes, liked}.
create or replace function public.flex_like(p_nickname text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a flex_accounts := flex_me();
  v_host uuid;
  liked boolean;
begin
  select id into v_host from profiles where nickname = p_nickname;
  if v_host is null or not exists (select 1 from flex_accounts where user_id = v_host) then raise exception '없는 사람이에요.'; end if;
  if v_host = a.user_id then raise exception '내 공간에는 좋아요를 누를 수 없어요.'; end if;
  delete from flex_likes where liker = a.user_id and flex_likes.host = v_host;
  liked := not found;
  if liked then insert into flex_likes (liker, host) values (a.user_id, v_host); end if;
  return jsonb_build_object('likes', (select count(*) from flex_likes where flex_likes.host = v_host), 'liked', liked);
end;
$$;

-- ===================================================================
-- Daily treasure and missions
-- ===================================================================

-- My daily status, signs and social counts.
create or replace function public.flex_daily_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a flex_accounts := flex_me();
  d flex_daily;
  today_start timestamptz := (flex_today()::timestamp at time zone 'Asia/Seoul');
begin
  select * into d from flex_daily where user_id = a.user_id and day = flex_today();
  return jsonb_build_object(
    'treasure_lot', flex_treasure_lot(),
    'treasure', coalesce(d.treasure, false),
    'missions_claimed', coalesce(d.missions, false),
    'visits', (select count(*) from flex_visits where visitor = a.user_id and day = flex_today()),
    'likes', (select count(*) from flex_likes where liker = a.user_id and at >= today_start),
    'trades', (select count(*) from flex_log where user_id = a.user_id and at >= today_start
               and (text like '% 매수%' or text like '% 매도%' or text like '% 구매 %')),
    'my_likes', (select count(*) from flex_likes where host = a.user_id),
    'my_visits_today', (select count(*) from flex_visits where host = a.user_id and day = flex_today()),
    'my_visits_total', (select count(*) from flex_visits where host = a.user_id)
  ) || flex_signs_of(a.user_id);
end;
$$;

-- Today's treasure box on the street: 3,000만원, once a day.
create or replace function public.flex_claim_treasure()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a flex_accounts := flex_me();
begin
  insert into flex_daily (user_id, day) values (a.user_id, flex_today()) on conflict do nothing;
  update flex_daily set treasure = true where user_id = a.user_id and day = flex_today() and not treasure;
  if not found then raise exception '오늘의 보물상자는 이미 열었어요. 내일 또 와요!'; end if;
  update flex_accounts set cash = cash + 30000000 where user_id = a.user_id;
  insert into flex_log (user_id, text) values (a.user_id, '🎁 보물상자 +3,000만원');
  return flex_state();
end;
$$;

-- All three missions (visit 3 lots, like once, trade once): 5,000만원, once a day.
create or replace function public.flex_claim_missions()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a flex_accounts := flex_me();
  s jsonb := flex_daily_status();
begin
  if (s ->> 'visits')::int < 3 or (s ->> 'likes')::int < 1 or (s ->> 'trades')::int < 1 then
    raise exception '아직 끝나지 않은 미션이 있어요.';
  end if;
  insert into flex_daily (user_id, day) values (a.user_id, flex_today()) on conflict do nothing;
  update flex_daily set missions = true where user_id = a.user_id and day = flex_today() and not missions;
  if not found then raise exception '오늘의 미션 보상은 이미 받았어요.'; end if;
  update flex_accounts set cash = cash + 50000000 where user_id = a.user_id;
  insert into flex_log (user_id, text) values (a.user_id, '✅ 일일 미션 완료 +5,000만원');
  return flex_state();
end;
$$;

-- ===================================================================
-- Banner (현수막, 1억 / 7일) and speech bubble (말풍선, 3,000만 / 3일)
-- Text only: no links, phone numbers or account numbers (no cash deals).
-- ===================================================================

create or replace function public.flex_set_sign(p_kind text, p_text text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a flex_accounts := flex_me();
  t text := btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'));
  price numeric;
  days int;
  maxlen int;
begin
  if p_kind = 'banner' then price := 100000000; days := 7; maxlen := 20;
  elsif p_kind = 'bubble' then price := 30000000; days := 3; maxlen := 30;
  else raise exception '잘못된 요청이에요.'; end if;
  if char_length(t) < 1 or char_length(t) > maxlen then raise exception '문구는 1~%자로 적어 주세요.', maxlen; end if;
  if t ~* '(https?://|www\.|\.com|\.kr|\.net|open\.kakao|카톡|오픈채팅|텔레|t\.me)' then
    raise exception '링크나 연락처는 적을 수 없어요.';
  end if;
  if t ~ '[0-9][0-9 -]{6,}[0-9]' then raise exception '전화번호나 계좌번호처럼 보이는 숫자는 적을 수 없어요.'; end if;
  if a.cash < price then raise exception '현금이 부족해요.'; end if;

  update flex_accounts set cash = cash - price where user_id = a.user_id;
  insert into flex_signs (user_id) values (a.user_id) on conflict do nothing;
  if p_kind = 'banner' then
    update flex_signs set banner = t, banner_until = now() + make_interval(days => days) where user_id = a.user_id;
  else
    update flex_signs set bubble = t, bubble_until = now() + make_interval(days => days) where user_id = a.user_id;
  end if;
  insert into flex_log (user_id, text)
  values (a.user_id, case when p_kind = 'banner' then '현수막 걸기 -1억원' else '말풍선 달기 -3,000만원' end);
  return flex_state();
end;
$$;

-- ===================================================================
-- Street: lots now carry likes and banners; the feed adds today's hot spot.
-- ===================================================================

create or replace function public.flex_street()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform flex_ranking();
  return jsonb_build_object(
    'treasure_lot', flex_treasure_lot(),
    'lots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rank', t.rk, 'nickname', t.nickname, 'worth', floor(t.worth),
        'likes', (select count(*) from flex_likes where host = t.user_id),
        'banner', flex_signs_of(t.user_id) ->> 'banner',
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
    'hot', (select jsonb_build_object('nickname', p.nickname, 'visits', count(*))
            from flex_visits v join profiles p on p.id = v.host
            where v.day = flex_today() group by p.nickname order by count(*) desc limit 1),
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

-- ===================================================================
-- Permissions
-- ===================================================================

revoke execute on function public.flex_signs_of(uuid) from public, anon, authenticated;
revoke execute on function
  public.flex_like(text), public.flex_daily_status(), public.flex_claim_treasure(),
  public.flex_claim_missions(), public.flex_set_sign(text, text)
from public, anon;
grant execute on function
  public.flex_like(text), public.flex_daily_status(), public.flex_claim_treasure(),
  public.flex_claim_missions(), public.flex_set_sign(text, text)
to authenticated;
grant execute on function public.flex_visit(text), public.flex_street() to anon, authenticated;
