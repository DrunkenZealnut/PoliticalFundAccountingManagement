/* ------------------------------------------------------------------ */
/*  선거비용 보전청구서(공식 서식 43) 청구내역 토큰 빌더                 */
/*                                                                    */
/*  공식 별지 서식 표 구조: 행=장소(선거사무소/연락소/합계),            */
/*  열=자금원 4분류(후보자자산/후원회기부금/보조금/보조금외) + 합계.     */
/*  Excel 보전청구서(reimbursement-claim-form)와 동일한                 */
/*  reimbursement-aggregator(ClaimAmounts) 를 SSOT 로 공유한다.         */
/*                                                                    */
/*  옵션 A(사무소 단일 집계): acc_book 에 선거연락소 식별 컬럼이 없으므로 */
/*  전액을 선거사무소 행에 집계하고 연락소 행은 빈칸(수기) → 합계=사무소. */
/*  따라서 사무소 행 토큰 == 합계 행 토큰(동일 ClaimAmounts).            */
/*                                                                    */
/*  집계·보전 필터(acc_print_ok='Y')·선거비용 판별은 aggregator 가      */
/*  담당한다. 이 모듈은 ClaimAmounts → 토큰 문자열 매핑만 수행(순수).   */
/* ------------------------------------------------------------------ */
import type { ClaimAmounts } from "@/lib/accounting/reimbursement-aggregator";
import { toKoreanAmount } from "@/lib/utils/korean-amount";
import { formatAmount } from "./income-ledger-builder";

/** 청구내역 표 자금원 열(가로) — 4분류 + 합계. */
const FUNDING_COLS = ["후보자자산", "후원회기부금", "보조금", "보조금외", "합계"] as const;
/** 표 장소 행(세로) prefix — 옵션 A: 사무소=전액, 합계=사무소. */
const PLACE_ROWS = ["사무소", "합계"] as const;

/**
 * 청구내역 표 셀 토큰(10개). form-43-fill.hwpx 의
 * {{사무소_후보자자산}} … {{합계_합계}} 와 일치한다.
 * (행=장소[사무소/합계], 열=자금원 4분류+합계)
 * 옵션 A: 연락소 0 이므로 사무소 행 == 합계 행(동일 ClaimAmounts).
 */
export function claimTableTokens(amounts: ClaimAmounts): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of PLACE_ROWS) {
    for (const col of FUNDING_COLS) {
      out[`${row}_${col}`] = formatAmount(amounts[col]);
    }
  }
  return out;
}

/**
 * 본문 "5. 보전청구 총액 : 금○○○원(￦○○○)" 토큰(2개).
 * 한글 표기는 toKoreanAmount(보전청구서 Excel 과 동일 SSOT), 숫자는 천단위 콤마.
 * (0·비정상 금액은 빈 한글 표기 → "금 원")
 */
export function claimTotalTokens(amounts: ClaimAmounts): Record<string, string> {
  return {
    보전청구총액_한글: toKoreanAmount(amounts.합계),
    보전청구총액_숫자: formatAmount(amounts.합계),
  };
}
