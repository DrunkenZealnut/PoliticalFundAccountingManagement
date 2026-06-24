import { describe, it, expect } from "vitest";
import { reallocateFundSources, type ReallocRow, type ReallocResult } from "./fund-realloc";
import { compareAccDateTime } from "./acc-book-sort";

function row(p: Partial<ReallocRow> & { acc_book_id: number }): ReallocRow {
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
const inc = (id: number, src: number, date: string, amt: number) =>
  row({ acc_book_id: id, incm_sec_cd: 1, acc_sec_cd: src, acc_date: date, acc_amt: amt });
const exp = (id: number, src: number, date: string, amt: number) =>
  row({ acc_book_id: id, incm_sec_cd: 2, acc_sec_cd: src, acc_date: date, acc_amt: amt });

/** 출력 행에서 자금원별 시간순 최저잔액 계산(음수 0 검증용). */
function minBalances(res: ReallocResult): Record<number, number> {
  // production(fund-realloc) 정렬과 동일 tie-break: 동시각 수입(1) 먼저
  const sorted = [...res.rows].sort(
    (a, b) => compareAccDateTime(a, b) || a.incm_sec_cd - b.incm_sec_cd || a.acc_book_id - b.acc_book_id,
  );
  const bal: Record<number, number> = {};
  const min: Record<number, number> = {};
  for (const r of sorted) {
    const s = r.sheetAccSecCd;
    bal[s] = (bal[s] ?? 0) + (r.incm_sec_cd === 1 ? r.effectiveAmt : -r.effectiveAmt);
    min[s] = Math.min(min[s] ?? 0, bal[s]);
  }
  return min;
}
const totalExpense = (rows: ReallocRow[]) =>
  rows.filter((r) => r.incm_sec_cd === 2).reduce((s, r) => s + r.acc_amt, 0);
const totalEffExpense = (res: ReallocResult) =>
  res.rows.filter((r) => r.incm_sec_cd === 2).reduce((s, r) => s + r.effectiveAmt, 0);

describe("reallocateFundSources", () => {
  it("T1: 가용 내 지출은 재배분 없음(as-is)", () => {
    const rows = [inc(1, 85, "20260501", 1000), exp(2, 85, "20260502", 600)];
    const res = reallocateFundSources(rows);
    expect(res.redistributions).toEqual([]);
    expect(res.rows.every((r) => r.origin === "as-is")).toBe(true);
  });

  it("T2: 85 지출이 85 가용 초과, 84 충분 → 분할(85 잔류 + 84 이동)", () => {
    const rows = [
      inc(1, 84, "20260501", 1000),
      inc(2, 85, "20260501", 300),
      exp(3, 85, "20260502", 500), // 85 가용 300 → 200 부족 → 84로
    ];
    const res = reallocateFundSources(rows);
    const moved = res.redistributions;
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({ fromAccSecCd: 85, toAccSecCd: 84, movedAmt: 200 });
    // 분할: 85에 300, 84에 200
    const split = res.rows.filter((r) => r.splitGroupId === 3);
    expect(split.find((r) => r.sheetAccSecCd === 85)?.effectiveAmt).toBe(300);
    expect(split.find((r) => r.sheetAccSecCd === 84)?.effectiveAmt).toBe(200);
    expect(minBalances(res)[85]).toBeGreaterThanOrEqual(0);
  });

  it("T11: 3-source 캐스케이드(85→83, 83 자체지출→84) — 5/22 모사, 전 자금원 ≥ 0", () => {
    const rows = [
      inc(1, 85, "20260518", 600), // 85 입금
      inc(2, 83, "20260518", 3000), // 진보당 입금
      exp(3, 85, "20260522", 679), // 85 가용 600 → 79 부족 → 83으로
      inc(4, 84, "20260526", 1000), // 자산 입금(5/26)
      exp(5, 83, "20260526", 3000), // 83 자체 지출 → 83 가용 2921 → 79 부족 → 84로
    ];
    const res = reallocateFundSources(rows, { overflowPriority: [84, 83, 82] });
    const min = minBalances(res);
    expect(min[85]).toBeGreaterThanOrEqual(0);
    expect(min[83]).toBeGreaterThanOrEqual(0);
    expect(min[84]).toBeGreaterThanOrEqual(0);
    expect(res.shortfalls).toEqual([]);
    // 79가 85→83, 또 79가 83→84로 흘러 최종 84가 부담
    expect(res.redistributions.some((m) => m.fromAccSecCd === 85 && m.toAccSecCd === 83 && m.movedAmt === 79)).toBe(true);
    expect(res.redistributions.some((m) => m.fromAccSecCd === 83 && m.toAccSecCd === 84 && m.movedAmt === 79)).toBe(true);
  });

  it("T9: 총 지출 보존(effectiveAmt 합 = 원본 지출 합)", () => {
    const rows = [
      inc(1, 84, "20260501", 500),
      inc(2, 85, "20260501", 300),
      exp(3, 85, "20260502", 700),
      exp(4, 84, "20260503", 100),
    ];
    const res = reallocateFundSources(rows);
    expect(totalEffExpense(res)).toBe(totalExpense(rows));
  });

  it("T12: 통장(전 자금원 합) 항상 ≥ 0이면 어떤 자금원도 음수 아님 + shortfall 없음", () => {
    const rows = [
      inc(1, 83, "20260518", 3000),
      inc(2, 85, "20260518", 600),
      exp(3, 85, "20260522", 679),
      inc(4, 84, "20260526", 1000),
      exp(5, 83, "20260526", 3000),
      exp(6, 85, "20260530", 800),
    ];
    const res = reallocateFundSources(rows);
    const min = minBalances(res);
    for (const s of Object.keys(min)) expect(min[Number(s)]).toBeGreaterThanOrEqual(0);
    expect(res.shortfalls).toEqual([]);
  });

  it("T13: overflowPriority 순서대로 충당원 선택", () => {
    const rows = [
      inc(1, 84, "20260501", 1000),
      inc(2, 83, "20260501", 1000),
      inc(3, 85, "20260501", 100),
      exp(4, 85, "20260502", 600), // 부족 500 → 우선순위 첫째로
    ];
    const res84 = reallocateFundSources(rows, { overflowPriority: [84, 83] });
    expect(res84.redistributions[0].toAccSecCd).toBe(84);
    const res83 = reallocateFundSources(rows, { overflowPriority: [83, 84] });
    expect(res83.redistributions[0].toAccSecCd).toBe(83);
  });

  it("T15: 우선순위 1번이 부족분보다 작은 소액이면, 부족분을 단독으로 덮는 자금원을 우선 사용(자투리 조각 방지)", () => {
    // 실제 사례(인형탈대여 265,000) 모사: 원 자금원(85=후원회기부금) 186,040 + 부족분 78,960.
    // 후보자등자산(84)에 소액 58(이자+계좌확인)만, 보조금외(83)에 충분(3,000,000).
    // 기존(greedy): 84(58 부분) + 83(78,902) = 자투리 58원 조각 발생.
    // 개선(단독충당 우선): 83이 부족분 78,960 전체를 단독 충당, 84의 58은 안 씀.
    const rows = [
      inc(1, 85, "20260501", 186040),
      inc(2, 84, "20260501", 58),
      inc(3, 83, "20260501", 3000000),
      exp(4, 85, "20260522", 265000),
    ];
    const res = reallocateFundSources(rows, { overflowPriority: [84, 83, 82] });
    // 후보자등자산(84)으로의 자투리 이동이 없어야 함
    expect(res.redistributions.some((m) => m.toAccSecCd === 84)).toBe(false);
    // 보조금외(83)가 부족분 전체(78,960)를 단독 충당(1개 이동)
    const to83 = res.redistributions.filter((m) => m.toAccSecCd === 83);
    expect(to83).toHaveLength(1);
    expect(to83[0].movedAmt).toBe(78960);
    // 총액 보존·잔액 음수 없음(불변식 유지)
    expect(totalEffExpense(res)).toBe(totalExpense(rows));
    for (const s of Object.keys(minBalances(res))) expect(minBalances(res)[Number(s)]).toBeGreaterThanOrEqual(0);
  });

  it("T16: 단독으로 덮을 자금원이 없으면 기존 greedy 캐스케이드로 여러 자금원 분할(통장≥0 유지)", () => {
    // 부족분 200을 단독으로 못 대는 경우(84=120, 83=120) → 둘 다 부분 충당(분할 불가피).
    const rows = [
      inc(1, 85, "20260501", 100),
      inc(2, 84, "20260501", 120),
      inc(3, 83, "20260501", 120),
      exp(4, 85, "20260502", 300), // 85 가용 100, 부족 200, 단독 불가(84·83 각 120)
    ];
    const res = reallocateFundSources(rows, { overflowPriority: [84, 83, 82] });
    expect(totalEffExpense(res)).toBe(totalExpense(rows));
    expect(res.shortfalls).toEqual([]);
    expect(res.redistributions.some((m) => m.toAccSecCd === 84)).toBe(true);
    expect(res.redistributions.some((m) => m.toAccSecCd === 83)).toBe(true);
  });

  it("환급(음수 지출)은 원 자금원 유지·가용 복원, 재배분 안 함", () => {
    const rows = [
      inc(1, 85, "20260501", 500),
      exp(2, 85, "20260502", -100), // 환급
      exp(3, 85, "20260503", 550), // 환급 복원으로 가용 600 → 550 충당 가능
    ];
    const res = reallocateFundSources(rows);
    expect(res.redistributions).toEqual([]); // 환급 덕에 재배분 불필요
    const refundRow = res.rows.find((r) => r.acc_book_id === 2);
    expect(refundRow?.sheetAccSecCd).toBe(85);
    expect(refundRow?.effectiveAmt).toBe(-100);
    expect(minBalances(res)[85]).toBeGreaterThanOrEqual(0);
  });

  it("진짜 부족(풀 전체 부족)이면 shortfall 기록 + 원 자금원 음수 잔류", () => {
    const rows = [inc(1, 85, "20260501", 100), exp(2, 85, "20260502", 300)]; // 84/83 없음
    const res = reallocateFundSources(rows);
    expect(res.shortfalls).toHaveLength(1);
    expect(res.shortfalls[0]).toMatchObject({ accSecCd: 85, shortAmt: 200 });
    expect(minBalances(res)[85]).toBe(-200);
  });

  it("T14: 동시각 수입·지출 tie-break — 수입(1)을 지출(2)보다 먼저 처리(음수 방지)", () => {
    // 같은 날·동일 시각(null)에서 지출(id=1)이 수입(id=2)보다 acc_book_id가 작다.
    // acc_book_id 단독 tie-break면 지출이 먼저 처리돼 85가 일시 음수→shortfall.
    // incm_sec_cd 우선 tie-break면 수입이 먼저라 shortfall·재배분 0. (CLAUDE.md 잔액누계 규칙)
    const rows = [exp(1, 85, "20260501", 500), inc(2, 85, "20260501", 500)];
    const res = reallocateFundSources(rows);
    expect(res.shortfalls).toEqual([]);
    expect(res.redistributions).toEqual([]);
    expect(minBalances(res)[85]).toBeGreaterThanOrEqual(0);
  });
});
