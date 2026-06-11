/**
 * HWPX(section0.xml) 토큰 치환용 입력값 정규화 유틸.
 *
 * 토큰 값은 XML 텍스트 노드에 삽입되므로 반드시 escape 해야 한다.
 * 미처리 시 `<`, `&` 등이 HWPX를 파손하거나 인젝션을 유발한다.
 */

/**
 * XML 특수문자 escape (& 를 먼저 치환).
 * XML 1.0 불법 제어문자(\x00-\x08 \x0B \x0C \x0E-\x1F)는 escape 로도 표현 불가능해
 * 문서 전체를 파서 거부(한글에서 "손상된 파일")로 만들므로 선제 제거한다.
 * (\t \n \r 은 XML 1.0 허용 문자라 보존)
 */
export function escapeXml(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * 날짜 문자열을 "YYYY년 M월 D일" 형식으로 변환.
 * "2026-06-03" / "20260603" 모두 허용. 형식 불명 시 원문 반환.
 */
export function fmtKoreanDate(input: string): string {
  if (!input) return "";
  const digits = input.replace(/[^0-9]/g, "");
  if (digits.length !== 8) return input;
  const y = digits.slice(0, 4);
  const mNum = Number(digits.slice(4, 6));
  const dNum = Number(digits.slice(6, 8));
  if (mNum < 1 || mNum > 12 || dNum < 1 || dNum > 31) return input;
  return `${y}년 ${mNum}월 ${dNum}일`;
}
