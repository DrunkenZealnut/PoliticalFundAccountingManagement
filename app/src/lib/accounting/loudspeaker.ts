/* ------------------------------------------------------------------ */
/*  Pass-L: 확성기 앵커                                                 */
/*  적요에 '확성기'를 포함하고 금액이 540,000인 지출을 후보자자산(84)·    */
/*  선거비용(86)으로 강제하고, 재배분(Pass1) 이동 대상에서 제외한다.      */
/*  근거: 확성장치는 후보자 자산으로 부담하는 선거비용(사용자 규칙).       */
/* ------------------------------------------------------------------ */
export const LOUDSPEAKER_KEYWORD = "확성기";
export const LOUDSPEAKER_AMOUNT = 540000;
export const LOUDSPEAKER_ACC_SEC_CD = 84; // 후보자자산
export const LOUDSPEAKER_ITEM_SEC_CD = 86; // 선거비용

interface LoudspeakerRow {
  acc_book_id: number;
  incm_sec_cd: number;
  acc_sec_cd: number;
  item_sec_cd: number;
  acc_amt: number;
  content: string | null;
}

export interface LoudspeakerResult<T> {
  rows: T[];
  protectIds: Set<number>;
}

/** 지출(incm=2) ∧ 적요에 '확성기' 포함 ∧ 금액 540,000. */
export function isLoudspeakerExpense(r: LoudspeakerRow): boolean {
  return (
    r.incm_sec_cd === 2 &&
    r.acc_amt === LOUDSPEAKER_AMOUNT &&
    (r.content ?? "").includes(LOUDSPEAKER_KEYWORD)
  );
}

/** 확성기 지출을 (84,86)으로 강제하고 protectIds에 수집(원본 배열은 불변, 새 배열 반환). */
export function applyLoudspeakerAnchor<T extends LoudspeakerRow>(rows: T[]): LoudspeakerResult<T> {
  const protectIds = new Set<number>();
  const out = rows.map((r) => {
    if (isLoudspeakerExpense(r)) {
      protectIds.add(r.acc_book_id);
      return { ...r, acc_sec_cd: LOUDSPEAKER_ACC_SEC_CD, item_sec_cd: LOUDSPEAKER_ITEM_SEC_CD };
    }
    return r;
  });
  return { rows: out, protectIds };
}
