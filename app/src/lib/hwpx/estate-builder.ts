/* ------------------------------------------------------------------ */
/*  재산명세서(공식 서식 22-3) 뷰모델 빌더                              */
/*                                                                    */
/*  estate 행을 재산 구분(estate_sec_cd)별로 묶어 ESTATE_TYPES 순서로   */
/*  정렬하고, 구분별 가액 소계와 전체 합계를 계산한다. 표는 구분 그룹    */
/*  마다 명세행 N + 소계행 1 구조(owpml-table 행 복제로 렌더).          */
/*  React/Next 비의존 → 단위 테스트 가능.                              */
/* ------------------------------------------------------------------ */
import { ESTATE_TYPES, FIXED_ESTATE_SECS, estateLabel } from "@/lib/accounting/estate-types";
import { formatAmount } from "./income-ledger-builder";

export interface EstateInputRow {
  estate_sec_cd: number;
  kind: string;
  qty: number;
  content: string;
  amt: number;
  remark: string;
}

export interface EstateCellRow {
  kind: string;
  qty: string; // 수량 (0/음수 → 공란)
  content: string;
  amt: string; // 가액 (천단위 콤마, 음수 허용)
  remark: string;
}

export interface EstateGroup {
  secCd: number;
  label: string; // ESTATE_TYPES 구분명
  rows: EstateCellRow[];
  subtotal: string; // 구분 가액 소계
}

export interface EstateModel {
  groups: EstateGroup[];
  total: string; // 전체 가액 합계
}

/** ESTATE_TYPES 정의 순서 인덱스 (미정의 코드는 뒤로). */
function orderIndex(secCd: number): number {
  const i = ESTATE_TYPES.findIndex((t) => t.value === secCd);
  return i === -1 ? ESTATE_TYPES.length + secCd : i;
}

/** 수량: 1 이상이면 문자열, 그 외(0/음수)는 공란. */
function formatQty(qty: number): string {
  return qty && qty > 0 ? String(qty) : "";
}

/** 데이터 0건 구분의 "해당없음" 명세행. */
const NONE_ROW: EstateCellRow = { kind: "", qty: "", content: "해당없음", amt: "", remark: "" };

/**
 * estate 행들을 구분별 그룹으로 묶은 재산명세서 모델을 만든다.
 * 양식 고정 6구분(토지~그밖의재산)은 데이터 0건이어도 "해당없음" 행으로 항상
 * 표기하고, 차입금(49) 등 비고정 구분은 데이터가 있을 때만 6구분 뒤에 추가한다.
 */
export function buildEstateModel(rows: EstateInputRow[]): EstateModel {
  const groupMap = new Map<number, EstateInputRow[]>();
  for (const r of rows) {
    const list = groupMap.get(r.estate_sec_cd) ?? [];
    list.push(r);
    groupMap.set(r.estate_sec_cd, list);
  }

  // 표기 대상 구분 = 고정 6구분 ∪ 데이터가 있는 구분, ESTATE_TYPES 순서
  const secCds = Array.from(new Set([...FIXED_ESTATE_SECS, ...groupMap.keys()])).sort(
    (a, b) => orderIndex(a) - orderIndex(b)
  );

  let totalAmt = 0;
  const groups: EstateGroup[] = secCds.map((secCd) => {
    const groupRows = groupMap.get(secCd) ?? [];
    if (groupRows.length === 0) {
      // 고정 구분이지만 데이터 0건 → "해당없음" 1행, 소계 0
      return { secCd, label: estateLabel(secCd), rows: [{ ...NONE_ROW }], subtotal: formatAmount(0) };
    }
    let subtotal = 0;
    const cells: EstateCellRow[] = groupRows.map((r) => {
      subtotal += r.amt || 0;
      return {
        kind: r.kind ?? "",
        qty: formatQty(r.qty),
        content: r.content ?? "",
        amt: formatAmount(r.amt || 0),
        remark: r.remark ?? "",
      };
    });
    totalAmt += subtotal;
    return { secCd, label: estateLabel(secCd), rows: cells, subtotal: formatAmount(subtotal) };
  });

  return { groups, total: formatAmount(totalAmt) };
}

/** 그룹 헤더/소계 토큰맵 ({{구분}}, {{소계}}). */
export function estateGroupTokens(g: EstateGroup): Record<string, string> {
  return { 구분: g.label, 소계: g.subtotal };
}

/** 명세행 토큰맵 (종류·수량·내용·가액·비고). */
export function estateRowTokens(row: EstateCellRow): Record<string, string> {
  return {
    종류: row.kind,
    수량: row.qty,
    내용: row.content,
    가액: row.amt,
    비고: row.remark,
  };
}
