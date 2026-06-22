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

  it("같은 거래일이면 0 (시각 미사용 — 호출부 tie-break에 위임)", () => {
    expect(
      compareAccDateTime({ acc_date: "20260116" }, { acc_date: "20260116" }),
    ).toBe(0);
  });

  it("배열 정렬에 사용하면 거래일 순으로 안정 정렬되고 같은 날은 입력 순서 보존", () => {
    const rows: (AccDateTimeRow & { tag: string })[] = [
      { acc_date: "20260116", tag: "b" }, // 같은날 (입력순 보존)
      { acc_date: "20260116", tag: "a" },
      { acc_date: "20260115", tag: "c" }, // 전날
    ];
    const sorted = [...rows].sort(compareAccDateTime);
    expect(sorted.map((r) => `${r.acc_date}/${r.tag}`)).toEqual([
      "20260115/c",
      "20260116/b", // 같은 날은 stable sort로 입력 순서 유지
      "20260116/a",
    ]);
  });
});

describe("fillExportSortNumbers", () => {
  const r = (p: Record<string, unknown> & { acc_book_id: number }): Record<string, unknown> => ({
    acc_date: "20260501",
    incm_sec_cd: 1,
    ...p,
  });

  it("정규순서(acc_date→수입먼저→acc_book_id)로 1..N 전역 부여", () => {
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
      r({ acc_book_id: 10, acc_date: "20260526", incm_sec_cd: 2 }), // 지출
      r({ acc_book_id: 11, acc_date: "20260526", incm_sec_cd: 1 }), // 수입
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

  it("[회귀] 중복 acc_book_id(acc_book_bak)도 행별 고유 acc_sort_num — 덮어쓰기 없음", () => {
    // acc_book_bak는 같은 원장 id가 여러 백업 행으로 중복될 수 있음. id-keyed Map이면 마지막 rank로 덮임.
    const out = fillExportSortNumbers([
      r({ acc_book_id: 7, acc_date: "20260501", incm_sec_cd: 1 }),
      r({ acc_book_id: 7, acc_date: "20260502", incm_sec_cd: 2 }),
      r({ acc_book_id: 7, acc_date: "20260503", incm_sec_cd: 2 }),
    ]);
    const nums = out.map((x) => x.acc_sort_num).sort();
    expect(nums).toEqual([1, 2, 3]); // 3행 모두 고유 rank (덮어쓰기 시 [3,3,3]이 됨)
    expect(new Set(nums).size).toBe(3);
  });
});
