/* ------------------------------------------------------------------ */
/*  보전청구 자금원별 집계                                              */
/*  acc_book에서 보전 체크된 선거비용 지출을 자금원 4개 카테고리로 합산  */
/* ------------------------------------------------------------------ */

import { classifyFundingSource, type FundingSource } from "./funding-source";

export interface ClaimAmounts {
  후보자자산: number;
  후원회기부금: number;
  보조금: number;
  보조금외: number;
  합계: number;
}

export interface AccBookRow {
  acc_book_id: number;
  acc_sec_cd: number;
  item_sec_cd: number;
  acc_amt: number;
  acc_print_ok: string | null;
  incm_sec_cd: number;
}

export interface AggregateInput {
  /** 지출 거래 행들 (org_id 등 사전 필터링 완료 가정) */
  rows: AccBookRow[];
  /** "선거비용" 과목에 해당하는 item_sec_cd 코드들 (UI에서 codes lookup 후 전달) */
  electionExpenseItemCds: number[];
  /** acc_sec_cd → 코드명 (이름 폴백용, 선택) */
  accSecCdNames?: Record<number, string>;
}

export interface AggregateOutput {
  byFundingSource: ClaimAmounts;
  /** 집계에 포함된 거래 건수 */
  rowCount: number;
  /** 보전 미체크로 제외된 거래 건수 */
  uncheckedCount: number;
  /** 선거비용외(item_sec_cd 미일치)로 제외된 거래 건수 */
  nonElectionCount: number;
}

const EMPTY_AMOUNTS: ClaimAmounts = {
  후보자자산: 0,
  후원회기부금: 0,
  보조금: 0,
  보조금외: 0,
  합계: 0,
};

/**
 * 자금원별 보전청구 합계를 계산합니다.
 *
 * 필터 조건 (모두 만족하는 행만 합산):
 * 1. incm_sec_cd === 2 (지출)
 * 2. acc_print_ok === 'Y' (보전 체크됨)
 * 3. item_sec_cd ∈ electionExpenseItemCds (선거비용 과목)
 * 4. acc_amt > 0 (양수만)
 */
export function aggregateReimbursementByFundingSource(
  input: AggregateInput,
): AggregateOutput {
  const electionItemSet = new Set(input.electionExpenseItemCds);
  const sums: ClaimAmounts = { ...EMPTY_AMOUNTS };
  let rowCount = 0;
  let uncheckedCount = 0;
  let nonElectionCount = 0;

  for (const r of input.rows) {
    if (r.incm_sec_cd !== 2) continue;
    if (r.acc_amt <= 0) continue;
    if (!electionItemSet.has(r.item_sec_cd)) {
      nonElectionCount++;
      continue;
    }
    if (r.acc_print_ok !== "Y") {
      uncheckedCount++;
      continue;
    }
    const source: FundingSource = classifyFundingSource(
      r.acc_sec_cd,
      input.accSecCdNames?.[r.acc_sec_cd],
    );
    if (source === "기타") continue;
    sums[source] += r.acc_amt;
    sums.합계 += r.acc_amt;
    rowCount++;
  }

  return {
    byFundingSource: sums,
    rowCount,
    uncheckedCount,
    nonElectionCount,
  };
}
