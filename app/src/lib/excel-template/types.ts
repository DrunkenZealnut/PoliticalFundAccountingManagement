/** Cell value types */
export type CellValueType = "number" | "text" | "date";

/** Fixed cell entry: inject value at a specific cell address */
export interface FixedCellEntry {
  field: string; // data object key path (e.g., "asset.income")
  type: CellValueType;
}

/** Fixed cell report mapping (T1~T4) */
export interface FixedCellMapping {
  id: string;
  templateFile: string;
  type: "fixed";
  orgTypes?: number[]; // applicable org_sec_cd values
  sheet: string;
  cells: Record<string, FixedCellEntry>; // cellAddress → entry
}

/** Dynamic column entry */
export interface DynamicColumnEntry {
  field: string;
  type: CellValueType;
}

/** Dynamic row report mapping (T5~T10: 수입지출부) */
export interface DynamicRowMapping {
  id: string;
  templateFile: string;
  type: "dynamic";
  orgTypes?: number[]; // applicable org_sec_cd values
  sheet: string;
  header: Record<string, FixedCellEntry>; // header fixed cells
  dataStartRow: number; // 1-based row number
  columns: Record<string, DynamicColumnEntry>; // colLetter → entry
}

/** Union mapping type */
export type TemplateMappingConfig = FixedCellMapping | DynamicRowMapping;

/** Report type enum */
export type ReportType =
  | "income-expense-report" // T1: 수입지출보고서
  | "audit-opinion" // T2: 감사의견서
  | "review-resolution" // T3: 심사의결서
  | "accounting-report" // T4: 회계보고서
  | "ledger"; // T5~T10: 수입지출부

/** API request parameters */
export interface ReportRequest {
  reportType: ReportType;
  orgId: string;
  accSecCd?: string;
  itemSecCd?: string;
  dateFrom?: string;
  dateTo?: string;
}

/** 수입지출보고서 account row */
export interface AccountRow {
  income: number;
  expElection: number;
  expNonElection: number;
  expSubtotal: number;
  balance: number;
}

/** 수입지출보고서 data */
export interface IncomeExpenseReportData {
  electionName: string;
  districtName: string;
  entityName: string;
  asset: AccountRow;
  donation: AccountRow;
  subsidy: AccountRow;
  subsidyOther: AccountRow;
  total: AccountRow;
  reportDate: string;
  accountantLine: string;
  candidateLine: string;
  committeeLine: string;
  [key: string]: unknown;
}

/** 수입지출부 row */
export interface LedgerRow {
  accDate: string;
  description: string;
  incomeAmt: number | null;
  incomeCum: number;
  expenseAmt: number | null;
  expenseCum: number;
  balance: number;
  custName: string;
  regNum: string;
  addr: string;
  job: string;
  tel: string;
  receiptNo: string;
  remark: string;
  transfer: string;
  [key: string]: unknown;
}
