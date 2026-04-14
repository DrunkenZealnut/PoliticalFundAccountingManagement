/* ------------------------------------------------------------------ */
/*  서식7: 점자형 선거공보 등 부담비용 지급청구서 Excel 생성              */
/*  근거: 공직선거법 §122의2③, 사무관리규칙 §51의2④                    */
/* ------------------------------------------------------------------ */

import ExcelJS from "exceljs";

export interface BurdenCostAmounts {
  점자형선거공보: number;
  점자형선거공약서: number;
  저장매체: number;
  활동보조인: number;
  total: number;
}

export interface BurdenCostFormData {
  electionName: string;
  partyName: string;
  candidateName: string;
  braillePublic: { count: number; pagesPerCopy: number };
  braillePledge: { count: number; pagesPerCopy: number };
  storageMedia: { count: number };
  amounts: BurdenCostAmounts;
  account: { holder: string; bankName: string; accountNumber: string };
}

const fmtAmt = (n: number) => (n ? n.toLocaleString("ko-KR") : "");

const B_THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin" }, left: { style: "thin" },
  bottom: { style: "thin" }, right: { style: "thin" },
};

function cell(
  ws: ExcelJS.Worksheet, row: number, col: number, value: string | number,
  opts?: { bold?: boolean; align?: "left" | "center" | "right"; sz?: number; border?: boolean; bg?: string; diagonal?: boolean },
) {
  const c = ws.getCell(row, col);
  c.value = value;
  c.font = { name: "맑은 고딕", size: opts?.sz || 10, bold: opts?.bold };
  c.alignment = { horizontal: opts?.align || "center", vertical: "middle", wrapText: true };
  if (opts?.border !== false) {
    if (opts?.diagonal) {
      c.border = { ...B_THIN, diagonal: { up: true, style: "thin" } };
    } else {
      c.border = B_THIN;
    }
  }
  if (opts?.bg) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.bg } };
}

export async function generateBurdenCostForm(data: BurdenCostFormData): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("부담비용 지급청구서");

  // 8열: A~H
  ws.columns = [
    { width: 14 }, // A: 작성·제출 부수(A) / 구분
    { width: 12 }, // B: 1부당 매수(B)
    { width: 12 }, // C: 총매수(C=A×B) / 계
    { width: 14 }, // D: 작성·발송 부수(A) / 제작비
    { width: 12 }, // E: 1부당 매수(B) / 저장매체전환비
    { width: 12 }, // F: 총매수(C=A×B) / 운반비
    { width: 10 }, // G: 저장매체(개) / 수당실비
    { width: 10 }, // H: (비고 등)
  ];

  let r = 1;

  // ── 서식 7 라벨 ──
  ws.mergeCells(r, 1, r, 2);
  cell(ws, r, 1, "서식 7", { bold: true, sz: 9, align: "left", border: false });
  r += 1;

  // ── 제목 ──
  ws.mergeCells(r, 1, r, 8);
  cell(ws, r, 1, "점자형 선거공보 등 부담비용 지급청구서", { bold: true, sz: 16, border: false });
  ws.getRow(r).height = 30;
  r += 2;

  // ── 1. 선 거 명 ──
  ws.mergeCells(r, 1, r, 8);
  cell(ws, r, 1, `1. 선 거 명 : ${data.electionName}`, { align: "left", border: false });
  r++;

  // ── 2. 소속정당명 ──
  ws.mergeCells(r, 1, r, 8);
  cell(ws, r, 1, `2. 소속정당명 : ${data.partyName || ""}`, { align: "left", border: false });
  r++;

  // ── 3. 후 보 자 명 ──
  ws.mergeCells(r, 1, r, 8);
  cell(ws, r, 1, `3. 후 보 자 명 : ${data.candidateName}`, { align: "left", border: false });
  r++;

  // ── 4. 점자형 선거공보 등 작성·제출수량 ──
  ws.mergeCells(r, 1, r, 8);
  cell(ws, r, 1, "4. 점자형 선거공보 등 작성·제출수량", { bold: true, align: "left", border: false });
  r++;

  // 수량표 헤더 1행
  const hBg = "FFE8E8E8";
  ws.mergeCells(r, 1, r, 3);
  cell(ws, r, 1, "점자형 선거공보", { bold: true, bg: hBg });
  ws.mergeCells(r, 4, r, 6);
  cell(ws, r, 4, "점자형 선거공약서", { bold: true, bg: hBg });
  ws.mergeCells(r, 7, r + 1, 7);
  cell(ws, r, 7, "저장매체\n(개)", { bold: true, sz: 9, bg: hBg });
  r++;

  // 수량표 헤더 2행
  cell(ws, r, 1, "작성·제출\n부수(A)", { bold: true, sz: 9, bg: hBg });
  cell(ws, r, 2, "1부당 매수\n(B)", { bold: true, sz: 9, bg: hBg });
  cell(ws, r, 3, "총매수\n(C=A×B)", { bold: true, sz: 9, bg: hBg });
  cell(ws, r, 4, "작성·발송\n부수(A)", { bold: true, sz: 9, bg: hBg });
  cell(ws, r, 5, "1부당 매수\n(B)", { bold: true, sz: 9, bg: hBg });
  cell(ws, r, 6, "총매수\n(C=A×B)", { bold: true, sz: 9, bg: hBg });
  ws.getRow(r).height = 28;
  r++;

  // 수량표 데이터
  const bp = data.braillePublic;
  const bl = data.braillePledge;
  cell(ws, r, 1, bp.count || "");
  cell(ws, r, 2, bp.pagesPerCopy || "");
  cell(ws, r, 3, bp.count && bp.pagesPerCopy ? bp.count * bp.pagesPerCopy : "");
  cell(ws, r, 4, bl.count || "");
  cell(ws, r, 5, bl.pagesPerCopy || "");
  cell(ws, r, 6, bl.count && bl.pagesPerCopy ? bl.count * bl.pagesPerCopy : "");
  cell(ws, r, 7, data.storageMedia.count || "");
  r += 2;

  // ── 5. 청구금액 ──
  ws.mergeCells(r, 1, r, 5);
  cell(ws, r, 1, "5. 청구금액", { bold: true, align: "left", border: false });
  ws.mergeCells(r, 6, r, 7);
  cell(ws, r, 6, "(단위 : 원)", { align: "right", border: false, sz: 9 });
  r++;

  // 청구금액 헤더
  cell(ws, r, 1, "구 분", { bold: true, bg: hBg });
  cell(ws, r, 2, "계", { bold: true, bg: hBg });
  cell(ws, r, 3, "제작비\n(한글인쇄료\n포함)", { bold: true, sz: 8, bg: hBg });
  cell(ws, r, 4, "저장매체\n디지털파일\n전환비", { bold: true, sz: 8, bg: hBg });
  cell(ws, r, 5, "운반비", { bold: true, bg: hBg });
  cell(ws, r, 6, "수당·실비\n·산재보험료", { bold: true, sz: 8, bg: hBg });
  ws.getRow(r).height = 36;
  r++;

  // 점자형 선거공보: 제작비 O, 전환비 X, 운반비 O, 수당 X
  cell(ws, r, 1, "점자형 선거공보");
  cell(ws, r, 2, fmtAmt(data.amounts.점자형선거공보), { align: "right" });
  cell(ws, r, 3, "");
  cell(ws, r, 4, "", { diagonal: true });
  cell(ws, r, 5, "");
  cell(ws, r, 6, "", { diagonal: true });
  r++;

  // 점자형 선거공약서: 제작비 O, 전환비 X, 운반비 X, 수당 X
  cell(ws, r, 1, "점자형 선거공약서");
  cell(ws, r, 2, fmtAmt(data.amounts.점자형선거공약서), { align: "right" });
  cell(ws, r, 3, "");
  cell(ws, r, 4, "", { diagonal: true });
  cell(ws, r, 5, "", { diagonal: true });
  cell(ws, r, 6, "", { diagonal: true });
  r++;

  // 저장매체: 제작비 O, 전환비 O, 운반비 O, 수당 X
  cell(ws, r, 1, "저장매체");
  cell(ws, r, 2, fmtAmt(data.amounts.저장매체), { align: "right" });
  cell(ws, r, 3, "");
  cell(ws, r, 4, "");
  cell(ws, r, 5, "");
  cell(ws, r, 6, "", { diagonal: true });
  r++;

  // 활동보조인: 제작비 X, 전환비 X, 운반비 X, 수당 O
  cell(ws, r, 1, "활동보조인\n수당·실비 등");
  cell(ws, r, 2, fmtAmt(data.amounts.활동보조인), { align: "right" });
  cell(ws, r, 3, "", { diagonal: true });
  cell(ws, r, 4, "", { diagonal: true });
  cell(ws, r, 5, "", { diagonal: true });
  cell(ws, r, 6, fmtAmt(data.amounts.활동보조인), { align: "right" });
  r++;

  // 계
  cell(ws, r, 1, "계", { bold: true, bg: hBg });
  cell(ws, r, 2, fmtAmt(data.amounts.total), { bold: true, align: "right", bg: hBg });
  cell(ws, r, 3, "", { bg: hBg }); cell(ws, r, 4, "", { bg: hBg });
  cell(ws, r, 5, "", { bg: hBg }); cell(ws, r, 6, "", { bg: hBg });
  r++;

  // ※ 주석
  ws.mergeCells(r, 1, r, 7);
  cell(ws, r, 1, "※ 점자형선거공약서 발송용 봉투제작비와 우편발송비용은 보전대상 선거비용", { sz: 8, align: "left", border: false });
  r += 2;

  // ── 6. 수령계좌 ──
  ws.mergeCells(r, 1, r, 7);
  cell(ws, r, 1, "6. 수령계좌", { bold: true, align: "left", border: false });
  r++;

  cell(ws, r, 1, "예금주", { bold: true, bg: hBg });
  cell(ws, r, 2, "금융기관명", { bold: true, bg: hBg });
  ws.mergeCells(r, 3, r, 5);
  cell(ws, r, 3, "계좌번호", { bold: true, bg: hBg });
  ws.mergeCells(r, 6, r, 7);
  cell(ws, r, 6, "비 고", { bold: true, bg: hBg });
  r++;

  cell(ws, r, 1, data.account.holder);
  cell(ws, r, 2, data.account.bankName);
  ws.mergeCells(r, 3, r, 5);
  cell(ws, r, 3, data.account.accountNumber);
  ws.mergeCells(r, 6, r, 7);
  cell(ws, r, 6, "");
  r += 2;

  // ── 청구 문구 ──
  ws.mergeCells(r, 1, r + 2, 7);
  cell(ws, r, 1,
    `2026년 6월 3일 실시한 ${data.electionName}에서 (점자형 선거공보)·(저장매체)·(점자형 선거공약서)·(활동보조인 수당·실비 및 산재보험료)에 대한 부담비용을 위와 같이 청구합니다.`,
    { align: "left", border: false, sz: 10 },
  );
  r += 4;

  // ── 첨부서류 ──
  ws.mergeCells(r, 1, r, 7);
  cell(ws, r, 1, "붙임  1. 정치자금 수입·지출부 사본 1부.", { align: "left", border: false, sz: 9 });
  r++;
  ws.mergeCells(r, 1, r, 7);
  cell(ws, r, 1, "        2. 활동보조인 수당·실비 지급 명세서 1부.", { align: "left", border: false, sz: 9 });
  r++;
  ws.mergeCells(r, 1, r, 7);
  cell(ws, r, 1, "        3. 영수증 등 증빙서류 사본 1부.", { align: "left", border: false, sz: 9 });
  r++;
  ws.mergeCells(r, 1, r, 7);
  cell(ws, r, 1, "        4. 정치자금 수입·지출 통장(수령계좌 통장) 사본 1부.", { align: "left", border: false, sz: 9 });
  r += 2;

  // ── 날짜 ──
  ws.mergeCells(r, 1, r, 7);
  cell(ws, r, 1, "2026년        월        일", { align: "center", border: false, sz: 11 });
  r += 2;

  // ── 청구인 서명란 ──
  ws.mergeCells(r, 3, r, 5);
  cell(ws, r, 3, "○○당 대표자", { align: "left", border: false });
  ws.mergeCells(r, 6, r, 7);
  cell(ws, r, 6, "직인", { align: "center", border: false, sz: 9 });
  r++;
  ws.mergeCells(r, 3, r, 5);
  cell(ws, r, 3, "(후 보 자)", { align: "left", border: false });
  ws.mergeCells(r, 6, r, 7);
  cell(ws, r, 6, "인", { align: "center", border: false, sz: 9 });
  r++;
  cell(ws, r, 2, "청구인", { align: "center", border: false });
  ws.mergeCells(r, 3, r, 5);
  cell(ws, r, 3, "선 거 사 무 장", { align: "left", border: false });
  ws.mergeCells(r, 6, r, 7);
  cell(ws, r, 6, "인", { align: "center", border: false, sz: 9 });
  r++;
  ws.mergeCells(r, 3, r, 5);
  cell(ws, r, 3, "회 계 책 임 자", { align: "left", border: false });
  ws.mergeCells(r, 6, r, 7);
  cell(ws, r, 6, "인", { align: "center", border: false, sz: 9 });
  r += 2;

  // ── ○○선거관리위원회 귀중 ──
  ws.mergeCells(r, 1, r, 7);
  cell(ws, r, 1, "○○선거관리위원회 귀중", { bold: true, sz: 14, align: "center", border: false });

  return wb;
}
