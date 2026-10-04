-- 플렉스시티 shop catalog (items added after flex.sql). Run once in Supabase
-- Dashboard → SQL Editor. Safe to re-run. Must match ITEMS in flex/index.html.

create or replace function public.flex_item(p_id text, out name text, out price numeric)
language sql
immutable
as $$
  select v.name, v.price from (values
    ('car-mini', '귀요미 경차', 15000000),
    ('car-sedan', '패밀리 세단', 45000000),
    ('car-ev', '전기 GT 세단', 130000000),
    ('car-classic', '클래식 컨버터블', 180000000),
    ('car-suv', '대형 SUV', 95000000),
    ('car-sports', '로드스터 스포츠카', 280000000),
    ('car-super', 'V12 슈퍼카', 650000000),
    ('car-limo', '스트레치 리무진', 900000000),
    ('car-offroad', '6륜 오프로더', 1200000000),
    ('car-hyper', '한정판 하이퍼카', 3500000000),
    ('watch-digital', '전자시계', 300000),
    ('watch-classic', '가죽 클래식', 6000000),
    ('watch-diver', '다이버 워치', 18000000),
    ('watch-gold', '골드 드레스워치', 80000000),
    ('watch-chrono', '핑크골드 크로노그래프', 120000000),
    ('watch-diamond', '다이아 베젤', 500000000),
    ('watch-skeleton', '스켈레톤 투르비용', 1200000000),
    ('watch-grand', '그랜드 컴플리케이션', 2500000000),
    ('house-oneroom', '역세권 원룸', 200000000),
    ('house-villa', '신축 빌라', 500000000),
    ('house-apt', '브랜드 아파트', 1500000000),
    ('house-hanok', '북촌 한옥', 3000000000),
    ('house-poolvilla', '제주 풀빌라', 4000000000),
    ('house-penthouse', '한강뷰 펜트하우스', 8000000000),
    ('house-mansion', '정원 딸린 대저택', 15000000000),
    ('house-castle', '프라이빗 섬의 성', 50000000000),
    ('house-tower', '랜드마크 타워', 200000000000),
    ('sp-balloon', '개인 열기구', 500000000),
    ('sp-yacht', '럭셔리 요트', 3000000000),
    ('sp-heli', '개인 헬기', 6000000000),
    ('sp-sub', '개인 잠수함', 15000000000),
    ('sp-superyacht', '메가 슈퍼요트', 30000000000),
    ('sp-jet', '프라이빗 제트', 40000000000),
    ('sp-rocket', '개인 우주선', 500000000000)
  ) as v(id, name, price)
  where v.id = p_id;
$$;
