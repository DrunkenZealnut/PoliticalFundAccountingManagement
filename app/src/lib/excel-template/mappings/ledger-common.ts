import type { DynamicRowMapping } from "../types";

/**
 * T5~T10: 수입지출부 공통 매핑
 * 6개 파일 모두 동일한 15열 구조 (A~O)
 * 계정명(A4 셀)과 데이터만 다름
 */
export const ledgerMapping: Omit<DynamicRowMapping, "id" | "templateFile"> = {
  type: "dynamic",
  sheet: "Sheet1",
  header: {
    A4: { field: "accountLabel", type: "text" },
  },
  dataStartRow: 9,
  columns: {
    A: { field: "accDate", type: "date" },
    B: { field: "description", type: "text" },
    C: { field: "incomeAmt", type: "number" },
    D: { field: "incomeCum", type: "number" },
    E: { field: "expenseAmt", type: "number" },
    F: { field: "expenseCum", type: "number" },
    G: { field: "balance", type: "number" },
    H: { field: "custName", type: "text" },
    I: { field: "regNum", type: "text" },
    J: { field: "addr", type: "text" },
    K: { field: "job", type: "text" },
    L: { field: "tel", type: "text" },
    M: { field: "receiptNo", type: "text" },
    N: { field: "remark", type: "text" },
    O: { field: "transfer", type: "text" },
  },
};

/** 계정-파일 매핑 테이블 */
export interface LedgerTemplateEntry {
  accSecCdName: string;
  itemSecCdName: string;
  templateFile: string;
  accountLabel: string;
}

export const LEDGER_TEMPLATES: LedgerTemplateEntry[] = [
  {
    accSecCdName: "후원회기부금",
    itemSecCdName: "선거비용",
    templateFile: "기부금-선거비용.xlsx",
    accountLabel: "[계정(과 목)명: 후원회기부금 (선거비용) ]",
  },
  {
    accSecCdName: "후원회기부금",
    itemSecCdName: "선거비용외",
    templateFile: "기부금-선거비용외.xlsx",
    accountLabel: "[계정(과 목)명: 후원회기부금 (선거비용외 정치자금) ]",
  },
  {
    accSecCdName: "보조금",
    itemSecCdName: "선거비용",
    templateFile: "보조금-선거비용.xlsx",
    accountLabel: "[계정(과 목)명: 보조금 (선거비용) ]",
  },
  {
    accSecCdName: "보조금",
    itemSecCdName: "선거비용외",
    templateFile: "보조금-선거비용외.xlsx",
    accountLabel: "[계정(과 목)명: 보조금 (선거비용외 정치자금) ]",
  },
  {
    accSecCdName: "후보자등자산",
    itemSecCdName: "선거비용",
    templateFile: "후보자산-선거비용.xlsx",
    accountLabel: "[계정(과 목)명: 후보자등 자산 (선거비용) ]",
  },
  {
    accSecCdName: "후보자등자산",
    itemSecCdName: "선거비용외",
    templateFile: "후보자산-선거비용외.xlsx",
    accountLabel: "[계정(과 목)명: 후보자등 자산 (선거비용외 정치자금) ]",
  },
];
