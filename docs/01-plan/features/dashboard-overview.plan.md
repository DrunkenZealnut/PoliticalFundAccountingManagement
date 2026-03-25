# 메인페이지 전체 현황 대시보드 Planning Document

> **Summary**: 대시보드 메인페이지를 수입/지출 요약 카드 5개에서 차트, 최근 거래, 카테고리 분석, 바로가기를 포함한 종합 현황 대시보드로 확장
>
> **Project**: PoliticalFundAccountingManagement
> **Author**: Claude
> **Date**: 2026-03-25
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 현재 대시보드는 수입/지출 합계와 잔액만 표시하여, 회계 담당자가 전체 현황을 파악하려면 여러 메뉴를 직접 탐색해야 함 |
| **Solution** | 월별 추이 차트, 카테고리별 지출 분석, 최근 거래 내역, 영수증 처리 현황, 주요 기능 바로가기를 대시보드에 통합 |
| **Function/UX Effect** | 로그인 후 한 화면에서 자금 흐름, 이상 징후, 미처리 항목을 즉시 확인 가능 → 의사결정 시간 단축 |
| **Core Value** | 정치자금 회계 투명성 강화 및 실무 효율 향상 — "한눈에 보는 회계 현황" |

---

## 1. Overview

### 1.1 Purpose

현재 대시보드(`dashboard/page.tsx`)는 수입 합계, 지출 합계, 잔액, 거래처 수 등 5개 카드만 표시합니다. 회계 담당자가 전체 자금 흐름, 카테고리별 분석, 최근 활동을 파악하려면 수입/지출 메뉴를 각각 탐색해야 합니다.

이 기능은 대시보드를 종합 현황 페이지로 확장하여, 로그인 직후 핵심 회계 정보를 한눈에 파악할 수 있도록 합니다.

### 1.2 Background

- 정치자금 회계는 법적 보고 의무가 있어, 수입/지출 현황의 실시간 파악이 중요
- 현재 사용자는 잔액 확인 후 세부 내역을 보려면 별도 메뉴 진입 필요
- 기관유형(정당/국회의원/후보자/후원회)별로 관심 지표가 다름
- `acc_book` 테이블에 모든 거래 데이터가 이미 존재하며, `calculate_balance` RPC도 활용 가능

### 1.3 Related Documents

- 현재 대시보드: `app/src/app/dashboard/page.tsx`
- 회계 API: `app/src/app/api/acc-book/route.ts`
- 코드 참조 API: `app/src/app/api/codes/route.ts`

---

## 2. Scope

### 2.1 In Scope

- [ ] 수입/지출 월별 추이 바 차트 (최근 6개월)
- [ ] 지출 카테고리별 비율 도넛 차트
- [ ] 최근 거래 내역 테이블 (최근 10건, 바로가기 포함)
- [ ] 영수증 처리 현황 (미첨부 건수 알림)
- [ ] 주요 기능 바로가기 그리드 (기관유형별 차별화)
- [ ] 기존 요약 카드 UI 개선 (아이콘, 전월 대비 증감률)

### 2.2 Out of Scope

- 실시간 Supabase 구독 (Realtime) — 새로고침 기반으로 충분
- 대시보드 PDF/Excel 내보내기 — 별도 기능으로 분리
- 커스텀 위젯 드래그앤드롭 배치 — 과도한 복잡성
- 다중 기관 비교 뷰 — 현재 단일 기관 선택 구조

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | 월별 수입/지출 추이 바 차트 표시 (최근 6개월) | High | Pending |
| FR-02 | 지출 항목별(item_sec_cd) 비율 도넛 차트 표시 | High | Pending |
| FR-03 | 최근 거래 10건 테이블 (날짜, 구분, 내용, 금액) | High | Pending |
| FR-04 | 영수증 미첨부 건수 배지 알림 (rcp_yn = 'N') | Medium | Pending |
| FR-05 | 기관유형별 주요 기능 바로가기 그리드 | Medium | Pending |
| FR-06 | 요약 카드에 전월 대비 증감률(%) 표시 | Medium | Pending |
| FR-07 | 로딩 스켈레톤 UI | Low | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Performance | 대시보드 초기 로딩 < 2초 | Supabase 쿼리 최적화, 병렬 fetch |
| Responsiveness | 모바일(360px)~데스크탑(1440px) 반응형 | 브라우저 resize 테스트 |
| Accessibility | 차트 color contrast WCAG AA | 색상 대비 4.5:1 이상 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] 7개 기능 요구사항 모두 구현
- [ ] 기관유형 4종(정당/국회의원/후보자/후원회) 모두 정상 동작
- [ ] 모바일/태블릿/데스크탑 반응형 확인
- [ ] 빌드 에러 없음

### 4.2 Quality Criteria

- [ ] TypeScript strict 모드 에러 없음
- [ ] ESLint 경고 0건
- [ ] 차트 라이브러리 번들 사이즈 < 100KB gzipped

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 차트 라이브러리 번들 사이즈 증가 | Medium | High | Recharts 트리쉐이킹, dynamic import 사용 |
| acc_book 대량 데이터 시 쿼리 느림 | High | Medium | 서버사이드 집계 RPC 또는 날짜 범위 제한 |
| 기관유형별 분기 복잡도 증가 | Medium | Medium | 설정 객체 패턴으로 유형별 차이 관리 |

---

## 6. Architecture Considerations

### 6.1 Project Level Selection

| Level | Characteristics | Recommended For | Selected |
|-------|-----------------|-----------------|:--------:|
| **Starter** | Simple structure | Static sites | ☐ |
| **Dynamic** | Feature-based, BaaS integration | Web apps with backend | ☑ |
| **Enterprise** | Strict layer separation | High-traffic systems | ☐ |

### 6.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| Framework | Next.js App Router | Next.js | 기존 프로젝트 구조 유지 |
| State Management | Zustand | Zustand | 기존 auth store 패턴 유지 |
| Chart Library | Recharts / Chart.js / Nivo | Recharts | React 친화적, 트리쉐이킹 지원, 번들 경량 |
| Data Fetching | Supabase client direct | Supabase | 기존 패턴 유지, 병렬 Promise.all |
| Styling | Tailwind CSS + shadcn/ui | Tailwind | 기존 프로젝트 스택 |

### 6.3 컴포넌트 구조

```
app/src/app/dashboard/page.tsx          ← 수정 (메인 대시보드)
app/src/components/dashboard/
  ├── SummaryCards.tsx                   ← 개선된 요약 카드 (증감률 포함)
  ├── MonthlyTrendChart.tsx             ← 월별 수입/지출 바 차트
  ├── ExpenseCategoryChart.tsx          ← 지출 카테고리 도넛 차트
  ├── RecentTransactions.tsx            ← 최근 거래 내역 테이블
  ├── QuickActions.tsx                  ← 기관유형별 바로가기
  └── ReceiptAlert.tsx                  ← 영수증 미첨부 알림
```

---

## 7. Convention Prerequisites

### 7.1 Existing Project Conventions

- [x] TypeScript configuration (`tsconfig.json`)
- [x] Tailwind CSS + shadcn/ui 컴포넌트
- [x] Zustand 상태 관리
- [x] Supabase 클라이언트 직접 호출 패턴
- [x] 한국어 숫자 포맷: `toLocaleString("ko-KR")`

### 7.2 Conventions to Define/Verify

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| **차트 색상** | 없음 | 수입(blue-600), 지출(red-500), 잔액(green-600) | High |
| **Dashboard 컴포넌트** | 없음 | `components/dashboard/` 디렉토리 구조 | High |
| **날짜 포맷** | acc_date: YYYYMMDD string | 차트 표시: YYYY-MM | Medium |

### 7.3 Environment Variables Needed

| Variable | Purpose | Scope | To Be Created |
|----------|---------|-------|:-------------:|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 접속 | Client | 기존 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 인증 | Client | 기존 |

추가 환경변수 불필요 — 기존 Supabase 연결 그대로 활용

---

## 8. Next Steps

1. [ ] Design 문서 작성 (`dashboard-overview.design.md`)
2. [ ] Recharts 의존성 추가 및 동적 import 설정
3. [ ] 대시보드 컴포넌트 구현

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-25 | Initial draft | Claude |
