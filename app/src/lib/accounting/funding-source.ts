/* ------------------------------------------------------------------ */
/*  자금원(funding source) 분류                                          */
/*  acc_book.acc_sec_cd → 후보자자산/후원회기부금/보조금/보조금외          */
/*  근거: 선거비용 보전청구서(서식 1) 청구내역 자금원별 4분류              */
/* ------------------------------------------------------------------ */

export type FundingSource =
  | "후보자자산"
  | "후원회기부금"
  | "보조금"
  | "보조금외"
  | "기타";

export const FUNDING_SOURCE_BY_ACC_SEC_CD: Record<number, FundingSource> = {
  82: "보조금",
  83: "보조금외",
  84: "후보자자산",
  85: "후원회기부금",
};

export function classifyFundingSource(
  accSecCd: number,
  accSecName?: string,
): FundingSource {
  if (FUNDING_SOURCE_BY_ACC_SEC_CD[accSecCd]) {
    return FUNDING_SOURCE_BY_ACC_SEC_CD[accSecCd];
  }
  if (!accSecName) return "기타";
  if (accSecName.includes("보조금외")) return "보조금외";
  if (accSecName.includes("보조금")) return "보조금";
  if (accSecName.includes("후원") || accSecName.includes("기부")) return "후원회기부금";
  if (accSecName.includes("자산")) return "후보자자산";
  return "기타";
}
