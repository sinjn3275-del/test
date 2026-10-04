-- Account deletion (회원 탈퇴) for 입고수 and 플렉스시티 (shared accounts).
-- Run once in Supabase Dashboard → SQL Editor. Safe to re-run.
--
-- Deleting the auth user cascades to profiles and every table that references it
-- (입고수 accounts/holdings/orders/trades/snapshots/rankings and all flex_* tables).

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception '로그인이 필요해요.'; end if;
  delete from auth.users where id = uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
