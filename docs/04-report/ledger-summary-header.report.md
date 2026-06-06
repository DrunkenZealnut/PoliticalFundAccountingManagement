# ledger-summary-header Completion Report

> **Feature**: 수입·지출 내역 현황 요약 헤더
> **Project**: 정치자금 회계관리 시스템 (political-fund-accounting)
> **Date**: 2026-06-03 · **Branch**: main (미커밋) · **Match Rate**: 96% (iterate 1회)

---

## Executive Summary

### 1.1 Project Overview

| 항목 | 내용 |
|------|------|
| Feature | 수입관리내역·지출관리내역 페이지 상단 현황 요약 헤더 |
| 기간 | 2026-06-03 (Plan→Design→Do→Check→Act→Report, 단일 세션) |
| PDCA | Plan ✅ → Design ✅ → Do ✅ → Check ✅(84%) → Act-1 ✅(96%) → Report |
| 범위 | Tier 1 (income·expense). Tier 2/3는 후속 사이클 |

### 1.2 Results Summary

| 지표 | 값 |
|------|-----|
| Match Rate | 84% → **96%** (1 iteration) |
| 신규 파일 | 3 (`ledger-summary.ts` 158L, `ledger-summary.test.ts` 109L, `LedgerSummaryHeader.tsx` 93L) |
| 변경 파일 | 3 (`income/page.tsx`, `expense/page.tsx` 각 +18L, `help-texts.ts` +6L) |
| 신규 코드 | ~360L (신규) + ~40 insertions (편집) |
| 단위 테스트 | 10 (ledger-summary) — 전체 스위트 21 passed |
| lint/콘솔 | eslint 0, 런타임 콘솔 에러 0 |
| PDCA 문서 | plan·design·analysis 3종 |

### 1.3 Value Delivered

| Perspective | 내용 |
|-------------|------|
| **Problem** | 수입/지출 내역 페이지 상단에 수입·지출·잔액 한 줄만 있어, 선거비용/외 비중·수입원별·과목별 분포를 보려면 결산·보고서 등 타 메뉴를 따로 열어야 했음 |
| **Solution** | 두 페이지 상단에 현황 요약 패널 추가 — 총액·건수·잔액, 수입원별(수입), 과목 기준 선거비용/외 + 보전대상 + 과목별(지출). 현재 검색필터 기준 자동 갱신. 단일 컴포넌트 config 기반으로 다수 메뉴 확장 가능 |
| **Function/UX Effect** | 내역 조회 화면에서 "얼마를·어디에·어떤 성격으로" 즉시 파악(메뉴 이동 0). 실데이터 검증: 지출 14,796,125 = 선거비용(과목)8,463,025 + 선거비용외6,333,100, 보전대상 0 = 대시보드 KPI 일치, 수입 18,099,055 = 자금원 3종 합 |
| **Core Value** | 정치자금 회계의 실시간 가시성 강화 — "내역과 현황을 한 화면에", 대시보드 KPI와 숫자 정합 보장 |

---

## 2. Related Documents

- Plan: [ledger-summary-header.plan.md](../01-plan/features/ledger-summary-header.plan.md)
- Design: [ledger-summary-header.design.md](../02-design/features/ledger-summary-header.design.md)
- Analysis: [ledger-summary-header.analysis.md](../03-analysis/ledger-summary-header.analysis.md)

## 3. Completed Items

### 3.1 Functional Requirements

| ID | 요구사항 | 상태 |
|----|----------|:----:|
| FR-01 | 수입 총액·건수·잔액 | ✅ |
| FR-02 | 수입원(자금원)별 breakdown | ✅ `classifyFundingSource` |
| FR-03 | 지출 총액·건수 | ✅ |
| FR-04 | 선거비용/외 금액·비율 | ✅ 과목 기준 + 보전대상(둘 다 표시) |
| FR-05 | 과목별 breakdown | ✅ |
| FR-06 | 필터 적용 시 재계산 | ✅ `useMemo([records])` |
| FR-07 | SSOT 재사용·중복 금지 | ✅ funding-source/reimbursement/org-metrics 재사용 |
| FR-08 | 기관유형별 차등 | ✅ candidate만 선거비용/보전대상, supporter "후원금 총액" |
| FR-09 | 초보자 도움말 | ✅ `helpId`+`HelpTooltip`+`HELP_TEXTS.ledger.*` |

### 3.2 산출물 (6개 파일)

| 파일 | 종류 | 역할 |
|------|------|------|
| `lib/accounting/ledger-summary.ts` | 신규(도메인) | 순수 집계 `buildIncomeSummary`/`buildExpenseSummary`/`groupSum` |
| `lib/accounting/ledger-summary.test.ts` | 신규(테스트) | 단위 테스트 10 |
| `components/dashboard/LedgerSummaryHeader.tsx` | 신규(표시) | config 기반 현황 패널 |
| `app/dashboard/income/page.tsx` | 편집 | 헤더 wiring |
| `app/dashboard/expense/page.tsx` | 편집 | 헤더 wiring |
| `lib/help-texts.ts` | 편집 | `ledger.*` 도움말 4건 |

## 4. Quality Metrics

| 항목 | 결과 |
|------|------|
| Match Rate (Tier 1) | 96% (Design 96 / UI 94 / Test 95 / Clean Arch 100) |
| 단위 테스트 | 21 passed (ledger-summary 10 + QuickActions 11) |
| eslint | 0 errors |
| 런타임 콘솔 | 0 errors (income·expense 실데이터) |
| 합계 정합 | 선거비용(과목)+선거비용외=지출총액, 수입원별 합=수입총액, 보전대상=대시보드 KPI ✅ |

## 5. Lessons Learned

### 잘된 점 (Keep)
- 실데이터 라이브 검증으로 **분류 정의 충돌(과목 기준 vs 보전대상)을 조기 발견** → "둘 다 표시"로 모순 해소.
- 설계의 `detectItemCategory` 가정을 실제 SSOT(`org-metrics`/`classifyFundingSource`/과목명 "선거비용")로 교정 → 대시보드 KPI와 숫자 일치 보장.
- 순수 집계 함수 분리로 테스트 용이(10케이스), iterate 1회로 84%→96%.

### 개선/주의 (Problem)
- 헤더 금액 포맷이 공용 `formatAmount` 대신 로컬 `won` — 경미하나 추후 공통화 여지.
- "전체 vs 필터" 표기는 토글 대신 라벨로 다운스코프 — 사용자 피드백 시 토글 재검토.

## 6. Remaining / Next Cycle

- **Tier 2 (강력 보강)**: `customer`(요약 전무), `income-expense-book` → 동일 `LedgerSummaryHeader` 재사용 + `summarizeCustomers` 추가.
- **Tier 3 (선택)**: `estate`, `donors`.
- 헤더 포맷 공통화(`formatAmount`).

## 7. PDCA Cycle Summary

```
[Plan]✅ → [Design]✅(26개 메뉴 조사·보강) → [Do]✅(Tier1) → [Check]✅ 84% → [Act-1]✅ 96% → [Report]✅
```

- 코드·문서 **미커밋** (커밋은 요청 시). 커밋 시 `feat(dashboard): 수입·지출 내역 현황 요약 헤더(ledger-summary-header)` 권장.
