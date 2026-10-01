-- 입고수 데이터베이스 설정 1/7: 표 만들기

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
alter table public.profiles enable row level security;

create table if not exists public.accounts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  cash numeric not null default 100000000 check (cash >= 0),
  created_at timestamptz not null default now()
);
alter table public.accounts enable row level security;

create table if not exists public.holdings (
  user_id uuid not null references public.profiles (id) on delete cascade,
  market text not null,               -- 'KRW-BTC' (coin) or 'KRX:005930' (stock)
  name text,
  qty numeric not null check (qty > 0),
  cost numeric not null,              -- total cost basis including fees
  primary key (user_id, market)
);
alter table public.holdings enable row level security;

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
alter table public.orders enable row level security;
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
alter table public.trades enable row level security;
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
alter table public.stock_prices enable row level security;
create index if not exists stock_prices_code_idx on public.stock_prices (code, bas_dt desc);

-- Total asset value over time (written by refresh_rankings and at signup).
create table if not exists public.snapshots (
  user_id uuid not null references public.profiles (id) on delete cascade,
  t timestamptz not null default now(),
  value numeric not null,
  primary key (user_id, t)
);
alter table public.snapshots enable row level security;

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
alter table public.rankings enable row level security;
