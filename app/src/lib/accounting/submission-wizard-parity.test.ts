import { describe, it, expect } from "vitest";
import { buildSettlementSummary } from "./settlement-summary";
import { buildReportLedgerRecords } from "./report-ledger";
import { aggregateSummaryByAccount } from "@/lib/hwpx/report-summary-builder";
import type { ReportSummaryRawRow } from "./income-expense-report-summary";
import type { ReportSummaryInputRow } from "@/lib/hwpx/report-summary-builder";

/* ------------------------------------------------------------------ */
/*  마법사 미리보기 ↔ 생성 Excel 총괄표 교차-parity (Gap G2)              */
/*                                                                    */
/*  PreviewStep 은 buildSettlementSummary(→allocateCandidateLedgerRows), */
/*  GenerateStep Excel 총괄표는 buildReportLedgerRecords(→buildAdjusted   */
/*  AccBook)+aggregateSummaryByAccount — 서로 다른 진입점이지만 같은      */
/*  buildLedgerRows 코어를 쓰므로 자금원(계정)별 수입/지출 합이 항상       */
/*  일치해야 한다. 이 테스트가 코어·진입점 변경 시 회귀를 고정한다.        */
/*                                                                    */
/*  픽스처는 재배분이 실제로 발동하는 조건을 강제한다                      */
/*  (parity-test-must-exercise-divergence-condition):                  */
/*   - 자금원 84 지출 300,000 > 수입 50,000 → Pass1 자금원 이동 발동      */
/*   - 음수 수입 → Pass0 지출 전환                                       */
/*   - 환급(음수 지출) 포함                                              */
/* ------------------------------------------------------------------ */

const NAMES: Record<number, string> = {
  82: "보조금",
  83: "보조금외지원금",
  84: "후보자등자산",
  85: "후원회기부금",
  86: "선거비용",
  87: "선거비용외정치자금",
};
const getName = (id: number) => NAMES[id] ?? String(id);

let id = 1;
function row(over: Partial<ReportSummaryRawRow>): ReportSummaryRawRow {
  return {
    acc_book_id: id++,
    incm_sec_cd: 1,
    acc_sec_cd: 82,
    item_sec_cd: 86,
    acc_amt: 0,
    acc_date: "20260401",
    ...over,
  };
}

/** 재배분·Pass0·환급을 모두 발동시키는 후보자 픽스처 */
function fixture(): ReportSummaryRawRow[] {
  return [
    row({ incm_sec_cd: 1, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 1_000_000, acc_date: "20260401" }),
    row({ incm_sec_cd: 1, acc_sec_cd: 84, item_sec_cd: 87, acc_amt: 50_000, acc_date: "20260401" }),
    row({ incm_sec_cd: 1, acc_sec_cd: 85, item_sec_cd: 86, acc_amt: 500_000, acc_date: "20260402" }),
    // 84 부족(수입 5만 < 지출 30만) → Pass1 자금원 이동 발동
    row({ incm_sec_cd: 2, acc_sec_cd: 84, item_sec_cd: 86, acc_amt: 300_000, acc_date: "20260410" }),
    row({ incm_sec_cd: 2, acc_sec_cd: 82, item_sec_cd: 87, acc_amt: 200_000, acc_date: "20260412" }),
    // 환급(음수 지출)
    row({ incm_sec_cd: 2, acc_sec_cd: 85, item_sec_cd: 86, acc_amt: -30_000, acc_date: "20260415" }),
    // 음수 수입(내부이체 오기재) → Pass0 지출 전환
    row({ incm_sec_cd: 1, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: -20_000, acc_date: "20260416" }),
  ];
}

/** 계정별 {income, expense} 맵 — 두 진입점 결과를 같은 모양으로 정규화 */
type PerAccount = Map<number, { income: number; expense: number }>;

function fromSettlement(rows: ReportSummaryRawRow[]): PerAccount {
  const s = buildSettlementSummary(rows);
  const out: PerAccount = new Map();
  for (const a of s.accounts) {
    const cur = out.get(a.acc_sec_cd) ?? { income: 0, expense: 0 };
    cur.income += a.income;
    cur.expense += a.expense;
    out.set(a.acc_sec_cd, cur);
  }
  return out;
}

function fromExcelSummary(rows: ReportSummaryRawRow[]): PerAccount {
  const reportRecords = buildReportLedgerRecords(
    rows as unknown as Record<string, unknown>[],
    getName,
    true,
  ) as unknown as ReportSummaryInputRow[];
  const out: PerAccount = new Map();
  for (const r of aggregateSummaryByAccount(reportRecords, getName)) {
    out.set(r.acc_sec_cd, { income: r.income, expense: r.expElection + r.expOther });
  }
  return out;
}

describe("마법사 미리보기 == 생성 Excel 총괄표 (교차-parity)", () => {
  it("픽스처가 재배분 발동 조건을 실제로 만족한다(84 원본 지출 > 수입)", () => {
    // 재배분 후 84 지출은 원본 300,000 보다 작아야 한다(이동 발생) — 해피패스 방지 가드
    const after = fromSettlement(fixture());
    const acc84 = after.get(84);
    expect(acc84).toBeDefined();
    expect(acc84!.expense).toBeLessThan(300_000);
  });

  it("자금원(계정)별 수입/지출 합이 두 진입점에서 일치한다", () => {
    const rows = fixture();
    const preview = fromSettlement(rows);
    const excel = fromExcelSummary(rows);

    expect([...excel.keys()].sort()).toEqual([...preview.keys()].sort());
    for (const [acc, p] of preview) {
      expect(excel.get(acc), `계정 ${acc}(${getName(acc)})`).toEqual(p);
    }
  });

  it("총수입·총지출·잔액이 일치하고 잔액은 재배분 불변이다", () => {
    const rows = fixture();
    const s = buildSettlementSummary(rows);
    const excel = fromExcelSummary(rows);

    let excelIncome = 0;
    let excelExpense = 0;
    for (const v of excel.values()) {
      excelIncome += v.income;
      excelExpense += v.expense;
    }
    expect(excelIncome).toBe(s.income);
    expect(excelExpense).toBe(s.expense);
    // 잔액 = 원본 (수입-지출) 과 동일(재배분·Pass0 으로 불변)
    const rawBalance = rows.reduce(
      (acc, r) => acc + (r.incm_sec_cd === 1 ? r.acc_amt : -r.acc_amt),
      0,
    );
    expect(s.balance).toBe(rawBalance);
  });
});
