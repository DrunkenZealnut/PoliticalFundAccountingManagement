/* ------------------------------------------------------------------ */
/*  과목 배분 — 분할 행 세트 산출(메모리 전용, 순수)                        */
/*                                                                    */
/*  buildLedgerRows로 산출한 (계정×과목) 배분을, slice0(원행 id 재사용) +    */
/*  이동분(신규 id) 형태의 acc_book 행 세트로 materialize 한다.            */
/*  현재 유일 소비처: api/system/export-sqlite — acc_book(데이터)은 실거래   */
/*  원본 그대로 두고, 이 함수들로 .db(보고자료)용 분할 행을 메모리에서만     */
/*  만든다(DB write 없음). slice0가 원 acc_book_id를 유지해 영수증·메타가     */
/*  분할 후에도 한 행에 보존되고, 이동분에만 새 id를 부여한다. 과거 acc_book  */
/*  영구화에 쓰였으나 "보고 시점 분할" 전환으로 DB write는 폐기됐다(추적      */
/*  컬럼 raw_·alloc_ 은 export strip 대상이라 .db엔 안 남는다).               */
/* ------------------------------------------------------------------ */
import { buildLedgerRows } from "./ledger-allocation";
import type { ReallocRow, ReallocCustomer } from "./fund-realloc";

/** acc_book 행 + 과목배분 추적 컬럼(scripts/016). 메타는 인덱스 시그니처로 통과. */
export interface AllocTrackedRow {
  acc_book_id: number;
  incm_sec_cd: number;
  acc_sec_cd: number;
  item_sec_cd: number;
  acc_amt: number;
  acc_date: string;
  cust_id: number;
  content: string | null;
  rcp_no: string | null;
  rcp_no2: number | null;
  bigo: string | null;
  customer: ReallocCustomer | null;
  // 추적(scripts/016) — raw/미변경은 전부 null
  alloc_src_id: number | null;
  alloc_seq: number | null;
  raw_incm_sec_cd: number | null;
  raw_acc_sec_cd: number | null;
  raw_item_sec_cd: number | null;
  raw_acc_amt: number | null;
  alloc_gen: string | null;
  [key: string]: unknown; // exp_sec_cd, rcp_yn, addr 등 메타 통과
}

const TRACKING_KEYS = [
  "alloc_src_id",
  "alloc_seq",
  "raw_incm_sec_cd",
  "raw_acc_sec_cd",
  "raw_item_sec_cd",
  "raw_acc_amt",
  "alloc_gen",
] as const;

function clearTracking<T extends AllocTrackedRow>(r: T): T {
  const out = { ...r };
  for (const k of TRACKING_KEYS) (out as Record<string, unknown>)[k] = null;
  return out;
}

/**
 * 현재(이미 배분됐을 수 있는) acc_book 행 → 원본 raw 행 복원.
 * - 이동분(alloc_src_id != null) 제거.
 * - slice0(raw_acc_amt != null) → raw_* 로 원복.
 * - 미변경 행 → 추적컬럼만 정리.
 */
export function reconstructRawRows<T extends AllocTrackedRow>(rows: T[]): T[] {
  const out: T[] = [];
  for (const r of rows) {
    if (r.alloc_src_id != null) continue; // 이동분
    if (r.raw_acc_amt == null) {
      out.push(clearTracking(r)); // 미변경
    } else {
      out.push(
        clearTracking({
          ...r,
          incm_sec_cd: r.raw_incm_sec_cd ?? r.incm_sec_cd,
          acc_sec_cd: r.raw_acc_sec_cd ?? r.acc_sec_cd,
          item_sec_cd: r.raw_item_sec_cd ?? r.item_sec_cd,
          acc_amt: r.raw_acc_amt,
        }),
      );
    }
  }
  return out;
}

function toReallocRow(r: AllocTrackedRow): ReallocRow {
  return {
    acc_book_id: r.acc_book_id,
    incm_sec_cd: r.incm_sec_cd,
    acc_sec_cd: r.acc_sec_cd,
    item_sec_cd: r.item_sec_cd,
    acc_date: r.acc_date,
    acc_amt: r.acc_amt,
    content: r.content,
    rcp_no: r.rcp_no,
    bigo: r.bigo,
    cust_id: r.cust_id,
    customer: r.customer,
  };
}

export interface AllocPersistPlan {
  generation: string;
  deleteMovedIds: number[]; // 기존 이동분(재실행 시 제거)
  updates: AllocTrackedRow[]; // slice0 (acc_book_id 재사용)
  inserts: Omit<AllocTrackedRow, "acc_book_id">[]; // 이동분(신규)
  stats: {
    rawRows: number;
    ledgerRows: number;
    updated: number;
    inserted: number;
    deletedMoved: number;
    sourcesSplit: number;
  };
}

/**
 * 현재 acc_book 후보 행 → 영구화 계획. 내부적으로 raw 복원 → buildLedgerRows → slice0/이동분 분류.
 * generation = 실행일(YYYYMMDD), 호출부가 주입(테스트 결정성).
 */
export function planAllocationPersist(current: AllocTrackedRow[], generation: string): AllocPersistPlan {
  const deleteMovedIds = current.filter((r) => r.alloc_src_id != null).map((r) => r.acc_book_id);
  const raw = reconstructRawRows(current);
  const rawById = new Map(raw.map((r) => [r.acc_book_id, r]));

  const ledger = buildLedgerRows(raw.map(toReallocRow));
  const byId = new Map<number, typeof ledger>();
  for (const lr of ledger) {
    const g = byId.get(lr.acc_book_id) ?? [];
    g.push(lr);
    byId.set(lr.acc_book_id, g);
  }

  const updates: AllocTrackedRow[] = [];
  const inserts: Omit<AllocTrackedRow, "acc_book_id">[] = [];
  let sourcesSplit = 0;

  for (const [id, slices] of byId) {
    const rawRow = rawById.get(id);
    if (!rawRow) continue; // 방어
    const isSplit = slices.length > 1;
    if (isSplit) sourcesSplit++;

    // slice0 = raw (계정·과목) 일치분 중 최대 금액, 없으면 전체 중 최대 금액(결정적)
    const matching = slices.filter((s) => s.accSecCd === rawRow.acc_sec_cd && s.itemSecCd === rawRow.item_sec_cd);
    const pool = matching.length ? matching : slices;
    const primary = pool.reduce((a, b) => (b.amt > a.amt ? b : a));

    const changed =
      isSplit ||
      primary.incm_sec_cd !== rawRow.incm_sec_cd ||
      primary.accSecCd !== rawRow.acc_sec_cd ||
      primary.itemSecCd !== rawRow.item_sec_cd ||
      primary.amt !== rawRow.acc_amt;

    updates.push({
      ...rawRow,
      acc_book_id: id,
      incm_sec_cd: primary.incm_sec_cd,
      acc_sec_cd: primary.accSecCd,
      item_sec_cd: primary.itemSecCd,
      acc_amt: primary.amt,
      alloc_src_id: null,
      alloc_seq: 0,
      alloc_gen: generation,
      raw_incm_sec_cd: changed ? rawRow.incm_sec_cd : null,
      raw_acc_sec_cd: changed ? rawRow.acc_sec_cd : null,
      raw_item_sec_cd: changed ? rawRow.item_sec_cd : null,
      raw_acc_amt: changed ? rawRow.acc_amt : null,
    });

    let seq = 1;
    for (const s of slices) {
      if (s === primary) continue;
      const { acc_book_id: _omit, ...meta } = rawRow;
      void _omit;
      inserts.push({
        ...meta,
        incm_sec_cd: s.incm_sec_cd,
        acc_sec_cd: s.accSecCd,
        item_sec_cd: s.itemSecCd,
        acc_amt: s.amt,
        alloc_src_id: id, // 출처 raw id
        alloc_seq: seq++,
        alloc_gen: generation,
        raw_incm_sec_cd: null,
        raw_acc_sec_cd: null,
        raw_item_sec_cd: null,
        raw_acc_amt: null,
      });
    }
  }

  return {
    generation,
    deleteMovedIds,
    updates,
    inserts,
    stats: {
      rawRows: raw.length,
      ledgerRows: ledger.length,
      updated: updates.length,
      inserted: inserts.length,
      deletedMoved: deleteMovedIds.length,
      sourcesSplit,
    },
  };
}

/**
 * 계획을 인메모리로 적용. export-sqlite가 (계정×과목) 분할 행 세트(이동분에 새 id 부여)를
 * 만드는 데 사용한다(DB write 없음). 이동분 신규 id는 기존 최대 +1.. 로 결정적 부여.
 */
export function applyPlanInMemory(current: AllocTrackedRow[], plan: AllocPersistPlan): AllocTrackedRow[] {
  const del = new Set(plan.deleteMovedIds);
  const updateById = new Map(plan.updates.map((u) => [u.acc_book_id, u]));
  const result: AllocTrackedRow[] = [];

  for (const r of current) {
    if (del.has(r.acc_book_id)) continue; // 이동분 제거
    const u = updateById.get(r.acc_book_id);
    result.push(u ?? clearTracking(r));
    updateById.delete(r.acc_book_id);
  }
  // current에 없던 update(방어) — 보통 없음
  for (const u of updateById.values()) result.push(u);

  let nextId = result.reduce((m, r) => Math.max(m, r.acc_book_id), 0) + 1;
  for (const ins of plan.inserts) {
    result.push({ ...ins, acc_book_id: nextId++ } as AllocTrackedRow);
  }
  return result;
}
