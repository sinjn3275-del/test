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

notify pgrst, 'reload schema';
