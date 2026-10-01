# 입고수 (If고수) — 모의투자

"입으로만 고수인지, 진짜 고수인지" 수익률로 검증하는 모의투자 서비스입니다.

## 구조

- **화면:** `index.html` 한 파일 (GitHub Pages로 배포)
- **서버:** Supabase (회원가입·로그인, 잔고·주문·거래 기록, 랭킹)
  - 브라우저는 자기 데이터를 **읽기만** 할 수 있어요. 잔고, 보유 종목, 주문, 거래 기록은
    `supabase/schema.sql`의 데이터베이스 함수만 바꿀 수 있어서 기록 조작이 불가능해요.
  - 코인은 주문 시 서버가 업비트 시세를 직접 받아 체결해요.
  - 국내주식 예약 주문은 GitHub Actions가 종가를 넣은 뒤 서버에서 일괄 체결해요.
- **GitHub Actions**
  - `update-stocks.yml`: 공공데이터 일별 시세 수집 → `data/stocks/` 저장 → Supabase에 반영, 주식 주문 체결, 랭킹 갱신
  - `refresh-rankings.yml`: 매시간 전체 계좌 평가 → 자산 추이 기록, 랭킹 갱신

## Supabase 설정 (최초 1회)

1. Supabase Dashboard → **SQL Editor** → `supabase/schema.sql` 전체를 붙여넣고 **Run**
2. Authentication → Sign In / Providers → Email에서 **Confirm email**을 끄면 가입 즉시 이용 가능
   (켜 두면 인증 메일을 눌러야 로그인돼요. 기본 메일 발송은 시간당 횟수 제한이 있어요.)
3. Project Settings → API Keys의 **Secret key**를 GitHub 저장소 Secrets에 `SUPABASE_SERVICE_KEY`로 저장
4. Actions → **Refresh rankings** → Run workflow로 연결 확인

`index.html`에 들어 있는 Project URL과 Publishable key는 공개용이라 노출돼도 괜찮아요.
Secret key는 절대 코드나 채팅에 넣지 마세요.

## 기능

- 이메일 회원가입·로그인, 가입 시 모의투자금 1억 원 지급, 닉네임 중복 방지
- **코인 10종:** 업비트 실시간 시세로 즉시 체결 (수수료 0.05%, 서버가 체결 가격 결정)
- **국내주식 (코스피·코스닥 전 종목):** 공공데이터 일별 시세(시가·고가·저가·종가)로 예약 체결
  - **종가 주문:** 15:30 전 주문은 그날 종가, 이후 주문은 다음 거래일 종가
  - **시가 주문:** 09:00 전 주문은 그날 시가, 이후 주문은 다음 거래일 시가
  - **지정가 주문:** 다음 거래일부터 5거래일 동안 유효. 매수는 저가가 지정가 이하, 매도는 고가가 지정가 이상이면 지정가로 체결.
    시가가 이미 지정가보다 유리하게 열리면 시가로 체결. 기간 안에 체결되지 않으면 만료되고 예약금 환불.
    지정가는 최근 종가의 ±30% 안에서만 입력 가능
  - 이미 공개된 시세로는 체결되지 않음 (지난 가격을 보고 사는 꼼수 차단)
  - 종가·시가 매수는 금액으로 주문해 체결 시 정수 주로 환산, 지정가와 매도는 주 단위
  - 수수료 0.015%, 매도 시 거래세 0.20% (가정값, `index.html` 상단 상수에서 변경)
  - 현재가는 네이버 증권 링크로 확인
  - 체결 전 주문은 취소 가능, 체결된 거래는 수정·삭제 불가
- 총 자산, 수익률, 자산 추이 그래프(매시간 기록), 최대 낙폭(MDD)
- 전체 회원 랭킹 (수익률, MDD, 승률, 거래 횟수, 매시간 갱신)

## 국내주식 종가 데이터 설정

API 키가 화면 코드에 노출되지 않도록, GitHub Actions가 종가를 받아 `data/stocks/`에 저장하고 화면은 그 파일을 읽습니다.

1. [공공데이터포털](https://www.data.go.kr/data/15094808/openapi.do)에서 **금융위원회_주식시세정보** 활용 신청
2. 마이페이지에서 **일반 인증키 (Decoding)** 복사
3. GitHub 저장소 → Settings → Secrets and variables → Actions → New repository secret
   - Name: `DATA_GO_KR_KEY`, Secret: 복사한 키
4. Actions 탭 → **Update stock closing prices** → **Run workflow**로 첫 수집 실행

이후 월~토 오후(KST 14:10, 18:10)에 자동으로 전 거래일 시세를 받아 커밋하고 Supabase에 반영합니다.
파일은 최근 30거래일, 데이터베이스는 최근 40일치만 보관해요.

로컬 실행: `DATA_GO_KR_KEY=<키> node scripts/fetch-stocks.mjs`

## 남은 과제

- 카카오·구글 소셜 로그인
- 해외 주식, 금·유가, 인증 고수 배지, 시즌제
- 개인정보처리방침 페이지 (이메일을 수집하므로 정식 오픈 전 필요)

모의투자 서비스이며 투자 권유가 아닙니다.
