/* ------------------------------------------------------------------ */
/*  자금원 음수잔액 해소 재배분 (Option B: 단일 현금풀 캐스케이드)        */
/*                                                                    */
/*  단일 통합계좌의 거래를 시간순으로 훑으며, 한 자금원(acc_sec_cd)의      */
/*  지출이 그 시점 가용액을 초과하면 부족분을 다른 자금원(우선순위)으로    */
/*  연쇄 이동(필요 시 한 지출을 여러 자금원으로 분할)한다. 통장 총잔액이    */
/*  항상 ≥ 0이면 어떤 자금원도 음수가 되지 않는 배분이 보장된다           */
/*  (임의 시점 Σ가용 = 통장잔액 ≥ 0 ≥ 처리 직전 필요액).                 */
/*                                                                    */
/*  report-only: acc_book 원본을 수정하지 않고 표시용 배분만 산출.        */
/*  환급(음수 지출)은 원 자금원 가용을 복원하며 재배분하지 않는다.         */
/*  정렬 SSOT: acc-book-sort.ts(compareAccDateTime).                   */
/* ------------------------------------------------------------------ */
import { compareAccDateTime } from "./acc-book-sort";

export interface ReallocCustomer {
  name: string | null;
  reg_num: string | null;
  addr: string | null;
  job: string | null;
  tel: string | null;
}

/** 재배분 입력 행 (acc_book 조회 결과에서 필요한 필드). */
export interface ReallocRow {
  acc_book_id: number;
  incm_sec_cd: number; // 1=수입, 2=지출
  acc_sec_cd: number; // 자금원
  item_sec_cd: number; // 과목(보존)
  acc_date: string; // YYYYMMDD
  acc_time: string | null; // HHmm
  acc_amt: number; // 환급은 음수
  content: string | null;
  rcp_no: string | null;
  bigo: string | null;
  cust_id: number;
  customer: ReallocCustomer | null;
}

/** 재배분 후 시트 배치용 출력 행. */
export interface ReallocOutRow extends ReallocRow {
  sheetAccSecCd: number; // 표시될 자금원 시트
  effectiveAmt: number; // (분할 후) 이 행의 금액
  origin: "as-is" | "split-keep" | "split-moved";
  splitGroupId?: number; // 분할된 원거래 묶음(=원 acc_book_id)
  note?: string;
}

export interface Redistribution {
  acc_book_id: number;
  acc_date: string;
  fromAccSecCd: number;
  toAccSecCd: number;
  movedAmt: number;
}

export interface Shortfall {
  acc_book_id: number;
  acc_date: string;
  accSecCd: number;
  shortAmt: number; // 풀 전체가 부족해 메우지 못한 금액(통장 ≥ 0이면 발생 안 함)
}

export interface ReallocResult {
  rows: ReallocOutRow[];
  redistributions: Redistribution[];
  shortfalls: Shortfall[];
}

export interface ReallocOptions {
  /** 부족분을 흡수할 자금원 우선순위. 기본 [84(후보자자산), 83(보조금외), 82(보조금)]. */
  overflowPriority?: number[];
}

const DEFAULT_PRIORITY = [84, 83, 82];

/**
 * 시간순 캐스케이드 재배분. 통장 총잔액이 항상 ≥ 0이면 shortfalls 는 빈 배열이며
 * 모든 자금원의 시간순 잔액이 음수가 되지 않는다.
 */
export function reallocateFundSources(
  rows: ReallocRow[],
  opts: ReallocOptions = {},
): ReallocResult {
  const priority = opts.overflowPriority ?? DEFAULT_PRIORITY;
  const sorted = [...rows].sort(
    (a, b) => compareAccDateTime(a, b) || a.acc_book_id - b.acc_book_id,
  );

  const avail = new Map<number, number>();
  const get = (s: number) => avail.get(s) ?? 0;
  const out: ReallocOutRow[] = [];
  const redistributions: Redistribution[] = [];
  const shortfalls: Shortfall[] = [];

  for (const r of sorted) {
    // 수입: 가용 누적
    if (r.incm_sec_cd === 1) {
      avail.set(r.acc_sec_cd, get(r.acc_sec_cd) + r.acc_amt);
      out.push({ ...r, sheetAccSecCd: r.acc_sec_cd, effectiveAmt: r.acc_amt, origin: "as-is" });
      continue;
    }
    // 지출 — 환급/0은 원 자금원 유지(가용 복원), 재배분 안 함
    if (r.acc_amt <= 0) {
      avail.set(r.acc_sec_cd, get(r.acc_sec_cd) - r.acc_amt);
      out.push({ ...r, sheetAccSecCd: r.acc_sec_cd, effectiveAmt: r.acc_amt, origin: "as-is" });
      continue;
    }

    // 양수 지출 — 원 자금원 먼저, 부족분 캐스케이드
    const S = r.acc_sec_cd;
    let need = r.acc_amt;
    const useS = Math.min(need, Math.max(0, get(S)));
    avail.set(S, get(S) - useS);
    need -= useS;

    const moves: { to: number; amt: number }[] = [];
    // 1) 우선순위 자금원
    for (const O of priority) {
      if (need <= 0) break;
      if (O === S) continue;
      const a = Math.max(0, get(O));
      if (a <= 0) continue;
      const u = Math.min(need, a);
      avail.set(O, get(O) - u);
      need -= u;
      moves.push({ to: O, amt: u });
    }
    // 2) 우선순위에 없는 나머지 자금원(가용 있는 것) — 음수 0 보장 위해
    if (need > 0) {
      for (const O of [...avail.keys()]) {
        if (need <= 0) break;
        if (O === S || priority.includes(O)) continue;
        const a = Math.max(0, get(O));
        if (a <= 0) continue;
        const u = Math.min(need, a);
        avail.set(O, get(O) - u);
        need -= u;
        moves.push({ to: O, amt: u });
      }
    }

    const split = moves.length > 0;
    // 원 자금원 잔류분(0보다 클 때만 행 생성; 분할 아니면 통째)
    if (useS > 0 || !split) {
      out.push({
        ...r,
        sheetAccSecCd: S,
        effectiveAmt: useS,
        origin: split ? "split-keep" : "as-is",
        splitGroupId: split ? r.acc_book_id : undefined,
      });
    }
    // 이동분
    for (const m of moves) {
      out.push({
        ...r,
        sheetAccSecCd: m.to,
        effectiveAmt: m.amt,
        origin: "split-moved",
        splitGroupId: r.acc_book_id,
        note: `재배분 #${r.acc_book_id} ${S}→${m.to}`,
      });
      redistributions.push({
        acc_book_id: r.acc_book_id,
        acc_date: r.acc_date,
        fromAccSecCd: S,
        toAccSecCd: m.to,
        movedAmt: m.amt,
      });
    }
    // 풀 전체 부족(통장 ≥ 0이면 발생 안 함) — 원 자금원에 음수로 잔류
    if (need > 0) {
      avail.set(S, get(S) - need);
      out.push({
        ...r,
        sheetAccSecCd: S,
        effectiveAmt: need,
        origin: split ? "split-keep" : "as-is",
        splitGroupId: split ? r.acc_book_id : undefined,
        note: `진짜부족 ${need}`,
      });
      shortfalls.push({ acc_book_id: r.acc_book_id, acc_date: r.acc_date, accSecCd: S, shortAmt: need });
    }
  }

  return { rows: out, redistributions, shortfalls };
}
