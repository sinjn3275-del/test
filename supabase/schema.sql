-- 입고수 database setup for Supabase.
-- Run the whole file once in Supabase Dashboard → SQL Editor.
--
-- Design: the browser may only READ its own data. Every change to cash, holdings,
-- orders and trades goes through the security-definer functions below, which
-- validate the request and price fills on the server. That keeps returns tamper-proof.

create extension if not exists http with schema extensions;

-- ===================================================================
-- Tables
-- ===================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null unique check (char_length(nickname) between 2 and 12),
  created_at timestamptz not null default now()
);

create table if not exists public.accounts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  cash numeric not null default 100000000 check (cash >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.holdings (
  user_id uuid not null references public.profiles (id) on delete cascade,
  market text not null,               -- 'KRW-BTC' (coin) or 'KRX:005930' (stock)
  name text,
  qty numeric not null check (qty > 0),
  cost numeric not null,              -- total cost basis including fees
  primary key (user_id, market)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  market text not null,
  name text not null,
  side text not null check (side in ('buy', 'sell')),
  type text not null check (type in ('close', 'open', 'limit')),
  amount numeric,                     -- close/open buys: KRW to spend
  qty numeric,                        -- sells and limit buys: shares
  limit_price numeric,
  reserved numeric not null default 0, -- cash held for pending buys
  eligible date not null,             -- first trading date whose prices may fill it
  status text not null default 'pending' check (status in ('pending', 'filled', 'cancelled', 'expired', 'void')),
  placed_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists orders_pending_idx on public.orders (status, eligible);
create index if not exists orders_user_idx on public.orders (user_id, placed_at desc);

create table if not exists public.trades (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  order_id uuid references public.orders (id),
  market text not null,
  name text,
  side text not null check (side in ('buy', 'sell', 'void')),
  order_type text not null,           -- 'market' (coin) | 'close' | 'open' | 'limit'
  price numeric not null,
  qty numeric not null,
  amount numeric not null,
  fee numeric not null default 0,     -- fees plus taxes
  pnl numeric,                        -- realized profit on sells
  bas_dt date,                        -- trading date of the stock price used
  reason text,                        -- why a 'void' row happened
  created_at timestamptz not null default now()
);
create index if not exists trades_user_idx on public.trades (user_id, created_at desc);

-- Daily KOSPI/KOSDAQ prices, upserted by the GitHub Action.
create table if not exists public.stock_prices (
  bas_dt date not null,
  code text not null,
  name text not null,
  market text not null,
  open numeric not null,
  high numeric not null,
  low numeric not null,
  close numeric not null,
  change_pct numeric,
  trade_value numeric,
  primary key (bas_dt, code)
);
create index if not exists stock_prices_code_idx on public.stock_prices (code, bas_dt desc);

-- Total asset value over time (written by refresh_rankings and at signup).
create table if not exists public.snapshots (
  user_id uuid not null references public.profiles (id) on delete cascade,
  t timestamptz not null default now(),
  value numeric not null,
  primary key (user_id, t)
);

-- Public leaderboard, recomputed by refresh_rankings.
create table if not exists public.rankings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  nickname text not null,
  total numeric not null,
  ret numeric not null,
  mdd numeric not null,
  win_rate numeric,
  trades int not null,
  updated_at timestamptz not null default now()
);

-- ===================================================================
-- Row level security: read-only access for clients
-- ===================================================================

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.holdings enable row level security;
alter table public.orders enable row level security;
alter table public.trades enable row level security;
alter table public.stock_prices enable row level security;
alter table public.snapshots enable row level security;
alter table public.rankings enable row level security;

drop policy if exists "profiles are public" on public.profiles;
create policy "profiles are public" on public.profiles for select using (true);
drop policy if exists "rankings are public" on public.rankings;
create policy "rankings are public" on public.rankings for select using (true);

drop policy if exists "own account" on public.accounts;
create policy "own account" on public.accounts for select to authenticated using (user_id = auth.uid());
drop policy if exists "own holdings" on public.holdings;
create policy "own holdings" on public.holdings for select to authenticated using (user_id = auth.uid());
drop policy if exists "own orders" on public.orders;
create policy "own orders" on public.orders for select to authenticated using (user_id = auth.uid());
drop policy if exists "own trades" on public.trades;
create policy "own trades" on public.trades for select to authenticated using (user_id = auth.uid());
drop policy if exists "own snapshots" on public.snapshots;
create policy "own snapshots" on public.snapshots for select to authenticated using (user_id = auth.uid());

-- No insert/update/delete policies exist, and table write privileges are revoked as well.
revoke insert, update, delete, truncate on
  public.profiles, public.accounts, public.holdings, public.orders, public.trades,
  public.stock_prices, public.snapshots, public.rankings
from anon, authenticated;

-- ===================================================================
-- Signup: profile, 100M KRW account and a starting snapshot
-- ===================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  nick text := trim(coalesce(new.raw_user_meta_data ->> 'nickname', ''));
begin
  if char_length(nick) < 2 or char_length(nick) > 12 then
    nick := 'user_' || left(new.id::text, 8);
  end if;
  insert into profiles (id, nickname) values (new.id, nick);
  insert into accounts (user_id) values (new.id);
  insert into snapshots (user_id, value) values (new.id, 100000000);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.nickname_available(p_nickname text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select char_length(trim(p_nickname)) between 2 and 12
     and not exists (select 1 from profiles where nickname = trim(p_nickname));
$$;

-- ===================================================================
-- Helpers
-- ===================================================================

create or replace function public.coin_markets()
returns text[]
language sql
immutable
as $$
  select array['KRW-BTC', 'KRW-ETH', 'KRW-XRP', 'KRW-SOL', 'KRW-DOGE', 'KRW-ADA', 'KRW-AVAX', 'KRW-LINK', 'KRW-DOT', 'KRW-TRX'];
$$;

create or replace function public.coin_name(p_market text)
returns text
language sql
immutable
as $$
  select case p_market
    when 'KRW-BTC' then '비트코인' when 'KRW-ETH' then '이더리움' when 'KRW-XRP' then '리플'
    when 'KRW-SOL' then '솔라나' when 'KRW-DOGE' then '도지코인' when 'KRW-ADA' then '에이다'
    when 'KRW-AVAX' then '아발란체' when 'KRW-LINK' then '체인링크' when 'KRW-DOT' then '폴카닷'
    when 'KRW-TRX' then '트론' end;
$$;

-- Live coin prices from the Upbit public API, as {"KRW-BTC": 113000000, ...}.
create or replace function public.coin_prices()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r extensions.http_response;
  res jsonb := '{}'::jsonb;
  e jsonb;
begin
  select * into r from extensions.http_get(
    'https://api.upbit.com/v1/ticker?markets=' || array_to_string(public.coin_markets(), ','));
  if r.status <> 200 then
    raise exception '코인 시세를 가져오지 못했어요. 잠시 후 다시 시도해 주세요. (HTTP %)', r.status;
  end if;
  for e in select * from jsonb_array_elements(r.content::jsonb) loop
    res := res || jsonb_build_object(e ->> 'market', (e ->> 'trade_price')::numeric);
  end loop;
  return res;
end;
$$;

create or replace function public.next_weekday(d date)
returns date
language sql
immutable
as $$
  select d + case extract(isodow from d)::int when 5 then 3 when 6 then 2 else 1 end;
$$;

-- First trading date whose prices may fill a new stock order:
--   close: before 15:30 KST → today, otherwise tomorrow
--   open:  before 09:00 KST → today, otherwise tomorrow
--   limit: always from tomorrow (part of today's range may already be known)
-- and never a date whose prices are already stored.
create or replace function public.order_eligible_date(p_type text)
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  k timestamp := now() at time zone 'Asia/Seoul';
  d date := k::date;
  mins int := extract(hour from k)::int * 60 + extract(minute from k)::int;
  e date;
  latest date;
begin
  if p_type = 'limit' then
    e := d + 1;
  elsif p_type = 'open' then
    e := case when mins < 9 * 60 then d else d + 1 end;
  else
    e := case when mins < 15 * 60 + 30 then d else d + 1 end;
  end if;
  select max(bas_dt) into latest from stock_prices;
  if latest is not null then
    e := greatest(e, public.next_weekday(latest));
  end if;
  return e;
end;
$$;

-- ===================================================================
-- Coin orders: filled immediately at the server-fetched Upbit price
-- ===================================================================

create or replace function public.buy_coin(p_market text, p_krw numeric)
returns public.trades
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  price numeric;
  fee numeric;
  t trades;
begin
  if uid is null then raise exception '로그인이 필요해요.'; end if;
  if not (p_market = any (coin_markets())) then raise exception '지원하지 않는 코인이에요.'; end if;
  if p_krw is null or p_krw < 5000 then raise exception '최소 주문 금액은 5,000원이에요.'; end if;
  p_krw := round(p_krw);

  price := (coin_prices() ->> p_market)::numeric;
  if price is null or price <= 0 then raise exception '코인 시세를 가져오지 못했어요.'; end if;
  fee := p_krw * 0.0005;

  update accounts set cash = cash - p_krw - fee where user_id = uid and cash >= p_krw + fee;
  if not found then raise exception '주문 가능 현금이 부족해요.'; end if;

  insert into holdings (user_id, market, name, qty, cost)
  values (uid, p_market, coin_name(p_market), p_krw / price, p_krw + fee)
  on conflict (user_id, market) do update
    set qty = holdings.qty + excluded.qty, cost = holdings.cost + excluded.cost;

  insert into trades (user_id, market, name, side, order_type, price, qty, amount, fee)
  values (uid, p_market, coin_name(p_market), 'buy', 'market', price, p_krw / price, p_krw, fee)
  returning * into t;
  return t;
end;
$$;

create or replace function public.sell_coin(p_market text, p_qty numeric)
returns public.trades
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  h holdings;
  price numeric;
  amount numeric;
  fee numeric;
  cost_part numeric;
  t trades;
begin
  if uid is null then raise exception '로그인이 필요해요.'; end if;
  if p_qty is null or p_qty <= 0 then raise exception '매도 수량을 입력해 주세요.'; end if;

  select * into h from holdings where user_id = uid and market = p_market for update;
  if not found then raise exception '보유한 수량이 없어요.'; end if;
  if p_qty > h.qty * 1.000001 then raise exception '보유 수량보다 많이 팔 수 없어요.'; end if;
  p_qty := least(p_qty, h.qty);
  -- Treat a sell within rounding distance of the whole position as selling all of it.
  if p_qty >= h.qty * 0.999999 then p_qty := h.qty; end if;

  price := (coin_prices() ->> p_market)::numeric;
  if price is null or price <= 0 then raise exception '코인 시세를 가져오지 못했어요.'; end if;
  amount := p_qty * price;
  if amount < 5000 and p_qty < h.qty then raise exception '최소 주문 금액은 5,000원이에요.'; end if;
  fee := amount * 0.0005;
  cost_part := h.cost * (p_qty / h.qty);

  if p_qty >= h.qty then
    delete from holdings where user_id = uid and market = p_market;
  else
    update holdings set qty = qty - p_qty, cost = cost - cost_part where user_id = uid and market = p_market;
  end if;
  update accounts set cash = cash + amount - fee where user_id = uid;

  insert into trades (user_id, market, name, side, order_type, price, qty, amount, fee, pnl)
  values (uid, p_market, h.name, 'sell', 'market', price, p_qty, amount, fee, amount - fee - cost_part)
  returning * into t;
  return t;
end;
$$;

-- ===================================================================
-- Stock orders: reserved now, filled later from daily prices
-- ===================================================================

create or replace function public.place_stock_order(
  p_market text, p_side text, p_type text, p_value numeric, p_limit numeric default null)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_code text := substr(p_market, 5);
  v_last stock_prices;
  held numeric;
  pending_sell numeric;
  q numeric;
  lim numeric;
  reserved numeric;
  o orders;
begin
  if uid is null then raise exception '로그인이 필요해요.'; end if;
  if p_market !~ '^KRX:[0-9A-Z]{6}$' then raise exception '종목 코드가 올바르지 않아요.'; end if;
  if p_side not in ('buy', 'sell') or p_type not in ('close', 'open', 'limit') then
    raise exception '주문 방식이 올바르지 않아요.';
  end if;

  select * into v_last from stock_prices sp where sp.code = v_code order by sp.bas_dt desc limit 1;
  if not found then raise exception '종가 데이터가 없는 종목이에요.'; end if;

  select coalesce(sum(h.qty), 0) into held from holdings h where h.user_id = uid and h.market = p_market;
  select coalesce(sum(od.qty), 0) into pending_sell from orders od
    where od.user_id = uid and od.market = p_market and od.side = 'sell' and od.status = 'pending';

  if p_type = 'limit' then
    lim := round(p_limit);
    if lim is null or lim <= 0 then raise exception '지정가를 입력해 주세요.'; end if;
    if abs(lim / v_last.close - 1) > 0.3 then
      raise exception '지정가는 최근 종가의 ±30%% (%원 ~ %원) 안에서 입력해 주세요.',
        to_char(ceil(v_last.close * 0.7), 'FM999,999,999'), to_char(floor(v_last.close * 1.3), 'FM999,999,999');
    end if;
    q := floor(p_value);
    if q is null or q < 1 then raise exception '수량을 1주 이상 입력해 주세요.'; end if;
    if p_side = 'buy' then
      reserved := q * lim * 1.00015;
    elsif q > held - pending_sell then
      raise exception '매도 가능 수량은 %주예요.', held - pending_sell;
    end if;
  elsif p_side = 'buy' then
    if p_value is null or p_value < v_last.close then
      raise exception '최소 1주 이상 살 수 있는 금액을 입력해 주세요. (최근 종가 %원)', to_char(v_last.close, 'FM999,999,999');
    end if;
    p_value := round(p_value);
    reserved := p_value * 1.00015;
  else
    q := floor(p_value);
    if q is null or q < 1 then raise exception '매도 수량을 1주 이상 입력해 주세요.'; end if;
    if q > held - pending_sell then raise exception '매도 가능 수량은 %주예요.', held - pending_sell; end if;
  end if;

  if p_side = 'buy' then
    update accounts set cash = cash - reserved where user_id = uid and cash >= reserved;
    if not found then raise exception '주문 가능 현금이 부족해요.'; end if;
  end if;

  insert into orders (user_id, market, name, side, type, amount, qty, limit_price, reserved, eligible)
  values (
    uid, p_market, v_last.name, p_side, p_type,
    case when p_side = 'buy' and p_type <> 'limit' then p_value end,
    q, lim, coalesce(reserved, 0), order_eligible_date(p_type))
  returning * into o;
  return o;
end;
$$;

create or replace function public.cancel_order(p_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  o orders;
begin
  update orders set status = 'cancelled', closed_at = now()
  where id = p_id and user_id = auth.uid() and status = 'pending'
  returning * into o;
  if not found then raise exception '취소할 수 있는 주문이 없어요.'; end if;
  if o.side = 'buy' then
    update accounts set cash = cash + o.reserved where user_id = o.user_id;
  end if;
  return o;
end;
$$;

-- Fills, expires or voids pending stock orders using stored daily prices.
-- Called by the GitHub Action after new prices are loaded.
create or replace function public.settle_stock_orders()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  o orders;
  p stock_prices;
  days int;
  fill_price numeric;
  fill_dt date;
  expired boolean;
  settled int := 0;
  q numeric;
  amount numeric;
  fee numeric;
  tax numeric;
  h holdings;
  cost_part numeric;
begin
  for o in select * from orders where status = 'pending' order by placed_at for update loop
    fill_price := null; fill_dt := null; expired := false; days := 0;

    for p in
      select * from stock_prices sp
      where sp.code = substr(o.market, 5) and sp.bas_dt >= o.eligible
      order by sp.bas_dt
    loop
      if o.type = 'close' then
        fill_price := p.close; fill_dt := p.bas_dt; exit;
      elsif o.type = 'open' then
        fill_price := p.open; fill_dt := p.bas_dt; exit;
      elsif o.side = 'buy' and p.low <= o.limit_price then
        -- A gap below the limit fills at the better opening price.
        fill_price := least(o.limit_price, p.open); fill_dt := p.bas_dt; exit;
      elsif o.side = 'sell' and p.high >= o.limit_price then
        fill_price := greatest(o.limit_price, p.open); fill_dt := p.bas_dt; exit;
      end if;
      days := days + 1;
      if days >= 5 then
        expired := true; fill_dt := p.bas_dt; exit;
      end if;
    end loop;

    continue when fill_dt is null;
    settled := settled + 1;

    if expired then
      if o.side = 'buy' then
        update accounts set cash = cash + o.reserved where user_id = o.user_id;
      end if;
      update orders set status = 'expired', closed_at = now() where id = o.id;
      insert into trades (user_id, order_id, market, name, side, order_type, price, qty, amount, fee, bas_dt, reason)
      values (o.user_id, o.id, o.market, o.name, 'void', o.type, o.limit_price, 0, 0, 0, fill_dt, '기간 만료');
      continue;
    end if;

    if o.side = 'buy' then
      q := case when o.type = 'limit' then o.qty else floor(o.amount / fill_price) end;
      if q < 1 then
        update accounts set cash = cash + o.reserved where user_id = o.user_id;
        update orders set status = 'void', closed_at = now() where id = o.id;
        insert into trades (user_id, order_id, market, name, side, order_type, price, qty, amount, fee, bas_dt, reason)
        values (o.user_id, o.id, o.market, o.name, 'void', o.type, fill_price, 0, 0, 0, fill_dt, '미체결(환불)');
        continue;
      end if;
      amount := q * fill_price;
      fee := amount * 0.00015;
      update accounts set cash = cash + o.reserved - amount - fee where user_id = o.user_id;
      insert into holdings (user_id, market, name, qty, cost)
      values (o.user_id, o.market, o.name, q, amount + fee)
      on conflict (user_id, market) do update
        set qty = holdings.qty + excluded.qty, cost = holdings.cost + excluded.cost, name = excluded.name;
      update orders set status = 'filled', closed_at = now() where id = o.id;
      insert into trades (user_id, order_id, market, name, side, order_type, price, qty, amount, fee, bas_dt)
      values (o.user_id, o.id, o.market, o.name, 'buy', o.type, fill_price, q, amount, fee, fill_dt);
    else
      select * into h from holdings where user_id = o.user_id and market = o.market for update;
      q := least(o.qty, coalesce(h.qty, 0));
      if q < 1 then
        update orders set status = 'void', closed_at = now() where id = o.id;
        continue;
      end if;
      amount := q * fill_price;
      fee := amount * 0.00015;
      tax := amount * 0.002;
      cost_part := h.cost * (q / h.qty);
      if h.qty - q < 1 then
        delete from holdings where user_id = o.user_id and market = o.market;
      else
        update holdings set qty = qty - q, cost = cost - cost_part where user_id = o.user_id and market = o.market;
      end if;
      update accounts set cash = cash + amount - fee - tax where user_id = o.user_id;
      update orders set status = 'filled', closed_at = now() where id = o.id;
      insert into trades (user_id, order_id, market, name, side, order_type, price, qty, amount, fee, pnl, bas_dt)
      values (o.user_id, o.id, o.market, o.name, 'sell', o.type, fill_price, q, amount, fee + tax,
              amount - fee - tax - cost_part, fill_dt);
    end if;
  end loop;
  return settled;
end;
$$;

-- Values every account (coins at live Upbit prices, stocks at the latest close),
-- stores a snapshot and rebuilds the leaderboard. Called hourly by the GitHub Action.
create or replace function public.refresh_rankings()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  prices jsonb := coin_prices();
  r record;
  hv numeric;
  reserved numeric;
  total numeric;
  dd numeric;
  sells int;
  wins int;
  n_trades int;
  n int := 0;
begin
  for r in select p.id, p.nickname, a.cash from profiles p join accounts a on a.user_id = p.id loop
    select coalesce(sum(h.qty * coalesce(
             case when h.market like 'KRW-%' then (prices ->> h.market)::numeric else lp.close end,
             h.cost / h.qty)), 0)
      into hv
      from holdings h
      left join lateral (
        select sp.close from stock_prices sp
        where h.market like 'KRX:%' and sp.code = substr(h.market, 5)
        order by sp.bas_dt desc limit 1
      ) lp on true
      where h.user_id = r.id;

    select coalesce(sum(od.reserved), 0) into reserved
      from orders od where od.user_id = r.id and od.status = 'pending' and od.side = 'buy';

    total := r.cash + reserved + hv;
    insert into snapshots (user_id, t, value) values (r.id, now(), total)
      on conflict (user_id, t) do update set value = excluded.value;

    select coalesce(min(s.value / s.peak - 1), 0) into dd
      from (select value, max(value) over (order by t rows unbounded preceding) as peak
            from snapshots where user_id = r.id) s;

    select count(*) filter (where side = 'sell'),
           count(*) filter (where side = 'sell' and pnl > 0),
           count(*) filter (where side <> 'void')
      into sells, wins, n_trades
      from trades where user_id = r.id;

    insert into rankings (user_id, nickname, total, ret, mdd, win_rate, trades, updated_at)
    values (r.id, r.nickname, total, total / 100000000 - 1, dd,
            case when sells > 0 then wins::numeric / sells end, n_trades, now())
    on conflict (user_id) do update set
      nickname = excluded.nickname, total = excluded.total, ret = excluded.ret, mdd = excluded.mdd,
      win_rate = excluded.win_rate, trades = excluded.trades, updated_at = excluded.updated_at;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ===================================================================
-- Function permissions
-- ===================================================================

revoke execute on function
  public.handle_new_user(), public.coin_prices(), public.order_eligible_date(text),
  public.settle_stock_orders(), public.refresh_rankings()
from public, anon, authenticated;
grant execute on function public.settle_stock_orders(), public.refresh_rankings() to service_role;

revoke execute on function
  public.buy_coin(text, numeric), public.sell_coin(text, numeric),
  public.place_stock_order(text, text, text, numeric, numeric), public.cancel_order(uuid)
from public, anon;
grant execute on function
  public.buy_coin(text, numeric), public.sell_coin(text, numeric),
  public.place_stock_order(text, text, text, numeric, numeric), public.cancel_order(uuid)
to authenticated;

grant execute on function public.nickname_available(text) to anon, authenticated;
