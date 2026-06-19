import { describe, it, expect } from "vitest";
import { compareAccDateTime, fillExportSortNumbers, type AccDateTimeRow } from "./acc-book-sort";

describe("compareAccDateTime", () => {
  it("다른 거래일은 날짜 오름차순으로 정렬한다", () => {
    expect(
      compareAccDateTime({ acc_date: "20260101" }, { acc_date: "20260102" }),
    ).toBeLessThan(0);
    expect(
      compareAccDateTime({ acc_date: "20260102" }, { acc_date: "20260101" }),
    ).toBeGreaterThan(0);
  });

  it("같은 날 새벽 수입이 오후 지출보다 먼저 온다 (버그 회귀 방지)", () => {
    const income: AccDateTimeRow = { acc_date: "20260116", acc_time: "0600" };
    const expense: AccDateTimeRow = { acc_date: "20260116", acc_time: "1400" };
    expect(compareAccDateTime(income, expense)).toBeLessThan(0);
    expect(compareAccDateTime(expense, income)).toBeGreaterThan(0);
  });

  it("시각 미입력(NULL/\"\")은 같은 날 맨 앞 (nulls first)", () => {
    const withTime: AccDateTimeRow = { acc_date: "20260116", acc_time: "0001" };
    expect(
      compareAccDateTime({ acc_date: "20260116", acc_time: null }, withTime),
    ).toBeLessThan(0);
    expect(
      compareAccDateTime({ acc_date: "20260116", acc_time: "" }, withTime),
    ).toBeLessThan(0);
    expect(
      compareAccDateTime({ acc_date: "20260116", acc_time: undefined }, withTime),
    ).toBeLessThan(0);
  });

  it("날짜가 시각보다 우선한다 (전날 오후 < 다음날 새벽)", () => {
    const prevAfternoon: AccDateTimeRow = { acc_date: "20260115", acc_time: "2300" };
    const nextDawn: AccDateTimeRow = { acc_date: "20260116", acc_time: "0100" };
    expect(compareAccDateTime(prevAfternoon, nextDawn)).toBeLessThan(0);
  });

  it("동일 거래일·시각이면 0 (호출부 tie-break에 위임)", () => {
    expect(
      compareAccDateTime(
        { acc_date: "20260116", acc_time: "1000" },
        { acc_date: "20260116", acc_time: "1000" },
      ),
    ).toBe(0);
  });

  it("배열 정렬에 사용하면 거래일·시각 순으로 안정 정렬된다", () => {
    const rows: AccDateTimeRow[] = [
      { acc_date: "20260116", acc_time: "1400" }, // 같은날 오후 지출
      { acc_date: "20260116", acc_time: "0600" }, // 같은날 새벽 수입
      { acc_date: "20260115", acc_time: "0900" }, // 전날
      { acc_date: "20260116", acc_time: null }, // 시각 미입력
    ];
    const sorted = [...rows].sort(compareAccDateTime);
    expect(sorted.map((r) => `${r.acc_date}/${r.acc_time ?? "∅"}`)).toEqual([
      "20260115/0900",
      "20260116/∅",
      "20260116/0600",
      "20260116/1400",
    ]);
  });
});

describe("fillExportSortNumbers", () => {
  const r = (p: Record<string, unknown> & { acc_book_id: number }): Record<string, unknown> => ({
    acc_date: "20260501",
    acc_time: null,
    incm_sec_cd: 1,
    ...p,
  });

  it("정규순서(acc_date→acc_time→수입먼저→acc_book_id)로 1..N 전역 부여", () => {
    const out = fillExportSortNumbers([
      r({ acc_book_id: 3, acc_date: "20260502", incm_sec_cd: 2 }),
      r({ acc_book_id: 1, acc_date: "20260501", incm_sec_cd: 2 }),
      r({ acc_book_id: 2, acc_date: "20260501", incm_sec_cd: 1 }), // 같은날 수입 → 지출보다 먼저
    ]);
    const byId = new Map(out.map((x) => [x.acc_book_id, x.acc_sort_num]));
    expect(byId.get(2)).toBe(1); // 5/1 수입 먼저
    expect(byId.get(1)).toBe(2); // 5/1 지출
    expect(byId.get(3)).toBe(3); // 5/2
  });

  it("같은 날 수입이 지출보다 낮은 acc_sort_num (Windows 누계 음수 방지)", () => {
    const out = fillExportSortNumbers([
      r({ acc_book_id: 10, acc_date: "20260526", incm_sec_cd: 2, acc_time: null }), // 지출
      r({ acc_book_id: 11, acc_date: "20260526", incm_sec_cd: 1, acc_time: null }), // 수입
    ]);
    const exp = out.find((x) => x.acc_book_id === 10)!.acc_sort_num!;
    const inc = out.find((x) => x.acc_book_id === 11)!.acc_sort_num!;
    expect(inc).toBeLessThan(exp);
  });

  it("기존 acc_sort_num을 덮어써 정규순서로 일관화한다", () => {
    const out = fillExportSortNumbers([
      r({ acc_book_id: 1, acc_date: "20260501", incm_sec_cd: 1, acc_sort_num: 999 }),
      r({ acc_book_id: 2, acc_date: "20260501", incm_sec_cd: 2, acc_sort_num: null }),
    ]);
    expect(out.find((x) => x.acc_book_id === 1)!.acc_sort_num).toBe(1); // 999 덮어씀
    expect(out.find((x) => x.acc_book_id === 2)!.acc_sort_num).toBe(2);
  });

  it("원본 배열 순서·메타는 보존(acc_sort_num만 갱신)", () => {
    const input = [r({ acc_book_id: 5, acc_date: "20260503" }), r({ acc_book_id: 4, acc_date: "20260502" })];
    const out = fillExportSortNumbers(input);
    expect(out.map((x) => x.acc_book_id)).toEqual([5, 4]); // 입력 순서 유지
    expect(input[0].acc_sort_num).toBeUndefined(); // 원본 불변
  });
});
