import type { TemplateMappingConfig, ReportType, DynamicRowMapping } from "../types";
import { incomeExpenseReportMapping } from "./income-expense-report";
import { auditOpinionMapping } from "./audit-opinion";
import { reviewResolutionMapping } from "./review-resolution";
import { accountingReportMapping } from "./accounting-report";
import { ledgerMapping, LEDGER_TEMPLATES } from "./ledger-common";

const FIXED_MAPPINGS: Record<string, TemplateMappingConfig> = {
  "income-expense-report": incomeExpenseReportMapping,
  "audit-opinion": auditOpinionMapping,
  "review-resolution": reviewResolutionMapping,
  "accounting-report": accountingReportMapping,
};

/**
 * reportType + accSecCd/itemSecCd 조합으로 매핑 설정을 반환
 */
export function getMappingConfig(
  reportType: ReportType,
  accSecCdName?: string,
  itemSecCdName?: string,
): TemplateMappingConfig {
  // 고정셀 보고서
  if (reportType !== "ledger") {
    const mapping = FIXED_MAPPINGS[reportType];
    if (!mapping) throw new Error(`Unknown report type: ${reportType}`);
    return mapping;
  }

  // 동적행 수입지출부: 계정+항목으로 템플릿 파일 결정
  if (!accSecCdName || !itemSecCdName) {
    throw new Error("ledger report requires accSecCdName and itemSecCdName");
  }

  const entry = LEDGER_TEMPLATES.find(
    (t) => t.accSecCdName === accSecCdName && t.itemSecCdName === itemSecCdName,
  );

  if (!entry) {
    // fallback: 첫 번째 수입지출부 템플릿 사용
    const fallback = LEDGER_TEMPLATES[0];
    const config: DynamicRowMapping = {
      ...ledgerMapping,
      id: `ledger-${accSecCdName}-${itemSecCdName}`,
      templateFile: fallback.templateFile,
    };
    return config;
  }

  const config: DynamicRowMapping = {
    ...ledgerMapping,
    id: `ledger-${entry.accSecCdName}-${entry.itemSecCdName}`,
    templateFile: entry.templateFile,
  };
  return config;
}

export { LEDGER_TEMPLATES };
