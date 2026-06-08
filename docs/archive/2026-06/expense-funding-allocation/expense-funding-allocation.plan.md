# 지출내역관리 — 수입원별 충당 현황(자금원 할당 가늠) Planning Document

> **Summary**: 지출내역관리 페이지에 "자금원(수입계정)별 수입액 · 충당 추정 지출액 · 가용잔액"을 보여주는 충당 현황 패널을 추가하여, 새 지출이 어느 수입원에서 나갈지 입력 시점에 가늠하게 한다.
>
> **Project**: PoliticalFundAccountingManagement
> **Version**: 0.1.0
> **Author**: Claude
> **Date**: 2026-06-08
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 지출은 비용계정(선거비용/선거비용외)으로만 기록될 뿐 "어느 수입원(보조금·후원회기부금·후보자자산…)에서 충당했는지"는 장부에 없음. 회계 담당자는 결산 단계에서야 자금원별 배분(`settlement-calc` 규칙2)을 보게 되어, **지출 입력 시점에 "이번 지출을 어느 수입계정에 태울지" 가늠할 근거가 없다** |
| **Solution** | 지출내역관리 페이지에 **자금원별 충당 현황 패널**을 추가 — 각 자금원(보조금/보조금외/후보자자산/후원회기부금/기타)의 ① 수입 총액 ② 충당 추정 지출액(법정 우선순위 배분) ③ 가용잔액(아직 쓸 수 있는 돈)을 한눈에 표시. 결산의 `computeBalances.byFundSource`와 동일 규칙을 재사용해 결산 결과와 정합 |
| **Function/UX Effect** | 지출을 입력·검토하는 화면에서 "보조금은 선거비용으로 ◯◯원 남았고, 후원회기부금은 ◯◯원 남았다"를 즉시 확인 → **어느 수입계정으로 지출을 할당할지 메뉴 이동 없이 판단** |
| **Core Value** | 자금원 용도제한·보전 한도를 사전에 가늠 → 초과지출·용도위반을 입력 단계에서 예방하는 "할당 나침반" |

---

## 1. Overview

### 1.1 Purpose

정치자금 회계에서 수입은 **자금원별로 용도·한도가 다릅니다** — 보조금은 선거비용에 우선 충당해야 하고, 후원회기부금·후보자자산은 보전 대상 여부가 갈립니다. 그러나 `acc_book`의 지출 행은 비용계정(`item_sec_cd` = 선거비용/선거비용외)만 가질 뿐, **어느 자금원에서 나갔는지 컬럼이 없습니다.** 자금원 배분은 결산 시점에 `settlement-calc`의 규칙2(자금출처별 보전 비인정분 재배분)가 사후 계산할 뿐입니다.

이 기능은 지출내역관리 페이지 상단에 **자금원별 충당 현황 패널**을 추가하여, 결산과 동일한 배분 규칙으로 "자금원별 수입 / 충당 추정 지출 / 가용잔액"을 보여줍니다. 담당자는 지출을 입력·검토하면서 **"이 지출을 어느 수입계정으로 가늠할지"를 즉시 판단**할 수 있습니다.

### 1.2 Background

- **수입 = 자금원**, **지출 = 비용계정**으로 코드 체계가 분리되어 있어 1:1 매핑이 장부에 없음.
  - 자금원(수입 `acc_sec_cd`): 82=보조금, 83=보조금외, 84=후보자자산, 85=후원회기부금 (`funding-source.ts`).
  - 비용계정(지출 `item_sec_cd`): 코드명 "선거비용" / 그 외 = 선거비용외 (`ledger-summary.ts:131`).
- **재사용 자산이 이미 충분**:
  - `classifyFundingSource(acc_sec_cd, name)` — 자금원 4분류 + 기타 (SSOT).
  - `buildIncomeSummary()` — 자금원별 수입 집계 breakdown (`ledger-summary.ts:110`).
  - `computeBalances(rows, { applyFundSourceRedistribution })` — `byFundSource`(보전/비보전) breakdown + 규칙2 재배분 (`settlement-calc.ts:191`).
  - `LedgerSummaryHeader` — 패널/배지 UI 컨벤션 (수입 파랑/지출 빨강/잔액 초록).
- **충당 배분 규칙(법정 우선순위)**: 보조금→선거비용 우선 충당, 초과분은 자산 선거비용으로 이전, 후원회기부금 잔액→자산 선거비용 — 이미 `settlement-calc.ts:243-250`에 구현됨. 본 기능은 이 결과를 **지출 화면에서 미리 보여주는 가시화**가 핵심이며 새 회계규칙을 만들지 않는다.
- 지출 페이지는 이미 `summary{income,expense,balance}`와 필터 합계를 보유 → 추가 DB 조회 없이 재집계 가능. 단, 자금원별 충당 현황은 **수입+지출 전체 행**이 필요(현재 지출 페이지는 지출 행만 조회) → 데이터 확보 방식 결정 필요(§5 Open Questions).

### 1.3 Related Documents

- 지출 페이지: `app/src/app/dashboard/expense/page.tsx`
- 회계 API: `app/src/app/api/acc-book/route.ts` (incm_sec_cd 필터·summary 반환)
- 자금원 분류: `app/src/lib/accounting/funding-source.ts`
- 결산 계산(byFundSource·규칙2): `app/src/lib/accounting/settlement-calc.ts`
- 현황 요약 빌더: `app/src/lib/accounting/ledger-summary.ts`
- 요약 헤더 UI: `app/src/components/dashboard/LedgerSummaryHeader.tsx`
- 선행 Plan: `docs/01-plan/features/{ledger-summary-header,fund-source-redistribution}.plan.md`

---

## 2. Scope

### 2.1 In Scope

- [ ] **자금원별 충당 현황 빌더(순수 함수)** — 수입+지출 행 → 자금원별 `{ 수입액, 충당지출액(추정), 가용잔액, 비율 }`. `computeBalances`/`classifyFundingSource` 재사용으로 결산과 정합.
- [ ] **충당 현황 패널 UI** — 지출내역관리 페이지 상단(기존 `LedgerSummaryHeader` 아래 또는 확장)에 자금원별 막대/배지. 가용잔액 음수·임박 시 경고 톤(warn).
- [ ] **데이터 확보** — 자금원 현황 계산에 필요한 수입 행 확보(전체 org 합계 기준; §5에서 방식 확정).
- [ ] **후보자(candidate) 우선 적용** — 자금원·보전 개념은 후보자 전용. orgType 분기(`buildExpenseSummary`의 candidate 분기와 동일 패턴).
- [ ] **단위 테스트** — 빌더 순수 함수(배분 우선순위, 가용잔액 0/음수, 자금원 누락 케이스).

### 2.2 Out of Scope

- 지출 행에 자금원 컬럼을 **실제 저장**하는 스키마 변경(본 기능은 추정·가시화만; 실제 할당 저장은 후속 과제).
- 보조금 종류 세분화(82 외 4/5/6/104 등) — 현 데이터는 82만 존재(status `phase1Research` 미해결 항목 승계).
- 정당/국회의원/후원회 orgType 전용 배분 규칙(후보자 우선).
- 결산 페이지/보고서(HWPX·Excel)의 자금원 배분 로직 변경.

### 2.3 Assumptions

- 충당 배분의 "정답"은 결산의 `computeBalances` 결과이며, 본 패널은 **동일 함수를 호출한 추정 미리보기**다(별도 규칙 신설 금지).
- "가용잔액"은 _자금원 수입액 − 해당 자금원에 배분된 지출액_ 으로 정의하며, 음수는 초과충당(경고) 신호로 표시한다.

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-01 | 자금원(보조금/보조금외/후보자자산/후원회기부금/기타)별로 **수입 총액**을 집계해 표시 | High |
| FR-02 | 결산과 동일한 우선순위 배분으로 각 자금원의 **충당 추정 지출액**을 계산·표시 | High |
| FR-03 | 자금원별 **가용잔액**(수입−충당지출) 표시, 음수/임박은 경고 톤 | High |
| FR-04 | 후보자 orgType에서만 패널 노출(자금원/보전은 후보자 개념) | High |
| FR-05 | 패널 각 자금원의 수입/지출/잔액 합계가 결산 페이지 `byFundSource`와 **수치 일치**(정합성) | High |
| FR-06 | 빌더는 React/Next 비의존 순수 함수 → 단위 테스트 가능 | Medium |
| FR-07 | 자금원별 비율(전체 수입 대비) 막대 시각화 | Medium |
| FR-08 | 초보자 모드 도움말(HelpTooltip)로 "충당/가용잔액" 개념 설명 | Low |

### 3.2 Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-01 | 정합성 | 결산(`computeBalances`)과 단일 소스 공유 — 자금원 배분 규칙 중복 정의 금지 |
| NFR-02 | 성능 | 추가 DB 왕복 최소화(기존 조회 재사용 또는 1회 추가 조회) |
| NFR-03 | 일관성 | 색상·금액 포맷·배지 컨벤션을 `LedgerSummaryHeader`/DESIGN.md와 일치 |
| NFR-04 | 테스트 | 빌더 순수 함수 단위 테스트 + 결산 정합 회귀 테스트 |

---

## 4. Success Criteria

- [ ] 후보자 지출내역관리 페이지에서 자금원별 수입/충당지출/가용잔액 패널이 보인다.
- [ ] 패널 수치가 결산 페이지의 자금원별 결과와 일치한다(FR-05).
- [ ] 가용잔액 음수 자금원이 경고 톤으로 식별된다.
- [ ] 빌더 순수 함수 단위 테스트 통과, 기존 테스트 무회귀(lint 0 / build 성공).

---

## 5. Open Questions

1. **데이터 확보 방식** — 자금원 현황은 수입+지출 전체가 필요. (a) 지출 페이지에서 수입 합계를 추가 조회 vs (b) `/api/acc-book` GET에 `fundingStatus` 요약 필드 추가 vs (c) 결산 RPC 재사용. → 설계 단계에서 결정(NFR-02 고려).
2. **필터 연동 범위** — 충당 현황은 본질적으로 **org 전체 누적**(기간 필터와 무관)이어야 의미. 지출 테이블의 날짜/계정 필터와 분리할지, "전체 기준" 고정 배지로 둘지.
3. **배분 추정의 면책 표기** — "추정치이며 확정은 결산 기준"임을 UI에 명시할지(용도위반 오해 방지).
4. **가용잔액 정의의 세분** — 보전 대상(선거비용)·비보전 가용을 나눠 보여줄지, 단일 잔액으로 둘지.

---

## 6. Implementation Phases (초안)

| Phase | 내용 | 산출물 |
|-------|------|--------|
| P1 | 충당 현황 빌더 순수 함수 + 단위 테스트 | `lib/accounting/funding-allocation.ts`(가칭) |
| P2 | 데이터 확보(§5-1 결정 반영) | acc-book API 또는 페이지 조회 보강 |
| P3 | 충당 현황 패널 UI(orgType 분기) | `LedgerSummaryHeader` 확장 또는 신규 패널 |
| P4 | 결산 정합 회귀 테스트 + 도움말/면책 표기 | 테스트·HELP_TEXTS |

---

## 7. Next Step

설계 단계(`/pdca design expense-funding-allocation`)에서 §5 Open Questions(특히 데이터 확보 방식·필터 연동)를 확정하고, 빌더 함수 시그니처와 패널 컴포넌트 구조를 구체화한다.
