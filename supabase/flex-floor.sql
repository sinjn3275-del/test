-- 플렉스시티: 바닥재 (내 동네 칸마다 잔디·콘크리트·대리석 등을 사서 깔기).
-- Run after flex-social.sql in Supabase Dashboard → SQL Editor. Safe to re-run.
--
-- The town starts as bare dirt. Each tile can be paved with a material bought per tile;
-- paving is a consumable (no resale) and paving over a tile replaces the old material.
-- "dirt" puts the tile back to bare ground for free. The river row (j = 6) can't be paved.

alter table public.flex_accounts add column if not exists floor jsonb not null default '{}'::jsonb;  -- { "i,j": material }

-- Price per tile (won). Keep in sync with FLOORS in flex/town3d.js.
create or replace function public.flex_floor_price(p_floor text)
returns numeric
language sql
immutable
as $$
  select case p_floor
    when 'dirt' then 0
    when 'grass' then 1000000
    when 'gravel' then 2000000
    when 'concrete' then 3000000
    when 'brick' then 5000000
    when 'deck' then 8000000
    when 'marble' then 20000000
    when 'gold' then 100000000
  end
$$;

-- p_paint: { "i,j": material, ... } (at most 49 tiles). Charges the total and returns the
-- whole state plus 'floor'.
create or replace function public.flex_paint_floor(p_paint jsonb)
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
  cost numeric := 0;
  n int := 0;
begin
  if p_paint is null or jsonb_typeof(p_paint) <> 'object' then raise exception '잘못된 요청이에요.'; end if;
  for k, v in select key, value #>> '{}' from jsonb_each(p_paint) loop
    if k !~ '^[0-6],[0-5]$' then raise exception '깔 수 없는 칸이에요.'; end if;
    price := flex_floor_price(v);
    if price is null then raise exception '없는 바닥재예요.'; end if;
    if coalesce(fl ->> k, 'dirt') = v then continue; end if;
    cost := cost + price;
    n := n + 1;
    fl := case when v = 'dirt' then fl - k else fl || jsonb_build_object(k, v) end;
  end loop;
  if a.cash < cost then raise exception '현금이 부족해요.'; end if;
  update flex_accounts set cash = cash - cost, floor = fl where user_id = a.user_id;
  if cost > 0 then
    insert into flex_log (user_id, text) values (a.user_id, '바닥 ' || n || '칸 깔기 -' || flex_won_short(cost) || '원');
  end if;
  return flex_state() || jsonb_build_object('floor', fl);
end;
$$;

-- Floor of a town: mine when p_nickname is null, otherwise that player's (for 구경하기).
create or replace function public.flex_floor(p_nickname text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select a.floor from flex_accounts a
    where a.user_id = case when p_nickname is null then auth.uid()
                           else (select id from profiles where nickname = p_nickname) end
  ), '{}'::jsonb)
$$;

revoke execute on function public.flex_floor_price(text), public.flex_paint_floor(jsonb), public.flex_floor(text) from public, anon;
grant execute on function public.flex_paint_floor(jsonb) to authenticated;
grant execute on function public.flex_floor(text) to anon, authenticated;
