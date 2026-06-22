/**
 * 회계장부(acc_book) 거래 정렬 SSOT.
 *
 * 거래는 거래일(`acc_date`, YYYYMMDD) 오름차순으로 표시한다. 거래 시각(시분초)은 쓰지 않으므로
 * 같은 거래일 내 순서는 호출부가 잇는 tie-break(수입 우선 `incm_sec_cd` → `acc_book_id`)가 결정한다.
 *
 * 이 모듈을 만들기 전에는 장부/목록 정렬이 제각각의 2차 키를 써서 같은 날 수입/지출 순서가
 * 입력순과 무관하게 뒤바뀌는 버그가 있었다. 모든 거래 정렬은 이 비교자를 1차로 쓰고,
 * 필요 시 호출부가 `|| 추가키`로 안정 정렬을 이어붙인다.
 */

export interface AccDateTimeRow {
  acc_date: string; // YYYYMMDD
}

/**
 * 거래일(`acc_date`) 오름차순 비교.
 *
 * 같은 거래일이면 0을 반환하므로, 수입 우선/입력 순서 등 추가 tie-break는
 * 호출부에서 `compareAccDateTime(a, b) || (a.incm_sec_cd - b.incm_sec_cd) || ...` 형태로 잇는다.
 */
export function compareAccDateTime(a: AccDateTimeRow, b: AccDateTimeRow): number {
  if (a.acc_date === b.acc_date) return 0;
  return a.acc_date < b.acc_date ? -1 : 1;
}

/**
 * export용: 모든 행에 `acc_sort_num`을 정규순서로 전역 1..N 재부여한다 (snake_case 키, Record 기반).
 *
 * 선관위 공식 프로그램(PFund2)은 `acc_date → acc_sort_num`으로 동일 거래일 거래를 정렬한다.
 * 우리 데이터는 `acc_sort_num`이 비어있는 행이 많아 같은 날 수입이 지출보다 뒤로 밀리면
 * 정치자금 수입·지출부 누계가 일시 음수로 렌더된다. 정규순서(`acc_date → 수입(incm 1) 먼저 →
 * acc_book_id`)로 acc_sort_num을 재부여하면 공식 프로그램이 우리 앱과 동일하게(수입 먼저)
 * 렌더해 음수가 사라진다. 공식 Fund_Data_1.db도 전 행에 acc_sort_num을 채운다.
 * export 전용 — 원본 배열 순서·메타는 불변(acc_sort_num만 갱신).
 */
export function fillExportSortNumbers(
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  const id = (r: Record<string, unknown>) => Number(r.acc_book_id ?? 0);
  const dt = (r: Record<string, unknown>): AccDateTimeRow => ({
    acc_date: String(r.acc_date ?? ""),
  });
  const ordered = [...rows].sort(
    (a, b) =>
      compareAccDateTime(dt(a), dt(b)) ||
      Number(a.incm_sec_cd) - Number(b.incm_sec_cd) || // 같은 날: 수입(1) 먼저 (잔액 음수 방지 SSOT)
      id(a) - id(b),
  );
  // rank는 행 객체 참조 기준으로 부여한다. acc_book_id 기준 Map은 acc_book_bak처럼 같은 원장
  // id가 여러 백업 행으로 중복될 때 마지막 rank로 덮여 acc_sort_num이 충돌하므로 금지.
  const rankByRef = new Map<Record<string, unknown>, number>();
  ordered.forEach((r, i) => rankByRef.set(r, i + 1));
  return rows.map((r) => ({ ...r, acc_sort_num: rankByRef.get(r) ?? null }));
}
