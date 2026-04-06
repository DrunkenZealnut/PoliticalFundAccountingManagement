import type { FixedCellMapping } from "../types";

/** T2: 감사의견서 */
export const auditOpinionMapping: FixedCellMapping = {
  id: "audit-opinion",
  templateFile: "감사의견서.xls",
  type: "fixed",
  sheet: "Sheet1",
  cells: {
    B4: { field: "auditDescription", type: "text" },
    B5: { field: "auditPeriodEnd", type: "text" },
    B9: { field: "auditPeriodLine", type: "text" },
    B14: { field: "opinionText", type: "text" },
    B15: { field: "specialNotes", type: "text" },
    B16: { field: "reportDate", type: "text" },
    D19: { field: "auditorAddress", type: "text" },
    D20: { field: "auditorName", type: "text" },
  },
};
