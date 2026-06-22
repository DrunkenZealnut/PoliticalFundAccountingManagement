import { describe, it, expect } from "vitest";
import { allocateIncomeToItems, type ItemAllocOutRow } from "./item-allocation";
import type { ReallocOutRow } from "./fund-realloc";
import { compareAccDateTime } from "./acc-book-sort";

/** ReallocOutRow(=Pass1 출력) 헬퍼. sheetAccSecCd 미지정 시 acc_sec_cd, effectiveAmt 미지정 시 acc_amt. */
function orow(p: Partial<ReallocOutRow> & { acc_book_id: number }): ReallocOutRow {
  const acc_sec_cd = p.acc_sec_cd ?? 85;
  const acc_amt = p.acc_amt ?? 0;
  return {
    incm_sec_cd: 1,
    acc_sec_cd,
    item_sec_cd: 86,
    acc_date: "20260501",
    acc_amt,
    content: "x",
    rcp_no: null,
    bigo: null,
    cust_id: 1,
    customer: null,
    sheetAccSecCd: p.sheetAccSecCd ?? acc_sec_cd,
    effectiveAmt: p.effectiveAmt ?? acc_amt,
    origin: "as-is",
    ...p,
  };
}
const inc = (id: number, item: number, date: string, amt: number, src = 85) =>
  orow({ acc_book_id: id, incm_sec_cd: 1, acc_sec_cd: src, item_sec_cd: item, acc_date: date, acc_amt: amt });
const exp = (id: number, item: number, date: string, amt: number, src = 85) =>
  orow({ acc_book_id: id, incm_sec_cd: 2, acc_sec_cd: src, item_sec_cd: item, acc_date: date, acc_amt: amt });

/** (계정×과목)별 시간순 잔액(수입−지출)과 최저잔액. effectiveItemSecCd 기준. */
function itemBalances(rows: ItemAllocOutRow[]) {
  const sorted = [...rows].sort(
    (a, b) => compareAccDateTime(a, b) || a.incm_sec_cd - b.incm_sec_cd || a.acc_book_id - b.acc_book_id,
  );
  const bal = new Map<string, number>();
  const min = new Map<string, number>();
  const sum = new Map<string, { inc: number; exp: number }>();
  for (const r of sorted) {
    const key = `${r.sheetAccSecCd}:${r.effectiveItemSecCd}`;
    const delta = r.incm_sec_cd === 1 ? r.effectiveAmt : -r.effectiveAmt;
    bal.set(key, (bal.get(key) ?? 0) + delta);
    min.set(key, Math.min(min.get(key) ?? 0, bal.get(key)!));
    const s = sum.get(key) ?? { inc: 0, exp: 0 };
    if (r.incm_sec_cd === 1) s.inc += r.effectiveAmt;
    else s.exp += r.effectiveAmt;
    sum.set(key, s);
  }
  return { bal, min, sum };
}
const sumBy = (rows: ItemAllocOutRow[], incm: number) =>
  rows.filter((r) => r.incm_sec_cd === incm).reduce((s, r) => s + r.effectiveAmt, 0);

describe("allocateIncomeToItems (Pass2 과목 배분)", () => {
  it("A1: 과목87 지출에 87 수입 0 → 86 잉여 수입에서 끌어와 균형(85×87=0)", () => {
    const rows = [
      inc(1, 86, "20260430", 1000), // 전부 과목86 수입
      exp(2, 87, "20260501", 600), // 과목87 지출 — 87 풀 비어 86서 끌어옴
      exp(3, 86, "20260502", 300),
    ];
    const out = allocateIncomeToItems(rows);
    const { bal } = itemBalances(out);
    expect(bal.get("85:87")).toBe(0); // 600 끌어와 87 균형
    expect(bal.get("85:86")).toBe(100); // 1000 − 600(→87) − 300 = 100 잉여
  });

  it("A2: 수입이 자기 과목 지출만 충당 → 분할 없음(as-is, 단일 행)", () => {
    const rows = [inc(1, 86, "20260430", 1000), exp(2, 86, "20260501", 300)];
    const out = allocateIncomeToItems(rows);
    const incomeRows = out.filter((r) => r.incm_sec_cd === 1);
    expect(incomeRows).toHaveLength(1);
    expect(incomeRows[0].effectiveItemSecCd).toBe(86);
    expect(incomeRows[0].effectiveAmt).toBe(1000);
    expect(incomeRows[0].itemOrigin).toBe("as-is");
  });

  it("A3: 잉여 수입은 원과목 유지", () => {
    const rows = [inc(1, 86, "20260430", 1000), exp(2, 87, "20260501", 400)];
    const out = allocateIncomeToItems(rows);
    const { bal } = itemBalances(out);
    expect(bal.get("85:87")).toBe(0);
    expect(bal.get("85:86")).toBe(600); // 잉여 600 원과목 86
    // 86 원과목 잔류분 행 존재
    expect(out.some((r) => r.incm_sec_cd === 1 && r.effectiveItemSecCd === 86 && r.itemOrigin !== "item-moved")).toBe(true);
  });

  it("A4: 수입 분할 시 splitGroupId로 묶이고 합 보존(86→일부 87)", () => {
    const rows = [
      inc(1, 86, "20260430", 1000),
      exp(2, 87, "20260501", 600), // 600을 86서 끌어 87로
      exp(3, 86, "20260502", 400),
    ];
    const out = allocateIncomeToItems(rows);
    const split = out.filter((r) => r.incm_sec_cd === 1 && r.acc_book_id === 1);
    expect(split.length).toBe(2); // 86 잔류 + 87 이동
    expect(split.every((r) => r.splitGroupId === 1)).toBe(true);
    expect(split.reduce((s, r) => s + r.effectiveAmt, 0)).toBe(1000); // 합 보존
    expect(split.find((r) => r.effectiveItemSecCd === 87)?.itemOrigin).toBe("item-moved");
  });

  it("A5: 환급(음수 지출)은 원과목 그대로, 수입 소비 안 함", () => {
    const rows = [
      inc(1, 86, "20260430", 1000),
      exp(2, 86, "20260501", -100), // 환급
      exp(3, 86, "20260502", 500),
    ];
    const out = allocateIncomeToItems(rows);
    const refund = out.find((r) => r.acc_book_id === 2);
    expect(refund?.effectiveItemSecCd).toBe(86);
    expect(refund?.effectiveAmt).toBe(-100);
    expect(refund?.itemOrigin).toBe("as-is");
    const { bal } = itemBalances(out);
    expect(bal.get("85:86")).toBe(600); // 1000 − (−100) − 500 = 600
  });

  it("A6: 지출은 항상 원과목 유지(itemOrigin as-is)", () => {
    const rows = [inc(1, 86, "20260430", 1000), exp(2, 87, "20260501", 600)];
    const out = allocateIncomeToItems(rows);
    expect(out.filter((r) => r.incm_sec_cd === 2).every((r) => r.itemOrigin === "as-is")).toBe(true);
    expect(out.find((r) => r.acc_book_id === 2)?.effectiveItemSecCd).toBe(87);
  });

  it("A7: 합 보존 — 수입 합·지출 합 불변(분할만)", () => {
    const rows = [
      inc(1, 86, "20260430", 1000),
      inc(2, 87, "20260430", 200),
      exp(3, 87, "20260501", 800), // 87 풀 200 + 86서 600
      exp(4, 86, "20260502", 300),
    ];
    const out = allocateIncomeToItems(rows);
    expect(sumBy(out, 1)).toBe(1200); // 수입 합
    expect(sumBy(out, 2)).toBe(1100); // 지출 합
  });

  it("A8: 여러 자금원 독립 처리(자금원 경계 넘지 않음)", () => {
    const rows = [
      inc(1, 86, "20260430", 1000, 84),
      exp(2, 87, "20260501", 600, 84),
      inc(3, 86, "20260430", 500, 85),
      exp(4, 86, "20260501", 500, 85),
    ];
    const out = allocateIncomeToItems(rows);
    const { bal } = itemBalances(out);
    expect(bal.get("84:87")).toBe(0);
    expect(bal.get("84:86")).toBe(400);
    expect(bal.get("85:86")).toBe(0); // 85는 86만, 87 끌어옴 없음
    expect(bal.get("85:87")).toBeUndefined();
  });
});
