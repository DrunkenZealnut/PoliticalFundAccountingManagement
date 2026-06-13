# reimbursement-claim-amount Gap Analysis

> **Feature**: reimbursement-claim-amount (보전청구액 claim_amt)
> **Date**: 2026-06-13
> **Branch**: `feature/reimbursement-document-list`
> **Agent**: bkit:gap-detector
> **Design**: `docs/02-design/features/reimbursement-claim-amount.design.md`

## Match Rate: 99%

## 1. 요약

설계 문서(§3~§8)와 Plan(FR-01~FR-06)의 모든 요구사항이 실제 구현과 1:1 정합. 핵심 설계 원칙 6가지(읽기 fallback / 게이트 불변 / 회계 미오염 / claimAmount import 격리 / export strip / 빈값=NULL)가 전부 코드로 실증. 누락 0건, 회계 오염 0건. 발견된 차이는 모두 설계보다 **우아한 구현**이거나 의도된 out-of-scope이며, Gap은 Low 2건뿐(둘 다 설계가 사전 허용한 "선택" 항목).

**회계 경로 미오염 실증**: `claimAmount`/`claim-amount`를 import하는 파일은 정확히 4곳 — `reimbursement-aggregator.ts`, `reimbursement-doclist-builder.ts`, `dashboard/reimbursement/page.tsx`, 자기 테스트. 회계 빌더(`income-ledger-builder`, `report-summary-builder`, `election-expense-summary-builder`)·`settlement-calc`·`excel-template/*` 전부 claim을 일절 import하지 않고 `acc_amt`만 사용.

## 2. 설계 항목별 정합표

| 설계 섹션 | 항목 | 구현 위치 | 정합 |
|---|---|---|:---:|
| §3.1 | 마이그레이션 015 (acc_book·bak claim_amt BIGINT, COMMENT) | `scripts/015_add_claim_amt.sql` | ✅ |
| §3.2 | types acc_book·bak Row claim_amt | `types/database.ts` (양 Row) | ✅ |
| §3.3 | claimAmount SSOT (`claim_amt ?? acc_amt`) + import 금지 주석 | `lib/accounting/claim-amount.ts` | ✅ |
| §3.4 | AccBookRow·DoclistInputRow·ReimbRow claim_amt | aggregator·doclist-builder·page.tsx | ✅ |
| §4.1 | aggregator 합산 `claimAmount(r)` + 게이트 `acc_amt<=0 continue` 유지 | `reimbursement-aggregator.ts` | ✅ |
| §4.1 | Excel 보전청구서 자동 전환 (ClaimAmounts 소비) | `excel-template/reimbursement-claim-form.ts` | ✅ |
| §4.2 | doclist 소계·셀 `claimAmount(r)` + 필터 `acc_amt>0` 유지 | `reimbursement-doclist-builder.ts` | ✅ |
| §4.3 | select +claim_amt (서식43·doclist·aggregate·화면) | 4개 경로 | ✅ |
| §4.4 | 회계 경로 acc_amt 불변 (claim 미import) | income-ledger/report-summary/election-expense/settlement-calc | ✅ |
| §4.5 | export-sqlite strip claim_amt (양 파이프라인) | `export-sqlite/route.ts` | ✅ |
| §5.1 | claimEdits / effClaim / 빈값→null / checkedTotal=청구액·totalAmt=실지출 | `reimbursement/page.tsx` | ✅ |
| §5.2 | LedgerTable claimEditor opt-in (부담 탭 미전달), colSpan 동적, placeholder=지출액 | `reimbursement/page.tsx` | ✅ |
| §6 | 청구액 0 저장(빈칸 구분), 음수/비숫자 sanitize | page.tsx + 테스트 | ✅ |
| §8 | claimAmount/aggregator/doclist/strip/회귀/교차 테스트 | 각 `.test.ts` | ✅ |

## 3. FR 추적 (FR-01~FR-06)

| FR | 요구 | 상태 |
|---|---|:---:|
| FR-01 | claim_amt 신규 컬럼, NULL→acc_amt | ✅ |
| FR-02 | 보전 화면 인라인 편집, 빈값=NULL | ✅ |
| FR-03 | 보전 출력 4경로 claimAmount SSOT 단일 경유 | ✅ |
| FR-04 | 회계/보고서/지출부/정산 acc_amt 불변 | ✅ (claim 미import grep 실증) |
| FR-05 | 게이트 `acc_amt>0` 유지(청구 0/NULL 무손실) | ✅ (claim_amt=0→rowCount 1·합계 0 테스트) |
| FR-06 | export-sqlite strip → PFund2 호환 | ✅ (strip 테스트) |

## 4. Gap 목록 (심각도순)

| # | 심각도 | 항목 | 평가 |
|---|:---:|---|---|
| 1 | Low | acc_book_bak insert에 claim_amt 명시 추가 | 설계 §6에서 **"선택(누락해도 NULL 무해)"** 으로 사전 허용 — 실질 Gap 아님 |
| 2 | Low | 음수 방지 CHECK 제약 | 설계 §3.1 "(선택)" 주석 처리와 구현 일치(둘 다 미적용, 앱단 sanitize 대체) |

**과구현/불일치: 없음.** tfoot colSpan은 설계 "+1 보정" 기술을 구현이 `colCount-5` 동적 식으로 더 견고하게 처리(동작 동일, 개선).

## 5. 강점 / 리스크

**강점**
- 회계 미오염이 **import 격리로 구조적 보장** — claim 사용처 4곳 전수 확인, 회계 빌더 0건.
- 전환 최소 지점: aggregator 1곳 전환으로 서식43·Excel·aggregate API 3출력 동시 반영(Excel은 `ClaimAmounts` 소비로 자동 추종).
- 테스트가 핵심 엣지(claim 우선 / NULL fallback / 0 존중 / 게이트 유지) 명시 커버.
- export strip early-return을 `acc_time` OR `claim_amt` 양쪽 검사로 갱신 — 백업 abort 회귀 방지.

**리스크(차단 아님)**
- 마이그레이션 015 **수동 적용 선행 필수**(코드 의존). 미적용 시 select의 claim_amt 부재로 런타임 오류 — 배포 절차 주의.
- 부담비용(서식44)은 의도적 out-of-scope(Plan §2.2) — 청구액 미반영이 정상.
- `reimbursement/page.tsx`의 expCum 재할당 린트 2건은 **main 기존 이슈**(본 기능 무관).

## 6. 결론

**Match Rate 99% (≥90% 충족).** 설계-구현 정합 완전, 핵심 6원칙 모두 실증(회계 미오염 포함). Gap 2건은 설계가 사전 허용한 "선택" 항목으로 실질 결함 아님.

- **다음 단계**: `/pdca report reimbursement-claim-amount`
- **배포 전 필수**: 마이그레이션 015 Supabase 수동 적용 + 한글 시각 검수(청구액 인라인 편집·서식 반영)
