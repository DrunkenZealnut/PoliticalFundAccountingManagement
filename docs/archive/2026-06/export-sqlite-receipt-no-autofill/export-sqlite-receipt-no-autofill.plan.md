---
template: plan
version: 1.2
feature: export-sqlite-receipt-no-autofill
date: 2026-06-15
author: Claude Code
project: 정치자금 회계관리 시스템
version_target: v0.14.4.0
---

# export-sqlite-receipt-no-autofill Planning Document

> **Summary**: 자료백업(SQLite export) 시 영수증번호(RCP_NO) 미부여 행에 SSOT 채번 규칙을 자동 적용해, 윈도우 선관위 프로그램의 수입지출부에서 영수증일련번호가 자금원·과목별로 올바르게 표시되도록 한다.
>
> **Project**: 정치자금 회계관리 시스템
> **Version**: 0.14.3.0 → 목표 v0.14.4.0
> **Author**: Claude Code
> **Date**: 2026-06-15
> **Status**: Draft

---

## Executive Summary

| 관점 | 내용 |
|------|------|
| **Problem (문제)** | 자료백업으로 만든 `.db`를 윈도우 프로그램에서 열면 수입지출부의 영수증일련번호가 11건 전부 `자(비외)-1 ~ 자(비외)-11 / 계좌입금`으로 동일하게 뭉친다. 실제로는 자금원·과목 4조합(자(비외)·보(비)·보(비외)·자(비))으로 분산돼야 한다. |
| **Solution (해결)** | export 파이프라인이 `RCP_NO`가 빈 `rcp_yn='Y'` 행에 대해 기존 채번 SSOT(`assignReceiptNumbers`)를 자동 적용 → 백업 파일이 항상 올바른 조합별 영수증번호를 담도록 한다(자동 채번). |
| **Function UX Effect (기능·UX 효과)** | 사용자가 「영수증 일괄생성」 실행을 잊거나 미부여 데이터를 import해도, 백업 파일·윈도우 수입지출부가 자금원·과목별로 정확한 일련번호를 표시. 수기 부여분은 보존. |
| **Core Value (핵심 가치)** | 선관위 제출용 수입지출부의 정합성 보장 — 영수증일련번호 오표기로 인한 자금원 귀속 오류·반려 위험 제거. |

---

## 1. Overview

### 1.1 Purpose

자료백업 SQLite export 결과물(특히 PFund2 `data1`/`data2`/`full` 모드)이 윈도우 선관위 프로그램에서
정치자금 수입·지출부를 그릴 때, 각 영수증 행의 **영수증일련번호**가 자금원(계정)·과목 조합별로
올바르게 표시되도록 보장한다.

### 1.2 Background

**증상** — 사용자가 본 프로젝트에서 자료백업(`Fund_Data_1(송파).db`)을 만들어 윈도우 프로그램에서
열면, 수입지출부의 영수증일련번호가 11건 모두 `자(비외)-1 ~ 자(비외)-11`(둘째 줄 `계좌입금`)로 표시된다.

**실측 데이터** (`data/Fund_Data_1(송파).db`, ACC_BOOK):

| 영수증 대상(`RCP_YN='Y'`) 조합 | 계정(ACC_SEC_CD) | 과목(ITEM_SEC_CD) | 건수 | 기대 일련번호 |
|--------------------------------|-------------------|--------------------|------|----------------|
| 자(비외) | 84 후보자등자산 | 87 선거비용외정치자금 | 1 | 자(비외)-1 |
| 보(비)  | 82 보조금       | 86 선거비용         | 5 | 보(비)-1 ~ 5 |
| 보(비외) | 82 보조금       | 87 선거비용외정치자금 | 1 | 보(비외)-1 |
| 자(비)  | 84 후보자등자산 | 86 선거비용         | 4 | 자(비)-1 ~ 4 |
| **합계** | | | **11** | |

- export된 `.db`의 `RCP_NO`/`RCP_NO2`가 **20행 전부 비어 있음**(빈 문자열 / 0).
- `계좌입금` = `EXP_TYPE_CD=118`(지출방법 코드). 표시 포맷 = `{자금원약자}({과목약자})-{순번}\n{결제방법명}`.

**근본 원인** — 영수증번호는 `acc_book.rcp_no` 컬럼에 영구 저장되며 앱 화면(`expense/page.tsx:984`)은
이 값을 그대로 읽어 표시한다. 「영수증 일괄생성」(`batch_receipt` API)을 실행해야 비로소
`rcp_no`가 채워진다. **export 파이프라인(COL_MAP·`normalizeOfficialExpenseRow`·`stripAppOnlyAccBookColumns`·
`remapOrgId`·`insertRows`)은 `rcp_no`를 누락시키지 않음**(코드 추적으로 검증 완료). 따라서
`rcp_no`가 비어 export되면(일괄생성 전 백업, 또는 미부여 데이터 import 후 백업) 윈도우 프로그램이
빈 `RCP_NO`를 단일 버킷 `자(비외)`로 묶어 1→11 전역 순번을 **자체 폴백 생성**한다.

**결정 사항** (사용자 확인):
- 앱 지출 화면에서는 영수증번호가 자금원별로 **혼합 정상** 표시됨(= Supabase `rcp_no`가 채워진 시점이 있음).
- 수정 방향: **export 시 자동 채번**(권장) — 일괄생성 실행 여부와 무관하게 백업이 항상 올바른 번호를 담도록.

### 1.3 Related Documents

- 채번 SSOT 설계: `docs/archive/2026-06/receipt-no-account-item-rule/receipt-no-account-item-rule.design.md`
- export 호환성 가이드: `CLAUDE.md` → "SQLite Export/Import" 섹션
- 관련 메모리: `[[export-sqlite-customer-fk-orphan]]`, `[[election-item-classification-ssot]]`, `[[pfund2-official-donation-codes]]`

---

## 2. Scope

### 2.1 In Scope

- [ ] export-sqlite 라우트의 `finalAccBook`(필요 시 `finalAccBookBak`)에 대해, `rcp_yn='Y'` ∧ `RCP_NO` 빈 행에 채번 SSOT 자동 적용
- [ ] `assignReceiptNumbers`(기존 SSOT) 재사용 — 조합별 순번, **미부여분만**, 기존 부여분 보존
- [ ] export가 이미 fetch하는 `codevalue`로 계정·과목 코드명 맵 구성
- [ ] `incm_sec_cd`별(수입 1 / 지출 2) 순번 스코프 분리 — 앱 `batch_receipt`(`.eq("incm_sec_cd")`)와 동일 의미 유지
- [ ] 채번 대상 정렬 `acc_date → acc_sort_num → acc_book_id` (앱 `batch_receipt` 정렬과 일치)
- [ ] 순수 헬퍼로 분리 + 단위 테스트(빈/일부부여/전부부여, 조합별 순번, incm 스코프, 0건)
- [ ] 산출 `.db`로 FK 고아 0 / 회귀 없음 재확인(기존 export 테스트)

### 2.2 Out of Scope

- Supabase `acc_book.rcp_no` 역기록(writeback) — export는 GET(부수효과 없음) 유지. 채번은 산출 `.db`에만 반영.
- 「영수증 일괄생성」(`batch_receipt`) 로직 자체 변경 — 정상 동작 확인됨, 무변경.
- 윈도우 프로그램 내부 폴백 동작 변경(통제 불가) — RCP_NO를 채워 폴백을 회피하는 방식.
- import-sqlite 경로 변경.

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | export 시 `rcp_yn='Y'` ∧ `RCP_NO` 빈 행에 `{계정약자}({과목약자})-{조합순번}` 형식 영수증번호를 자동 부여 | High | Pending |
| FR-02 | 이미 `RCP_NO`가 있는 행은 변경하지 않음(수기/기존 부여분 보존), 조합별 순번은 기존 max+1부터 이어짐 | High | Pending |
| FR-03 | `RCP_NO2`(정수 전역 순번)도 함께 부여 — 정렬·중복방지 일관성 유지 | Medium | Pending |
| FR-04 | 수입(`incm_sec_cd=1`)·지출(`2`) 순번을 분리 스코프로 채번(앱 동작과 일치) | Medium | Pending |
| FR-05 | 채번 로직은 export 라우트가 fetch한 `codevalue` 코드명으로 약자 매핑(`accountAbbr`/`itemAbbr` 폴백 포함) | High | Pending |
| FR-06 | `full`/`master`/`data1`/`data2` 모든 export 모드에서 동일 적용 | Medium | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| 정합성 | 산출 `.db`의 영수증 행 RCP_NO가 SSOT 조합 규칙과 100% 일치 | 단위 테스트 + sqlite3 실측 |
| 무회귀 | 기존 export(FK 고아 0, 지출부 누락 없음) 회귀 없음 | 기존 export-sqlite 테스트 통과 |
| 순수성 | 채번 헬퍼는 순수 함수(부수효과 없음) | 단위 테스트 격리 |
| 결정성 | 동일 입력 → 동일 RCP_NO(정렬 기준 안정) | 테스트로 고정 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] FR-01~06 구현
- [ ] 채번 헬퍼 단위 테스트 작성·통과
- [ ] `data/Fund_Data_1(송파).db` 동일 데이터로 재현 → 산출 `.db`에서 `자(비외)-1`, `보(비)-1~5`, `보(비외)-1`, `자(비)-1~4` 확인
- [ ] lint 0, build 성공, 기존 테스트 통과
- [ ] (검증) 사용자 환경에서 재export → 윈도우 프로그램 수입지출부 영수증일련번호 조합별 정상 표시 확인

### 4.2 Quality Criteria

- [ ] 신규 헬퍼 테스트 커버리지 주요 분기 포함
- [ ] Zero lint errors
- [ ] Build succeeds

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 윈도우 프로그램이 RCP_NO를 무시하고 자체 생성할 가능성(검증 미완) | High | Low | 1차 구현 후 사용자 재export·윈도우 확인을 검증 단계로 명시. 무시 확인 시 자금원 귀속(funding-source) 가설로 전환 |
| export-only 채번과 Supabase `rcp_no` 불일치로 사용자 혼동 | Medium | Low | 산출 규칙이 결정적(앱 일괄생성과 동일 SSOT)임을 문서화. 필요 시 후속으로 writeback 옵션 검토 |
| `data1`/`data2` 모드의 org 필터·remap 이후 행에서 `incm_sec_cd`/`acc_sec_cd` 키 보존 여부 | Medium | Low | finalAccBook은 SELECT * 원본 컬럼 유지 확인됨. 테스트로 고정 |
| ACC_BOOK_BAK(정산백업) 채번 적용 범위 모호 | Low | Medium | 설계 단계에서 ACC_BOOK만 vs 둘 다 결정(수입지출부는 ACC_BOOK 기준) |

---

## 6. Architecture Considerations

### 6.1 Project Level Selection

| Level | Selected |
|-------|:--------:|
| Dynamic (Next.js + Supabase, feature 기반) | ☑ (기존 프로젝트 레벨 유지) |

### 6.2 Key Architectural Decisions

| Decision | Selected | Rationale |
|----------|----------|-----------|
| 채번 위치 | export 라우트 insert 직전(`finalAccBook` 변환 단계) | 모든 모드·필터 이후의 최종 행에 일관 적용 |
| 채번 로직 | 기존 `lib/accounting/receipt-no.ts`(`assignReceiptNumbers`) 재사용 | SSOT 일원화 — 앱 화면/보전 수입지출부와 동일 규칙 |
| 부수효과 | export-only(Supabase 미기록) | export는 GET, 읽기 전용 원칙 유지 |
| 신규 헬퍼 | `applyReceiptNumbersToExport(rows, codeNames)`(순수) | 테스트 격리 + COL_MAP/normalize와 직교 |

### 6.3 Clean Architecture Approach

```
변경 파일(예상):
  app/src/lib/accounting/receipt-no.ts        (export용 배치 헬퍼 추가 — 순수)
  app/src/lib/accounting/receipt-no.test.ts   (테스트 추가)
  app/src/app/api/system/export-sqlite/route.ts (finalAccBook 채번 적용)
SSOT 재사용: assignReceiptNumbers / accountAbbr / itemAbbr (무변경)
```

---

## 7. Convention Prerequisites

### 7.1 Existing Project Conventions

- [x] `CLAUDE.md` 코딩 규약/아키텍처 가이드 존재
- [x] ESLint v9 flat config
- [x] TypeScript / Vitest 구성 존재

### 7.2 Conventions to Define/Verify

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| 순수 함수 SSOT | 존재(`receipt-no.ts`) | 배치 헬퍼 동일 패턴 준수 | High |
| export 컬럼 정합 | 존재(COL_MAP) | RCP_NO/RCP_NO2 키 보존 확인 | High |

### 7.3 Environment Variables Needed

추가 환경변수 없음(기존 `SUPABASE_*` 사용).

### 7.4 Pipeline Integration

해당 없음(단일 버그 수정 feature, 9-phase 파이프라인 미적용).

---

## 8. Next Steps

1. [ ] 설계 문서 작성 (`/pdca design export-sqlite-receipt-no-autofill`) — 헬퍼 시그니처·incm 스코프·ACC_BOOK_BAK 범위 확정
2. [ ] 구현 (`/pdca do`) — 헬퍼 + export 라우트 적용 + 테스트
3. [ ] 갭 분석 (`/pdca analyze`) 후 v0.14.4.0 릴리스 준비

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-15 | 초안 — 근본원인(빈 RCP_NO export → 윈도우 폴백) 확정, 수정방향(export 자동 채번) 결정 | Claude Code |
