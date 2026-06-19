/* ------------------------------------------------------------------ */
/*  Pass2: 과목 배분 (수입을 충당 대상 과목으로 재태깅)                    */
/*                                                                    */
/*  Pass1(fund-realloc, 지출을 자금원 간 이동)의 대칭. 자금원이 확정된     */
/*  행을 받아, 각 자금원 내부에서 수입을 "그 수입으로 충당한 지출의 과목"   */
/*  으로 태깅한다(필요 시 수입 행 분할). 공식 프로그램 데이터 구조와 동일:   */
/*  모든 (계정×과목)이 충당분만큼 균형(잔액 ≥ 0).                          */
/*                                                                    */
/*  규칙(시간순, 자금원별 독립):                                          */
/*   - 수입 → 원과목 풀에 적립.                                          */
/*   - 양수 지출(과목 M) → 과목 M 풀에서 충당, 부족 시 다른 과목 잉여 수입을  */
/*     끌어와 과목 M으로 재태깅.                                          */
/*   - 환급/0 지출 → 원과목 유지, 수입 소비 안 함(해당 과목 잔액 복원).      */
/*   - 잉여 수입(미충당) → 원과목 유지.                                   */
/*  수입은 과목 경계를 넘을 때만 분할(같은 과목 내에선 통째 유지).          */
/*  정렬 SSOT: acc-book-sort.ts(compareAccDateTime), 동시각 수입 먼저.     */
/* ------------------------------------------------------------------ */
import { compareAccDateTime } from "./acc-book-sort";
import type { ReallocOutRow } from "./fund-realloc";

/** 과목 배분 후 출력 행. effectiveAmt는 (과목 분할 후) 최종 금액. */
export interface ItemAllocOutRow extends ReallocOutRow {
  /** 배분된 과목. 수입은 분할로 원래(item_sec_cd)≠배분 가능, 지출은 원과목 유지. */
  effectiveItemSecCd: number;
  /** as-is: 미분할·원과목 / item-keep: 분할 중 원과목 잔류분 / item-moved: 다른 과목으로 이동분 */
  itemOrigin: "as-is" | "item-keep" | "item-moved";
}

/** 한 수입 행의 미배분 잔액과 과목별 배분 누적. */
interface IncomeSlice {
  src: ReallocOutRow;
  remaining: number; // 아직 어느 지출도 충당 안 한 금액
  allocated: Map<number, number>; // 과목 → 충당 금액
}

/**
 * 자금원이 확정된 행(Pass1 출력)을 받아 과목 배분.
 * 자금원(sheetAccSecCd)별로 그룹핑하여 각 그룹을 독립 처리한다.
 */
export function allocateIncomeToItems(rows: ReallocOutRow[]): ItemAllocOutRow[] {
  const groups = new Map<number, ReallocOutRow[]>();
  for (const r of rows) {
    const g = groups.get(r.sheetAccSecCd) ?? [];
    g.push(r);
    groups.set(r.sheetAccSecCd, g);
  }

  const out: ItemAllocOutRow[] = [];
  for (const group of groups.values()) {
    allocateOneSource(group, out);
  }
  return out;
}

function allocateOneSource(rows: ReallocOutRow[], out: ItemAllocOutRow[]): void {
  const sorted = [...rows].sort(
    (a, b) =>
      compareAccDateTime(a, b) ||
      a.incm_sec_cd - b.incm_sec_cd || // 동시각·미입력: 수입(1) 먼저 (잔액 음수 방지 SSOT)
      a.acc_book_id - b.acc_book_id,
  );

  // 과목별 수입 슬라이스 FIFO 큐
  const pools = new Map<number, IncomeSlice[]>();
  const slices: IncomeSlice[] = []; // 등장 순서 보존(출력용)
  const enqueue = (item: number, slice: IncomeSlice) => {
    const q = pools.get(item) ?? [];
    q.push(slice);
    pools.set(item, q);
  };

  for (const r of sorted) {
    if (r.incm_sec_cd === 1) {
      const slice: IncomeSlice = { src: r, remaining: r.effectiveAmt, allocated: new Map() };
      slices.push(slice);
      enqueue(r.item_sec_cd, slice);
      continue;
    }
    // 지출 — 환급/0은 원과목 유지, 수입 소비 안 함
    if (r.effectiveAmt <= 0) {
      out.push({ ...r, effectiveItemSecCd: r.item_sec_cd, itemOrigin: "as-is" });
      continue;
    }
    // 양수 지출(과목 M) — M 풀 먼저, 부족분은 다른 과목 풀에서(과목코드 오름차순)
    const M = r.item_sec_cd;
    let need = r.effectiveAmt;
    need = drawFromPool(pools.get(M), M, need);
    if (need > 0) {
      const otherItems = [...pools.keys()].filter((k) => k !== M).sort((a, b) => a - b);
      for (const K of otherItems) {
        if (need <= 0) break;
        need = drawFromPool(pools.get(K), M, need);
      }
    }
    // 지출 행은 원과목 유지(부족분 need>0이면 해당 과목 수입 부족 → 잔액 음수로 표면화)
    out.push({ ...r, effectiveItemSecCd: M, itemOrigin: "as-is" });
  }

  // 배분 종료 — 각 수입 슬라이스를 과목별로 출력. 잉여(remaining)는 원과목.
  for (const slice of slices) {
    const tags = new Map(slice.allocated);
    if (slice.remaining > 0) {
      tags.set(slice.src.item_sec_cd, (tags.get(slice.src.item_sec_cd) ?? 0) + slice.remaining);
    }
    const items = [...tags.entries()].filter(([, amt]) => amt !== 0);
    const isSplit = items.length > 1;
    for (const [item, amt] of items) {
      out.push({
        ...slice.src,
        effectiveItemSecCd: item,
        effectiveAmt: amt,
        itemOrigin:
          item === slice.src.item_sec_cd ? (isSplit ? "item-keep" : "as-is") : "item-moved",
        splitGroupId: isSplit ? slice.src.acc_book_id : slice.src.splitGroupId,
      });
    }
  }
}

/** 풀(FIFO 슬라이스 큐)에서 need만큼 끌어와 과목 M으로 태깅. 남은 need 반환. */
function drawFromPool(queue: IncomeSlice[] | undefined, M: number, need: number): number {
  if (!queue) return need;
  for (const slice of queue) {
    if (need <= 0) break;
    if (slice.remaining <= 0) continue;
    const take = Math.min(need, slice.remaining);
    slice.remaining -= take;
    slice.allocated.set(M, (slice.allocated.get(M) ?? 0) + take);
    need -= take;
  }
  return need;
}
