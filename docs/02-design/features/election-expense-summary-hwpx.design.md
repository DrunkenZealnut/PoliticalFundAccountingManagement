# election-expense-summary-hwpx Design Document

> **Summary**: 서식 22-2「선거비용 지출내역 집계표」를 acc_book 선거비용 지출을 자금원 4분류로 집계해 **고정 셀 토큰 치환**(22-1 패턴)으로 채워 .hwpx 생성. 옵션 A(사무소 단일 집계) 확정.
>
> **Project**: 정치자금 회계관리 시스템
> **Version**: 0.8.0.0(예정)
> **Author**: DrunkenZealnut
> **Date**: 2026-06-09
> **Status**: Draft
> **Planning Doc**: [election-expense-summary-hwpx.plan.md](../../01-plan/features/election-expense-summary-hwpx.plan.md)

---

## 1. Overview

### 1.1 Design Goals

- 22-2 표를 **동적 행 복제 없이** 고정 셀 토큰 치환으로 채운다 (22-1 `generateHwpx`+`summaryTokens` 패턴 복제 → 태그 깨짐 위험 최소화).
- 자금원 분류·선거비용 분류를 기존 SSOT로 재사용해 **22-1 선거비용 합계와 22-2 합계가 항상 일치**하도록 한다.
- 빌더는 React/Next 비의존 순수 함수 → Vitest 단위 테스트.

### 1.2 Design Principles

- **SSOT 재사용**: `classifyFundingSource`(자금원), `classifyExpenseCategory`(선거비용/외) 중복 정의 금지.
- **정합성 우선**: "계 = 가로 5열합" 등식과 "22-1 ↔ 22-2 합계 일치"를 테스트로 고정.
- **옵션 A 단순화**: v1 데이터행 = 합계 + 선거사무소 + 연락소계(=0) 3행만. 개별 연락소는 수기용 빈 양식.

---

## 2. Architecture

### 2.1 Component Diagram

```text
제출서류 페이지(22-2 "데이터채움")
        │ POST {orgId, formId:"22-2"}
        ▼
api/hwpx/accounting-report (formId 분기에 "22-2" 추가)
        │  ├─ acc_book(지출) + codevalue 조회 (22-1/22-4 통합 조회 재사용)
        │  ├─ buildElectionExpenseSummaryModel(rows, getName)   ← 신규(순수)
        │  ├─ electionExpenseSummaryTokens(model)               ← 신규(순수)
        │  └─ generateHwpx(template, tokens)                    ← 기존 코어
        ▼
form-22-2-fill.hwpx (make-form-22-2-fill.py 산출, 15토큰)
        ▼
.hwpx (application/hwp+zip) 다운로드
```

### 2.2 Data Flow

```text
acc_book 지출행 → [선거비용 필터] → [자금원 4분류 가산] → FundingBreakdown
  → office(=전액)/total(=office)/연락소계(=0) → 15 토큰 → 셀 치환 → hwpx
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| election-expense-summary-builder | funding-source, report-summary-builder(classifyExpenseCategory), income-ledger-builder(formatAmount) | 분류·금액포맷 SSOT |
| accounting-report/route | builder, generate(generateHwpx) | 조회·치환·응답 |
| make-form-22-2-fill.py | form-22-2.hwpx | fill 템플릿 산출 |

---

## 3. Data Model

### 3.1 표 셀 주소 맵 (form-22-2.hwpx section0, 실측)

| colAddr | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|
| **의미** | 계 | 후보자자산 | 후원회기부금 | 보조금 | 보조금외 | 비고 |

| rowAddr | 2 | 3 | 4 | 5+ |
|---|---|---|---|---|
| **의미** | 합계 | 선거사무소 | 연락소 계 | 개별 연락소(placeholder) |

- 모든 데이터 금액 셀은 `[text]` run (`<hp:run><hp:t>값</hp:t></hp:run>`), 비고(c7)는 `[self]` 빈 run.
- "계"(c2) = c3+c4+c5+c6 (가로합). 합계행(r2) = 사무소(r3) + 연락소계(r4) (세로합).

### 3.2 Entity Definition (TypeScript)

```typescript
// lib/hwpx/election-expense-summary-builder.ts

/** 자금원 4분류별 선거비용 + 계. */
export interface FundingBreakdown {
  후보자자산: number;
  후원회기부금: number;
  보조금: number;
  보조금외: number;   // ⚠ "기타" 자금원 선거비용은 여기 흡수 (§3.4)
  계: number;          // = 후보자자산 + 후원회기부금 + 보조금 + 보조금외
}

export interface ElectionExpenseSummaryModel {
  office: FundingBreakdown;   // 선거사무소 (옵션 A: 전액)
  branch: FundingBreakdown;   // 선거연락소 계 (옵션 A: 전부 0)
  total: FundingBreakdown;    // 합계 = office + branch (옵션 A: = office)
}

export interface ElectionExpenseSummaryInputRow {
  incm_sec_cd: number;   // 1=수입, 2=지출
  acc_sec_cd: number;    // 자금원 코드
  item_sec_cd: number;   // 과목 코드 (선거비용/외 판별)
  acc_amt: number;
}
```

### 3.3 집계 규칙

1. 입력 행 중 `incm_sec_cd === 2`(지출) **AND** `classifyExpenseCategory(getName(item_sec_cd)) === "선거비용"` 만 대상.
2. `classifyFundingSource(acc_sec_cd, getName(acc_sec_cd))` 로 4분류 가산.
3. `office` 에 전액 가산(옵션 A), `branch` 는 모두 0, `total = office`.
4. 각 `계` = 4분류 합. (가로 검산)

### 3.4 "기타" 자금원 처리 ⚠ (정합성 핵심)

- `classifyFundingSource` 는 82/83/84/85 외 코드를 `"기타"` 로 반환할 수 있다. 그러나 22-2 표에는 기타 열이 없다.
- 만약 기타를 누락하면 **22-1 선거비용 합계 ≠ 22-2 합계** 가 되어 보고서 간 불일치 발생.
- **결정**: 기타 자금원의 선거비용은 **보조금외 열에 흡수**한다. 근거: (a) 22-1 총합과 정합 유지, (b) "계 = 4열 가로합" 등식 유지, (c) (예비)후보자 선거비용 자금원은 사실상 82~85로 분류되어 기타는 0에 수렴. 이 규칙은 빌더 단위 테스트로 고정한다.

---

## 4. API Specification

### 4.1 변경: `POST /api/hwpx/accounting-report`

기존 route 의 `formId` 허용 집합에 `"22-2"` 추가. `TEMPLATES`/`FILENAMES` 확장.

```typescript
const TEMPLATES = {
  "22-1": "form-22-1-fill.hwpx",
  "22-2": "form-22-2-fill.hwpx",   // 추가
  "22-3": "form-22-3-fill.hwpx",
  "22-4": "form-22-4-fill.hwpx",
};
const FILENAMES = {
  ...
  "22-2": "예비후보자_회계보고서_선거비용지출내역집계표.hwpx",  // 추가
};
```

분기 로직 (기존 `else`(22-1/22-4 통합 조회) 블록 내부에 22-2 추가):

```typescript
// 22-1/22-2/22-4 공통: acc_book + customer + codevalue 통합 조회 (기존)
if (formId === "22-4") {
  ... renderIncomeLedgerSection ...
} else if (formId === "22-2") {
  const model = buildElectionExpenseSummaryModel(rows ?? [], getName);
  ({ bytes } = await generateHwpx(template, electionExpenseSummaryTokens(model)));
} else {
  // 22-1
  ... summaryTokens ...
}
```

> 22-2 는 customer 상세 불필요(집계만)하지만, 통합 조회를 그대로 재사용해 코드 분기 최소화. acc_book 수입행은 빌더에서 자동 무시(incm===2 필터).

### 4.2 토큰 스펙 (15개)

`electionExpenseSummaryTokens(model)` 산출:

| prefix \ suffix | _계 | _후보자자산 | _후원회기부금 | _보조금 | _보조금외 |
|---|---|---|---|---|---|
| **합계_** | total.계 | total.후보자자산 | total.후원회기부금 | total.보조금 | total.보조금외 |
| **사무소_** | office.계 | office.후보자자산 | office.후원회기부금 | office.보조금 | office.보조금외 |
| **연락소계_** | branch.계(0) | branch.후보자자산(0) | … | … | … |

- 토큰 형식 `{{합계_계}}` … `{{연락소계_보조금외}}`. 값은 `formatAmount`(천단위 콤마).
- rowAddr→prefix: `{2:"합계", 3:"사무소", 4:"연락소계"}`, colAddr→suffix: `{2:"계", 3:"후보자자산", 4:"후원회기부금", 5:"보조금", 6:"보조금외"}`.

### 4.3 make-form-22-2-fill.py 설계

`make-form-22-1-fill.py` 를 본떠 작성. 차이점:

- `ROW_PREFIX = {2:"합계", 3:"사무소", 4:"연락소계"}`, `CELL_SUFFIX = {2:"계", 3:"후보자자산", 4:"후원회기부금", 5:"보조금", 6:"보조금외"}`.
- **개별 연락소 placeholder(rowAddr ≥ 5) 정리**: r5+ 행의 c1(연락소명 예: "○○연락소")·c2~c6 예시 금액("670,000" 등)을 **빈 텍스트로 클리어** → 사용자 수기 작성용 빈 양식. (말줄임 `⋮` 행 포함)
- 검증: 15토큰 존재, `<hp:tbl>` 1개, 태그 균형(tbl/tr/tc/p/run open-self=close), placeholder 잔존 없음(`○○연락소` 등 미존재).
- 재패키징: mimetype STORED 첫 엔트리(기존 동일).
- 정규식 `re.search` 결과 None 가드 필수(과거 CodeRabbit 지적 답습).

---

## 5. UI/UX

기존 제출서류 화면(`app/dashboard/submission-forms`)에서 22-2 가 `form-fields.ts` 의 `dataFill: "accounting-report"` 플래그를 얻으면 **자동으로** 다른 22-x 와 동일한 "데이터 채움" 버튼이 노출된다. UI 코드 변경 없음(데이터 주도).

### form-fields.ts 변경

```typescript
// 변경 전
{ id: "22-2", label: "...(선거비용 지출내역 집계표)", ..., template: "form-22-2.hwpx", ..., fields: [] },
// 변경 후
{ id: "22-2", label: "...(선거비용 지출내역 집계표)", ..., template: "form-22-2-fill.hwpx", ..., fields: [], dataFill: "accounting-report" },
```

---

## 6. Error Handling

| 상황 | 처리 |
|------|------|
| 비멤버 org 접근 | 기존 IDOR 가드(401/403) 재사용 |
| 템플릿 누락 | `TEMPLATE_MISSING` 500 (기존) |
| 선거비용 0건 | 모든 토큰 "0" 치환, 양식 정상 생성 (FR-07) |
| 잘못된 formId | `INVALID_REQUEST` 400 (기존) |

---

## 7. Security

- [x] 인증 + user_organ 멤버십 가드 재사용 (기존 route)
- [x] 서비스 롤 키 서버 전용, 입력 orgId 정수 검증
- [x] XML escape: `generateHwpx`/`escape.ts` 가 토큰값 이스케이프

---

## 8. Test Plan

### 8.1 Scope

| Type | Target | Tool |
|------|--------|------|
| Unit | `election-expense-summary-builder` (집계·필터·기타흡수·토큰) | Vitest |
| Integration | `form-22-2-fill.hwpx` 토큰 치환 무결성·XML well-formed | Vitest |
| Cross-check | 동일 acc_book → 22-1 선거비용합 == 22-2 합계 | Vitest |

### 8.2 Test Cases (Key)

- [ ] **TC-1**: 지출만/선거비용만 집계 — 수입행·선거비용외행 무시.
- [ ] **TC-2**: 4분류 가산 정확(82→보조금, 83→보조금외, 84→후보자자산, 85→후원회기부금).
- [ ] **TC-3**: `계` = 4열합, `total` = `office`(옵션 A), `branch` 전부 0.
- [ ] **TC-4 (기타 흡수)**: 미분류 acc_sec_cd 선거비용 → 보조금외에 합산, 합계 보존.
- [ ] **TC-5 (빈 데이터)**: 입력 0건 → 모든 값 0, 토큰 "0".
- [ ] **TC-6 (토큰맵)**: 15키 정확, 누락/오타 없음.
- [ ] **TC-7 (교차검증)**: `buildReportSummaryModel` 선거비용 총합 == 22-2 `total.계`.
- [ ] **TC-8 (통합)**: fill 템플릿 치환 결과 `<hp:tbl>` 1개·태그 균형·placeholder 미존재.

---

## 9. Clean Architecture

| Component | Layer | Location |
|-----------|-------|----------|
| election-expense-summary-builder | Domain(순수 로직) | `app/src/lib/hwpx/election-expense-summary-builder.ts` |
| accounting-report route | Infrastructure/Application | `app/src/app/api/hwpx/accounting-report/route.ts` |
| form-fields(서식 레지스트리) | Domain/config | `app/src/lib/hwpx/form-fields.ts` |
| fill 템플릿 | asset | `app/public/hwpx-templates/form-22-2-fill.hwpx` |

의존 방향: route(외부) → builder(순수). builder 는 funding-source/report-summary-builder(분류 SSOT)·income-ledger-builder(formatAmount)만 import.

---

## 10. Coding Convention

| Item | Convention |
|------|-----------|
| 빌더 함수 | `buildElectionExpenseSummaryModel`, `electionExpenseSummaryTokens` (build*/+*Tokens 기존 패턴) |
| 파일명 | `election-expense-summary-builder.ts` (kebab) |
| 분류 import | `classifyExpenseCategory` 를 report-summary-builder 에서 `export` 하여 재사용 (현재 export 됨) |
| make 스크립트 | `make-form-22-2-fill.py`, re.search None 가드 |

---

## 11. Implementation Guide

### 11.1 File Structure

```text
app/
├─ scripts/make-form-22-2-fill.py                         (신규)
├─ public/hwpx-templates/form-22-2-fill.hwpx              (신규: 스크립트 산출)
├─ src/lib/hwpx/
│  ├─ election-expense-summary-builder.ts                 (신규)
│  ├─ election-expense-summary-builder.test.ts            (신규)
│  ├─ accounting-report-integration.test.ts               (수정: 22-2 통합 테스트 블록 추가 — 22-x 응집)
│  └─ form-fields.ts                                      (수정: 22-2 dataFill+template)
├─ src/app/api/hwpx/accounting-report/route.ts            (수정: formId "22-2")
└─ next.config.*                                          (수정: outputFileTracingIncludes 에 form-22-2-fill.hwpx)
```

### 11.2 Implementation Order

1. [ ] `election-expense-summary-builder.ts` + 단위 테스트 (TDD) — 집계·기타흡수·토큰·교차검증
2. [ ] `make-form-22-2-fill.py` 작성·실행 → `form-22-2-fill.hwpx` 산출(15토큰 검증)
3. [ ] `form-fields.ts` 22-2 에 `dataFill`+template 변경, `form-fields.test.ts` 갱신
4. [ ] `accounting-report/route.ts` formId "22-2" 분기 추가 (TEMPLATES/FILENAMES/분기)
5. [ ] `next.config` outputFileTracingIncludes 확인
6. [ ] 통합 테스트(템플릿 치환 무결성) + 전체 테스트/lint/build
7. [ ] 실제 한글에서 생성 파일 오픈 확인

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-09 | Initial draft (셀 주소 맵·15토큰·기타흡수 규칙·교차검증 확정) | DrunkenZealnut |
