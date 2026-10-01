-- 입고수 데이터베이스 설정 2/7: 보안 정책, 회원가입 처리
-- 1번까지 실행한 뒤 이 조각을 실행하세요.

-- ===================================================================
-- Row level security policies: read-only access for clients
-- (RLS itself is enabled right after each table is created above)
-- ===================================================================

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
