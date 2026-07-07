/**
 * 제출 마법사 공유 타입 — 셸(page)이 로드해 각 스텝에 내려주는 데이터.
 * 수치 계산은 전부 기존 SSOT(submission-readiness·settlement-summary·
 * reimbursement-aggregator)가 담당하고, 여기는 운반 타입만 정의한다.
 */
import type { OrgPeriod } from "@/lib/accounting/acc-period";
import type { Estate } from "@/lib/excel-template/build-report-workbook";

export type WizardTrack = "report" | "reimburse";

/** /api/acc-book GET(SELECT *) 행 — 마법사가 쓰는 최소 필드 + 나머지 통과. */
export interface WizardAccRow {
  acc_book_id: number;
  incm_sec_cd: number;
  acc_sec_cd: number;
  item_sec_cd: number;
  acc_amt: number;
  acc_date: string;
  claim_amt?: number | null;
  acc_print_ok?: string | null;
  [key: string]: unknown;
}

export interface WizardData {
  records: WizardAccRow[];
  period: OrgPeriod;
  /** estate 전체 행(Excel 재산명세 시트용, estate_sec_cd·estate_order 정렬) */
  estates: (Estate & { estate_order?: number | null })[];
  /** estate_sec_cd=47(현금및예금) 합계 — estateAmount SSOT */
  estateCashAmount: number;
  estateCount: number;
  /** cv_name === "선거비용" 인 과목 cv_id 들 (reimbursement 페이지와 동일 규칙) */
  electionExpenseItemCds: number[];
  accSecCdNames: Record<number, string>;
}
