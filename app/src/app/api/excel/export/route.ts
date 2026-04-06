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
  const { data: organ } = await supabase.from("organ").select("org_name, org_sec_cd, acct_name").eq("org_id", Number(orgId)).single();

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

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("수입지출부");

  // --- Title ---
  sheet.mergeCells("A1:O1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = "정 치 자 금  수 입 · 지 출 부";
  titleCell.font = { bold: true, size: 16 };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  // --- 금액단위 ---
  sheet.mergeCells("N2:O2");
  sheet.getCell("N2").value = "(금액단위 : 원)";
  sheet.getCell("N2").alignment = { horizontal: "right" };
  sheet.getCell("N2").font = { size: 9 };

  // --- 계정/과목 정보 ---
  const accName = accSecCd ? codes[Number(accSecCd)] || "" : "";
  const itemName = itemSecCd ? codes[Number(itemSecCd)] || "" : "";

  sheet.mergeCells("A3:O3");
  const infoCell = sheet.getCell("A3");
  if (accName && itemName) {
    infoCell.value = `[계 정 명 : ${accName}]  [과 목 명 : ${itemName}]`;
  } else if (accName) {
    infoCell.value = `[계 정 명 : ${accName}]`;
  } else {
    infoCell.value = `[전체 ${type === "expense" ? "지출" : "수입"} 내역]`;
  }
  infoCell.font = { bold: true, size: 11 };

  // --- Column headers (Row 5-6, 2-row merged structure) ---
  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: "thin" }, bottom: { style: "thin" },
    left: { style: "thin" }, right: { style: "thin" },
  };
  const headerFont: Partial<ExcelJS.Font> = { bold: true, size: 9 };
  const centerAlign: Partial<ExcelJS.Alignment> = { horizontal: "center", vertical: "middle", wrapText: true };

  // Row 5 headers (merged with Row 6)
  const h5 = sheet.getRow(5);
  const h6 = sheet.getRow(6);

  // A: 년월일
  sheet.mergeCells("A5:A6");
  h5.getCell(1).value = "년월일";

  // B: 내역
  sheet.mergeCells("B5:B6");
  h5.getCell(2).value = "내 역";

  // C-D: 수입액
  sheet.mergeCells("C5:D5");
  h5.getCell(3).value = "수 입 액";
  h6.getCell(3).value = "금회";
  h6.getCell(4).value = "누계";

  // E-F: 지출액
  sheet.mergeCells("E5:F5");
  h5.getCell(5).value = "지 출 액";
  h6.getCell(5).value = "금회";
  h6.getCell(6).value = "누계";

  // G: 잔액
  sheet.mergeCells("G5:G6");
  h5.getCell(7).value = "잔 액";

  // H-M: 수입을 제공한 자 또는 지출을 받은 자
  sheet.mergeCells("H5:M5");
  h5.getCell(8).value = "수입을 제공한 자 또는 지출을 받은 자";
  h6.getCell(8).value = "성 명\n(법인·단체명)";
  h6.getCell(9).value = "생년월일\n(사업자번호)";
  h6.getCell(10).value = "주소 또는 사무소소재지";
  h6.getCell(11).value = "직업\n(업종)";
  h6.getCell(12).value = "전화번호";

  // N: 영수증일련번호
  sheet.mergeCells("N5:N6");
  h5.getCell(14).value = "영수증\n일련번호";

  // O: 비고
  sheet.mergeCells("O5:O6");
  h5.getCell(15).value = "비 고";

  // Apply header styles
  for (let row = 5; row <= 6; row++) {
    for (let col = 1; col <= 15; col++) {
      const cell = sheet.getRow(row).getCell(col);
      cell.font = headerFont;
      cell.alignment = centerAlign;
      cell.border = thinBorder;
    }
  }

  // Column widths
  sheet.getColumn(1).width = 10;  // 년월일
  sheet.getColumn(2).width = 18;  // 내역
  sheet.getColumn(3).width = 12;  // 수입금회
  sheet.getColumn(4).width = 12;  // 수입누계
  sheet.getColumn(5).width = 12;  // 지출금회
  sheet.getColumn(6).width = 12;  // 지출누계
  sheet.getColumn(7).width = 12;  // 잔액
  sheet.getColumn(8).width = 12;  // 성명
  sheet.getColumn(9).width = 12;  // 생년월일
  sheet.getColumn(10).width = 20; // 주소
  sheet.getColumn(11).width = 8;  // 직업
  sheet.getColumn(12).width = 14; // 전화번호
  sheet.getColumn(14).width = 10; // 영수증번호
  sheet.getColumn(15).width = 8;  // 비고

  // --- Data rows ---
  let incCum = 0;
  let expCum = 0;
  let rowIdx = 7;

  for (const r of records as Record<string, unknown>[]) {
    const customer = r.customer as Record<string, string> | null;
    const amt = r.acc_amt as number;
    const isIncome = (r.incm_sec_cd as number) === 1;
    const date = r.acc_date as string;

    if (isIncome) incCum += amt;
    else expCum += amt;

    const row = sheet.getRow(rowIdx);
    // 년월일: YYYY/MM/DD format
    row.getCell(1).value = date.length === 8
      ? `${date.slice(0, 4)}/${date.slice(4, 6)}/${date.slice(6, 8)}`
      : date;
    row.getCell(2).value = r.content as string;
    row.getCell(3).value = isIncome ? amt : null;
    row.getCell(4).value = isIncome ? incCum : null;
    row.getCell(5).value = !isIncome ? amt : null;
    row.getCell(6).value = !isIncome ? expCum : null;
    row.getCell(7).value = incCum - expCum;
    row.getCell(8).value = customer?.name || "";
    row.getCell(9).value = customer?.reg_num || "";
    row.getCell(10).value = customer?.addr || "";
    row.getCell(11).value = customer?.job || "";
    row.getCell(12).value = customer?.tel || "";
    row.getCell(14).value = r.rcp_no as string || "";
    row.getCell(15).value = r.bigo as string || "";

    // Apply styles
    for (let col = 1; col <= 15; col++) {
      const cell = row.getCell(col);
      cell.border = thinBorder;
      cell.font = { size: 9 };
      if ([3, 4, 5, 6, 7].includes(col)) {
        cell.numFmt = "#,##0";
        cell.alignment = { horizontal: "right" };
      }
    }
    rowIdx++;
  }

  // --- Footer: 작성연월일 + 기관명 + 회계책임자 ---
  rowIdx += 1;
  const today = new Date();
  const dateStr = `${today.getFullYear()}년 ${String(today.getMonth() + 1).padStart(2, "0")}월 ${String(today.getDate()).padStart(2, "0")}일`;

  sheet.mergeCells(`A${rowIdx}:O${rowIdx}`);
  const footerCell = sheet.getCell(`A${rowIdx}`);
  footerCell.value = `작성연월일 : ${dateStr}`;
  footerCell.alignment = { horizontal: "right" };

  rowIdx += 1;
  sheet.mergeCells(`A${rowIdx}:O${rowIdx}`);
  const orgCell = sheet.getCell(`A${rowIdx}`);
  orgCell.value = `${organ?.org_name || ""}   회계책임자  ${organ?.acct_name || ""}  (인)`;
  orgCell.alignment = { horizontal: "center" };

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  const fileName = encodeURIComponent(`정치자금수입지출부_${accName || "전체"}_${itemName || ""}.xlsx`);

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
