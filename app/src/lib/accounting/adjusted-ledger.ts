/* ------------------------------------------------------------------ */
/*  재조정 데이터(보고용) SSOT — 원본 acc_book → (계정×과목) 재조정 행      */
/*                                                                    */
/*  원본 acc_book(실거래)은 불변. 후보자(자금원 82~85)면 보고 시점에       */
/*  planAllocationPersist/applyPlanInMemory로 (계정×과목) 분할 행을        */
/*  메모리에서만 만든다(이동분에 신규 acc_book_id 부여 → 행마다 고유 id,    */
/*  영수증 채번·React key 안전). 비후보자는 원본 그대로.                  */
/*                                                                    */
/*  소비처: api/system/export-sqlite(.db) + 재조정 데이터 뷰어            */
/*  (dashboard/income-expense-book). 둘이 이 함수를 공유해 "화면 == .db".  */
/* ------------------------------------------------------------------ */
import { planAllocationPersist, applyPlanInMemory, type AllocTrackedRow } from "./persist-allocation";
import { isFundingSourceAccSecCd } from "./funding-source";

/**
 * 원본 acc_book 행 → 보고용 재조정 행(메모리 전용, 순수).
 * 후보자(82~85 존재)면 (계정×과목) 분할(이동분 신규 id), 아니면 원본 그대로.
 * 입력 메타(customer·rcp_no·content 등)는 spread로 보존된다.
 */
export function buildAdjustedAccBook(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const isCandidate = rows.some((r) => isFundingSourceAccSecCd(Number(r.acc_sec_cd)));
  if (!isCandidate) return rows;
  const input = rows.map((r) => ({
    ...r,
    acc_book_id: Number(r.acc_book_id),
    incm_sec_cd: Number(r.incm_sec_cd),
    acc_sec_cd: Number(r.acc_sec_cd),
    item_sec_cd: Number(r.item_sec_cd),
    acc_amt: Number(r.acc_amt ?? 0),
    acc_time: (r.acc_time as string | null | undefined) ?? null,
    customer: (r.customer as Record<string, unknown> | null | undefined) ?? null,
  })) as unknown as AllocTrackedRow[];
  const plan = planAllocationPersist(input, "");
  return applyPlanInMemory(input, plan) as Record<string, unknown>[];
}

export type AdjustedOrigin = "원본" | "이동" | "분할";

/**
 * 재조정 행 배열의 각 행 구분(원본/이동/분할)을 반환(입력과 같은 순서).
 *  - 한 원천(raw acc_book_id)이 2행 이상으로 나뉘면 그 행들은 "분할".
 *  - 단일 행이 자금원만 바뀌었으면 "이동"(raw_acc_sec_cd 기록됨 또는 이동분).
 *  - 그 외(미변경) "원본".
 */
export function adjustedOrigins(rows: Record<string, unknown>[]): AdjustedOrigin[] {
  const srcCount = new Map<number, number>();
  const srcOf = (r: Record<string, unknown>): number =>
    (r.alloc_src_id as number | null | undefined) ?? Number(r.acc_book_id);
  for (const r of rows) srcCount.set(srcOf(r), (srcCount.get(srcOf(r)) ?? 0) + 1);
  return rows.map((r) => {
    if ((srcCount.get(srcOf(r)) ?? 1) > 1) return "분할";
    const moved = r.alloc_src_id != null || r.raw_acc_sec_cd != null;
    return moved ? "이동" : "원본";
  });
}

/**
 * 재배분으로 자금원(계정)이 바뀐 행의 비고 note("재배분 {원}→{현}")를 반환(입력과 같은 순서).
 * 원본·미변경 행은 null.
 *  - 이동분(alloc_src_id != null): 원천 = slice0(같은 acc_book_id==alloc_src_id)의 raw_acc_sec_cd(없으면 그 행의 acc_sec_cd).
 *  - slice0/단일 이동(alloc_src_id == null): raw_acc_sec_cd 가 원천(없으면 미변경).
 *  - `to`(현 acc_sec_cd)와 같으면 null. `accName` 미지정 시 코드 숫자로 표기(테스트 친화).
 */
export function adjustedNotes(
  rows: Record<string, unknown>[],
  accName?: (cv: number) => string,
): (string | null)[] {
  const name = (cv: number) => accName?.(cv) ?? String(cv);
  const byId = new Map<number, Record<string, unknown>>();
  for (const r of rows) byId.set(Number(r.acc_book_id), r);
  return rows.map((r) => {
    const to = Number(r.acc_sec_cd);
    // 이동분(alloc_src_id != null)은 원천 행(slice0), 아니면 자기 자신에서 원래 자금원을 읽는다.
    // 미변경 행은 raw_acc_sec_cd가 없어 acc_sec_cd로 폴백 → 아래 from===to 가드에서 걸러진다.
    const origin = r.alloc_src_id != null ? byId.get(Number(r.alloc_src_id)) : r;
    const from =
      origin == null
        ? null
        : origin.raw_acc_sec_cd != null
          ? Number(origin.raw_acc_sec_cd)
          : Number(origin.acc_sec_cd);
    if (from == null || from === to) return null;
    return `재배분 ${name(from)}→${name(to)}`;
  });
}
