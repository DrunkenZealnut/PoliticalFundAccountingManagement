/* ------------------------------------------------------------------ */
/*  서식 1·2: 선거비용 보전청구서 Excel 생성                            */
/*  근거: 공직선거법 §122의2, 공직선거관리규칙 §51의3                    */
/*  참고: 제9회 전국동시지방선거 선거비용보전안내서 p.133-135            */
/* ------------------------------------------------------------------ */

import ExcelJS from "exceljs";
import type { ClaimAmounts } from "../accounting/reimbursement-aggregator";
import { toKoreanAmount } from "../utils/korean-amount";

export type ClaimFormType = "form1" | "form2";

export interface ClaimRowGroup {
  /** "선거사무소" | "○○선거연락소" */
  label: string;
  amounts: ClaimAmounts;
  remark?: string;
}

export interface ReimbursementClaimAccount {
  holder: string;
  bankName: string;
  accountNumber: string;
  note?: string;
}

export interface ReimbursementClaimants {
  /** 후보자 (form1) */
  candidate?: string;
  /** 정당 대표자 (form2) */
  partyRepresentative?: string;
  campaignManager: string;
  accountant: string;
}

export interface ReimbursementClaimFormData {
  formType: ClaimFormType;
  electionName: string;
  partyName?: string;
  electionDistrictName?: string;
  candidateName?: string;
  rows: ClaimRowGroup[];
  totalAmount: number;
  account: ReimbursementClaimAccount;
  claimants: ReimbursementClaimants;
  isAdditional?: boolean;
  /** "2026년 6월 _일" — 사용자 입력 */
  submissionDate: string;
  /** "○○선거관리위원회" */
  receivingCommittee: string;
}

const fmtAmt = (n: number) => (n ? n.toLocaleString("ko-KR") : "");

const B_THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};

interface CellOpts {
  bold?: boolean;
  align?: "left" | "center" | "right";
  sz?: number;
  border?: boolean;
  bg?: string;
}

function cell(
  ws: ExcelJS.Worksheet,
  row: number,
  col: number,
  value: string | number,
  opts?: CellOpts,
) {
  const c = ws.getCell(row, col);
  c.value = value;
  c.font = { name: "맑은 고딕", size: opts?.sz ?? 10, bold: opts?.bold };
  c.alignment = {
    horizontal: opts?.align ?? "center",
    vertical: "middle",
    wrapText: true,
  };
  if (opts?.border !== false) c.border = B_THIN;
  if (opts?.bg) {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.bg } };
  }
}

const HDR_BG = "FFE8E8E8";
const SUM_BG = "FFF5F5F5";

/* ================================================================== */
/*  서식 1: 지역구지방의원 및 지방자치단체의 장 선거용                      */
/* ================================================================== */

function buildForm1(ws: ExcelJS.Worksheet, data: ReimbursementClaimFormData) {
  // 컬럼: A 구분 / B 후보자자산 / C 후원회기부금 / D 보조금 / E 보조금외 / F 합계 / G 비고 / H 여백
  ws.columns = [
    { width: 16 }, { width: 14 }, { width: 14 }, { width: 14 },
    { width: 14 }, { width: 14 }, { width: 12 }, { width: 8 },
  ];

  let r = 1;

  // 서식 라벨
  ws.mergeCells(r, 1, r, 2);
  cell(ws, r, 1, data.isAdditional ? "서식 1 (추가)" : "서식 1", {
    bold: true, sz: 9, align: "left", border: false,
  });
  r++;

  // 제목
  ws.mergeCells(r, 1, r, 8);
  cell(
    ws, r, 1,
    data.isAdditional ? "선거비용 보전청구서(추가)" : "선거비용 보전청구서",
    { bold: true, sz: 16, border: false },
  );
  ws.getRow(r).height = 30;
  r++;

  // 부제
  ws.mergeCells(r, 1, r, 8);
  cell(ws, r, 1, "(지역구지방의원 및 지방자치단체의 장 선거용)", {
    sz: 11, border: false,
  });
  r += 2;

  // 1~4 식별 항목
  for (const line of [
    `1. 선 거 명 : ${data.electionName}`,
    `2. 소속정당명 : ${data.partyName ?? ""}`,
    `3. 선거구명 : ${data.electionDistrictName ?? ""}`,
    `4. 후 보 자 명 : ${data.candidateName ?? ""}`,
  ]) {
    ws.mergeCells(r, 1, r, 8);
    cell(ws, r, 1, line, { align: "left", border: false });
    r++;
  }
  r++;

  // 5. 청구내역 헤더
  ws.mergeCells(r, 1, r, 4);
  cell(ws, r, 1, "5. 청구내역", { bold: true, align: "left", border: false });
  ws.mergeCells(r, 6, r, 8);
  cell(ws, r, 6, "(단위: 원)", { align: "right", border: false, sz: 9 });
  r++;

  // 청구내역 헤더 1행: 구분 / 청구액(merge B-E) / 합계 / 비고
  ws.mergeCells(r, 1, r + 1, 1);
  cell(ws, r, 1, "구 분", { bold: true, bg: HDR_BG });
  ws.mergeCells(r, 2, r, 5);
  cell(ws, r, 2, "청 구 액", { bold: true, bg: HDR_BG });
  ws.mergeCells(r, 6, r + 1, 6);
  cell(ws, r, 6, "합 계", { bold: true, bg: HDR_BG });
  ws.mergeCells(r, 7, r + 1, 7);
  cell(ws, r, 7, "비 고", { bold: true, bg: HDR_BG });
  r++;

  // 청구내역 헤더 2행: 후보자자산 / 후원회기부금 / 보조금 / 보조금외
  cell(ws, r, 2, "후보자\n자산", { bold: true, bg: HDR_BG, sz: 9 });
  cell(ws, r, 3, "후원회\n기부금", { bold: true, bg: HDR_BG, sz: 9 });
  cell(ws, r, 4, "보조금", { bold: true, bg: HDR_BG, sz: 9 });
  cell(ws, r, 5, "보조금외", { bold: true, bg: HDR_BG, sz: 9 });
  ws.getRow(r).height = 28;
  r++;

  // 청구내역 데이터 행
  const totals: ClaimAmounts = {
    후보자자산: 0, 후원회기부금: 0, 보조금: 0, 보조금외: 0, 합계: 0,
  };
  for (const grp of data.rows) {
    cell(ws, r, 1, grp.label, { align: "left" });
    cell(ws, r, 2, fmtAmt(grp.amounts.후보자자산), { align: "right" });
    cell(ws, r, 3, fmtAmt(grp.amounts.후원회기부금), { align: "right" });
    cell(ws, r, 4, fmtAmt(grp.amounts.보조금), { align: "right" });
    cell(ws, r, 5, fmtAmt(grp.amounts.보조금외), { align: "right" });
    cell(ws, r, 6, fmtAmt(grp.amounts.합계), { align: "right", bold: true });
    cell(ws, r, 7, grp.remark ?? "", { align: "left" });
    totals.후보자자산 += grp.amounts.후보자자산;
    totals.후원회기부금 += grp.amounts.후원회기부금;
    totals.보조금 += grp.amounts.보조금;
    totals.보조금외 += grp.amounts.보조금외;
    totals.합계 += grp.amounts.합계;
    r++;
  }

  // 합계 행
  cell(ws, r, 1, "합 계", { bold: true, bg: SUM_BG });
  cell(ws, r, 2, fmtAmt(totals.후보자자산), { align: "right", bold: true, bg: SUM_BG });
  cell(ws, r, 3, fmtAmt(totals.후원회기부금), { align: "right", bold: true, bg: SUM_BG });
  cell(ws, r, 4, fmtAmt(totals.보조금), { align: "right", bold: true, bg: SUM_BG });
  cell(ws, r, 5, fmtAmt(totals.보조금외), { align: "right", bold: true, bg: SUM_BG });
  cell(ws, r, 6, fmtAmt(totals.합계), { align: "right", bold: true, bg: SUM_BG });
  cell(ws, r, 7, "", { bg: SUM_BG });
  r += 2;

  // 6. 보전청구 총액
  const koreanAmt = toKoreanAmount(data.totalAmount);
  ws.mergeCells(r, 1, r, 8);
  cell(
    ws, r, 1,
    `6. 보전청구 총액 : 금 ${koreanAmt} 원(₩ ${fmtAmt(data.totalAmount)} )`,
    { align: "left", border: false, bold: true },
  );
  r += 2;

  // 7. 수령계좌
  ws.mergeCells(r, 1, r, 8);
  cell(ws, r, 1, "7. 수령계좌", { bold: true, align: "left", border: false });
  r++;

  // 수령계좌 헤더
  ws.mergeCells(r, 1, r, 2);
  cell(ws, r, 1, "예금주", { bold: true, bg: HDR_BG });
  ws.mergeCells(r, 3, r, 4);
  cell(ws, r, 3, "금융기관명", { bold: true, bg: HDR_BG });
  ws.mergeCells(r, 5, r, 6);
  cell(ws, r, 5, "계좌번호", { bold: true, bg: HDR_BG });
  ws.mergeCells(r, 7, r, 8);
  cell(ws, r, 7, "비 고", { bold: true, bg: HDR_BG });
  r++;

  // 수령계좌 데이터
  ws.mergeCells(r, 1, r, 2);
  cell(ws, r, 1, data.account.holder);
  ws.mergeCells(r, 3, r, 4);
  cell(ws, r, 3, data.account.bankName);
  ws.mergeCells(r, 5, r, 6);
  cell(ws, r, 5, data.account.accountNumber);
  ws.mergeCells(r, 7, r, 8);
  cell(ws, r, 7, data.account.note ?? "");
  r += 2;

  // 본문
  ws.mergeCells(r, 1, r, 8);
  cell(
    ws, r, 1,
    "2026년 6월 3일 실시한 제9회 전국동시지방선거에서 선거비용의 보전을 위와 같이 청구합니다.",
    { align: "left", border: false },
  );
  r += 2;

  // 붙임
  const attachments = [
    "붙임  1. 정치자금 수입·지출부(선거비용과목) 사본 1부.",
    "      2. 영수증 등 증빙서류(공직선거관리규칙 별표1의2에 따른 사진 등 객관적 증빙자료 포함) 사본 1부.",
    "      3. 선거연락소별 선거비용 보전청구서(선거연락소가 있는 경우에 한함) 사본 1부.",
    "      4. 정치자금 수입·지출 통장(수령계좌 통장) 사본 1부.",
  ];
  for (const att of attachments) {
    ws.mergeCells(r, 1, r, 8);
    cell(ws, r, 1, att, { align: "left", border: false, sz: 10 });
    r++;
  }
  r++;

  // 작성일자
  ws.mergeCells(r, 5, r, 8);
  cell(ws, r, 5, data.submissionDate, { align: "right", border: false });
  r += 2;

  // 청구인란
  ws.mergeCells(r, 1, r + 2, 1);
  cell(ws, r, 1, "청구인", { bold: true });
  cell(ws, r, 2, "후 보 자", { bold: true });
  ws.mergeCells(r, 3, r, 6);
  cell(ws, r, 3, data.claimants.candidate ?? "", { align: "left" });
  cell(ws, r, 7, "(인)", { align: "center" });
  ws.mergeCells(r, 8, r, 8);
  cell(ws, r, 8, "", { border: false });
  r++;
  cell(ws, r, 2, "선거사무장", { bold: true });
  ws.mergeCells(r, 3, r, 6);
  cell(ws, r, 3, data.claimants.campaignManager, { align: "left" });
  cell(ws, r, 7, "(인)");
  cell(ws, r, 8, "", { border: false });
  r++;
  cell(ws, r, 2, "회계책임자", { bold: true });
  ws.mergeCells(r, 3, r, 6);
  cell(ws, r, 3, data.claimants.accountant, { align: "left" });
  cell(ws, r, 7, "(인)");
  cell(ws, r, 8, "", { border: false });
  r += 2;

  // 수신처
  ws.mergeCells(r, 1, r, 8);
  cell(ws, r, 1, `${data.receivingCommittee} 귀중`, {
    bold: true, align: "right", border: false,
  });
  r += 2;

  // 주석
  const notes = [
    "주 1. 청구인란에는 선거사무소의 경우 후보자와 선거사무장 및 회계책임자가 모두 기명하고 날인을, 선거연락소의 경우 선거연락소장 및 회계책임자가 모두 기명하고 날인을 하여야 함.",
    "  2. 선거사무소는 선거구선거관리위원회에 당해 선거사무소의 보전청구 세부내역 및 증빙서류 사본을 첨부하여 청구하여야 함.",
    "  3. 선거연락소는 선거연락소에 대응하는 선거관리위원회에 당해 선거연락소의 보전청구 세부내역 및 증빙서류 사본을 첨부하여 청구하여야 함.",
    "  4. 선거연락소가 있는 경우 선거사무소는 위 \"5. 청구내역\"에 각 선거연락소의 보전청구금액을 함께 기재하고 선거연락소별 선거비용 보전청구서 사본을 함께 제출하여야 함.",
    "  5. 선거연락소는 위 \"5. 청구내역\"에 해당 선거연락소분만 기재하며, \"7. 수령계좌\"는 미기재함.",
    "  6. 보전청구기한 후 추가 보전청구 시 '선거비용 보전청구서(추가)'라고 개서하여 활용하되, 청구내역에 추가청구 내역을 작성하고 보전청구 총액은 기청구금액을 포함하여 총액을 기재함.",
    "  7. 정치자금 수입·지출 통장(수령계좌 통장) 사본은 정치자금 수입 통장 또는 후보자 명의의 통장 등 보전금을 지급받을 계좌의 사본을 첨부함.",
  ];
  for (const note of notes) {
    ws.mergeCells(r, 1, r, 8);
    cell(ws, r, 1, note, { align: "left", border: false, sz: 9 });
    r++;
  }
}

/* ================================================================== */
/*  서식 2: 비례대표지방의원선거용 (Phase 2 — 미구현 시 throw)            */
/* ================================================================== */

function buildForm2() {
  throw new Error(
    "서식 2 (비례대표지방의원선거용)는 Phase 2에서 구현 예정입니다.",
  );
}

/* ================================================================== */
/*  Public API                                                          */
/* ================================================================== */

export async function generateReimbursementClaimForm(
  data: ReimbursementClaimFormData,
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("선거비용 보전청구서");

  if (data.formType === "form1") {
    buildForm1(ws, data);
  } else {
    buildForm2();
  }

  return wb;
}
