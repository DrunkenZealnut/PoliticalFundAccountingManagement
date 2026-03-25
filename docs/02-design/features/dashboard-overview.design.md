# 메인페이지 전체 현황 대시보드 Design Document

> **Feature**: dashboard-overview
> **Plan Reference**: `docs/01-plan/features/dashboard-overview.plan.md`
> **Date**: 2026-03-25
> **Status**: Draft

---

## 1. Component Architecture

### 1.1 Component Tree

```
DashboardPage (page.tsx) — 수정
├── SummaryCards              — 신규 컴포넌트
│   ├── Card × 4 (수입/지출/잔액/거래처)
│   └── 전월 대비 증감률 Badge
├── div.grid (차트 영역)
│   ├── MonthlyTrendChart     — 신규 컴포넌트 (바 차트)
│   └── ExpenseCategoryChart  — 신규 컴포넌트 (도넛 차트)
├── RecentTransactions        — 신규 컴포넌트 (테이블)
├── ReceiptAlert              — 신규 컴포넌트 (알림 배너)
└── QuickActions              — 신규 컴포넌트 (바로가기 그리드)
```

### 1.2 File Structure

```
app/src/
├── app/dashboard/page.tsx                    ← 수정 (오케스트레이션만)
├── components/dashboard/
│   ├── SummaryCards.tsx                       ← FR-06
│   ├── MonthlyTrendChart.tsx                 ← FR-01
│   ├── ExpenseCategoryChart.tsx              ← FR-02
│   ├── RecentTransactions.tsx                ← FR-03
│   ├── ReceiptAlert.tsx                      ← FR-04
│   └── QuickActions.tsx                      ← FR-05
└── lib/dashboard/
    └── use-dashboard-data.ts                 ← 데이터 페칭 훅
```

---

## 2. Data Design

### 2.1 데이터 페칭 훅: `useDashboardData`

```typescript
// lib/dashboard/use-dashboard-data.ts
interface DashboardData {
  // 요약
  summary: {
    income: number;
    expense: number;
    balance: number;
    incomeCount: number;
    expenseCount: number;
    customerCount: number;
  };
  // 전월 대비
  prevMonth: {
    income: number;
    expense: number;
  };
  // 월별 추이 (최근 6개월)
  monthlyTrend: Array<{
    month: string;        // "2026-01"
    income: number;
    expense: number;
  }>;
  // 지출 카테고리별
  expenseByCategory: Array<{
    itemSecCd: number;
    label: string;        // codevalue.cv_name
    amount: number;
    ratio: number;        // 0-100
  }>;
  // 최근 거래
  recentTransactions: Array<{
    accBookId: number;
    date: string;         // "2026-03-25"
    type: "수입" | "지출";
    content: string;
    amount: number;
    customerName: string;
  }>;
  // 영수증 미첨부
  missingReceipts: number;
}

export function useDashboardData(orgId: number | null): {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}
```

### 2.2 Supabase 쿼리 설계

모든 쿼리는 `Promise.all`로 병렬 실행하여 로딩 시간 최소화.

```typescript
// 1. 전체 거래 데이터 (요약 + 월별 + 카테고리 계산용)
supabase
  .from("acc_book")
  .select("incm_sec_cd, acc_date, acc_amt, item_sec_cd, content, acc_book_id, rcp_yn, customer:cust_id(name)")
  .eq("org_id", orgId)
  .order("acc_date", { ascending: false });

// 2. 거래처 수
supabase
  .from("customer")
  .select("*", { count: "exact", head: true });

// 3. 코드값 (지출 카테고리 라벨)
// → /api/codes 캐시 활용 (1시간 TTL)
fetch("/api/codes").then(r => r.json());
```

### 2.3 클라이언트 사이드 데이터 가공

서버 쿼리 1회로 모든 데이터를 가져온 후 클라이언트에서 가공:

```typescript
function processDashboardData(records: AccBookRow[], codes: CodeValue[]): DashboardData {
  // 1. summary: income/expense 필터 후 합산
  // 2. prevMonth: 전월 날짜 범위 필터
  // 3. monthlyTrend: acc_date YYYYMM 기준 그룹핑 → 최근 6개월
  // 4. expenseByCategory: incm_sec_cd=2 → item_sec_cd 그룹핑
  // 5. recentTransactions: records.slice(0, 10)
  // 6. missingReceipts: rcp_yn !== 'Y' 카운트
}
```

---

## 3. Component Specifications

### 3.1 SummaryCards (FR-06)

**Props**:
```typescript
interface SummaryCardsProps {
  income: number;
  expense: number;
  balance: number;
  customerCount: number;
  prevMonthIncome: number;
  prevMonthExpense: number;
  loading: boolean;
}
```

**Layout**: `grid grid-cols-2 md:grid-cols-4 gap-4`

**카드 구성**:
| 카드 | 값 | 색상 | 증감 Badge |
|------|-----|------|-----------|
| 총 수입 | income | blue-600 | vs 전월 수입 |
| 총 지출 | expense | red-500 | vs 전월 지출 |
| 잔액 | balance | green-600 | — |
| 거래처 | customerCount | gray-700 | — |

**증감률 계산**:
```typescript
const changeRate = prevMonth > 0
  ? Math.round(((current - prevMonth) / prevMonth) * 100)
  : 0;
// 양수: ▲ N% (green), 음수: ▼ N% (red)
```

### 3.2 MonthlyTrendChart (FR-01)

**Props**:
```typescript
interface MonthlyTrendChartProps {
  data: Array<{ month: string; income: number; expense: number }>;
  loading: boolean;
}
```

**차트 스펙**:
- 타입: `BarChart` (Recharts)
- X축: month (최근 6개월, "1월"~"6월" 형식)
- Y축: 금액 (자동 스케일, 만원 단위 포맷)
- 바: income(blue-500), expense(red-400)
- 높이: 300px
- 반응형: `<ResponsiveContainer width="100%" height={300}>`
- Tooltip: 금액 한국어 포맷

**Dynamic Import**:
```typescript
import dynamic from "next/dynamic";
const MonthlyTrendChart = dynamic(
  () => import("@/components/dashboard/MonthlyTrendChart"),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
```

### 3.3 ExpenseCategoryChart (FR-02)

**Props**:
```typescript
interface ExpenseCategoryChartProps {
  data: Array<{ label: string; amount: number; ratio: number }>;
  loading: boolean;
}
```

**차트 스펙**:
- 타입: `PieChart` with `Pie` (Recharts, innerRadius로 도넛)
- 색상 팔레트: `["#3b82f6", "#ef4444", "#f59e0b", "#10b981", "#8b5cf6", "#ec4899", "#6b7280"]`
- 중앙 텍스트: 총 지출액
- 범례: 하단, 항목명 + 비율(%)
- 높이: 300px

### 3.4 RecentTransactions (FR-03)

**Props**:
```typescript
interface RecentTransactionsProps {
  transactions: Array<{
    accBookId: number;
    date: string;
    type: "수입" | "지출";
    content: string;
    amount: number;
    customerName: string;
  }>;
  loading: boolean;
}
```

**테이블 구성**:
| 컬럼 | 필드 | 정렬 | 포맷 |
|------|------|------|------|
| 날짜 | date | — | YYYY-MM-DD |
| 구분 | type | — | Badge(수입:blue, 지출:red) |
| 내용 | content | — | 최대 20자 truncate |
| 금액 | amount | right | toLocaleString + "원" |
| 거래처 | customerName | — | — |

**하단**: "전체 보기 →" 링크 → `/dashboard/income-expense-book`

### 3.5 ReceiptAlert (FR-04)

**Props**:
```typescript
interface ReceiptAlertProps {
  count: number;  // 미첨부 건수
}
```

**조건부 렌더링**: `count > 0`일 때만 표시

**UI**: 노란색 경고 배너
```
⚠ 영수증 미첨부 거래가 {count}건 있습니다.  [확인하기 →]
```
- 링크: `/dashboard/income-expense-book` (영수증 필터 적용)

### 3.6 QuickActions (FR-05)

**Props**:
```typescript
interface QuickActionsProps {
  orgType: "party" | "lawmaker" | "candidate" | "supporter";
}
```

**기관유형별 바로가기**:

| 공통 | 정당 추가 | 후보자 추가 | 후원회 추가 |
|------|----------|-----------|-----------|
| 수입 등록 | 결산작업 | 제출파일 생성 | 후원금 기부자 조회 |
| 지출 등록 | 당비영수증 | — | 수입지출 총괄표 |
| 거래처 관리 | 취합작업 | — | — |
| 장부 조회 | — | — | — |

**UI**: `grid grid-cols-2 md:grid-cols-4 gap-3`, 각 아이템은 아이콘 + 라벨의 Card 버튼

---

## 4. page.tsx 수정 설계

### 4.1 수정된 구조

```tsx
// app/src/app/dashboard/page.tsx
"use client";

import { useAuth } from "@/stores/auth";
import { useDashboardData } from "@/lib/dashboard/use-dashboard-data";
import dynamic from "next/dynamic";
import { SummaryCards } from "@/components/dashboard/SummaryCards";
import { RecentTransactions } from "@/components/dashboard/RecentTransactions";
import { ReceiptAlert } from "@/components/dashboard/ReceiptAlert";
import { QuickActions } from "@/components/dashboard/QuickActions";

const MonthlyTrendChart = dynamic(
  () => import("@/components/dashboard/MonthlyTrendChart"),
  { ssr: false }
);
const ExpenseCategoryChart = dynamic(
  () => import("@/components/dashboard/ExpenseCategoryChart"),
  { ssr: false }
);

export default function DashboardPage() {
  const { orgId, orgName, orgType } = useAuth();
  const { data, loading } = useDashboardData(orgId);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">대시보드</h2>

      {/* 1. 요약 카드 */}
      <SummaryCards ... />

      {/* 2. 차트 영역 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card><MonthlyTrendChart ... /></Card>
        <Card><ExpenseCategoryChart ... /></Card>
      </div>

      {/* 3. 영수증 알림 */}
      <ReceiptAlert ... />

      {/* 4. 최근 거래 */}
      <RecentTransactions ... />

      {/* 5. 바로가기 */}
      <QuickActions orgType={orgType} />
    </div>
  );
}
```

---

## 5. Implementation Order

```
Step 1: 의존성 설치
  └── npm install recharts

Step 2: 데이터 훅 구현
  └── lib/dashboard/use-dashboard-data.ts

Step 3: 정적 컴포넌트 (차트 불필요)
  ├── SummaryCards.tsx
  ├── RecentTransactions.tsx
  ├── ReceiptAlert.tsx
  └── QuickActions.tsx

Step 4: 차트 컴포넌트
  ├── MonthlyTrendChart.tsx (dynamic import)
  └── ExpenseCategoryChart.tsx (dynamic import)

Step 5: page.tsx 통합
  └── 기존 코드 → 새 컴포넌트 조합으로 교체

Step 6: 반응형 & 스켈레톤 UI
  └── 모바일/태블릿 레이아웃 확인, 로딩 상태 처리
```

---

## 6. Design Tokens

### 6.1 Color Palette

| 용도 | Tailwind Class | Hex |
|------|---------------|-----|
| 수입 | `text-blue-600` / `fill-blue-500` | #2563eb / #3b82f6 |
| 지출 | `text-red-500` / `fill-red-400` | #ef4444 / #f87171 |
| 잔액 | `text-green-600` | #16a34a |
| 증가 | `text-emerald-600` | #059669 |
| 감소 | `text-rose-600` | #e11d48 |
| 차트 팔레트 | — | #3b82f6, #ef4444, #f59e0b, #10b981, #8b5cf6, #ec4899, #6b7280 |

### 6.2 Layout Breakpoints

| Breakpoint | 요약카드 | 차트 | 바로가기 |
|------------|---------|------|---------|
| < 768px (모바일) | 2열 | 1열 | 2열 |
| 768px-1023px (태블릿) | 4열 | 1열 | 3열 |
| ≥ 1024px (데스크탑) | 4열 | 2열 | 4열 |

---

## 7. Edge Cases

| 상황 | 처리 |
|------|------|
| orgId 없음 (미로그인) | "기관을 선택해주세요" 안내 표시 |
| 거래 데이터 0건 | 빈 상태 일러스트 + "첫 거래를 등록해보세요" |
| 차트 데이터 1개월만 있음 | 바 1개만 표시, 추이 분석 비활성 |
| 지출 카테고리 0건 | 도넛 차트 대신 "지출 내역이 없습니다" |
| 영수증 미첨부 0건 | ReceiptAlert 렌더링 안 함 |
| 대량 데이터 (10,000건+) | 클라이언트 가공이므로 성능 모니터링 필요 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-25 | Initial design | Claude |
