/* ------------------------------------------------------------------ */
/*  재산 구분(estate_sec_cd) 코드 — 재산명세서(서식 22-3) SSOT          */
/*  estate 페이지·HWPX 재산명세서 빌더가 공유한다.                       */
/* ------------------------------------------------------------------ */

export interface EstateType {
  value: number;
  label: string;
}

/** 재산 구분 코드(estate_sec_cd) → 표시명. 표시·집계 순서이기도 하다. */
export const ESTATE_TYPES: readonly EstateType[] = [
  { value: 43, label: "토지" },
  { value: 44, label: "건물" },
  { value: 45, label: "주식 또는 유가증권" },
  { value: 46, label: "비품" },
  { value: 47, label: "현금 및 예금" },
  { value: 48, label: "그 밖의 재산" },
  { value: 49, label: "차입금" },
];

/** estate_sec_cd → 구분명 (미정의 코드는 코드값 문자열). */
export function estateLabel(secCd: number): string {
  return ESTATE_TYPES.find((t) => t.value === secCd)?.label ?? String(secCd);
}

/**
 * 재산명세서(서식 22-3) 양식 고정 표기 구분 (토지~그밖의재산).
 * 데이터 0건이어도 "해당없음" 행으로 항상 표기한다. 차입금(49)은 양식상
 * 그밖의재산에 포함되므로 고정 표기 대상이 아니며 데이터가 있을 때만 추가된다.
 */
export const FIXED_ESTATE_SECS: readonly number[] = [43, 44, 45, 46, 47, 48];
