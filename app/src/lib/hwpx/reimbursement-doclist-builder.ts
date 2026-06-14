/* ------------------------------------------------------------------ */
/*  선거비용 보전 첨부서류 점검목록표 뷰모델 빌더 (순수 함수)            */
/*                                                                    */
/*  보전 체크된 선거비용 지출(acc_book) + 거래업체(customer) + 증빙     */
/*  파일 집계(evidence_file)를 받아, 공직선거법 조항별 보전 항목으로     */
/*  그룹핑한 점검목록표 모델로 변환한다.                                */
/*                                                                    */
/*  표 구조(form-doclist-fill.hwpx, 재산명세서 6컬럼 재사용):           */
/*    c0 보전항목(rowSpan) / c1 지출일자 / c2 거래업체 /               */
/*    c3 지출내용 / c4 보전청구액 / c5 첨부증빙                         */
/*  그룹별 소계(보전청구액 합) + 전체 합계.                             */
/*                                                                    */
/*  대상 필터(reimbursement-aggregator 와 동일 조건):                  */
/*    acc_amt !== 0 ∧ acc_print_ok='Y' (0원만 제외, 환급/조정 음수는    */
/*    보전청구액에서 차감; 지출 incm_sec_cd=2 는 조회 보장).            */
/*  보전 항목 판별 = reimbursement-item-map(allowlist), 미매핑은 끝의   */
/*  "기타/미분류" 그룹으로 표기(누락 방지).                             */
/* ------------------------------------------------------------------ */
import { formatAmount, formatLedgerDate, isAnonymousCustomer } from "./income-ledger-builder";
import {
  REIMB_ITEMS,
  REIMB_ETC,
  mapReimbItemKey,
} from "@/lib/accounting/reimbursement-item-map";
import { claimAmount } from "@/lib/accounting/claim-amount";

/** form-doclist 표 토큰명 (템플릿 {{토큰}}과 일치). */
export const DOCLIST_GROUP_TOKEN = "보전항목" as const;
export const DOCLIST_ROW_TOKENS = {
  date: "지출일자",
  vendor: "거래업체",
  content: "지출내용",
  amount: "보전청구액",
  evidence: "첨부증빙",
} as const;
export const DOCLIST_SUBTOTAL_TOKEN = "소계_금액" as const;
export const DOCLIST_TOTAL_TOKEN = "합계_금액" as const;

/** acc_book_id 기준 증빙 집계(메타데이터만). */
export interface EvidenceSummary {
  /** 이미지(사진) 건수 (file_type startsWith "image/") */
  images: number;
  /** 그 외 문서 건수 */
  docs: number;
  /** 대표 파일명(첫 파일) */
  firstName: string;
}

/** 빌더 입력 행 (지출 + 거래처명). */
export interface DoclistInputRow {
  acc_book_id: number;
  acc_date: string; // YYYYMMDD
  content: string | null;
  acc_amt: number;
  /** 보전청구액(NULL이면 acc_amt 사용). 일할계산 등 실지출과 다른 보전 신청액. */
  claim_amt?: number | null;
  acc_print_ok: string | null;
  cust_id: number;
  exp_group1_cd: string | null;
  exp_group2_cd: string | null;
  customer: { name: string | null; reg_num: string | null } | null;
}

export interface DoclistCellRow {
  date: string;
  vendor: string;
  content: string;
  amount: string;
  evidence: string;
}

export interface DoclistGroup {
  key: string;
  itemName: string;
  law: string;
  rows: DoclistCellRow[];
  subtotalAmount: string;
}

export interface DoclistModel {
  groups: DoclistGroup[];
  totalAmount: string;
}

/** 증빙 집계 → "사진 N매 / 문서 M건" + 대표 파일명. 없으면 "없음". */
export function formatEvidence(e: EvidenceSummary | undefined): string {
  if (!e || (e.images === 0 && e.docs === 0)) return "없음";
  const parts: string[] = [];
  if (e.images > 0) parts.push(`사진 ${e.images}매`);
  if (e.docs > 0) parts.push(`문서 ${e.docs}건`);
  const head = parts.join(" / ");
  return e.firstName ? `${head} (${e.firstName})` : head;
}

/**
 * 보전 체크 지출 + 증빙 집계 → 점검목록표 모델.
 * @param rows 지출행(+거래처명). incm_sec_cd=2 는 조회에서 보장 가정.
 * @param evidence acc_book_id → 증빙 집계
 */
export function buildDoclistModel(
  rows: DoclistInputRow[],
  evidence: Map<number, EvidenceSummary>,
): DoclistModel {
  // 대상 필터: 0원만 제외(환급/조정 음수는 차감 반영) + 보전 체크 — aggregator와 동일 정책
  const targets = rows.filter((r) => (r.acc_amt || 0) !== 0 && r.acc_print_ok === "Y");

  // 보전 항목 key 별 그룹화 (미매핑 → etc)
  const byKey = new Map<string, DoclistInputRow[]>();
  for (const r of targets) {
    const key = mapReimbItemKey(r.exp_group1_cd, r.exp_group2_cd) ?? REIMB_ETC.key;
    const list = byKey.get(key) ?? [];
    list.push(r);
    byKey.set(key, list);
  }

  // 출력 순서: REIMB_ITEMS 순서 → 기타/미분류. 거래 없는 항목은 생략(REIMB_ITEMS 직접 순회).
  let total = 0;
  const groups: DoclistGroup[] = [...REIMB_ITEMS, REIMB_ETC]
    .map((item) => ({ item, rows: byKey.get(item.key) ?? [] }))
    .filter(({ rows: r }) => r.length > 0)
    .map(({ item, rows: groupRows }) => {
      let subtotal = 0;
      const cells: DoclistCellRow[] = groupRows
        .slice()
        .sort((a, b) => a.acc_date.localeCompare(b.acc_date))
        .map((r) => {
          const amt = claimAmount(r); // 보전청구액(claim_amt ?? acc_amt) — 일할계산 등 반영
          subtotal += amt;
          return {
            date: formatLedgerDate(r.acc_date),
            vendor: isAnonymousCustomer(r.cust_id, r.customer?.reg_num) ? "익명" : (r.customer?.name ?? ""),
            content: r.content ?? "",
            amount: formatAmount(amt),
            evidence: formatEvidence(evidence.get(r.acc_book_id)),
          };
        });
      total += subtotal;
      return { key: item.key, itemName: item.name, law: item.law, rows: cells, subtotalAmount: formatAmount(subtotal) };
    });

  return { groups, totalAmount: formatAmount(total) };
}

/** 그룹 c0 토큰맵 ({{보전항목}} = "항목명 (법조항)"). */
export function doclistGroupTokens(g: DoclistGroup): Record<string, string> {
  return { [DOCLIST_GROUP_TOKEN]: g.law ? `${g.itemName} (${g.law})` : g.itemName };
}

/** 명세행 토큰맵 (c1~c5). */
export function doclistRowTokens(row: DoclistCellRow): Record<string, string> {
  return {
    [DOCLIST_ROW_TOKENS.date]: row.date,
    [DOCLIST_ROW_TOKENS.vendor]: row.vendor,
    [DOCLIST_ROW_TOKENS.content]: row.content,
    [DOCLIST_ROW_TOKENS.amount]: row.amount,
    [DOCLIST_ROW_TOKENS.evidence]: row.evidence,
  };
}
