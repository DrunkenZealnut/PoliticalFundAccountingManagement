import type { FixedCellMapping } from "../types";

/** T4: 회계보고서 */
export const accountingReportMapping: FixedCellMapping = {
  id: "accounting-report",
  templateFile: "회계보고서.xls",
  type: "fixed",
  sheet: "Sheet1",
  cells: {
    A2: { field: "orgName", type: "text" },
    C5: { field: "docNumber", type: "text" },
    C6: { field: "issueDate", type: "text" },
    C7: { field: "recipientName", type: "text" },
    C8: { field: "title", type: "text" },
    A33: { field: "representLine", type: "text" },
  },
};
