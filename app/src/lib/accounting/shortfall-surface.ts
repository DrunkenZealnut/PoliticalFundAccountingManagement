/* ------------------------------------------------------------------ */
/*  통장 부족(Shortfall) 표면화 — HWPX route 공유 헬퍼                     */
/*                                                                    */
/*  은폐 금지(데이터 오류는 알린다) + 보안 계약을 한 곳에 고정한다:        */
/*   - 응답 헤더엔 **건수만** 노출(X-Allocation-Shortfall).               */
/*   - 거래 상세(자금원/일자/금액)는 **서버 로그(console.warn)에만**.      */
/*  소비처: api/hwpx/accounting-report · api/hwpx/income-ledger.          */
/* ------------------------------------------------------------------ */
import type { Shortfall } from "./fund-realloc";

/** 통장 부족 표면화 응답 헤더 키. 값은 건수만(거래 상세 비노출). */
export const ALLOCATION_SHORTFALL_HEADER = "X-Allocation-Shortfall";

/** 부족 건수 헤더 — 있을 때만. 정상 데이터(빈 배열)면 `{}` → 헤더 미부착. */
export function shortfallHeaders(shortfalls: Shortfall[]): Record<string, string> {
  return shortfalls.length > 0
    ? { [ALLOCATION_SHORTFALL_HEADER]: String(shortfalls.length) }
    : {};
}

/**
 * 통장 부족을 서버 로그로 경고(은폐 금지). 상세(자금원/일자/금액)는 로그에만 남기고
 * 응답 헤더엔 건수만 노출(→ `shortfallHeaders`). 정상 데이터면 아무것도 안 한다.
 * @param tag    소비처 식별(예: "hwpx/accounting-report")
 * @param context 진단 맥락(예: "org=12, form=22-1")
 */
export function logShortfalls(tag: string, context: string, shortfalls: Shortfall[]): void {
  if (shortfalls.length === 0) return;
  console.warn(
    `[${tag}] 통장 잔액 부족 — 자금원 배정 불가 ${shortfalls.length}건 (${context}): ` +
      shortfalls.map((s) => `${s.accSecCd}/${s.acc_date}/${s.shortAmt}`).join(", "),
  );
}
