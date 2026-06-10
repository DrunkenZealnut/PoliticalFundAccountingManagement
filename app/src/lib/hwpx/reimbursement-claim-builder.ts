/* ------------------------------------------------------------------ */
/*  선거비용 보전청구서(공식 서식 43) 청구내역 뷰모델 빌더               */
/*                                                                    */
/*  acc_book 지출행(incm=2) 중 보전 체크(acc_print_ok='Y')된 선거비용을  */
/*  자금원 3분류(후보자자산/후원회기부금/정당의지원금)로 합산한다.        */
/*  서식 43 청구내역 표엔 "보조금/보조금외" 분리 열이 없으므로            */
/*  보조금 + 보조금외 + 기타(미분류) 를 모두 "정당의지원금" 에 흡수해      */
/*  합계를 보존한다.                                                    */
/*                                                                    */
/*  표는 가로 장소(선거사무소/선거연락소×4/합계) × 세로 자금원 3행+합계.  */
/*  옵션 A(사무소 단일 집계): acc_book 에 선거연락소 식별 컬럼이 없으므로  */
/*  전액을 선거사무소 열에 집계하고 연락소 열은 빈칸(수기), 합계=사무소.   */
/*  (22-2 election-expense-summary-builder 와 동일 정책)                */
/*                                                                    */
/*  정합성: 자금원 분류(funding-source SSOT)·선거비용 판별(classify-      */
/*  ExpenseCategory SSOT)을 22-1/22-2 와 공유한다. 보전 필터(acc_print_  */
/*  ok='Y')는 reimbursement-aggregator 와 동일 규칙. React/Next 비의존.  */
/* ------------------------------------------------------------------ */
import { classifyFundingSource } from "@/lib/accounting/funding-source";
import { toKoreanAmount } from "@/lib/utils/korean-amount";
import { classifyExpenseCategory } from "./report-summary-builder";
import { formatAmount } from "./income-ledger-builder";

/** 자금원 3분류별 청구액 + 합계 (정당의지원금 = 보조금 + 보조금외 + 기타 흡수). */
export interface ClaimFundingBreakdown {
  후보자자산: number;
  후원회기부금: number;
  정당의지원금: number;
  합계: number; // = 후보자자산 + 후원회기부금 + 정당의지원금
}

export interface ReimbursementClaimModel {
  office: ClaimFundingBreakdown; // 선거사무소 (옵션 A: 전액)
  total: ClaimFundingBreakdown; // 합계 = office (옵션 A; 연락소 0)
}

export interface ReimbursementClaimInputRow {
  incm_sec_cd: number; // 1=수입, 2=지출
  acc_sec_cd: number; // 자금원 코드
  item_sec_cd: number; // 과목 코드(선거비용/외 판별)
  acc_amt: number;
  acc_print_ok: string | null; // 'Y'=보전 체크
}

type GetName = (cvId: number) => string;

/** 표 행 prefix(자금원/합계). */
const ROW_PREFIXES = ["후보자자산", "후원회기부금", "정당의지원금", "합계"] as const;
/** 표 열 suffix(장소). 옵션 A: 사무소=전액, 합계=사무소. 연락소 열은 템플릿 빈칸. */
const COL_SUFFIXES = ["사무소", "합계"] as const;

function emptyBreakdown(): ClaimFundingBreakdown {
  return { 후보자자산: 0, 후원회기부금: 0, 정당의지원금: 0, 합계: 0 };
}

function finalize(b: ClaimFundingBreakdown): ClaimFundingBreakdown {
  b.합계 = b.후보자자산 + b.후원회기부금 + b.정당의지원금;
  return b;
}

/**
 * 보전 체크된 선거비용 지출을 자금원 구분별로 집계한 서식 43 모델을 만든다.
 * @param rows acc_book 행(수입+지출 혼재 가능; 보전 미체크·수입·선거비용외는 무시)
 * @param getName cv_id → 코드명(계정명·과목명)
 */
export function buildReimbursementClaimModel(
  rows: ReimbursementClaimInputRow[],
  getName: GetName,
): ReimbursementClaimModel {
  const office = emptyBreakdown();

  for (const r of rows) {
    if (r.incm_sec_cd !== 2) continue; // 지출만
    if (r.acc_print_ok !== "Y") continue; // 보전 체크만
    if (classifyExpenseCategory(getName(r.item_sec_cd)) !== "선거비용") continue; // 선거비용만
    const amt = r.acc_amt || 0;
    if (amt <= 0) continue; // 양수만

    const src = classifyFundingSource(r.acc_sec_cd, getName(r.acc_sec_cd));
    switch (src) {
      case "후보자자산":
        office.후보자자산 += amt;
        break;
      case "후원회기부금":
        office.후원회기부금 += amt;
        break;
      // 보조금 + 보조금외 + 기타(미분류) → 정당의지원금 (합계 보존)
      default:
        office.정당의지원금 += amt;
        break;
    }
  }

  finalize(office);
  const total: ClaimFundingBreakdown = { ...office }; // 옵션 A: 합계 = 사무소
  return { office, total };
}

/**
 * 청구내역 표 셀 토큰(8개). form-43-fill.hwpx 의
 * {{후보자자산_사무소}} … {{합계_합계}} 와 일치한다.
 * (행=자금원/합계, 열=사무소/합계)
 */
export function claimTableTokens(model: ReimbursementClaimModel): Record<string, string> {
  const place: Record<(typeof COL_SUFFIXES)[number], ClaimFundingBreakdown> = {
    사무소: model.office,
    합계: model.total,
  };
  const out: Record<string, string> = {};
  for (const prefix of ROW_PREFIXES) {
    for (const suffix of COL_SUFFIXES) {
      out[`${prefix}_${suffix}`] = formatAmount(place[suffix][prefix]);
    }
  }
  return out;
}

/**
 * 본문 "5. 보전청구 총액 : 금○○○원(￦○○○)" 토큰(2개).
 * 한글 표기는 toKoreanAmount(보전청구서 Excel 과 동일 SSOT), 숫자는 천단위 콤마.
 * (0·비정상 금액은 빈 한글 표기 → "금 원")
 */
export function claimTotalTokens(model: ReimbursementClaimModel): Record<string, string> {
  return {
    보전청구총액_한글: toKoreanAmount(model.total.합계),
    보전청구총액_숫자: formatAmount(model.total.합계),
  };
}
