# 2026년 5월 아카이브

PDCA 사이클 완료 후 아카이브된 기능 목록.

## Features

### reimbursement-claim-form (선거비용 보전청구서 제작 페이지)

- **기간**: 2026-05-01 ~ 2026-05-06 (6일)
- **Match Rate**: 91% (Match 36 / Minor 6 / Major 1 / Critical 0)
- **PR**: [#19](https://github.com/DrunkenZealnut/PoliticalFundAccountingManagement/pull/19)
- **근거**: 공직선거법 §122의2, 공직선거관리규칙 §51의3
- **청구기한**: 2026-06-15(월)

문서:
- [Plan](reimbursement-claim-form/reimbursement-claim-form.plan.md)
- [Design](reimbursement-claim-form/reimbursement-claim-form.design.md)
- [Analysis](reimbursement-claim-form/reimbursement-claim-form.analysis.md)
- [Report](reimbursement-claim-form/reimbursement-claim-form.report.md)

### official-program-parity (선관위 PFund2 동일성 보장)

- **기간**: 2026-05-14 ~ 2026-05-15 (1일, 단일 세션)
- **브랜치**: `feat/official-program-parity`
- **Match Rate**: 96.5% (Iter 0: 91.3% → Iter 1: 96.5%, +5.2%p)
- **Iteration**: 1회 (PARITY 코드, conflictPolicy 분기, DB import 모달, 응답 포맷 표준화)
- **테스트**: 단위 40건 + 통합/회귀 17건 = 57건 통과
- **목적**: 결산/제출문서/DB저장/DB불러오기 4개 워크플로우의 산출물을 선관위 PFund2.exe와 1:1 동일하게 보장
- **핵심 산출물**:
  - SSOT 모듈 4종: `settlement-calc`, `organ-pair`, `code-mapping`(reverse 보강), `submission-forms`
  - 신규 모듈: `parity-errors` (PARITY-001~006 표준화)
  - sqlite-seed: `codeset.json`(20), `codevalue.json`(293), `acc_rel2.json`
  - API: `POST /api/system/recompute-settlement` 신규, export/import-sqlite 보강
  - UI: `forms` parityChecked 뱃지, `submit` DB import 모달, `income-expense-report`·`aggregate` 보정 알림
- **잔여 갭 (별도 PDCA로 분기)**: 자금출처 충당 알고리즘 (PFund2 reverse-engineering 필요), Rate limiting, Playwright E2E
- **사후 정리**: `/simplify` 1회 실행 — LoC 약 180줄 감소, SSOT 강화 (settlement-calc → applyCorrections 재사용, organ-pair → makeOrganRow 추출, submit → useReducer)

문서:
- [Plan](official-program-parity/official-program-parity.plan.md)
- [Design](official-program-parity/official-program-parity.design.md)
- [Do Guide](official-program-parity/official-program-parity.do.md)
- [Analysis](official-program-parity/official-program-parity.analysis.md)
- [Report](official-program-parity/official-program-parity.report.md)

### db-export-login-id (PFund2 로그인/페어 organ/Fund_Data_N 호환)

- **기간**: 2026-05-15 ~ 2026-05-16 (2일)
- **브랜치**: `feat/official-program-parity`
- **Match Rate**: 94% (Good) — Plan/Design/Do/Check 본 사이클
- **후속 PR**: 8개 (#22~#32) — 실 PFund2 환경 실증으로 발견된 호환성 결함 fix
- **총 PR**: 12개 (#21~#32)
- **테스트**: 270 → 295건 (+25건, 회귀 방지)
- **목적**: 우리 export `.db`가 PFund2 [자료 복구] + 직접 교체 + 재로그인 + 데이터 표시까지 전 과정 호환되도록 보장
- **핵심 산출물**:
  - 마이그레이션: `010_add_candidate_columns.sql` (organ에 candidate_* 14개)
  - 신규 모듈: `pfund2-constants.ts` (익명 customer -999, 4가지 mode, 파일명 헬퍼)
  - 신규 UI: `/dashboard/organ` (자격증명 + 14개 후보자 정보 입력)
  - 신규 에러: `PARITY-007 ORGAN_CREDENTIALS_MISSING`
  - export-sqlite 4가지 mode: full / master / data1 / data2 (각각 Fund_Master/Fund_Data_N.db 호환)
  - export-sqlite 회계연도 필터(`year=YYYY`)
  - import-sqlite 페어 ORGAN 분리 매핑 (후보자→candidate_*)
  - ALARM/COL_ORGAN PK 충돌 해소 + ACCBOOKSEND 격리
  - PFund2 표준 익명 customer (CUST_ID=-999) 자동 보장
- **부가 fix**: customer-batch 컬럼 매핑(E~H 어긋남), customer 페이지 일괄등록 후 표시, submit 미리보기 카운트
- **실증 검증**: 실 PFund2 v5 환경에서 customer 38건 + 거래 56건 정상 표시 확인 ✅
- **잔여 갭 (별도 PDCA로 분기 가능)**: export-sqlite Integration 테스트, OrganInfoPage Component 테스트(RTL), PFund2 풀세트 ZIP 다운로드

문서:
- [Plan](db-export-login-id/db-export-login-id.plan.md)
- [Design](db-export-login-id/db-export-login-id.design.md)
- [Analysis](db-export-login-id/db-export-login-id.analysis.md)
- [Report](db-export-login-id/db-export-login-id.report.md)
