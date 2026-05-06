/* ------------------------------------------------------------------ */
/*  한글 통화 표기 변환                                                 */
/*  서식 1·2의 "금 ___원(₩ ___ )" 표기용                              */
/*  예: 12,300,000 → "일천이백삼십만"                                   */
/* ------------------------------------------------------------------ */

const DIGITS = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
const POSITION_IN_GROUP = ["", "십", "백", "천"];
const GROUP_UNITS = ["", "만", "억", "조", "경"];

function group4ToKorean(group: number): string {
  if (group === 0) return "";
  let result = "";
  const digits = String(group).padStart(4, "0").split("").map(Number);
  for (let i = 0; i < 4; i++) {
    const d = digits[i];
    if (d === 0) continue;
    const pos = 3 - i;
    result += DIGITS[d] + POSITION_IN_GROUP[pos];
  }
  return result;
}

/**
 * 숫자를 한글 표기로 변환합니다.
 * @param amount 변환할 금액 (정수, 0 이상)
 * @returns 한글 표기 (예: 12300000 → "일천이백삼십만")
 *
 * 규칙:
 * - 0 이하/소수/NaN → 빈 문자열
 * - 4자리씩 끊어 만/억/조/경 단위 부착
 * - 0인 자리는 생략 (예: 10001 → "일만일")
 */
export function toKoreanAmount(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    return "";
  }

  const groups: number[] = [];
  let n = amount;
  while (n > 0) {
    groups.push(n % 10000);
    n = Math.floor(n / 10000);
  }

  let result = "";
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g === 0) continue;
    result += group4ToKorean(g) + GROUP_UNITS[i];
  }
  return result;
}
