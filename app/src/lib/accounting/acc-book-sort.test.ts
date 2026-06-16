import { describe, it, expect } from "vitest";
import { compareAccDateTime, type AccDateTimeRow } from "./acc-book-sort";

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
