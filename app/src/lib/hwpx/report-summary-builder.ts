/* ------------------------------------------------------------------ */
/*  회계보고서 수입·지출보고서(공식 서식 22-1) 총괄표 뷰모델 빌더        */
/*                                                                    */
/*  acc_book 행(수입 incm=1 + 지출 incm=2)을 자금원 구분(후보자자산/    */
/*  후원회기부금/보조금/보조금외)별로 집계하고, 지출은 과목(선거비용/    */
/*  선거비용외)으로 나눠 소계·잔액(수입−지출소계)을 계산한다. 표 행은    */
/*  고정(구분 4행 + 합계)이므로 셀 토큰 치환용 맵을 만든다.             */
/*                                                                    */
/*  근거: form-22-1 총괄표 열 = 수입 / 선거비용 / 선거비용외 / 소계 /    */
/*  잔액. 구분 매핑은 funding-source SSOT(82보조금·83보조금외·84자산·    */
/*  85후원회기부금) 재사용. React/Next 비의존 → 단위 테스트 가능.        */
/* ------------------------------------------------------------------ */
import { classifyFundingSource, type FundingSource } from "@/lib/accounting/funding-source";
import { formatAmount } from "./income-ledger-builder";

export type ExpenseCategory = "선거비용" | "선거비용외";

/**
 * 과목명으로 선거비용/선거비용외 구분.
 *  - "선거비용외" 포함 → 선거비용외 (먼저 검사)
 *  - "선거비용" 포함 → 선거비용
 *  - 불명 → 선거비용외 (보수적 기본값: 선거비용 과대계상 방지)
 */
export function classifyExpenseCategory(itemName: string): ExpenseCategory {
  if (itemName.includes("선거비용외")) return "선거비용외";
  if (itemName.includes("선거비용")) return "선거비용";
  return "선거비용외";
}

export interface ReportSummaryInputRow {
  incm_sec_cd: number; // 1=수입, 2=지출
  acc_sec_cd: number;
  item_sec_cd: number;
  acc_amt: number;
}

export interface SummaryRow {
  source: FundingSource;
  income: number;
  expElection: number; // 지출 선거비용
  expNonElection: number; // 지출 선거비용외
  expSubtotal: number; // = expElection + expNonElection
  balance: number; // = income - expSubtotal
}

export interface ReportSummaryModel {
  rows: SummaryRow[]; // 후보자자산·후원회기부금·보조금·보조금외 (고정 순서)
  total: SummaryRow; // 합계행 (기타 미분류분 포함)
}

/** 표 행 순서(고정). `기타`는 표에 없고 합계에만 반영. */
const SUMMARY_ORDER: FundingSource[] = ["후보자자산", "후원회기부금", "보조금", "보조금외"];

/** 토큰 접두사 (form-22-1-fill.hwpx 의 {{접두사_수입}} 등과 일치). */
const TOKEN_PREFIX: Record<FundingSource, string> = {
  후보자자산: "자산",
  후원회기부금: "후원회기부금",
  보조금: "보조금",
  보조금외: "보조금외",
  기타: "기타",
};

type GetName = (cvId: number) => string;

function emptyRow(source: FundingSource): SummaryRow {
  return { source, income: 0, expElection: 0, expNonElection: 0, expSubtotal: 0, balance: 0 };
}

function finalize(row: SummaryRow): SummaryRow {
  row.expSubtotal = row.expElection + row.expNonElection;
  row.balance = row.income - row.expSubtotal;
  return row;
}

/**
 * 수입·지출행을 구분별로 집계한 22-1 총괄표 모델을 만든다.
 * @param rows acc_book 행 (수입+지출)
 * @param getName cv_id → 코드명 (계정명·과목명)
 */
export function buildReportSummaryModel(
  rows: ReportSummaryInputRow[],
  getName: GetName,
): ReportSummaryModel {
  const buckets: Record<FundingSource, SummaryRow> = {
    후보자자산: emptyRow("후보자자산"),
    후원회기부금: emptyRow("후원회기부금"),
    보조금: emptyRow("보조금"),
    보조금외: emptyRow("보조금외"),
    기타: emptyRow("기타"),
  };

  for (const r of rows) {
    const src = classifyFundingSource(r.acc_sec_cd, getName(r.acc_sec_cd));
    const bucket = buckets[src];
    const amt = r.acc_amt || 0;
    if (r.incm_sec_cd === 1) {
      bucket.income += amt;
    } else if (r.incm_sec_cd === 2) {
      if (classifyExpenseCategory(getName(r.item_sec_cd)) === "선거비용") {
        bucket.expElection += amt;
      } else {
        bucket.expNonElection += amt;
      }
    }
  }

  // 표 4행 + 기타(미분류, 표 미표시)를 모두 finalize. 합계는 전체 버킷의 합.
  const allSources: FundingSource[] = [...SUMMARY_ORDER, "기타"];
  allSources.forEach((s) => finalize(buckets[s]));
  const total = finalize(
    allSources.reduce((acc, s) => {
      acc.income += buckets[s].income;
      acc.expElection += buckets[s].expElection;
      acc.expNonElection += buckets[s].expNonElection;
      return acc;
    }, emptyRow("기타")),
  );

  return { rows: SUMMARY_ORDER.map((s) => buckets[s]), total };
}

/** 단일 구분 행 → 토큰맵 (5열). */
function rowTokenMap(prefix: string, row: SummaryRow): Record<string, string> {
  return {
    [`${prefix}_수입`]: formatAmount(row.income),
    [`${prefix}_선거비용`]: formatAmount(row.expElection),
    [`${prefix}_선거비용외`]: formatAmount(row.expNonElection),
    [`${prefix}_소계`]: formatAmount(row.expSubtotal),
    [`${prefix}_잔액`]: formatAmount(row.balance),
  };
}

/** 총괄표 셀 토큰맵 ({{자산_수입}} … {{합계_잔액}}). */
export function summaryTokens(model: ReportSummaryModel): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of model.rows) {
    Object.assign(out, rowTokenMap(TOKEN_PREFIX[row.source], row));
  }
  Object.assign(out, rowTokenMap("합계", model.total));
  return out;
}
