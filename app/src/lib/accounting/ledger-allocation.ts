/* ------------------------------------------------------------------ */
/*  수입·지출부 배분 조합 — buildLedgerRows = Pass0→Pass1→Pass2          */
/*                                                                    */
/*  후보자 raw acc_book 행을 받아 공식(Fund_Data_1.db)과 동일한 구조의     */
/*  장부 행으로 변환한다(표시·영구화 공용 SSOT).                          */
/*   - Pass0 adjustNegativeIncome: 음수 수입 → 양수 지출 정규화.          */
/*   - Pass1 reallocateFundSources: 자금원 음수잔액 해소(지출을 계정 간     */
/*     이동, 과목은 불변).                                               */
/*   - Pass2 allocateIncomeToItems: 수입을 충당 과목으로 재태깅.          */
/*                                                                    */
/*  핵심 불변식:                                                        */
/*   - 지출의 과목(선거비용 86/선거비용외 87)은 절대 불변. 계정만 이동 가능. */
/*   - 모든 자금원 최종 잔액 ≥ 0(통장 총잔액 ≥ 0 가정). 지출은 원 자금원   */
/*     유지·부족분만 잉여 자금원 이동(총액기준). 자산 입금이 지출보다 늦으면 */
/*     시간순 중간 잔액은 음수 가능(미래 같은 자금원 수입으로 해소).         */
/*   - 합 보존: 자금원별 수입합·지출합 불변(분할·이동만).                   */
/* ------------------------------------------------------------------ */
import { adjustNegativeIncome } from "./adjust-negative-income";
import { reallocateFundSources, type ReallocRow, type ReallocCustomer } from "./fund-realloc";
import { allocateIncomeToItems } from "./item-allocation";
import { applyLoudspeakerAnchor } from "./loudspeaker";
import { zeroItemBalances } from "./item-balance-zero";
import { scheduleExpenseDates } from "./schedule-expense-dates";

export interface LedgerRow {
  acc_book_id: number;
  incm_sec_cd: number; // Pass0 적용 후(음수 수입은 2로 정규화)
  acc_date: string;
  cust_id: number;
  content: string | null;
  rcp_no: string | null;
  bigo: string | null;
  customer: ReallocCustomer | null;
  // 원래값(영구화 raw_* 기록·복원·비교용 — raw acc_book 기준)
  origAccSecCd: number;
  origItemSecCd: number;
  origAmt: number;
  // 배분 결과
  accSecCd: number; // 배치 자금원(Pass1)
  itemSecCd: number; // 배분 과목(Pass2). 지출은 origItemSecCd와 항상 동일.
  amt: number; // 분할 후 최종 금액
  // 추적
  splitGroupId?: number;
  origin: "as-is" | "fund-moved" | "item-moved" | "fund+item-moved";
  note?: string;
}

/**
 * 후보자 raw acc_book 행 → 배분 확정 LedgerRow[].
 * 표시(미영구화 org 폴백)·영구화(write)·입력 힌트가 공유하는 SSOT.
 */
export function buildLedgerRows(rows: ReallocRow[]): LedgerRow[] {
  // raw 원본 보존(Pass0가 부호/구분을 바꾸기 전 값) — 영구화 복원용.
  const rawById = new Map<number, ReallocRow>();
  for (const r of rows) rawById.set(r.acc_book_id, r);

  const p0 = adjustNegativeIncome(rows); // Pass0
  const { rows: pL, protectIds } = applyLoudspeakerAnchor(p0); // Pass-L 확성기 앵커
  const p1 = reallocateFundSources(pL, { protectIds }).rows; // Pass1 (확성기 보호, 과목 불변)
  const p2 = allocateIncomeToItems(p1); // Pass2
  const p3 = zeroItemBalances(p2); // Pass3 (계정×과목) 최종 0
  const p4 = scheduleExpenseDates(p3); // Pass4 지출일 스케줄링(누계≥0)

  return p4.map((r) => {
    const rawRow = rawById.get(r.acc_book_id);
    const fundMoved = r.origin === "split-moved";
    const itemMoved = r.itemOrigin === "item-moved";
    const origin: LedgerRow["origin"] =
      fundMoved && itemMoved
        ? "fund+item-moved"
        : fundMoved
          ? "fund-moved"
          : itemMoved
            ? "item-moved"
            : "as-is";
    return {
      acc_book_id: r.acc_book_id,
      incm_sec_cd: r.incm_sec_cd,
      acc_date: r.acc_date,
      cust_id: r.cust_id,
      content: r.content,
      rcp_no: r.rcp_no,
      bigo: r.bigo,
      customer: r.customer,
      origAccSecCd: rawRow?.acc_sec_cd ?? r.acc_sec_cd,
      origItemSecCd: rawRow?.item_sec_cd ?? r.item_sec_cd,
      origAmt: rawRow?.acc_amt ?? r.acc_amt,
      accSecCd: r.sheetAccSecCd,
      itemSecCd: r.effectiveItemSecCd,
      amt: r.effectiveAmt,
      splitGroupId: r.splitGroupId,
      origin,
      note: r.note,
    };
  });
}
