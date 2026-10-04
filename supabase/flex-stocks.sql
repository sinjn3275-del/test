-- 플렉스시티 국내 주식 (KOSPI/KOSDAQ). Run once after flex.sql and flex-ranking.sql
-- (Supabase Dashboard → SQL Editor). Safe to re-run.
--
-- Prices are the daily closes that 입고수 already stores in stock_prices. A close is
-- public before it reaches us (the data arrives the next business day), so orders
-- never fill at a known price: each order fills at the first close that wasn't known
-- when it was placed (before 15:30 KST on a weekday → that day's close, otherwise
-- the next trading day's). Pending orders are settled whenever the player's state is
-- read, so no extra scheduled job is needed.

create table if not exists public.flex_orders (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.flex_accounts (user_id) on delete cascade,
  code text not null,
  name text not null,
  side text not null check (side in ('buy', 'sell')),
  krw numeric,                         -- buy: cash reserved (fee included)
  qty numeric,                         -- sell: shares to sell
  fill_from date not null,             -- first trading date whose close may fill it
  created_at timestamptz not null default now()
);
create index if not exists flex_orders_user on public.flex_orders (user_id);
-- Several log lines can be written in one call; keep their order.
alter table public.flex_log alter column at set default clock_timestamp();
alter table public.flex_orders enable row level security;
revoke all on public.flex_orders from anon, authenticated;

-- First close not yet public at the time of ordering.
create or replace function public.flex_fill_from()
returns date
language sql
stable
as $$
  select case
    when extract(isodow from k) between 1 and 5 and k::time < time '15:30' then k::date
    else k::date + case extract(isodow from k)::int when 5 then 3 when 6 then 2 else 1 end
  end
  from (select now() at time zone 'Asia/Seoul' as k) t;
$$;

-- Fill the caller's (or p_user's) pending orders whose close has arrived.
create or replace function public.flex_settle(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  o flex_orders;
  px record;
  h flex_holdings;
  v_qty numeric;
  v_net numeric;
  cost_part numeric;
begin
  for o in select * from flex_orders where user_id = p_user order by id loop
    select bas_dt, close into px from stock_prices
    where code = o.code and bas_dt >= o.fill_from order by bas_dt limit 1;
    continue when px.close is null;

    if o.side = 'buy' then
      v_qty := o.krw * (1 - 0.0005) / px.close;
      insert into flex_holdings (user_id, market, qty, cost) values (p_user, 'KRX:' || o.code, v_qty, o.krw)
      on conflict (user_id, market) do update
        set qty = flex_holdings.qty + excluded.qty, cost = flex_holdings.cost + excluded.cost;
      insert into flex_log (user_id, text)
      values (p_user, o.name || ' ' || to_char(floor(v_qty), 'FM999,999,999') || '주 매수 체결 ('
              || to_char(px.bas_dt, 'FMMM/FMDD') || ' 종가 ' || to_char(px.close, 'FM999,999,999') || '원)');
    else
      select * into h from flex_holdings where user_id = p_user and market = 'KRX:' || o.code for update;
      if found then
        v_qty := least(o.qty, h.qty);
        v_net := floor(v_qty * px.close * (1 - 0.0005));
        cost_part := h.cost * (v_qty / h.qty);
        if h.qty - v_qty < 1e-10 then
          delete from flex_holdings where user_id = p_user and market = h.market;
        else
          update flex_holdings set qty = flex_holdings.qty - v_qty, cost = flex_holdings.cost - cost_part
          where user_id = p_user and market = h.market;
        end if;
        update flex_accounts set cash = cash + v_net where user_id = p_user;
        insert into flex_log (user_id, text)
        values (p_user, o.name || ' 매도 체결 +' || flex_won_short(v_net) || '원 ('
                || case when v_net >= cost_part then '수익 ' else '손실 ' end || flex_won_short(abs(v_net - cost_part)) || '원)');
      end if;
    end if;
    delete from flex_orders where id = o.id;
  end loop;
end;
$$;

-- Place an order. Buy: p_amount is 원 (fee included). Sell: p_amount is shares.
create or replace function public.flex_stock_order(p_code text, p_side text, p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a flex_accounts := flex_me();
  nm text;
  held numeric;
  pending numeric;
begin
  select name into nm from stock_prices where code = p_code order by bas_dt desc limit 1;
  if nm is null then raise exception '없는 종목이에요.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception '주문 수량을 입력해 주세요.'; end if;
  if (select count(*) from flex_orders where user_id = a.user_id) >= 30 then
    raise exception '대기 중인 주문은 30개까지예요.';
  end if;

  if p_side = 'buy' then
    p_amount := floor(p_amount);
    if p_amount < 5000 then raise exception '최소 주문 금액은 5,000원이에요.'; end if;
    if p_amount > a.cash then raise exception '현금이 부족해요.'; end if;
    update flex_accounts set cash = cash - p_amount where user_id = a.user_id;
    insert into flex_orders (user_id, code, name, side, krw, fill_from) values (a.user_id, p_code, nm, 'buy', p_amount, flex_fill_from());
    insert into flex_log (user_id, text) values (a.user_id, nm || ' 매수 주문 -' || flex_won_short(p_amount) || '원 (다음 종가에 체결)');
  elsif p_side = 'sell' then
    select qty into held from flex_holdings where user_id = a.user_id and market = 'KRX:' || p_code;
    select coalesce(sum(qty), 0) into pending from flex_orders where user_id = a.user_id and code = p_code and side = 'sell';
    if coalesce(held, 0) - pending < p_amount - 1e-9 then raise exception '팔 수 있는 수량이 부족해요.'; end if;
    insert into flex_orders (user_id, code, name, side, qty, fill_from) values (a.user_id, p_code, nm, 'sell', p_amount, flex_fill_from());
    insert into flex_log (user_id, text) values (a.user_id, nm || ' 매도 주문 ' || to_char(p_amount, 'FM999,999,990.####') || '주 (다음 종가에 체결)');
  else
    raise exception '잘못된 주문이에요.';
  end if;
  return flex_state();
end;
$$;

create or replace function public.flex_cancel_order(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a flex_accounts := flex_me();
  o flex_orders;
begin
  delete from flex_orders where id = p_id and user_id = a.user_id returning * into o;
  if not found then raise exception '이미 체결됐거나 없는 주문이에요.'; end if;
  if o.side = 'buy' then update flex_accounts set cash = cash + o.krw where user_id = a.user_id; end if;
  insert into flex_log (user_id, text) values (a.user_id, o.name || ' 주문 취소');
  return flex_state();
end;
$$;

-- flex_state from flex.sql, now settling stock orders first and listing pending ones.
create or replace function public.flex_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a flex_accounts := flex_me();
begin
  perform flex_settle(a.user_id);
  select * into a from flex_accounts where user_id = a.user_id;
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
    'orders', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'side', side,
                          'krw', krw, 'qty', qty, 'fill_from', fill_from) order by id)
                        from flex_orders where user_id = a.user_id), '[]'::jsonb),
    'log', coalesce((select jsonb_agg(jsonb_build_object('t', (extract(epoch from at) * 1000)::bigint, 'text', text) order by at desc, id desc)
                     from (select id, at, text from flex_log where user_id = a.user_id order by at desc, id desc limit 40) l), '[]'::jsonb)
  );
end;
$$;

-- flex_refresh_rankings from flex-ranking.sql, now also valuing stocks (latest close)
-- and cash reserved in pending buy orders.
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
  select string_agg(distinct market, ',') into markets from flex_holdings
  where market like 'KRW-%' and (p_user is null or user_id = p_user);
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
  select prices || coalesce(jsonb_object_agg('KRX:' || s.code, s.close), '{}'::jsonb) into prices
  from (select distinct on (sp.code) sp.code, sp.close from stock_prices sp
        where sp.code in (select substr(market, 5) from flex_holdings
                          where market like 'KRX:%' and (p_user is null or user_id = p_user))
        order by sp.code, sp.bas_dt desc) s;

  delete from flex_rankings where p_user is null or user_id = p_user;
  insert into flex_rankings (user_id, nickname, worth, top_item)
  select a.user_id, p.nickname,
         a.cash
         + coalesce((select sum(case when prices ? h.market then h.qty * (prices ->> h.market)::numeric else h.cost end)
                     from flex_holdings h where h.user_id = a.user_id), 0)
         + coalesce((select sum(o.krw) from flex_orders o where o.user_id = a.user_id and o.side = 'buy'), 0)
         + coalesce((select sum(floor(i.price * 0.9)) from flex_items fi cross join lateral flex_item(fi.item_id) i
                     where fi.user_id = a.user_id), 0),
         (select i.name from flex_items fi cross join lateral flex_item(fi.item_id) i
          where fi.user_id = a.user_id order by i.price desc nulls last limit 1)
  from flex_accounts a
  join profiles p on p.id = a.user_id
  where p_user is null or a.user_id = p_user;
end;
$$;

revoke execute on function public.flex_settle(uuid), public.flex_refresh_rankings(uuid)
from public, anon, authenticated;
revoke execute on function public.flex_stock_order(text, text, numeric), public.flex_cancel_order(bigint) from public, anon;
grant execute on function public.flex_stock_order(text, text, numeric), public.flex_cancel_order(bigint) to authenticated;
