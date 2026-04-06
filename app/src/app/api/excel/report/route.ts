import { NextRequest, NextResponse } from "next/server";
import { generateReport } from "@/lib/excel-template";
import type { ReportType } from "@/lib/excel-template";

const VALID_REPORT_TYPES: ReportType[] = [
  "income-expense-report",
  "audit-opinion",
  "review-resolution",
  "accounting-report",
  "ledger",
];

const REPORT_FILENAMES: Record<ReportType, string> = {
  "income-expense-report": "정치자금_수입지출보고서",
  "audit-opinion": "감사의견서",
  "review-resolution": "심사의결서",
  "accounting-report": "회계보고서",
  ledger: "수입지출부",
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const reportType = searchParams.get("reportType") as ReportType | null;
  const orgId = searchParams.get("orgId");

  if (!reportType || !orgId) {
    return NextResponse.json(
      { error: "reportType and orgId are required" },
      { status: 400 },
    );
  }

  if (!VALID_REPORT_TYPES.includes(reportType)) {
    return NextResponse.json(
      { error: `Invalid reportType. Valid: ${VALID_REPORT_TYPES.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const buffer = await generateReport({
      reportType,
      orgId,
      accSecCd: searchParams.get("accSecCd") ?? undefined,
      itemSecCd: searchParams.get("itemSecCd") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
    });

    const baseName = REPORT_FILENAMES[reportType] || reportType;
    const fileName = encodeURIComponent(`${baseName}.xlsx`);

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[excel/report] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
