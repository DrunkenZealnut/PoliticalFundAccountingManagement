# 거래 0 계정도 정치자금 수입·지출부 출력 (일괄출력 엑셀) Planning Document

> **Summary**: 「일괄출력(보고서)」의 정치자금 수입·지출부 엑셀이 **실거래가 있는 계정×과목 조합만** 시트를 만들어 거래 0인 표준 계정이 누락되는 문제를, **acc_rel 표준 계정×과목 조합 전체**(화면 체크 범위 내)로 시트를 enumerate하여 거래 0 조합도 **빈 양식(손기입용 빈 행 1개)** 으로 출력하도록 바꾼다. 이미 빈 계정을 출력하는 **HWPX 서식7**의 검증된 패턴(acc_rel enumeration + 빈 표 행)을 엑셀에 이식.
>
> **Project**: PoliticalFundAccountingManagement
> **Version**: 0.1.0
> **Author**: Claude
> **Date**: 2026-06-17
> **Status**: Draft
> **Related**: [[income-account-ledger-hwpx]](서식7 — 빈 계정 출력 선례), `acc_rel` 표준 조합

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 「일괄출력」 정치자금 수입·지출부 엑셀(`reports/page.tsx`)이 **조회된 실거래(comboMap)로만** 계정×과목 시트를 생성한다(`page.tsx:886-949`). 그래서 그 회계기간에 거래가 한 건도 없는 표준 계정·과목(예: 후보자 보조금 계정)은 **시트 자체가 빠진다**. 선관위 제출 시 표준 계정은 빈 양식으로라도 있어야 하는데 누락됨. |
| **Solution** | 시트 enumeration을 실거래 → **acc_rel 표준 계정×과목 조합 전체**로 시드(화면에서 체크한 계정/과목 범위와 교집합). 거래 0 조합은 헤더 + **손기입용 빈 행 1개**의 빈 양식으로 출력. 이미 빈 계정을 출력하는 **HWPX 서식7**(`income-ledger`)의 acc_rel enumeration + `standardCombos` + 빈 표 패턴을 재사용. 같은 파일의 재산명세서(`buildEstateSheet`)가 쓰는 "거래 0 구분도 빈 행" 선례와 일관. |
| **Function/UX Effect** | 일괄출력 한 번으로 **기관유형의 표준 계정·과목이 빠짐없이** 수입·지출부에 나온다(거래 있으면 내역, 없으면 빈 양식). 제출용 양식 완결성 확보. |
| **Core Value** | 수입·지출부의 **양식 완전성** — "거래 있는 것만"에서 "표준 전체(빈 양식 포함)"로, 선관위 제출 누락 위험 제거. |

---

## 1. Overview

### 1.1 Purpose

「일괄출력(보고서)」(`dashboard/reports`)의 정치자금 수입·지출부 엑셀은 계정(acc_sec_cd)×과목(item_sec_cd) 조합별 시트로 구성된다. 현재는 **조회된 acc_book 레코드에 존재하는 조합만** 시트가 생성되어, 거래 0인 표준 계정·과목은 누락된다.

이 기능은 시트 목록을 **기관유형 표준 계정·과목(acc_rel)** 기준으로 만들어, 거래가 없어도 빈 양식으로 출력한다. HWPX 서식7이 이미 동일하게 동작하므로(빈 계정 빈 표), 그 패턴을 엑셀에 이식한다.

### 1.2 Background

- **현재 동작(생략)**: `reports/page.tsx`의 `comboMap`은 실거래(`records`)를 순회해 `${acc_sec_cd}-${item_sec_cd}` 키를 채우고(`page.tsx:886-898`), `for (const combo of combos)`로만 시트 생성(`:914-949`). 거래 0 조합은 `comboMap`에 없어 시트 없음. 표준 계정 목록(`getAccounts`/`getItems`)은 **체크박스 옵션 채우기**에만 쓰임(`:756-798`), 시트 enumeration엔 미사용.
- **이미 빈 계정 출력하는 선례(재사용)**:
  - **HWPX 서식7** `api/hwpx/income-ledger/route.ts:92-108` — `acc_rel`에서 `org_sec_cd`+`input_yn='Y'` 표준 (계정,과목) 유니크 조합을 `acc_order`순으로 뽑아 `standardCombos`로 주입 → `buildIncomeLedgerModel`이 거래 0 그룹을 `emptyLedgerRow()` 1행으로 출력(`income-ledger-builder.ts:184-185, 259-267`).
  - **재산명세서** 같은 파일 `reports/page.tsx:282-292` — "거래 0 구분도 카테고리 행 빈 값 출력" 선례.
- **표준 조합 소스**: `acc_rel`(`input_yn='Y'`, `org_sec_cd`별, `acc_order`). 클라이언트는 `useCodeValues`의 `getAccounts(orgSecCd, incmSecCd)`·`getItems(orgSecCd, incmSecCd, accSecCd)`로 계정·과목을 얻을 수 있음(reports가 이미 import·사용 중). 곱집합으로 표준 (계정×과목) 조합 생성 가능.
- **결정 사항(사용자 확인 완료, 2026-06-17)**:
  - **대상 = 일괄출력 엑셀(reports)** 의 정치자금 수입·지출부.
  - **범위·단위 = acc_rel 표준 계정×과목 전부, 화면 체크 존중**(체크된 계정/과목 범위 안에서 거래 0 조합도 빈 양식; 체크 안 한 건 제외).

### 1.3 Related Documents / Files

- 대상: `app/src/app/dashboard/reports/page.tsx` (comboMap·`buildLedgerSheet`·체크박스 필터)
- 재사용 패턴: `app/src/app/api/hwpx/income-ledger/route.ts`(acc_rel enumeration), `app/src/lib/hwpx/income-ledger-builder.ts`(standardCombos·빈 표)
- 표준 조합 소스: `app/src/hooks/use-code-values.ts`(`getAccounts`/`getItems`), `acc_rel` 테이블
- 선례: `reports/page.tsx`의 `buildEstateSheet`(빈 카테고리 행)
- 참고 Plan: [[income-account-ledger-hwpx]]

---

## 2. Scope

### 2.1 In Scope

- [ ] **표준 계정×과목 조합 enumeration**(클라이언트): `getAccounts`/`getItems`(acc_rel 기반) 곱집합으로 기관유형 표준 (계정,과목) 조합 목록 생성. 수입/지출 양쪽(incm_sec_cd 1·2) 포함.
- [ ] **시트 시드 변경**: `reports/page.tsx`의 수입·지출부 시트 enumeration을 실거래 comboMap → **표준 조합 ∩ 체크박스 선택**으로 변경. 실거래 있는 조합은 기존대로, 거래 0 조합은 빈 양식.
- [ ] **빈 양식 출력**: 거래 0 조합 시트 = 계정표지/과목표지 + 헤더 + **손기입용 빈 행 1개**(수입·지출·잔액 0/공란). `buildLedgerSheet`에 빈 records 경로 추가(서식7 `emptyLedgerRow` 패턴 차용).
- [ ] **정렬**: 시트 순서 acc_rel `acc_order` 기준(표준 순서). 실거래만 있던 잔여 조합은 뒤에(서식7 순서 규칙과 동일).
- [ ] **체크 존중**: 체크박스에서 선택된 계정/수입과목/지출과목 범위로만 표준 조합 필터(미선택 제외).
- [ ] **단위 테스트**: 표준 조합 생성·필터·빈 시트 판정 순수 함수(거래 0/혼합/체크 필터/순서).

### 2.2 Out of Scope

- **수입지출부 조회 화면**(`income-expense-book/page.tsx`)·**보전 수입지출부**(`income-expense-book.ts`) — 이번 범위 아님(후속 가능, 동일 패턴).
- **HWPX 서식7/22-4** — 서식7은 이미 빈 계정 출력. 22-4는 별도 결정.
- **표지·합계 등 양식 레이아웃 변경** — 빈 시트도 기존 레이아웃 그대로(데이터만 빈 값).
- **신규 API** — 클라이언트 `useCodeValues`(acc_rel)로 충분.

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | 요구사항 | 우선순위 |
|----|----------|:--------:|
| FR-01 | 일괄출력 수입·지출부가 acc_rel 표준 계정×과목 조합 전체를 시트로 생성(거래 0 포함) | High |
| FR-02 | 거래 0 조합 시트는 헤더 + 손기입용 빈 행 1개의 빈 양식으로 출력 | High |
| FR-03 | 화면 체크박스에서 선택된 계정/과목 범위로만 표준 조합 필터(체크 존중) | High |
| FR-04 | 실거래 있는 조합은 기존 내역·누계·잔액 그대로(회귀 없음) | High |
| FR-05 | 시트 순서는 acc_rel `acc_order` 표준 순서, 비표준 잔여 조합은 뒤 | Medium |
| FR-06 | 표준 조합 생성·분류는 acc_rel/`getAccounts`/`getItems` SSOT 재사용(하드코딩 금지) | High |
| FR-07 | 기관유형(후보자/후원회/정당/국회의원)별 표준 조합을 acc_rel `org_sec_cd`로 자동 반영 | Medium |

### 3.2 Non-Functional Requirements

| ID | 요구사항 |
|----|----------|
| NFR-01 | 빈 시트 다수 생성 시 엑셀 생성 성능 저하 없도록(시트 수 합리적 — 표준 조합 수 한정) |
| NFR-02 | 기존 일괄출력(표지·재산명세서·다른 시트) 회귀 없음 |
| NFR-03 | 빈 양식도 선관위 수입·지출부 레이아웃 준수(DESIGN.md/기존 양식 일관) |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] 거래 0인 표준 계정×과목도 일괄출력 엑셀에 빈 양식 시트로 나타남
- [ ] 체크박스 선택 범위가 정확히 반영(미선택 계정/과목 시트 미생성)
- [ ] 실거래 조합의 내역·합계가 기존과 동일(교차검증)
- [ ] 시트 순서가 acc_rel acc_order 표준 순서
- [ ] 표준 조합 생성/필터 순수 함수 단위 테스트 통과, 기존 테스트 무회귀
- [ ] Gap analysis ≥ 90%

### 4.2 Quality Criteria

- 표준 조합·분류 하드코딩 0(acc_rel SSOT 재사용)
- lint/build 통과, 콘솔 에러 0

---

## 5. Risks and Mitigation

| 리스크 | 영향 | 완화 |
|--------|------|------|
| 빈 시트 과다(표준 조합 × 빈도) | 엑셀 비대·가독성 | 체크 존중으로 범위 한정, 표준 조합 수는 기관유형당 소수(후보자 ~8) |
| acc_rel 조합과 reports 체크박스 옵션 불일치 | 빈 시트 누락/과생성 | 둘 다 동일 `getAccounts`/`getItems`(acc_rel) 사용 → 정합 |
| 빈 양식 레이아웃이 실거래 시트와 다름 | 제출 양식 불일치 | `buildLedgerSheet` 동일 함수로 빈 records 경로만 추가(레이아웃 공유) |
| 수입/지출 과목 분리(수입과목 vs 지출과목) 처리 | 조합 누락 | incm_sec_cd 1·2 각각 getItems로 표준 조합 구성(서식7과 동일) |
| 기존 실거래-only 동작 기대 사용자 | 출력 변화 | 빈 양식 포함이 제출 요건에 부합(서식7과 동일), CHANGELOG 안내 |

---

## 6. Architecture Considerations

### 6.1 Project Level

- **Level**: Dynamic. 신규 인프라·API 없음. `reports/page.tsx` 클라이언트 enumeration 변경 + 순수 헬퍼 1개.

### 6.2 Key Architectural Decisions

- **표준 조합 SSOT**: `acc_rel`(`getAccounts`/`getItems`). HWPX 서식7의 `income-ledger/route.ts` acc_rel 쿼리와 동일 의미를 클라이언트 훅으로 구성.
- **빈 양식 = 동일 렌더 경로**: `buildLedgerSheet`에 "records 없으면 빈 행 1개" 분기만 추가(서식7 `emptyLedgerRow` 차용) → 실거래/빈 시트 레이아웃 일관.
- **순수 함수 분리**: 표준 조합 생성·체크 필터·정렬을 순수 함수(`lib/excel-template` 또는 reports 인접)로 추출해 테스트.

### 6.3 구조(안)

```
lib/accounting/ (또는 lib/excel-template/)
  standard-account-combos.ts        # 순수: (getAccounts/getItems 결과) → 표준 (계정,과목) 조합 + acc_order 정렬 + 체크 필터
  standard-account-combos.test.ts   # 단위 테스트
app/dashboard/reports/page.tsx       # 시트 시드: comboMap(실거래) → 표준 조합 ∩ 체크, 거래 0 → buildLedgerSheet(빈)
```

---

## 7. Convention Prerequisites

### 7.1 Existing Conventions

- 표준 계정·과목은 `acc_rel`/`useCodeValues`에서만(하드코딩 금지). 금액·양식은 기존 `buildLedgerSheet` 레이아웃 재사용.
- 빈 데이터 행 패턴은 서식7 `emptyLedgerRow`·재산명세서 빈 카테고리 행 선례 따름.

### 7.2 To Define/Verify (Design 단계)

- 표준 조합의 수입/지출 과목 구성 방식(incm_sec_cd별 getItems 곱) 확정.
- 빈 시트의 표지(계정표지/과목표지) 생성 여부·내용.
- 체크박스 "전체 선택" 기본값과의 상호작용(기본 전체면 표준 전부 출력).
- 비표준(체크된 적 없는 코드의 실거래) 조합 순서·표기.

### 7.3 Environment Variables

- 없음.

---

## 8. Next Steps

1. `/pdca design report-empty-account-ledger` — 표준 조합 헬퍼 입출력 타입, 빈 시트 렌더 분기, 체크 필터·순서, 테스트 케이스 명세
2. 구현: `standard-account-combos.ts` → `reports/page.tsx` 시트 시드 변경 + 빈 양식 분기
3. `/pdca analyze` — Gap 분석
4. 실데이터 QA(거래 0 계정 빈 시트 확인, 실거래 시트 무회귀, 체크 범위)

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-06-17 | Claude | 최초 Plan (대상: 일괄출력 엑셀 / 범위: acc_rel 표준 계정×과목 전부·체크 존중 확정) |
