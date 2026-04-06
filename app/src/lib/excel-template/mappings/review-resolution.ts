import type { FixedCellMapping } from "../types";

/** T3: 심사의결서 */
export const reviewResolutionMapping: FixedCellMapping = {
  id: "review-resolution",
  templateFile: "심사의결서.xls",
  type: "fixed",
  sheet: "Sheet1",
  cells: {
    E9: { field: "period", type: "text" },
    D10: { field: "totalAsset", type: "number" },
    D12: { field: "totalIncome", type: "number" },
    D13: { field: "totalExpense", type: "number" },
    D14: { field: "totalBalance", type: "number" },
    B16: { field: "resolutionDate", type: "text" },
    D17: { field: "committeeName", type: "text" },
    G19: { field: "member1Name", type: "text" },
    G20: { field: "member2Name", type: "text" },
    G21: { field: "member3Name", type: "text" },
  },
};
