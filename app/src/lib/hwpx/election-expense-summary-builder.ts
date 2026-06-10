/* ------------------------------------------------------------------ */
/*  회계보고서 선거비용 지출내역 집계표(공식 서식 22-2) 뷰모델 빌더       */
/*                                                                    */
/*  acc_book 지출행(incm=2) 중 선거비용만 골라 자금원 구분(후보자자산/   */
/*  후원회기부금/보조금/보조금외)별로 합산한다. 표는 가로 4구분 + "계",  */
/*  세로로 합계/선거사무소/선거연락소 행을 가진다.                       */
/*                                                                    */
/*  옵션 A(사무소 단일 집계): acc_book 에 선거연락소 식별 컬럼이 없으므로 */
/*  v1 은 전액을 선거사무소 행에 집계하고 연락소는 0, 합계=사무소.        */
/*  (선거연락소가 있는 후보자는 양식 주석 안내에 따라 수기 조정)          */
/*                                                                    */
/*  정합성: 자금원 분류(funding-source SSOT)·선거비용 분류                */
/*  (classifyExpenseCategory SSOT)를 22-1 과 공유 → 22-1 선거비용 합계와  */
/*  22-2 합계가 일치한다. 22-2 엔 "기타" 열이 없으므로 미분류 자금원       */
/*  선거비용은 보조금외 열에 흡수해 합계를 보존한다. React/Next 비의존.   */
/* ------------------------------------------------------------------ */
import { classifyFundingSource } from "@/lib/accounting/funding-source";
import { classifyExpenseCategory } from "./report-summary-builder";
import { formatAmount } from "./income-ledger-builder";

/** 자금원 4분류별 선거비용 + 계. */
export interface FundingBreakdown {
  후보자자산: number;
  후원회기부금: number;
  보조금: number;
  보조금외: number; // 미분류(기타) 자금원 선거비용을 흡수
  계: number; // = 후보자자산 + 후원회기부금 + 보조금 + 보조금외
}

export interface ElectionExpenseSummaryModel {
  office: FundingBreakdown; // 선거사무소 (옵션 A: 전액)
  branch: FundingBreakdown; // 선거연락소 계 (옵션 A: 전부 0)
  total: FundingBreakdown; // 합계 = office + branch (옵션 A: = office)
}

export interface ElectionExpenseSummaryInputRow {
  incm_sec_cd: number; // 1=수입, 2=지출
  acc_sec_cd: number; // 자금원 코드
  item_sec_cd: number; // 과목 코드(선거비용/외 판별)
  acc_amt: number;
}

type GetName = (cvId: number) => string;

/** 표 행 prefix → 모델 키. */
const ROW_PREFIXES = ["합계", "사무소", "연락소계"] as const;
/** 표 열 suffix(= FundingBreakdown 키). */
const COL_SUFFIXES: (keyof FundingBreakdown)[] = [
  "계",
  "후보자자산",
  "후원회기부금",
  "보조금",
  "보조금외",
];

function emptyBreakdown(): FundingBreakdown {
  return { 후보자자산: 0, 후원회기부금: 0, 보조금: 0, 보조금외: 0, 계: 0 };
}

/** 가로합으로 `계` 를 채운다. */
function finalize(b: FundingBreakdown): FundingBreakdown {
  b.계 = b.후보자자산 + b.후원회기부금 + b.보조금 + b.보조금외;
  return b;
}

/**
 * 선거비용 지출을 자금원 구분별로 집계한 22-2 모델을 만든다.
 * @param rows acc_book 행(수입+지출 혼재 가능; 수입·선거비용외는 무시)
 * @param getName cv_id → 코드명(계정명·과목명)
 */
export function buildElectionExpenseSummaryModel(
  rows: ElectionExpenseSummaryInputRow[],
  getName: GetName,
): ElectionExpenseSummaryModel {
  const office = emptyBreakdown();

  for (const r of rows) {
    if (r.incm_sec_cd !== 2) continue; // 지출만
    if (classifyExpenseCategory(getName(r.item_sec_cd)) !== "선거비용") continue; // 선거비용만
    const amt = r.acc_amt || 0;
    const src = classifyFundingSource(r.acc_sec_cd, getName(r.acc_sec_cd));
    switch (src) {
      case "후보자자산":
        office.후보자자산 += amt;
        break;
      case "후원회기부금":
        office.후원회기부금 += amt;
        break;
      case "보조금":
        office.보조금 += amt;
        break;
      // 보조금외 + 기타(미분류) → 보조금외 열에 흡수해 합계 보존
      case "보조금외":
      default:
        office.보조금외 += amt;
        break;
    }
  }

  finalize(office);
  const branch = finalize(emptyBreakdown());
  // 옵션 A: 합계 = 사무소(전액) + 연락소(0). office 는 이미 finalize 되어 .계 를
  // 포함하므로 얕은 복사로 충분(독립 객체). 연락소 지원 시 office+branch 합산으로 변경.
  const total: FundingBreakdown = { ...office };
  return { office, branch, total };
}

/**
 * 22-2 표 셀 토큰맵(15개). form-22-2-fill.hwpx 의
 * {{합계_계}} … {{연락소계_보조금외}} 와 일치한다.
 */
export function electionExpenseSummaryTokens(
  model: ElectionExpenseSummaryModel,
): Record<string, string> {
  const byPrefix: Record<(typeof ROW_PREFIXES)[number], FundingBreakdown> = {
    합계: model.total,
    사무소: model.office,
    연락소계: model.branch,
  };
  const out: Record<string, string> = {};
  for (const prefix of ROW_PREFIXES) {
    const b = byPrefix[prefix];
    for (const suffix of COL_SUFFIXES) {
      out[`${prefix}_${suffix}`] = formatAmount(b[suffix]);
    }
  }
  return out;
}
