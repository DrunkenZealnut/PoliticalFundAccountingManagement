/**
 * 거래일 표시 변환 헬퍼.
 *
 * DB는 거래일을 `acc_book.acc_date` CHAR(8)에 "YYYYMMDD"로 저장한다.
 * 표시·입력 UI는 "YYYY-MM-DD" 형식을 쓰므로 단일 지점에서 변환한다.
 */

/** DB 저장형 "YYYYMMDD" → 표시형 "YYYY-MM-DD". 8자리 아니면 원본 그대로(빈값은 ""). */
export function fmtAccDate(yyyymmdd: string | null | undefined): string {
  if (!yyyymmdd) return "";
  const s = yyyymmdd.trim();
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s;
}
