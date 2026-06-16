/**
 * 회계장부(acc_book) 거래 정렬 SSOT.
 *
 * 거래는 거래일(`acc_date`) → 거래 시각(`acc_time`) 순으로 표시되어야 한다.
 * `acc_time`은 CHAR(4) "HHmm"(예: "0600", "1430", zero-padded)로 저장되며 NULL 허용이다
 * (scripts/014, 분 단위·선택 입력). 따라서 같은 거래일 내에서는 문자열 비교만으로 시각순이 보장된다.
 *
 * 이 모듈을 만들기 전에는 장부/목록 정렬이 `acc_date` 다음에 `acc_sort_num`·`incm_sec_cd` 등
 * 제각각의 2차 키를 써서 `acc_time`을 무시했고(신규 입력 행은 `acc_sort_num`이 NULL), 같은 날
 * 새벽 수입과 오후 지출이 입력 시각과 무관한 순서로 표시되는 버그가 있었다. 모든 거래 정렬은
 * 이 비교자를 1차로 쓰고, 필요 시 호출부가 `|| 추가키`로 안정 정렬을 이어붙인다.
 */

export interface AccDateTimeRow {
  acc_date: string; // YYYYMMDD
  acc_time?: string | null; // HHmm, NULL 허용
}

/**
 * 거래일 → 거래 시각 오름차순 비교.
 *
 * - 1차: `acc_date` (YYYYMMDD 문자열) 오름차순
 * - 2차: `acc_time` (HHmm 문자열) 오름차순. 미입력(NULL/"")은 같은 날 맨 앞
 *        (nulls first — `api/acc-book` 조회 정렬의 `nullsFirst: true`와 동일 컨벤션).
 *
 * 같은 거래일·시각이면 0을 반환하므로, 수입 우선/입력 순서 등 추가 tie-break는
 * 호출부에서 `compareAccDateTime(a, b) || (a.incm_sec_cd - b.incm_sec_cd) || ...` 형태로 잇는다.
 */
export function compareAccDateTime(a: AccDateTimeRow, b: AccDateTimeRow): number {
  if (a.acc_date !== b.acc_date) {
    return a.acc_date < b.acc_date ? -1 : 1;
  }
  const ta = a.acc_time ?? "";
  const tb = b.acc_time ?? "";
  if (ta === tb) return 0;
  return ta < tb ? -1 : 1;
}
