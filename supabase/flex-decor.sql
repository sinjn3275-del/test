-- 플렉스시티: 조경·조각상 (내 동네에 나무·분수·우물·동상 등을 여러 개 사서 놓기).
-- Run after flex-floor.sql in Supabase Dashboard → SQL Editor. Safe to re-run.
--
-- Each placed piece is one row in flex_decor. Pieces are bought, removed (90% back) and
-- the floor is paved together in one 완료 (flex_edit_town); moving a piece is free.
-- Placed pieces count toward 총 재산 at their resale value, like other items.

create table if not exists public.flex_decor (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.flex_accounts (user_id) on delete cascade,
  item_id text not null,
  at text not null,                       -- "i,j" tile on the 7x7 town
  bought_at timestamptz not null default now()
);
create index if not exists flex_decor_user on public.flex_decor (user_id);
alter table public.flex_decor enable row level security;
revoke all on public.flex_decor from anon, authenticated;

-- Catalog. Keep in sync with DECOR in flex/decor3d.js.
create or replace function public.flex_decor_item(p_id text, out name text, out price numeric)
language sql
immutable
as $$
  select v.name, v.price from (values
    ('flowerbed', '꽃밭', 2000000),
    ('bench', '벤치', 1000000),
    ('lamp', '정원 가로등', 3000000),
    ('tree-pine', '소나무', 3000000),
    ('tree-maple', '단풍나무', 6000000),
    ('tree-cherry', '벚꽃나무', 8000000),
    ('tree-palm', '야자수', 12000000),
    ('well', '우물', 20000000),
    ('fountain', '작은 분수', 50000000),
    ('pond', '연못', 100000000),
    ('fountain-grand', '대형 분수대', 300000000),
    ('statue-lion', '돌 사자상', 100000000),
    ('statue-angel', '천사상', 300000000),
    ('statue-horse', '청동 기마상', 500000000),
    ('statue-gold', '황금 여신상', 1000000000),
    ('statue-me', '내 캐릭터 황금 동상', 3000000000)
  ) v(id, name, price) where v.id = p_id
$$;

-- Floor + pieces of one town.
create or replace function public.flex_town_of(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'floor', coalesce((select floor from flex_accounts where user_id = p_user), '{}'::jsonb),
    'decor', coalesce((select jsonb_agg(jsonb_build_object('rid', id, 'id', item_id, 'at', at) order by id)
                       from flex_decor where user_id = p_user), '[]'::jsonb))
$$;

-- Mine when p_nickname is null, otherwise that player's (for 구경하기).
create or replace function public.flex_town(p_nickname text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select flex_town_of(case when p_nickname is null then auth.uid()
                           else (select id from profiles where nickname = p_nickname) end)
$$;

-- One 완료 of the town editor.
--   p_floor:  { "i,j": material } tiles to change ("dirt" = bare ground)
--   p_add:    [ { "id": decor id, "at": "i,j" } ] pieces to buy and place
--   p_remove: decor row ids to take away (90% of the price back)
create or replace function public.flex_edit_town(p_floor jsonb, p_add jsonb, p_remove bigint[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a flex_accounts := flex_me();
  fl jsonb := a.floor;
  k text;
  v text;
  price numeric;
  floor_cost numeric := 0;
  add_cost numeric := 0;
  refund numeric := 0;
  n_floor int := 0;
  n_add int := 0;
  n_remove int := 0;
  e jsonb;
  net numeric;
  parts text[] := '{}';
begin
  -- Floor
  if p_floor is not null and jsonb_typeof(p_floor) = 'object' then
    for k, v in select key, value #>> '{}' from jsonb_each(p_floor) loop
      if k !~ '^[0-6],[0-5]$' then raise exception '깔 수 없는 칸이에요.'; end if;
      price := flex_floor_price(v);
      if price is null then raise exception '없는 바닥재예요.'; end if;
      if coalesce(fl ->> k, 'dirt') = v then continue; end if;
      floor_cost := floor_cost + price;
      n_floor := n_floor + 1;
      fl := case when v = 'dirt' then fl - k else fl || jsonb_build_object(k, v) end;
    end loop;
  end if;

  -- Removals
  select coalesce(sum(floor(d.price * 0.9)), 0), count(*) into refund, n_remove
  from flex_decor fd cross join lateral flex_decor_item(fd.item_id) d
  where fd.user_id = a.user_id and fd.id = any(coalesce(p_remove, '{}'));
  delete from flex_decor where user_id = a.user_id and id = any(coalesce(p_remove, '{}'));

  -- Additions
  if p_add is not null and jsonb_typeof(p_add) = 'array' then
    for e in select * from jsonb_array_elements(p_add) loop
      if coalesce(e ->> 'at', '') !~ '^[0-6],[0-5]$' then raise exception '놓을 수 없는 칸이에요.'; end if;
      select d.price into price from flex_decor_item(e ->> 'id') d;
      if price is null then raise exception '없는 물건이에요.'; end if;
      insert into flex_decor (user_id, item_id, at) values (a.user_id, e ->> 'id', e ->> 'at');
      add_cost := add_cost + price;
      n_add := n_add + 1;
    end loop;
  end if;
  if (select count(*) from flex_decor where user_id = a.user_id) > 42 then raise exception '더 놓을 자리가 없어요.'; end if;
  if exists (select 1 from flex_decor where user_id = a.user_id group by at having count(*) > 1) then
    raise exception '한 칸에는 하나만 놓을 수 있어요.';
  end if;

  net := floor_cost + add_cost - refund;
  if a.cash < net then raise exception '현금이 부족해요.'; end if;
  update flex_accounts set cash = cash - net, floor = fl where user_id = a.user_id;

  if n_floor > 0 then parts := parts || ('바닥 ' || n_floor || '칸'); end if;
  if n_add > 0 then parts := parts || ('조경·조각상 ' || n_add || '개'); end if;
  if n_remove > 0 then parts := parts || ('철거 ' || n_remove || '개'); end if;
  if cardinality(parts) > 0 then
    insert into flex_log (user_id, text) values (a.user_id, '꾸미기(' || array_to_string(parts, ', ') || ') '
      || case when net >= 0 then '-' else '+' end || flex_won_short(abs(net)) || '원');
  end if;
  return flex_state() || flex_town_of(a.user_id);
end;
$$;

-- Move pieces: p_moves = { "<row id>": "i,j" }. Free.
create or replace function public.flex_move_decor(p_moves jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a flex_accounts := flex_me();
  k text;
  v text;
begin
  if p_moves is null or jsonb_typeof(p_moves) <> 'object' then raise exception '잘못된 요청이에요.'; end if;
  for k, v in select key, value #>> '{}' from jsonb_each(p_moves) loop
    if k !~ '^[0-9]+$' or v !~ '^[0-6],[0-5]$' then raise exception '옮길 수 없는 칸이에요.'; end if;
    update flex_decor set at = v where user_id = a.user_id and id = k::bigint;
  end loop;
  if exists (select 1 from flex_decor where user_id = a.user_id group by at having count(*) > 1) then
    raise exception '한 칸에는 하나만 놓을 수 있어요.';
  end if;
end;
$$;

-- flex_refresh_rankings from flex-stocks.sql, now also valuing placed pieces at 90%.
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
                     where fi.user_id = a.user_id), 0)
         + coalesce((select sum(floor(d.price * 0.9)) from flex_decor fd cross join lateral flex_decor_item(fd.item_id) d
                     where fd.user_id = a.user_id), 0),
         (select i.name from flex_items fi cross join lateral flex_item(fi.item_id) i
          where fi.user_id = a.user_id order by i.price desc nulls last limit 1)
  from flex_accounts a
  join profiles p on p.id = a.user_id
  where p_user is null or a.user_id = p_user;
end;
$$;

revoke execute on function public.flex_decor_item(text), public.flex_town_of(uuid), public.flex_refresh_rankings(uuid),
  public.flex_edit_town(jsonb, jsonb, bigint[]), public.flex_move_decor(jsonb), public.flex_town(text) from public, anon;
grant execute on function public.flex_edit_town(jsonb, jsonb, bigint[]), public.flex_move_decor(jsonb) to authenticated;
grant execute on function public.flex_town(text) to anon, authenticated;
revoke execute on function public.flex_refresh_rankings(uuid) from authenticated;
