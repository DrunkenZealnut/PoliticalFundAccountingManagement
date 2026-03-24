"use client";

import { useState } from "react";
import { useAuth } from "@/stores/auth";
import { useCodeValues } from "@/hooks/use-code-values";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpTooltip } from "@/components/help-tooltip";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AccRecord {
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

interface Customer {
  cust_id: number;
  cust_sec_cd: number;
  name: string | null;
  reg_num: string | null;
  addr: string | null;
  job: string | null;
  tel: string | null;
}

interface Estate {
  estate_id: number;
  estate_sec_cd: number;
  kind: string;
  qty: number;
  content: string;
  amt: number;
  remark: string;
}

const ESTATE_TYPES = [
  { value: 43, label: "토지" },
  { value: 44, label: "건물" },
  { value: 45, label: "주식 또는 유가증권" },
  { value: 46, label: "비품" },
  { value: 47, label: "현금 및 예금" },
  { value: 48, label: "그 밖의 재산" },
  { value: 49, label: "차입금" },
];

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

  // Aggregate by acc_sec_cd
  const accMap = new Map<number, { accName: string; income: number; expElection: number; expOther: number }>();

  for (const r of records) {
    const key = r.acc_sec_cd;
    if (!accMap.has(key)) {
      accMap.set(key, { accName: getName(key), income: 0, expElection: 0, expOther: 0 });
    }
    const entry = accMap.get(key)!;
    if (r.incm_sec_cd === 1) {
      entry.income += r.acc_amt;
    } else {
      // exp_sec_cd indicates election expense type; treat exp_sec_cd > 0 as election expense
      if (r.exp_sec_cd && r.exp_sec_cd > 0) {
        entry.expElection += r.acc_amt;
      } else {
        entry.expOther += r.acc_amt;
      }
    }
  }

  let rowIdx = 8;
  let totalIncome = 0;
  let totalExpElection = 0;
  let totalExpOther = 0;

  const sorted = Array.from(accMap.entries()).sort((a, b) => a[0] - b[0]);
  for (const [, v] of sorted) {
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
  typeLabel: string,
  accName: string,
  orgName: string,
  sheetName: string,
) {
  const ws = wb.addWorksheet(sheetName);
  ws.mergeCells("A3:D3");
  const title = ws.getCell("A3");
  title.value = `정 치 자 금  ${typeLabel} 부`;
  title.font = { bold: true, size: 16 };
  title.alignment = { horizontal: "center", vertical: "middle" };

  ws.mergeCells("A6:D6");
  ws.getRow(6).getCell(1).value = `[계 정 명 : ${accName}]`;
  ws.getRow(6).getCell(1).font = { bold: true, size: 14 };
  ws.getRow(6).getCell(1).alignment = { horizontal: "center" };

  ws.mergeCells("A9:D9");
  ws.getRow(9).getCell(1).value = orgName;
  ws.getRow(9).getCell(1).font = { size: 12 };
  ws.getRow(9).getCell(1).alignment = { horizontal: "center" };

  ws.getColumn(1).width = 15;
  ws.getColumn(2).width = 15;
  ws.getColumn(3).width = 15;
  ws.getColumn(4).width = 15;
}

function buildItemCover(
  wb: ExcelJS_Workbook,
  typeLabel: string,
  accName: string,
  itemName: string,
  orgName: string,
  sheetName: string,
) {
  const ws = wb.addWorksheet(sheetName);
  ws.mergeCells("A3:D3");
  const title = ws.getCell("A3");
  title.value = `정 치 자 금  ${typeLabel} 부`;
  title.font = { bold: true, size: 16 };
  title.alignment = { horizontal: "center", vertical: "middle" };

  ws.mergeCells("A6:D6");
  ws.getRow(6).getCell(1).value = `[계 정 명 : ${accName}]  [과 목 명 : ${itemName}]`;
  ws.getRow(6).getCell(1).font = { bold: true, size: 12 };
  ws.getRow(6).getCell(1).alignment = { horizontal: "center" };

  ws.mergeCells("A9:D9");
  ws.getRow(9).getCell(1).value = orgName;
  ws.getRow(9).getCell(1).font = { size: 12 };
  ws.getRow(9).getCell(1).alignment = { horizontal: "center" };

  ws.getColumn(1).width = 15;
  ws.getColumn(2).width = 15;
  ws.getColumn(3).width = 15;
  ws.getColumn(4).width = 15;
}

/**
 * Sheet 7+: 계정과목별 수입-지출 내역
 */
function buildLedgerSheet(
  wb: ExcelJS_Workbook,
  sheetRecords: AccRecord[],
  custMap: Map<number, Customer>,
  typeLabel: string,
  accName: string,
  itemName: string,
  orgName: string,
  acctName: string | null,
  electionName: string,
  districtName: string,
  sheetName: string,
) {
  const ws = wb.addWorksheet(sheetName);

  // Title
  ws.mergeCells("A1:O1");
  const titleCell = ws.getCell("A1");
  titleCell.value = `정 치 자 금  ${typeLabel} · 지 출 부`;
  titleCell.font = { bold: true, size: 16 };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  // 금액단위
  ws.mergeCells("N2:O2");
  ws.getCell("N2").value = "(금액단위 : 원)";
  ws.getCell("N2").alignment = { horizontal: "right" };
  ws.getCell("N2").font = { size: 9 };

  // 계정/과목 정보
  ws.mergeCells("A3:O3");
  ws.getCell("A3").value = `[계 정 명 : ${accName}]  [과 목 명 : ${itemName}]`;
  ws.getCell("A3").font = { bold: true, size: 11 };

  if (electionName || districtName) {
    ws.mergeCells("A4:O4");
    ws.getCell("A4").value =
      (electionName ? `선거명: ${electionName}` : "") +
      (districtName ? `  선거구명: ${districtName}` : "");
  }

  // Column headers (Row 5-6, 2-row merged)
  const h5 = ws.getRow(5);
  const h6 = ws.getRow(6);

  ws.mergeCells("A5:A6");
  h5.getCell(1).value = "년월일";

  ws.mergeCells("B5:B6");
  h5.getCell(2).value = "내 역";

  ws.mergeCells("C5:D5");
  h5.getCell(3).value = "수 입 액";
  h6.getCell(3).value = "금회";
  h6.getCell(4).value = "누계";

  ws.mergeCells("E5:F5");
  h5.getCell(5).value = "지 출 액";
  h6.getCell(5).value = "금회";
  h6.getCell(6).value = "누계";

  ws.mergeCells("G5:G6");
  h5.getCell(7).value = "잔 액";

  ws.mergeCells("H5:M5");
  h5.getCell(8).value = "수입을 제공한 자 또는 지출을 받은 자";
  h6.getCell(8).value = "성 명\n(법인·단체명)";
  h6.getCell(9).value = "생년월일\n(사업자번호)";
  h6.getCell(10).value = "주소 또는\n사무소소재지";
  h6.getCell(11).value = "직업\n(업종)";
  h6.getCell(12).value = "전화번호";
  h6.getCell(13).value = ""; // M col part of H5:M5 merge

  ws.mergeCells("N5:N6");
  h5.getCell(14).value = "영수증\n일련번호";

  ws.mergeCells("O5:O6");
  h5.getCell(15).value = "비 고";

  applyHeaderStyle(ws, 5, 6, 1, 15);

  // Column widths
  ws.getColumn(1).width = 10;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 12;
  ws.getColumn(4).width = 12;
  ws.getColumn(5).width = 12;
  ws.getColumn(6).width = 12;
  ws.getColumn(7).width = 12;
  ws.getColumn(8).width = 12;
  ws.getColumn(9).width = 12;
  ws.getColumn(10).width = 20;
  ws.getColumn(11).width = 8;
  ws.getColumn(12).width = 14;
  ws.getColumn(13).width = 2;
  ws.getColumn(14).width = 10;
  ws.getColumn(15).width = 8;

  // Data rows
  let incCum = 0;
  let expCum = 0;
  let rowIdx = 7;

  for (const r of sheetRecords) {
    const cust = custMap.get(r.cust_id);
    const amt = r.acc_amt;
    const isIncome = r.incm_sec_cd === 1;

    if (isIncome) incCum += amt;
    else expCum += amt;

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
    row.getCell(14).value = r.rcp_no || "";
    row.getCell(15).value = r.bigo || "";

    applyDataCellStyle(ws, rowIdx, 1, 15, [3, 4, 5, 6, 7]);
    rowIdx++;
  }

  // Footer
  rowIdx += 1;
  ws.mergeCells(`A${rowIdx}:O${rowIdx}`);
  ws.getCell(`A${rowIdx}`).value = `작성연월일 : ${todayStr()}`;
  ws.getCell(`A${rowIdx}`).alignment = { horizontal: "right" };

  rowIdx += 1;
  ws.mergeCells(`A${rowIdx}:O${rowIdx}`);
  ws.getCell(`A${rowIdx}`).value = `${orgName}   회계책임자  ${acctName || ""}  (인)`;
  ws.getCell(`A${rowIdx}`).alignment = { horizontal: "center" };
}

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function ReportsPage() {
  const { orgId, orgName, orgSecCd, acctName } = useAuth();
  const { getName, loading: codesLoading } = useCodeValues();

  const [covers, setCovers] = useState({
    incomeCover: true,
    expenseCover: true,
    accountCover: true,
    subjectCover: true,
  });
  const [electionName, setElectionName] = useState("");
  const [districtName, setDistrictName] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [generating, setGenerating] = useState(false);

  function handleCoverChange(key: keyof typeof covers) {
    setCovers((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  /* -------------------------------------------------------------- */
  /*  Main batch generation                                          */
  /* -------------------------------------------------------------- */
  async function handleBatchExcel() {
    if (!orgId || !dateFrom || !dateTo) {
      alert("기간을 설정하세요.");
      return;
    }
    setGenerating(true);

    try {
      const fromStr = dateFrom.replace(/-/g, "");
      const toStr = dateTo.replace(/-/g, "");

      // Fetch acc_book records via server API (bypasses RLS)
      const accRes = await fetch(
        `/api/acc-book?orgId=${orgId}&dateFrom=${fromStr}&dateTo=${toStr}`,
      );
      if (!accRes.ok) throw new Error("회계 데이터를 불러오지 못했습니다.");
      const accJson = await accRes.json();
      const records: AccRecord[] = accJson.records || [];

      if (records.length === 0) {
        alert("해당 기간에 회계 데이터가 없습니다.");
        setGenerating(false);
        return;
      }

      // Fetch all customers via server API (bypasses RLS)
      const custRes = await fetch("/api/customers");
      if (!custRes.ok) throw new Error("수입지출처 데이터를 불러오지 못했습니다.");
      const custArr: Customer[] = await custRes.json();
      const custMap = new Map<number, Customer>();
      for (const c of custArr) custMap.set(c.cust_id, c);

      // Fetch estate via supabase browser client
      const supabase = createSupabaseBrowser();
      const { data: estateData } = await supabase
        .from("estate")
        .select("*")
        .eq("org_id", orgId)
        .order("estate_sec_cd")
        .order("estate_order");
      const estates: Estate[] = (estateData as Estate[]) || [];

      // Dynamic import ExcelJS
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();

      /* ---- Sheet 1: 수입지출보고서 총괄표 ---- */
      buildSummarySheet(wb, records, orgName || "", dateFrom, dateTo, getName);

      /* ---- Sheet 2: 재산명세서 ---- */
      buildEstateSheet(wb, estates, orgName || "");

      /* ---- Sheet 3: 재산 구분별 세부내역서 ---- */
      buildEstateDetailSheet(wb, estates, orgName || "");

      /* ---- Sheet 4: 수입지출부 표지 ---- */
      buildMainCoverSheet(
        wb,
        orgName || "",
        orgSecCd,
        acctName,
        electionName,
        districtName,
        dateFrom,
        dateTo,
        getName,
      );

      /* ---- Sheets 5~N: Per account/item combination ---- */
      // Get unique incm/acc/item combos
      const comboMap = new Map<
        string,
        { incmSecCd: number; accSecCd: number; itemSecCd: number }
      >();
      for (const r of records) {
        const key = `${r.incm_sec_cd}-${r.acc_sec_cd}-${r.item_sec_cd}`;
        if (!comboMap.has(key)) {
          comboMap.set(key, {
            incmSecCd: r.incm_sec_cd,
            accSecCd: r.acc_sec_cd,
            itemSecCd: r.item_sec_cd,
          });
        }
      }

      const combos = Array.from(comboMap.values()).sort(
        (a, b) =>
          a.incmSecCd - b.incmSecCd ||
          a.accSecCd - b.accSecCd ||
          a.itemSecCd - b.itemSecCd,
      );

      // Track which account covers we have already added
      const addedAccCovers = new Set<string>();
      let sheetNum = 0;

      for (const combo of combos) {
        const typeLabel = combo.incmSecCd === 1 ? "수입" : "지출";
        const accName = getName(combo.accSecCd);
        const itemName = getName(combo.itemSecCd);
        sheetNum++;

        // Account cover (one per incm+acc combination)
        const accCoverKey = `${combo.incmSecCd}-${combo.accSecCd}`;
        if (covers.accountCover && !addedAccCovers.has(accCoverKey)) {
          addedAccCovers.add(accCoverKey);
          const accCoverName = `${sheetNum}_계정_${typeLabel}_${accName}`.slice(0, 31);
          buildAccountCover(wb, typeLabel, accName, orgName || "", accCoverName);
        }

        // Item cover
        if (covers.subjectCover) {
          const itemCoverName = `${sheetNum}_과목_${typeLabel}_${accName}_${itemName}`.slice(0, 31);
          buildItemCover(
            wb,
            typeLabel,
            accName,
            itemName,
            orgName || "",
            itemCoverName,
          );
        }

        // Ledger detail sheet
        const sheetRecords = records.filter(
          (r) =>
            r.incm_sec_cd === combo.incmSecCd &&
            r.acc_sec_cd === combo.accSecCd &&
            r.item_sec_cd === combo.itemSecCd,
        );
        const ledgerName = `${sheetNum}_${typeLabel}_${accName}_${itemName}`.slice(0, 31);
        buildLedgerSheet(
          wb,
          sheetRecords,
          custMap,
          typeLabel,
          accName,
          itemName,
          orgName || "",
          acctName,
          electionName,
          districtName,
          ledgerName,
        );
      }

      // Download
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `보고서_${orgName}_${dateFrom}_${dateTo}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);

      const totalSheets = wb.worksheets.length;
      alert(
        `보고서가 생성되었습니다.\n\n` +
          `총 시트 수: ${totalSheets}\n` +
          `- 총괄표 1개\n` +
          `- 재산명세서 2개\n` +
          `- 표지 1개\n` +
          `- 계정/과목별 내역 ${combos.length}개 조합`,
      );
    } catch (err) {
      alert(
        `보고서 생성 실패: ${err instanceof Error ? err.message : "오류"}`,
      );
    } finally {
      setGenerating(false);
    }
  }

  function handleSingleExcel() {
    if (!orgId) return;
    window.open(`/api/excel/export?orgId=${orgId}&type=income`, "_blank");
  }

  if (codesLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        코드 데이터 로딩 중...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">보고서 및 과목별 수입지출부 출력</h2>

      <div className="bg-white rounded-lg border p-4 space-y-6">
        {/* 표지 선택 */}
        <div>
          <HelpTooltip id="report.cover">
            <Label className="text-base font-semibold">표지선택</Label>
          </HelpTooltip>
          <p className="text-xs text-gray-400 mt-1">
            별도 안내가 없으면 모두 체크하세요.
          </p>
          <div className="flex flex-wrap gap-6 mt-2">
            {[
              { key: "incomeCover" as const, label: "수입부표지" },
              { key: "expenseCover" as const, label: "지출부표지" },
              { key: "accountCover" as const, label: "계정표지" },
              { key: "subjectCover" as const, label: "과목표지" },
            ].map(({ key, label }) => (
              <label
                key={key}
                className="flex items-center gap-2 text-sm cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={covers[key]}
                  onChange={() => handleCoverChange(key)}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        {/* 선거 정보 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>선거명</Label>
            <Input
              value={electionName}
              onChange={(e) => setElectionName(e.target.value)}
              placeholder="예: 제22대 국회의원선거"
            />
          </div>
          <div>
            <Label>선거구명</Label>
            <Input
              value={districtName}
              onChange={(e) => setDistrictName(e.target.value)}
              placeholder="예: 서울특별시 종로구"
            />
          </div>
        </div>

        {/* 기간 설정 */}
        <div>
          <Label className="text-base font-semibold">기간 설정</Label>
          <div className="flex items-center gap-2 mt-2">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-48"
            />
            <span className="text-gray-500">~</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-48"
            />
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex gap-2 pt-4 border-t">
          <HelpTooltip id="report.batch-print">
            <Button onClick={handleBatchExcel} disabled={generating}>
              {generating ? "생성 중..." : "보고서 일괄출력 (엑셀)"}
            </Button>
          </HelpTooltip>
          <Button variant="outline" onClick={handleSingleExcel}>
            수입부 개별출력
          </Button>
        </div>
      </div>

      {/* 안내 */}
      <div className="bg-blue-50 rounded-lg border border-blue-200 p-4 text-sm text-blue-700 space-y-1">
        <p>
          현재 사용기관: <b>{orgName || "미선택"}</b>
        </p>
        <p>
          일괄출력: 총 7종 보고서(총괄표, 재산명세서, 세부내역서, 표지,
          계정/과목별 수입지출부)를 하나의 엑셀 파일로 생성합니다.
        </p>
        <p>개별출력: 수입부를 개별 엑셀 파일로 다운로드합니다.</p>
      </div>
    </div>
  );
}
