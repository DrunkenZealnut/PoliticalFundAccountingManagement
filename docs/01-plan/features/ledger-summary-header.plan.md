# 수입·지출 내역 현황 요약 헤더 Planning Document

> **Summary**: 수입관리내역/지출관리내역 페이지 상단에 현재 필터를 반영한 "현황 요약" 패널(총액, 선거비용/선거비용외, 수입원별·지출유형별 내역)을 추가
>
> **Project**: PoliticalFundAccountingManagement
> **Version**: 0.1.0
> **Author**: Claude
> **Date**: 2026-06-03
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 수입/지출 내역 페이지 상단에 수입·지출·잔액 한 줄만 있어, 선거비용/선거비용외 비중이나 수입원별·지출유형별 분포를 보려면 결산·보고서 등 다른 메뉴를 따로 열어야 함 |
| **Solution** | 두 페이지 상단에 현황 요약 패널을 추가 — 총액·건수, 선거비용/선거비용외 금액·비율(지출), 수입원(계정)별 합계(수입)/지출유형별 합계(지출)를 현재 검색필터 기준으로 표시 |
| **Function/UX Effect** | 내역을 보는 그 화면에서 "얼마를, 어디에, 어떤 성격으로" 썼/받았는지 즉시 파악 → 메뉴 이동 없이 검토·점검 가능 |
| **Core Value** | 정치자금 회계의 실시간 가시성 강화 — "내역과 현황을 한 화면에" |

---

## 1. Overview

### 1.1 Purpose

현재 수입(`dashboard/income`)·지출(`dashboard/expense`) 페이지는 상단에 **수입금액·지출금액·잔액** 한 줄 요약만 제공합니다(income `page.tsx` L402–415, expense L513–521). 회계 담당자가 "선거비용/선거비용외 비중", "수입원별 얼마", "지출 유형별 얼마"를 확인하려면 결산작업·수입지출보고서 등 별도 메뉴를 열어야 합니다.

이 기능은 각 내역 페이지 상단에 **현황 요약 패널**을 추가하여, 내역을 조회하는 화면에서 핵심 집계를 즉시 보여줍니다. 검색 조건(필터)이 적용되면 현황도 필터 기준으로 갱신됩니다.

### 1.2 Background

- 정치자금은 **선거비용/선거비용외** 구분이 법적 핵심 지표이며, 보전·보고에 직접 연결됨.
- `acc_book`에 모든 거래가 있고, 페이지는 이미 `summary{income,expense,balance}`와 필터 합계(`filteredSummary`/`filteredTotal`)를 보유 — 데이터는 추가 조회 없이 재집계 가능.
- 대시보드에 동일 성격의 KPI 카드(`SummaryCards`/`MetricCardGrid`)와 집계 로직(`settlement-calc`, `funding-source`, `reimbursement-aggregator`)이 이미 존재 → **재사용** 대상.
- 선거비용/선거비용외 판별은 `lib/expense-types.ts`의 `detectItemCategory()`가 단일 소스(SSOT).
- 기관유형(후보자/후원회/정당/국회의원)별 관심 지표가 달라, 최근 `dashboard-org-differentiation`의 분기 패턴을 따른다.

### 1.3 Related Documents

- 수입 페이지: `app/src/app/dashboard/income/page.tsx`
- 지출 페이지: `app/src/app/dashboard/expense/page.tsx`
- 회계 API: `app/src/app/api/acc-book/route.ts` (summary/filteredSummary 반환)
- 집계 로직: `app/src/lib/accounting/{settlement-calc,funding-source,reimbursement-aggregator}.ts`
- 지출유형 분류: `app/src/lib/expense-types.ts` (`detectItemCategory`)
- 코드 조회 훅: `app/src/hooks/use-code-values.ts` (`getName`, `getAccounts`, `getItems`)
- 기존 KPI 카드: `app/src/components/dashboard/{SummaryCards,MetricCardGrid}.tsx`
- 참고 Plan: `docs/01-plan/features/dashboard-overview.plan.md`

---

## 2. Scope

### 2.1 In Scope

- [ ] **공통 현황 패널 컴포넌트** — 카드/배지 형태, 금액 포맷·색상 기존 컨벤션 일치(수입 파랑/지출 빨강/잔액 초록)
- [ ] **수입내역 페이지 현황**: 수입 총액, 건수, 잔액, **수입원(계정)별 합계** breakdown(후원금·기탁금·보조금·차입금·후보자부담 등, `getName`으로 명칭 해석)
- [ ] **지출내역 페이지 현황**: 지출 총액, 건수, **선거비용/선거비용외 금액 및 비율**, **지출유형(과목)별 합계** breakdown
- [ ] **필터 연동**: 검색 조건(일자·계정·과목·내역) 적용 시 현황도 동일 기준으로 갱신(전체 ↔ 필터 결과 모두 확인 가능)
- [ ] **기관유형 분기**: orgType별 강조 지표 차등(후보자=선거비용/보전, 후원회=후원금 수입 중심)
- [ ] **초보자 모드 도움말**(`HelpTooltip`) 항목 추가
- [ ] **반응형**(모바일 1열 / 데스크톱 다열) + 단위 테스트(집계 함수)

### 2.2 Out of Scope

- 새 차트/그래프(도넛·추이) 추가 — 대시보드(`dashboard-overview`)에 이미 존재, 본 작업은 "내역 페이지 상단 요약 숫자"에 집중
- 현황 패널 PDF/Excel 내보내기 — 별도 기능
- 신규 API 엔드포인트 신설 — 기존 `acc-book` 응답/클라이언트 집계로 충분(필요 시 summary 확장만)
- 실시간 구독(Realtime) — 새로고침/필터 기반으로 충분

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | 요구사항 | 우선순위 |
|----|----------|:--------:|
| FR-01 | 수입 페이지 상단에 현황 패널: 수입 총액·건수·잔액 표시 | High |
| FR-02 | 수입 페이지: 수입원(계정 `acc_sec_cd`)별 합계 breakdown(명칭+금액+비율) | High |
| FR-03 | 지출 페이지 상단에 현황 패널: 지출 총액·건수 표시 | High |
| FR-04 | 지출 페이지: 선거비용/선거비용외 금액 및 비율 표시(`detectItemCategory` 기준) | High |
| FR-05 | 지출 페이지: 지출유형(과목)별 합계 breakdown | Medium |
| FR-06 | 검색 필터 적용 시 현황을 필터 결과 기준으로 재계산(전체/필터 구분 명시) | High |
| FR-07 | 선거비용 분류·금액 포맷·색상은 기존 단일 소스(`detectItemCategory`, `formatAmount`) 재사용(중복 정의 금지) | High |
| FR-08 | 기관유형별 강조 지표 차등(후보자 vs 후원회 등) | Medium |
| FR-09 | 초보자 모드에서 각 지표 의미 도움말 제공 | Low |

### 3.2 Non-Functional Requirements

| ID | 요구사항 |
|----|----------|
| NFR-01 | 집계는 `useMemo`로 메모이즈; 레코드 대량 시 API summary 우선 사용해 클라 연산 최소화 |
| NFR-02 | 기존 페이지 동작(입력폼·테이블·일괄작업) 회귀 없음 |
| NFR-03 | 접근성: 색상 외 텍스트 라벨 병기, 표/배지 스크린리더 가독 |
| NFR-04 | 디자인: `DESIGN.md` 준수, 기존 `SummaryCards` 톤과 일관 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] 수입·지출 페이지 상단에 현황 패널이 렌더되고, 실데이터로 합계가 기존 한 줄 요약과 일치
- [ ] 선거비용+선거비용외 합 = 지출 총액(검증), 수입원별 합 = 수입 총액(검증)
- [ ] 검색 필터 적용 시 현황 숫자가 정확히 갱신
- [ ] 집계 함수 단위 테스트 통과, 기존 테스트 무회귀
- [ ] Gap analysis Match Rate ≥ 90%

### 4.2 Quality Criteria

- 선거비용 분류 로직 중복 0(SSOT 재사용)
- lint/build 통과, 콘솔 에러 0
- 모바일/데스크톱 레이아웃 깨짐 없음

---

## 5. Risks and Mitigation

| 리스크 | 영향 | 완화 |
|--------|------|------|
| 클라이언트 집계와 API summary 불일치 | 숫자 신뢰도 저하 | 단일 집계 유틸로 통일, DoD에서 한 줄 요약과 교차검증 |
| 수입원/지출유형 코드 명칭 해석 누락(빈 라벨) | breakdown 가독성 저하 | `useCodeValues.getName` 활용 + 미해석 시 코드 폴백 표기 |
| 대량 레코드에서 클라 재집계 성능 | 페이지 지연 | API summary 우선, 필터 결과만 클라 집계 + `useMemo` |
| org_id/orgType 미반영(타 조직 데이터 혼입) | 정합성 오류 | 기존 페이지의 org 스코프 그대로 사용, 신규 조회 없음 |
| 선거비용 분류 경계 케이스(`null`) | 합계 누락 | `detectItemCategory` null은 "미분류"로 별도 표기, 총액엔 포함 |

---

## 6. Architecture Considerations

### 6.1 Project Level Selection

- **Level**: Dynamic (Next.js + Supabase 풀스택). 신규 인프라 없음, 기존 페이지/컴포넌트 확장.

### 6.2 Key Architectural Decisions

- **신규 API 미신설**: 기존 `acc-book` 응답 + 클라이언트 집계 사용. 필요 시 `summary`에 분류별 합계 필드만 추가 확장.
- **집계 SSOT**: 선거비용/선거비용외 = `detectItemCategory`, 잔액 = 기존 `summary.balance`/`settlement-calc`, 보전 = `reimbursement-aggregator` 재사용.
- **표시 vs 계산 분리**: 순수 집계 함수(`lib/accounting/ledger-summary.ts` 신설, 테스트 가능) + 표시 컴포넌트 분리.

### 6.3 컴포넌트 구조

```
components/dashboard/ (또는 components/ledger/)
  LedgerSummaryHeader.tsx     # 공통 현황 패널 (props: records/summary/filter/orgType, variant: 'income'|'expense')
    └ 재사용: MetricCard (from MetricCardGrid/SummaryCards), formatAmount
lib/accounting/
  ledger-summary.ts           # 순수 집계: bySource(income), byExpenseType+선거비용분류(expense)
  ledger-summary.test.ts      # 단위 테스트
app/dashboard/income/page.tsx  # 상단에 <LedgerSummaryHeader variant="income" .../> 삽입
app/dashboard/expense/page.tsx # 상단에 <LedgerSummaryHeader variant="expense" .../> 삽입
```

---

## 7. Convention Prerequisites

### 7.1 Existing Project Conventions

- 금액 포맷 `formatAmount`/`fmt`, 색상(수입 파랑·지출 빨강·잔액 초록), `useCodeValues` 코드 해석, `HelpTooltip` 도움말, org 스코프 필수.
- `lib/expense-types.ts`·`lib/accounting/*` 비즈니스 로직은 페이지에 중복 금지(공유 모듈 import).

### 7.2 Conventions to Define/Verify

- 현황 패널의 "전체 vs 필터" 표기 방식(탭/토글/병기) 통일 — Design 단계에서 확정.
- breakdown 정렬 기준(금액 내림차순) 및 상위 N + "기타" 합산 규칙.

### 7.3 Environment Variables Needed

- 없음(기존 Supabase 환경변수로 충분).

---

## 8. Next Steps

1. `/pdca design ledger-summary-header` — 데이터 모델(집계 입력/출력 타입), UI 레이아웃(전체/필터 표기), 컴포넌트 props, 테스트 케이스 명세
2. 구현: `lib/accounting/ledger-summary.ts` → `LedgerSummaryHeader.tsx` → 두 페이지 삽입
3. `/pdca analyze ledger-summary-header` — Gap 분석
4. 실데이터 QA(수입/지출 합계 교차검증)

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-06-03 | Claude | 최초 Plan 작성 |
