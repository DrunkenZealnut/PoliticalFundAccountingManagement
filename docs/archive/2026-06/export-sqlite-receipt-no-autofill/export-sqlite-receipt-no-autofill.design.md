---
template: design
version: 1.2
feature: export-sqlite-receipt-no-autofill
date: 2026-06-15
author: Claude Code
project: 정치자금 회계관리 시스템
version_target: v0.14.4.0
---

# export-sqlite-receipt-no-autofill Design Document

> **Summary**: 자료백업(SQLite export) insert 직전, `RCP_NO`가 빈 `rcp_yn='Y'` 행에 채번 SSOT(`assignReceiptNumbers`)를 자동 적용하는 순수 헬퍼를 추가해, 윈도우 프로그램 수입지출부의 영수증일련번호가 자금원·과목별로 올바르게 표시되게 한다.
>
> **Project**: 정치자금 회계관리 시스템
> **Version**: 0.14.3.0 → 목표 v0.14.4.0
> **Author**: Claude Code
> **Date**: 2026-06-15
> **Status**: Draft
> **Planning Doc**: [export-sqlite-receipt-no-autofill.plan.md](../01-plan/features/export-sqlite-receipt-no-autofill.plan.md)

---

## 1. Overview

### 1.1 Design Goals

- export 산출 `.db`가 **항상** 자금원·과목 조합별 영수증번호(`{계정약자}({과목약자})-{조합순번}`)를 담도록 보장.
- 기존 채번 SSOT(`lib/accounting/receipt-no.ts`)를 **재사용**해 앱 화면·보전 수입지출부와 규칙 일원화.
- export 라우트는 GET(읽기 전용) 원칙 유지 — Supabase에 역기록하지 않고 **산출 `.db`에만** 채번 반영.
- 채번 로직을 순수 함수로 분리해 단위 테스트로 결정성·정합성 고정.

### 1.2 Design Principles

- **SSOT 재사용**: 새 채번 규칙을 만들지 않고 `assignReceiptNumbers`/`accountAbbr`/`itemAbbr`를 그대로 사용.
- **미부여분만**: 기존(수기/사전) `RCP_NO`는 절대 덮어쓰지 않음 — 조합별 max+1부터 이어서 부여.
- **앱 동작 동형성**: `incm_sec_cd`별 스코프·정렬(`acc_date → acc_sort_num`)을 `batch_receipt` API와 동일하게.
- **직교성**: COL_MAP·`normalizeOfficialExpenseRow`·`stripAppOnlyAccBookColumns`와 독립된 단일 변환 단계.

---

## 2. Architecture

### 2.1 Component Diagram

```
GET /api/system/export-sqlite
  ├─ fetchTable("acc_book") / ("acc_book_bak") / ("codevalue")   [Supabase]
  ├─ remapOrgId → normalizeOfficialExpenseRow → stripAppOnlyAccBookColumns
  │      └─▶ ★ fillExportReceiptNumbers(rows, codeNames)   ← 신규(순수)
  │              └─ assignReceiptNumbers (SSOT, 무변경)
  ├─ selectReferencedCustomers (rcp_no 채운 finalAccBook 기준)
  └─ insertRows("ACC_BOOK" / "ACC_BOOK_BAK")  → sql.js → .db
```

### 2.2 Data Flow

```
accBook(raw, snake_case, rcp_no="")            codevalue → nameById(cv_id→cv_name)
        │                                              │
        ▼                                              ▼
filterByExportOrgId∘remapOrgId∘normalize∘strip   { acc: nameById, item: nameById }
        │                                              │
        └──────────────► fillExportReceiptNumbers ◄────┘
                                 │
            incm_sec_cd별 그룹 → (targets: rcp_yn='Y' ∧ rcp_no 빈)
                                 → assignReceiptNumbers(targets, codeNames, existing)
                                 → acc_book_id로 rcp_no/rcp_no2 오버레이
                                 ▼
                         finalAccBook(rcp_no 채워짐) → insertRows
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| `fillExportReceiptNumbers` (신규) | `assignReceiptNumbers` (기존 SSOT) | 조합별 순번 부여 |
| export route | `fillExportReceiptNumbers`, `codevalue` fetch | finalAccBook 채번 |
| `selectReferencedCustomers` | finalAccBook (채번 후) | 변경 없음 — cust_id만 참조 |

---

## 3. Data Model

### 3.1 신규 함수 시그니처

`app/src/lib/accounting/receipt-no.ts`에 추가(순수):

```typescript
/**
 * export용 — RCP_NO 미부여(rcp_yn='Y' ∧ rcp_no 빈) 행에 조합별 영수증번호를 채운다.
 * incm_sec_cd별로 스코프 분리(앱 batch_receipt와 동일). 기존 부여분은 보존.
 * 입력 rows는 변경하지 않고 새 배열을 반환(immutable).
 *
 * @param rows  export 직전 acc_book 행(snake_case 키: incm_sec_cd, acc_sec_cd,
 *              item_sec_cd, rcp_yn, rcp_no, rcp_no2, acc_book_id, acc_date, acc_sort_num)
 * @param codeNames  acc_sec_cd/item_sec_cd → 코드명 (약자 매핑용)
 */
export function fillExportReceiptNumbers(
  rows: Record<string, unknown>[],
  codeNames: ReceiptCodeNames,
): Record<string, unknown>[];
```

### 3.2 내부 로직(의사코드)

```
function fillExportReceiptNumbers(rows, codeNames):
  byIncm = groupBy(rows, r => Number(r.incm_sec_cd))      # 1=수입, 2=지출 스코프 분리
  assignmentById = Map<acc_book_id, {rcp_no, rcp_no2}>
  for each [incm, group] in byIncm:
    existing = group
      .filter(r => nonEmpty(r.rcp_no))
      .map(r => ({ rcp_no: String(r.rcp_no), rcp_no2: Number(r.rcp_no2) || 0 }))
    targets = group
      .filter(r => String(r.rcp_yn) === 'Y' && isEmpty(r.rcp_no))
      .sort(by acc_date, then acc_sort_num, then acc_book_id)   # batch_receipt와 동일
      .map(r => ({ acc_book_id, acc_sec_cd: Number, item_sec_cd: Number }))
    for a in assignReceiptNumbers(targets, codeNames, existing):
      assignmentById.set(a.acc_book_id, a)
  return rows.map(r =>
    assignmentById.has(Number(r.acc_book_id))
      ? { ...r, rcp_no: a.rcp_no, rcp_no2: a.rcp_no2 }
      : r)
```

- `isEmpty(rcp_no)` = `null | undefined | ""`(trim).
- 정렬·스코프·"미부여분만"은 `app/api/acc-book/route.ts`의 `batch_receipt`(line 148~207)와 동형.
- `rcp_no2`는 incm 스코프 내 전역 max+1 — 앱 existing 쿼리(`.eq("incm_sec_cd")`)와 일치(수입/지출 간 중복 허용은 기존 동작).

### 3.3 export 라우트 연결 (변경 지점)

`app/src/app/api/system/export-sqlite/route.ts` (현재 line 732~737):

```typescript
// codevalue → 코드명 맵 (acc_sec_cd/item_sec_cd 모두 cv_id)
const cvNameById: Record<number, string> = {};
for (const c of codevalue as Record<string, unknown>[]) {
  cvNameById[Number(c.cv_id)] = String(c.cv_name ?? "");
}
const exportCodeNames = { acc: cvNameById, item: cvNameById };

const finalAccBook = fillExportReceiptNumbers(
  filterByExportOrgId(remapOrgId(accBook, orgIdMap))
    .map(normalizeOfficialExpenseRow)
    .map(stripAppOnlyAccBookColumns),
  exportCodeNames,
);
const finalAccBookBak = fillExportReceiptNumbers(
  filterByExportOrgId(remapOrgId(accBookBak, orgIdMap))
    .map(normalizeOfficialExpenseRow)
    .map(stripAppOnlyAccBookColumns),
  exportCodeNames,
);
```

- 삽입 위치: `selectReferencedCustomers`(line 747) **이전** — cust_id 집합엔 영향 없으나 finalAccBook 완성본을 사용하도록 순서 유지.
- `master` 모드는 `accBook=[]`이라 자동 no-op(빈 배열 통과).

---

## 4. API Specification

기존 엔드포인트 `GET /api/system/export-sqlite` **시그니처·요청/응답 무변경**. 내부 파이프라인에만 채번 단계 추가. (action 기반 POST 라우트 아님 — 단일 GET 다운로드.)

| Method | Path | 변경 |
|--------|------|------|
| GET | `/api/system/export-sqlite?mode=full\|master\|data1\|data2&...` | 응답 `.db`의 ACC_BOOK/ACC_BOOK_BAK에 RCP_NO 자동 채움(스키마·헤더 불변) |

---

## 5. UI/UX Design

해당 없음 — 서버 export 파이프라인 내부 변경. 화면/사용자 입력 변화 없음.
(부수 효과: 사용자가 「영수증 일괄생성」을 잊어도 백업 파일이 올바른 번호를 담음.)

---

## 6. Error Handling

| 상황 | 처리 |
|------|------|
| `rcp_yn='Y'`인데 `acc_sec_cd`/`item_sec_cd` 코드명 없음 | `accountAbbr`/`itemAbbr` 폴백(코드명 첫 글자 / 빈문자) — SSOT 기존 동작, 예외 없음 |
| targets 0건 | rows 그대로 반환(no-op) |
| `acc_book_id` 누락/비숫자 | `Number(...)` NaN → assignment 미매칭 → 해당 행 변경 없음(안전) |
| `incm_sec_cd` 비정상 값 | 해당 값으로 독립 스코프 생성(데이터 보존, 오류 없음) |

- 신규 단계는 **throw하지 않음**(순수 변환). export 전체 실패 위험 추가 없음.

---

## 7. Security Considerations

- [x] 외부 입력 없음 — 서버 내부 데이터 변환(주입 표면 추가 없음).
- [x] 권한: 기존 export 라우트 권한 모델 그대로(service-role).
- [x] 민감정보 비포함 — 영수증 일련번호는 회계 식별자.
- [N/A] Rate limiting — 기존 정책 유지.

---

## 8. Test Plan

### 8.1 Test Scope

| Type | Target | Tool |
|------|--------|------|
| Unit | `fillExportReceiptNumbers` (순수) | Vitest |
| Unit(회귀) | 기존 `receipt-no.test.ts` (assignReceiptNumbers) | Vitest |
| Integration(수동) | 실제 export → sqlite3 실측 / 윈도우 프로그램 표시 | sqlite3 + 사용자 검증 |

### 8.2 Test Cases (`receipt-no.test.ts` 추가)

- [ ] **TC-1 (재현)**: `Fund_Data_1(송파)` 11건 지출(자(비외)×1·보(비)×5·보(비외)×1·자(비)×4, rcp_no 빈) → `자(비외)-1`, `보(비)-1~5`, `보(비외)-1`, `자(비)-1~4` 부여.
- [ ] **TC-2 (미부여분만)**: 일부 행에 기존 `보(비)-1`,`보(비)-2` 존재 → 신규 보(비) 행은 `보(비)-3`부터.
- [ ] **TC-3 (incm 스코프)**: 수입(incm=1) rcp_yn='Y' + 지출(incm=2) rcp_yn='Y' 혼재 → 각 스코프 독립 채번, rcp_no2 스코프별 순번.
- [ ] **TC-4 (no-op)**: 모든 행 rcp_yn='N' 또는 rcp_no 이미 채워짐 → 입력 == 출력(불변).
- [ ] **TC-5 (immutability)**: 입력 배열/객체 미변형(원본 rcp_no 유지) 확인.
- [ ] **TC-6 (정렬)**: acc_date·acc_sort_num 역순 입력 → 날짜순 순번 부여.
- [ ] **TC-7 (코드명 폴백)**: codeNames에 없는 acc_sec_cd → 폴백 약자로 동작(throw 없음).

### 8.3 Edge/회귀 검증

- [ ] 기존 export-sqlite 테스트 통과(FK 고아 0, 지출부 누락 없음 — `[[export-sqlite-customer-fk-orphan]]`).
- [ ] `data/Fund_Data_1(송파).db` 데이터로 export 재현 → `sqlite3 ... "SELECT RCP_NO,RCP_NO2 FROM ACC_BOOK WHERE RCP_YN='Y'"` 조합별 정상.

---

## 9. Clean Architecture

### 9.4 This Feature's Layer Assignment

| Component | Layer | Location |
|-----------|-------|----------|
| `fillExportReceiptNumbers` (순수 채번) | Domain (순수 로직) | `app/src/lib/accounting/receipt-no.ts` |
| export 파이프라인 연결 | Infrastructure (API route) | `app/src/app/api/system/export-sqlite/route.ts` |
| 단위 테스트 | — | `app/src/lib/accounting/receipt-no.test.ts` |

- Domain(`receipt-no.ts`)은 외부 의존 없음(순수). Infrastructure(route)가 Domain을 호출 — 의존 방향 준수.

---

## 10. Coding Convention Reference

| Item | Convention Applied |
|------|-------------------|
| 함수 네이밍 | camelCase `fillExportReceiptNumbers` |
| 상수/약자 맵 | 기존 `ACC_ABBR`(UPPER) 재사용 |
| 순수 함수 SSOT | 기존 `receipt-no.ts` 패턴 준수(부수효과 없음) |
| import | route에서 `@/lib/accounting/receipt-no` 절대경로 |
| 주석 | 한국어 도메인 주석(기존 파일 스타일 일치) |

---

## 11. Implementation Guide

### 11.1 변경 파일

```
app/src/lib/accounting/receipt-no.ts        # fillExportReceiptNumbers 추가
app/src/lib/accounting/receipt-no.test.ts   # TC-1~7 추가
app/src/app/api/system/export-sqlite/route.ts # cvNameById + finalAccBook/Bak 채번 적용
app/VERSION                                  # 0.14.3.0 → 0.14.4.0
CHANGELOG.md                                 # 항목 추가
```

### 11.2 Implementation Order

1. [ ] `fillExportReceiptNumbers` 구현 (receipt-no.ts) — `assignReceiptNumbers` 재사용, incm 스코프·정렬·immutable.
2. [ ] `receipt-no.test.ts` TC-1~7 작성 → `node node_modules/vitest/vitest.mjs run src/lib/accounting/receipt-no.test.ts`.
3. [ ] export 라우트에 `cvNameById` 빌드 + `finalAccBook`/`finalAccBookBak` 채번 적용.
4. [ ] lint(`node node_modules/eslint/bin/eslint.js src/lib/accounting/receipt-no.ts src/app/api/system/export-sqlite/route.ts`) + build.
5. [ ] (검증) export 재현 → sqlite3 실측 → 사용자 윈도우 프로그램 확인.
6. [ ] VERSION/CHANGELOG bump (v0.14.4.0).

### 11.3 미결정/검토 항목 (Do 진입 전 확인)

- **ACC_BOOK_BAK 적용 여부**: 본 설계는 ACC_BOOK·ACC_BOOK_BAK **둘 다** 적용(각자 독립 채번). BAK가 BOOK 백업이라 동일 데이터면 동일 번호 산출. 만약 BAK 채번이 불필요/위험으로 판단되면 BOOK만 적용으로 축소 가능.
- **잔여 가설 검증**: 윈도우 프로그램이 `RCP_NO`를 읽어 표시한다는 가정(폴백 회피)은 구현 후 사용자 실측으로 확정. 무시 확인 시 funding-source 귀속 가설로 전환(Plan Risk 표 참조).

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-15 | 초안 — 순수 헬퍼 `fillExportReceiptNumbers` 설계, export 연결 지점·테스트 케이스 정의 | Claude Code |
