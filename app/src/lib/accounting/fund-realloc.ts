/* ------------------------------------------------------------------ */
/*  자금원 재배분 (총액 기준 + 지출 자금원 보호, funding-realloc-scrap-guard) */
/*                                                                    */
/*  지출은 원 자금원·과목을 유지한다(같은 자금원의 미래 수입으로 충당,   */
/*  시간순 중간 잔액 음수 허용 — 자산 입금이 지출보다 늦게 들어오는 경우). */
/*  자금원별 총액(수입−지출, 환급 반영)이 부족한 자금원의 부족분만, 총액   */
/*  잉여 자금원(우선순위)으로 이동한다. 이동 대상은 시간순 마지막 지출부터  */
/*  고른다 — 확성장치처럼 앞선 자산성 지출은 자동 보호되고, 원 자금원에     */
/*  1~수십 원짜리 소액 자투리를 남기지 않는다(부족분만큼만 통째/1건 분할). */
/*  통장 총잔액이 음수면 그만큼 미충당(shortfalls)으로 표면화.            */
/*  최종 자금원별 잔액·통장 총잔액·자금원별 지출합은 불변(이동만).         */
/*                                                                    */
/*  report-only: acc_book 원본 불변. 환급(음수 지출)은 원 자금원 유지.    */
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
  itemSecCd?: number; // 과목 잔여(detectItemResiduals — 재배분 후에도 0 안 된 과목)일 때만. Pass1 통장부족은 미설정.
  shortAmt: number; // 자금원 총액 부족(통장 총잔액 ≥ 0이면 상쇄되어 발생 안 함) 또는 과목 잔여액.
}

export interface ReallocResult {
  rows: ReallocOutRow[];
  redistributions: Redistribution[];
  shortfalls: Shortfall[];
}

export interface ReallocOptions {
  /** 부족분을 흡수할 자금원 우선순위. 기본 [84(후보자자산), 83(보조금외), 82(보조금)]. */
  overflowPriority?: number[];
  /** 이동 대상에서 제외(원 자금원 강제 유지)할 원거래 id. 자산성 지출 보호용(옵션). */
  protectIds?: Set<number>;
}

const DEFAULT_PRIORITY = [84, 83, 82];

/**
 * 총액 기준 재배분. 지출은 원 자금원·과목 유지(미래 수입 충당, 중간 음수 허용).
 * 자금원별 총액 부족분만 잉여 자금원으로 이동(시간순 마지막 지출부터, 소액 자투리 방지).
 * 통장 총잔액 ≥ 0이면 shortfalls 는 빈 배열이며, 최종 자금원별 잔액이 모두 ≥ 0이 된다.
 */
export function reallocateFundSources(
  rows: ReallocRow[],
  opts: ReallocOptions = {},
): ReallocResult {
  const priority = opts.overflowPriority ?? DEFAULT_PRIORITY;
  const protectIds = opts.protectIds ?? new Set<number>();
  const out: ReallocOutRow[] = [];
  const redistributions: Redistribution[] = [];
  const shortfalls: Shortfall[] = [];

  // 1) 자금원별 총액(환급 반영: acc_amt 그대로 합산 — 음수 지출은 순지출을 낮춘다).
  const netIn = new Map<number, number>();
  const netOut = new Map<number, number>();
  for (const r of rows) {
    if (r.incm_sec_cd === 1) netIn.set(r.acc_sec_cd, (netIn.get(r.acc_sec_cd) ?? 0) + r.acc_amt);
    else netOut.set(r.acc_sec_cd, (netOut.get(r.acc_sec_cd) ?? 0) + r.acc_amt);
  }
  const sources = new Set<number>([...netIn.keys(), ...netOut.keys()]);
  const deficit = new Map<number, number>(); // 자금원 → 총 부족(총지출−총수입 > 0)
  const surplus = new Map<number, number>(); // 자금원 → 총 잉여
  for (const s of sources) {
    const d = (netOut.get(s) ?? 0) - (netIn.get(s) ?? 0);
    if (d > 0) deficit.set(s, d);
    else if (d < 0) surplus.set(s, -d);
  }

  // 2) 이동 계획: 부족 자금원의 부족분을 잉여 자금원(우선순위 순)으로,
  //    시간순 마지막 지출부터 통째 이동(부족분에 걸치는 1건만 분할).
  const moveOf = new Map<number, { to: number; amt: number }[]>(); // acc_book_id → 이동분
  const surRemain = new Map(surplus);
  const surOrder = [
    ...priority.filter((s) => surRemain.has(s)),
    ...[...surRemain.keys()].filter((s) => !priority.includes(s)),
  ];
  for (const [S, defAmt] of deficit) {
    let need = defAmt;
    const exps = rows
      .filter(
        (r) =>
          r.acc_sec_cd === S &&
          r.incm_sec_cd === 2 &&
          r.acc_amt > 0 &&
          !protectIds.has(r.acc_book_id),
      )
      .sort((a, b) => compareAccDateTime(b, a) || b.acc_book_id - a.acc_book_id); // 시간 역순
    for (const r of exps) {
      if (need <= 0) break;
      let avail = r.acc_amt;
      const doMove = (T: number, m: number) => {
        const arr = moveOf.get(r.acc_book_id) ?? [];
        arr.push({ to: T, amt: m });
        moveOf.set(r.acc_book_id, arr);
        need -= m;
        avail -= m;
        surRemain.set(T, (surRemain.get(T) ?? 0) - m);
        redistributions.push({
          acc_book_id: r.acc_book_id,
          acc_date: r.acc_date,
          fromAccSecCd: S,
          toAccSecCd: T,
          movedAmt: m,
        });
      };
      // 이 지출에서 옮길 양(toMove)을 "단독으로 덮는" 잉여 자금원을 우선순위 순으로 먼저 선택
      // → 소액 잉여(예: 84의 58원)를 부분 충당해 자투리 조각을 만드는 것을 방지(v0.24 로직 계승).
      const toMove = Math.min(avail, need);
      let covered = false;
      if (toMove > 0) {
        for (const T of surOrder) {
          if (T === S) continue;
          if ((surRemain.get(T) ?? 0) >= toMove) {
            doMove(T, toMove);
            covered = true;
            break;
          }
        }
      }
      // 단독 충당 가능한 잉여가 없으면 우선순위 순 greedy 부분 충당(통장 총잔액 ≥0 보장 하)
      if (!covered) {
        for (const T of surOrder) {
          if (need <= 0 || avail <= 0) break;
          if (T === S) continue;
          const sr = surRemain.get(T) ?? 0;
          if (sr <= 0) continue;
          const m = Math.min(avail, need, sr);
          if (m > 0) doMove(T, m);
        }
      }
    }
    // 잉여로도 못 메운 부족(통장 총잔액 음수 = 진짜 부족) 표면화
    if (need > 0) shortfalls.push({ acc_book_id: 0, acc_date: "", accSecCd: S, shortAmt: need });
  }

  // 3) 각 행 출력. 수입·환급·0·미이동 지출은 원 자금원 유지, 이동 지출은 잔류분+이동분 분할.
  for (const r of rows) {
    if (r.incm_sec_cd === 1 || r.acc_amt <= 0) {
      out.push({ ...r, sheetAccSecCd: r.acc_sec_cd, effectiveAmt: r.acc_amt, origin: "as-is" });
      continue;
    }
    const moves = moveOf.get(r.acc_book_id);
    if (!moves || moves.length === 0) {
      out.push({ ...r, sheetAccSecCd: r.acc_sec_cd, effectiveAmt: r.acc_amt, origin: "as-is" });
      continue;
    }
    const movedTotal = moves.reduce((s, m) => s + m.amt, 0);
    const keep = r.acc_amt - movedTotal;
    if (keep > 0) {
      out.push({
        ...r,
        sheetAccSecCd: r.acc_sec_cd,
        effectiveAmt: keep,
        origin: "split-keep",
        splitGroupId: r.acc_book_id,
      });
    }
    for (const m of moves) {
      out.push({
        ...r,
        sheetAccSecCd: m.to,
        effectiveAmt: m.amt,
        origin: "split-moved",
        splitGroupId: r.acc_book_id,
        note: `재배분 #${r.acc_book_id} ${r.acc_sec_cd}→${m.to}`,
      });
    }
  }

  return { rows: out, redistributions, shortfalls };
}
