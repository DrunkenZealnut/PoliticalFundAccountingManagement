/* ------------------------------------------------------------------ */
/*  정치자금 수입·지출보고서(서식 22-1) 총괄 모델 — 단일 SSOT             */
/*                                                                    */
/*  raw acc_book 행 → (후보자면) buildLedgerRows(Pass0→1→2)로 보고 시점   */
/*  (계정×과목) 분할 → buildReportSummaryModel 로 자금원 4분류 집계.      */
/*  HWPX 22-1(api/hwpx/accounting-report)·reports 총괄과 동일 로직을      */
/*  공유해, 같은 데이터면 수치가 항상 일치한다(병렬 집계 금지).            */
/*                                                                    */
/*  주의(docs/05-reference/정치자금_수입지출부_생성_주의사항.md):         */
/*   - 선거비용/외는 과목명(classifyExpenseCategory)로만 분류 — cv_id     */
/*     하드코딩 금지(시스템에 '선거비용' 과목이 86·19 둘 존재).          */
/*   - 자금원은 classifyFundingSource(82~85) — 코드명 includes 금지.      */
/*   - acc_book은 실거래 원본, 분할은 이 생성 함수 안에서만.              */
/* ------------------------------------------------------------------ */
import { buildLedgerRows } from "./ledger-allocation";
import { adjustNegativeIncome } from "./adjust-negative-income";
import { FUNDING_SOURCE_BY_ACC_SEC_CD } from "./funding-source";
import type { ReallocRow } from "./fund-realloc";
import {
  buildReportSummaryModel,
  type ReportSummaryInputRow,
  type ReportSummaryModel,
} from "@/lib/hwpx/report-summary-builder";

/** 22-1 총괄에 필요한 acc_book 조회 최소 필드. */
export interface ReportSummaryRawRow {
  acc_book_id: number;
  incm_sec_cd: number; // 1=수입, 2=지출
  acc_sec_cd: number; // 자금원(후보자 82~85) 또는 기타
  item_sec_cd: number; // 과목(선거비용 86 / 선거비용외 87 …)
  acc_amt: number;
  acc_date: string; // YYYYMMDD
  acc_time?: string | null; // HHmm, 미입력 NULL
}

/** 후보자 자금원 계정(82~85) 여부 — funding-source SSOT 재사용(로컬 상수 중복 금지). */
function hasCandidateFundingSource(rows: ReportSummaryRawRow[]): boolean {
  return rows.some((r) => FUNDING_SOURCE_BY_ACC_SEC_CD[Number(r.acc_sec_cd)] !== undefined);
}

/**
 * raw acc_book 행 → 후보자 보고 시점 (계정×과목) 배분 행. page 총괄·HWPX 22-1/22-2/22-4 공유 SSOT.
 *  1) acc_amt(NUMERIC→문자열 직렬화) 숫자화 — 문자열 연결 방지(비후보자 경로 G4).
 *  2) adjustNegativeIncome(음수수입→지출, 보편) — 후보자 여부 무관(멱등).
 *  3) 후보자(자금원 82~85)면 buildLedgerRows(Pass1 자금원재배분[과목 불변]·Pass2 과목배분)로 분할 후
 *     acc_book_id로 원본 메타 재조인, 비후보자면 그대로.
 * 제네릭이라 호출부의 메타(content·rcp_no·cust_id·customer 등)를 보존한다.
 */
export function allocateCandidateLedgerRows<T extends ReportSummaryRawRow>(rawRows: T[]): T[] {
  const normalized = rawRows.map((r) => ({ ...r, acc_amt: Number(r.acc_amt) }));
  const p0 = adjustNegativeIncome(normalized);
  if (!hasCandidateFundingSource(p0)) return p0;

  const origById = new Map(p0.map((r) => [r.acc_book_id, r] as const));
  const input: ReallocRow[] = p0.map((r) => ({
    acc_book_id: r.acc_book_id,
    incm_sec_cd: r.incm_sec_cd,
    acc_sec_cd: r.acc_sec_cd,
    item_sec_cd: r.item_sec_cd,
    acc_date: r.acc_date,
    acc_time: r.acc_time ?? null,
    acc_amt: r.acc_amt,
    content: null,
    rcp_no: null,
    bigo: null,
    cust_id: 0,
    customer: null,
  }));
  return buildLedgerRows(input).map((lr) => ({
    ...origById.get(lr.acc_book_id)!,
    acc_sec_cd: lr.accSecCd,
    item_sec_cd: lr.itemSecCd,
    acc_amt: lr.amt,
    incm_sec_cd: lr.incm_sec_cd,
  })) as T[];
}

/**
 * raw acc_book 행 → 22-1 수입·지출보고서 총괄 모델.
 *
 * 후보자(자금원 82~85 거래 존재) 시 `buildLedgerRows`(Pass0 음수수입 정규화 →
 * Pass1 자금원 재배분[과목 불변] → Pass2 과목 배분)로 (계정×과목)을 분할한 뒤
 * 자금원 4분류로 집계한다. 비후보자는 분할 없이 raw 그대로 집계한다.
 * `api/hwpx/accounting-report`(22-1)와 동일 로직 → 수치 일치 보장.
 */
export function buildCandidateReportSummary(
  rawRows: ReportSummaryRawRow[],
  getName: (cvId: number) => string,
): ReportSummaryModel {
  const summaryRows: ReportSummaryInputRow[] = allocateCandidateLedgerRows(rawRows).map((r) => ({
    incm_sec_cd: r.incm_sec_cd,
    acc_sec_cd: r.acc_sec_cd,
    item_sec_cd: r.item_sec_cd,
    acc_amt: r.acc_amt,
  }));
  return buildReportSummaryModel(summaryRows, getName);
}
