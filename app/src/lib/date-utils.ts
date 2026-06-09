/**
 * 거래 시각(분 단위) 변환 헬퍼.
 *
 * DB는 시각을 `acc_book.acc_time` CHAR(4)에 "HHmm"(예: "1430")로 저장한다(NULL 허용).
 * 입력 UI는 `<input type="time">`을 쓰며 값은 "HH:mm" 형식이다.
 * 두 형식을 단일 지점에서 변환하여 수입·지출·수기입력 폼의 중복을 방지한다.
 */

/** DB 저장형 "HHmm" → input[type=time] 표시형 "HH:mm". 빈값/비정상값은 "". */
export function fmtTimeInput(hhmm: string | null | undefined): string {
  if (!hhmm) return "";
  const s = hhmm.trim();
  if (!/^\d{4}$/.test(s)) return "";
  return `${s.slice(0, 2)}:${s.slice(2, 4)}`;
}

/** input[type=time] "HH:mm" → DB 저장형 "HHmm". 빈값/비정상값은 null(선택 입력). */
export function toAccTime(hm: string | null | undefined): string | null {
  if (!hm) return null;
  const digits = hm.replace(":", "").trim();
  return /^\d{4}$/.test(digits) ? digits : null;
}
