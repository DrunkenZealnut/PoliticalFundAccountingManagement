import { describe, it, expect } from "vitest";
import { computeBalances, type AccBookRow } from "./settlement-calc";

function row(
  partial: Partial<AccBookRow> & {
    incm_sec_cd: number;
    acc_amt: number;
  },
): AccBookRow {
  return {
    acc_book_id: 0,
    org_id: 1,
    acc_sec_cd: 1,
    item_sec_cd: 0,
    exp_sec_cd: 0,
    acc_date: "20260101",
    ...partial,
  };
}

describe("computeBalances - 규칙 1: 마이너스 수입 → 지출 전환", () => {
  it("PFund2 시나리오: 500,000 / -500,000 → 수입 500k, 지출 500k", () => {
    const rows = [
      row({ acc_book_id: 47, incm_sec_cd: 1, acc_amt: 500_000 }),
      row({ acc_book_id: 48, incm_sec_cd: 1, acc_amt: -500_000 }),
    ];
    const result = computeBalances(rows);
    expect(result.incomeTotal).toBe(500_000);
    expect(result.expenseTotal).toBe(500_000);
    expect(result.balance).toBe(0);
    expect(result.corrections).toHaveLength(1);
    expect(result.corrections[0].rule).toBe("negative_income_to_expense");
    expect(result.corrections[0].acc_book_id).toBe(48);
  });

  it("마이너스 수입이 없으면 corrections 없음", () => {
    const rows = [
      row({ incm_sec_cd: 1, acc_amt: 1_000_000 }),
      row({ incm_sec_cd: 2, acc_amt: 200_000, acc_sec_cd: 3 }),
    ];
    const result = computeBalances(rows);
    expect(result.incomeTotal).toBe(1_000_000);
    expect(result.expenseTotal).toBe(200_000);
    expect(result.balance).toBe(800_000);
    expect(result.corrections).toEqual([]);
  });

  it("applyNegativeIncomeRule=false면 마이너스가 수입에서 차감됨", () => {
    const rows = [
      row({ incm_sec_cd: 1, acc_amt: 500_000 }),
      row({ incm_sec_cd: 1, acc_amt: -500_000 }),
    ];
    const result = computeBalances(rows, { applyNegativeIncomeRule: false });
    expect(result.incomeTotal).toBe(0);
    expect(result.expenseTotal).toBe(0);
    expect(result.balance).toBe(0);
    expect(result.corrections).toEqual([]);
  });

  it("원본 rows는 mutate되지 않음 (immutable)", () => {
    const original = row({ acc_book_id: 48, incm_sec_cd: 1, acc_amt: -500_000 });
    const rows = [original];
    computeBalances(rows);
    expect(original.incm_sec_cd).toBe(1);
    expect(original.acc_amt).toBe(-500_000);
  });
});

describe("computeBalances - 계정별 집계", () => {
  it("byAccount는 acc_sec_cd 오름차순", () => {
    const rows = [
      row({ incm_sec_cd: 1, acc_amt: 100, acc_sec_cd: 4 }),
      row({ incm_sec_cd: 1, acc_amt: 200, acc_sec_cd: 1 }),
      row({ incm_sec_cd: 2, acc_amt: 50, acc_sec_cd: 3 }),
    ];
    const result = computeBalances(rows);
    expect(result.byAccount.map((b) => b.acc_sec_cd)).toEqual([1, 3, 4]);
    expect(result.byAccount[0].income).toBe(200);
    expect(result.byAccount[2].income).toBe(100);
    expect(result.byAccount[1].electionExpense).toBe(50);
  });

  it("선거비용은 acc_sec_cd=3에 집계, 그 외는 nonElectionExpense", () => {
    const rows = [
      row({ incm_sec_cd: 2, acc_amt: 100, acc_sec_cd: 3 }),
      row({ incm_sec_cd: 2, acc_amt: 50, acc_sec_cd: 7 }),
    ];
    const result = computeBalances(rows);
    const acc3 = result.byAccount.find((b) => b.acc_sec_cd === 3);
    const acc7 = result.byAccount.find((b) => b.acc_sec_cd === 7);
    expect(acc3?.electionExpense).toBe(100);
    expect(acc3?.nonElectionExpense).toBe(0);
    expect(acc7?.electionExpense).toBe(0);
    expect(acc7?.nonElectionExpense).toBe(50);
  });

  it("electionExpenseAccSecCds 커스터마이즈 가능", () => {
    const rows = [row({ incm_sec_cd: 2, acc_amt: 100, acc_sec_cd: 99 })];
    const result = computeBalances(rows, {
      electionExpenseAccSecCds: new Set([99]),
    });
    expect(result.byAccount[0].electionExpense).toBe(100);
  });
});

describe("computeBalances - 날짜 필터", () => {
  it("dateFrom/dateTo 사이의 row만 집계", () => {
    const rows = [
      row({ incm_sec_cd: 1, acc_amt: 100, acc_date: "20260101" }),
      row({ incm_sec_cd: 1, acc_amt: 200, acc_date: "20260315" }),
      row({ incm_sec_cd: 1, acc_amt: 300, acc_date: "20260601" }),
    ];
    const result = computeBalances(rows, {
      dateFrom: "20260201",
      dateTo: "20260531",
    });
    expect(result.incomeTotal).toBe(200);
  });

  it("dateFrom만 지정", () => {
    const rows = [
      row({ incm_sec_cd: 1, acc_amt: 100, acc_date: "20260101" }),
      row({ incm_sec_cd: 1, acc_amt: 200, acc_date: "20260315" }),
    ];
    const result = computeBalances(rows, { dateFrom: "20260301" });
    expect(result.incomeTotal).toBe(200);
  });
});

describe("computeBalances - edge cases", () => {
  it("빈 배열 → 0", () => {
    const result = computeBalances([]);
    expect(result.incomeTotal).toBe(0);
    expect(result.expenseTotal).toBe(0);
    expect(result.balance).toBe(0);
    expect(result.byAccount).toEqual([]);
    expect(result.byFundSource).toEqual([]);
    expect(result.corrections).toEqual([]);
  });

  it("incm_sec_cd가 1,2가 아닌 row는 무시 (totals에 포함 안 함)", () => {
    const rows = [
      row({ incm_sec_cd: 1, acc_amt: 100 }),
      row({ incm_sec_cd: 0, acc_amt: 999 }),
      row({ incm_sec_cd: 3, acc_amt: 999 }),
    ];
    const result = computeBalances(rows);
    expect(result.incomeTotal).toBe(100);
    expect(result.expenseTotal).toBe(0);
  });
});

describe("computeBalances - 규칙 2: 자금출처 재배분", () => {
  it("재배분 미활성 시 redistributions 빈 배열", () => {
    const rows = [row({ incm_sec_cd: 1, acc_amt: 100 })];
    const result = computeBalances(rows);
    expect(result.redistributions).toEqual([]);
  });

  it("활성화했지만 caps 미지정 시 cap=0 처리되어 전액 비인정", () => {
    const rows = [
      row({ incm_sec_cd: 2, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 4_415_000 }),
    ];
    const result = computeBalances(rows, { applyFundSourceRedistribution: true });
    expect(result.redistributions).toHaveLength(1);
    expect(result.redistributions[0]).toEqual({
      fromAccSecCd: 82,
      toAccSecCd: 84,
      toItemSecCd: 86,
      amount: 4_415_000,
    });
  });

  it("Rule 5.1: 보조금 비인정분 1,866,665원 자산 이전 (Case A)", () => {
    const rows = [
      row({ incm_sec_cd: 1, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 4_415_000 }),
      row({ incm_sec_cd: 2, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 4_415_000 }),
    ];
    const result = computeBalances(rows, {
      applyFundSourceRedistribution: true,
      reimbursementCaps: { byAccSecCd: { 82: 2_548_335 } },
    });
    expect(result.redistributions).toHaveLength(1);
    expect(result.redistributions[0].amount).toBe(1_866_665);
    expect(result.redistributions[0].fromAccSecCd).toBe(82);
    expect(result.redistributions[0].toAccSecCd).toBe(84);
  });

  it("Rule 5.1: cap이 지출보다 크거나 같으면 재배분 없음", () => {
    const rows = [
      row({ incm_sec_cd: 2, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 1_000_000 }),
    ];
    const result = computeBalances(rows, {
      applyFundSourceRedistribution: true,
      reimbursementCaps: { byAccSecCd: { 82: 1_000_000 } },
    });
    expect(result.redistributions).toEqual([]);
  });

  it("Rule 5.2: 후원회기부금 잔액이 양수면 자산 이전", () => {
    const rows = [
      row({ incm_sec_cd: 1, acc_sec_cd: 85, item_sec_cd: 86, acc_amt: 1_000_000 }),
      row({ incm_sec_cd: 2, acc_sec_cd: 85, item_sec_cd: 86, acc_amt: 700_000 }),
    ];
    const result = computeBalances(rows, {
      applyFundSourceRedistribution: true,
      reimbursementCaps: { byAccSecCd: {} },
    });
    expect(result.redistributions).toEqual([
      { fromAccSecCd: 85, toAccSecCd: 84, toItemSecCd: 86, amount: 300_000 },
    ]);
  });

  it("Rule 5.2: 후원회기부금 잔액 0이면 재배분 없음 (Fund_Data_1 케이스)", () => {
    const rows = [
      row({ incm_sec_cd: 1, acc_sec_cd: 85, item_sec_cd: 86, acc_amt: 5_284_000 }),
      row({ incm_sec_cd: 2, acc_sec_cd: 85, item_sec_cd: 86, acc_amt: 5_284_000 }),
    ];
    const result = computeBalances(rows, {
      applyFundSourceRedistribution: true,
      reimbursementCaps: { byAccSecCd: {} },
    });
    expect(result.redistributions).toEqual([]);
  });

  it("Rule 5.2: redistributeSupporterRemainder=false면 잔액 있어도 이전 안 함", () => {
    const rows = [
      row({ incm_sec_cd: 1, acc_sec_cd: 85, item_sec_cd: 86, acc_amt: 1_000_000 }),
      row({ incm_sec_cd: 2, acc_sec_cd: 85, item_sec_cd: 86, acc_amt: 700_000 }),
    ];
    const result = computeBalances(rows, {
      applyFundSourceRedistribution: true,
      reimbursementCaps: { byAccSecCd: {}, redistributeSupporterRemainder: false },
    });
    expect(result.redistributions).toEqual([]);
  });

  it("재배분 후 byAccount: 자산 선거비용 +amount / 보조금 선거비용 -amount", () => {
    const rows = [
      row({ incm_sec_cd: 1, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 4_415_000 }),
      row({ incm_sec_cd: 2, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 4_415_000 }),
      row({ incm_sec_cd: 1, acc_sec_cd: 84, item_sec_cd: 86, acc_amt: 100_000 }),
      row({ incm_sec_cd: 2, acc_sec_cd: 84, item_sec_cd: 86, acc_amt: 99_325 }),
    ];
    const result = computeBalances(rows, {
      applyFundSourceRedistribution: true,
      reimbursementCaps: { byAccSecCd: { 82: 2_548_335 } },
      electionExpenseAccSecCds: new Set([82, 84]),
    });
    const subsidy = result.byAccount.find((a) => a.acc_sec_cd === 82)!;
    const asset = result.byAccount.find((a) => a.acc_sec_cd === 84)!;
    expect(subsidy.electionExpense).toBe(2_548_335);
    expect(asset.electionExpense).toBe(99_325 + 1_866_665);
  });

  it("재배분 후 수입/지출/잔액 합계 불변 (재배분은 분포만 이동)", () => {
    const rowsNoRedist = [
      row({ incm_sec_cd: 1, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 4_415_000 }),
      row({ incm_sec_cd: 2, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 4_415_000 }),
    ];
    const before = computeBalances(rowsNoRedist);
    const after = computeBalances(rowsNoRedist, {
      applyFundSourceRedistribution: true,
      reimbursementCaps: { byAccSecCd: { 82: 2_548_335 } },
    });
    expect(after.incomeTotal).toBe(before.incomeTotal);
    expect(after.expenseTotal).toBe(before.expenseTotal);
    expect(after.balance).toBe(before.balance);
  });

  it("corrections에 재배분 audit 누적", () => {
    const rows = [
      row({ incm_sec_cd: 2, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 4_415_000 }),
      row({ incm_sec_cd: 1, acc_sec_cd: 85, item_sec_cd: 86, acc_amt: 1_000_000 }),
      row({ incm_sec_cd: 2, acc_sec_cd: 85, item_sec_cd: 86, acc_amt: 700_000 }),
    ];
    const result = computeBalances(rows, {
      applyFundSourceRedistribution: true,
      reimbursementCaps: { byAccSecCd: { 82: 2_548_335 } },
    });
    const rules = result.corrections.map((c) => c.rule);
    expect(rules).toContain("subsidy_overflow_to_asset");
    expect(rules).toContain("supporter_remainder_to_asset");
  });
});

describe("computeBalances - 자금출처 분류", () => {
  it("보조금 계정(acc_sec_cd 4,5,6,104)은 '보조금'으로 분류", () => {
    const rows = [
      row({ incm_sec_cd: 1, acc_amt: 1000, acc_sec_cd: 4 }),
      row({ incm_sec_cd: 1, acc_amt: 500, acc_sec_cd: 5 }),
      row({ incm_sec_cd: 1, acc_amt: 200, acc_sec_cd: 1 }),
    ];
    const result = computeBalances(rows);
    const subsidy = result.byFundSource.find((f) => f.source === "보조금");
    const other = result.byFundSource.find((f) => f.source === "그외");
    expect(subsidy?.total).toBe(1500);
    expect(other?.total).toBe(200);
  });
});
