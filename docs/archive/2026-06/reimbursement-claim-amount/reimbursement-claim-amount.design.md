# reimbursement-claim-amount Design Document

> **Plan**: `docs/01-plan/features/reimbursement-claim-amount.plan.md`
> **Project**: 정치자금 회계관리 시스템 (political-fund-accounting-management)
> **Version**: 0.12.0.0 → 0.13.0.0(예정)
> **Author**: DrunkenZealnut
> **Date**: 2026-06-13
> **Status**: Draft

---

## 1. Overview

### 1.1 Design Goals

보전 대상 지출의 **보전청구액(`claim_amt`)** 을 실지출액(`acc_amt`)과 분리 보관한다. 보전관리 화면에서 지출액 옆 청구액 컬럼을 **인라인 수동 편집**(보전 체크 항목)하고, 보전 출력(서식43·보전 첨부서류목록·Excel 보전청구서·화면 청구 합계)이 `claimAmount(row)=claim_amt ?? acc_amt`를 단일 SSOT로 사용한다. 회계장부·회계보고서·정산은 `acc_amt` 불변.

### 1.2 Design Principles

- **읽기 측 fallback**: `claim_amt` NULL = 미수정 → 출력 시 `acc_amt` 사용(DB 기본값 아님). 빈 입력은 NULL 저장(0과 구분).
- **단일 SSOT**: `lib/accounting/claim-amount.ts`의 `claimAmount()` 만 보전 경로가 import. 회계 경로 미오염.
- **전환 최소 지점**: 합산 SSOT 2곳(`reimbursement-aggregator`·`reimbursement-doclist-builder`)만 전환 → 4개 보전 출력 일괄 반영.
- **게이트 불변**: 보전 대상 필터의 `acc_amt>0`은 실지출 기준 유지(청구 0/NULL 항목 누락 방지).

### 1.3 현행 구조 분석 (설계 근거, 실측)

- `dashboard/reimbursement/page.tsx`: `ReimbursementTab`(보전)·`BurdenCostTab`(부담)이 공용 `LedgerTable`(14컬럼) 사용. 이미 `checkedIds` + `handleSave`(직접 `supabase.from("acc_book").update({acc_print_ok})` 루프)로 **인라인 보전 체크** 구현됨(:153-165). `expCum`/`totalAmt`/`checkedTotal`(:167-170)은 `acc_amt` 합산. → 동일 패턴에 `claim_amt` 인라인 편집·저장을 확장.
- 보전 출력 SSOT: `reimbursement-aggregator.ts:86-87`(`sums[source]+=r.acc_amt`)가 서식43 HWPX + Excel 보전청구서 공유. `reimbursement-doclist-builder.ts:123,128`(`subtotal+=r.acc_amt`, `amount:formatAmount(r.acc_amt)`)가 점검목록표 "보전청구액".
- export-sqlite: `stripAppOnlyAccBookColumns`(`route.ts:462-469`)가 `acc_time`을 strip. `claim_amt`도 동일 처리 필요(PFund2 DDL 미보유 → 누락 시 백업 abort).

---

## 2. Architecture

### 2.1 Component Diagram

```
[입력] dashboard/reimbursement (ReimbursementTab)
   ├ LedgerTable + claimEditor(인라인 청구액 input)  ← 신규
   └ handleSave → supabase.acc_book.update({acc_print_ok, claim_amt})  ← claim_amt 추가
        ▼
   acc_book.claim_amt  (BIGINT NULL, 마이그레이션 015)
        ▼ (보전 조회 select +claim_amt)
[출력 보전]  lib/accounting/claim-amount.ts  ← 신규 SSOT  claimAmount(r)=claim_amt??acc_amt
   ├ reimbursement-aggregator       → 서식43 HWPX(reimbursement-claim) + Excel 보전청구서 + aggregate API
   ├ reimbursement-doclist-builder  → 보전 첨부서류목록(reimbursement-doclist)
   └ ReimbursementTab 청구 합계(checkedTotal)
[출력 회계]  acc_amt 그대로 → income-ledger(서식7)/report-summary(22-1)/election-expense(22-2)/settlement  (불변)
[백업]  export-sqlite → stripAppOnlyAccBookColumns(claim_amt 제거)  ← 추가
```

### 2.2 Data Flow / Dependencies

| 재사용/수정 | 역할 |
|---|---|
| `reimbursement-aggregator.ts`(수정) | 자금원 합산 → `claimAmount(r)`. 서식43·Excel·aggregate 동시 전환 |
| `reimbursement-doclist-builder.ts`(수정) | "보전청구액" 셀·소계 → `claimAmount(r)` |
| `dashboard/reimbursement/page.tsx`(수정) | 보전 탭 인라인 청구액 편집·저장·청구 합계 |
| `export-sqlite/route.ts`(수정) | `claim_amt` strip |
| `claim-amount.ts`(신규) | `claimAmount` SSOT |
| `types/database.ts`(수정) | acc_book·bak Row `claim_amt` |

---

## 3. Data Model

### 3.1 마이그레이션 (`app/scripts/015_add_claim_amt.sql`, 수동 적용)

```sql
-- 보전청구액: 실지출액(acc_amt)과 다른 보전 신청액(일할계산 등). NULL이면 acc_amt 사용.
ALTER TABLE pfam.acc_book     ADD COLUMN IF NOT EXISTS claim_amt BIGINT;
ALTER TABLE pfam.acc_book_bak ADD COLUMN IF NOT EXISTS claim_amt BIGINT;
COMMENT ON COLUMN pfam.acc_book.claim_amt IS '보전청구액(NULL=acc_amt 사용, 지출 전용)';
-- (선택) 음수 방지: ALTER TABLE pfam.acc_book ADD CONSTRAINT chk_claim_amt_nonneg CHECK (claim_amt IS NULL OR claim_amt >= 0);
```
- 014 패턴 동일(가산·비파괴). 단위 원, 음수 없음 → BIGINT.

### 3.2 types/database.ts

- `acc_book` Row(`:173 acc_amt` 다음) + `acc_book_bak` Row(`:212 acc_amt` 다음)에 `claim_amt: number | null;` 추가. Insert/Update는 Row 파생 → 자동.

### 3.3 SSOT (`lib/accounting/claim-amount.ts`, 순수)

```ts
/** 보전청구액 SSOT — 보전 출력 전용. NULL이면 실지출액 사용. */
export function claimAmount(row: { claim_amt?: number | null; acc_amt: number }): number {
  return row.claim_amt ?? row.acc_amt;
}
```
- 위치 근거: `funding-source`/`settlement-calc`와 같은 `lib/accounting/`(회계 도메인 SSOT). hwpx·excel 빌더 모두 `lib/accounting` import 가능(순환 없음). **회계 빌더는 import 금지**(오염 방지).

### 3.4 인터페이스 필드 추가

| 타입 | 위치 | 추가 |
|---|---|---|
| `AccBookRow` | reimbursement-aggregator.ts:16-23 | `claim_amt?: number \| null` |
| `DoclistInputRow` | reimbursement-doclist-builder.ts | `claim_amt?: number \| null` |
| `ReimbRow` | reimbursement/page.tsx:22-44 | `claim_amt: number \| null` |

---

## 4. 출력 전환 (보전 경로 → claimAmount)

### 4.1 reimbursement-aggregator.ts

```ts
// :70-89 루프
if (r.acc_amt <= 0) continue;              // ← 게이트 유지(실지출 기준, 전환 금지)
...
const amt = claimAmount(r);                // ← 신규
sums[source] += amt; sums.합계 += amt;     // ← acc_amt → amt
```
→ 서식43 HWPX(`reimbursement-claim/route.ts`) + Excel 보전청구서(`excel-template/reimbursement-claim-form.ts`) + `claim-form/aggregate` API 동시 전환(모두 aggregator 소비).

### 4.2 reimbursement-doclist-builder.ts

```ts
// 타깃 필터(:101) (r.acc_amt||0)>0  ← 유지
const amt = claimAmount(r);                // ← 신규
subtotal += amt;                           // :123
amount: formatAmount(amt),                 // :128
```

### 4.3 조회 select에 claim_amt 추가

| route | 위치 |
|---|---|
| `api/hwpx/reimbursement-claim/route.ts` | acc_book select(:99) `+ claim_amt` |
| `api/hwpx/reimbursement-doclist/route.ts` | acc_book select(:93-94) `+ claim_amt` |
| `api/reimbursement/claim-form/aggregate/route.ts` | acc_book select(:51) `+ claim_amt` |
| `dashboard/reimbursement/page.tsx` | ReimbursementTab select(:131) `+ claim_amt` |

### 4.4 회계 유지(불변, 전환 금지)

`income-ledger-builder`(서식7/22-4), `report-summary-builder`(22-1), `election-expense-summary-builder`(22-2), `settlement-calc`, `excel-template/data-query`(수입·지출부), `reports/page.tsx`, `excel/export` — 모두 `acc_amt` 그대로. (22-2는 보전청구서가 아닌 회계보고서 부속이므로 청구액 미반영.)

### 4.5 export-sqlite strip

```ts
// route.ts stripAppOnlyAccBookColumns (:462-469)
delete rest.acc_time;
delete rest.claim_amt;   // ← 추가 (finalAccBook/finalAccBookBak 양 파이프라인 커버)
```
- `COL_MAP`에는 추가하지 않음(추가 시 누출). import-sqlite는 화이트리스트라 영향 없음.

---

## 5. UI/UX Design (보전관리 화면 인라인 편집)

### 5.1 ReimbursementTab 상태/저장 확장

```ts
// 신규 상태: 편집중 청구액 입력(문자열). 미편집 행은 키 없음.
const [claimEdits, setClaimEdits] = useState<Record<number, string>>({});

// 조회 시 초기화: claim_amt 있으면 문자열, 없으면 "" (placeholder=acc_amt)
// 행별 유효 청구액(편집 우선 → claim_amt → acc_amt)
function effClaim(r: ReimbRow): number {
  const e = claimEdits[r.acc_book_id];
  if (e !== undefined) return e.trim() === "" ? r.acc_amt : Number(e.replace(/[^0-9]/g, "")) || 0;
  return claimAmount(r);
}

// 합계: 실지출 합계는 유지, 보전 대상 합계는 청구액 기준
const totalAmt = records.reduce((s, r) => s + r.acc_amt, 0);          // 실지출(불변)
const checkedTotal = records.filter(r => checkedIds.has(r.acc_book_id))
                            .reduce((s, r) => s + effClaim(r), 0);    // ← 청구액

// handleSave: acc_print_ok + claim_amt 동시 업데이트
.update({
  acc_print_ok: checkedIds.has(r.acc_book_id) ? "Y" : "N",
  claim_amt: claimToSave(r),   // 편집값 있으면 parse(""→null), 없으면 r.claim_amt 유지
})
```
- `claimToSave`: `claimEdits[id]`가 `""` → `null`, 숫자 → 정수, 키 없음 → `r.claim_amt`(변경 안 함).
- 빈 값 = NULL(0과 구분). 음수·비숫자 입력은 sanitize.

### 5.2 LedgerTable 청구액 컬럼 (opt-in, 부담 탭 불변)

```ts
// 신규 옵션 prop — 있을 때만 "청구액" 편집 컬럼 렌더(부담 탭은 미전달 → 14컬럼 유지)
claimEditor?: { value: (r: ReimbRow) => string; onChange: (id: number, v: string) => void };
```
- 헤더: "지 출 액" 옆에 `청구액`(rowSpan=2) 컬럼 추가(편집). 금회(실지출, red) 유지 → **실지출/청구액 2값 동시 표기**(검수).
- 셀: `<Input value={claimEditor.value(r)} placeholder={fmt(r.acc_amt)} onChange=...>` (보전 체크 여부와 무관히 편집 가능, 단 의미는 보전 대상에).
- colSpan 동적: `claimEditor`면 컬럼수 14→15 → 로딩/빈행 `colSpan`(:724,726) 및 tfoot `colSpan`(:753,755,758,760) +1 보정.
- tfoot "대상 합계" = `checkedTotal`(청구액) → 서식43 청구 합계와 일치. 라벨 "보전 대상 청구합계".

### 5.3 User Flow

보전관리 → 보전 탭 → 기간·계정 조회 → 보전 체크 + 청구액 인라인 수정(일할금액 등, 빈칸=지출액) → 저장 → 서식43/첨부서류목록/Excel 생성 시 청구액 자동 반영.

---

## 6. Edge Cases & Decisions

| 케이스 | 결정 |
|---|---|
| 청구액 미입력(NULL) | 출력에 `acc_amt` 사용. 화면 placeholder=지출액 |
| 청구액 0 입력 | `0` 저장(청구 0원). 빈칸과 구분 — 단 게이트는 `acc_amt>0`이라 행은 집계 대상 유지(청구 0원으로 합산) |
| 청구액 > 지출액 | 허용(경고 없음). 일할 외 케이스 대비. (선택: 초과 시 경고 — out of scope) |
| 음수/비숫자 입력 | sanitize(숫자만), 음수 불가 |
| 보전 미체크 행의 청구액 | 저장은 되나 보전 출력엔 미반영(체크 행만 집계) |
| acc_book_bak 동기화 | bak insert(명시 컬럼)에 claim_amt 추가는 선택(누락해도 NULL 무해) |
| 부담 탭(BurdenCostTab) | claimEditor 미전달 → 14컬럼·acc_amt 그대로(범위 외) |

---

## 7. 구현 순서 (Do 체크리스트)

1. [ ] `scripts/015_add_claim_amt.sql` + Supabase 적용 + `types/database.ts`
2. [ ] `lib/accounting/claim-amount.ts` + 단위 테스트
3. [ ] 출력 전환: aggregator(+AccBookRow.claim_amt), doclist-builder(+DoclistInputRow.claim_amt) + 각 테스트(claim 우선·NULL fallback, 게이트 유지)
4. [ ] 조회 select +claim_amt (서식43·doclist·aggregate route)
5. [ ] export-sqlite `stripAppOnlyAccBookColumns += claim_amt` + strip 테스트
6. [ ] 보전 탭: ReimbRow+select, claimEdits 상태, LedgerTable claimEditor 컬럼·colSpan, handleSave 확장, checkedTotal 청구액
7. [ ] 회귀 확인(회계 빌더/정산 불변), VERSION 0.13.0.0 + CHANGELOG

---

## 8. Test Strategy

| 레벨 | 대상 | 케이스 |
|---|---|---|
| 단위 | `claimAmount` | claim_amt 우선, NULL→acc_amt, 0 유지 |
| 단위 | aggregator | claim_amt 반영 합산, NULL fallback, 게이트 `acc_amt>0` 유지(청구 0 포함) |
| 단위 | doclist-builder | "보전청구액"·소계가 claim 반영, NULL fallback |
| 단위 | export-sqlite strip | claim_amt 제거 확인(누출 0) |
| 회귀 | income-ledger/report-summary/election-expense/settlement | acc_amt 불변(금액 동일) |
| 교차 | aggregator vs doclist | 동일 픽스처 청구 합계 일치(claim 반영) |

---

## 9. Security / Convention

- 보전 조회·저장 모두 org 스코프(기존 보전 탭 패턴 유지). claim_amt는 지출 전용.
- `claimAmount`는 보전 경로만 import(회계/정산 미오염) — 회귀 테스트로 보장.
- export-sqlite 회귀 방지(CLAUDE.md 규약), `release-version-ssot` 준수.

---

## 10. Next Step

1. [ ] `/pdca do reimbursement-claim-amount` — §7 순서
2. [ ] 마이그레이션 015 Supabase 적용(코드 의존 전)
3. [ ] `/pdca analyze` Gap(≥90%)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-13 | 초안(보전 탭·LedgerTable 실측 + 출력 전환·export strip 확정) | DrunkenZealnut |
