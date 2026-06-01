---
template: plan
version: 1.2
feature: dashboard-org-differentiation
date: 2026-06-01
author: DrunkenZealnut
project: 정치자금 회계관리 시스템
status: Draft
---

# 메인 대시보드 조직 유형별 콘텐츠 차별화 (후보계좌 vs 후원회계좌) Planning Document

> **Summary**: 메인 대시보드 본문을 후보자(선거비용 지출·보전 중심)와 후원회(후원금 모금·기부 중심) 회계 특성에 맞게 서로 다른 요약 카드·차트·알림으로 차별화한다.
>
> **Project**: 정치자금 회계관리 시스템
> **Author**: DrunkenZealnut
> **Date**: 2026-06-01
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 후보자·후원회·정당·국회의원 모든 조직이 동일한 대시보드 본문(총수입/총지출/잔액/거래처, 월별추이, 지출카테고리)을 본다. 후보자(선거비용 지출·보전)와 후원회(후원금 모금·기부)는 회계 관심사가 근본적으로 다른데 동일 화면이라 핵심 지표가 보이지 않는다. |
| **Solution** | 공통 대시보드 레이아웃 틀은 유지하되, `orgType`(candidate/supporter)에 따라 요약 카드 지표·메인 차트·알림 콘텐츠를 분기한다. 후보자는 선거비용/선거비용외·보전예상액·수입출처·집행률을, 후원회는 모금총액·추이·기부자수·후보자 기부금 지급현황을 강조한다. |
| **Function/UX Effect** | 사용자가 자기 조직 유형에 맞는 핵심 회계 정보를 첫 화면에서 즉시 파악. 후보자는 보전 대비 지출 현황을, 후원회는 모금·기부 흐름을 한눈에 확인. 불필요한 지표 노출 제거. |
| **Core Value** | 선관위 정치자금 회계 실무 흐름(후보자=지출/보전, 후원회=모금/기부)에 맞춘 역할 기반 대시보드로 데이터 정확성과 업무 효율을 동시에 향상. |

---

## 1. Overview

### 1.1 Purpose

메인 대시보드(`/dashboard`)가 로그인한 조직의 유형(`orgType`)에 따라 **본문 콘텐츠**를 다르게 보여주도록 한다. 현재는 `QuickActions` 바로가기 버튼만 조직별로 다르고, 핵심 요약 카드·차트·알림은 모든 조직이 동일하다.

이번 작업의 1차 대상은 사용자가 명시한 **후보계좌(candidate)**와 **후원회계좌(supporter)** 두 유형이다. 정당(party)·국회의원(lawmaker)은 현행 공통(기본) 뷰를 유지한다.

### 1.2 Background

정치자금 회계상 두 조직의 관심사는 본질적으로 다르다.

| 구분 | 후보자(candidate) | 후원회(supporter) |
|------|-------------------|-------------------|
| 핵심 업무 | 선거비용 지출 및 **보전 청구** | 후원금(기부금) **모금** 및 후보자 지급 |
| 지출 성격 | 선거비용 / 선거비용외 구분이 중요 | 모금 경비 + 후보자 기부금 지급 |
| 수입 성격 | 보조금·후원회기부금·자산 등 **출처 구분** | 기부자별 후원금 |
| 첫 화면에 필요한 것 | 보전 대상 지출 비중, 집행률, 수입 출처 | 모금 총액·추이, 기부자 수, 후보자 지급 현황 |

현재 대시보드는 이 차이를 반영하지 못해, 후원회 사용자도 "지출 카테고리 차트" 같은 후보자 중심 위젯을 보게 된다.

### 1.3 Related Documents

- 기존 Plan: `docs/01-plan/features/dashboard-overview.plan.md`
- 수입 출처 분류 근거: `docs/01-plan/features/fund-source-redistribution.plan.md`
- 도메인 로직:
  - `app/src/lib/expense-types.ts` — `detectItemCategory()` (선거비용/선거비용외)
  - `app/src/lib/accounting/funding-source.ts` — `classifyFundingSource()` (보조금/보조금외/후원회기부금/후보자자산)
- 구현 대상:
  - `app/src/app/dashboard/page.tsx`
  - `app/src/lib/dashboard/use-dashboard-data.ts`
  - `app/src/components/dashboard/*`

---

## 2. Scope

### 2.1 In Scope

- [ ] `useDashboardData`를 확장하여 조직 유형별 파생 지표 계산 (선거비용/선거비용외, 수입 출처 4분류, 후원회→후보자 기부금 지급액 등)
- [ ] **후보자(candidate)** 전용 요약 카드: 선거비용 지출 / 선거비용외 지출 / 선거비용 보전 예상액 / 잔액·지출 집행률
- [ ] **후보자** 메인 차트: 수입 출처 구성(보조금·후원회기부금·자산 등) + 선거비용 vs 선거비용외 비중
- [ ] **후원회(supporter)** 전용 요약 카드: 후원금 모금 총액 / 기부자 수·신규 기부자 / 후보자 기부금 지급 누계
- [ ] **후원회** 메인 차트: 월별 모금 추이 + 후보자 기부금 지급 현황
- [ ] `orgType` 기반 대시보드 콘텐츠 분기 로직 (공통 레이아웃 틀 유지)
- [ ] 정당/국회의원/타입 미상 시 기존 기본 뷰로 폴백
- [ ] 단위 테스트: 파생 지표 계산 함수

### 2.2 Out of Scope

- 대시보드 컴포넌트 파일 전면 분리(별도 페이지 라우트) — 콘텐츠 위주 차별화로 결정됨
- 정당(party)·국회의원(lawmaker) 전용 대시보드 신규 설계 (현행 공통 뷰 유지)
- 후원회 **연간 모금 한도 게이지** (사용자 선택에서 제외)
- DB 스키마 변경 (기존 `acc_book` / `acc_sec_cd` / `item_sec_cd` 활용)
- `QuickActions` 바로가기 로직 재설계 (이미 조직별 분기 존재, 유지)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | `orgType === "candidate"`일 때 요약 카드를 [선거비용 지출, 선거비용외 지출, 선거비용 보전 예상액, 잔액/집행률]로 표시 | High | Pending |
| FR-02 | `orgType === "candidate"`일 때 메인 차트를 [수입 출처 구성, 선거비용 vs 선거비용외 비중]으로 표시 | High | Pending |
| FR-03 | `orgType === "supporter"`일 때 요약 카드를 [후원금 모금 총액, 기부자 수/신규 기부자, 후보자 기부금 지급 누계, 잔여 모금액]로 표시 | High | Pending |
| FR-04 | `orgType === "supporter"`일 때 메인 차트를 [월별 모금 추이, 후보자 기부금 지급 현황]으로 표시 | High | Pending |
| FR-05 | `useDashboardData`가 선거비용/선거비용외 합계, 수입 출처별 합계, 후원회→후보자 기부금 지급액, 기부자 수를 계산해 반환 | High | Pending |
| FR-06 | 선거비용 보전 예상액 = 보전 대상 선거비용 합계 (단순 합산, 한도 검증은 별도 기능) | Medium | Pending |
| FR-07 | 신규 기부자 = 당월 첫 거래가 발생한 기부자(cust_id) 수 | Medium | Pending |
| FR-08 | `orgType`이 party/lawmaker/null이면 기존 공통 대시보드(현행) 그대로 표시 | High | Pending |
| FR-09 | 데이터 로딩/빈 데이터 상태에서도 조직별 카드 레이아웃이 깨지지 않음 (skeleton/0원 표시) | Medium | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Performance | 기존 단일 `acc_book` 쿼리 내에서 클라이언트 파생 계산 (추가 네트워크 호출 0건) | 네트워크 탭 / 코드 리뷰 |
| 유지보수성 | 조직별 지표 계산은 순수 함수로 분리하여 단위 테스트 가능 | Vitest 커버리지 |
| 디자인 일관성 | DESIGN.md의 카드/색상/spacing 규칙 준수, 기존 `SummaryCards` 톤 유지 | 디자인 리뷰 |
| 회귀 안전 | 정당/국회의원 뷰 및 기존 위젯 동작 변화 없음 | 기존 동작 대조 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] FR-01 ~ FR-09 모두 구현
- [ ] 파생 지표 계산 순수 함수 단위 테스트 작성·통과
- [ ] 후보자/후원회/정당 3개 유형 화면 수동 확인
- [ ] `npm run lint` / `npm run build` 통과
- [ ] DESIGN.md 위반 없음

### 4.2 Quality Criteria

- [ ] 파생 지표 함수 테스트 커버리지 80% 이상
- [ ] Zero lint errors
- [ ] Build 성공

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 선거비용/선거비용외 구분 기준(`detectItemCategory`)이 일부 항목 미분류(null) 반환 | Medium | Medium | null은 "미분류"로 별도 집계하거나 선거비용외로 폴백, 합계 누락 방지 |
| 수입 출처 분류가 `acc_sec_cd` 코드명 의존 → 신규 코드 누락 가능 | Medium | Low | `FUNDING_SOURCE_BY_ACC_SEC_CD` 미매핑 시 "기타"로 처리, 합계 보존 |
| 후원회→후보자 기부금 식별 기준 모호 (지출 중 어떤 코드가 기부금 지급인지) | High | Medium | Design 단계에서 `acc_sec_cd=85`(후원회기부금)/관련 item 코드 검증, 실데이터(Fund_Data_2.db 55건)로 확인 |
| 조직별 분기로 컴포넌트 복잡도 증가 | Low | Medium | 카드/차트 구성을 데이터 기반 config로 추출, 분기는 config 선택만 담당 |
| 정당/국회의원 회귀 | Medium | Low | 기본 뷰 경로를 변경하지 않고 candidate/supporter만 신규 분기 추가 |

---

## 6. Architecture Considerations

### 6.1 Project Level

기존 Next.js 16 App Router + Supabase 기반 **Dynamic** 수준 웹앱. 신규 레벨 선택 불필요 — 기존 구조 준수.

### 6.2 Key Architectural Decisions

| Decision | Selected | Rationale |
|----------|----------|-----------|
| 차별화 방식 | 공통 레이아웃 + `orgType` 콘텐츠 분기 | 사용자 결정(콘텐츠 위주). 라우트/페이지 분리 대비 유지보수·회귀 위험 최소 |
| 데이터 계산 위치 | `use-dashboard-data.ts` 내 파생 지표 추가 | 기존 단일 쿼리 재사용, 추가 API 호출 없음 |
| 지표 계산 분리 | 순수 함수(`processData` 확장 또는 별도 모듈) | 단위 테스트 용이, 조직별 로직 격리 |
| UI 분기 | 조직별 카드/차트 config 배열 + 렌더러 | 컴포넌트 중복 최소화, 일관된 디자인 |
| 도메인 매핑 | `detectItemCategory`, `classifyFundingSource` 재사용 | SSOT 원칙 — 중복 정의 금지 |

### 6.3 영향 범위 (파일)

```
app/src/app/dashboard/page.tsx                      (분기 진입점)
app/src/lib/dashboard/use-dashboard-data.ts         (파생 지표 계산 확장)
app/src/components/dashboard/SummaryCards.tsx        (조직별 카드 config 수용)
app/src/components/dashboard/*Chart.tsx              (후보/후원회 전용 차트 추가)
app/src/lib/dashboard/org-metrics.ts (신규)          (순수 계산 함수 + 테스트)
```

---

## 7. Convention Prerequisites

### 7.1 Existing Conventions

- [x] `CLAUDE.md` 코딩 컨벤션 + 아키텍처 가이드 존재
- [x] `DESIGN.md` 디자인 시스템 (UI 변경 전 필독)
- [x] ESLint v9 flat config / TypeScript / Vitest 구성 완료
- [x] 공유 모듈 SSOT 원칙 (`expense-types.ts`, `funding-source.ts`) — 중복 금지

### 7.2 To Verify in Design Phase

| Category | 확인 항목 |
|----------|-----------|
| 도메인 코드 | 후원회→후보자 기부금 지급의 정확한 `acc_sec_cd`/`item_sec_cd` 식별 기준 |
| 보전 대상 | "선거비용 보전 예상액"의 정확한 산식 (보전 대상 선거비용 정의) |
| 신규 기부자 | "신규" 판정 기준(당월 최초 거래 vs 전체 기간 최초) 확정 |
| 데이터 | Fund_Data_1.db(후보 41건)/Fund_Data_2.db(후원회 55건) 실데이터로 지표 검증 |

### 7.3 Environment Variables

신규 환경 변수 불필요 (기존 Supabase 설정 사용).

---

## 8. Next Steps

1. [ ] Design 문서 작성 (`/pdca design dashboard-org-differentiation`)
   - 후보자/후원회 카드·차트 와이어프레임
   - 파생 지표 계산 산식 및 코드 매핑표 확정
2. [ ] 실데이터로 지표 검증 (후원회 기부금 지급 식별 기준)
3. [ ] 구현 (`/pdca do dashboard-org-differentiation`)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-01 | 초안 작성 (사용자 요구사항 + 조직별 핵심지표 확정) | DrunkenZealnut |
