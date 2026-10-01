-- 입고수 데이터베이스 설정 6/7: 주식 주문 체결
-- 5번까지 실행한 뒤 이 조각을 실행하세요.

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
