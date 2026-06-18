import { describe, it, expect } from "vitest";
import { buildReportCombos, type AccItemCombo, type ReportComboSelection } from "./report-combos";

const c = (accSecCd: number, itemSecCd: number): AccItemCombo => ({ accSecCd, itemSecCd });
const sel = (
  accounts: number[],
  income: number[],
  expense: number[],
): ReportComboSelection => ({
  selectedAccounts: new Set(accounts),
  selectedIncomeItems: new Set(income),
  selectedExpenseItems: new Set(expense),
});
const keys = (arr: AccItemCombo[]) => arr.map((x) => `${x.accSecCd}-${x.itemSecCd}`);

// 후보자 표준: 82~85 × (86 선거비용, 87 선거비용외)
const STANDARD = [
  c(82, 86), c(82, 87), c(83, 86), c(83, 87),
  c(84, 86), c(84, 87), c(85, 86), c(85, 87),
];
const ALL = sel([82, 83, 84, 85], [86, 87], [86, 87]);

describe("buildReportCombos", () => {
  it("C1: 실거래 0 + 표준 전체, 전체 체크 → 표준 전부(빈 양식 대상)", () => {
    const out = buildReportCombos(STANDARD, [], ALL);
    expect(out).toHaveLength(8);
    expect(keys(out)[0]).toBe("82-86");
  });

  it("C2: 표준 ∩ 실거래 겹침 → dedup(중복 없음)", () => {
    const out = buildReportCombos(STANDARD, [c(84, 86), c(85, 87)], ALL);
    expect(out).toHaveLength(8); // 실거래가 표준에 이미 있음 → 추가 없음
    expect(new Set(keys(out)).size).toBe(8);
  });

  it("C3: 비표준 실거래 조합 → 표준 뒤에 append", () => {
    const out = buildReportCombos(STANDARD, [c(99, 88)], sel([82, 83, 84, 85, 99], [86, 87, 88], [86, 87, 88]));
    expect(keys(out)).toHaveLength(9);
    expect(keys(out)[8]).toBe("99-88"); // 맨 뒤
  });

  it("C4: 계정 일부 해제 → 해제 계정 조합 제외", () => {
    const out = buildReportCombos(STANDARD, [], sel([84, 85], [86, 87], [86, 87]));
    expect(keys(out)).toEqual(["84-86", "84-87", "85-86", "85-87"]);
  });

  it("C5: 수입과목만 체크 → 해당 과목 조합만", () => {
    const out = buildReportCombos(STANDARD, [], sel([82, 83, 84, 85], [86], []));
    expect(keys(out).every((k) => k.endsWith("-86"))).toBe(true);
    expect(out).toHaveLength(4);
  });

  it("C6: 정렬 — 표준 순서 먼저, 비표준 accSecCd/itemSecCd", () => {
    const out = buildReportCombos(
      [c(85, 86), c(82, 86)], // 표준 입력순서 보존(85 먼저)
      [c(90, 80), c(70, 99)], // 비표준 → 정렬되어 뒤에
      sel([82, 85, 70, 90], [86, 80, 99], [86, 80, 99]),
    );
    expect(keys(out)).toEqual(["85-86", "82-86", "70-99", "90-80"]);
  });

  it("C7: 빈 selection → 빈 배열", () => {
    const out = buildReportCombos(STANDARD, [c(84, 86)], sel([], [], []));
    expect(out).toEqual([]);
  });
});
