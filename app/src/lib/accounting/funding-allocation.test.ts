import { describe, it, expect } from "vitest";
import { buildFundingAllocation } from "./funding-allocation";
import { computeBalances, type AccBookRow } from "./settlement-calc";

// 후보자 코드: 82=보조금, 83=보조금외, 84=후보자자산, 85=후원회기부금 (자금원 매핑은 코드 우선)
// 86=선거비용, 87=선거비용외 (과목)
const getName = (n: number): string => {
  const m: Record<number, string> = {
    82: "보조금",
    83: "보조금외지원금",
    84: "후보자등자산",
    85: "후원회기부금",
    86: "선거비용",
    87: "선거비용외",
  };
  return m[n] ?? String(n);
};

function row(p: Partial<AccBookRow>): AccBookRow {
  return {
    incm_sec_cd: 1,
    acc_sec_cd: 0,
    item_sec_cd: 0,
    acc_date: "20260101",
    acc_amt: 0,
    ...p,
  };
}

describe("buildFundingAllocation", () => {
  // 후보자자산(84): 수입 30000 / 선거비용 18000
  // 후원회기부금(85): 수입 20000 / 선거비용 15000
  // 보조금(82): 수입 10000 / 선거비용 12000 (초과충당)
  const rows: AccBookRow[] = [
    row({ incm_sec_cd: 1, acc_sec_cd: 84, acc_amt: 30000 }),
    row({ incm_sec_cd: 2, acc_sec_cd: 84, item_sec_cd: 86, acc_amt: 18000 }),
    row({ incm_sec_cd: 1, acc_sec_cd: 85, acc_amt: 20000 }),
    row({ incm_sec_cd: 2, acc_sec_cd: 85, item_sec_cd: 86, acc_amt: 15000 }),
    row({ incm_sec_cd: 1, acc_sec_cd: 82, acc_amt: 10000 }),
    row({ incm_sec_cd: 2, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 12000 }),
  ];

  it("T1: 자금원별 수입·지출 집계", () => {
    const a = buildFundingAllocation(rows, { getName });
    const asset = a.rows.find((r) => r.source === "후보자자산")!;
    expect(asset.income).toBe(30000);
    expect(asset.expense).toBe(18000);
    const supporter = a.rows.find((r) => r.source === "후원회기부금")!;
    expect(supporter.income).toBe(20000);
    expect(supporter.expense).toBe(15000);
  });

  it("T2: 가용잔액 = 수입 - 지출", () => {
    const a = buildFundingAllocation(rows, { getName });
    expect(a.rows.find((r) => r.source === "후보자자산")!.available).toBe(12000);
    expect(a.rows.find((r) => r.source === "후원회기부금")!.available).toBe(5000);
  });

  it("T3: 초과충당 자금원은 available 음수 + overspent=true", () => {
    const a = buildFundingAllocation(rows, { getName });
    const subsidy = a.rows.find((r) => r.source === "보조금")!;
    expect(subsidy.available).toBe(-2000);
    expect(subsidy.overspent).toBe(true);
  });

  it("T4: 선거비용/선거비용외 과목 분리 (item 코드명 기준)", () => {
    const mixed: AccBookRow[] = [
      row({ incm_sec_cd: 1, acc_sec_cd: 84, acc_amt: 10000 }),
      row({ incm_sec_cd: 2, acc_sec_cd: 84, item_sec_cd: 86, acc_amt: 3000 }), // 선거비용
      row({ incm_sec_cd: 2, acc_sec_cd: 84, item_sec_cd: 87, acc_amt: 2000 }), // 선거비용외
    ];
    const asset = buildFundingAllocation(mixed, { getName }).rows.find(
      (r) => r.source === "후보자자산",
    )!;
    expect(asset.electionExpense).toBe(3000);
    expect(asset.nonElectionExpense).toBe(2000);
    expect(asset.expense).toBe(5000);
  });

  it("T5: 마이너스 수입은 지출로 보정 (결산 규칙 1 정합)", () => {
    const neg: AccBookRow[] = [
      row({ incm_sec_cd: 1, acc_sec_cd: 84, acc_amt: 10000 }),
      row({ incm_sec_cd: 1, acc_sec_cd: 84, item_sec_cd: 87, acc_amt: -3000 }), // 환입 → 지출 전환
    ];
    const asset = buildFundingAllocation(neg, { getName }).rows.find(
      (r) => r.source === "후보자자산",
    )!;
    expect(asset.income).toBe(10000); // 음수분 제외
    expect(asset.expense).toBe(3000); // 지출로 전환된 절대값
    expect(asset.available).toBe(7000);
  });

  it("T6: FUNDING_ORDER 순서 + 데이터 없는 자금원 제외", () => {
    const a = buildFundingAllocation(rows, { getName });
    expect(a.rows.map((r) => r.source)).toEqual([
      "후보자자산",
      "후원회기부금",
      "보조금",
    ]);
    // 보조금외(83)는 데이터 없음 → 제외
    expect(a.rows.find((r) => r.source === "보조금외")).toBeUndefined();
  });

  it("T7: 자금원 미상(매핑 실패)은 기타 버킷", () => {
    const etc: AccBookRow[] = [
      row({ incm_sec_cd: 1, acc_sec_cd: 999, acc_amt: 5000 }),
    ];
    const a = buildFundingAllocation(etc, { getName });
    expect(a.rows.find((r) => r.source === "기타")!.income).toBe(5000);
  });

  it("T8: incomeRatio = 자금원 수입 / 전체 수입", () => {
    const a = buildFundingAllocation(rows, { getName });
    expect(a.totalIncome).toBe(60000);
    expect(a.rows.find((r) => r.source === "후보자자산")!.incomeRatio).toBeCloseTo(0.5);
    expect(a.rows.find((r) => r.source === "보조금")!.incomeRatio).toBeCloseTo(10000 / 60000);
  });

  it("T9: 빈 입력 → 빈 rows, totals 0", () => {
    const a = buildFundingAllocation([], { getName });
    expect(a.rows).toEqual([]);
    expect(a.totalIncome).toBe(0);
    expect(a.totalExpense).toBe(0);
    expect(a.totalAvailable).toBe(0);
  });

  it("T10: 결산(computeBalances)과 수입/지출 총액 정합", () => {
    const a = buildFundingAllocation(rows, { getName });
    const settle = computeBalances(rows);
    expect(a.totalIncome).toBe(settle.incomeTotal);
    expect(a.totalExpense).toBe(settle.expenseTotal);
    expect(a.totalAvailable).toBe(settle.balance);
  });
});
