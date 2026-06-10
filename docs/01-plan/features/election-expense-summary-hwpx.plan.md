# election-expense-summary-hwpx Planning Document

> **Summary**: (예비)후보자 회계보고서 서식 22-2 「선거비용 지출내역 집계표」를 acc_book 지출 데이터로부터 자동 채워 .hwpx 로 생성한다. (회계보고서 4종 중 유일하게 미구현이던 서식)
>
> **Project**: 정치자금 회계관리 시스템 (political-fund-accounting-management)
> **Version**: 0.7.0.0 → 0.8.0.0(예정)
> **Author**: DrunkenZealnut
> **Date**: 2026-06-09
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 회계보고서 4종(22-1·22-3·22-4)은 데이터 채움 생성이 되지만 **22-2「선거비용 지출내역 집계표」만 빈 양식**으로 남아, 사용자가 선거비용을 자금원별로 직접 손으로 집계해 채워야 한다. |
| **Solution** | 기존 `report-summary-builder`(22-1)의 자금원 4분류 집계 로직을 재사용하되 **선거비용 지출만** 필터링하고, 22-2 표 레이아웃(계/후보자자산/후원회기부금/보조금/보조금외 + 선거사무소·선거연락소 행)에 맞춘 신규 빌더로 `accounting-report` API 의 formId 분기에 `22-2` 를 추가한다. |
| **Function/UX Effect** | 제출서류 화면에서 22-2 를 다른 서식과 동일하게 "데이터 채움" 버튼 한 번으로 다운로드. 수작업 집계·검산 부담 제거, 22-1 총괄표와 자금원 구분 기준이 일치해 정합성 확보. |
| **Core Value** | 선관위 제출용 회계보고서 자동생성 **완결성**(4/4 서식) — 후보자가 별도 도구 없이 제출 가능한 상태 달성. |

---

## 1. Overview

### 1.1 Purpose

(예비)후보자 회계보고서 서식 **22-2「선거비용 지출내역 집계표」** 를 `acc_book` 지출 데이터로부터 자동으로 채워 `.hwpx` 파일로 생성한다. 이미 구현된 22-1(수입·지출보고서)·22-3(재산명세서)·22-4(수입·지출부)와 동일한 "데이터 채움" UX 로 통합한다.

### 1.2 Background

- 직전 작업 `candidate-accounting-report-hwpx`(PR #59, v0.5.0.0)에서 회계보고서 22-1·22-3·22-4 데이터 채움을 구현하면서 **22-2 는 명시적으로 제외**했다. (`form-fields.ts:186` 의 22-2 만 `dataFill` 플래그 없음 → 빈 템플릿 다운로드)
- 22-2 는 **선거비용**(선거비용외 제외) 지출을 **자금원 구분별**(후보자자산/후원회기부금/보조금/보조금외)로, 그리고 **지출 장소별**(선거사무소/선거연락소)로 교차 집계하는 표다.
- 자금원 4분류는 22-1 과 동일한 기준(`lib/accounting/funding-source.ts` SSOT) 을 쓰므로 두 보고서 간 합계가 어긋나면 안 된다 → 기존 빌더 재사용이 정합성·유지보수 양쪽에 유리.

#### 22-2 실측 표 구조 (`form-22-2.hwpx` section0 분석)

| 행 \ 열 | c0 구분 | c1 세부 | c2 계 | c3 후보자자산 | c4 후원회기부금 | c5 보조금 | c6 보조금외 | c7 비고 |
|---|---|---|---|---|---|---|---|---|
| r2 | **합계** | (span) | 72,500,000 | 65,000,000 | 2,500,000 | 3,500,000 | 3,700,000 | |
| r3 | **선거사무소** | (span) | 67,500,000 | 60,000,000 | 2,500,000 | 2,500,000 | 2,500,000 | |
| r4 | **선거연락소**(c0 rowSpan) | 연락소 계 | 5,000,000 | 5,000,000 | 0 | 1,000,000 | 1,200,000 | |
| r5 | | ○○연락소 | 670,000 | 540,000 | 0 | 200,000 | 0 | |
| r6+ | | △△연락소 … | ⋮ | ⋮ | ⋮ | ⋮ | ⋮ | |

- 헤더: `구분 | 계 | 후보자 자산 | 후원회 기부금 | 정당지원금(보조금/보조금외) | 비고` — "계" = 후보자자산+후원회기부금+보조금+보조금외.
- **양식 주석**: 선거사무소 행 = 연락소 지출분 공제 후 사무소 직접 지출분, 선거연락소 행 = 연락소 지출분만. 합계 = 사무소 + 연락소 계.

### 1.3 Related Documents

- 선행 PDCA: `docs/archive/2026-06/candidate-accounting-report-hwpx/` (22-1·22-3·22-4 구현)
- 코드 SSOT: `app/src/lib/accounting/funding-source.ts`, `app/src/lib/hwpx/report-summary-builder.ts`
- 분류 기준: `app/src/lib/hwpx/report-summary-builder.ts#classifyExpenseCategory` (선거비용/선거비용외), 메모리 `election-item-classification-ssot`
- 양식 정의: `app/src/lib/hwpx/form-fields.ts:186` (id "22-2")
- API: `app/src/app/api/hwpx/accounting-report/route.ts` (formId 분기)

---

## 2. Scope

### 2.1 In Scope

- [ ] 신규 빌더 `lib/hwpx/election-expense-summary-builder.ts` — acc_book 지출행 → 자금원 4분류 × (선거비용만) 집계 → 22-2 뷰모델
- [ ] `form-fields.ts` 의 22-2 항목에 `dataFill: "accounting-report"` 추가 + 템플릿을 `form-22-2-fill.hwpx` 로 교체
- [ ] `make-form-22-2-fill.py` 스크립트 — `form-22-2.hwpx` 에 토큰/마커 주입한 fill 템플릿 생성
- [ ] `accounting-report/route.ts` formId 분기에 `22-2` 추가 (지출만 조회 → 빌더 → 렌더)
- [ ] 22-2 렌더링: **고정 셀 토큰 치환**(합계·선거사무소 행) 방식 — 22-1 `summaryTokens` 패턴 차용 (선거연락소 행 처리는 §3.1 결정에 따름)
- [ ] 단위 테스트: 빌더(집계·선거비용 필터·자금원 분류·합계 검산) + 통합 테스트(템플릿 토큰 치환 무결성)
- [ ] `next.config` `outputFileTracingIncludes` 에 `form-22-2-fill.hwpx` 포함 확인
- [ ] `form-fields.test.ts` 의 dataFill 예외 처리 갱신

### 2.2 Out of Scope

- 22-2 외 다른 서식 변경 (22-1·22-3·22-4 는 그대로)
- 선거연락소 **데이터 모델 신설**(acc_book 에 연락소 식별 컬럼 추가) — §3.1 의 v1 결정이 "사무소 단일 집계"면 스키마 변경 없음
- 후원회(supporter) orgType 대상 — 22-2 는 candidate 전용 (`orgScope: "candidate"`)
- 선거비용외 지출 집계 (22-2 는 선거비용만)

---

## 3. Requirements

### 3.1 핵심 결정 사항 — 선거사무소 / 선거연락소 행 처리 ⚠️

22-2 는 지출을 **선거사무소 vs 선거연락소**로 나누지만, 현재 `acc_book` 스키마에는 **지출이 어느 연락소에서 발생했는지 식별하는 컬럼이 없다.** 세 가지 옵션:

| 옵션 | 내용 | 장점 | 단점 |
|---|---|---|---|
| **A (권고)** | v1 은 **전액을 선거사무소 행**에 집계. 합계=선거사무소, 선거연락소 행은 0/공란. | 스키마 변경 없음, 즉시 구현. 예비후보자·연락소 없는 후보자는 100% 정확. | 연락소 있는 후보자는 사무소/연락소 분리를 수동 조정해야 함(비고 안내) |
| B | acc_book 에 연락소 구분 필드(`branch_id` 등) 신설 + 입력 UI | 정확한 자동 분리 | 스키마 마이그레이션·입력 UI·기존 데이터 마이그레이션 등 범위 대폭 확대 |
| C | 거래별 연락소 태깅을 customer/메모로 휴리스틱 추론 | 중간 | 부정확·복잡, 오집계 위험 |

**✅ 확정: 옵션 A** (2026-06-09 사용자 승인) — 본 PDCA 범위는 A 로 한정하고, B 는 별도 기능으로 분리. (대다수 (예비)후보자는 단일 선거사무소 운영). 따라서 v1 표는 **합계행 + 선거사무소행(전액)** 2개 데이터행만 고정 셀 토큰 치환, 선거연락소 행은 0/공란 + 비고 안내.

### 3.2 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | acc_book 지출행 중 **선거비용**(classifyExpenseCategory==="선거비용")만 자금원 4분류로 집계 | High | Pending |
| FR-02 | 자금원 구분은 22-1 과 동일 SSOT(`classifyFundingSource`) 사용 → 22-1 선거비용 합계와 22-2 합계 일치 | High | Pending |
| FR-03 | "계" 열 = 후보자자산+후원회기부금+보조금+보조금외, 합계행 = 각 열의 총합 (검산 일치) | High | Pending |
| FR-04 | 22-2 를 제출서류 화면에서 "데이터 채움"으로 다운로드 (다른 22-x 와 동일 UX) | High | Pending |
| FR-05 | 작성 연월일·선거명·회계책임자 등 머리/꼬리 고정 필드 토큰 치환 (22-1 패턴 재사용) | Medium | Pending |
| FR-06 | (옵션 A 채택 시) 선거사무소 행=전액, 선거연락소 행=0, 비고에 "연락소 분리 수동 조정" 안내 | Medium | Pending |
| FR-07 | 금액 0원/지출 없음/선거비용 0건 등 빈 데이터에서도 양식 깨짐 없이 생성 | Medium | Pending |

### 3.3 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| 정합성 | 22-2 자금원별 선거비용 합계 = 22-1 선거비용 열 합계 | 통합 테스트(동일 acc_book → 두 빌더 교차검증) |
| 무결성 | 토큰 치환 후 hwpx XML 태그 균형·ZIP(STORED mimetype) 유효 | generate/owpml-table 패턴, integration test |
| 순수성 | 빌더는 React/Next 비의존 순수 함수 → 단위 테스트 가능 | Vitest |
| 성능 | 단일 org 보고서 생성 < 1s | 기존 22-x 동등 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] FR-01~07 구현 (FR-06 은 채택 옵션에 따름)
- [ ] 빌더 단위 테스트 + 22-2 통합 테스트 작성·통과
- [ ] 22-1↔22-2 선거비용 합계 교차검증 테스트 통과
- [ ] `node node_modules/vitest/vitest.mjs run` 전체 통과 (기존 538+ 유지)
- [ ] gap-detector Match Rate ≥ 90%

### 4.2 Quality Criteria

- [ ] lint 0 (`node node_modules/eslint/bin/eslint.js`)
- [ ] build 성공 (`node node_modules/next/dist/bin/next build`)
- [ ] 실제 한글(HWP)에서 생성 파일 정상 오픈·표 정렬 확인

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 선거사무소/연락소 데이터 부재로 자동 분리 불가 | Medium | High | 옵션 A(사무소 단일 집계)+비고 안내로 범위 한정, B 는 별도 기능 |
| 표가 문단(`<hp:p><hp:run>`) 내장 → 토큰화 시 `</hp:run>` 이중 닫힘 등 태그 깨짐 | High | Medium | 22-1 처럼 **행 복제 없는 고정 셀 토큰 치환**으로 단순화 (연락소 동적행 미사용) |
| 22-1 과 선거비용 분류 기준 어긋나 합계 불일치 | High | Low | 동일 SSOT(`classifyFundingSource`·`classifyExpenseCategory`) 재사용 + 교차검증 테스트 |
| make-form 스크립트 정규식 None 가드 누락(과거 CodeRabbit 지적) | Low | Medium | 기존 make-form-22-x 패턴(`re.search` None 가드) 답습 |
| 22-2 "계" 열에 선거비용외 혼입 | High | Low | 빌더에서 incm=2 & 선거비용만 가산, 단위 테스트로 고정 |

---

## 6. Architecture Considerations

### 6.1 Project Level Selection

| Level | Selected |
|-------|:--------:|
| **Dynamic** (Next.js + Supabase, feature 모듈, 순수 lib 빌더) | ☑ |

기존 프로젝트(Next.js 16 + Supabase + Vitest) 컨벤션을 그대로 따른다. 신규 레벨 결정 없음.

### 6.2 Key Architectural Decisions

| Decision | Selected | Rationale |
|----------|----------|-----------|
| 렌더 방식 | 고정 셀 토큰 치환 (22-1 `generateHwpx`+`summaryTokens` 패턴) | 22-2 표는 합계·사무소 2개 데이터행(옵션 A)이라 동적 행 복제 불필요 → 태그 깨짐 위험 회피 |
| 집계 로직 | `report-summary-builder` 재사용/확장 | 자금원 분류·선거비용 분류 SSOT 공유로 22-1 정합성 보장 |
| API | 기존 `accounting-report` route 의 formId 분기에 `22-2` 추가 | 인증·멤버십 가드·조회 흐름 재사용 |
| 신규 빌더 위치 | `lib/hwpx/election-expense-summary-builder.ts` (순수) | owpml/Next 비의존, Vitest 단위 테스트 |

### 6.3 Folder/Module Touch Points

```
app/
├─ public/hwpx-templates/form-22-2-fill.hwpx   (신규: make 스크립트 산출)
├─ scripts/make-form-22-2-fill.py              (신규)
├─ src/lib/hwpx/
│   ├─ election-expense-summary-builder.ts     (신규: 집계+토큰)
│   ├─ election-expense-summary-builder.test.ts(신규)
│   ├─ form-fields.ts                          (수정: 22-2 dataFill+template)
│   └─ report-summary-builder.ts               (재사용; 필요시 분류 함수 export)
├─ src/app/api/hwpx/accounting-report/route.ts (수정: formId "22-2" 분기)
└─ next.config.*                               (수정: outputFileTracingIncludes)
```

---

## 7. Convention Prerequisites

### 7.1 Existing Project Conventions

- [x] `CLAUDE.md` / `app/AGENTS.md` 코딩 컨벤션 존재 (Next.js 16 docs 우선)
- [x] ESLint v9 flat config, TypeScript strict, Vitest
- [x] HWPX 생성 컨벤션 확립됨 (메모리 `hwpx-form-generator`: fetch 금지·fs.readFile, mimetype STORED)

### 7.2 Conventions to Define/Verify

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| 빌더 네이밍 | `*-builder.ts` + `build*Model` 확립 | `buildElectionExpenseSummaryModel` 동일 패턴 | High |
| 토큰 네이밍 | `{{접두사_열}}` (22-1) | 22-2 토큰 접두사(`사무소_`/`합계_`) + 열 키 | High |
| 분류 SSOT | funding-source / classifyExpenseCategory 확립 | 재사용(중복 정의 금지) | High |

### 7.3 Environment Variables Needed

추가 환경변수 없음 (기존 `SUPABASE_*` 사용).

---

## 8. Next Steps

1. [ ] §3.1 선거사무소/연락소 처리 옵션 확정 (권고: A)
2. [ ] Design 문서 작성 (`/pdca design election-expense-summary-hwpx`) — 토큰 스펙·셀 주소 맵·make 스크립트 상세
3. [ ] 구현 (`/pdca do`) → Gap 분석 (`/pdca analyze`)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-09 | Initial draft (22-2 표 실측 구조·옵션 A 권고 포함) | DrunkenZealnut |
