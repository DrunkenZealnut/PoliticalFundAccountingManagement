/* ------------------------------------------------------------------ */
/*  보고서 배치 Excel(수입·지출부 멀티시트) workbook 빌더 — 순수(-ish)     */
/*                                                                    */
/*  reports/page.tsx handleBatchExcel 에 인라인이던 시트 빌더 전체를       */
/*  추출했다. reports 페이지(개별 다운로드)와 제출 마법사 GenerateStep      */
/*  (zip 묶음)이 동일 빌더를 공유해 화면·zip 산출물이 구조적으로 일치한다.  */
/*                                                                    */
/*  입력 records 는 재조정 SSOT(buildReportLedgerRecords: 후보자          */
/*  (계정×과목) 분할 + 영수증 재채번) 적용 후 행이어야 한다 — 호출부 책임.  */
/*  ExcelJS 는 동적 import(클라 번들 지연 로드).                          */
/* ------------------------------------------------------------------ */
import { compareAccDateTime } from "@/lib/accounting/acc-book-sort";
import { displayReceiptNo } from "@/lib/accounting/receipt-no";
import { ESTATE_TYPES } from "@/lib/accounting/estate-types";
import { aggregateSummaryByAccount } from "@/lib/hwpx/report-summary-builder";
import type { AccItemCombo } from "@/lib/excel-template/report-combos";

/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface AccRecord {
  acc_book_id: number;
  org_id: number;
  incm_sec_cd: number;
  acc_sec_cd: number;
  item_sec_cd: number;
  exp_sec_cd: number;
  cust_id: number;
  acc_date: string;
  content: string;
  acc_amt: number;
  rcp_yn: string;
  rcp_no: string | null;
  rcp_no2: number | null;
  bigo: string | null;
  customer?: { name: string } | null;
}

export interface Customer {
  cust_id: number;
  cust_sec_cd: number;
  name: string | null;
  reg_num: string | null;
  addr: string | null;
  job: string | null;
  tel: string | null;
}

export interface Estate {
  estate_id: number;
  estate_sec_cd: number;
  kind: string;
  qty: number;
  content: string;
  amt: number;
  remark: string;
}
/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

type ExcelJS_Workbook = import("exceljs").Workbook;
type ExcelJS_Worksheet = import("exceljs").Worksheet;
type ExcelJS_Borders = import("exceljs").Borders;
type ExcelJS_Font = import("exceljs").Font;
type ExcelJS_Alignment = import("exceljs").Alignment;

const THIN_BORDER: Partial<ExcelJS_Borders> = {
  top: { style: "thin" },
  bottom: { style: "thin" },
  left: { style: "thin" },
  right: { style: "thin" },
};

const HEADER_FONT: Partial<ExcelJS_Font> = { bold: true, size: 9 };
const CENTER_ALIGN: Partial<ExcelJS_Alignment> = {
  horizontal: "center",
  vertical: "middle",
  wrapText: true,
};

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}년 ${String(d.getMonth() + 1).padStart(2, "0")}월 ${String(d.getDate()).padStart(2, "0")}일`;
}

function formatDate(d: string): string {
  if (d.length === 8) return `${d.slice(0, 4)}/${d.slice(4, 6)}/${d.slice(6, 8)}`;
  return d;
}

function applyHeaderStyle(
  ws: ExcelJS_Worksheet,
  rowStart: number,
  rowEnd: number,
  colStart: number,
  colEnd: number,
) {
  for (let r = rowStart; r <= rowEnd; r++) {
    for (let c = colStart; c <= colEnd; c++) {
      const cell = ws.getRow(r).getCell(c);
      cell.font = HEADER_FONT;
      cell.alignment = CENTER_ALIGN;
      cell.border = THIN_BORDER;
    }
  }
}

function applyDataCellStyle(
  ws: ExcelJS_Worksheet,
  row: number,
  colStart: number,
  colEnd: number,
  moneyCols: number[],
) {
  for (let c = colStart; c <= colEnd; c++) {
    const cell = ws.getRow(row).getCell(c);
    cell.border = THIN_BORDER;
    cell.font = { size: 9 };
    if (moneyCols.includes(c)) {
      cell.numFmt = "#,##0";
      cell.alignment = { horizontal: "right" };
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Sheet builders                                                     */
/* ------------------------------------------------------------------ */

/**
 * Sheet 1: 정치자금 수입지출보고서 (총괄표)
 */
function buildSummarySheet(
  wb: ExcelJS_Workbook,
  records: AccRecord[],
  orgName: string,
  dateFrom: string,
  dateTo: string,
  getName: (id: number) => string,
) {
  const ws = wb.addWorksheet("수입지출보고서(총괄표)");

  // Title
  ws.mergeCells("A1:F1");
  const title = ws.getCell("A1");
  title.value = "정 치 자 금  수 입 지 출 보 고 서 (총 괄 표)";
  title.font = { bold: true, size: 14 };
  title.alignment = { horizontal: "center", vertical: "middle" };

  ws.mergeCells("E2:F2");
  ws.getCell("E2").value = "(금액단위 : 원)";
  ws.getCell("E2").alignment = { horizontal: "right" };
  ws.getCell("E2").font = { size: 9 };

  ws.getCell("A3").value = `사용기관: ${orgName}`;
  ws.getCell("A3").font = { bold: true };
  ws.getCell("A4").value = `기간: ${dateFrom} ~ ${dateTo}`;

  // Headers row 6-7
  ws.mergeCells("A6:A7");
  ws.getRow(6).getCell(1).value = "구  분";

  ws.mergeCells("B6:B7");
  ws.getRow(6).getCell(2).value = "수  입";

  ws.mergeCells("C6:E6");
  ws.getRow(6).getCell(3).value = "지  출";
  ws.getRow(7).getCell(3).value = "선거비용";
  ws.getRow(7).getCell(4).value = "선거비용외";
  ws.getRow(7).getCell(5).value = "소  계";

  ws.mergeCells("F6:F7");
  ws.getRow(6).getCell(6).value = "잔  액";

  applyHeaderStyle(ws, 6, 7, 1, 6);

  // acc_sec_cd별 집계. 선거비용/선거비용외는 **과목(item_sec_cd)** 으로 분류(SSOT).
  // 기존 exp_sec_cd(지출유형) 기준은 미입력(0)이 많아 선거비용을 전부 선거비용외로 오분류했음.
  // (계정×과목) 배분현황·22-1 HWPX(buildReportSummaryModel)와 동일 기준.
  const summaryRows = aggregateSummaryByAccount(records, getName);

  let rowIdx = 8;
  let totalIncome = 0;
  let totalExpElection = 0;
  let totalExpOther = 0;

  for (const v of summaryRows) {
    const row = ws.getRow(rowIdx);
    row.getCell(1).value = v.accName;
    row.getCell(2).value = v.income || null;
    row.getCell(3).value = v.expElection || null;
    row.getCell(4).value = v.expOther || null;
    row.getCell(5).value = (v.expElection + v.expOther) || null;
    row.getCell(6).value = v.income - v.expElection - v.expOther;
    applyDataCellStyle(ws, rowIdx, 1, 6, [2, 3, 4, 5, 6]);
    totalIncome += v.income;
    totalExpElection += v.expElection;
    totalExpOther += v.expOther;
    rowIdx++;
  }

  // Total row
  const tr = ws.getRow(rowIdx);
  tr.getCell(1).value = "합  계";
  tr.getCell(1).font = { bold: true, size: 9 };
  tr.getCell(2).value = totalIncome;
  tr.getCell(3).value = totalExpElection;
  tr.getCell(4).value = totalExpOther;
  tr.getCell(5).value = totalExpElection + totalExpOther;
  tr.getCell(6).value = totalIncome - totalExpElection - totalExpOther;
  applyDataCellStyle(ws, rowIdx, 1, 6, [2, 3, 4, 5, 6]);
  for (let c = 1; c <= 6; c++) tr.getCell(c).font = { bold: true, size: 9 };

  ws.getColumn(1).width = 20;
  ws.getColumn(2).width = 16;
  ws.getColumn(3).width = 16;
  ws.getColumn(4).width = 16;
  ws.getColumn(5).width = 16;
  ws.getColumn(6).width = 16;
}

/**
 * Sheet 2: 재산명세서
 */
function buildEstateSheet(
  wb: ExcelJS_Workbook,
  estates: Estate[],
  orgName: string,
) {
  const ws = wb.addWorksheet("재산명세서");

  ws.mergeCells("A1:F1");
  const title = ws.getCell("A1");
  title.value = "재 산 명 세 서";
  title.font = { bold: true, size: 14 };
  title.alignment = { horizontal: "center", vertical: "middle" };

  ws.mergeCells("E2:F2");
  ws.getCell("E2").value = "(금액단위 : 원)";
  ws.getCell("E2").alignment = { horizontal: "right" };
  ws.getCell("E2").font = { size: 9 };

  ws.getCell("A3").value = `사용기관: ${orgName}`;
  ws.getCell("A3").font = { bold: true };

  // Headers
  const headers = ["구  분", "종  류", "수  량", "내  용", "가  액", "비  고"];
  const hRow = ws.getRow(5);
  headers.forEach((h, i) => {
    hRow.getCell(i + 1).value = h;
  });
  applyHeaderStyle(ws, 5, 5, 1, 6);

  let rowIdx = 6;
  for (const t of ESTATE_TYPES) {
    const items = estates.filter((e) => e.estate_sec_cd === t.value);
    if (items.length === 0) {
      // Still show category row with zero
      const row = ws.getRow(rowIdx);
      row.getCell(1).value = t.label;
      row.getCell(5).value = 0;
      applyDataCellStyle(ws, rowIdx, 1, 6, [3, 5]);
      rowIdx++;
      continue;
    }
    for (let i = 0; i < items.length; i++) {
      const row = ws.getRow(rowIdx);
      if (i === 0) row.getCell(1).value = t.label;
      row.getCell(2).value = items[i].kind;
      row.getCell(3).value = items[i].qty;
      row.getCell(4).value = items[i].content;
      row.getCell(5).value = items[i].amt;
      row.getCell(6).value = items[i].remark;
      applyDataCellStyle(ws, rowIdx, 1, 6, [3, 5]);
      rowIdx++;
    }
  }

  // Total
  const tr = ws.getRow(rowIdx);
  tr.getCell(1).value = "합  계";
  tr.getCell(1).font = { bold: true, size: 9 };
  tr.getCell(5).value = estates.reduce((s, e) => s + e.amt, 0);
  applyDataCellStyle(ws, rowIdx, 1, 6, [5]);
  for (let c = 1; c <= 6; c++) tr.getCell(c).font = { bold: true, size: 9 };

  ws.getColumn(1).width = 20;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 10;
  ws.getColumn(4).width = 30;
  ws.getColumn(5).width = 18;
  ws.getColumn(6).width = 18;
}

/**
 * Sheet 3: 재산 구분별 세부내역서
 */
function buildEstateDetailSheet(
  wb: ExcelJS_Workbook,
  estates: Estate[],
  orgName: string,
) {
  const ws = wb.addWorksheet("재산 구분별 세부내역서");

  ws.mergeCells("A1:F1");
  const title = ws.getCell("A1");
  title.value = "재 산  구 분 별  세 부 내 역 서";
  title.font = { bold: true, size: 14 };
  title.alignment = { horizontal: "center", vertical: "middle" };

  ws.getCell("A3").value = `사용기관: ${orgName}`;
  ws.getCell("A3").font = { bold: true };

  let rowIdx = 5;

  for (const t of ESTATE_TYPES) {
    const items = estates.filter((e) => e.estate_sec_cd === t.value);

    // Section header
    const secRow = ws.getRow(rowIdx);
    ws.mergeCells(`A${rowIdx}:F${rowIdx}`);
    secRow.getCell(1).value = `[ ${t.label} ]`;
    secRow.getCell(1).font = { bold: true, size: 11 };
    rowIdx++;

    if (items.length === 0) {
      ws.getRow(rowIdx).getCell(1).value = "(해당 없음)";
      ws.getRow(rowIdx).getCell(1).font = { size: 9, italic: true };
      rowIdx += 2;
      continue;
    }

    // Table headers
    const headers = ["번호", "종류", "수량", "내용", "가액", "비고"];
    const hRow = ws.getRow(rowIdx);
    headers.forEach((h, i) => {
      hRow.getCell(i + 1).value = h;
    });
    applyHeaderStyle(ws, rowIdx, rowIdx, 1, 6);
    rowIdx++;

    let subtotal = 0;
    items.forEach((item, i) => {
      const row = ws.getRow(rowIdx);
      row.getCell(1).value = i + 1;
      row.getCell(2).value = item.kind;
      row.getCell(3).value = item.qty;
      row.getCell(4).value = item.content;
      row.getCell(5).value = item.amt;
      row.getCell(6).value = item.remark;
      applyDataCellStyle(ws, rowIdx, 1, 6, [3, 5]);
      subtotal += item.amt;
      rowIdx++;
    });

    // Subtotal
    const sr = ws.getRow(rowIdx);
    sr.getCell(1).value = "소계";
    sr.getCell(1).font = { bold: true, size: 9 };
    sr.getCell(5).value = subtotal;
    applyDataCellStyle(ws, rowIdx, 1, 6, [5]);
    sr.getCell(5).font = { bold: true, size: 9 };
    rowIdx += 2;
  }

  ws.getColumn(1).width = 10;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 10;
  ws.getColumn(4).width = 30;
  ws.getColumn(5).width = 18;
  ws.getColumn(6).width = 18;
}

/**
 * Sheet 4: 수입-지출부 표지 (cover page)
 */
function buildMainCoverSheet(
  wb: ExcelJS_Workbook,
  orgName: string,
  orgSecCd: number | null,
  acctName: string | null,
  electionName: string,
  districtName: string,
  dateFrom: string,
  dateTo: string,
  getName: (id: number) => string,
) {
  const ws = wb.addWorksheet("수입지출부 표지");

  ws.mergeCells("A3:F3");
  const title = ws.getCell("A3");
  title.value = "정 치 자 금  수 입 · 지 출 부";
  title.font = { bold: true, size: 18 };
  title.alignment = { horizontal: "center", vertical: "middle" };

  let rowIdx = 6;

  const orgTypeName = orgSecCd ? getName(orgSecCd) : "";
  if (orgTypeName) {
    ws.mergeCells(`A${rowIdx}:F${rowIdx}`);
    ws.getRow(rowIdx).getCell(1).value = `사용기관유형: ${orgTypeName}`;
    ws.getRow(rowIdx).getCell(1).alignment = { horizontal: "center" };
    rowIdx++;
  }

  ws.mergeCells(`A${rowIdx}:F${rowIdx}`);
  ws.getRow(rowIdx).getCell(1).value = `사용기관명: ${orgName}`;
  ws.getRow(rowIdx).getCell(1).font = { bold: true, size: 12 };
  ws.getRow(rowIdx).getCell(1).alignment = { horizontal: "center" };
  rowIdx += 2;

  if (electionName) {
    ws.mergeCells(`A${rowIdx}:F${rowIdx}`);
    ws.getRow(rowIdx).getCell(1).value = `선거명: ${electionName}`;
    ws.getRow(rowIdx).getCell(1).alignment = { horizontal: "center" };
    rowIdx++;
  }
  if (districtName) {
    ws.mergeCells(`A${rowIdx}:F${rowIdx}`);
    ws.getRow(rowIdx).getCell(1).value = `선거구명: ${districtName}`;
    ws.getRow(rowIdx).getCell(1).alignment = { horizontal: "center" };
    rowIdx++;
  }

  rowIdx++;
  ws.mergeCells(`A${rowIdx}:F${rowIdx}`);
  ws.getRow(rowIdx).getCell(1).value = `회계기간: ${dateFrom} ~ ${dateTo}`;
  ws.getRow(rowIdx).getCell(1).alignment = { horizontal: "center" };
  ws.getRow(rowIdx).getCell(1).font = { size: 11 };
  rowIdx += 2;

  ws.mergeCells(`A${rowIdx}:F${rowIdx}`);
  ws.getRow(rowIdx).getCell(1).value = `회계책임자: ${acctName || ""}`;
  ws.getRow(rowIdx).getCell(1).alignment = { horizontal: "center" };
  ws.getRow(rowIdx).getCell(1).font = { size: 11 };

  ws.getColumn(1).width = 10;
  ws.getColumn(2).width = 10;
  ws.getColumn(3).width = 10;
  ws.getColumn(4).width = 10;
  ws.getColumn(5).width = 10;
  ws.getColumn(6).width = 10;
}

/**
 * Sheet 5/6: 계정 표지 + 과목 표지 for each combo
 */
function buildAccountCover(
  wb: ExcelJS_Workbook,
  accName: string,
  orgName: string,
  sheetName: string,
) {
  const ws = wb.addWorksheet(sheetName);
  ws.mergeCells("A3:D3");
  const title = ws.getCell("A3");
  title.value = "수 입 · 지 출 부";
  title.font = { bold: true, size: 18 };
  title.alignment = { horizontal: "center", vertical: "middle" };

  ws.mergeCells("A6:D6");
  ws.getRow(6).getCell(1).value = `계정 -  ${accName}`;
  ws.getRow(6).getCell(1).font = { size: 14 };
  ws.getRow(6).getCell(1).alignment = { horizontal: "center" };

  ws.mergeCells("A9:D9");
  ws.getRow(9).getCell(1).value = `보고자 : 회계책임자 ${orgName}`;
  ws.getRow(9).getCell(1).font = { size: 12 };
  ws.getRow(9).getCell(1).alignment = { horizontal: "center" };

  ws.getColumn(1).width = 15;
  ws.getColumn(2).width = 15;
  ws.getColumn(3).width = 15;
  ws.getColumn(4).width = 15;
}

function buildItemCover(
  wb: ExcelJS_Workbook,
  accName: string,
  itemName: string,
  orgName: string,
  sheetName: string,
) {
  const ws = wb.addWorksheet(sheetName);
  ws.mergeCells("A3:D3");
  const title = ws.getCell("A3");
  title.value = "수 입 · 지 출 부";
  title.font = { bold: true, size: 18 };
  title.alignment = { horizontal: "center", vertical: "middle" };

  ws.mergeCells("A6:D6");
  ws.getRow(6).getCell(1).value = `과목 -  ${itemName}`;
  ws.getRow(6).getCell(1).font = { size: 14 };
  ws.getRow(6).getCell(1).alignment = { horizontal: "center" };

  ws.mergeCells("A9:D9");
  ws.getRow(9).getCell(1).value = `보고자 : 회계책임자 ${orgName}`;
  ws.getRow(9).getCell(1).font = { size: 12 };
  ws.getRow(9).getCell(1).alignment = { horizontal: "center" };

  ws.getColumn(1).width = 15;
  ws.getColumn(2).width = 15;
  ws.getColumn(3).width = 15;
  ws.getColumn(4).width = 15;
}

/**
 * Sheet 7+: 계정과목별 수입·지출 내역 (공식 양식 - 수입+지출 합산)
 */
function buildLedgerSheet(
  wb: ExcelJS_Workbook,
  sheetRecords: AccRecord[],
  custMap: Map<number, Customer>,
  accName: string,
  itemName: string,
  orgName: string,
  acctName: string | null,
  sheetName: string,
) {
  const ws = wb.addWorksheet(sheetName);
  const COLS = 13; // A-M

  // Title
  ws.mergeCells("A1:M1");
  const titleCell = ws.getCell("A1");
  titleCell.value = "정 치 자 금 수 입 · 지 출 부";
  titleCell.font = { bold: true, size: 16 };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  // 계정/과목 + 금액단위
  ws.getCell("A3").value = `[계 정 명: ${accName} ]`;
  ws.getCell("A3").font = { bold: true, size: 10 };
  ws.mergeCells("L2:M2");
  ws.getCell("L2").value = "(금액단위 : 원)";
  ws.getCell("L2").alignment = { horizontal: "right" };
  ws.getCell("L2").font = { size: 9 };

  ws.getCell("A4").value = `[과 목 명: ${itemName} ]`;
  ws.getCell("A4").font = { bold: true, size: 10 };

  // Column headers (Row 5-6, 2-row merged)
  ws.mergeCells("A5:A6"); // 연월일
  ws.getRow(5).getCell(1).value = "연월일";

  ws.mergeCells("B5:B6"); // 내역
  ws.getRow(5).getCell(2).value = "내  역";

  ws.mergeCells("C5:D5"); // 수입액
  ws.getRow(5).getCell(3).value = "수 입 액";
  ws.getRow(6).getCell(3).value = "금 회";
  ws.getRow(6).getCell(4).value = "누 계";

  ws.mergeCells("E5:F5"); // 지출액
  ws.getRow(5).getCell(5).value = "지 출 액";
  ws.getRow(6).getCell(5).value = "금 회";
  ws.getRow(6).getCell(6).value = "누 계";

  ws.mergeCells("G5:G6"); // 잔액
  ws.getRow(5).getCell(7).value = "잔  액";

  ws.mergeCells("H5:L5"); // 수입을 제공한 자 또는 지출을 받은 자
  ws.getRow(5).getCell(8).value = "수입을 제공한 자 또는 지출을 받은 자";
  ws.getRow(6).getCell(8).value = "성 명\n(법인·\n단체명)";
  ws.getRow(6).getCell(9).value = "생년\n월일\n(사업자\n번 호)";
  ws.getRow(6).getCell(10).value = "주    소\n(사무소소재지)";
  ws.getRow(6).getCell(11).value = "직업\n(업종)";
  ws.getRow(6).getCell(12).value = "전화\n번호";

  ws.mergeCells("M5:M6"); // 영수증일련번호
  ws.getRow(5).getCell(13).value = "영수증\n일 련\n번 호";

  applyHeaderStyle(ws, 5, 6, 1, COLS);

  // Column widths
  ws.getColumn(1).width = 10;  // 연월일
  ws.getColumn(2).width = 18;  // 내역
  ws.getColumn(3).width = 12;  // 수입금회
  ws.getColumn(4).width = 12;  // 수입누계
  ws.getColumn(5).width = 12;  // 지출금회
  ws.getColumn(6).width = 12;  // 지출누계
  ws.getColumn(7).width = 12;  // 잔액
  ws.getColumn(8).width = 10;  // 성명
  ws.getColumn(9).width = 10;  // 생년월일
  ws.getColumn(10).width = 20; // 주소
  ws.getColumn(11).width = 7;  // 직업
  ws.getColumn(12).width = 12; // 전화번호
  ws.getColumn(13).width = 8;  // 영수증번호

  // Sort records by date
  // 거래일 → 같은 날 수입(1) 먼저 → 같은 구분이면 acc_book_id (정렬 SSOT tie-break, 입력순 비결정성 제거)
  const sorted = [...sheetRecords].sort(
    (a, b) =>
      compareAccDateTime(a, b) ||
      a.incm_sec_cd - b.incm_sec_cd ||
      a.acc_book_id - b.acc_book_id,
  );

  // Data rows
  let incCum = 0;
  let expCum = 0;
  let incTotal = 0;
  let expTotal = 0;
  let rcpYIncAmt = 0, rcpYExpAmt = 0, rcpYCount = 0;
  let rcpNIncAmt = 0, rcpNExpAmt = 0, rcpNCount = 0;
  let rowIdx = 7;

  for (const r of sorted) {
    const cust = custMap.get(r.cust_id);
    const amt = r.acc_amt;
    const isIncome = r.incm_sec_cd === 1;
    const rcpY = r.rcp_yn === "Y";

    if (isIncome) { incCum += amt; incTotal += amt; }
    else { expCum += amt; expTotal += amt; }

    if (rcpY) {
      rcpYCount++;
      if (isIncome) rcpYIncAmt += amt; else rcpYExpAmt += amt;
    } else {
      rcpNCount++;
      if (isIncome) rcpNIncAmt += amt; else rcpNExpAmt += amt;
    }

    const row = ws.getRow(rowIdx);
    row.getCell(1).value = formatDate(r.acc_date);
    row.getCell(2).value = r.content;
    row.getCell(3).value = isIncome ? amt : null;
    row.getCell(4).value = isIncome ? incCum : null;
    row.getCell(5).value = !isIncome ? amt : null;
    row.getCell(6).value = !isIncome ? expCum : null;
    row.getCell(7).value = incCum - expCum;
    row.getCell(8).value = cust?.name || "";
    row.getCell(9).value = cust?.reg_num || "";
    row.getCell(10).value = cust?.addr || "";
    row.getCell(11).value = cust?.job || "";
    row.getCell(12).value = cust?.tel || "";
    row.getCell(13).value = displayReceiptNo(r.incm_sec_cd, r.rcp_no);

    applyDataCellStyle(ws, rowIdx, 1, COLS, [3, 4, 5, 6, 7]);
    rowIdx++;
  }

  // 거래 0 계정·과목: 손기입용 빈 행 1개 (양식 완전성)
  if (sorted.length === 0) {
    for (let c = 1; c <= COLS; c++) ws.getRow(rowIdx).getCell(c).value = null;
    applyDataCellStyle(ws, rowIdx, 1, COLS, [3, 4, 5, 6, 7]);
    rowIdx++;
  }

  const totalCount = sorted.length;

  /* 합계 row */
  ws.mergeCells(`A${rowIdx}:B${rowIdx}`);
  const sumRow = ws.getRow(rowIdx);
  sumRow.getCell(1).value = "합        계";
  sumRow.getCell(3).value = incTotal;
  sumRow.getCell(4).value = incTotal;
  sumRow.getCell(5).value = expTotal;
  sumRow.getCell(6).value = expTotal;
  sumRow.getCell(7).value = incTotal - expTotal;
  sumRow.getCell(13).value = `${totalCount}건`;
  for (let c = 1; c <= COLS; c++) {
    sumRow.getCell(c).border = THIN_BORDER;
    sumRow.getCell(c).font = { bold: true, size: 9 };
    if ([3, 4, 5, 6, 7].includes(c)) {
      sumRow.getCell(c).numFmt = "#,##0";
      sumRow.getCell(c).alignment = { horizontal: "right" };
    } else {
      sumRow.getCell(c).alignment = CENTER_ALIGN;
    }
  }
  rowIdx++;

  /* 영수증 첨부분 / 생략분 */
  const rcpStart = rowIdx;
  ws.mergeCells(`A${rcpStart}:A${rcpStart + 1}`);

  // 첨부분
  const attachRow = ws.getRow(rcpStart);
  attachRow.getCell(1).value = "영수증";
  attachRow.getCell(2).value = "첨부분";
  attachRow.getCell(3).value = rcpYIncAmt || 0;
  attachRow.getCell(5).value = rcpYExpAmt || 0;
  attachRow.getCell(13).value = `${rcpYCount}건`;

  // 생략분
  const skipRow = ws.getRow(rcpStart + 1);
  skipRow.getCell(2).value = "생략분";
  skipRow.getCell(3).value = rcpNIncAmt || 0;
  skipRow.getCell(5).value = rcpNExpAmt || 0;
  skipRow.getCell(13).value = `${rcpNCount}건`;

  for (let r = rcpStart; r <= rcpStart + 1; r++) {
    for (let c = 1; c <= COLS; c++) {
      const cell = ws.getRow(r).getCell(c);
      cell.border = THIN_BORDER;
      cell.font = { size: 9 };
      if ([3, 5].includes(c)) {
        cell.numFmt = "#,##0";
        cell.alignment = { horizontal: "right" };
      } else {
        cell.alignment = CENTER_ALIGN;
      }
    }
  }
  rowIdx = rcpStart + 2;

  /* Footer */
  rowIdx += 1;
  ws.mergeCells(`A${rowIdx}:M${rowIdx}`);
  ws.getCell(`A${rowIdx}`).value = `작성연월일 : ${todayStr()}`;
  ws.getCell(`A${rowIdx}`).alignment = { horizontal: "right" };

  rowIdx += 1;
  ws.mergeCells(`A${rowIdx}:M${rowIdx}`);
  ws.getCell(`A${rowIdx}`).value = `${orgName}   회계책임자  ${acctName || ""}  (인)`;
  ws.getCell(`A${rowIdx}`).alignment = { horizontal: "center" };
}

/* ------------------------------------------------------------------ */
/*  Workbook 오케스트레이션                                             */
/* ------------------------------------------------------------------ */

/** acc_rel 표준 (계정×과목) 조합 — 거래 0이어도 빈 양식으로 출력(서식7 패턴). */
export function buildStandardCombos(
  orgSecCd: number | null,
  getAccounts: (orgSecCd: number, incmSecCd: number) => { cv_id: number }[],
  getItems: (orgSecCd: number, incmSecCd: number, accSecCd: number) => { cv_id: number }[],
): AccItemCombo[] {
  const out: AccItemCombo[] = [];
  const seen = new Set<string>();
  if (!orgSecCd) return out;
  for (const incm of [1, 2] as const) {
    for (const acc of getAccounts(orgSecCd, incm)) {
      for (const item of getItems(orgSecCd, incm, acc.cv_id)) {
        const k = `${acc.cv_id}-${item.cv_id}`;
        if (!seen.has(k)) {
          seen.add(k);
          out.push({ accSecCd: acc.cv_id, itemSecCd: item.cv_id });
        }
      }
    }
  }
  return out;
}

/** 거래 데이터에 실제로 존재하는 (계정×과목) 조합. */
export function buildDataCombos(records: AccRecord[]): AccItemCombo[] {
  const map = new Map<string, AccItemCombo>();
  for (const r of records) {
    const key = `${r.acc_sec_cd}-${r.item_sec_cd}`;
    if (!map.has(key)) map.set(key, { accSecCd: r.acc_sec_cd, itemSecCd: r.item_sec_cd });
  }
  return Array.from(map.values());
}

export interface ReportWorkbookInput {
  /** 재조정 SSOT(buildReportLedgerRecords) 적용 후 행 */
  records: AccRecord[];
  custMap: Map<number, Customer>;
  estates: Estate[];
  /** 출력할 (계정×과목) 조합 — buildReportCombos 결과 */
  combos: AccItemCombo[];
  covers: { accountCover: boolean; subjectCover: boolean };
  orgName: string;
  orgSecCd: number | null;
  acctName: string | null;
  electionName: string;
  districtName: string;
  /** 표지 표기용 YYYY-MM-DD */
  dateFrom: string;
  dateTo: string;
  getName: (id: number) => string;
}

export interface ReportWorkbookResult {
  buffer: ArrayBuffer;
  sheetCount: number;
  comboCount: number;
}

/**
 * 보고서 workbook 생성: 총괄표·재산명세 2종·표지 + (계정×과목)별 표지·내역 시트.
 * reports 페이지 handleBatchExcel 과 마법사 GenerateStep 공용(동작 불변 추출).
 */
export async function buildReportWorkbook(input: ReportWorkbookInput): Promise<ReportWorkbookResult> {
  const {
    records, custMap, estates, combos, covers,
    orgName, orgSecCd, acctName, electionName, districtName,
    dateFrom, dateTo, getName,
  } = input;

  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();

  /* ---- Sheet 1: 수입지출보고서 총괄표 ---- */
  buildSummarySheet(wb, records, orgName, dateFrom, dateTo, getName);

  /* ---- Sheet 2: 재산명세서 ---- */
  buildEstateSheet(wb, estates, orgName);

  /* ---- Sheet 3: 재산 구분별 세부내역서 ---- */
  buildEstateDetailSheet(wb, estates, orgName);

  /* ---- Sheet 4: 수입지출부 표지 ---- */
  buildMainCoverSheet(wb, orgName, orgSecCd, acctName, electionName, districtName, dateFrom, dateTo, getName);

  /* ---- Sheets 5~N: (계정×과목)별 표지 + 내역 (수입+지출 합산) ---- */
  const addedAccCovers = new Set<number>();
  let sheetNum = 0;

  for (const combo of combos) {
    const accName = getName(combo.accSecCd);
    const itemName = getName(combo.itemSecCd);
    sheetNum++;

    // Account cover (one per accSecCd)
    if (covers.accountCover && !addedAccCovers.has(combo.accSecCd)) {
      addedAccCovers.add(combo.accSecCd);
      const accCoverName = `${sheetNum}_계정_${accName}`.slice(0, 31);
      buildAccountCover(wb, accName, orgName, accCoverName);
    }

    // Item cover
    if (covers.subjectCover) {
      const itemCoverName = `${sheetNum}_과목_${accName}_${itemName}`.slice(0, 31);
      buildItemCover(wb, accName, itemName, orgName, itemCoverName);
    }

    // Ledger detail sheet (수입+지출 합산)
    const sheetRecords = records.filter(
      (r) => r.acc_sec_cd === combo.accSecCd && r.item_sec_cd === combo.itemSecCd,
    );
    const ledgerName = `${sheetNum}_${accName}_${itemName}`.slice(0, 31);
    buildLedgerSheet(wb, sheetRecords, custMap, accName, itemName, orgName, acctName, ledgerName);
  }

  const buffer = (await wb.xlsx.writeBuffer()) as unknown as ArrayBuffer;
  return { buffer, sheetCount: wb.worksheets.length, comboCount: combos.length };
}
