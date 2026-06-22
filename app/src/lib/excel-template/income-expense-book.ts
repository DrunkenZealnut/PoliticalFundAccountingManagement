/* ------------------------------------------------------------------ */
/*  정치자금 수입·지출부(보전 비용) — 수입계정(자금원)별 Excel 생성      */
/*                                                                    */
/*  자금원(acc_sec_cd→4분류)별로 수입·지출을 함께 묶어 공식 양식         */
/*  (14컬럼)으로 출력.                                                  */
/*   - 수입(incm_sec_cd=1): 해당 자금원의 실제 조달 수입(acc_amt).       */
/*   - 지출(incm_sec_cd=2): 보전 체크된 선거비용만, 최종청구액           */
/*     (claimAmount = claim_amt ?? acc_amt, 환급 음수 차감).            */
/*   - 잔액 = 수입누계 − 지출누계 (수입·지출 행을 날짜순 병합).          */
/*  계정별/총 지출합계가 보전관리(aggregator)·보전청구서와 일치한다.     */
/*  (수입은 자금원 전체를 표시하므로 잔액은 실제 통장잔액과 다를 수       */
/*   있다 — 선거비용외 지출은 이 양식에 포함하지 않기 때문.)             */
/*                                                                    */
/*  양식 출처: 정치자금수입지출부_선거비용_오준석_2026.pdf — 계정명/과목  */
/*  명 2줄, 영수증 첨부분/생략분 행, 작성연월일·회계책임자 푸터 포함.    */
/*                                                                    */
/*  2계층: buildIncomeExpenseBookModel(순수) → renderIncomeExpenseBook  */
/*  (ExcelJS). SSOT: claim-amount, funding-source 공유.                */
/* ------------------------------------------------------------------ */
import ExcelJS from "exceljs";
import { claimAmount } from "@/lib/accounting/claim-amount";
import { classifyFundingSource, type FundingSource } from "@/lib/accounting/funding-source";
import { formatLedgerDate, isAnonymousCustomer } from "@/lib/hwpx/income-ledger-builder";
import { PAY_METHODS } from "@/lib/expense-types";
import { compareAccDateTime } from "@/lib/accounting/acc-book-sort";

/* ===================== 타입 ===================== */

export interface IebInputRow {
  acc_book_id: number;
  incm_sec_cd: number;
  acc_date: string; // YYYYMMDD
  content: string | null;
  acc_amt: number;
  claim_amt?: number | null;
  acc_print_ok: string | null;
  acc_sec_cd: number;
  item_sec_cd: number;
  exp_group1_cd: string | null;
  exp_group2_cd: string | null;
  exp_group3_cd: string | null;
  rcp_yn?: string | null; // 영수증 첨부 여부('Y'=첨부)
  acc_ins_type?: string | null; // 지출방법 코드(PAY_METHODS, 예: "118"=계좌입금)
  rcp_no: string | null;
  bigo: string | null;
  cust_id?: number;
  customer: {
    name: string | null;
    reg_num: string | null;
    addr: string | null;
    job: string | null;
    tel: string | null;
  } | null;
}

export interface IebCtx {
  /** cv_name==="선거비용" 인 item_sec_cd 목록 (aggregator와 동일 SSOT) */
  electionExpenseItemCds: number[];
  /** acc_sec_cd → 계정명(getName) — 시트/헤더 표시·자금원 이름 폴백 */
  accSecCdNames: Record<number, string>;
}

/** 푸터/표시 메타 (organ 정보 기반, 선택). */
export interface IebMeta {
  /** 선거구명 (organ.reg_num) */
  electionDistrict?: string;
  /** 후보자명 */
  candidateName?: string;
  /** 회계책임자명 (organ.acct_name) */
  accountant?: string;
  /** 작성연월일 — "2026년 06월 14일" 형식 */
  writeDate?: string;
}

export interface IebCellRow {
  date: string;
  content: string;
  /** 'income'=수입 행, 'expense'=지출 행 */
  kind: "income" | "expense";
  /** 수입 금회(수입 행만 >0), 누계 */
  incomeNow: number;
  incomeCum: number;
  /** 지출 금회(지출 행만 >0, =최종청구액), 누계 */
  expenseNow: number;
  expenseCum: number;
  /** 잔액 = 수입누계 − 지출누계 */
  balance: number;
  name: string;
  regNum: string;
  addr: string;
  job: string;
  tel: string;
  rcpNo: string;
  bigo: string;
}

export interface IebAccount {
  acc_sec_cd: number;
  accName: string;
  source: FundingSource;
  rows: IebCellRow[];
  /** 수입 합계(자금원 실제 조달액) */
  incomeTotal: number;
  /** 지출 합계(보전 최종청구액) */
  expenseTotal: number;
  /** 영수증 첨부분 합계/건수 (지출 rcp_yn==='Y') */
  attachedAmt: number;
  attachedCount: number;
  /** 영수증 생략분 합계/건수 (지출) */
  omittedAmt: number;
  omittedCount: number;
}

export interface IebModel {
  accounts: IebAccount[];
  grandTotal: number;
  /** 자금원 "기타"(4분류 미해당)로 합계서 제외된 보전 체크 거래 수(경고) */
  otherCount: number;
  otherAmt: number;
}

/** 자금원 시트 출력 순서. */
const SOURCE_ORDER: readonly FundingSource[] = ["후보자자산", "후원회기부금", "보조금", "보조금외"];

/** 내역 = exp_group1-2-3 + content 중 비어있지 않은 값 "-" join. */
function formatContent(r: IebInputRow): string {
  return [r.exp_group1_cd, r.exp_group2_cd, r.exp_group3_cd, r.content]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join("-");
}

/** 자금원별 영수증 일련번호 접두사 (선관위 양식: 자(비)/후(비)/보(비)/외(비)). */
const RCP_PREFIX: Record<FundingSource, string> = {
  후보자자산: "자",
  후원회기부금: "후",
  보조금: "보",
  보조금외: "외",
  기타: "기",
};

/** 영수증 일련번호 = "{접두사}(비)-{rcp_no}" + 결제방법명(둘째 줄). 번호 없으면 빈칸. */
function formatRcpNo(r: IebInputRow, source: FundingSource): string {
  const num = (r.rcp_no ?? "").trim();
  if (!num) return "";
  const head = `${RCP_PREFIX[source]}(비)-${num}`;
  const pay = PAY_METHODS.find((p) => p.value === (r.acc_ins_type ?? ""))?.label ?? "";
  return pay ? `${head}\n${pay}` : head;
}

/* ===================== 모델 빌더 (순수) ===================== */

/**
 * 자금원별 수입·지출부 모델.
 *
 * 수입(incm_sec_cd=1): 자금원 실제 조달 수입 — acc_amt!==0 ∧ 자금원≠기타.
 *   (보전 체크·과목 필터 없음 — 자금원에 들어온 수입 전부 표시.)
 * 지출(incm_sec_cd=2): aggregator·doclist와 동일 모집단 —
 *   acc_amt!==0 ∧ item_sec_cd ∈ electionExpenseItemCds ∧ acc_print_ok='Y',
 *   금액 = claimAmount(claim_amt ?? acc_amt). 자금원 "기타"는 합계 제외 + 경고.
 * 잔액 = 수입누계 − 지출누계 (수입·지출 행 날짜순 병합, 같은 날 수입 먼저).
 * 시트는 보전 청구할 선거비용 지출이 1건 이상인 자금원만 생성.
 */
export function buildIncomeExpenseBookModel(rows: IebInputRow[], ctx: IebCtx): IebModel {
  const electionSet = new Set(ctx.electionExpenseItemCds);
  const expBySource = new Map<FundingSource, IebInputRow[]>();
  const incBySource = new Map<FundingSource, IebInputRow[]>();
  let otherCount = 0;
  let otherAmt = 0;

  for (const r of rows) {
    if (r.acc_amt === 0) continue;
    const src = classifyFundingSource(r.acc_sec_cd, ctx.accSecCdNames[r.acc_sec_cd]);
    if (r.incm_sec_cd === 1) {
      if (src === "기타") continue; // 미분류 자금원 수입은 표시 안 함
      const list = incBySource.get(src) ?? [];
      list.push(r);
      incBySource.set(src, list);
    } else if (r.incm_sec_cd === 2) {
      if (!electionSet.has(r.item_sec_cd)) continue;
      if (r.acc_print_ok !== "Y") continue;
      if (src === "기타") {
        otherCount++;
        otherAmt += claimAmount(r);
        continue;
      }
      const list = expBySource.get(src) ?? [];
      list.push(r);
      expBySource.set(src, list);
    }
  }

  const accounts: IebAccount[] = [];
  let grandTotal = 0;

  for (const src of SOURCE_ORDER) {
    const expList = expBySource.get(src);
    if (!expList || expList.length === 0) continue; // 보전 청구 선거비용 없으면 시트 생략
    const incList = incBySource.get(src) ?? [];

    // 수입+지출 병합 — 날짜 → 거래 시각 → 같은 시각이면 수입 먼저 → acc_book_id
    type Tagged = { r: IebInputRow; kind: "income" | "expense"; amt: number };
    const merged: Tagged[] = [
      ...incList.map((r): Tagged => ({ r, kind: "income", amt: r.acc_amt })),
      ...expList.map((r): Tagged => ({ r, kind: "expense", amt: claimAmount(r) })),
    ].sort(
      (a, b) =>
        compareAccDateTime(a.r, b.r) ||
        (a.kind === b.kind ? 0 : a.kind === "income" ? -1 : 1) ||
        a.r.acc_book_id - b.r.acc_book_id,
    );

    let incCum = 0;
    let expCum = 0;
    let attachedAmt = 0;
    let attachedCount = 0;
    let omittedAmt = 0;
    let omittedCount = 0;
    const cells: IebCellRow[] = merged.map(({ r, kind, amt }) => {
      if (kind === "income") {
        incCum += amt;
      } else {
        expCum += amt;
        if ((r.rcp_yn ?? "") === "Y") {
          attachedAmt += amt;
          attachedCount++;
        } else {
          omittedAmt += amt;
          omittedCount++;
        }
      }
      const anon = isAnonymousCustomer(r.cust_id ?? -1, r.customer?.reg_num);
      return {
        date: formatLedgerDate(r.acc_date),
        content: formatContent(r),
        kind,
        incomeNow: kind === "income" ? amt : 0,
        incomeCum: incCum,
        expenseNow: kind === "expense" ? amt : 0,
        expenseCum: expCum,
        balance: incCum - expCum,
        name: anon ? "익명" : (r.customer?.name ?? ""),
        regNum: anon ? "" : (r.customer?.reg_num ?? ""),
        addr: anon ? "" : (r.customer?.addr ?? ""),
        job: anon ? "" : (r.customer?.job ?? ""),
        tel: anon ? "" : (r.customer?.tel ?? ""),
        rcpNo: kind === "expense" ? formatRcpNo(r, src) : "",
        bigo: r.bigo ?? "",
      };
    });

    const expenseTotal = expCum;
    const incomeTotal = incCum;
    const accName = ctx.accSecCdNames[expList[0].acc_sec_cd] ?? src;
    accounts.push({
      acc_sec_cd: expList[0].acc_sec_cd,
      accName,
      source: src,
      rows: cells,
      incomeTotal,
      expenseTotal,
      attachedAmt,
      attachedCount,
      omittedAmt,
      omittedCount,
    });
    grandTotal += expenseTotal;
  }

  return { accounts, grandTotal, otherCount, otherAmt };
}

/* ===================== ExcelJS 렌더 ===================== */

const B_THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};
const HDR_BG = "FFE8E8E8";
const SUM_BG = "FFF5F5F5";
const AMOUNT_FMT = "#,##0";

interface CellOpts {
  bold?: boolean;
  align?: "left" | "center" | "right";
  sz?: number;
  bg?: string;
  numFmt?: string;
  border?: boolean;
}

function cell(ws: ExcelJS.Worksheet, row: number, col: number, value: string | number, opts?: CellOpts) {
  const c = ws.getCell(row, col);
  c.value = value;
  c.font = { name: "맑은 고딕", size: opts?.sz ?? 9, bold: opts?.bold };
  c.alignment = { horizontal: opts?.align ?? "center", vertical: "middle", wrapText: true };
  if (opts?.border !== false) c.border = B_THIN;
  if (opts?.bg) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.bg } };
  if (opts?.numFmt) c.numFmt = opts.numFmt;
}

/** Excel 시트명 금지문자 제거 + 31자 제한. */
function sheetName(name: string): string {
  return (name || "계정").replace(/[\\/?*[\]:]/g, " ").slice(0, 31);
}

const HEADER_ROW = 6; // 헤더 시작행(r6~r9)
const DATA_ROW = 10; // 데이터 시작행

/** 14컬럼 헤더(r6~r9) 렌더 — PDF 양식 병합/문구. */
function renderHeader(ws: ExcelJS.Worksheet) {
  const r = HEADER_ROW; // 6
  ws.mergeCells(r, 1, r + 3, 1); // 연월일
  ws.mergeCells(r, 2, r + 3, 2); // 내역
  ws.mergeCells(r, 3, r, 4); // 수입액
  ws.mergeCells(r + 1, 3, r + 3, 3); // 수입 금회
  ws.mergeCells(r + 1, 4, r + 3, 4); // 수입 누계
  ws.mergeCells(r, 5, r, 6); // 지출액
  ws.mergeCells(r + 1, 5, r + 3, 5); // 지출 금회
  ws.mergeCells(r + 1, 6, r + 3, 6); // 지출 누계
  ws.mergeCells(r, 7, r + 3, 7); // 잔액
  ws.mergeCells(r, 8, r, 12); // 수입제공/지출받은자
  ws.mergeCells(r + 1, 8, r + 3, 8); // 성명
  ws.mergeCells(r + 1, 9, r + 3, 9); // 생년월일
  ws.mergeCells(r + 1, 10, r + 3, 10); // 주소
  ws.mergeCells(r + 1, 11, r + 3, 11); // 직업
  ws.mergeCells(r + 1, 12, r + 3, 12); // 전화
  ws.mergeCells(r, 13, r + 3, 13); // 영수증
  ws.mergeCells(r, 14, r + 3, 14); // 비고

  cell(ws, r, 1, "연월일", { bold: true, bg: HDR_BG });
  cell(ws, r, 2, "내  역", { bold: true, bg: HDR_BG });
  cell(ws, r, 3, "수 입 액", { bold: true, bg: HDR_BG });
  cell(ws, r + 1, 3, "금 회", { bold: true, bg: HDR_BG });
  cell(ws, r + 1, 4, "누 계", { bold: true, bg: HDR_BG });
  cell(ws, r, 5, "지 출 액", { bold: true, bg: HDR_BG });
  cell(ws, r + 1, 5, "금 회", { bold: true, bg: HDR_BG });
  cell(ws, r + 1, 6, "누 계", { bold: true, bg: HDR_BG });
  cell(ws, r, 7, "잔  액", { bold: true, bg: HDR_BG });
  cell(ws, r, 8, "수입을 제공한 자 또는 지출을 받은 자", { bold: true, bg: HDR_BG });
  cell(ws, r + 1, 8, "성 명\n(법인·단체명)", { bold: true, bg: HDR_BG });
  cell(ws, r + 1, 9, "생년월일\n(사업자번호)", { bold: true, bg: HDR_BG });
  cell(ws, r + 1, 10, "주  소\n(사무소소재지)", { bold: true, bg: HDR_BG });
  cell(ws, r + 1, 11, "직업\n(업종)", { bold: true, bg: HDR_BG });
  cell(ws, r + 1, 12, "전화\n번호", { bold: true, bg: HDR_BG });
  cell(ws, r, 13, "영수증\n일련번호", { bold: true, bg: HDR_BG });
  cell(ws, r, 14, "비고", { bold: true, bg: HDR_BG });
}

const COL_WIDTHS = [12, 26, 11, 11, 12, 12, 13, 12, 12, 26, 10, 13, 12, 8];

/**
 * 자금원별 수입·지출부 Workbook 생성. 계정별 1시트. (PDF 양식)
 */
export function renderIncomeExpenseBook(model: IebModel, meta: IebMeta = {}): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();

  for (const acc of model.accounts) {
    const ws = wb.addWorksheet(sheetName(acc.accName));
    ws.columns = COL_WIDTHS.map((w) => ({ width: w }));

    // r2 제목
    ws.mergeCells(2, 1, 2, 14);
    cell(ws, 2, 1, "정 치 자 금  수 입 ·지 출 부(보전 비용)", { bold: true, sz: 14, border: false });

    // r4 계정명(좌) + 금액단위(우)
    ws.mergeCells(4, 1, 4, 7);
    cell(ws, 4, 1, `[계 정 명: ${acc.accName} ]`, { bold: true, align: "left", border: false });
    ws.mergeCells(4, 12, 4, 14);
    cell(ws, 4, 12, "(금액단위 : 원)", { align: "right", border: false });

    // r5 과목명(좌)
    ws.mergeCells(5, 1, 5, 7);
    cell(ws, 5, 1, "[과 목 명: 선거비용 ]", { bold: true, align: "left", border: false });

    // r6~r9 헤더
    renderHeader(ws);

    // r10~ 데이터
    let rn = DATA_ROW;
    for (const row of acc.rows) {
      cell(ws, rn, 1, row.date);
      cell(ws, rn, 2, row.content, { align: "left" });
      // 수입 금회(수입 행만), 누계
      cell(ws, rn, 3, row.kind === "income" ? row.incomeNow : "", { align: "right", numFmt: AMOUNT_FMT });
      cell(ws, rn, 4, row.incomeCum, { align: "right", numFmt: AMOUNT_FMT });
      // 지출 금회(지출 행만 = 최종청구액), 누계
      cell(ws, rn, 5, row.kind === "expense" ? row.expenseNow : "", { align: "right", numFmt: AMOUNT_FMT });
      cell(ws, rn, 6, row.expenseCum, { align: "right", numFmt: AMOUNT_FMT });
      cell(ws, rn, 7, row.balance, { align: "right", numFmt: AMOUNT_FMT }); // 잔액 = 수입누계 − 지출누계
      cell(ws, rn, 8, row.name);
      cell(ws, rn, 9, row.regNum);
      cell(ws, rn, 10, row.addr, { align: "left" });
      cell(ws, rn, 11, row.job);
      cell(ws, rn, 12, row.tel);
      cell(ws, rn, 13, row.rcpNo);
      cell(ws, rn, 14, row.bigo, { align: "left" });
      rn++;
    }

    // 합계 행: 수입 금회/누계=수입합계, 지출 금회/누계=지출합계, 잔액=수입-지출, 거래처 "--", 영수증 "N건"
    const totalCount = acc.attachedCount + acc.omittedCount;
    ws.mergeCells(rn, 1, rn, 2);
    cell(ws, rn, 1, "합  계", { bold: true, bg: SUM_BG });
    cell(ws, rn, 3, acc.incomeTotal, { bold: true, align: "right", numFmt: AMOUNT_FMT, bg: SUM_BG });
    cell(ws, rn, 4, acc.incomeTotal, { bold: true, align: "right", numFmt: AMOUNT_FMT, bg: SUM_BG });
    cell(ws, rn, 5, acc.expenseTotal, { bold: true, align: "right", numFmt: AMOUNT_FMT, bg: SUM_BG });
    cell(ws, rn, 6, acc.expenseTotal, { bold: true, align: "right", numFmt: AMOUNT_FMT, bg: SUM_BG });
    cell(ws, rn, 7, acc.incomeTotal - acc.expenseTotal, { bold: true, align: "right", numFmt: AMOUNT_FMT, bg: SUM_BG });
    for (let c = 8; c <= 12; c++) cell(ws, rn, c, "--", { bg: SUM_BG });
    cell(ws, rn, 13, `${totalCount}건`, { bg: SUM_BG });
    cell(ws, rn, 14, "", { bg: SUM_BG });
    rn++;

    // 영수증 첨부분 / 생략분 (영수증 셀 2행 병합)
    ws.mergeCells(rn, 1, rn + 1, 1);
    cell(ws, rn, 1, "영수증", { bold: true, bg: SUM_BG });
    // 첨부분
    cell(ws, rn, 2, "첨부분", { bold: true, bg: SUM_BG });
    cell(ws, rn, 3, 0, { align: "right", numFmt: AMOUNT_FMT });
    cell(ws, rn, 4, "--");
    cell(ws, rn, 5, acc.attachedAmt, { align: "right", numFmt: AMOUNT_FMT });
    cell(ws, rn, 6, "--");
    cell(ws, rn, 7, "");
    for (let c = 8; c <= 12; c++) cell(ws, rn, c, "--");
    cell(ws, rn, 13, `${acc.attachedCount}건`);
    cell(ws, rn, 14, "");
    // 생략분
    cell(ws, rn + 1, 2, "생략분", { bold: true, bg: SUM_BG });
    cell(ws, rn + 1, 3, 0, { align: "right", numFmt: AMOUNT_FMT });
    cell(ws, rn + 1, 4, "--");
    cell(ws, rn + 1, 5, acc.omittedAmt, { align: "right", numFmt: AMOUNT_FMT });
    cell(ws, rn + 1, 6, "--");
    cell(ws, rn + 1, 7, "");
    for (let c = 8; c <= 12; c++) cell(ws, rn + 1, c, "--");
    cell(ws, rn + 1, 13, `${acc.omittedCount}건`);
    cell(ws, rn + 1, 14, "");
    rn += 2;

    // 푸터: 작성연월일 + 회계책임자 (테두리 없음)
    rn += 1;
    if (meta.writeDate) {
      ws.mergeCells(rn, 8, rn, 14);
      cell(ws, rn, 8, `작성연월일 : ${meta.writeDate}`, { align: "right", border: false });
      rn++;
    }
    const footerParts: string[] = [];
    if (meta.electionDistrict) footerParts.push(meta.electionDistrict);
    if (meta.candidateName) footerParts.push(`${meta.candidateName}후보`);
    const who = footerParts.join(" ");
    if (meta.accountant) {
      ws.mergeCells(rn, 5, rn, 14);
      cell(ws, rn, 5, `${who}   회계책임자 : ${meta.accountant} (인)`, { align: "right", border: false });
    }
  }

  return wb;
}
