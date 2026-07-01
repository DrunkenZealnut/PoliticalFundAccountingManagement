/* ------------------------------------------------------------------ */
/*  Pass4: 지출일 스케줄링 (행별 누계잔액 ≥ 0)                            */
/*                                                                    */
/*  각 (계정×과목) 시트에서, 충당 수입보다 시간상 앞선 양수 지출의        */
/*  날짜를 "누계수입이 그 지출을 덮는 최초 수입일"로 뒤로 민다(뒤로만).    */
/*  Pass3로 시트 총 수입=총 지출이 보장되면 통째이동만으로 무분할·기간내   */
/*  해결(마지막 지출도 마지막 수입일에 덮임). 환급·0 지출은 원 날짜 유지.  */
/*  금액·계정·과목 불변(날짜만). 정렬 SSOT: acc-book-sort.ts.            */
/* ------------------------------------------------------------------ */
import { compareAccDateTime } from "./acc-book-sort";
import type { ItemAllocOutRow } from "./item-allocation";

export function scheduleExpenseDates(rows: ItemAllocOutRow[]): ItemAllocOutRow[] {
  const groups = new Map<string, ItemAllocOutRow[]>();
  for (const r of rows) {
    const key = `${r.sheetAccSecCd}:${r.effectiveItemSecCd}`;
    const g = groups.get(key) ?? [];
    g.push(r);
    groups.set(key, g);
  }
  const newDate = new Map<ItemAllocOutRow, string>();
  for (const group of groups.values()) scheduleOneSheet(group, newDate);

  return rows.map((r) => {
    const nd = newDate.get(r);
    if (nd == null) return r;
    return { ...r, acc_date: nd, note: appendOrigDate(r.note, r.acc_date) };
  });
}

function scheduleOneSheet(rows: ItemAllocOutRow[], newDate: Map<ItemAllocOutRow, string>): void {
  // 누적수입 프리픽스(날짜별).
  const incomes = rows
    .filter((r) => r.incm_sec_cd === 1)
    .sort((a, b) => compareAccDateTime(a, b) || a.acc_book_id - b.acc_book_id);
  const cumPoints: { date: string; cum: number }[] = [];
  let cum = 0;
  for (const inc of incomes) {
    cum += inc.effectiveAmt;
    const last = cumPoints[cumPoints.length - 1];
    if (last && last.date === inc.acc_date) last.cum = cum;
    else cumPoints.push({ date: inc.acc_date, cum });
  }
  const earliestDate = (threshold: number): string | null => {
    for (const p of cumPoints) if (p.cum >= threshold) return p.date;
    return null; // 총수입 < threshold (총액≠0 부족) — 이동 불가.
  };

  const posExpenses = rows
    .filter((r) => r.incm_sec_cd === 2 && r.effectiveAmt > 0)
    .sort((a, b) => compareAccDateTime(a, b) || a.acc_book_id - b.acc_book_id);
  let scheduledTotal = 0;
  for (const e of posExpenses) {
    const threshold = scheduledTotal + e.effectiveAmt;
    const d = earliestDate(threshold);
    // 뒤로만: 커버일이 원 날짜보다 늦을 때만 이동.
    if (d != null && d > e.acc_date) newDate.set(e, d);
    scheduledTotal += e.effectiveAmt;
  }
}

/** YYYYMMDD → 비고에 "원거래일 YYYY-MM-DD" 부가(기존 비고 보존). */
function appendOrigDate(note: string | null | undefined, origYmd: string): string {
  const d = `${origYmd.slice(0, 4)}-${origYmd.slice(4, 6)}-${origYmd.slice(6, 8)}`;
  const tag = `원거래일 ${d}`;
  return note ? `${note} · ${tag}` : tag;
}
