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
import { isFundingSourceAccSecCd } from "./funding-source";
import { reallocateFundSources, type ReallocRow, type Shortfall } from "./fund-realloc";
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
}

/** 후보자 자금원 계정(82~85) 여부 — funding-source SSOT predicate 재사용. */
function hasCandidateFundingSource(rows: ReportSummaryRawRow[]): boolean {
  return rows.some((r) => isFundingSourceAccSecCd(Number(r.acc_sec_cd)));
}

/**
 * 후보자 배분/진단 공통 전처리: acc_amt 숫자화 + Pass0(음수수입→지출, 멱등).
 * `isCandidate=false`면 후보자 자금원(82~85) 거래가 없어 배분 대상이 아니다(호출부가 분기).
 */
function preprocessCandidate<T extends ReportSummaryRawRow>(
  rawRows: T[],
): { p0: T[]; isCandidate: boolean } {
  const p0 = adjustNegativeIncome(rawRows.map((r) => ({ ...r, acc_amt: Number(r.acc_amt) })));
  return { p0, isCandidate: hasCandidateFundingSource(p0) };
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
  const { p0, isCandidate } = preprocessCandidate(rawRows);
  if (!isCandidate) return p0;

  const origById = new Map(p0.map((r) => [r.acc_book_id, r] as const));
  return buildLedgerRows(toReallocInput(p0)).map((lr) => ({
    ...origById.get(lr.acc_book_id)!,
    acc_sec_cd: lr.accSecCd,
    item_sec_cd: lr.itemSecCd,
    acc_amt: lr.amt,
    incm_sec_cd: lr.incm_sec_cd,
    acc_date: lr.acc_date, // Pass4 이동 날짜(누계잔액≥0). 미전파 시 HWPX 22-4가 원 날짜로 음수 누계.
  })) as T[];
}

/**
 * raw acc_book 행 → 통장(현금풀) 부족 진단. 정상 데이터(통장 잔액 ≥ 0)면 빈 배열.
 *
 * `allocateCandidateLedgerRows`와 **동일한 전처리**(acc_amt 숫자화 + Pass0 음수수입 정규화 +
 * 후보자 자금원 판정)를 거친 뒤 Pass1(`reallocateFundSources`)의 `shortfalls`만 추출한다.
 * 통장 전체 부족(총지출 > 총수입 = 데이터 오류)일 때만 비어있지 않다. 순수·멱등·사이드이펙트 없음.
 * 행을 반환하는 SSOT(`buildLedgerRows`)의 시그니처는 건드리지 않고, 폐기되던 shortfall 신호만 재노출한다.
 */
export function detectCandidateShortfalls<T extends ReportSummaryRawRow>(rawRows: T[]): Shortfall[] {
  const { p0, isCandidate } = preprocessCandidate(rawRows);
  if (!isCandidate) return [];
  // 통장 부족(Pass1, 총액<0) + 과목 구조적 잔여(총액=0인데 과목 음수, 주로 환급) — 둘 다 표면화.
  return [...reallocateFundSources(toReallocInput(p0)).shortfalls, ...detectItemResiduals(rawRows)];
}

/**
 * 재배분(buildLedgerRows) 후에도 (계정×과목) 잔액이 0으로 정리되지 않은 잔여를 표면화.
 * **자금원 총액이 0인데** 한 과목이 음수로 남는 경우(주로 환급이 과목에 갇혀 구조적으로 0 불가 —
 * `item-balance-zero.ts` 헤더 참조)를 `Shortfall`(itemSecCd 포함)로 반환한다. 은폐·plug 금지.
 * 통장 부족(총액<0)은 Pass1 `shortfalls`가 담당하므로 여기선 총액=0인 자금원만 본다(중복 방지).
 */
export function detectItemResiduals<T extends ReportSummaryRawRow>(rawRows: T[]): Shortfall[] {
  const { p0, isCandidate } = preprocessCandidate(rawRows);
  if (!isCandidate) return [];
  const ledger = buildLedgerRows(toReallocInput(p0));
  const srcTotal = new Map<number, number>();
  const buckets = new Map<string, { accSecCd: number; itemSecCd: number; bal: number; lastDate: string }>();
  for (const r of ledger) {
    const delta = r.incm_sec_cd === 1 ? r.amt : -r.amt;
    srcTotal.set(r.accSecCd, (srcTotal.get(r.accSecCd) ?? 0) + delta);
    const k = `${r.accSecCd}:${r.itemSecCd}`;
    const b = buckets.get(k) ?? { accSecCd: r.accSecCd, itemSecCd: r.itemSecCd, bal: 0, lastDate: r.acc_date };
    b.bal += delta;
    if (r.acc_date > b.lastDate) b.lastDate = r.acc_date;
    buckets.set(k, b);
  }
  const out: Shortfall[] = [];
  for (const b of buckets.values()) {
    if ((srcTotal.get(b.accSecCd) ?? 0) === 0 && b.bal < 0) {
      out.push({ acc_book_id: 0, acc_date: b.lastDate, accSecCd: b.accSecCd, itemSecCd: b.itemSecCd, shortAmt: -b.bal });
    }
  }
  return out;
}

/** ReportSummaryRawRow(전처리 완료) → Pass1/buildLedgerRows 입력 행. 메타는 배분에 무관하므로 비운다. */
function toReallocInput(rows: ReportSummaryRawRow[]): ReallocRow[] {
  return rows.map((r) => ({
    acc_book_id: r.acc_book_id,
    incm_sec_cd: r.incm_sec_cd,
    acc_sec_cd: r.acc_sec_cd,
    item_sec_cd: r.item_sec_cd,
    acc_date: r.acc_date,
    acc_amt: r.acc_amt,
    content: null,
    rcp_no: null,
    bigo: null,
    cust_id: 0,
    customer: null,
  }));
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
