import { describe, it, expect } from "vitest";
import {
  buildIncomeSummary,
  buildExpenseSummary,
  groupSum,
  type LedgerRow,
} from "./ledger-summary";

const noName = (n: number) => String(n);

function row(p: Partial<LedgerRow>): LedgerRow {
  return { acc_amt: 0, acc_sec_cd: 0, item_sec_cd: 0, exp_sec_cd: 0, ...p };
}

describe("buildExpenseSummary", () => {
  // 과목 코드명: 86=선거비용, 87=선거비용외, 82=보조금(자금원)
  const getName = (n: number) =>
    n === 86 ? "선거비용" : n === 87 ? "선거비용외" : n === 82 ? "보조금" : String(n);
  const rows = [
    row({ acc_amt: 1000, item_sec_cd: 86, acc_sec_cd: 82, acc_print_ok: "Y" }), // 선거비용 과목 + 보전 체크 + 보조금
    row({ acc_amt: 2000, item_sec_cd: 86, acc_sec_cd: 82, acc_print_ok: "N" }), // 선거비용 과목, 미체크
    row({ acc_amt: 500, item_sec_cd: 87, acc_sec_cd: 82, acc_print_ok: "N" }), // 선거비용외
  ];

  it("T1: 선거비용(과목) + 선거비용외(과목) = 지출 총액 (candidate)", () => {
    const s = buildExpenseSummary(rows, { getName, orgType: "candidate" });
    const total = s.primary.find((p) => p.key === "total")!.value;
    const election = s.primary.find((p) => p.key === "election")!.value;
    const nonElection = s.primary.find((p) => p.key === "nonElection")!.value;
    expect(total).toBe(3500);
    expect(election).toBe(3000); // 과목 코드명 === "선거비용"
    expect(nonElection).toBe(500);
    expect(election + nonElection).toBe(total);
  });

  it("보전 예상액 = acc_print_ok='Y' & 선거비용 과목 & 자금원≠기타", () => {
    const s = buildExpenseSummary(rows, { getName, orgType: "candidate" });
    expect(s.primary.find((p) => p.key === "reimbursable")!.value).toBe(1000);
  });

  it("보전 미체크 시 보전 예상액 0", () => {
    const none = rows.map((r) => ({ ...r, acc_print_ok: "N" }));
    const s = buildExpenseSummary(none, { getName, orgType: "candidate" });
    expect(s.primary.find((p) => p.key === "reimbursable")!.value).toBe(0);
  });

  it("FR-08: 후보자가 아니면 선거비용/보전대상 카드 미표시", () => {
    const s = buildExpenseSummary(rows, { getName, orgType: "supporter" });
    expect(s.primary.find((p) => p.key === "election")).toBeUndefined();
    expect(s.primary.find((p) => p.key === "reimbursable")).toBeUndefined();
    expect(s.primary.find((p) => p.key === "total")!.value).toBe(3500); // 총액은 유지
  });

  it("과목별 그룹 합 = 총액", () => {
    const s = buildExpenseSummary(rows, { getName, orgType: "candidate" });
    expect(s.groups[0].title).toBe("과목별");
    const groupTotal = s.groups[0].rows.reduce((a, r) => a + r.amount, 0);
    expect(groupTotal).toBe(3500);
  });

  it("balance 주입 시 잔액 stat 추가", () => {
    const s = buildExpenseSummary(rows, { getName, orgType: "candidate", balance: 1234 });
    expect(s.primary.find((p) => p.key === "balance")?.value).toBe(1234);
  });
});

describe("buildIncomeSummary", () => {
  const rows = [
    row({ acc_amt: 8000, acc_sec_cd: 82 }), // 보조금
    row({ acc_amt: 2000, acc_sec_cd: 85 }), // 후원회기부금
  ];

  it("T2: 수입원별 합 = 총액, ratio 합 ≈ 1", () => {
    const s = buildIncomeSummary(rows, { getName: noName });
    const total = s.primary.find((p) => p.key === "total")!.value;
    expect(total).toBe(10000);
    const g = s.groups[0].rows;
    expect(g.reduce((a, r) => a + r.amount, 0)).toBe(10000);
    expect(g.reduce((a, r) => a + r.ratio, 0)).toBeCloseTo(1, 5);
  });

  it("건수 stat", () => {
    const s = buildIncomeSummary(rows, { getName: noName });
    expect(s.primary.find((p) => p.key === "count")?.value).toBe(2);
    expect(s.totalCount).toBe(2);
  });

  it("FR-08: 후원회는 '후원금 총액' 라벨", () => {
    const s = buildIncomeSummary(rows, { getName: noName, orgType: "supporter" });
    expect(s.primary.find((p) => p.key === "total")?.label).toBe("후원금 총액");
    const def = buildIncomeSummary(rows, { getName: noName, orgType: "candidate" });
    expect(def.primary.find((p) => p.key === "total")?.label).toBe("수입 총액");
  });
});

describe("T3: 빈 records", () => {
  it("예외 없이 0 처리", () => {
    const inc = buildIncomeSummary([], { getName: noName });
    const exp = buildExpenseSummary([], { getName: noName, orgType: "candidate" });
    expect(inc.primary.find((p) => p.key === "total")?.value).toBe(0);
    expect(inc.groups[0].rows).toEqual([]);
    expect(exp.primary.find((p) => p.key === "election")?.value).toBe(0);
  });
});

describe("T5: groupSum topN + 기타", () => {
  it("상위 topN-1 + 기타 합산", () => {
    const rows: LedgerRow[] = [];
    for (let i = 1; i <= 10; i++) rows.push(row({ acc_amt: i * 100, item_sec_cd: i }));
    const g = groupSum(rows, (r) => r.item_sec_cd, (k) => String(k), 3);
    expect(g.length).toBe(3);
    expect(g[g.length - 1].name).toBe("기타");
    const total = rows.reduce((a, r) => a + r.acc_amt, 0);
    expect(g.reduce((a, r) => a + r.amount, 0)).toBe(total);
  });
});
