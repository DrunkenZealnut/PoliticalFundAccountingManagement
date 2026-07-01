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
