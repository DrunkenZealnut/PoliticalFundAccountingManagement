import type { FixedCellMapping } from "../types";

/** T1: 정치자금 수입지출보고서 */
export const incomeExpenseReportMapping: FixedCellMapping = {
  id: "income-expense-report",
  templateFile: "정치자금 수입지출보고서.xls",
  type: "fixed",
  sheet: "Sheet1",
  cells: {
    // 헤더
    C3: { field: "electionName", type: "text" },
    G3: { field: "districtName", type: "text" },
    C4: { field: "entityName", type: "text" },
    // 자산 (Row 8)
    C8: { field: "asset.income", type: "number" },
    D8: { field: "asset.expElection", type: "number" },
    E8: { field: "asset.expNonElection", type: "number" },
    F8: { field: "asset.expSubtotal", type: "number" },
    G8: { field: "asset.balance", type: "number" },
    // 후원회기부금 (Row 9)
    C9: { field: "donation.income", type: "number" },
    D9: { field: "donation.expElection", type: "number" },
    E9: { field: "donation.expNonElection", type: "number" },
    F9: { field: "donation.expSubtotal", type: "number" },
    G9: { field: "donation.balance", type: "number" },
    // 보조금 (Row 10)
    C10: { field: "subsidy.income", type: "number" },
    D10: { field: "subsidy.expElection", type: "number" },
    E10: { field: "subsidy.expNonElection", type: "number" },
    F10: { field: "subsidy.expSubtotal", type: "number" },
    G10: { field: "subsidy.balance", type: "number" },
    // 보조금외 (Row 11)
    C11: { field: "subsidyOther.income", type: "number" },
    D11: { field: "subsidyOther.expElection", type: "number" },
    E11: { field: "subsidyOther.expNonElection", type: "number" },
    F11: { field: "subsidyOther.expSubtotal", type: "number" },
    G11: { field: "subsidyOther.balance", type: "number" },
    // 합계 (Row 12)
    C12: { field: "total.income", type: "number" },
    D12: { field: "total.expElection", type: "number" },
    E12: { field: "total.expNonElection", type: "number" },
    F12: { field: "total.expSubtotal", type: "number" },
    G12: { field: "total.balance", type: "number" },
    // 서명 영역
    A14: { field: "reportDate", type: "text" },
    A15: { field: "accountantLine", type: "text" },
    A16: { field: "candidateLine", type: "text" },
    A18: { field: "committeeLine", type: "text" },
  },
};
