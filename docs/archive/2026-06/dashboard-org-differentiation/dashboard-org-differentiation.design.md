---
template: design
version: 1.2
feature: dashboard-org-differentiation
date: 2026-06-01
author: DrunkenZealnut
project: 정치자금 회계관리 시스템
status: Draft
---

# 메인 대시보드 조직 유형별 콘텐츠 차별화 Design Document

> **Summary**: `orgType`(candidate/supporter)에 따라 메인 대시보드의 요약 카드·메인 차트·알림 콘텐츠를 분기한다. 공통 레이아웃 틀과 데이터 fetch는 재사용하고, 파생 지표를 순수 함수(`org-metrics.ts`)로 계산한다.
>
> **Project**: 정치자금 회계관리 시스템
> **Author**: DrunkenZealnut
> **Date**: 2026-06-01
> **Status**: Draft
> **Planning Doc**: [dashboard-org-differentiation.plan.md](../../01-plan/features/dashboard-org-differentiation.plan.md)

---

## 1. Overview

### 1.1 Design Goals

- `orgType`별로 다른 대시보드 콘텐츠를 **데이터 기반 config + 단일 렌더러**로 표현 (컴포넌트 중복 최소화)
- 파생 지표 계산을 **순수 함수로 격리**하여 단위 테스트 가능하게 함
- 기존 단일 `acc_book` 쿼리를 확장(컬럼 추가)하여 **추가 네트워크 호출 0건** 유지
- 도메인 분류 로직(`classifyFundingSource`, `aggregateReimbursementByFundingSource`)을 **재사용**, 중복 정의 금지(SSOT)

### 1.2 Design Principles

- **SSOT**: 선거비용·자금원·보전 판별은 기존 `lib/accounting` / `lib/expense-types.ts` 재사용
- **Open/Closed**: 조직 유형 추가 시 config 한 곳만 확장 (party/lawmaker 전용 뷰 향후 추가 용이)
- **폴백 안전**: candidate/supporter 외 유형은 기존 공통 뷰 유지 → 회귀 위험 격리
- **순수 함수**: 지표 계산은 `(rows, codes) => metrics` 형태, React/네트워크 비의존

---

## 2. Architecture

### 2.1 Component Diagram

```
                    ┌────────────────────────────┐
                    │  dashboard/page.tsx         │
                    │  (orgType 분기 진입점)       │
                    └─────────────┬──────────────┘
                                  │ orgType
              ┌───────────────────┼────────────────────┐
              ▼                   ▼                    ▼
      candidate 뷰          supporter 뷰        default 뷰(현행)
   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
   │ Candidate     │   │ Supporter     │   │ 기존          │
   │ SummaryCards  │   │ SummaryCards  │   │ SummaryCards  │
   │ + 수입출처차트  │   │ + 모금추이차트 │   │ + 카테고리차트 │
   │ + 선거비용비중 │   │ + 지급현황    │   │              │
   └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
          └──────────────────┼──────────────────┘
                             ▼
              ┌────────────────────────────┐
              │ useDashboardData(orgId)     │ ← acc_book 단일 쿼리(컬럼 확장)
              │   └ computeOrgMetrics(rows) │ ← org-metrics.ts (순수)
              └────────────────────────────┘
```

### 2.2 Data Flow

```
orgId → acc_book SELECT (acc_sec_cd·exp_sec_cd·acc_print_ok 추가)
      → processData() (기존 공통 지표)
      → computeOrgMetrics(rows, codes) (신규 조직별 파생 지표)
      → page.tsx: orgType에 따라 카드/차트 config 선택 → 렌더
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| `org-metrics.ts` (신규) | `funding-source.ts`, `reimbursement-aggregator.ts` | 자금원·보전 집계 재사용 |
| `use-dashboard-data.ts` | `org-metrics.ts` | 파생 지표 주입 |
| `page.tsx` | 카드/차트 config | orgType 분기 |
| Candidate/Supporter 차트 | recharts | 시각화 (기존 차트 패턴 동일) |

---

## 3. Data Model

### 3.1 acc_book 쿼리 확장

기존 select에 `acc_sec_cd, exp_sec_cd, acc_print_ok` 3개 컬럼을 추가한다.

```typescript
// use-dashboard-data.ts — 변경 후 select
supabase.from("acc_book").select(
  "acc_book_id, incm_sec_cd, acc_sec_cd, exp_sec_cd, acc_date, acc_amt, " +
  "item_sec_cd, content, rcp_yn, acc_print_ok, cust_id, customer:cust_id(name)"
).eq("org_id", orgId)
```

| 컬럼 | 의미 | 용도 |
|------|------|------|
| `incm_sec_cd` | 1=수입, 2=지출 | 수입/지출 구분 |
| `acc_sec_cd` | 회계 구분 코드 | 자금원 분류(82~85) |
| `exp_sec_cd` | 지출유형 코드 | **선거비용 판별** (`>0`=선거비용) |
| `acc_print_ok` | 보전 출력 체크 ('Y') | **보전 예상액** 집계 |

### 3.2 파생 지표 타입

```typescript
// org-metrics.ts
export interface CandidateMetrics {
  electionExpense: number;        // 선거비용 지출 (exp_sec_cd > 0)
  nonElectionExpense: number;     // 선거비용외 지출 (exp_sec_cd === 0)
  reimbursableEstimate: number;   // 보전 예상액 (지출 & acc_print_ok='Y')
  fundingSources: Array<{ source: FundingSource; amount: number; ratio: number }>; // 수입 출처 4분류
  executionRate: number;          // 집행률 = 지출 / 수입 (%)
  balance: number;                // 잔액
}

export interface SupporterMetrics {
  totalRaised: number;            // 후원금 모금 총액 (수입 합계)
  monthlyRaised: Array<{ month: string; amount: number }>; // 월별 모금 추이
  donorCount: number;             // 기부자 수 (수입 거래 고유 cust_id, 익명 제외 옵션)
  newDonorCount: number;          // 당월 신규 기부자
  candidateGrantTotal: number;    // 후보자 기부금 지급 누계 (지출 & acc_sec_cd=85)
  remainingFund: number;          // 잔여 모금액 = 모금총액 - 지급/경비
}
```

### 3.3 산식 정의 (Plan 미해결 항목 확정)

| 지표 | 산식 | 근거 |
|------|------|------|
| **선거비용/선거비용외** | `exp_sec_cd > 0` → 선거비용, `=0` → 선거비용외 | `reports/page.tsx:197-198` 기존 패턴 |
| **선거비용 보전 예상액** | `aggregateReimbursementByFundingSource()` 결과 총합 (incm_sec_cd=2 & acc_print_ok='Y' & item∈선거비용 & 자금원≠기타) | `reimbursement-aggregator.ts` **재사용** — 보전청구서와 100% 동일 (SSOT) |
| **수입 출처 구성** | 수입(incm_sec_cd=1) 그룹 by `classifyFundingSource(acc_sec_cd)` | `funding-source.ts` |
| **집행률** | `min(round(지출/수입*100), 100)`, 수입 0이면 0 | 단순 비율 |
| **후원금 모금 총액** | 후원회 수입(incm_sec_cd=1) 합계 | — |
| **후보자 기부금 지급** | 후원회 지출(incm_sec_cd=2) 중 **과목 코드명이 정확히 "기부금"** 인 합계 | 실데이터 검증 반영 (item_sec_cd) |
| **기부자 수** | 수입 거래의 고유 `cust_id` 수 (cust_id=-999 익명 별도 표기) | — |
| **신규 기부자** | 전체 기간 통틀어 **당월(currentYM)에 첫 수입 거래**가 발생한 cust_id 수 | Plan FR-07 확정 |

> ✅ **검증 완료 (2026-06-01, Fund_Data_2.db 55건)**: 후원회 **지출**의 `acc_sec_cd`는 자금원 분류가 아니라 수입(1)/지출(2) **플래그**일 뿐임을 확인. 후보자 기부금은 **과목(item_sec_cd) 코드명 "기부금"**(예: cv_id 97)으로 기록됨. 따라서 초기 가정(`acc_sec_cd=85`)을 폐기하고 **item 코드명 "기부금" 기반**으로 산식 확정. (`acc_sec_cd=85`="후원회기부금"은 후보자 **수입** 측 자금원 코드이므로 `includes` 아닌 **정확 매칭**으로 오집계 방지.)
>
> 후보자(Fund_Data_1.db) 수입의 `acc_sec_cd`는 82(보조금)·84(후보자자산)·85(후원회기부금)로 자금원 분류가 정상 작동 → 수입 출처 차트는 `classifyFundingSource` 그대로 사용.

---

## 5. UI/UX Design

### 5.1 화면 레이아웃 (공통 틀 유지)

```
┌──────────────────────────────────────────────┐
│  대시보드  ·  {orgName} · {orgTypeLabel}        │  ← 공통 헤더
├──────────────────────────────────────────────┤
│  WorkflowProgress (초보자 모드)                 │  ← 공통
├──────────────────────────────────────────────┤
│  [ 요약 카드 4개 ]  ← orgType별 콘텐츠 분기      │
├──────────────────────────────────────────────┤
│  [ 메인 차트 2개 ]  ← orgType별 콘텐츠 분기      │
├──────────────────────────────────────────────┤
│  ReceiptAlert (영수증 누락) ← 공통(지출 있을 때) │
│  RecentTransactions (최근 거래) ← 공통          │
│  QuickActions ← 기존 orgType 분기 유지          │
└──────────────────────────────────────────────┘
```

### 5.2 후보자(candidate) 뷰

**요약 카드 4개**
```
┌─선거비용 지출─┐ ┌─선거비용외 지출─┐ ┌─보전 예상액─┐ ┌─잔액 / 집행률─┐
│  12,340,000원 │ │  3,200,000원   │ │ 9,800,000원 │ │ 2,460,000원   │
│  (전체 지출중) │ │               │ │ 보전대상 합계 │ │ 집행률 86%    │
└──────────────┘ └───────────────┘ └────────────┘ └──────────────┘
```
**차트 2개**: ① 수입 출처 구성(보조금·후원회기부금·후보자자산·보조금외) 도넛/파이 · ② 선거비용 vs 선거비용외 비중(가로 막대 또는 도넛)

### 5.3 후원회(supporter) 뷰

**요약 카드 4개**
```
┌─모금 총액───┐ ┌─기부자 수────┐ ┌─후보자 지급─┐ ┌─잔여 모금액─┐
│ 25,500,000원│ │ 48명         │ │ 20,000,000원│ │ 4,300,000원 │
│             │ │ 신규 5명(당월)│ │ 후원회기부금 │ │            │
└────────────┘ └─────────────┘ └────────────┘ └────────────┘
```
**차트 2개**: ① 월별 모금 추이(막대, 최근 6개월) · ② 후보자 기부금 지급 현황(월별 또는 누계 vs 잔여)

### 5.4 Component List

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `computeCandidateMetrics` / `computeSupporterMetrics` | `src/lib/dashboard/org-metrics.ts` | 조직별 파생 지표 계산 (순수, `OrgMetricsContext` 주입) |
| `MetricCardGrid` | `src/components/dashboard/MetricCardGrid.tsx` | 카드 config 배열 공통 렌더러 (SummaryCards 패턴 일반화) |
| `CandidateSummaryCards` | `src/components/dashboard/candidate/` | 후보자 요약 카드 |
| `SupporterSummaryCards` | `src/components/dashboard/supporter/` | 후원회 요약 카드 |
| `FundingSourceChart` | `src/components/dashboard/candidate/` | 수입 출처 도넛 |
| `ElectionExpenseChart` | `src/components/dashboard/candidate/` | 선거비용/외 비중 |
| `FundraisingTrendChart` | `src/components/dashboard/supporter/` | 월별 모금 추이 |
| `GrantStatusChart` | `src/components/dashboard/supporter/` | 후보자 지급 현황 |
| 기존 `SummaryCards`/차트 | `src/components/dashboard/` | default(party/lawmaker) 유지 |

> 카드 컴포넌트는 기존 `SummaryCards`의 `cards[]` config 패턴을 그대로 재사용 가능 — 데이터만 교체하는 경량 래퍼로 구현 권장.

---

## 6. Error Handling

| 상황 | 처리 |
|------|------|
| `orgType === null` (조직 미선택) | 기존 공통 뷰 + 0원 표시 (현행 동작) |
| `acc_print_ok` 컬럼 NULL | 'Y'가 아니면 보전 제외 (기존 aggregator 규칙) |
| `exp_sec_cd` NULL/undefined | `> 0` 비교에서 false → 선거비용외로 집계 |
| `acc_sec_cd` 미매핑 코드 | `classifyFundingSource` → "기타"로 합산 (누락 방지) |
| 빈 데이터 | 카드 0원, 차트 "데이터 없음" placeholder (기존 차트 패턴) |
| 로딩 중 | skeleton/spinner (기존 패턴 재사용) |

---

## 8. Test Plan

### 8.1 Test Scope

| Type | Target | Tool |
|------|--------|------|
| Unit | `computeOrgMetrics` 파생 지표 계산 | Vitest |
| Unit | candidate/supporter 분기 산식 | Vitest |
| 수동 | 후보자/후원회/정당 3유형 화면 렌더 | 브라우저 |

### 8.2 Test Cases (Key)

- [ ] 후보자: `exp_sec_cd>0` 합계 = 선거비용, `=0` = 선거비용외 정확 분리
- [ ] 후보자: 보전 예상액 = acc_print_ok='Y' 지출 합계와 일치
- [ ] 후보자: 수입 출처 4분류 합계 = 총수입
- [ ] 후보자: 집행률 = 지출/수입, 수입 0일 때 0 처리(division by zero)
- [ ] 후원회: 후보자 지급 = acc_sec_cd=85 지출 합계
- [ ] 후원회: 신규 기부자 = 당월 최초 거래 cust_id만 카운트
- [ ] 후원회: 익명(cust_id=-999) 기부자 수 처리 규칙
- [ ] 폴백: orgType=party/lawmaker → 기존 공통 뷰 그대로
- [ ] Edge: 빈 데이터/단일 거래/음수 보정 거래

---

## 9. Clean Architecture

### 9.4 This Feature's Layer Assignment

| Component | Layer | Location |
|-----------|-------|----------|
| Candidate/Supporter 카드·차트 | Presentation | `src/components/dashboard/{candidate,supporter}/` |
| `page.tsx` 분기 | Presentation | `src/app/dashboard/page.tsx` |
| `useDashboardData` | Application | `src/lib/dashboard/use-dashboard-data.ts` |
| `computeOrgMetrics` | Domain(순수 로직) | `src/lib/dashboard/org-metrics.ts` |
| `classifyFundingSource`, `aggregateReimbursementByFundingSource` | Domain(기존 재사용) | `src/lib/accounting/` |
| Supabase 쿼리 | Infrastructure | `src/lib/supabase/client.ts` |

---

## 10. Coding Convention Reference

### 10.4 This Feature's Conventions

| Item | Convention Applied |
|------|-------------------|
| Component naming | PascalCase (`CandidateSummaryCards`) |
| File organization | orgType별 하위 폴더(`candidate/`, `supporter/`) |
| 지표 계산 | 순수 함수, `org-metrics.ts` 집중 |
| 도메인 분류 | 기존 모듈 import (중복 정의 금지) |
| 차트 | recharts + 기존 카드/툴팁 스타일 토큰 재사용 (DESIGN.md 준수) |

---

## 11. Implementation Guide

### 11.1 File Structure

```
src/
├── app/dashboard/page.tsx                      (수정: orgType 분기)
├── lib/dashboard/
│   ├── use-dashboard-data.ts                   (수정: select 확장 + metrics 주입)
│   ├── org-metrics.ts                          (신규: 파생 지표 순수 함수)
│   └── org-metrics.test.ts                     (신규: 단위 테스트)
└── components/dashboard/
    ├── candidate/
    │   ├── CandidateSummaryCards.tsx
    │   ├── FundingSourceChart.tsx
    │   └── ElectionExpenseChart.tsx
    └── supporter/
        ├── SupporterSummaryCards.tsx
        ├── FundraisingTrendChart.tsx
        └── GrantStatusChart.tsx
```

### 11.2 Implementation Order

1. [ ] **(검증)** Fund_Data_2.db로 후보자 기부금 지급의 acc_sec_cd 식별 확인
2. [ ] `org-metrics.ts` — `computeOrgMetrics(rows, codes)` 순수 함수 + 단위 테스트 (TDD)
3. [ ] `use-dashboard-data.ts` — select 컬럼 확장(acc_sec_cd·exp_sec_cd·acc_print_ok) + metrics 반환
4. [ ] 후보자 카드·차트 2종 구현
5. [ ] 후원회 카드·차트 2종 구현
6. [ ] `page.tsx` — orgType 분기 (candidate/supporter/default 폴백)
7. [ ] 3유형 수동 확인 + `npm run lint && npm run build`

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-01 | 초안 — 산식 확정(선거비용=exp_sec_cd>0, 보전=aggregator, 자금원=classifyFundingSource), 컴포넌트 설계 | DrunkenZealnut |
