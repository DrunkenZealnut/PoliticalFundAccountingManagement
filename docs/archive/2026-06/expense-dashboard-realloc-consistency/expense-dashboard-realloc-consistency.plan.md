# 지출내역 자금원별 충당 현황 ↔ 재배분 금액 정합 (expense-dashboard-realloc-consistency) Planning Document

> **Summary**: 지출내역 관리 페이지(`dashboard/expense`) 상단 **자금원별 충당 현황 패널**이 보고서·총괄표의 금액과 다르게 나오는 문제. 후보자(예 2026 오준석후보)는 재배분 후 자금원별 잔액이 0(또는 ≥0)이 맞는데, 패널은 일부 자금원을 **마이너스(과지출)**로 표시한다. 조사 결과: 패널은 `buildFundingAllocation(allRows)`로 **재배분 없는 raw 집계**(자금원별 `available = 수입 − 지출`)를 쓰는 반면, 보고서/총괄표·수입지출부·.db는 모두 `buildAdjustedAccBook`(Pass0→1→2 재배분)을 쓴다 — 재배분이 과지출 자금원의 초과분을 다른 자금원으로 옮겨 per-source를 ≥0으로 만들기 때문에, 패널(raw)만 음수가 남는다. 전체 잔액(`summary.balance` = 총수입−총지출)은 총액 기준이라 정상(재배분은 총액 불변). 해법: 패널 집계를 **재배분된 행 기준**으로 전환(`buildFundingAllocation(buildAdjustedAccBook(allRows))`) → 패널이 보고서와 동일 금액.
>
> **Project**: PoliticalFundAccountingManagement
> **Version**: 0.21.x → (ship 시 확정)
> **Author**: Claude · **Date**: 2026-06-23 · **Status**: Draft
> **Related**: 재배분 SSOT `lib/accounting/adjusted-ledger.ts`(`buildAdjustedAccBook`). 패널 집계 `lib/accounting/funding-allocation.ts`(`buildFundingAllocation`). 패널 UI `components/dashboard/FundingAllocationPanel.tsx`·`FundingDraftPreview.tsx`. 호스트 `dashboard/expense/page.tsx:499`. 메모 [[income-expense-book-funding-realloc]] · [[official-fund-data-income-classification]] · [[negative-refund-rows-in-aggregation]].

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 지출내역 상단 자금원별 충당 현황 패널의 금액이 보고서·총괄표와 달라, 후보자 잔액이 0(정상)인데도 일부 자금원이 마이너스로 보여 사용자가 데이터가 틀렸다고 오인한다. |
| **Solution** | 패널 집계를 보고서와 **같은 재배분 SSOT**(`buildAdjustedAccBook`)로 돌린 행에 적용 — `buildFundingAllocation(buildAdjustedAccBook(allRows))`. 재배분이 자금원별 잔액을 ≥0으로 맞추므로 패널이 보고서와 일치. |
| **Function/UX Effect** | 지출내역 화면의 자금원별 금액 = 보고서·수입지출부·.db 금액. "잔액 0인데 패널은 마이너스" 모순 제거. 화면 어디서 보든 같은 숫자. |
| **Core Value** | "원본 불변 + 보고 시점 재배분" SSOT를 **지출내역 화면까지 확장** — 모든 화면/산출물이 같은 재배분 금액을 보여주는 일관성. |

---

## 1. Overview

### 1.1 현황 (조사로 확정)
- **전체 잔액(정상)**: `expense/page.tsx:138~140` `summary = {income: Σ수입, expense: Σ지출, balance: 수입−지출}`. 총액 기준 → 재배분 무관, 균형 org면 0. **버그 아님.**
- **자금원별 충당 현황 패널(불일치 원인)**: `:499~506` `buildFundingAllocation(allRows)`. `funding-allocation.ts`가 자금원별 `available = income − expense`(raw), `overspent = available < 0`을 계산 — **재배분 미적용**(주석 line 14~17: "법정 우선순위 충당 재배분은 결산 영역, 본 모듈은 단순 집계"). 후보자 지출은 `acc_sec_cd`(원래 충당 자금원) 기준으로 집계되므로, 입력 시점에 과지출된 자금원이 음수로 남는다.
- **보고서/총괄표·수입지출부·.db**: 모두 `buildAdjustedAccBook`(=Pass0→1→2) 재배분 적용 → 과지출 자금원의 초과분이 잔여 자금원으로 이동 → per-source `available ≥ 0`([[income-expense-book-funding-realloc]]: 재배분은 자금원 단위 ≥0 보장). 그래서 보고서엔 음수가 없다.
- **결론**: 패널(raw)만 재배분을 안 거쳐 보고서와 갈린다. 전체 잔액은 일치하지만 자금원별 분해가 다르다.

### 1.2 영향 범위
- 후보자(자금원 82~85) org 한정 — 비후보자는 `buildAdjustedAccBook`이 raw 반환이라 변화 없음. 패널은 이미 "후보자 전용"(`:545`).
- `FundingDraftPreview.tsx`(지출 입력 시 자금원 추천)도 동일 `available`(raw)을 사용 → 함께 검토 필요.

---

## 2. Scope

### 2.1 In Scope
- [ ] **패널 집계를 재배분 기준으로 전환**: `expense/page.tsx`의 `fundingAllocation`을 `buildFundingAllocation(buildAdjustedAccBook(allRows), { getName, applyNegativeIncomeRule: false })`로 변경(재배분 행은 Pass0 이미 적용 → 음수수입 보정 중복 방지). 결과 per-source가 보고서와 동일.
- [ ] **정합 검증**: 패널 `totalIncome/totalExpense/totalAvailable` 및 per-source 금액 == 총괄표(`income-expense-report-summary`/reports 총괄표)와 일치하는 회귀 테스트(분할/이동 실제 발생 픽스처, [[parity-test-must-exercise-divergence-condition]]).
- [ ] **`allRows` fetch 필드 점검**: `buildAdjustedAccBook` 입력 요건(acc_book_id·incm_sec_cd·acc_sec_cd·item_sec_cd·acc_amt·acc_date) 충족 확인(현재 select에 모두 포함, `:135/169`).

### 2.2 Out of Scope (결정 필요로 이동 가능)
- **전체 summary(수입/지출/잔액 헤더)**: 총액 기준이라 정상 — 변경 없음.
- **재배분 알고리즘**: 불변.
- **비후보자 패널**: 변화 없음.

### 2.3 결정 (확정)
1. **패널 의미 전환 vs 병기** → **(A) 재배분 후 값으로 전환** 확정 (사용자 결정 2026-06-23, AskUserQuestion). 패널을 재배분 후 값으로 전환 → 보고서와 일치, 음수 제거. raw 입력 가이드 의미는 약화 수용(재배분 자동이라 사실상 불필요).
2. **`FundingDraftPreview`(입력 추천)**: (A) 전환에 맞춰 검토 필요 — 재배분 후 available 기준으로 동작/추천이 자연스러운지 Design에서 확인(과지출 음수가 사라지므로 "여유 자금원 권장" 로직의 트리거가 달라짐). 입력 폼의 즉시 가이드 목적이 깨지지 않게 조정.
3. **명칭/라벨**: 패널 제목·툴팁에 "재배분 반영" 명시(오인 방지) — 권장(저비용).

---

## 3. Requirements

### 3.1 Functional Requirements
| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | 후보자 지출내역 패널의 자금원별 금액이 재배분 후 값(보고서와 동일)으로 표시 | High | Pending |
| FR-02 | 재배분으로 자금원별 `available ≥ 0` — "잔액 0인데 마이너스" 모순 제거 | High | Pending |
| FR-03 | 패널 합계·per-source == 총괄표(income-expense-report-summary) 정합 회귀 테스트 | High | Pending |
| FR-04 | 비후보자·전체 summary 헤더 무변경(회귀 0) | High | Pending |

### 3.2 Non-Functional
- **SSOT 일원화**: 패널·보고서·수입지출부·.db가 모두 `buildAdjustedAccBook` 경유.
- **성능**: 패널은 `allRows`에 대해 `buildAdjustedAccBook` 1회 추가(O(n log n)) — 무시 가능.

---

## 4. Design Sketch (구현 방향)
```
// expense/page.tsx
const fundingAllocation = useMemo(() => {
  const adjusted = buildAdjustedAccBook(allRows as Record<string,unknown>[]); // 후보자면 재배분, 아니면 raw
  return buildFundingAllocation(adjusted as AccBookRow[], { getName, applyNegativeIncomeRule: false });
}, [allRows, getName]);
```
- `buildFundingAllocation`은 무수정(입력 행만 재배분된 것으로 교체).
- `applyNegativeIncomeRule:false` — Pass0가 이미 음수수입을 보정했으므로 중복 방지([[negative-refund-rows-in-aggregation]] 정합 유지).
- (결정 2.3-1이 C면) raw/재배분 두 결과를 모두 만들어 패널에 병기.

---

## 5. Risks & Mitigations
| Risk | Mitigation |
|------|-----------|
| `buildLedgerRows`(보고서 일부 경로) vs `buildAdjustedAccBook`(패널) 미세 차이 | 보고서·export 모두 `buildAdjustedAccBook` 사용 확인됨 → 동일 SSOT. 총괄표와 per-source 정합 테스트로 고정 |
| Pass0 이중 적용(음수수입) | `applyNegativeIncomeRule:false`로 방지 + 테스트 |
| 입력 가이드(raw) 의미 상실 | 결정 2.3에서 병기(C) 또는 라벨 명시로 보완 |
| allRows fetch 필드 부족 | 현재 select에 필요한 필드 모두 포함 — 점검만 |

---

## 6. Verification Plan
1. 분할/이동 발생 후보자 픽스처로: 패널 per-source `available ≥ 0`, 합계·per-source == 총괄표.
2. 본 사례(2026 오준석후보) 데이터로 패널 음수 사라지고 보고서와 동일한지 수동 확인.
3. 비후보자/전체 헤더 무변경 회귀.

---

## 7. Next
- `/pdca design expense-dashboard-realloc-consistency` — 2.3 결정(전환 vs 병기, DraftPreview, 라벨) 확정.
- 범위가 작으면 design 생략하고 곧장 구현 후 `/pdca analyze`.
