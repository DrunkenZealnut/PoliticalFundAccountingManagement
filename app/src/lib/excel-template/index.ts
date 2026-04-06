import { loadTemplate } from "./template-loader";
import { bindFixedCells } from "./cell-binder";
import { bindDynamicRows } from "./row-binder";
import { queryReportData } from "./data-query";
import { getMappingConfig } from "./mappings";
import type { ReportRequest, LedgerRow } from "./types";

export type { ReportType, ReportRequest } from "./types";

/**
 * 선관위 템플릿 기반 보고서 생성 메인 함수
 *
 * 1. 매핑 설정 선택 (reportType → 셀 매핑)
 * 2. 템플릿 파일 로드 (XLS/XLSX → ExcelJS Workbook)
 * 3. DB 데이터 조회
 * 4. 데이터 바인딩 (고정셀 or 동적행)
 * 5. Buffer 출력
 */
export async function generateReport(req: ReportRequest): Promise<Buffer> {
  // 1. 매핑 설정 선택
  const mapping = getMappingConfig(
    req.reportType,
    req.accSecCd,
    req.itemSecCd,
  );

  // 2. 템플릿 로드
  const workbook = await loadTemplate(mapping.templateFile);

  // 3. 데이터 조회
  const data = await queryReportData(req);

  // 4. 데이터 바인딩
  const worksheet = workbook.getWorksheet(mapping.sheet);
  if (!worksheet) {
    // sheet 이름이 다를 수 있으므로 첫 번째 시트 fallback
    const firstSheet = workbook.worksheets[0];
    if (!firstSheet) throw new Error("No worksheets in template");

    if (mapping.type === "fixed") {
      bindFixedCells(firstSheet, mapping, data);
    } else {
      bindDynamicRows(
        firstSheet,
        mapping,
        data as { header: Record<string, unknown>; rows: LedgerRow[] },
      );
    }
  } else {
    if (mapping.type === "fixed") {
      bindFixedCells(worksheet, mapping, data);
    } else {
      bindDynamicRows(
        worksheet,
        mapping,
        data as { header: Record<string, unknown>; rows: LedgerRow[] },
      );
    }
  }

  // 5. Buffer 출력
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
