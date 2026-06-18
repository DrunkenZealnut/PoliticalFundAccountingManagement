/* ------------------------------------------------------------------ */
/*  일괄출력 수입·지출부 — 계정×과목 시트 조합 산출 (순수)               */
/*                                                                    */
/*  표준 계정×과목 조합(acc_rel)과 실거래 조합을 병합해, 거래가 0인       */
/*  표준 조합도 시트(빈 양식) 대상으로 포함한다. 화면 체크박스 선택을      */
/*  존중한다(선택된 계정 ∧ 선택된 수입/지출 과목만).                     */
/*                                                                    */
/*  서식7(HWPX income-ledger)의 standardCombos 패턴을 엑셀 일괄출력에     */
/*  이식. enumeration(getAccounts×getItems)은 호출부(page)에서 수행하고  */
/*  병합·필터·정렬만 여기서 담당(테스트 용이).                           */
/* ------------------------------------------------------------------ */

export interface AccItemCombo {
  accSecCd: number;
  itemSecCd: number;
}

export interface ReportComboSelection {
  selectedAccounts: Set<number>;
  selectedIncomeItems: Set<number>;
  selectedExpenseItems: Set<number>;
}

const comboKey = (c: AccItemCombo) => `${c.accSecCd}-${c.itemSecCd}`;

/**
 * 시트로 생성할 계정×과목 조합 목록.
 * - 표준 조합(standardCombos)을 입력 순서(acc_rel acc_order/cv_order)대로 먼저,
 * - 표준에 없는 실거래 조합(비표준)을 accSecCd→itemSecCd 정렬로 뒤에 append.
 * - 둘 다 체크박스 선택(계정 ∧ 수입/지출 과목) 통과한 것만. dedup.
 */
export function buildReportCombos(
  standardCombos: readonly AccItemCombo[],
  realCombos: readonly AccItemCombo[],
  sel: ReportComboSelection,
): AccItemCombo[] {
  const pass = (c: AccItemCombo) =>
    sel.selectedAccounts.has(c.accSecCd) &&
    (sel.selectedIncomeItems.has(c.itemSecCd) || sel.selectedExpenseItems.has(c.itemSecCd));

  const seen = new Set<string>();
  const out: AccItemCombo[] = [];

  // 1) 표준 조합 — 입력 순서 유지
  for (const c of standardCombos) {
    const k = comboKey(c);
    if (seen.has(k) || !pass(c)) continue;
    seen.add(k);
    out.push({ accSecCd: c.accSecCd, itemSecCd: c.itemSecCd });
  }

  // 2) 비표준 실거래 조합 — 정렬해 append
  const extras: AccItemCombo[] = [];
  const extraSeen = new Set<string>();
  for (const c of realCombos) {
    const k = comboKey(c);
    if (seen.has(k) || extraSeen.has(k) || !pass(c)) continue;
    extraSeen.add(k);
    extras.push({ accSecCd: c.accSecCd, itemSecCd: c.itemSecCd });
  }
  extras.sort((a, b) => a.accSecCd - b.accSecCd || a.itemSecCd - b.itemSecCd);
  out.push(...extras);

  return out;
}
