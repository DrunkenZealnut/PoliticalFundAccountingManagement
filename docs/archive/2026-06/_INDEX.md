# PDCA Archive — 2026-06

완료된 PDCA 사이클 문서 보관소.

| Feature | Match Rate | 완료일 | 문서 | 비고 |
|---------|:----------:|--------|------|------|
| [multi-evidence-file](multi-evidence-file/) | 100% | 2026-06-01 | plan · design · analysis · report | 지출 증빙파일 다중 첨부·미리보기·Storage 경로 체계화 (PR #43 머지) |
| [dashboard-org-differentiation](dashboard-org-differentiation/) | 97% | 2026-06-01 | plan · design · analysis · report | 메인 대시보드 orgType별(후보자/후원회) 요약카드·차트 차별화 |
| [income-account-ledger-hwpx](income-account-ledger-hwpx/) | 99% | 2026-06-08 | plan · design · analysis · report | 수입계정별 회계장부(정치자금 수입·지출부) 데이터 채움 HWPX 생성 — 계정·과목별 수입·지출 통합·잔액 자동계산 (PR #58 머지, v0.4.0.0) |
| [candidate-accounting-report-hwpx](candidate-accounting-report-hwpx/) | 99% | 2026-06-08 | plan · design · analysis · report | (예비)후보자 회계보고서 22-1(수입·지출보고서)·22-3(재산명세서)·22-4(수입·지출부) 데이터 채움 HWPX 생성 — 자금원 구분 집계·estate 명세·단일표 c0 rowSpan 동적 (PR #59 머지, v0.5.0.0) |
| [expense-funding-allocation](expense-funding-allocation/) | 96% | 2026-06-08 | plan · design · analysis · report | 지출내역관리 자금원별 충당 현황 패널(후보자 전용) — 자금원별 수입/지출/가용잔액 집계, 초과충당 경고톤, 결산(computeBalances) 총액 정합. 빌더 순수함수+테스트 10건, 추가 DB 왕복 0 (미커밋) |
| [acc-time-input](acc-time-input/) | 100% | 2026-06-09 | plan · design · analysis · report | 수입·지출·수기입력에 거래 시각(분 단위) 입력 — acc_date(YYYYMMDD) 불변 + acc_time(HHmm, NULL) 별도 컬럼으로 선관위 PFund2/SQLite(ACC_DATE CHAR(8)) 호환 유지. 목록은 날짜만 표시, 정렬 acc_date→acc_time(nullsFirst)→acc_sort_num. 시각 변환 헬퍼(lib/date-utils, 범위검증)+테스트 12건. CodeRabbit 3건(범위검증·DB CHECK 제약·테스트 trim) 반영 (PR #61 머지, v0.7.0.0) |
| [election-expense-summary-hwpx](election-expense-summary-hwpx/) | 99% | 2026-06-10 | plan · design · analysis · report | (예비)후보자 회계보고서 22-2(선거비용 지출내역 집계표) 데이터 채움 HWPX 생성 — 회계보고서 4/4 서식 완결. 지출 중 선거비용만 자금원 4분류 집계, 22-1과 funding-source·classifyExpenseCategory SSOT 공유로 22-1 선거비용합==22-2합 보장(교차검증 TC-7), 기타 자금원→보조금외 흡수. 옵션 A(사무소 단일 집계, total=office·branch=0). 고정 셀 토큰 치환 15토큰. 신규 빌더 순수함수+테스트 10건. CodeRabbit Major 1건(report.md 자금원 코드 매핑 82↔84 정정, 코드는 정상) 반영 (PR #62 머지, v0.8.0.0) |
