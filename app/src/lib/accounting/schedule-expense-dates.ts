/* ------------------------------------------------------------------ */
/*  Pass4: 지출일 스케줄링 (행별 누계잔액 ≥ 0)                            */
/*                                                                    */
/*  각 (계정×과목) 시트에서, 충당 가용액(수입 + 환급)보다 시간상 앞선     */
/*  양수 지출의 날짜를 "누계 가용액이 그 지출을 덮는 최초 날짜"로 뒤로     */
/*  민다(뒤로만). 환급(음수 지출)도 잔액을 늘리므로 가용액에 포함한다.     */
/*  시트 총 수입=총 지출이면 통째이동만으로 무분할·기간내 해결(마지막      */
/*  지출도 마지막 가용일에 덮임). 환급·0 지출 자체는 원 날짜 유지.        */
/*  금액·계정·과목 불변(날짜만). 정렬 SSOT: acc-book-sort.ts.            */
/* ------------------------------------------------------------------ */
import { compareAccDateTime } from "./acc-book-sort";
import { fmtAccDate } from "@/lib/date-utils";
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
    return { ...r, acc_date: nd, note: appendOrigDateTag(r.note, r.acc_date) };
  });
}

function scheduleOneSheet(rows: ItemAllocOutRow[], newDate: Map<ItemAllocOutRow, string>): void {
  // 가용액(수입 + 환급) 날짜별 누적. 환급(음수 지출)은 잔액을 늘리므로 +|amt|로 계상.
  const credits = rows
    .filter((r) => (r.incm_sec_cd === 1 && r.effectiveAmt > 0) || (r.incm_sec_cd === 2 && r.effectiveAmt < 0))
    .map((r) => ({ date: r.acc_date, amt: r.incm_sec_cd === 1 ? r.effectiveAmt : -r.effectiveAmt }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const cumPoints: { date: string; cum: number }[] = [];
  let cum = 0;
  for (const c of credits) {
    cum += c.amt;
    const last = cumPoints[cumPoints.length - 1];
    if (last && last.date === c.date) last.cum = cum;
    else cumPoints.push({ date: c.date, cum });
  }
  const earliestDate = (threshold: number): string | null => {
    for (const p of cumPoints) if (p.cum >= threshold) return p.date;
    return null; // 총 가용 < threshold (총액≠0 부족) — 이동 불가.
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

/** 재조정(Pass4·persist)으로 날짜가 바뀐 행에 "원거래일 YYYY-MM-DD" 태그를 붙인다(기존 텍스트 보존). */
export function appendOrigDateTag(existing: string | null | undefined, origYmd: string): string {
  const tag = `원거래일 ${fmtAccDate(origYmd)}`;
  return existing ? `${existing} · ${tag}` : tag;
}
