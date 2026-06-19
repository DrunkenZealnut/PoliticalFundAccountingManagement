import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { db: { schema: "pfam" } }
);

// Code name cache
let codeCache: Record<number, string> | null = null;
async function getCodeNames(): Promise<Record<number, string>> {
  if (codeCache) return codeCache;
  const { data } = await supabase.from("codevalue").select("cv_id, cv_name");
  codeCache = {};
  for (const r of data || []) codeCache[r.cv_id] = r.cv_name;
  return codeCache;
}

/* ------------------------------------------------------------------ */
/*  Common styles                                                      */
/* ------------------------------------------------------------------ */
const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin" }, bottom: { style: "thin" },
  left: { style: "thin" }, right: { style: "thin" },
};
const baseFont: Partial<ExcelJS.Font> = {
  size: 11, name: "맑은 고딕", family: 2, charset: 129,
};
const centerAlign: Partial<ExcelJS.Alignment> = {
  horizontal: "center", vertical: "middle",
};

function fmtDate(d: string) {
  if (d.length === 8) return `${d.slice(0, 4)}/${d.slice(4, 6)}/${d.slice(6, 8)}`;
  return d;
}

function todayStr() {
  const t = new Date();
  return `${t.getFullYear()}년 ${String(t.getMonth() + 1).padStart(2, "0")}월 ${String(t.getDate()).padStart(2, "0")}일`;
}

/* ------------------------------------------------------------------ */
/*  수입부 / 지출부 (공식 양식)                                         */
/* ------------------------------------------------------------------ */
function generateLedgerBook(
  workbook: ExcelJS.Workbook,
  records: Record<string, unknown>[],
  organ: { org_name: string; acct_name: string } | null,
  itemName: string,
  isExpense: boolean,
) {
  const typeLabel = isExpense ? "지  출  부" : "수  입  부";
  const sheetName = isExpense ? "지출부" : "수입부";
  const sheet = workbook.addWorksheet(sheetName);

  // Column widths (matching official template; E,H left at default)
  sheet.getColumn(1).width = 3.5;
  sheet.getColumn(2).width = 7.125;
  sheet.getColumn(3).width = 6.5;
  sheet.getColumn(4).width = 6.5;
  // col E: default
  sheet.getColumn(6).width = 6.5;
  sheet.getColumn(7).width = 6.5;
  // col H: default
  sheet.getColumn(9).width = 6.5;
  sheet.getColumn(10).width = 6.5;
  sheet.getColumn(11).width = 11;

  /* Row 2: Title */
  sheet.mergeCells("A2:K2");
  const titleCell = sheet.getCell("A2");
  titleCell.value = `${organ?.org_name || ""}의  ${typeLabel} (${itemName})`;
  titleCell.font = { ...baseFont, bold: true, size: 14 };
  titleCell.alignment = centerAlign;
  sheet.getRow(2).height = 39.95;

  /* Row 4: Subject */
  sheet.mergeCells("A4:K4");
  const subjectCell = sheet.getCell("A4");
  subjectCell.value = `[과 목 명: ${itemName}]`;
  subjectCell.font = { ...baseFont };
  subjectCell.alignment = centerAlign;

  /* Row 5-6: Headers */
  sheet.mergeCells("A5:B6"); // 연월일
  sheet.mergeCells("C5:G5"); // 적 요
  sheet.mergeCells("H5:H6"); // 전화번호
  sheet.mergeCells("I5:I6"); // 금 액
  sheet.mergeCells("J5:J6"); // 누 계
  sheet.mergeCells("K5:K6"); // 영수증번호

  const h5 = sheet.getRow(5);
  h5.getCell(1).value = "연월일";
  h5.getCell(3).value = "적                요";
  h5.getCell(8).value = "전화번호";
  h5.getCell(9).value = "금  액";
  h5.getCell(10).value = "누  계";
  h5.getCell(11).value = "영수증번호";

  const h6 = sheet.getRow(6);
  h6.getCell(3).value = "내  역";
  h6.getCell(4).value = "성  명";
  h6.getCell(5).value = "생년월일";
  h6.getCell(6).value = "주  소";
  h6.getCell(7).value = "직  업";

  sheet.getRow(5).height = 20.1;
  sheet.getRow(6).height = 20.1;

  // Apply header styles
  for (let row = 5; row <= 6; row++) {
    for (let col = 1; col <= 11; col++) {
      const cell = sheet.getRow(row).getCell(col);
      cell.font = { ...baseFont };
      cell.alignment = centerAlign;
      cell.border = thinBorder;
    }
  }

  /* Data rows */
  let rowIdx = 7;
  let cumulative = 0;
  let rcpYCount = 0, rcpNCount = 0;
  let rcpYAmt = 0, rcpNAmt = 0;
  const totalCount = records.length;

  for (const r of records) {
    const customer = r.customer as Record<string, string> | null;
    const amt = r.acc_amt as number;
    const date = r.acc_date as string;
    const rcpYn = (r.rcp_yn as string) || "N";
    cumulative += amt;

    if (rcpYn === "Y") { rcpYCount++; rcpYAmt += amt; }
    else { rcpNCount++; rcpNAmt += amt; }

    sheet.mergeCells(`A${rowIdx}:B${rowIdx}`);
    const row = sheet.getRow(rowIdx);
    row.height = 20.1;
    row.getCell(1).value = fmtDate(date);
    row.getCell(3).value = r.content as string;
    row.getCell(4).value = customer?.name || "";
    row.getCell(5).value = customer?.reg_num || "";
    row.getCell(6).value = customer?.addr || "";
    row.getCell(7).value = customer?.job || "";
    row.getCell(8).value = customer?.tel || "";
    row.getCell(9).value = amt;
    row.getCell(10).value = cumulative;
    row.getCell(11).value = rcpYn === "Y" ? (r.rcp_no as string || "") : "생략";

    for (let col = 1; col <= 11; col++) {
      const cell = row.getCell(col);
      cell.font = { ...baseFont, size: 10 };
      cell.border = thinBorder;
      if (col === 9 || col === 10) {
        cell.numFmt = "#,##0";
        cell.alignment = { horizontal: "right", vertical: "middle" };
      } else {
        cell.alignment = { vertical: "middle" };
      }
    }
    rowIdx++;
  }

  /* 합계 row */
  sheet.mergeCells(`A${rowIdx}:B${rowIdx}`);
  const sumRow = sheet.getRow(rowIdx);
  sumRow.getCell(1).value = "합 계";
  sumRow.getCell(9).value = cumulative;
  sumRow.getCell(10).value = cumulative;
  sumRow.getCell(11).value = `${totalCount}건`;
  for (let col = 1; col <= 11; col++) {
    const cell = sumRow.getCell(col);
    cell.font = { ...baseFont, bold: true };
    cell.border = thinBorder;
    cell.alignment = col === 1 ? centerAlign : (col === 9 || col === 10)
      ? { horizontal: "right", vertical: "middle" } : { vertical: "middle" };
    if (col === 9 || col === 10) cell.numFmt = "#,##0";
  }
  rowIdx++;

  /* 영수증 첨부분 / 생략분 */
  const rcpStartRow = rowIdx;
  sheet.mergeCells(`A${rcpStartRow}:A${rcpStartRow + 1}`);

  // 영수증 첨부분
  const attachRow = sheet.getRow(rcpStartRow);
  attachRow.height = 33;
  attachRow.getCell(1).value = "영\r\n수\r\n증";
  attachRow.getCell(2).value = "첨부분";
  attachRow.getCell(9).value = rcpYAmt;
  attachRow.getCell(11).value = `${rcpYCount}건`;

  // 영수증 생략분
  const skipRow = sheet.getRow(rcpStartRow + 1);
  skipRow.height = 33;
  skipRow.getCell(2).value = "생략분";
  skipRow.getCell(9).value = rcpNAmt;
  skipRow.getCell(11).value = `${rcpNCount}건`;

  for (let r = rcpStartRow; r <= rcpStartRow + 1; r++) {
    for (let col = 1; col <= 11; col++) {
      const cell = sheet.getRow(r).getCell(col);
      cell.font = { ...baseFont };
      cell.border = thinBorder;
      cell.alignment = (col === 9 || col === 10)
        ? { horizontal: "right", vertical: "middle", wrapText: true }
        : { ...centerAlign, wrapText: true };
      if (col === 9) cell.numFmt = "#,##0";
    }
  }
  rowIdx = rcpStartRow + 2;

  /* Footer */
  rowIdx += 1; // empty row
  sheet.mergeCells(`F${rowIdx}:K${rowIdx}`);
  const dateCell = sheet.getCell(`F${rowIdx}`);
  dateCell.value = `작성연월일  :  ${todayStr()}`;
  dateCell.alignment = { horizontal: "right", vertical: "middle" };
  dateCell.font = { ...baseFont };

  rowIdx += 1;
  sheet.mergeCells(`F${rowIdx}:K${rowIdx}`);
  const orgCell = sheet.getCell(`F${rowIdx}`);
  orgCell.value = `${organ?.org_name || ""}  회계책임자  ${organ?.acct_name || ""}  (인)`;
  orgCell.alignment = centerAlign;
  orgCell.font = { ...baseFont };
}

/* ------------------------------------------------------------------ */
/*  GET handler                                                        */
/* ------------------------------------------------------------------ */
export async function GET(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get("orgId");
  const type = request.nextUrl.searchParams.get("type"); // income or expense
  const accSecCd = request.nextUrl.searchParams.get("accSecCd");
  const itemSecCd = request.nextUrl.searchParams.get("itemSecCd");

  if (!orgId) {
    return NextResponse.json({ error: "orgId required" }, { status: 400 });
  }

  const codes = await getCodeNames();

  // Get organ info
  const { data: organ } = await supabase
    .from("organ")
    .select("org_name, org_sec_cd, acct_name")
    .eq("org_id", Number(orgId))
    .single();

  const incmSecCd = type === "expense" ? 2 : 1;

  // Build query
  let query = supabase
    .from("acc_book")
    .select("*, customer:cust_id(name, reg_num, addr, job, tel)")
    .eq("org_id", Number(orgId))
    .eq("incm_sec_cd", incmSecCd);

  if (accSecCd) query = query.eq("acc_sec_cd", Number(accSecCd));
  if (itemSecCd) query = query.eq("item_sec_cd", Number(itemSecCd));

  const { data: records } = await query.order("acc_date").order("acc_sort_num");

  if (!records || records.length === 0) {
    return NextResponse.json({ error: "No data" }, { status: 404 });
  }

  const itemName = itemSecCd ? codes[Number(itemSecCd)] || "전체" : "전체";
  const isExpense = type === "expense";

  const workbook = new ExcelJS.Workbook();
  generateLedgerBook(
    workbook,
    records as Record<string, unknown>[],
    organ as { org_name: string; acct_name: string } | null,
    itemName,
    isExpense,
  );

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  const typeStr = isExpense ? "지출부" : "수입부";
  const fileName = encodeURIComponent(`${typeStr}_${itemName}.xlsx`);

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
