# PFund2 v2.6.1 공식 프로그램 역분석 — 기능 반영 점검

> 분석일: 2026-06-11
> 대상: `중앙선거관리위원회_정치자금회계관리2/최신설치파일/PFund2_Install_v2.6.1_20250701.exe`

## 분석 방법

1. **innoextract**로 Inno Setup 설치파일 추출 → `PFund2.exe`(Delphi VCL, 90MB), `Data/Fund_Master.db`(기준 DB), Excel 양식 39종, 도움말 PDF, 자료전환 도구(DataConv.exe + BDE)
2. PE 리소스 파싱 → **바이너리 DFM 폼 40개** 전체를 텍스트로 변환 (화면 구조·캡션·그리드 컬럼 복원)
3. **Delphi UnicodeString 리터럴 924건** 추출 (검증 메시지·SQL·비즈니스 규칙)
4. `Fund_Master.db` CODESET 20종 / CODEVALUE 311건 / ACC_REL 867건을 프로젝트 코드와 대조
5. 사용자의 실제 2022년 데이터(`Data/2022_Fund_Data_2.db`)로 코드 사용 실태 교차검증

공식 프로그램 화면(폼) 전체 목록: Organ(기관), CustomerIn/AllCustomerIn(거래처/일괄), Income/Expense(수입/지출부), AllAddBookin(장부 일괄등록), DangbiReceipt(당비영수증), ExpDecision(지출결의서), EstateIn/EstateReport(재산), BalancePrint(보고서·수입지출부 일괄출력), InCmList(수입지출부+전송), InCmPreList(전년이월), InCmReport(수입지출보고서), HuInCmReport(후원회 총괄표), InCmTotSS(정당 총괄표), EstInCmTot(재산및수입지출총괄표), SettleSS(결산), CreateFile/CollectFile/DlgCollectOrg(제출파일 생성/취합), OverSupporter(초과 기부자), SupportList(지원내역보고), Supporter(후원금 관리·반환), OpinionReport(감사의견서/심사의결서), ComonCode(공통코드), DataBaseBackup/Init(백업/초기화), CameraDialog(영수증 촬영), ConfirmPW, Post(주소검색), Login/Main

---

## 🔴 P1. 발견된 실질 버그 — 익명/기명후원금 과목 코드 반전

공식 CODEVALUE(CS_ID=12, 후원회 과목)와 프로젝트 하드코딩이 다르다:

| CV_ID | 공식 (Fund_Master.db v2.6.1) | 프로젝트 가정 |
|-------|------------------------------|---------------|
| 93 | 전년도이월 | — |
| **94** | **기명후원금** | (미사용) |
| **95** | **익명후원금** | **기명후원금** ❌ |
| **96** | 그 밖의 수입 | **익명후원금** ❌ |

사용자의 실제 2022 후원회 DB 검증: `ITEM_SEC_CD=94` 34건 450만원(기명), `ITEM_SEC_CD=95` 13건 79만원(전건 10만원 이하 = 익명). 공식 코드가 맞음이 실데이터로 확인됨.

**영향받는 코드:**
- `app/src/hooks/use-donation-limit.ts:44` — `isAnonymous = itemSecCd === 16 || itemSecCd === 96` → **익명후원금(95) 입력 시 1회 10만원 한도 검증이 동작하지 않고**, 그밖의수입(96)에 오적용
- `app/src/hooks/use-donation-limit.ts:53` — `isNamedDonation = itemSecCd === 15 || itemSecCd === 95` → 익명후원금(95)에 "30만원 초과 공개대상" 경고·연간한도 검사를 오적용
- `app/src/app/dashboard/income/page.tsx:373-379` — `AUTO_CONTENT_MAP`이 95→"기명후원금", 96→"익명후원금"으로 내역 자동입력 (반대)
- 정당용 가정 "15=기명, 16=익명"도 허구: 공식 CS_ID=3에서 15=하급당부보조금, 16=상급당부보조금외. **정당 계정에는 기명/익명후원금 과목 자체가 없음** (정당 직접후원 금지)

참고: `lib/accounting/code-mapping.ts`(일괄등록)는 한글 과목명 매칭이라 영향 없음.

---

## 🟡 P2. 미반영 기능 (공식에 있으나 프로젝트에 없음)

| # | 기능 | 공식 프로그램 동작 | 프로젝트 현황 |
|---|------|--------------------|---------------|
| 1 | **당비영수증 출력** (TfrmDangbiReceipt) | 당비 수입 선택→영수증 인쇄. 1회 1만원 이하/초과 구분, 납부기간, 발행일자, 한글금액("원정 ￦"), 대표자 직인란, 마이너스(반환) 당비는 출력 제외 | 없음 (정당 계열 orgType 전용 기능) |
| 2 | **입력 시 연간 모금한도 경고** | 모금총액 1억4천 초과 시 "연간 한도 1억5천" 경고, 2억9천 초과 시 "한도 3억"(선거 있는 해) 경고 | 대시보드(org-metrics) 표시만. 수입 입력 시 경고는 기부자별 한도만 동작 |
| 3 | **전년이월 안내 팝업** | 연초 1/1~1/7(CS_ID=15) 로그인 시 "전년도 이월금액을 등록하시기 바랍니다" 팝업, ALARM 테이블(YEAR/ORG_ID/TYPE/CHK_YN)로 연도·기관별 1회 표시 관리, 전용 등록화면(TfrmInCmPreList) | 수입 항목으로 수동 입력만 가능. 알림 없음 |
| 4 | **수입·지출부 출력 옵션** (TfrmBalancePrint) | "일자별 합산" 옵션(같은 날짜 동일 유형 합산 출력), "전년도 자료" 포함 출력(PRE_ACC_FROM/TO 회계기간) | reports 페이지에 표지 선택만 있음. 일자별 합산·전년도 자료 옵션 없음 |
| 5 | **영수증번호 일괄제거** | 일괄생성 + 일괄제거 쌍으로 제공 | batch_receipt(일괄생성)만 구현 |
| 6 | **후원금 반환처리 검증** | "반환금액이 후원금액보다 많습니다" 검증, "당해년도 후원금은 감(-) 처리, 지난해 후원금은 그밖의 경비에서 지출 처리" 안내 | donors 페이지에 반환 표시(return_yn)는 있으나 금액 초과 검증·연도별 처리 안내 없음 |
| 7 | **정당의 총괄표 엑셀 출력** | 정당의 수입·지출총괄표(.xls), 정당의 재산 및 수입지출총괄표(.xls), NEC리포트양식 | party-summary는 화면 표시만. (후원회 총괄표는 엑셀 출력 구현됨 ✓) |
| 8 | **정치자금 지원내역보고** (TfrmSupportList) | 보조금 종류(경상/선거/여성·장애인·청년추천/보조금외)×지원대상(시도당/정책연구소/정당선거사무소/국회의원/(예비)후보자) 매트릭스 보고서 + 문서번호 | support-detail은 지원금(경비 42) 지출 단순 목록만 |
| 9 | **초과 기부자 보고서 양식** (TfrmOverSupporter) | 문서번호·작성연월일 갖춘 공식 보고서 출력 | donors 페이지에 over30/over300 화면 목록 + 국세청 추출만 (보고서 양식 출력 없음) |

우선순위 제안: 현 프로젝트의 주 사용자가 (예비)후보자·후원회라면 **2, 3, 5, 6, 9**가 우선. **1, 7, 8**은 정당 계열(party) orgType 지원을 확대할 때.

---

## 🟢 의도적 미반영 (웹앱 구조상 대체 — 조치 불요)

- **정치자금공개시스템 전송** (ACCBOOKSEND 테이블, "전송완료" 루틴, 델파이 로그인) — 선관위 내부망 연동. export-sqlite로 공식 프로그램에 옮겨 전송하는 흐름으로 대체
- **.txt 결산파일 생성/취합** (TfrmCreateFile "중앙당(시도당)에 제출파일 생성", TfrmCollectFile) — aggregate 페이지가 DB 직접 취합으로 대체 (.txt 포맷 호환은 없음)
- **자료전환** (DataConv.exe, BDE 5.0) — 구버전(1.x) 데이터 마이그레이션 전용
- **공통코드 엑셀 업/다운로드 + CODE_DATE 버전관리** — Supabase 중앙 관리로 대체
- **웹캠 영수증 촬영** (TfrmCameraDialog) — evidence-file 업로드로 대체
- **비밀번호 힌트** (ORGAN.HINT1/2) — Supabase Auth로 대체

---

## ✅ 일치 확인된 항목 (안심 포인트)

- **복구허용건수 100건** (CS_ID=18 CV_ETC=100 ↔ use-undo MAX_UNDO=100, 메시지까지 동일)
- **지출결의서 동시출력 10건** (CS_ID=19 CV_ETC=10 ↔ resolution MAX_EXCEL_ITEMS=10)
- **익명 1회 한도 10만원** (CS_ID=14 CV_ID=117) — 단, P1 버그로 적용 과목이 틀림
- **결산 검증**: "총괄표 잔액 vs 재산 현금및예금" 대사 (공식 문자열과 동일 로직, settlement 페이지)
- **거래처 주소이력** (CUSTOMER_ADDR ↔ customer_addr + AddressHistoryDialog)
- **증빙 미첨부사유** (income/expense/document-register/batch-import)
- **국세청 자료추출** (donors handleExportNts)
- **지출방법 8종** (118 계좌입금/119 카드/120 현금/121 미지급/122 기타/583 수표/584 신용카드/585 체크카드)
- **위법비용 지출유형** (v2.6 추가 CV 602~606 ↔ expense-types.ts "위법비용", 미보전 처리)
- **수시 수입·지출보고서** (income-expense-report — 문서번호·보고자·귀중 형식)
- **회계보고서 서식 커버리지** (HWPX 7/8/14/17/20/22-1~4/23-1~11/37-2/38/43/44 + 표지·과목별 장부 엑셀 일괄출력)
- **백업/복구 PFund2 호환** (export/import-sqlite ↔ Fund_Master/Data_1/Data_2 + 백업파일명 "정치자금【기관명】보관자료_일시" 규약)
- **일괄등록 검증 루틴** (공식 오류코드 — 계정없음/과목오류/자리수 초과 등 — 과 동등한 사전검증)

## 부록: 공식 CODESET 20종

0 공통코드버전일자 / 1 총괄계정 / 2 계정구분 / 3 계정과목 / 4 경비구분 / 5 재산구분 / 6 사용기관 / 7 수입지출처구분 / 8 시도구분 / 9 영수증첨부여부 / 10 후보자계정 / 11 후보자과목 / 12 후원회과목 / 13 기부제한액 / 14 익명후원금 1회 한도액 / 15 전년이월팝업(01-01~01-07) / 16 지출방법 / 17 지출유형 / 18 복구허용건수(100) / 19 지출결의서 동시 출력 제한수(10)
