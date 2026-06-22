/* ------------------------------------------------------------------ */
/*  자금원 입력일 기준 가용잔액 (지출 입력 가드)                          */
/*                                                                    */
/*  후보자 지출 입력 시, 입력하려는 거래일까지의 자금원별 가용잔액과        */
/*  "이 지출을 저장하면 잔액이 어떻게 되는지"를 계산한다(순수 함수).        */
/*                                                                    */
/*  누계 규칙은 [[negative-balance-reallocation]]의 fund-realloc.ts 와    */
/*  동일: 수입(+acc_amt)·지출(−acc_amt), 환급(음수 지출)은 부호 보존으로     */
/*  가용을 복원(acc_amt !== 0). 단일 통합계좌 현실상 "가용 음수"는 현금      */
/*  부족이 아니라 태깅 불일치(→ 수입지출부·결산 음수, 사후 재배분 필요)다.   */
/*  거래 시각(시분초)은 쓰지 않으므로 같은 거래일은 전부 포함한다.          */
/* ------------------------------------------------------------------ */

export interface AsOfRow {
  acc_sec_cd: number; // 자금원 82~85
  incm_sec_cd: number; // 1=수입, 2=지출
  acc_date: string; // YYYYMMDD
  acc_amt: number; // 환급은 음수
  acc_book_id?: number; // 수정 시 자기 제외용
}

export interface DraftExpense {
  acc_sec_cd: number;
  acc_amt: number; // 입력 중 금액(>0 가정; ≤0이면 미리보기상 차감 없음)
  acc_date: string;
  excludeAccBookId?: number;
}

export interface SourceAvail {
  accSecCd: number;
  available: number;
}

export interface DraftPreview {
  source: number;
  current: number; // 입력 전 해당 자금원 as-of 가용
  projected: number; // 입력 후 = current − max(0, acc_amt)
  willGoNegative: boolean;
  bySource: SourceAvail[]; // 전 자금원 as-of 가용(여유 내림차순)
}

export interface AvailableAsOfOptions {
  excludeAccBookId?: number;
}

/** 행이 asOfDate 거래일 이하인가(같은 날짜는 전부 포함). */
function atOrBefore(row: AsOfRow, asOfDate: string): boolean {
  return row.acc_date <= asOfDate;
}

/**
 * 자금원별 입력 거래일까지의 가용잔액.
 * 수입 +acc_amt, 지출 −acc_amt(환급 음수는 +로 복원). excludeAccBookId 행은 제외.
 */
export function availableAsOf(
  rows: readonly AsOfRow[],
  asOfDate: string,
  opts: AvailableAsOfOptions = {},
): Record<number, number> {
  const { excludeAccBookId } = opts;
  const avail: Record<number, number> = {};
  for (const r of rows) {
    if (excludeAccBookId != null && r.acc_book_id === excludeAccBookId) continue;
    if (!atOrBefore(r, asOfDate)) continue;
    const delta = r.incm_sec_cd === 1 ? r.acc_amt : -r.acc_amt;
    avail[r.acc_sec_cd] = (avail[r.acc_sec_cd] ?? 0) + delta;
  }
  return avail;
}

/**
 * 입력 중 지출을 반영한 "저장 후 예상 잔액" 미리보기.
 * projected = 해당 자금원 as-of 가용 − max(0, 입력금액). willGoNegative = projected < 0.
 * bySource = 전 자금원 as-of 가용(여유 있는 순) — 대체 자금원 추천용.
 */
export function previewDraft(rows: readonly AsOfRow[], draft: DraftExpense): DraftPreview {
  const base = availableAsOf(rows, draft.acc_date, {
    excludeAccBookId: draft.excludeAccBookId,
  });
  const current = base[draft.acc_sec_cd] ?? 0;
  const charge = Math.max(0, draft.acc_amt);
  const projected = current - charge;

  const bySource: SourceAvail[] = Object.entries(base)
    .map(([k, v]) => ({ accSecCd: Number(k), available: v }))
    .sort((a, b) => b.available - a.available);
  // 선택 자금원이 base에 없으면(거래 0건) 0으로 포함
  if (!bySource.some((s) => s.accSecCd === draft.acc_sec_cd)) {
    bySource.push({ accSecCd: draft.acc_sec_cd, available: current });
  }

  return {
    source: draft.acc_sec_cd,
    current,
    projected,
    willGoNegative: projected < 0,
    bySource,
  };
}
