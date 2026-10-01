-- 입고수 데이터베이스 설정 3/7: 공통 함수
-- 2번까지 실행한 뒤 이 조각을 실행하세요.

-- ===================================================================
-- Helpers
-- ===================================================================

create or replace function public.coin_markets()
returns text[]
language sql
immutable
as $$
  select array['KRW-BTC', 'KRW-ETH', 'KRW-XRP', 'KRW-SOL', 'KRW-DOGE', 'KRW-ADA', 'KRW-AVAX', 'KRW-LINK', 'KRW-DOT', 'KRW-TRX'];
$$;

create or replace function public.coin_name(p_market text)
returns text
language sql
immutable
as $$
  select case p_market
    when 'KRW-BTC' then '비트코인' when 'KRW-ETH' then '이더리움' when 'KRW-XRP' then '리플'
    when 'KRW-SOL' then '솔라나' when 'KRW-DOGE' then '도지코인' when 'KRW-ADA' then '에이다'
    when 'KRW-AVAX' then '아발란체' when 'KRW-LINK' then '체인링크' when 'KRW-DOT' then '폴카닷'
    when 'KRW-TRX' then '트론' end;
$$;

-- Live coin prices from the Upbit public API, as {"KRW-BTC": 113000000, ...}.
create or replace function public.coin_prices()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r extensions.http_response;
  res jsonb := '{}'::jsonb;
  e jsonb;
begin
  select * into r from extensions.http_get(
    'https://api.upbit.com/v1/ticker?markets=' || array_to_string(public.coin_markets(), ','));
  if r.status <> 200 then
    raise exception '코인 시세를 가져오지 못했어요. 잠시 후 다시 시도해 주세요. (HTTP %)', r.status;
  end if;
  for e in select * from jsonb_array_elements(r.content::jsonb) loop
    res := res || jsonb_build_object(e ->> 'market', (e ->> 'trade_price')::numeric);
  end loop;
  return res;
end;
$$;

create or replace function public.next_weekday(d date)
returns date
language sql
immutable
as $$
  select d + case extract(isodow from d)::int when 5 then 3 when 6 then 2 else 1 end;
$$;

-- First trading date whose prices may fill a new stock order:
--   close: before 15:30 KST → today, otherwise tomorrow
--   open:  before 09:00 KST → today, otherwise tomorrow
--   limit: always from tomorrow (part of today's range may already be known)
-- and never a date whose prices are already stored.
create or replace function public.order_eligible_date(p_type text)
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  k timestamp := now() at time zone 'Asia/Seoul';
  d date := k::date;
  mins int := extract(hour from k)::int * 60 + extract(minute from k)::int;
  e date;
  latest date;
begin
  if p_type = 'limit' then
    e := d + 1;
  elsif p_type = 'open' then
    e := case when mins < 9 * 60 then d else d + 1 end;
  else
    e := case when mins < 15 * 60 + 30 then d else d + 1 end;
  end if;
  select max(bas_dt) into latest from stock_prices;
  if latest is not null then
    e := greatest(e, public.next_weekday(latest));
  end if;
  return e;
end;
$$;
