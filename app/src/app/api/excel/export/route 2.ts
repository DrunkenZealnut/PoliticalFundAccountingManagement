import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get("orgId");
  const type = request.nextUrl.searchParams.get("type"); // income or expense or summary

  if (!orgId) {
    return NextResponse.json({ error: "orgId required" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: "pfam" } }
  );

  // 수입 또는 지출 데이터 조회
  const incmSecCd = type === "expense" ? 2 : 1;
  const { data: records } = await supabase
    .from("acc_book")
    .select("*, customer(name, reg_num, addr, job, tel)")
    .eq("org_id", Number(orgId))
    .eq("incm_sec_cd", incmSecCd)
    .order("acc_date")
    .order("acc_sort_num");

  if (!records) {
    return NextResponse.json({ error: "No data" }, { status: 404 });
  }

  // 엑셀 생성
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("수입지출부");

  // 헤더
  sheet.mergeCells("A2:N2");
  const titleCell = sheet.getCell("A2");
  titleCell.value = "정 치 자 금  수 입 · 지 출 부";
  titleCell.font = { bold: true, size: 15 };
  titleCell.alignment = { horizontal: "center" };

  // 컬럼 헤더 (Row 5-8)
  const headers = [
    "년월일", "내역", "수입액 금회", "수입액 누계",
    "지출액 금회", "지출액 누계", "잔액",
    "성명", "생년월일", "주소", "직업", "전화번호",
    "영수증번호", "비고",
  ];
  const headerRow = sheet.getRow(5);
  headers.forEach((h, i) => {
    headerRow.getCell(i + 1).value = h;
    headerRow.getCell(i + 1).font = { bold: true };
  });

  // 데이터
  let incCum = 0;
  let expCum = 0;
  let rowIdx = 9;

  for (const r of records as Record<string, unknown>[]) {
    const customer = r.customer as Record<string, string> | null;
    const amt = r.acc_amt as number;
    const isIncome = (r.incm_sec_cd as number) === 1;
    const date = r.acc_date as string;

    if (isIncome) incCum += amt;
    else expCum += amt;

    const row = sheet.getRow(rowIdx);
    row.getCell(1).value = date.length === 8
      ? `${date.slice(4, 6)}-${date.slice(6, 8)}-${date.slice(2, 4)}`
      : date;
    row.getCell(2).value = r.content as string;
    row.getCell(3).value = isIncome ? amt : null;
    row.getCell(3).numFmt = "#,##0";
    row.getCell(4).value = incCum;
    row.getCell(4).numFmt = "#,##0";
    row.getCell(5).value = !isIncome ? amt : null;
    row.getCell(5).numFmt = "#,##0";
    row.getCell(6).value = expCum;
    row.getCell(6).numFmt = "#,##0";
    row.getCell(7).value = incCum - expCum;
    row.getCell(7).numFmt = "#,##0";
    row.getCell(8).value = customer?.name || "";
    row.getCell(9).value = customer?.reg_num || "";
    row.getCell(10).value = customer?.addr || "";
    row.getCell(11).value = customer?.job || "";
    row.getCell(12).value = customer?.tel || "";
    row.getCell(13).value = r.rcp_no as string || "";
    row.getCell(14).value = r.bigo as string || "";
    rowIdx++;
  }

  // 엑셀 버퍼 생성
  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${type || "income"}_${orgId}.xlsx"`,
    },
  });
}
