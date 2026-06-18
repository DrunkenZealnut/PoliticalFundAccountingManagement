# 거래 0 계정도 수입·지출부 출력 Design Document

> **Plan**: [report-empty-account-ledger.plan.md](../../01-plan/features/report-empty-account-ledger.plan.md)
> **Project**: PoliticalFundAccountingManagement
> **Date**: 2026-06-17
> **Status**: Draft
> **확정 정책**: 대상=일괄출력 엑셀(reports) / 범위=acc_rel 표준 계정×과목 전부·화면 체크 존중

---

## 1. 개요

`reports/page.tsx`의 정치자금 수입·지출부 시트 enumeration을 **실거래(comboMap)** → **acc_rel 표준 계정×과목 조합 ∪ 실거래**(화면 체크 범위 내)로 바꾸고, 거래 0 조합은 `buildLedgerSheet`가 **손기입용 빈 행 1개**의 빈 양식으로 출력하도록 한다. HWPX 서식7의 acc_rel enumeration·빈 표 패턴을 엑셀에 이식.

구성: **순수 함수** `buildReportCombos`(조합 병합·필터·정렬, 테스트) + `reports/page.tsx` 시트 시드 변경 + `buildLedgerSheet` 빈 행 분기.

---

## 2. 현재 동작 (근거)

- 조합 시드(`page.tsx:886-898`): `comboMap`을 **실거래 records**로만 채움(`${acc_sec_cd}-${item_sec_cd}`).
- 필터·정렬(`:900-908`): `selectedAccounts` ∧ (`selectedIncomeItems` ∨ `selectedExpenseItems`), `accSecCd→itemSecCd` 정렬.
- 시트 루프(`:914-949`): combo별 계정표지/과목표지/원장. 원장 records = combo 필터 결과.
- `buildLedgerSheet`(`:~537-720`): `sorted=[...sheetRecords].sort(...)` 후 `for (const r of sorted)` 데이터 행. **빈 records면 데이터 행 0개**(헤더·합계만, 손기입 행 없음).
- 체크 상태(`:761-763`): `selectedAccounts/selectedIncomeItems/selectedExpenseItems` (기본 전체, `:766-780`). 옵션은 `getAccounts/getItems`(acc_rel)로 생성(`:756-798`).

---

## 3. 데이터 모델 / 순수 함수

### 3.1 타입

```ts
export interface AccItemCombo { accSecCd: number; itemSecCd: number; }
export interface ReportComboSelection {
  selectedAccounts: Set<number>;
  selectedIncomeItems: Set<number>;
  selectedExpenseItems: Set<number>;
}
```

### 3.2 `buildReportCombos` (순수, 테스트 대상)

```ts
// lib/excel-template/report-combos.ts
export function buildReportCombos(
  standardCombos: AccItemCombo[], // acc_rel 표준(순서 보존: getAccounts×getItems)
  realCombos: AccItemCombo[],     // 실거래 comboMap.values()
  sel: ReportComboSelection,
): AccItemCombo[];
```
규칙:
1. **병합**: `key=${acc}-${item}`로 standard 먼저, 그다음 real 중 standard에 없는 것(비표준 실거래) 추가 — dedup.
2. **필터(체크 존중)**: `selectedAccounts.has(acc)` ∧ (`selectedIncomeItems.has(item)` ∨ `selectedExpenseItems.has(item)`).
3. **정렬**: standard는 입력 순서(acc_rel acc_order/cv_order) 유지, 비표준 real은 뒤에 `accSecCd→itemSecCd`로 정렬해 append (서식7 순서 규칙과 동일).

> 표준 조합 enumeration(아래)은 페이지에서 훅으로 수행하고, 병합·필터·정렬만 순수 함수로 분리(테스트 용이).

### 3.3 표준 조합 enumeration (페이지, 훅 사용)

```ts
// reports/page.tsx (handleGenerate 내 또는 useMemo)
const standardCombos: AccItemCombo[] = [];
const seen = new Set<string>();
for (const incm of [1, 2] as const) {
  for (const acc of getAccounts(orgSecCd, incm)) {       // acc_rel, cv_order 정렬
    for (const item of getItems(orgSecCd, incm, acc.cv_id)) {
      const key = `${acc.cv_id}-${item.cv_id}`;
      if (!seen.has(key)) { seen.add(key); standardCombos.push({ accSecCd: acc.cv_id, itemSecCd: item.cv_id }); }
    }
  }
}
```
`getItems(orgSecCd, incm, acc)`가 acc_rel의 (acc, item) 유효 조합만 반환하므로, 곱집합이 곧 표준 조합. (후보자 예: 82~85 × 86/87 등 실제 acc_rel 정의대로)

---

## 4. reports/page.tsx 변경

```ts
// 기존
const combos = Array.from(comboMap.values()).filter(...).sort(...);
// 변경
const realCombos = Array.from(comboMap.values());
const combos = buildReportCombos(standardCombos, realCombos, {
  selectedAccounts, selectedIncomeItems, selectedExpenseItems,
});
```
- 시트 루프(`:914-949`)는 그대로. `sheetRecords` = combo 필터(거래 0이면 `[]`).
- 계정표지/과목표지는 거래 0 계정도 동일하게 생성(빈 계정도 표지 포함 — 양식 완전성).

## 5. buildLedgerSheet 빈 양식 분기

`sorted`가 비면 손기입용 빈 행 1개 출력(서식7 `emptyLedgerRow` 패턴):
```ts
if (sorted.length === 0) {
  const row = ws.getRow(7);
  // 번호 공란/1, 년월일·내역·거래처 공란, 수입/지출/잔액 공란(또는 0)
  // 테두리·서식은 데이터 행과 동일
  rowIdx = 8;
} else {
  for (const r of sorted) { /* 기존 */ }
}
```
- 합계 행: 수입/지출/잔액 0. 영수증 첨부/생략 집계 0.
- 레이아웃은 실거래 시트와 동일(헤더·열폭·합계 위치) — 빈 값만 다름.

---

## 6. 테스트 (`report-combos.test.ts`)

| # | 시나리오 | 기대 |
|---|---|---|
| C1 | 실거래 0 + 표준 3조합, 전체 체크 | 3조합 모두 출력(빈 양식 대상) |
| C2 | 표준 ∩ 실거래 겹침 | dedup, 중복 시트 없음 |
| C3 | 비표준 실거래 조합 존재 | 표준 뒤에 append, 누락 없음 |
| C4 | 체크 필터(계정 일부 해제) | 해제 계정 조합 제외 |
| C5 | 과목 체크(수입과목만 체크) | 해당 과목 조합만 |
| C6 | 정렬 | 표준 순서 먼저 → 비표준 accSecCd/itemSecCd |
| C7 | 빈 selection | 빈 배열(시트 0) |

> `buildLedgerSheet` 빈 행 렌더는 ExcelJS라 단위테스트 어려움 → 생성 .xlsx 읽기(QA)로 검증(실데이터: 거래 0 계정 빈 시트 존재·헤더·손기입 1행).

---

## 7. 영향 파일

| 파일 | 종류 |
|------|------|
| `lib/excel-template/report-combos.ts` | 신규(순수 buildReportCombos) |
| `lib/excel-template/report-combos.test.ts` | 신규(C1~C7) |
| `app/dashboard/reports/page.tsx` | 표준 조합 enumeration + combos 시드 변경 + buildLedgerSheet 빈 행 분기 |

재사용: `getAccounts`/`getItems`(acc_rel SSOT), 서식7 `emptyLedgerRow` 개념, 같은 파일 `buildEstateSheet` 빈 카테고리 행 선례. 신규 API 없음.

---

## 8. Do 순서

1. `report-combos.ts` + 테스트(C1~C7) 작성·통과.
2. `reports/page.tsx`: standardCombos enumeration + `buildReportCombos`로 combos 교체.
3. `buildLedgerSheet` 빈 records → 손기입 빈 행 분기.
4. 실데이터 QA: 거래 0 계정 빈 시트 생성·실거래 시트 무회귀·체크 범위·정렬. lint/build/전체 테스트.

---

## 9. 미해결/Design 확인 사항

- 빈 계정도 **계정표지/과목표지** 생성할지(기본: 생성 — 양식 완전성). 표지 과다 우려 시 원장만 옵션.
- 정렬: acc_rel `acc_order`를 엄격히 따를지(getAccounts cv_order로 충분한지) — 1차 cv_order/numeric 유지.
- 빈 행의 번호 표기(공란 vs "1")·금액 표기(공란 vs 0) — 서식7/재산명세서 선례에 맞춤(공란 우선).
- 후원회/정당 등 타 기관유형의 표준 조합 수 확인(acc_rel org_sec_cd별 — 시트 과다 없는지).
