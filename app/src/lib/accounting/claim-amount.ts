/* ------------------------------------------------------------------ */
/*  보전청구액(claim_amt) SSOT — 보전 출력 전용                          */
/*                                                                    */
/*  보전 대상 지출의 "보전 신청액". 실지출액(acc_amt)과 다른 일할계산   */
/*  금액 등을 수동 입력한다(acc_book.claim_amt). NULL이면 실지출액을     */
/*  그대로 청구(읽기 측 fallback).                                      */
/*                                                                    */
/*  소비처는 보전 경로만(reimbursement-aggregator·doclist-builder·      */
/*  보전관리 화면). 회계장부·회계보고서·정산은 acc_amt 를 써야 하므로   */
/*  이 헬퍼를 import 하지 않는다(회계 정합 오염 방지).                  */
/* ------------------------------------------------------------------ */

/** 보전청구액 = claim_amt(있으면) else 실지출액 acc_amt. (claim_amt=0 은 청구 0원으로 존중) */
export function claimAmount(row: { claim_amt?: number | null; acc_amt: number }): number {
  return row.claim_amt ?? row.acc_amt;
}
