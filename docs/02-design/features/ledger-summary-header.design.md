# 수입·지출 내역 현황 요약 헤더 Design Document

> **Plan**: [ledger-summary-header.plan.md](../../01-plan/features/ledger-summary-header.plan.md)
> **Project**: PoliticalFundAccountingManagement · **Date**: 2026-06-03 · **Status**: Draft
> **Level**: Dynamic (Next.js + Supabase, 신규 인프라 없음)

---

## 0. 메뉴 커버리지 조사 (보강 근거)

26개 대시보드 라우트를 스캔(테이블/목록·기존 요약·집계 신호)하여 "현황 요약 헤더"가 필요한 메뉴를 분류했다.

| Tier | 메뉴 | 현재 요약 상태 | 적용 |
|------|------|----------------|:----:|
| **1 핵심** | `income` 수입내역 | 수입·지출·잔액 한 줄(L402–415) | ✅ 풀 헤더 |
| **1 핵심** | `expense` 지출내역 | 수입·지출·잔액 한 줄(L513–521) | ✅ 풀 헤더 |
| **2 강력보강** | `customer` 수입지출처 | **요약 전무**(summary=0) | ✅ 헤더(거래처 통계) |
| **2 강력보강** | `income-expense-book` 수입지출부 | 총건수·수입·지출·잔액 한 줄(L251–254) | ✅ 헤더화 + 선거비용/외 |
| **3 선택** | `estate` 재산내역 | 합계수량·합계금액 한 줄(L128) | △ 카드화 |
| **3 선택** | `donors` 후원금기부자 | 후원금 합계(L364) | △ 기부자수·한도초과 보강 |
| **제외** | `reimbursement` 보전비용 | 총건수·총지출·보전대상 등 충실(L192–194) | 이미 충분 |
| **제외** | `settlement`·`aggregate`·`party-summary`·`supporter-summary`·`support-detail`·`income-expense-report`·`asset-report` | 요약/집계 페이지 자체 | 대상 아님 |
| **제외** | `organ`·`codes`·`backup`·`reset`·`forms`·`batch-import`·`customer-batch`·`submit`·`audit`·`document-register`·`resolution` | 입력/IO/유틸 | 대상 아님 |

**설계 원칙**: Tier 1을 구현 기준으로 하되, **재사용 컴포넌트 1개**(`LedgerSummaryHeader`)를 config 기반으로 만들어 Tier 2/3에 동일 컴포넌트를 props만 바꿔 적용한다. → 메뉴별 중복 UI/집계 코드 0.

---

## 1. Overview

### 1.1 Design Goals
- 내역 목록 화면 상단에서 핵심 집계(총액·건수·성격별·항목별)를 즉시 표시
- 검색 필터와 동기화(전체 ↔ 필터 결과)
- 단일 컴포넌트 + 단일 집계 유틸로 다수 메뉴 커버

### 1.2 Design Principles
- **SSOT 재사용** (구현 확정): 과목 기준 선거비용 = 과목 코드명 `"선거비용"`(reimbursement-aggregator의 electionExpenseItemCds와 동일), 보전대상 선거비용 = `exp_sec_cd>0`(`lib/dashboard/org-metrics` 대시보드 KPI와 동일), 수입원 = `classifyFundingSource(acc_sec_cd)`, 코드명 = `useCodeValues.getName`, 잔액 = 기존 `summary.balance`. (※ 초안의 `detectItemCategory` 가정은 do 단계에서 위 실제 SSOT로 교정 — 대시보드 숫자와 일치 보장)
- **계산/표시 분리**: 순수 집계 함수(`lib/accounting/ledger-summary.ts`) ↔ 표시 컴포넌트(`LedgerSummaryHeader.tsx`)
- **신규 API 없음**: 기존 페이지가 보유한 records/summary 재활용

---

## 2. Architecture

### 2.1 Component Diagram
```
income/page.tsx ─┐
expense/page.tsx ─┤
customer/page.tsx ─┼─▶ <LedgerSummaryHeader config primary breakdowns scope orgType />
income-expense-book/page.tsx ─┘        │
                                       ├─▶ MetricCard (재사용: SummaryCards/MetricCardGrid 스타일)
                                       └─▶ formatAmount, HelpTooltip
lib/accounting/ledger-summary.ts ◀── 각 page가 records를 넘겨 집계 결과 산출
   summarizeIncome() / summarizeExpense() / summarizeCustomers() / groupSum()
```

### 2.2 Data Flow
1. page가 기존대로 `acc-book`(또는 customers) 데이터 로드 → `records`, `summary`, 필터결과 보유
2. page가 `records`(필터 적용본/전체)를 `summarizeX()`에 전달 → `LedgerSummary` 객체
3. `LedgerSummaryHeader`가 이를 카드/배지로 렌더, scope 토글(전체/필터)
4. 필터 변경 시 page가 재집계(`useMemo`) → 헤더 자동 갱신

### 2.3 Dependencies
- 기존: `useCodeValues`, `formatAmount`, `detectItemCategory`, `HelpTooltip`, `useAuth(orgType)`
- 신규 의존성 추가 없음

---

## 3. Data Model (집계 입출력 타입)

```ts
// lib/accounting/ledger-summary.ts
export type StatTone = "income" | "expense" | "balance" | "neutral" | "warn";

export interface SummaryStat {
  key: string;
  label: string;
  value: number;            // 금액 또는 건수
  unit: "won" | "count" | "percent";
  tone?: StatTone;
  help?: string;            // 초보자 모드 도움말
}

export interface SummaryGroupRow {
  code: number | string;
  name: string;             // getName 해석값 (미해석 시 코드 폴백)
  amount: number;
  count: number;
  ratio: number;            // 0~1, 그룹 총액 대비
}

export interface SummaryGroup {
  title: string;            // 예: "수입원별", "지출유형별"
  rows: SummaryGroupRow[];  // 금액 내림차순, 상위 N + "기타" 합산
  topN?: number;
}

export interface LedgerSummary {
  primary: SummaryStat[];   // 상단 KPI 카드
  groups: SummaryGroup[];   // breakdown (없으면 빈 배열)
}
```

**집계 함수(순수)**
| 함수 | 입력 | 출력 핵심 |
|------|------|-----------|
| `buildIncomeSummary(rows, opts)` | 수입 레코드 | total·count·(balance) + group "수입원별"(`classifyFundingSource`). supporter는 "후원금 총액" 라벨 |
| `buildExpenseSummary(rows, opts)` | 지출 레코드 | total·count + (candidate) 선거비용(과목)/선거비용외(과목)/보전대상 + group "과목별"(`item_sec_cd`) |
| `summarizeCustomers(customers)` | 거래처 | 총 거래처수 + 유형별(개인/단체 등) + 거래내역 보유 건수 |
| `groupSum(records, keyFn, labelFn, topN?)` | 공통 | `SummaryGroupRow[]` (정렬·상위N·기타) |

> **분류 기준(구현 확정)**: 과목 기준 선거비용 = 과목 코드명 `"선거비용"`, 그 외 전부 선거비용외(과목). 별도 "보전대상" 지표 = `exp_sec_cd>0`(대시보드 KPI 동일, "둘 다 표시" 결정). 선거비용/보전대상 카드는 **candidate에서만** 표시(FR-08). 실데이터 교차검증으로 대시보드 숫자와 일치 확인.

---

## 4. API Specification

신규 엔드포인트 **없음**. 기존 사용:
- `GET /api/acc-book?...` → `records`, `summary{income,expense,balance}`, `filteredSummary{...,count}` (income)
- expense/book/customer는 기존 클라이언트 집계 유지
- (선택 최적화) 대량 레코드 시 `acc-book` summary에 `byCategory`(선거비용/외) 합계 필드만 확장 가능 — 본 설계의 필수 아님

---

## 5. UI/UX Design

### 5.1 Screen Layout
```
┌───────────────────────────────────────────────────────────────┐
│ [현황 요약]                         (전체 ⟷ 검색결과)  토글    │
│ ┌──────────┐┌──────────┐┌──────────┐┌──────────┐              │ ← primary 카드
│ │ 지출 총액 ││ 선거비용  ││ 선거비용외││ 잔액      │              │
│ │14,796,125││  0원(0%) ││14,796,125││3,302,930 │              │
│ └──────────┘└──────────┘└──────────┘└──────────┘              │
│ ▸ 지출유형별  ████ 사무소설치 5,000,000 (34%) · 인건비 ... 기타 │ ← group(접이식)
└───────────────────────────────────────────────────────────────┘
```
- 모바일: primary 2열, group 가로 스크롤/접힘
- 색상: 수입 파랑 / 지출 빨강 / 잔액 초록 / 선거비용 강조 / 미분류 회색
- 기존 `SummaryCards` 톤·간격과 일치(`DESIGN.md` 준수)

### 5.2 User Flow
1. 페이지 진입 → 전체 기준 현황 표시
2. 검색 조건 입력·조회 → 헤더가 "검색결과" 기준으로 전환(토글로 전체와 비교)
3. 초보자 모드 ON → 각 지표에 `HelpTooltip`

### 5.3 Component List
| 컴포넌트 | 위치 | 역할 |
|----------|------|------|
| `LedgerSummaryHeader` | `components/dashboard/LedgerSummaryHeader.tsx` | 현황 패널 컨테이너(primary + groups + scope 토글) |
| `SummaryMetricCard` | 동 파일 또는 `MetricCardGrid` 재사용 | 단일 지표 카드 |
| `SummaryGroupBar` | 동 파일 | breakdown 행(라벨·금액·비율 바) |

**페이지별 config 예시**
| 페이지 | primary | groups |
|--------|---------|--------|
| income | 수입총액·건수·잔액 | 수입원별(`acc_sec_cd`) |
| expense | 지출총액·선거비용·선거비용외·잔액 | 지출유형별 |
| customer | 총 거래처·거래有 거래처·유형수 | 유형별(개인/단체…) |
| income-expense-book | 총건수·수입합계·지출합계·잔액 | 선거비용/외 |

---

## 6. Error Handling
| 상황 | 처리 |
|------|------|
| records 빈 배열 | "표시할 내역이 없습니다" + 0원/0건(0 division 방지: ratio=0) |
| 코드명 미해석 | `getName` 실패 시 코드값 문자열 폴백 표기 |
| `detectItemCategory` null | "미분류" 그룹/배지로 분리, total 누락 없음 |
| 금액 NaN/undefined | `formatAmount`에서 0 처리 |

## 7. Security Considerations
- 신규 데이터 노출 없음(이미 페이지가 보는 records 재집계). org 스코프는 기존 페이지 로직 그대로 — 신규 조회 없어 교차조직 유출 경로 없음.
- 클라이언트 집계만 추가, 권한 경계 변화 없음.

## 8. Test Plan

### 8.1 Test Scope
- 순수 집계 함수(`ledger-summary.test.ts`) 단위 테스트 중심. 컴포넌트는 스냅샷/렌더 최소.

### 8.2 Test Cases (Key)
| ID | 케이스 | 기대 |
|----|--------|------|
| T1 | summarizeExpense: 선거비용+선거비용외+미분류 합 = total | 일치 |
| T2 | summarizeIncome: 수입원별 합 = total, ratio 합 ≈ 1 | 일치 |
| T3 | 빈 records | total/count=0, groups=[], 예외 없음 |
| T4 | getName 미해석 코드 | name=코드 폴백 |
| T5 | groupSum topN | 상위 N + "기타" 합산 정확 |
| T6 | FR-08: 비후보자(supporter)는 선거비용/보전대상 카드 미표시, total 유지 | gating 동작 |
| T7 | summarizeCustomers 유형별 건수 합 = 총 거래처수 | 일치 |
| 회귀 | 기존 income/expense 페이지 테스트 무회귀 | pass |

---

## 9. Clean Architecture

### 9.1 Layer Structure
```
표시(UI)        components/dashboard/LedgerSummaryHeader.tsx   ── React, 표시 전용
도메인(집계)    lib/accounting/ledger-summary.ts               ── 순수 함수, React 비의존
공유 규칙       lib/expense-types.ts(detectItemCategory), hooks/use-code-values
```
### 9.2 Dependency Rules
- `ledger-summary.ts`는 React/Next 비의존(순수) → 테스트 용이
- 컴포넌트 → 집계 함수 단방향. 페이지 → 컴포넌트 + 집계 함수
### 9.3 File Import Rules
- 페이지/컴포넌트에서 선거비용 분류·금액 포맷 **재정의 금지**(공유 모듈 import만)
### 9.4 Layer Assignment
- 신규: `lib/accounting/ledger-summary.ts`(도메인), `components/dashboard/LedgerSummaryHeader.tsx`(표시)

## 10. Coding Convention Reference
- 네이밍: 집계 함수 `summarizeX`/`groupSum`, 타입 `LedgerSummary`/`SummaryStat`
- Import 순서: 기존 페이지 컨벤션 따름(외부→@/lib→@/components→상대)
- 금액·색상·도움말 컨벤션은 `SummaryCards`/`income`·`expense` 기존 코드와 일치

---

## 구현 순서 (do 단계 가이드)
1. `lib/accounting/ledger-summary.ts` + `ledger-summary.test.ts` (집계·테스트 먼저)
2. `components/dashboard/LedgerSummaryHeader.tsx` (config 기반 표시)
3. Tier 1 적용: `income/page.tsx`, `expense/page.tsx` 상단 삽입 + 기존 한 줄 요약 대체/통합
4. Tier 2 적용: `customer`, `income-expense-book`
5. (선택) Tier 3: `estate`, `donors`
6. 실데이터 교차검증(헤더 합계 = 기존 요약·대시보드 KPI) → `/pdca analyze`

## NOT in scope
- 신규 차트/그래프, PDF·Excel 내보내기, Realtime 구독, 신규 API 엔드포인트(필수 아님)

---

## Act-1 동기화 (2026-06-03, Check 84%→재분석)

본 문서는 구현 결과에 맞춰 동기화되었다(Code is truth).
- **구현 범위**: **Tier 1(income·expense)만 완료**. Tier 2(`customer`·`income-expense-book`)·Tier 3(`estate`·`donors`) 및 `summarizeCustomers`는 **후속 범위**.
- **분류 SSOT 확정**: 과목 선거비용=코드명 "선거비용", 보전대상=`exp_sec_cd>0`, 수입원=`classifyFundingSource`. (`detectItemCategory` 가정 폐기)
- **타입/함수**: `buildIncomeSummary`/`buildExpenseSummary(rows, opts)`, `SummaryGroupRow.key`, `LedgerSummary.totalCount`, `SummaryStat.helpId` 추가.
- **FR-08(orgType 차등)**: candidate만 선거비용/보전대상 카드, supporter는 "후원금 총액" 라벨 — 구현 완료.
- **FR-09(도움말)**: `SummaryStat.helpId` + `HelpTooltip`(HELP_TEXTS `ledger.*`) 연동 — 구현 완료.
- **scope**: "전체↔필터 토글"은 다운스코프 → `scopeLabel`("현재 조회 N건") + `잔액(전체)` 라벨로 기준 명시.
