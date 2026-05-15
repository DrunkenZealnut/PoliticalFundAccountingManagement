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
