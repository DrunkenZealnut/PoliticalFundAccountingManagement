import { describe, it, expect } from "vitest";
import { buildLedgerRows, type LedgerRow } from "./ledger-allocation";
import type { ReallocRow } from "./fund-realloc";
import { compareAccDateTime } from "./acc-book-sort";

/** raw acc_book 행 헬퍼. */
function raw(p: Partial<ReallocRow> & { acc_book_id: number }): ReallocRow {
  return {
    incm_sec_cd: 1,
    acc_sec_cd: 85,
    item_sec_cd: 86,
    acc_date: "20260501",
    acc_amt: 0,
    content: "x",
    rcp_no: null,
    bigo: null,
    cust_id: 1,
    customer: null,
    ...p,
  };
}
/** Fund_Data_1 행: f(id, incm, date, acc, item, amt). */
const f = (id: number, incm: number, date: string, acc: number, item: number, amt: number) =>
  raw({ acc_book_id: id, incm_sec_cd: incm, acc_date: date, acc_sec_cd: acc, item_sec_cd: item, acc_amt: amt });
/** org11 계정85 행: r(id, incm, date, item, amt) — acc_sec_cd=85 고정. */
const r85 = (id: number, incm: number, date: string, item: number, amt: number) =>
  raw({ acc_book_id: id, incm_sec_cd: incm, acc_date: date, acc_sec_cd: 85, item_sec_cd: item, acc_amt: amt });

/** (계정×과목)별 시간순 잔액·최저잔액·합. accSecCd/itemSecCd/amt 기준. */
function ledgerBalances(rows: LedgerRow[]) {
  const sorted = [...rows].sort(
    (a, b) => compareAccDateTime(a, b) || a.incm_sec_cd - b.incm_sec_cd || a.acc_book_id - b.acc_book_id,
  );
  const bal = new Map<string, number>();
  const min = new Map<string, number>();
  for (const r of sorted) {
    const key = `${r.accSecCd}:${r.itemSecCd}`;
    bal.set(key, (bal.get(key) ?? 0) + (r.incm_sec_cd === 1 ? r.amt : -r.amt));
    min.set(key, Math.min(min.get(key) ?? 0, bal.get(key)!));
  }
  return { bal, min };
}
const totIncome = (rows: LedgerRow[]) => rows.filter((r) => r.incm_sec_cd === 1).reduce((s, r) => s + r.amt, 0);
const totExpense = (rows: LedgerRow[]) => rows.filter((r) => r.incm_sec_cd === 2).reduce((s, r) => s + r.amt, 0);

// ── 공식 Fund_Data_1.db 실데이터(20행, 이미 (계정×과목) 균형) ──
const FUND_DATA_1: ReallocRow[] = [
  f(1, 1, "20260319", 84, 87, 420000), f(2, 2, "20260319", 84, 87, 420000),
  f(3, 1, "20260329", 84, 86, 1602), f(4, 1, "20260429", 82, 86, 1000000),
  f(5, 2, "20260504", 82, 86, 40000), f(6, 2, "20260504", 82, 86, 9900),
  f(18, 2, "20260504", 82, 86, 55000), f(19, 2, "20260504", 82, 86, 77000),
  f(7, 1, "20260507", 82, 86, 420000), f(9, 1, "20260507", 82, 87, 1680000),
  f(8, 1, "20260511", 82, 86, 900000), f(10, 2, "20260514", 82, 87, 1680000),
  f(11, 1, "20260515", 84, 86, 1000000), f(12, 2, "20260515", 82, 86, 2138100),
  f(13, 2, "20260515", 84, 86, 853900), f(14, 1, "20260527", 84, 86, 287898),
  f(15, 2, "20260527", 84, 86, 435600), f(16, 1, "20260527", 84, 86, 90000),
  f(17, 2, "20260527", 84, 86, 35000), f(20, 2, "20260527", 84, 86, 55000),
];

// ── org11(2026 오준석) 계정85 실데이터(40행, 수입 전부 과목86) ──
const ORG11_ACC85: ReallocRow[] = [
  r85(129, 1, "20260430", 86, 1000000), r85(130, 1, "20260430", 86, 3830000),
  r85(135, 2, "20260430", 86, 1100000), r85(137, 2, "20260430", 87, 528000),
  r85(139, 2, "20260430", 87, 22000), r85(140, 2, "20260430", 86, 55000),
  r85(141, 2, "20260430", 86, 138600), r85(142, 2, "20260506", 86, 110000),
  r85(143, 2, "20260506", 86, 165000), r85(144, 2, "20260506", 87, 2200),
  r85(145, 2, "20260508", 87, 1196000), r85(154, 2, "20260508", 87, 9360),
  r85(131, 1, "20260511", 86, 2250000), r85(146, 2, "20260512", 87, 1320000),
  r85(155, 2, "20260513", 87, 1600000), r85(147, 2, "20260515", 86, 145200),
  r85(148, 1, "20260518", 86, 600000), r85(156, 2, "20260518", 86, 198800),
  r85(159, 2, "20260518", 86, 540000), r85(161, 2, "20260520", 86, 47000),
  r85(162, 2, "20260521", 87, 316800), r85(164, 2, "20260522", 86, 186040),
  r85(149, 1, "20260526", 86, 850000), r85(166, 2, "20260526", 86, 65000),
  r85(167, 2, "20260526", 86, 65000), r85(168, 2, "20260526", 86, 200000),
  r85(171, 2, "20260526", 86, 99000), r85(185, 2, "20260526", 86, 421000),
  r85(176, 1, "20260601", 86, 500000), r85(301, 2, "20260601", 87, 13125),
  r85(183, 1, "20260602", 86, 400000), r85(180, 2, "20260605", 86, 2140),
  r85(181, 2, "20260605", 86, 8870), r85(194, 2, "20260610", 86, 16500),
  r85(195, 2, "20260610", 86, 110000), r85(302, 2, "20260610", 86, 61648),
  r85(207, 2, "20260611", 86, 562100), r85(213, 2, "20260611", 86, -108583), // 환급
  r85(303, 2, "20260611", 86, 1700), r85(304, 2, "20260611", 86, 100000),
];

describe("buildLedgerRows (Pass0→1→2 조합)", () => {
  it("L1: 공식 Fund_Data_1 항등성 — 모든 (계정×과목) 잔액 0, 합 보존", () => {
    const out = buildLedgerRows(FUND_DATA_1);
    const { bal, min } = ledgerBalances(out);
    expect(bal.get("82:86")).toBe(0);
    expect(bal.get("82:87")).toBe(0);
    expect(bal.get("84:86")).toBe(0);
    expect(bal.get("84:87")).toBe(0);
    for (const v of min.values()) expect(v).toBeGreaterThanOrEqual(0);
    expect(totIncome(out)).toBe(5799500);
    expect(totExpense(out)).toBe(5799500); // 전액 집행, cash 0
  });

  it("L2: org11 계정85 실데이터 — 85×87 균형(0), 85×86 잉여(+132,500), 무음수", () => {
    const out = buildLedgerRows(ORG11_ACC85);
    const { bal, min } = ledgerBalances(out);
    expect(bal.get("85:87")).toBe(0); // 5,007,485 끌어와 균형
    expect(bal.get("85:86")).toBe(132500); // 잉여(=실통장 잔액)
    expect(min.get("85:86")).toBeGreaterThanOrEqual(0);
    expect(min.get("85:87")).toBeGreaterThanOrEqual(0);
  });

  it("L3: org11 합 보존 — 수입 9,430,000 / 순지출 9,297,500 / 잔액 132,500", () => {
    const out = buildLedgerRows(ORG11_ACC85);
    expect(totIncome(out)).toBe(9430000);
    expect(totExpense(out)).toBe(9297500); // 환급(−108,583) 반영 순지출
    expect(totIncome(out) - totExpense(out)).toBe(132500);
  });

  it("L4: 멱등 — raw에 buildLedgerRows 재적용해도 (계정×과목) 잔액 동일", () => {
    const a = ledgerBalances(buildLedgerRows(ORG11_ACC85));
    const b = ledgerBalances(buildLedgerRows([...ORG11_ACC85]));
    expect([...b.bal.entries()].sort()).toEqual([...a.bal.entries()].sort());
  });

  it("L5: 음수 수입(Pass0) — 계좌입금오류반환(−)이 지출로 정규화돼 합 보존", () => {
    const rows = [
      raw({ acc_book_id: 1, incm_sec_cd: 1, acc_sec_cd: 84, item_sec_cd: 86, acc_date: "20260501", acc_amt: 1000 }),
      raw({ acc_book_id: 2, incm_sec_cd: 1, acc_sec_cd: 84, item_sec_cd: 86, acc_date: "20260502", acc_amt: -300 }), // 음수 수입
      raw({ acc_book_id: 3, incm_sec_cd: 2, acc_sec_cd: 84, item_sec_cd: 86, acc_date: "20260503", acc_amt: 200 }),
    ];
    const out = buildLedgerRows(rows);
    // 음수 수입은 지출로 전환 → 수입 1000, 지출 300+200=500, 잔액 500
    expect(totIncome(out)).toBe(1000);
    expect(totExpense(out)).toBe(500);
    expect(ledgerBalances(out).bal.get("84:86")).toBe(500);
  });

  it("L6: 원래값(orig*) 보존 — 영구화 raw 복원용", () => {
    const out = buildLedgerRows(ORG11_ACC85);
    const r = out.find((x) => x.acc_book_id === 130)!; // 3,830,000 수입(원과목86)
    expect(r.origAccSecCd).toBe(85);
    expect(r.origItemSecCd).toBe(86);
    expect(r.origAmt).toBe(3830000);
  });

  it("L7: [불변식] 지출 과목은 계정이 바뀌어도 불변 — 선거비용외(87) 지출이 다른 계정으로 이동해도 87 유지", () => {
    const rows = [
      raw({ acc_book_id: 1, incm_sec_cd: 1, acc_sec_cd: 84, item_sec_cd: 86, acc_date: "20260501", acc_amt: 1000 }),
      raw({ acc_book_id: 2, incm_sec_cd: 1, acc_sec_cd: 85, item_sec_cd: 86, acc_date: "20260501", acc_amt: 300 }),
      // 85 가용 300 → 200 부족 → 84로 이동. 과목은 선거비용외(87) 유지돼야 함.
      raw({ acc_book_id: 3, incm_sec_cd: 2, acc_sec_cd: 85, item_sec_cd: 87, acc_date: "20260502", acc_amt: 500 }),
    ];
    const out = buildLedgerRows(rows);
    const expenseRows = out.filter((r) => r.acc_book_id === 3);
    // 계정(accSecCd)은 85·84로 분할될 수 있으나 과목(itemSecCd)은 전부 원과목 87
    expect(expenseRows.every((r) => r.incm_sec_cd === 2 && r.itemSecCd === 87)).toBe(true);
    expect(expenseRows.every((r) => r.itemSecCd === r.origItemSecCd)).toBe(true);
    expect(expenseRows.some((r) => r.accSecCd === 84)).toBe(true); // 84로 이동 발생
    expect(expenseRows.some((r) => r.accSecCd === 85)).toBe(true); // 85에도 잔류
    for (const v of ledgerBalances(out).min.values()) expect(v).toBeGreaterThanOrEqual(0);
  });

  it("L8: [불변식] 모든 지출 행은 itemSecCd === origItemSecCd (전 실데이터 회귀가드)", () => {
    for (const fixture of [FUND_DATA_1, ORG11_ACC85]) {
      const out = buildLedgerRows(fixture);
      for (const r of out.filter((x) => x.incm_sec_cd === 2)) {
        expect(r.itemSecCd).toBe(r.origItemSecCd);
      }
    }
  });

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
});
