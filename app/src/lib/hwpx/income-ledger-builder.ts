/* ------------------------------------------------------------------ */
/*  수입계정별 회계장부(공식 서식 7 = 정치자금 수입·지출부) 뷰모델 빌더 */
/*                                                                    */
/*  acc_book 행(수입 incm_sec_cd=1 + 지출 incm_sec_cd=2) + customer    */
/*  상세를 받아 계정+과목 그룹별로 묶고, 그룹 내 일자순으로 수입·지출   */
/*  을 섞어 각각의 누계와 잔액(수입누계-지출누계)을 계산해 form-7 표의   */
/*  셀 토큰값으로 매핑한다.                                            */
/*                                                                    */
/*  근거(실데이터 org 9): 수입·지출이 동일 계정·과목 코드(82/84/85 ×    */
/*  86/87)를 공유하므로 (acc_sec_cd,item_sec_cd) 그룹에 수입·지출이      */
/*  함께 묶인다. form-7 작성예시도 한 표에 수입·지출 일자순 혼합 +       */
/*  잔액=수입누계-지출누계 구조.                                       */
/*   - 정렬: 계정코드 ASC → 과목코드 ASC, 그룹 내 acc_date ASC →        */
/*     동일자는 수입(incm=1) 먼저                                       */
/*  React/Next 비의존 → 단위 테스트 가능.                              */
/* ------------------------------------------------------------------ */

import { compareAccDateTime } from "@/lib/accounting/acc-book-sort";
import { displayReceiptNo } from "@/lib/accounting/receipt-no";

/** form-7 표의 셀 토큰명 (form-7-fill.hwpx 템플릿의 {{토큰}}과 일치). */
export const LEDGER_GROUP_TOKENS = {
  account: "계정명",
  item: "과목명",
} as const;

export const LEDGER_ROW_TOKENS = {
  date: "연월일",
  content: "내역",
  incomeNow: "수입금회",
  incomeCum: "수입누계",
  expenseNow: "지출금회",
  expenseCum: "지출누계",
  balance: "잔액",
  name: "성명",
  birth: "생년월일",
  addr: "주소",
  job: "직업",
  tel: "전화",
  receiptNo: "영수증",
  remark: "비고",
} as const;

/** 회계장부 생성에 필요한 customer 최소 필드. */
export interface LedgerCustomer {
  name: string | null;
  reg_num: string | null;
  addr: string | null;
  addr_detail: string | null;
  job: string | null;
  tel: string | null;
}

/** acc_book 행(수입/지출) + customer 상세 (전용 조회 결과). */
export interface IncomeLedgerInputRow {
  acc_book_id: number; // 같은 날·같은 구분 정렬 tie-break(입력순 비결정성 제거)
  acc_date: string; // YYYYMMDD
  incm_sec_cd: number; // 1=수입, 2=지출
  acc_sec_cd: number;
  item_sec_cd: number;
  content: string;
  acc_amt: number;
  rcp_no: string | null;
  cust_id: number;
  customer: LedgerCustomer | null;
}

export interface LedgerCellRow {
  date: string;
  content: string;
  incomeNow: string; // 수입행이면 금액, 지출행이면 ""
  incomeCum: string; // 수입행에만 수입 누계 표시
  expenseNow: string; // 지출행이면 금액, 수입행이면 ""
  expenseCum: string; // 지출행에만 지출 누계 표시
  balance: string; // 수입누계 - 지출누계 (모든 행)
  name: string;
  birth: string;
  addr: string;
  job: string;
  tel: string;
  receiptNo: string;
  remark: string; // 비고 (서식 22-4 컬럼; acc_book 무필드 → 공란)
}

export interface LedgerGroup {
  accSecCd: number;
  itemSecCd: number;
  accountName: string;
  itemName: string;
  rows: LedgerCellRow[];
}

export interface IncomeLedgerModel {
  groups: LedgerGroup[];
}

/**
 * 회계장부에 항상 표시할 표준 계정·과목 조합 (acc_rel 기준).
 * 거래가 없는 조합도 빈 표(빈 행 1개)로 생성하기 위해 사용한다.
 */
export interface LedgerAccountItem {
  accSecCd: number;
  itemSecCd: number;
}

/** 금액 → 천단위 콤마 (음수/0 포함). */
export function formatAmount(n: number): string {
  return (n || 0).toLocaleString("ko-KR");
}

/** YYYYMMDD → YYYY/M/D (월·일 앞 0 제거). 형식 불명 시 원문. */
export function formatLedgerDate(yyyymmdd: string): string {
  const d = (yyyymmdd ?? "").replace(/[^0-9]/g, "");
  if (d.length !== 8) return yyyymmdd ?? "";
  const y = d.slice(0, 4);
  const m = Number(d.slice(4, 6));
  const day = Number(d.slice(6, 8));
  if (m < 1 || m > 12 || day < 1 || day > 31) return yyyymmdd ?? "";
  return `${y}/${m}/${day}`;
}

/**
 * customer.reg_num → 양식의 "생년월일(사업자등록번호)" 셀 값.
 *  - 사업자번호(XXX-XX-XXXXX): 그대로 유지
 *  - 주민번호(앞 6자리 YYMMDD, 6 또는 13자리): "YY/MM/DD"
 *  - 익명("9999")·형식 불명·빈값: 공란
 */
export function formatBirthFromRegNum(regNum: string | null | undefined): string {
  const raw = (regNum ?? "").trim();
  if (!raw) return "";
  // 사업자등록번호 형식은 하이픈 포함 그대로 노출
  if (/^\d{3}-\d{2}-\d{5}$/.test(raw)) return raw;
  const digits = raw.replace(/[^0-9]/g, "");
  // 익명(9999) 등 6자리 미만은 생년월일로 볼 수 없음
  if (digits.length < 6) return "";
  const yy = digits.slice(0, 2);
  const mm = digits.slice(2, 4);
  const dd = digits.slice(4, 6);
  if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return "";
  return `${yy}/${mm}/${dd}`;
}

/** customer.addr + addr_detail 결합 (빈 값 제외). */
function joinAddr(c: LedgerCustomer | null): string {
  if (!c) return "";
  return [c.addr, c.addr_detail].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
}

/** 익명 고객 여부 (cust_id=-999 또는 reg_num=9999). 회계장부·보전목록 공유 SSOT. */
export function isAnonymousCustomer(custId: number, regNum: string | null | undefined): boolean {
  return custId === -999 || (regNum ?? "").replace(/[^0-9]/g, "") === "9999";
}

/** 익명 고객 여부 (cust_id=-999 또는 reg_num=9999). */
function isAnonymous(row: IncomeLedgerInputRow): boolean {
  return isAnonymousCustomer(row.cust_id, row.customer?.reg_num);
}

type GetName = (cvId: number) => string;

/** 거래가 없는 계정·과목의 빈 표용 데이터행(모든 셀 공란). */
function emptyLedgerRow(): LedgerCellRow {
  return {
    date: "",
    content: "",
    incomeNow: "",
    incomeCum: "",
    expenseNow: "",
    expenseCum: "",
    balance: "",
    name: "",
    birth: "",
    addr: "",
    job: "",
    tel: "",
    receiptNo: "",
    remark: "",
  };
}

/**
 * 한 계정·과목 그룹의 데이터행 셀을 계산한다.
 * 거래 0건이면 손기입용 빈 행 1개를 반환(거래 없는 계정도 양식 표를 유지).
 */
function buildGroupRows(groupRows: IncomeLedgerInputRow[]): LedgerCellRow[] {
  if (groupRows.length === 0) return [emptyLedgerRow()];

  // 그룹 내 일자순, 같은 날은 수입(incm=1) 먼저 → acc_book_id (정렬 SSOT tie-break)
  const sorted = groupRows
    .slice()
    .sort(
      (a, b) =>
        compareAccDateTime(a, b) ||
        a.incm_sec_cd - b.incm_sec_cd ||
        a.acc_book_id - b.acc_book_id,
    );

  let incCum = 0;
  let expCum = 0;
  return sorted.map((r) => {
    const isIncome = r.incm_sec_cd === 1;
    if (isIncome) incCum += r.acc_amt || 0;
    else expCum += r.acc_amt || 0;
    const anon = isAnonymous(r);
    return {
      date: formatLedgerDate(r.acc_date),
      content: r.content ?? "",
      incomeNow: isIncome ? formatAmount(r.acc_amt) : "",
      incomeCum: isIncome ? formatAmount(incCum) : "",
      expenseNow: isIncome ? "" : formatAmount(r.acc_amt),
      expenseCum: isIncome ? "" : formatAmount(expCum),
      balance: formatAmount(incCum - expCum),
      // 익명은 실명이 들어와도 "익명"으로 정규화(비식별화 + 회계장부 표기 유지)
      name: anon ? "익명" : (r.customer?.name ?? ""),
      birth: anon ? "" : formatBirthFromRegNum(r.customer?.reg_num),
      addr: anon ? "" : joinAddr(r.customer),
      job: anon ? "" : (r.customer?.job ?? ""),
      tel: anon ? "" : (r.customer?.tel ?? ""),
      receiptNo: displayReceiptNo(r.incm_sec_cd, r.rcp_no),
      remark: "",
    };
  });
}

/**
 * 수입·지출행들을 계정+과목 그룹으로 묶어 회계장부 모델로 변환.
 * @param rows 수입·지출행(+customer 상세)
 * @param getName cv_id → 코드명 (codevalue)
 * @param standardCombos 항상 표시할 표준 계정·과목 조합(acc_rel 기준). 지정 시
 *   거래가 없는 조합도 빈 표(빈 행 1개)로 생성하고, 전달 순서(=acc_order)를
 *   그룹 출력 순서로 사용한다. 미지정 시 기존 동작(실거래 그룹만 코드순).
 */
export function buildIncomeLedgerModel(
  rows: IncomeLedgerInputRow[],
  getName: GetName,
  standardCombos?: LedgerAccountItem[],
): IncomeLedgerModel {
  // 그룹 키 = `${acc_sec_cd}:${item_sec_cd}`
  const groupMap = new Map<string, IncomeLedgerInputRow[]>();
  for (const r of rows) {
    const key = `${r.acc_sec_cd}:${r.item_sec_cd}`;
    const list = groupMap.get(key) ?? [];
    list.push(r);
    groupMap.set(key, list);
  }

  // 계정코드 ASC → 과목코드 ASC
  const byCode = (a: string, b: string) => {
    const [aa, ai] = a.split(":").map(Number);
    const [ba, bi] = b.split(":").map(Number);
    return aa - ba || ai - bi;
  };

  // 출력 그룹 키 순서:
  //  - standardCombos 지정: 전달 순서(=acc_order) 우선 + 표준에 없는 실거래 조합은 코드순으로 뒤에 추가
  //  - 미지정: 실거래 그룹만 코드순(기존 동작)
  const orderedKeys: string[] = [];
  const seen = new Set<string>();
  const pushKey = (k: string) => {
    if (!seen.has(k)) {
      seen.add(k);
      orderedKeys.push(k);
    }
  };
  if (standardCombos && standardCombos.length > 0) {
    for (const c of standardCombos) pushKey(`${c.accSecCd}:${c.itemSecCd}`);
    Array.from(groupMap.keys())
      .filter((k) => !seen.has(k))
      .sort(byCode)
      .forEach(pushKey);
  } else {
    Array.from(groupMap.keys()).sort(byCode).forEach(pushKey);
  }

  const groups: LedgerGroup[] = orderedKeys.map((key) => {
    const [accSecCd, itemSecCd] = key.split(":").map(Number);
    return {
      accSecCd,
      itemSecCd,
      accountName: getName(accSecCd),
      itemName: getName(itemSecCd),
      rows: buildGroupRows(groupMap.get(key) ?? []),
    };
  });

  return { groups };
}

/** 그룹 헤더 셀 토큰맵 ({{계정명}}, {{과목명}}). */
export function groupHeaderTokens(g: LedgerGroup): Record<string, string> {
  return {
    [LEDGER_GROUP_TOKENS.account]: g.accountName,
    [LEDGER_GROUP_TOKENS.item]: g.itemName,
  };
}

/** 데이터행 셀 토큰맵 (form-7 표 13컬럼). */
export function rowTokens(row: LedgerCellRow): Record<string, string> {
  return {
    [LEDGER_ROW_TOKENS.date]: row.date,
    [LEDGER_ROW_TOKENS.content]: row.content,
    [LEDGER_ROW_TOKENS.incomeNow]: row.incomeNow,
    [LEDGER_ROW_TOKENS.incomeCum]: row.incomeCum,
    [LEDGER_ROW_TOKENS.expenseNow]: row.expenseNow,
    [LEDGER_ROW_TOKENS.expenseCum]: row.expenseCum,
    [LEDGER_ROW_TOKENS.balance]: row.balance,
    [LEDGER_ROW_TOKENS.name]: row.name,
    [LEDGER_ROW_TOKENS.birth]: row.birth,
    [LEDGER_ROW_TOKENS.addr]: row.addr,
    [LEDGER_ROW_TOKENS.job]: row.job,
    [LEDGER_ROW_TOKENS.tel]: row.tel,
    [LEDGER_ROW_TOKENS.receiptNo]: row.receiptNo,
    [LEDGER_ROW_TOKENS.remark]: row.remark,
  };
}
