# 지출 재분배 재설계(계정×과목 최종잔액 0 + 지출일 스케줄링) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 후보자 보고 시점 재배분 SSOT `buildLedgerRows`에 신규 순수패스 3개(Pass-L 확성기 앵커·Pass3 과목잔액0·Pass4 지출일 스케줄링)를 추가해, 모든 (계정×과목) 최종잔액 0 + 행별 누계잔액 ≥ 0을 달성한다.

**Architecture:** 검증된 `Pass0→1→2`는 유지하고 앞뒤에 순수함수를 가산한다. Pass-L은 Pass1 앞(확성기 강제+protect), Pass3/Pass4는 Pass2 뒤(수입 재배정→최종0, 지출일 뒤로 이동→누계≥0). `buildLedgerRows` 한 곳 수정이 6개 산출물에 전파되며 원본 acc_book은 불변(보고 시점 메모리만). 후보자(자금원 82~85)만.

**Tech Stack:** TypeScript 5, Next.js 16, Vitest(happy-dom). 순수함수 + 단위 TDD. 바이너리 직접 호출(`node node_modules/vitest/vitest.mjs run <file>`).

**커밋 정책(사용자 전역 지침):** "커밋은 요청 시에만." 각 태스크의 **Commit 단계는 사용자 승인 시에만** 실행한다. 그 전까지는 변경 유지 + 테스트 통과만 확인(스테이징까지 OK, 실제 커밋 보류).

**설계 근거:** `docs/02-design/features/expense-realloc-zero-balance.design.md` (본 계획이 그 구현). 대체 대상: `docs/01-plan/features/item-balance-pass3.plan.md`.

---

## 파일 구조

- **Create** `app/src/lib/accounting/loudspeaker.ts` — 확성기 식별 상수 + `applyLoudspeakerAnchor`(Pass-L).
- **Create** `app/src/lib/accounting/loudspeaker.test.ts`
- **Create** `app/src/lib/accounting/item-balance-zero.ts` — `zeroItemBalances`(Pass3).
- **Create** `app/src/lib/accounting/item-balance-zero.test.ts`
- **Create** `app/src/lib/accounting/schedule-expense-dates.ts` — `scheduleExpenseDates`(Pass4).
- **Create** `app/src/lib/accounting/schedule-expense-dates.test.ts`
- **Modify** `app/src/lib/accounting/ledger-allocation.ts` — `buildLedgerRows`에 Pass-L/3/4 배선.
- **Modify** `app/src/lib/accounting/ledger-allocation.test.ts` — 통합 회귀(L9/L10) 추가.
- **Modify** `app/src/lib/accounting/persist-allocation.ts` — `acc_date`·원거래일 `bigo` 전파.
- **Modify** `app/src/lib/accounting/persist-allocation.test.ts` — 날짜 전파 회귀.
- **Modify** `app/VERSION`, `CHANGELOG.md` — feature MINOR bump.

각 신규 파일은 단일 책임(한 패스). 기존 패스(`adjust-negative-income`·`fund-realloc`·`item-allocation`)는 불변.

---

### Task 1: Pass-L 확성기 앵커 (`loudspeaker.ts`)

**Files:**
- Create: `app/src/lib/accounting/loudspeaker.ts`
- Test: `app/src/lib/accounting/loudspeaker.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`app/src/lib/accounting/loudspeaker.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { applyLoudspeakerAnchor, isLoudspeakerExpense } from "./loudspeaker";

interface Row {
  acc_book_id: number;
  incm_sec_cd: number;
  acc_sec_cd: number;
  item_sec_cd: number;
  acc_amt: number;
  content: string | null;
}
const row = (p: Partial<Row> & { acc_book_id: number }): Row => ({
  incm_sec_cd: 2, acc_sec_cd: 85, item_sec_cd: 87, acc_amt: 540000, content: "확성기 대여", ...p,
});

describe("applyLoudspeakerAnchor (Pass-L)", () => {
  it("LS1: 적요'확성기'+540,000 지출 → (84,86) 강제 + protectId", () => {
    const { rows, protectIds } = applyLoudspeakerAnchor([row({ acc_book_id: 1 })]);
    expect(rows[0].acc_sec_cd).toBe(84);
    expect(rows[0].item_sec_cd).toBe(86); // 원 87 → 86 교정
    expect(protectIds.has(1)).toBe(true);
  });

  it("LS2: 키워드만(금액 다름) → 비매칭", () => {
    const { rows, protectIds } = applyLoudspeakerAnchor([row({ acc_book_id: 1, acc_amt: 500000 })]);
    expect(rows[0].acc_sec_cd).toBe(85);
    expect(protectIds.size).toBe(0);
  });

  it("LS3: 금액만(키워드 없음) → 비매칭", () => {
    const { rows, protectIds } = applyLoudspeakerAnchor([row({ acc_book_id: 1, content: "현수막" })]);
    expect(rows[0].acc_sec_cd).toBe(85);
    expect(protectIds.size).toBe(0);
  });

  it("LS4: 수입(incm=1)이면 금액·키워드 맞아도 비매칭", () => {
    const { rows, protectIds } = applyLoudspeakerAnchor([row({ acc_book_id: 1, incm_sec_cd: 1 })]);
    expect(rows[0].acc_sec_cd).toBe(85);
    expect(protectIds.size).toBe(0);
  });

  it("LS5: content null 안전", () => {
    expect(isLoudspeakerExpense(row({ acc_book_id: 1, content: null }))).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd app && node node_modules/vitest/vitest.mjs run src/lib/accounting/loudspeaker.test.ts`
Expected: FAIL — `Failed to resolve import "./loudspeaker"`.

- [ ] **Step 3: 최소 구현**

`app/src/lib/accounting/loudspeaker.ts`:
```ts
/* ------------------------------------------------------------------ */
/*  Pass-L: 확성기 앵커                                                 */
/*  적요에 '확성기'를 포함하고 금액이 540,000인 지출을 후보자자산(84)·    */
/*  선거비용(86)으로 강제하고, 재배분(Pass1) 이동 대상에서 제외한다.      */
/*  근거: 확성장치는 후보자 자산으로 부담하는 선거비용(사용자 규칙).       */
/* ------------------------------------------------------------------ */
export const LOUDSPEAKER_KEYWORD = "확성기";
export const LOUDSPEAKER_AMOUNT = 540000;
export const LOUDSPEAKER_ACC_SEC_CD = 84; // 후보자자산
export const LOUDSPEAKER_ITEM_SEC_CD = 86; // 선거비용

interface LoudspeakerRow {
  acc_book_id: number;
  incm_sec_cd: number;
  acc_sec_cd: number;
  item_sec_cd: number;
  acc_amt: number;
  content: string | null;
}

export interface LoudspeakerResult<T> {
  rows: T[];
  protectIds: Set<number>;
}

/** 지출(incm=2) ∧ 적요에 '확성기' 포함 ∧ 금액 540,000. */
export function isLoudspeakerExpense(r: LoudspeakerRow): boolean {
  return (
    r.incm_sec_cd === 2 &&
    r.acc_amt === LOUDSPEAKER_AMOUNT &&
    (r.content ?? "").includes(LOUDSPEAKER_KEYWORD)
  );
}

/** 확성기 지출을 (84,86)으로 강제하고 protectIds에 수집(원본 배열은 불변, 새 배열 반환). */
export function applyLoudspeakerAnchor<T extends LoudspeakerRow>(rows: T[]): LoudspeakerResult<T> {
  const protectIds = new Set<number>();
  const out = rows.map((r) => {
    if (isLoudspeakerExpense(r)) {
      protectIds.add(r.acc_book_id);
      return { ...r, acc_sec_cd: LOUDSPEAKER_ACC_SEC_CD, item_sec_cd: LOUDSPEAKER_ITEM_SEC_CD };
    }
    return r;
  });
  return { rows: out, protectIds };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd app && node node_modules/vitest/vitest.mjs run src/lib/accounting/loudspeaker.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit (사용자 승인 시)**

```bash
git add app/src/lib/accounting/loudspeaker.ts app/src/lib/accounting/loudspeaker.test.ts
git commit -m "feat(accounting): 확성기 앵커 Pass-L (540,000→후보자자산·선거비용)"
```

---

### Task 2: Pass3 과목잔액0 (`item-balance-zero.ts`)

**Files:**
- Create: `app/src/lib/accounting/item-balance-zero.ts`
- Test: `app/src/lib/accounting/item-balance-zero.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`app/src/lib/accounting/item-balance-zero.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { zeroItemBalances } from "./item-balance-zero";
import type { ItemAllocOutRow } from "./item-allocation";

/** ItemAllocOutRow(=Pass2 출력) 헬퍼. */
function ia(p: Partial<ItemAllocOutRow> & { acc_book_id: number }): ItemAllocOutRow {
  const acc_sec_cd = p.acc_sec_cd ?? 85;
  const item = p.item_sec_cd ?? 86;
  const amt = p.acc_amt ?? 0;
  return {
    incm_sec_cd: 1, acc_sec_cd, item_sec_cd: item, acc_date: "20260501", acc_amt: amt,
    content: "x", rcp_no: null, bigo: null, cust_id: 1, customer: null,
    sheetAccSecCd: p.sheetAccSecCd ?? acc_sec_cd,
    effectiveAmt: p.effectiveAmt ?? amt, origin: "as-is",
    effectiveItemSecCd: p.effectiveItemSecCd ?? item, itemOrigin: "as-is",
    ...p,
  };
}
/** 과목별 순잔액(수입−지출). */
function nets(rows: ItemAllocOutRow[]) {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = `${r.sheetAccSecCd}:${r.effectiveItemSecCd}`;
    m.set(k, (m.get(k) ?? 0) + (r.incm_sec_cd === 1 ? r.effectiveAmt : -r.effectiveAmt));
  }
  return m;
}
const incSum = (rows: ItemAllocOutRow[]) =>
  rows.filter((r) => r.incm_sec_cd === 1).reduce((s, r) => s + r.effectiveAmt, 0);

describe("zeroItemBalances (Pass3)", () => {
  it("P3-1: 총액0 — 수입 전부 86, 지출 87 → 수입 재배정으로 86·87 둘 다 0", () => {
    const rows = [
      ia({ acc_book_id: 1, incm_sec_cd: 1, effectiveItemSecCd: 86, effectiveAmt: 500, acc_amt: 500 }),
      ia({ acc_book_id: 2, incm_sec_cd: 2, item_sec_cd: 87, effectiveItemSecCd: 87, effectiveAmt: 500, acc_amt: 500 }),
    ];
    const out = zeroItemBalances(rows);
    const n = nets(out);
    expect(n.get("85:86") ?? 0).toBe(0);
    expect(n.get("85:87")).toBe(0);
    expect(incSum(out)).toBe(500); // 합 보존
  });

  it("P3-2: 총액≠0 — 재배정 안 함(원본 그대로)", () => {
    const rows = [
      ia({ acc_book_id: 1, incm_sec_cd: 1, effectiveItemSecCd: 86, effectiveAmt: 900, acc_amt: 900 }),
      ia({ acc_book_id: 2, incm_sec_cd: 2, item_sec_cd: 87, effectiveItemSecCd: 87, effectiveAmt: 500, acc_amt: 500 }),
    ];
    const out = zeroItemBalances(rows);
    expect(out).toHaveLength(2);
    expect(nets(out).get("85:86")).toBe(900); // 잉여 유지, 강제 0 안 함
    expect(nets(out).get("85:87")).toBe(-500);
  });

  it("P3-3: 지출은 불변(과목·금액)", () => {
    const rows = [
      ia({ acc_book_id: 1, incm_sec_cd: 1, effectiveItemSecCd: 86, effectiveAmt: 500, acc_amt: 500 }),
      ia({ acc_book_id: 2, incm_sec_cd: 2, item_sec_cd: 87, effectiveItemSecCd: 87, effectiveAmt: 500, acc_amt: 500 }),
    ];
    const out = zeroItemBalances(rows);
    const exp = out.filter((r) => r.incm_sec_cd === 2);
    expect(exp).toHaveLength(1);
    expect(exp[0].effectiveItemSecCd).toBe(87);
    expect(exp[0].effectiveAmt).toBe(500);
  });

  it("P3-4: 부분 재배정 — 수입 800(86) 중 300만 87로, 나머지 500은 86 유지(분할)", () => {
    const rows = [
      ia({ acc_book_id: 1, incm_sec_cd: 1, effectiveItemSecCd: 86, effectiveAmt: 800, acc_amt: 800 }),
      ia({ acc_book_id: 2, incm_sec_cd: 2, item_sec_cd: 86, effectiveItemSecCd: 86, effectiveAmt: 500, acc_amt: 500 }),
      ia({ acc_book_id: 3, incm_sec_cd: 2, item_sec_cd: 87, effectiveItemSecCd: 87, effectiveAmt: 300, acc_amt: 300 }),
    ];
    const out = zeroItemBalances(rows);
    const n = nets(out);
    expect(n.get("85:86")).toBe(0);
    expect(n.get("85:87")).toBe(0);
    const incPieces = out.filter((r) => r.incm_sec_cd === 1 && r.acc_book_id === 1);
    expect(incPieces).toHaveLength(2); // 86 잔류 + 87 이동
    expect(incPieces.reduce((s, r) => s + r.effectiveAmt, 0)).toBe(800);
    expect(incPieces.find((r) => r.effectiveItemSecCd === 87)?.itemOrigin).toBe("item-moved");
  });

  it("P3-5: 자금원 독립 — 84는 84끼리만 재배정", () => {
    const rows = [
      ia({ acc_book_id: 1, incm_sec_cd: 1, acc_sec_cd: 84, sheetAccSecCd: 84, effectiveItemSecCd: 86, effectiveAmt: 400, acc_amt: 400 }),
      ia({ acc_book_id: 2, incm_sec_cd: 2, acc_sec_cd: 84, sheetAccSecCd: 84, item_sec_cd: 87, effectiveItemSecCd: 87, effectiveAmt: 400, acc_amt: 400 }),
      ia({ acc_book_id: 3, incm_sec_cd: 1, acc_sec_cd: 85, sheetAccSecCd: 85, effectiveItemSecCd: 86, effectiveAmt: 100, acc_amt: 100 }),
      ia({ acc_book_id: 4, incm_sec_cd: 2, acc_sec_cd: 85, sheetAccSecCd: 85, item_sec_cd: 86, effectiveItemSecCd: 86, effectiveAmt: 100, acc_amt: 100 }),
    ];
    const out = zeroItemBalances(rows);
    const n = nets(out);
    expect(n.get("84:87")).toBe(0);
    expect(n.get("84:86") ?? 0).toBe(0);
    expect(n.get("85:86")).toBe(0);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd app && node node_modules/vitest/vitest.mjs run src/lib/accounting/item-balance-zero.test.ts`
Expected: FAIL — `Failed to resolve import "./item-balance-zero"`.

- [ ] **Step 3: 최소 구현**

`app/src/lib/accounting/item-balance-zero.ts`:
```ts
/* ------------------------------------------------------------------ */
/*  Pass3: 과목 최종잔액 0 (수입 재배정으로 마무리)                       */
/*                                                                    */
/*  Pass2(시간순 best-effort) 이후 남은 (계정×과목) 불균형을, 같은        */
/*  자금원 내 잉여 과목의 수입 슬라이스를 부족 과목으로 재배정해 0으로     */
/*  만든다. 자금원 총액(수입합−지출합) ≠ 0이면 강제하지 않고 원본 유지     */
/*  (누락지출/데이터미완 신호는 상위 경고 체계로 표면화 — D4).            */
/*  지출은 불변(수입 슬라이스만 재태깅). 합·통장 총잔액 불변.             */
/* ------------------------------------------------------------------ */
import type { ItemAllocOutRow } from "./item-allocation";

export function zeroItemBalances(rows: ItemAllocOutRow[]): ItemAllocOutRow[] {
  const groups = new Map<number, ItemAllocOutRow[]>();
  for (const r of rows) {
    const g = groups.get(r.sheetAccSecCd) ?? [];
    g.push(r);
    groups.set(r.sheetAccSecCd, g);
  }
  const out: ItemAllocOutRow[] = [];
  for (const group of groups.values()) out.push(...zeroOneSource(group));
  return out;
}

function zeroOneSource(rows: ItemAllocOutRow[]): ItemAllocOutRow[] {
  // 과목별 순잔액(수입−지출).
  const net = new Map<number, number>();
  for (const r of rows) {
    const d = r.incm_sec_cd === 1 ? r.effectiveAmt : -r.effectiveAmt;
    net.set(r.effectiveItemSecCd, (net.get(r.effectiveItemSecCd) ?? 0) + d);
  }
  const total = [...net.values()].reduce((s, v) => s + v, 0);
  if (total !== 0) return rows; // D4: 총액≠0 → 재배정 안 함.

  const deficits = [...net.entries()]
    .filter(([, v]) => v < 0)
    .map(([item, v]) => ({ item, need: -v }))
    .sort((a, b) => a.item - b.item);
  if (deficits.length === 0) return rows; // 이미 균형.
  const surplus = new Map<number, number>(
    [...net.entries()].filter(([, v]) => v > 0).map(([item, v]) => [item, v]),
  );

  const out: ItemAllocOutRow[] = [];
  for (const r of rows) {
    // 수입이 아니거나 이 행의 과목이 잉여가 아니면 그대로.
    if (r.incm_sec_cd !== 1 || (surplus.get(r.effectiveItemSecCd) ?? 0) <= 0) {
      out.push(r);
      continue;
    }
    let remaining = r.effectiveAmt;
    const pieces: { item: number; amt: number; moved: boolean }[] = [];
    for (const def of deficits) {
      if (remaining <= 0) break;
      const avail = surplus.get(r.effectiveItemSecCd) ?? 0;
      if (def.need <= 0 || avail <= 0) continue;
      const move = Math.min(remaining, def.need, avail);
      if (move <= 0) continue;
      pieces.push({ item: def.item, amt: move, moved: true });
      remaining -= move;
      def.need -= move;
      surplus.set(r.effectiveItemSecCd, avail - move);
    }
    if (remaining > 0) pieces.push({ item: r.effectiveItemSecCd, amt: remaining, moved: false });
    const isSplit = pieces.length > 1;
    for (const p of pieces) {
      out.push({
        ...r,
        effectiveItemSecCd: p.item,
        effectiveAmt: p.amt,
        itemOrigin: p.moved ? "item-moved" : isSplit ? "item-keep" : r.itemOrigin,
        splitGroupId: isSplit ? r.acc_book_id : r.splitGroupId,
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd app && node node_modules/vitest/vitest.mjs run src/lib/accounting/item-balance-zero.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit (사용자 승인 시)**

```bash
git add app/src/lib/accounting/item-balance-zero.ts app/src/lib/accounting/item-balance-zero.test.ts
git commit -m "feat(accounting): Pass3 과목잔액0 (수입 재배정, 총액0일 때만)"
```

---

### Task 3: Pass4 지출일 스케줄링 (`schedule-expense-dates.ts`)

**Files:**
- Create: `app/src/lib/accounting/schedule-expense-dates.ts`
- Test: `app/src/lib/accounting/schedule-expense-dates.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`app/src/lib/accounting/schedule-expense-dates.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { scheduleExpenseDates } from "./schedule-expense-dates";
import type { ItemAllocOutRow } from "./item-allocation";
import { compareAccDateTime } from "./acc-book-sort";

function ia(p: Partial<ItemAllocOutRow> & { acc_book_id: number }): ItemAllocOutRow {
  const acc_sec_cd = p.acc_sec_cd ?? 85;
  const item = p.effectiveItemSecCd ?? p.item_sec_cd ?? 86;
  const amt = p.acc_amt ?? 0;
  return {
    incm_sec_cd: 1, acc_sec_cd, item_sec_cd: item, acc_date: "20260501", acc_amt: amt,
    content: "x", rcp_no: null, bigo: null, cust_id: 1, customer: null,
    sheetAccSecCd: p.sheetAccSecCd ?? acc_sec_cd,
    effectiveAmt: p.effectiveAmt ?? amt, origin: "as-is",
    effectiveItemSecCd: item, itemOrigin: "as-is",
    ...p,
  };
}
/** (계정×과목) 시간순 최저 누계잔액. */
function minBalance(rows: ItemAllocOutRow[], key: string) {
  const sorted = [...rows]
    .filter((r) => `${r.sheetAccSecCd}:${r.effectiveItemSecCd}` === key)
    .sort((a, b) => compareAccDateTime(a, b) || a.incm_sec_cd - b.incm_sec_cd || a.acc_book_id - b.acc_book_id);
  let bal = 0, min = 0;
  for (const r of sorted) {
    bal += r.incm_sec_cd === 1 ? r.effectiveAmt : -r.effectiveAmt;
    min = Math.min(min, bal);
  }
  return min;
}

describe("scheduleExpenseDates (Pass4)", () => {
  it("S1: 지출이 수입보다 이르면 → 지출일을 수입일로 이동, 누계≥0, 원거래일 비고", () => {
    const rows = [
      ia({ acc_book_id: 1, incm_sec_cd: 2, effectiveItemSecCd: 87, effectiveAmt: 500, acc_amt: 500, acc_date: "20260501" }),
      ia({ acc_book_id: 2, incm_sec_cd: 1, effectiveItemSecCd: 87, effectiveAmt: 500, acc_amt: 500, acc_date: "20260601" }),
    ];
    const out = scheduleExpenseDates(rows);
    const exp = out.find((r) => r.acc_book_id === 1)!;
    expect(exp.acc_date).toBe("20260601"); // 뒤로 이동
    expect(exp.note).toContain("원거래일 2026-05-01");
    expect(minBalance(out, "85:87")).toBe(0);
  });

  it("S2: 통째이동 우선 — 부분충당(300 가용) 상황도 분할 없이 전액을 커버일로", () => {
    const rows = [
      ia({ acc_book_id: 1, incm_sec_cd: 1, effectiveItemSecCd: 86, effectiveAmt: 300, acc_amt: 300, acc_date: "20260501" }),
      ia({ acc_book_id: 2, incm_sec_cd: 2, effectiveItemSecCd: 86, effectiveAmt: 500, acc_amt: 500, acc_date: "20260505" }),
      ia({ acc_book_id: 3, incm_sec_cd: 1, effectiveItemSecCd: 86, effectiveAmt: 200, acc_amt: 200, acc_date: "20260510" }),
    ];
    const out = scheduleExpenseDates(rows);
    expect(out).toHaveLength(3); // 분할 없음
    expect(out.find((r) => r.acc_book_id === 2)!.acc_date).toBe("20260510"); // 500 전액 05-10로
    expect(minBalance(out, "85:86")).toBe(0);
  });

  it("S3: 이미 충당돼 있으면 날짜 불변(no-op)", () => {
    const rows = [
      ia({ acc_book_id: 1, incm_sec_cd: 1, effectiveItemSecCd: 86, effectiveAmt: 500, acc_amt: 500, acc_date: "20260501" }),
      ia({ acc_book_id: 2, incm_sec_cd: 2, effectiveItemSecCd: 86, effectiveAmt: 300, acc_amt: 300, acc_date: "20260502" }),
    ];
    const out = scheduleExpenseDates(rows);
    const exp = out.find((r) => r.acc_book_id === 2)!;
    expect(exp.acc_date).toBe("20260502");
    expect(exp.note ?? null).toBeNull();
  });

  it("S4: 환급(음수 지출)은 원 날짜 유지", () => {
    const rows = [
      ia({ acc_book_id: 1, incm_sec_cd: 1, effectiveItemSecCd: 86, effectiveAmt: 500, acc_amt: 500, acc_date: "20260601" }),
      ia({ acc_book_id: 2, incm_sec_cd: 2, effectiveItemSecCd: 86, effectiveAmt: -100, acc_amt: -100, acc_date: "20260501" }),
    ];
    const out = scheduleExpenseDates(rows);
    expect(out.find((r) => r.acc_book_id === 2)!.acc_date).toBe("20260501");
  });

  it("S5: 여러 지출을 늦은 수입일로 몰아도 누계≥0·무분할", () => {
    const rows = [
      ia({ acc_book_id: 1, incm_sec_cd: 2, effectiveItemSecCd: 86, effectiveAmt: 200, acc_amt: 200, acc_date: "20260501" }),
      ia({ acc_book_id: 2, incm_sec_cd: 2, effectiveItemSecCd: 86, effectiveAmt: 200, acc_amt: 200, acc_date: "20260502" }),
      ia({ acc_book_id: 3, incm_sec_cd: 2, effectiveItemSecCd: 86, effectiveAmt: 200, acc_amt: 200, acc_date: "20260503" }),
      ia({ acc_book_id: 4, incm_sec_cd: 1, effectiveItemSecCd: 86, effectiveAmt: 600, acc_amt: 600, acc_date: "20260505" }),
    ];
    const out = scheduleExpenseDates(rows);
    expect(out).toHaveLength(4);
    expect(out.filter((r) => r.incm_sec_cd === 2).every((r) => r.acc_date === "20260505")).toBe(true);
    expect(minBalance(out, "85:86")).toBe(0);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd app && node node_modules/vitest/vitest.mjs run src/lib/accounting/schedule-expense-dates.test.ts`
Expected: FAIL — `Failed to resolve import "./schedule-expense-dates"`.

- [ ] **Step 3: 최소 구현**

`app/src/lib/accounting/schedule-expense-dates.ts`:
```ts
/* ------------------------------------------------------------------ */
/*  Pass4: 지출일 스케줄링 (행별 누계잔액 ≥ 0)                            */
/*                                                                    */
/*  각 (계정×과목) 시트에서, 충당 수입보다 시간상 앞선 양수 지출의        */
/*  날짜를 "누계수입이 그 지출을 덮는 최초 수입일"로 뒤로 민다(뒤로만).    */
/*  Pass3로 시트 총 수입=총 지출이 보장되면 통째이동만으로 무분할·기간내   */
/*  해결(마지막 지출도 마지막 수입일에 덮임). 환급·0 지출은 원 날짜 유지.  */
/*  금액·계정·과목 불변(날짜만). 정렬 SSOT: acc-book-sort.ts.            */
/* ------------------------------------------------------------------ */
import { compareAccDateTime } from "./acc-book-sort";
import type { ItemAllocOutRow } from "./item-allocation";

export function scheduleExpenseDates(rows: ItemAllocOutRow[]): ItemAllocOutRow[] {
  const groups = new Map<string, ItemAllocOutRow[]>();
  for (const r of rows) {
    const key = `${r.sheetAccSecCd}:${r.effectiveItemSecCd}`;
    const g = groups.get(key) ?? [];
    g.push(r);
    groups.set(key, g);
  }
  const newDate = new Map<ItemAllocOutRow, string>();
  for (const group of groups.values()) scheduleOneSheet(group, newDate);

  return rows.map((r) => {
    const nd = newDate.get(r);
    if (nd == null) return r;
    return { ...r, acc_date: nd, note: appendOrigDate(r.note, r.acc_date) };
  });
}

function scheduleOneSheet(rows: ItemAllocOutRow[], newDate: Map<ItemAllocOutRow, string>): void {
  // 누적수입 프리픽스(날짜별).
  const incomes = rows
    .filter((r) => r.incm_sec_cd === 1)
    .sort((a, b) => compareAccDateTime(a, b) || a.acc_book_id - b.acc_book_id);
  const cumPoints: { date: string; cum: number }[] = [];
  let cum = 0;
  for (const inc of incomes) {
    cum += inc.effectiveAmt;
    const last = cumPoints[cumPoints.length - 1];
    if (last && last.date === inc.acc_date) last.cum = cum;
    else cumPoints.push({ date: inc.acc_date, cum });
  }
  const earliestDate = (threshold: number): string | null => {
    for (const p of cumPoints) if (p.cum >= threshold) return p.date;
    return null; // 총수입 < threshold (총액≠0 부족) — 이동 불가.
  };

  const posExpenses = rows
    .filter((r) => r.incm_sec_cd === 2 && r.effectiveAmt > 0)
    .sort((a, b) => compareAccDateTime(a, b) || a.acc_book_id - b.acc_book_id);
  let scheduledTotal = 0;
  for (const e of posExpenses) {
    const threshold = scheduledTotal + e.effectiveAmt;
    const d = earliestDate(threshold);
    // 뒤로만: 커버일이 원 날짜보다 늦을 때만 이동.
    if (d != null && d > e.acc_date) newDate.set(e, d);
    scheduledTotal += e.effectiveAmt;
  }
}

/** YYYYMMDD → 비고에 "원거래일 YYYY-MM-DD" 부가(기존 비고 보존). */
function appendOrigDate(note: string | null | undefined, origYmd: string): string {
  const d = `${origYmd.slice(0, 4)}-${origYmd.slice(4, 6)}-${origYmd.slice(6, 8)}`;
  const tag = `원거래일 ${d}`;
  return note ? `${note} · ${tag}` : tag;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd app && node node_modules/vitest/vitest.mjs run src/lib/accounting/schedule-expense-dates.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit (사용자 승인 시)**

```bash
git add app/src/lib/accounting/schedule-expense-dates.ts app/src/lib/accounting/schedule-expense-dates.test.ts
git commit -m "feat(accounting): Pass4 지출일 스케줄링 (누계잔액≥0, 통째이동)"
```

---

### Task 4: `buildLedgerRows` 배선 + 통합 회귀

**Files:**
- Modify: `app/src/lib/accounting/ledger-allocation.ts:49-90` (`buildLedgerRows`)
- Modify: `app/src/lib/accounting/ledger-allocation.test.ts` (L9/L10 추가)

- [ ] **Step 1: 실패 통합 테스트 작성**

`app/src/lib/accounting/ledger-allocation.test.ts` 의 `describe` 블록 안, L8 뒤에 추가:
```ts
  // ── 총액0인데 수입이 늦게 온 케이스(Pass3+Pass4 대상) ──
  const LATE_INCOME: ReallocRow[] = [
    r85(1, 2, "20260501", 87, 500000), // 선거비용외 지출(이른 날짜)
    r85(2, 1, "20260601", 86, 500000), // 수입(늦은 날짜, 원과목 86)
  ];

  it("L9: 수입이 지출보다 늦어도 → 85×87·85×86 최종 0, 누계 ≥ 0", () => {
    const out = buildLedgerRows(LATE_INCOME);
    const { bal, min } = ledgerBalances(out);
    expect(bal.get("85:87")).toBe(0); // Pass3: 수입 86→87 재배정
    expect(bal.get("85:86") ?? 0).toBe(0);
    for (const v of min.values()) expect(v).toBeGreaterThanOrEqual(0); // Pass4
  });

  it("L10: Pass4가 이른 지출을 수입일로 이동하고 원거래일 비고를 남김", () => {
    const out = buildLedgerRows(LATE_INCOME);
    const exp = out.filter((r) => r.incm_sec_cd === 2 && r.acc_book_id === 1);
    expect(exp.every((r) => r.acc_date === "20260601")).toBe(true);
    expect(exp.some((r) => (r.note ?? "").includes("원거래일 2026-05-01"))).toBe(true);
  });

  it("L11: 확성기(540,000) → 후보자자산(84)·선거비용(86) 강제", () => {
    const rows = [
      raw({ acc_book_id: 1, incm_sec_cd: 1, acc_sec_cd: 84, item_sec_cd: 86, acc_date: "20260401", acc_amt: 540000 }),
      raw({ acc_book_id: 2, incm_sec_cd: 2, acc_sec_cd: 85, item_sec_cd: 87, acc_date: "20260501", acc_amt: 540000, content: "확성기 대여료" }),
    ];
    const out = buildLedgerRows(rows);
    const ls = out.filter((r) => r.acc_book_id === 2);
    expect(ls.every((r) => r.accSecCd === 84)).toBe(true); // 85→84 강제
    expect(ls.every((r) => r.itemSecCd === 86)).toBe(true); // 87→86 강제
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd app && node node_modules/vitest/vitest.mjs run src/lib/accounting/ledger-allocation.test.ts`
Expected: FAIL — L9(`85:87` = −500000, min < 0), L10, L11 실패. 기존 L1~L8은 PASS.

- [ ] **Step 3: 배선 구현**

`app/src/lib/accounting/ledger-allocation.ts` 상단 import에 추가:
```ts
import { applyLoudspeakerAnchor } from "./loudspeaker";
import { zeroItemBalances } from "./item-balance-zero";
import { scheduleExpenseDates } from "./schedule-expense-dates";
```

`buildLedgerRows` 본문의 Pass 조합부(현재 54-56행)를 교체:
```ts
  const p0 = adjustNegativeIncome(rows); // Pass0
  const { rows: pL, protectIds } = applyLoudspeakerAnchor(p0); // Pass-L 확성기 앵커
  const p1 = reallocateFundSources(pL, { protectIds }).rows; // Pass1 (확성기 보호)
  const p2 = allocateIncomeToItems(p1); // Pass2
  const p3 = zeroItemBalances(p2); // Pass3 (계정×과목) 최종 0
  const p4 = scheduleExpenseDates(p3); // Pass4 지출일 스케줄링(누계≥0)
```

그리고 이어지는 `return p2.map((r) => {` 를 `return p4.map((r) => {` 로 변경.
(주: `fundMoved`/`itemMoved`/`origin` 매핑은 그대로 — Pass3/4는 `origin`·`itemOrigin`·`acc_date`·`note` 필드를 보존/갱신한다.)

- [ ] **Step 4: 통합 + 전체 회귀 통과 확인**

Run: `cd app && node node_modules/vitest/vitest.mjs run src/lib/accounting/ledger-allocation.test.ts src/lib/accounting/item-allocation.test.ts src/lib/accounting/fund-realloc.test.ts`
Expected: PASS (L1~L11 포함 전체). 특히 L1(FUND_DATA_1 항등)·L2(ORG11 무음수)·L7/L8(지출과목 불변) 유지.

- [ ] **Step 5: Commit (사용자 승인 시)**

```bash
git add app/src/lib/accounting/ledger-allocation.ts app/src/lib/accounting/ledger-allocation.test.ts
git commit -m "feat(accounting): buildLedgerRows에 Pass-L/3/4 배선 (계정×과목 최종0+누계≥0)"
```

---

### Task 5: `persist-allocation` 날짜·비고 전파

**Files:**
- Modify: `app/src/lib/accounting/persist-allocation.ts:154-189` (`planAllocationPersist`의 updates/inserts)
- Modify: `app/src/lib/accounting/persist-allocation.test.ts`

**배경:** `planAllocationPersist`는 slice0(updates)·이동분(inserts)을 만들 때 `...rawRow`(원 날짜) spread 후 `incm/acc/item/amt`만 덮고 **`acc_date`·`bigo`를 갱신 안 한다**. Pass4가 옮긴 날짜가 뷰어·.db에 반영되려면 ledger 슬라이스의 `acc_date`와 원거래일 비고를 전파해야 한다.

- [ ] **Step 1: 실패 테스트 작성**

`app/src/lib/accounting/persist-allocation.test.ts` 에 추가(파일 상단 import·헬퍼는 기존 것 사용; 없으면 아래 자립 테스트를 신규 `describe`로 추가):
```ts
import { describe, it, expect } from "vitest";
import { planAllocationPersist, applyPlanInMemory, type AllocTrackedRow } from "./persist-allocation";

function tracked(p: Partial<AllocTrackedRow> & { acc_book_id: number }): AllocTrackedRow {
  return {
    incm_sec_cd: 1, acc_sec_cd: 85, item_sec_cd: 86, acc_amt: 0, acc_date: "20260501",
    cust_id: 1, content: "x", rcp_no: null, rcp_no2: null, bigo: null, customer: null,
    alloc_src_id: null, alloc_seq: null, raw_incm_sec_cd: null, raw_acc_sec_cd: null,
    raw_item_sec_cd: null, raw_acc_amt: null, alloc_gen: null, ...p,
  };
}

describe("planAllocationPersist 날짜 전파 (Pass4)", () => {
  it("PA1: Pass4가 옮긴 지출일이 slice0/이동분 acc_date에 반영되고 원거래일 비고", () => {
    // 총액0·수입 늦음 → Pass4가 지출(id1)을 06-01로 이동.
    const current: AllocTrackedRow[] = [
      tracked({ acc_book_id: 1, incm_sec_cd: 2, acc_sec_cd: 85, item_sec_cd: 87, acc_amt: 500000, acc_date: "20260501" }),
      tracked({ acc_book_id: 2, incm_sec_cd: 1, acc_sec_cd: 85, item_sec_cd: 86, acc_amt: 500000, acc_date: "20260601" }),
    ];
    const plan = planAllocationPersist(current, "20260701");
    const applied = applyPlanInMemory(current, plan);
    const exp = applied.find((r) => r.acc_book_id === 1)!;
    expect(exp.acc_date).toBe("20260601"); // 이동 날짜 반영
    expect(String(exp.bigo ?? "")).toContain("원거래일 2026-05-01");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd app && node node_modules/vitest/vitest.mjs run src/lib/accounting/persist-allocation.test.ts`
Expected: FAIL — `exp.acc_date` 가 "20260501"(원 날짜), bigo 미포함.

- [ ] **Step 3: 전파 구현**

`app/src/lib/accounting/persist-allocation.ts` `planAllocationPersist` 내부. 먼저 slice0 선택부(`const primary = ...`) 다음에 원거래일 비고 헬퍼를 인라인 추가하고, `updates.push`/`inserts.push`에 `acc_date`·`bigo`를 실는다.

`updates.push({ ... })` 블록을 다음으로 교체:
```ts
    updates.push({
      ...rawRow,
      acc_book_id: id,
      incm_sec_cd: primary.incm_sec_cd,
      acc_sec_cd: primary.accSecCd,
      item_sec_cd: primary.itemSecCd,
      acc_amt: primary.amt,
      acc_date: primary.acc_date, // Pass4 이동 날짜
      bigo: mergeOrigDateBigo(rawRow.bigo, rawRow.acc_date, primary.acc_date),
      alloc_src_id: null,
      alloc_seq: 0,
      alloc_gen: generation,
      raw_incm_sec_cd: changed ? rawRow.incm_sec_cd : null,
      raw_acc_sec_cd: changed ? rawRow.acc_sec_cd : null,
      raw_item_sec_cd: changed ? rawRow.item_sec_cd : null,
      raw_acc_amt: changed ? rawRow.acc_amt : null,
    });
```

`inserts.push({ ... })` 블록의 필드에 `acc_date`·`bigo` 추가:
```ts
      inserts.push({
        ...meta,
        incm_sec_cd: s.incm_sec_cd,
        acc_sec_cd: s.accSecCd,
        item_sec_cd: s.itemSecCd,
        acc_amt: s.amt,
        acc_date: s.acc_date, // Pass4 이동 날짜
        bigo: mergeOrigDateBigo(rawRow.bigo, rawRow.acc_date, s.acc_date),
        alloc_src_id: id,
        alloc_seq: seq++,
        alloc_gen: generation,
        raw_incm_sec_cd: null,
        raw_acc_sec_cd: null,
        raw_item_sec_cd: null,
        raw_acc_amt: null,
      });
```

파일 하단(모듈 스코프)에 헬퍼 추가:
```ts
/** 재조정으로 날짜가 바뀐 행에 "원거래일 YYYY-MM-DD" 비고를 붙인다(변화 없으면 원 비고). */
function mergeOrigDateBigo(bigo: string | null, rawYmd: string, newYmd: string): string | null {
  if (rawYmd === newYmd) return bigo;
  const d = `${rawYmd.slice(0, 4)}-${rawYmd.slice(4, 6)}-${rawYmd.slice(6, 8)}`;
  const tag = `원거래일 ${d}`;
  return bigo ? `${bigo} · ${tag}` : tag;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd app && node node_modules/vitest/vitest.mjs run src/lib/accounting/persist-allocation.test.ts src/lib/accounting/adjusted-ledger.test.ts`
Expected: PASS. (adjusted-ledger 회귀도 통과 — buildAdjustedAccBook이 이 경로를 씀.)

- [ ] **Step 5: Commit (사용자 승인 시)**

```bash
git add app/src/lib/accounting/persist-allocation.ts app/src/lib/accounting/persist-allocation.test.ts
git commit -m "feat(accounting): persist-allocation에 Pass4 날짜·원거래일 비고 전파"
```

---

### Task 6: 전체 회귀 + 버전/체인지로그

**Files:**
- Modify: `app/VERSION`
- Modify: `CHANGELOG.md` (레포 루트)

- [ ] **Step 1: 전체 accounting 테스트 통과 확인**

Run: `cd app && node node_modules/vitest/vitest.mjs run src/lib/accounting/`
Expected: PASS(전 파일). 특히 `adjusted-ledger-parity`·`settlement-summary`·`income-expense-report-summary`·`report-ledger` 회귀 통과(뷰어==export 채번·날짜 일치, 결산 잔액 불변).

- [ ] **Step 2: (실패 시) parity 원인 격리**

parity 실패 시, 원인은 대개 Pass4 날짜 이동이 채번/정렬에 준 영향. 확인:
- `fillExportReceiptNumbers`(receipt-no)는 (계정×과목) prefix라 날짜 무관 — 채번 불변이어야 정상.
- `fillExportSortNumbers`(acc-book-sort)는 이동 날짜로 재정렬 — 뷰어·export 동일 함수라 일치해야 정상.
수정은 해당 테스트 기대값을 이동 날짜 기준으로 갱신(회귀가 실제 개선을 반영). 데이터 손상 아님을 `min ≥ 0`·합 보존으로 재확인.

- [ ] **Step 3: VERSION bump**

`app/VERSION` 의 현재 값을 읽고 feature MINOR를 +1 한다(예: `0.30.0.0` → `0.31.0.0`). ([[release-version-ssot]] — 루트 VERSION 아님, `app/VERSION`이 SSOT.)

- [ ] **Step 4: CHANGELOG 추가**

`CHANGELOG.md`(레포 루트) 최상단에 항목 추가:
```markdown
## 0.31.0.0 — 지출 재분배 재설계: 계정×과목 최종잔액 0 + 지출일 스케줄링

- 보고 시점 재배분 SSOT(`buildLedgerRows`)에 신규 순수패스 3개 추가:
  - Pass-L: 확성기(적요'확성기'+540,000) → 후보자자산(84)·선거비용(86) 강제 + 재배분 제외.
  - Pass3(`zeroItemBalances`): 자금원 총액0이면 남은 (계정×과목) 불균형을 수입 재배정으로 최종 0(총액≠0은 경고 표면화).
  - Pass4(`scheduleExpenseDates`): 지출일을 뒤로 이동해 행별 누계잔액 ≥ 0(통째이동·무분할·기간내), 비고에 원거래일.
- 원본 acc_book 불변(보고 시점 메모리만), 후보자(82~85)만. 6개 산출물(수입지출부 뷰어·HWPX 서식7/22-x·결산·자료백업 .db·reports Excel) 자동 반영.
```

- [ ] **Step 5: Commit (사용자 승인 시)**

```bash
git add app/VERSION CHANGELOG.md
git commit -m "chore(release): v0.31.0.0 지출 재분배 재설계 (계정×과목 최종0+지출일 스케줄링)"
```

---

## 수동 QA (배포 전, 코드 태스크 아님)

실데이터(오준석후보) 로그인 후:
1. **수입·지출부 뷰어**(`dashboard/income-expense-book`): 후보자 모든 (계정×과목) 시트 **최종잔액 0**·행별 **누계 ≥ 0**, 확성기 행이 후보자자산·선거비용에 표시, 이동 지출에 원거래일 비고.
2. **HWPX 서식7 / 22-4**: 음수·비영 잔액 없음.
3. **자료백업 .db**: `ACC_BOOK`은 이동 날짜, `ACC_BOOK_BAK`은 원 날짜(감사추적). FK 고아 0. Windows 프로그램 로드 정상.
4. **총액≠0 자금원**(누락지출 스냅샷): 0 강제 없이 경고 표면화 확인.

---

## Self-Review 결과

- **Spec coverage:** 설계 §4.2→Task1, §4.3→Task2, §4.4→Task3, §4.1 배선→Task4, §4.6 날짜전파→Task5, §7 테스트→각 태스크, §10 롤아웃→Task6. D1(수입배정)=Pass2+3, D2(확성기)=Pass-L/Task1·L11, D3(날짜)=Pass4/Task3, D4(총액≠0)=Pass3 skip/P3-2. 전 항목 태스크 매핑됨.
- **Placeholder scan:** 모든 코드 스텝에 완전한 코드·명령·기대값 기재. TBD/TODO 없음.
- **Type consistency:** `ItemAllocOutRow`(effectiveItemSecCd·itemOrigin·sheetAccSecCd), `LedgerRow`(accSecCd·itemSecCd·amt·acc_date·note), `ReallocRow`, `AllocTrackedRow`(acc_date·bigo) — 기존 정의와 일치. `applyLoudspeakerAnchor`/`zeroItemBalances`/`scheduleExpenseDates` 시그니처가 Task4 배선과 일치. `mergeOrigDateBigo`(Task5)·`appendOrigDate`(Task3) 각 파일 내 정의.
