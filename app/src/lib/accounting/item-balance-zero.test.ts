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
