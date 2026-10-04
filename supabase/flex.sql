-- 플렉스시티 (flex/) server tables and functions, in the same Supabase project as 입고수.
-- Run this whole file once in Supabase Dashboard → SQL Editor (after schema.sql).
-- Safe to re-run.
--
-- Same design as 입고수: the browser can't touch these tables directly (RLS on, no
-- policies). Every change goes through the security-definer functions below, which
-- check the request and price coin trades with Upbit on the server.
-- Accounts share 입고수's sign-up (auth.users + profiles); a 플렉스시티 account is
-- created on first use with 10억.

create extension if not exists http with schema extensions;

-- ===================================================================
-- Tables
-- ===================================================================

create table if not exists public.flex_accounts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  cash numeric not null default 1000000000 check (cash >= 0),
  place jsonb not null default '{}'::jsonb,     -- { item_id: "i,j" } on the 7x7 town
  avatar jsonb not null default '{}'::jsonb,    -- dress-up choices
  created_at timestamptz not null default now()
);

create table if not exists public.flex_holdings (
  user_id uuid not null references public.flex_accounts (user_id) on delete cascade,
  market text not null,
  qty numeric not null check (qty > 0),
  cost numeric not null check (cost >= 0),
  primary key (user_id, market)
);

create table if not exists public.flex_items (
  user_id uuid not null references public.flex_accounts (user_id) on delete cascade,
  item_id text not null,
  bought_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table if not exists public.flex_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.flex_accounts (user_id) on delete cascade,
  at timestamptz not null default now(),
  text text not null
);
create index if not exists flex_log_user_at on public.flex_log (user_id, at desc);

alter table public.flex_accounts enable row level security;
alter table public.flex_holdings enable row level security;
alter table public.flex_items enable row level security;
alter table public.flex_log enable row level security;
revoke all on public.flex_accounts, public.flex_holdings, public.flex_items, public.flex_log
from anon, authenticated;

-- ===================================================================
-- Helpers
-- ===================================================================

-- Shop catalog. Must match ITEMS in flex/index.html.
create or replace function public.flex_item(p_id text, out name text, out price numeric)
language sql
immutable
as $$
  select v.name, v.price from (values
    ('car-mini', '귀요미 경차', 15000000), ('car-sedan', '패밀리 세단', 45000000),
    ('car-suv', '대형 SUV', 95000000), ('car-sports', '로드스터 스포츠카', 280000000),
    ('car-super', 'V12 슈퍼카', 650000000), ('car-hyper', '한정판 하이퍼카', 3500000000),
    ('watch-digital', '전자시계', 300000), ('watch-classic', '가죽 클래식', 6000000),
    ('watch-diver', '다이버 워치', 18000000), ('watch-gold', '골드 드레스워치', 80000000),
    ('watch-diamond', '다이아 베젤', 500000000), ('watch-grand', '그랜드 컴플리케이션', 2500000000),
    ('house-oneroom', '역세권 원룸', 200000000), ('house-villa', '신축 빌라', 500000000),
    ('house-apt', '브랜드 아파트', 1500000000), ('house-penthouse', '한강뷰 펜트하우스', 8000000000),
    ('house-mansion', '정원 딸린 대저택', 15000000000), ('house-castle', '프라이빗 섬의 성', 50000000000),
    ('sp-yacht', '럭셔리 요트', 3000000000), ('sp-heli', '개인 헬기', 6000000000),
    ('sp-jet', '프라이빗 제트', 40000000000)
  ) as v(id, name, price)
  where v.id = p_id;
$$;

-- Live price of one Upbit KRW market (any listed coin).
create or replace function public.flex_coin_price(p_market text)
returns numeric
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r extensions.http_response;
  price numeric;
begin
  if p_market !~ '^KRW-[A-Z0-9]{1,15}$' then raise exception '지원하지 않는 코인이에요.'; end if;
  select * into r from extensions.http_get('https://api.upbit.com/v1/ticker?markets=' || p_market);
  if r.status = 404 or r.status = 400 then raise exception '업비트에 없는 코인이에요.'; end if;
  if r.status <> 200 then
    raise exception '코인 시세를 가져오지 못했어요. 잠시 후 다시 시도해 주세요. (HTTP %)', r.status;
  end if;
  price := (r.content::jsonb -> 0 ->> 'trade_price')::numeric;
  if price is null or price <= 0 then raise exception '코인 시세를 가져오지 못했어요.'; end if;
  return price;
end;
$$;

-- Short Korean amount for log lines: 12.3억 / 4,500만 / 3,000.
create or replace function public.flex_won_short(n numeric)
returns text
language sql
immutable
as $$
  select case
    when n >= 100000000 then trim(trailing '.' from trim(trailing '0' from to_char(round(n / 100000000, 1), 'FM999999990.0'))) || '억'
    when n >= 10000 then to_char(round(n / 10000), 'FM999,999') || '만'
    else to_char(floor(n), 'FM999,999') end;
$$;

-- The caller's 플렉스시티 account, created on first use. Locks the row.
create or replace function public.flex_me()
returns public.flex_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  a flex_accounts;
begin
  if uid is null then raise exception '로그인이 필요해요.'; end if;
  insert into flex_accounts (user_id) values (uid) on conflict (user_id) do nothing;
  select * into a from flex_accounts where user_id = uid for update;
  return a;
end;
$$;

-- ===================================================================
-- API (called from the browser with supabase.rpc)
-- ===================================================================

-- Whole game state as JSON, in the shape the page uses.
create or replace function public.flex_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a flex_accounts := flex_me();
begin
  return jsonb_build_object(
    'cash', a.cash,
    'start', 1000000000,
    'place', a.place,
    'avatar', a.avatar,
    'created', (extract(epoch from a.created_at) * 1000)::bigint,
    'nickname', (select nickname from profiles where id = a.user_id),
    'coins', coalesce((select jsonb_object_agg(market, jsonb_build_object('qty', qty, 'cost', cost))
                       from flex_holdings where user_id = a.user_id), '{}'::jsonb),
    'items', coalesce((select jsonb_agg(item_id order by bought_at) from flex_items where user_id = a.user_id), '[]'::jsonb),
    'log', coalesce((select jsonb_agg(jsonb_build_object('t', (extract(epoch from at) * 1000)::bigint, 'text', text) order by at desc)
                     from (select at, text from flex_log where user_id = a.user_id order by at desc limit 40) l), '[]'::jsonb)
  );
end;
$$;

-- Spend p_krw (fee included, 0.05%) on a coin at the live Upbit price.
create or replace function public.flex_buy_coin(p_market text, p_krw numeric, p_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a flex_accounts := flex_me();
  price numeric;
  qty numeric;
begin
  if p_krw is null or p_krw < 5000 then raise exception '최소 주문 금액은 5,000원이에요.'; end if;
  p_krw := floor(p_krw);
  if p_krw > a.cash then raise exception '현금이 부족해요.'; end if;
  price := flex_coin_price(p_market);
  qty := p_krw * (1 - 0.0005) / price;

  update flex_accounts set cash = cash - p_krw where user_id = a.user_id;
  insert into flex_holdings (user_id, market, qty, cost) values (a.user_id, p_market, qty, p_krw)
  on conflict (user_id, market) do update
    set qty = flex_holdings.qty + excluded.qty, cost = flex_holdings.cost + excluded.cost;
  insert into flex_log (user_id, text)
  values (a.user_id, coalesce(left(p_name, 30), replace(p_market, 'KRW-', '')) || ' 매수 -' || flex_won_short(p_krw) || '원');
  return flex_state();
end;
$$;

-- Sell p_qty of a coin at the live Upbit price (fee 0.05%).
create or replace function public.flex_sell_coin(p_market text, p_qty numeric, p_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a flex_accounts := flex_me();
  h flex_holdings;
  price numeric;
  net numeric;
  pnl numeric;
  cost_part numeric;
begin
  select * into h from flex_holdings where user_id = a.user_id and market = p_market for update;
  if not found then raise exception '보유하지 않은 코인이에요.'; end if;
  if p_qty is null or p_qty <= 0 then raise exception '팔 수량을 입력해 주세요.'; end if;
  p_qty := least(p_qty, h.qty);
  price := flex_coin_price(p_market);
  if p_qty * price < 5000 then raise exception '최소 주문 금액은 5,000원이에요.'; end if;
  net := floor(p_qty * price * (1 - 0.0005));
  cost_part := h.cost * (p_qty / h.qty);
  pnl := net - cost_part;

  if h.qty - p_qty < 1e-10 then
    delete from flex_holdings where user_id = a.user_id and market = p_market;
  else
    update flex_holdings set qty = qty - p_qty, cost = cost - cost_part where user_id = a.user_id and market = p_market;
  end if;
  update flex_accounts set cash = cash + net where user_id = a.user_id;
  insert into flex_log (user_id, text)
  values (a.user_id, coalesce(left(p_name, 30), replace(p_market, 'KRW-', '')) || ' 매도 +' || flex_won_short(net) || '원 ('
          || case when pnl >= 0 then '수익 ' else '손실 ' end || flex_won_short(abs(pnl)) || '원)');
  return flex_state();
end;
$$;

create or replace function public.flex_buy_item(p_item text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a flex_accounts := flex_me();
  it record;
begin
  select * into it from flex_item(p_item);
  if it.price is null then raise exception '없는 물건이에요.'; end if;
  if exists (select 1 from flex_items where user_id = a.user_id and item_id = p_item) then
    raise exception '이미 가지고 있어요.';
  end if;
  if a.cash < it.price then raise exception '현금이 부족해요.'; end if;
  update flex_accounts set cash = cash - it.price where user_id = a.user_id;
  insert into flex_items (user_id, item_id) values (a.user_id, p_item);
  insert into flex_log (user_id, text) values (a.user_id, it.name || ' 구매 -' || flex_won_short(it.price) || '원');
  return flex_state();
end;
$$;

-- Resell for 90% of the price.
create or replace function public.flex_sell_item(p_item text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a flex_accounts := flex_me();
  it record;
  back numeric;
begin
  select * into it from flex_item(p_item);
  delete from flex_items where user_id = a.user_id and item_id = p_item;
  if not found or it.price is null then raise exception '가지고 있지 않은 물건이에요.'; end if;
  back := floor(it.price * 0.9);
  update flex_accounts set cash = cash + back, place = place - p_item where user_id = a.user_id;
  insert into flex_log (user_id, text) values (a.user_id, it.name || ' 되팔기 +' || flex_won_short(back) || '원');
  return flex_state();
end;
$$;

-- Town layout and avatar (cosmetic only). Keeps only owned items on valid tiles.
create or replace function public.flex_save_look(p_place jsonb, p_avatar jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a flex_accounts := flex_me();
  clean jsonb := '{}'::jsonb;
  k text;
  v text;
begin
  if p_place is not null and jsonb_typeof(p_place) = 'object' then
    for k, v in select key, value #>> '{}' from jsonb_each(p_place) loop
      if v ~ '^[0-6],[0-6]$' and exists (select 1 from flex_items where user_id = a.user_id and item_id = k) then
        clean := clean || jsonb_build_object(k, v);
      end if;
    end loop;
    update flex_accounts set place = clean where user_id = a.user_id;
  end if;
  if p_avatar is not null and jsonb_typeof(p_avatar) = 'object' and length(p_avatar::text) <= 1000 then
    update flex_accounts set avatar = p_avatar where user_id = a.user_id;
  end if;
end;
$$;

-- Start over with 10억.
create or replace function public.flex_reset()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a flex_accounts := flex_me();
begin
  delete from flex_holdings where user_id = a.user_id;
  delete from flex_items where user_id = a.user_id;
  delete from flex_log where user_id = a.user_id;
  update flex_accounts set cash = 1000000000, place = '{}'::jsonb, created_at = now() where user_id = a.user_id;
  insert into flex_log (user_id, text) values (a.user_id, '10억으로 새로 시작');
  return flex_state();
end;
$$;

-- ===================================================================
-- Function permissions
-- ===================================================================

revoke execute on function
  public.flex_coin_price(text), public.flex_me(), public.flex_state(),
  public.flex_buy_coin(text, numeric, text), public.flex_sell_coin(text, numeric, text),
  public.flex_buy_item(text), public.flex_sell_item(text), public.flex_save_look(jsonb, jsonb),
  public.flex_reset()
from public, anon;
grant execute on function
  public.flex_state(), public.flex_buy_coin(text, numeric, text), public.flex_sell_coin(text, numeric, text),
  public.flex_buy_item(text), public.flex_sell_item(text), public.flex_save_look(jsonb, jsonb),
  public.flex_reset()
to authenticated;
revoke execute on function public.flex_coin_price(text), public.flex_me() from authenticated;
