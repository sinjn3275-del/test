-- 입고수 데이터베이스 설정 5/7: 주식 주문 접수·취소
-- 4번까지 실행한 뒤 이 조각을 실행하세요.

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
