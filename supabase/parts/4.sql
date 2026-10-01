-- 입고수 데이터베이스 설정 4/7: 코인 주문
-- 3번까지 실행한 뒤 이 조각을 실행하세요.

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
