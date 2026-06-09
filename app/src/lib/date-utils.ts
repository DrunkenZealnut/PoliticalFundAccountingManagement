/**
 * 거래 시각(분 단위) 변환 헬퍼.
 *
 * DB는 시각을 `acc_book.acc_time` CHAR(4)에 "HHmm"(예: "1430")로 저장한다(NULL 허용).
 * 입력 UI는 `<input type="time">`을 쓰며 값은 "HH:mm" 형식이다.
 * 두 형식을 단일 지점에서 변환하여 수입·지출·수기입력 폼의 중복을 방지한다.
 */

/** HHmm 유효성: 자리수뿐 아니라 범위(00:00~23:59)까지 검증. "2460"·"1360" 등은 불통과. */
const HHMM_RE = /^(?:[01]\d|2[0-3])[0-5]\d$/;

/** DB 저장형 "HHmm" → input[type=time] 표시형 "HH:mm". 빈값/비정상값은 "". */
export function fmtTimeInput(hhmm: string | null | undefined): string {
  if (!hhmm) return "";
  const s = hhmm.trim();
  if (!HHMM_RE.test(s)) return "";
  return `${s.slice(0, 2)}:${s.slice(2, 4)}`;
}

/** input[type=time] "HH:mm" → DB 저장형 "HHmm". 빈값/비정상값은 null(선택 입력). */
export function toAccTime(hm: string | null | undefined): string | null {
  if (!hm) return null;
  const digits = hm.replace(":", "").trim();
  return HHMM_RE.test(digits) ? digits : null;
}
