# 지출내역관리 — 수입원별 충당 현황 Design Document

> **Plan**: `docs/01-plan/features/expense-funding-allocation.plan.md`
> **Project**: PoliticalFundAccountingManagement
> **Version**: 0.1.0
> **Author**: Claude
> **Date**: 2026-06-08
> **Status**: Draft

---

## 0. 설계 결정 (Open Questions 확정)

| # | 질문 | 결정 | 근거 |
|---|------|------|------|
| Q1 | 데이터 확보 방식 | **expense 페이지가 이미 조회하는 org 전체 행(수입+지출) 재활용** (`page.tsx` L120-125) — 추가 DB 왕복 0 | 페이지가 summary 계산용으로 전체 행을 이미 fetch 중. 행 배열을 state 보존만 하면 됨 (NFR-02) |
| Q2 | 표시/연동 수준 | **상단 현황 패널만** (입력폼 실시간 연동·차단 없음) | 사용자 선택. "가늠" 목적은 패널만으로 충족, 변경 범위 최소 |
| Q3 | 표시 범위 | **org 전체 누적 고정** (날짜/계정 필터 무관), "전체 기준" 배지 | 가용잔액은 본질적으로 누적 개념. 기간 필터 시 무의미 |
| Q4 | 초과충당(가용잔액 음수) | **경고 톤(빨강+⚠) 표시만**, 입력 차단 없음 | 사용자 선택. 실제 초과지출이 회계상 존재할 수 있어 판단은 사용자 몫 |
| Q5 | 충당 추정 방식 | **자금원 코드(`acc_sec_cd`) 기준 단순 집계** (법정 우선순위 재배분 추정 안 함) | 후보자 지출은 `acc_sec_cd`가 곧 자금원(82/83/84/85)이라 직접 집계가 정확. 우선순위 재배분은 결산(submit) 영역(YAGNI) |

**핵심 데이터 사실 (검증 완료)**: 후보자 지출 입력의 계정 드롭다운 `getAccounts(orgSecCd, 2)`는 **자금원 계정(82=보조금·83=보조금외·84=후보자자산·85=후원회기부금)**을 반환한다(`use-code-values.ts` L111-125, `acc_rel` 필터). 따라서 지출 행에도 자금원이 매겨져 있어 `acc_sec_cd`로 자금원별 수입·지출을 직접 합산할 수 있다. 선거비용/선거비용외는 과목 `item_sec_cd` 코드명으로 구분(`ledger-summary.ts` L131, SSOT).

---

## 1. Overview

지출내역관리 페이지(`dashboard/expense`) 상단에 **자금원별 충당 현황 패널**을 추가한다. 각 자금원(후보자자산/후원회기부금/보조금/보조금외/기타)에 대해 **수입 총액 · 지출 총액(선거비용/선거비용외) · 가용잔액**을 org 전체 누적 기준으로 보여준다. 회계 담당자는 지출을 입력·검토하면서 "어느 수입계정에 여력이 남았는지" 즉시 판단한다.

순수 집계 빌더(`funding-allocation.ts`) + 표시 컴포넌트(`FundingAllocationPanel`) + 페이지 통합으로 구성하며, **후보자(candidate) orgType 전용**이다.

---

## 2. Architecture & Data Flow

```text
expense/page.tsx
  ├─ (기존) fetch org 전체 acc_book 행 [수입+지출]  ← L120-125, summary 계산용
  │     └─ allRows: AccBookRow[]  (★ 신규: state로 보존)
  │
  ├─ buildFundingAllocation(allRows, { getName })   ← 신규 순수 함수
  │     ├─ applyCorrections (마이너스 수입 보정, 결산 정합)
  │     ├─ classifyFundingSource(acc_sec_cd, getName(acc_sec_cd))  자금원 그룹
  │     └─ item_sec_cd 코드명 === "선거비용" → 선거비용/외 분리
  │     → FundingAllocation { rows[], totals }
  │
  └─ {orgType === "candidate" && <FundingAllocationPanel allocation={...} />}
        (LedgerSummaryHeader 아래 배치, "전체 기준" 배지)
```

데이터 추가 조회 없음. 빌더는 React/Next 비의존 순수 함수.

---

## 3. Module Design

### 3.1 `lib/accounting/funding-allocation.ts` (신규, 순수 함수)

```typescript
import { classifyFundingSource, type FundingSource } from "./funding-source";
import { applyCorrections, type AccBookRow } from "./settlement-calc";

/** 과목 기준 선거비용 판별 — ledger-summary.ts와 동일 SSOT */
const ELECTION_ITEM_NAME = "선거비용";

/** 자금원별 충당 현황 1행 */
export interface FundingAllocationRow {
  source: FundingSource;          // 후보자자산|후원회기부금|보조금|보조금외|기타
  income: number;                 // 자금원 수입 총액 (incm_sec_cd=1)
  electionExpense: number;        // 선거비용 지출 (item 코드명="선거비용")
  nonElectionExpense: number;     // 선거비용외 지출
  expense: number;                // 지출 합계 = election + nonElection
  available: number;              // 가용잔액 = income - expense
  overspent: boolean;             // available < 0 (초과충당)
  incomeRatio: number;            // 전체 수입 대비 (막대 시각화용, 0~1)
}

export interface FundingAllocation {
  rows: FundingAllocationRow[];   // FUNDING_ORDER 고정 순서, 데이터 없는 자금원 제외
  totalIncome: number;
  totalExpense: number;
  totalAvailable: number;         // totalIncome - totalExpense
}

export interface BuildFundingAllocationOpts {
  getName: (cvId: number) => string;
  /** 마이너스 수입 보정 적용 (결산 정합). 기본 true */
  applyNegativeIncomeRule?: boolean;
}

export function buildFundingAllocation(
  rows: readonly AccBookRow[],
  opts: BuildFundingAllocationOpts,
): FundingAllocation;
```

**표시 순서 상수**:
```typescript
const FUNDING_ORDER: FundingSource[] = [
  "후보자자산", "후원회기부금", "보조금", "보조금외", "기타",
];
```

**알고리즘**:
1. `applyCorrections(rows, { applyNegativeIncomeRule })` — 마이너스 수입→지출 보정(원본 불변).
2. 행별로 `source = classifyFundingSource(r.acc_sec_cd, getName(r.acc_sec_cd))`로 그룹.
3. `incm_sec_cd===1` → `income += amt`; `===2` → `expense += amt`, 과목명 분기로 election/nonElection 누적.
4. `available = income - expense`, `overspent = available < 0`.
5. `totalIncome = Σincome` → 각 행 `incomeRatio = income / totalIncome` (총수입 0이면 0).
6. `rows`는 `FUNDING_ORDER` 순서로 정렬, **수입·지출 모두 0인 자금원은 제외**.

### 3.2 `components/dashboard/FundingAllocationPanel.tsx` (신규, 클라이언트)

```typescript
interface Props {
  allocation: FundingAllocation;
  loading?: boolean;
}
```

- `Card`/`CardContent` 래퍼, 헤더 "자금원별 충당 현황" + 우측 "전체 기준" 배지.
- 자금원 행마다: 자금원명 · 수입 비율 막대 · `수입 / 지출 / 가용잔액`.
- 가용잔액 `overspent`이면 `text-red-600` + `⚠`, 양수면 `text-green-600`(잔액 톤). 금액 포맷 `toLocaleString("ko-KR")`.
- 색상·간격은 `LedgerSummaryHeader`/DESIGN.md 컨벤션 일치(수입 파랑, 지출 빨강, 잔액 초록, 경고 amber/red).
- 하단 합계 행: 총수입/총지출/총가용.
- `HelpTooltip`로 "가용잔액 = 수입−지출, 어느 자금원에 여력이 남았는지" 설명(초보자 모드).
- **면책 문구**: "추정치이며 보전·확정은 결산 기준" 소형 캡션(Plan §5-3).

### 3.3 `dashboard/expense/page.tsx` (수정)

- 기존 org 전체 행 조회 결과(L120-125)를 `allRows` state로 보존.
- `useCodeValues().getName`, `useAuthStore().orgType` 사용.
- `useMemo`로 `buildFundingAllocation(allRows, { getName })` 계산.
- `orgType === "candidate"`일 때만 `<FundingAllocationPanel>` 렌더(`LedgerSummaryHeader` 아래).
- 기존 지출 테이블/필터/summary 로직은 변경 없음.

---

## 4. Type Compatibility

`AccBookRow`(settlement-calc)는 `incm_sec_cd, acc_sec_cd, item_sec_cd, acc_amt, acc_date` 보유 → 빌더 입력으로 충분. 페이지의 acc_book 행을 `AccBookRow[]`로 매핑(누락 필드는 기본값). `applyCorrections`/`classifyFundingSource`를 재사용해 결산 SSOT와 정합.

---

## 5. Edge Cases

| 케이스 | 처리 |
|--------|------|
| 수입 0, 지출만 있는 자금원 | `available` 음수 → `overspent` 경고 톤 표시 (입력 차단 X) |
| 마이너스 수입 행 | `applyCorrections`로 지출 전환 후 집계 (결산 정합) |
| 자금원 미상(82/83/84/85·명칭 매칭 실패) | `classifyFundingSource` → "기타" 버킷 |
| 총수입 0 (데이터 없음) | `incomeRatio=0`, 패널은 빈 상태 메시지 또는 미표시 |
| 후보자 외 orgType | 패널 미렌더(자금원·보전은 후보자 개념) |
| 전 자금원 데이터 없음 | `rows=[]` → 패널 "표시할 자금원이 없습니다" |

---

## 6. Test Plan

`lib/accounting/funding-allocation.test.ts` (Vitest):
- 자금원 분류·집계: 82/83/84/85 각각 수입/지출 정확 합산.
- 가용잔액: `income - expense` 계산, 음수 시 `overspent=true`.
- 선거비용/외 분리: `item_sec_cd` 코드명 기준 분배.
- 마이너스 수입 보정: 수입 음수 → 지출 전환 후 `available` 검증.
- 정렬·필터: `FUNDING_ORDER` 순서, 0 자금원 제외.
- 빈 입력: `rows=[]`, totals=0.
- **결산 정합 회귀**: 동일 행으로 `Σincome`/`Σexpense`가 `computeBalances`의 `incomeTotal`/`expenseTotal`과 일치.

`FundingAllocationPanel.test.tsx` (선택): 음수 가용잔액 경고 톤 렌더, 합계 표시.

---

## 7. Implementation Order

1. `funding-allocation.ts` 빌더 + 타입 (순수 함수).
2. `funding-allocation.test.ts` 단위 테스트 (TDD 권장).
3. `FundingAllocationPanel.tsx` UI 컴포넌트.
4. `expense/page.tsx` 통합 (allRows state 보존 + orgType 분기 렌더).
5. 결산 정합 회귀 테스트 + lint/build.
6. 도움말 텍스트(HELP_TEXTS) + 면책 캡션.

---

## 8. Non-Goals (재확인)

- 지출 행에 자금원을 별도 컬럼으로 저장하는 스키마 변경.
- 입력폼 실시간 연동/초과 차단.
- 법정 우선순위 충당 재배분 추정(결산 영역).
- 정당/국회의원/후원회 전용 배분 규칙.
