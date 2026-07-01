/* ------------------------------------------------------------------ */
/*  Pass3: 과목 최종잔액 0 (수입 재배정으로 마무리)                       */
/*                                                                    */
/*  Pass2(시간순 best-effort) 이후 남은 (계정×과목) 불균형을, 같은        */
/*  자금원 내 잉여 과목의 수입 슬라이스를 부족 과목으로 재배정해 0으로     */
/*  만든다. 자금원 총액(수입합−지출합) ≠ 0이면 강제하지 않고 원본 유지     */
/*  (누락지출/데이터미완 신호는 상위 경고 체계로 표면화 — D4).            */
/*  지출은 불변(수입 슬라이스만 재태깅). 합·통장 총잔액 불변.             */
/* ------------------------------------------------------------------ */
import type { ItemAllocOutRow } from "./item-allocation";

export function zeroItemBalances(rows: ItemAllocOutRow[]): ItemAllocOutRow[] {
  const groups = new Map<number, ItemAllocOutRow[]>();
  for (const r of rows) {
    const g = groups.get(r.sheetAccSecCd) ?? [];
    g.push(r);
    groups.set(r.sheetAccSecCd, g);
  }
  const out: ItemAllocOutRow[] = [];
  for (const group of groups.values()) out.push(...zeroOneSource(group));
  return out;
}

function zeroOneSource(rows: ItemAllocOutRow[]): ItemAllocOutRow[] {
  // 과목별 순잔액(수입−지출).
  const net = new Map<number, number>();
  for (const r of rows) {
    const d = r.incm_sec_cd === 1 ? r.effectiveAmt : -r.effectiveAmt;
    net.set(r.effectiveItemSecCd, (net.get(r.effectiveItemSecCd) ?? 0) + d);
  }
  const total = [...net.values()].reduce((s, v) => s + v, 0);
  if (total !== 0) return rows; // D4: 총액≠0 → 재배정 안 함.

  const deficits = [...net.entries()]
    .filter(([, v]) => v < 0)
    .map(([item, v]) => ({ item, need: -v }))
    .sort((a, b) => a.item - b.item);
  if (deficits.length === 0) return rows; // 이미 균형.
  const surplus = new Map<number, number>(
    [...net.entries()].filter(([, v]) => v > 0).map(([item, v]) => [item, v]),
  );

  const out: ItemAllocOutRow[] = [];
  for (const r of rows) {
    // 수입이 아니거나 이 행의 과목이 잉여가 아니면 그대로.
    if (r.incm_sec_cd !== 1 || (surplus.get(r.effectiveItemSecCd) ?? 0) <= 0) {
      out.push(r);
      continue;
    }
    let remaining = r.effectiveAmt;
    const pieces: { item: number; amt: number; moved: boolean }[] = [];
    for (const def of deficits) {
      if (remaining <= 0) break;
      const avail = surplus.get(r.effectiveItemSecCd) ?? 0;
      if (def.need <= 0 || avail <= 0) continue;
      const move = Math.min(remaining, def.need, avail);
      if (move <= 0) continue;
      pieces.push({ item: def.item, amt: move, moved: true });
      remaining -= move;
      def.need -= move;
      surplus.set(r.effectiveItemSecCd, avail - move);
    }
    if (remaining > 0) pieces.push({ item: r.effectiveItemSecCd, amt: remaining, moved: false });
    const isSplit = pieces.length > 1;
    for (const p of pieces) {
      out.push({
        ...r,
        effectiveItemSecCd: p.item,
        effectiveAmt: p.amt,
        itemOrigin: p.moved ? "item-moved" : isSplit ? "item-keep" : r.itemOrigin,
        splitGroupId: isSplit ? r.acc_book_id : r.splitGroupId,
      });
    }
  }
  return out;
}
