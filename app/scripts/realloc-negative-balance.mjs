#!/usr/bin/env node
/**
 * realloc-negative-balance.mjs  (READ-ONLY 조회 + 엑셀 산출)
 *
 * 오준석 후보(org_id=11) acc_book을 단일 현금풀 캐스케이드로 재배분(Option B)하여
 * 계정(자금원)별 정치자금 수입지출부 .xlsx 를 생성한다. acc_book·DB는 수정하지 않는다.
 *
 * 알고리즘은 src/lib/accounting/fund-realloc.ts 를 충실히 전사한 것이며
 * (Node가 확장자 없는 .ts 임포트를 막아 인라인), fund-realloc.test.ts(8케이스)로 검증됨.
 * 런타임에서 음수 0·총액 보존을 assert 해 전사 오류를 잡는다.
 *
 * 사용법: node scripts/realloc-negative-balance.mjs [--org-id 11] [--out <path>]
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";

function loadEnv() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) { console.error(".env.local not found (run from app/)"); process.exit(1); }
  for (const l of readFileSync(p, "utf-8").split("\n")) {
    const t = l.trim(); if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i < 0) continue;
    const k = t.slice(0, i).trim(); if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
  }
}
loadEnv();
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { db: { schema: "pfam" } },
);

const args = process.argv.slice(2);
const getArg = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const orgId = Number(getArg("--org-id", "11"));
const outPath = getArg("--out", resolve(process.cwd(), "..", "오준석_정치자금수입지출부_계정별_재배분.xlsx"));

const SRC_NAME = { 82: "보조금", 83: "보조금외", 84: "후보자자산", 85: "후원회기부금" };
const SHEET_ORDER = [84, 85, 83, 82];
const won = (n) => Number(n).toLocaleString("ko-KR");

// ── 정렬 SSOT(acc-book-sort.ts) 전사 ──
function compareAccDateTime(a, b) {
  if (a.acc_date !== b.acc_date) return a.acc_date < b.acc_date ? -1 : 1;
  const ta = a.acc_time ?? "", tb = b.acc_time ?? "";
  if (ta === tb) return 0;
  return ta < tb ? -1 : 1;
}

// ── fund-realloc.ts reallocateFundSources 전사 ──
function reallocateFundSources(rows, opts = {}) {
  const priority = opts.overflowPriority ?? [84, 83, 82];
  const sorted = [...rows].sort((a, b) => compareAccDateTime(a, b) || a.acc_book_id - b.acc_book_id);
  const avail = new Map();
  const get = (s) => avail.get(s) ?? 0;
  const out = [], redistributions = [], shortfalls = [];
  for (const r of sorted) {
    if (r.incm_sec_cd === 1) {
      avail.set(r.acc_sec_cd, get(r.acc_sec_cd) + r.acc_amt);
      out.push({ ...r, sheetAccSecCd: r.acc_sec_cd, effectiveAmt: r.acc_amt, origin: "as-is" }); continue;
    }
    if (r.acc_amt <= 0) {
      avail.set(r.acc_sec_cd, get(r.acc_sec_cd) - r.acc_amt);
      out.push({ ...r, sheetAccSecCd: r.acc_sec_cd, effectiveAmt: r.acc_amt, origin: "as-is" }); continue;
    }
    const S = r.acc_sec_cd; let need = r.acc_amt;
    const useS = Math.min(need, Math.max(0, get(S))); avail.set(S, get(S) - useS); need -= useS;
    const moves = [];
    for (const O of priority) { if (need <= 0) break; if (O === S) continue; const a = Math.max(0, get(O)); if (a <= 0) continue; const u = Math.min(need, a); avail.set(O, get(O) - u); need -= u; moves.push({ to: O, amt: u }); }
    if (need > 0) for (const O of [...avail.keys()]) { if (need <= 0) break; if (O === S || priority.includes(O)) continue; const a = Math.max(0, get(O)); if (a <= 0) continue; const u = Math.min(need, a); avail.set(O, get(O) - u); need -= u; moves.push({ to: O, amt: u }); }
    const split = moves.length > 0;
    if (useS > 0 || !split) out.push({ ...r, sheetAccSecCd: S, effectiveAmt: useS, origin: split ? "split-keep" : "as-is", splitGroupId: split ? r.acc_book_id : undefined });
    for (const m of moves) {
      out.push({ ...r, sheetAccSecCd: m.to, effectiveAmt: m.amt, origin: "split-moved", splitGroupId: r.acc_book_id, note: `재배분 #${r.acc_book_id} ${SRC_NAME[S]}→${SRC_NAME[m.to]}` });
      redistributions.push({ acc_book_id: r.acc_book_id, acc_date: r.acc_date, fromAccSecCd: S, toAccSecCd: m.to, movedAmt: m.amt, content: r.content });
    }
    if (need > 0) { avail.set(S, get(S) - need); out.push({ ...r, sheetAccSecCd: S, effectiveAmt: need, origin: split ? "split-keep" : "as-is", splitGroupId: split ? r.acc_book_id : undefined, note: `진짜부족 ${need}` }); shortfalls.push({ acc_book_id: r.acc_book_id, acc_date: r.acc_date, accSecCd: S, shortAmt: need }); }
  }
  return { rows: out, redistributions, shortfalls };
}

const cust = (r) => { const c = Array.isArray(r.customer) ? r.customer[0] : r.customer; return c ?? {}; };
const fmtDate = (d) => d && d.length === 8 ? `${d.slice(0, 4)}/${d.slice(4, 6)}/${d.slice(6, 8)}` : (d ?? "");

function buildSheet(wb, src, outRows) {
  const ws = wb.addWorksheet(SRC_NAME[src] ?? String(src));
  const border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
  ws.mergeCells("A1:O1"); ws.getCell("A1").value = `정 치 자 금  수 입 · 지 출 부  [${SRC_NAME[src] ?? src}]`;
  ws.getCell("A1").font = { bold: true, size: 14 }; ws.getCell("A1").alignment = { horizontal: "center" };
  ws.getCell("N2").value = "(단위 : 원)"; ws.getCell("N2").alignment = { horizontal: "right" };
  const H1 = ["번호", "년월일", "내 역", "수 입 액", "", "지 출 액", "", "잔 액", "수입제공/지출수령자", "", "", "", "", "영수증", "비 고"];
  ws.getRow(5).values = H1;
  ws.mergeCells("D5:E5"); ws.mergeCells("F5:G5"); ws.mergeCells("I5:M5");
  ws.mergeCells("A5:A6"); ws.mergeCells("B5:B6"); ws.mergeCells("C5:C6"); ws.mergeCells("H5:H6"); ws.mergeCells("N5:N6"); ws.mergeCells("O5:O6");
  ws.getRow(6).values = ["", "", "", "금회", "누계", "금회", "누계", "", "성명", "생년월일/사업자", "주소", "직업", "전화", "", ""];
  for (let r = 5; r <= 6; r++) for (let c = 1; c <= 15; c++) { const cell = ws.getRow(r).getCell(c); cell.font = { bold: true, size: 9 }; cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; cell.border = border; }
  [5, 11, 18, 12, 12, 12, 12, 12, 10, 12, 20, 8, 13, 10, 16].forEach((w, i) => (ws.getColumn(i + 1).width = w));

  const rows = outRows.filter((r) => r.sheetAccSecCd === src).sort((a, b) => compareAccDateTime(a, b) || a.acc_book_id - b.acc_book_id);
  let incCum = 0, expCum = 0, n = 0;
  for (const r of rows) {
    const isInc = r.incm_sec_cd === 1;
    if (isInc) incCum += r.effectiveAmt; else expCum += r.effectiveAmt;
    const bal = incCum - expCum;
    const c = cust(r);
    let content = r.content ?? "";
    if (r.origin === "split-moved") content += " ⟵재배분 유입";
    else if (r.origin === "split-keep") content += " (분할)";
    const row = ws.getRow(7 + n);
    row.values = [
      n + 1, fmtDate(r.acc_date), content,
      isInc ? r.effectiveAmt : null, isInc ? incCum : null,
      !isInc ? r.effectiveAmt : null, !isInc ? expCum : null,
      bal, c.name ?? "", c.reg_num ?? "", c.addr ?? "", c.job ?? "", c.tel ?? "",
      r.rcp_no ?? "", (r.note ? r.note + " " : "") + (r.bigo ?? ""),
    ];
    for (let cc = 1; cc <= 15; cc++) { const cell = row.getCell(cc); cell.border = border; cell.font = { size: 9 }; if ([4, 5, 6, 7, 8].includes(cc)) { cell.numFmt = "#,##0"; cell.alignment = { horizontal: "right" }; } }
    if (bal < 0) row.getCell(8).font = { size: 9, color: { argb: "FFCC0000" }, bold: true };
    n++;
  }
  ws.getRow(7 + n).values = ["", "합계", "", incCum, "", expCum, "", incCum - expCum, "", "", "", "", "", "", ""];
  for (let cc = 1; cc <= 15; cc++) { const cell = ws.getRow(7 + n).getCell(cc); cell.font = { bold: true, size: 9 }; cell.border = border; if ([4, 6, 8].includes(cc)) cell.numFmt = "#,##0"; }
  return { incCum, expCum };
}

function buildReport(wb, res, srcExpenseBefore) {
  const ws = wb.addWorksheet("재배분 리포트");
  ws.getCell("A1").value = "자금원 재배분 리포트 (Option B: 단일 현금풀 캐스케이드)"; ws.getCell("A1").font = { bold: true, size: 13 };
  ws.getCell("A2").value = "※ acc_book 원본은 수정하지 않은 표시용 재배분입니다. DB 무변경.";
  let r = 4;
  ws.getRow(r++).values = ["재배분 내역 (이동)"]; ws.getRow(r).values = ["날짜", "원거래#", "자금원(원)→(이동)", "금액", "내역"]; ws.getRow(r).font = { bold: true }; r++;
  for (const m of res.redistributions) { ws.getRow(r++).values = [fmtDate(m.acc_date), m.acc_book_id, `${SRC_NAME[m.fromAccSecCd]}→${SRC_NAME[m.toAccSecCd]}`, m.movedAmt, m.content ?? ""]; }
  r++;
  ws.getRow(r++).values = ["진짜 부족(통장 양수면 없음)"]; ws.getRow(r).values = ["날짜", "원거래#", "자금원", "부족액"]; ws.getRow(r).font = { bold: true }; r++;
  if (res.shortfalls.length === 0) ws.getRow(r++).values = ["(없음 — 모든 자금원 음수 0)"];
  else for (const s of res.shortfalls) ws.getRow(r++).values = [fmtDate(s.acc_date), s.acc_book_id, SRC_NAME[s.accSecCd], s.shortAmt];
  r++;
  ws.getRow(r++).values = ["총액 보존 검증 (재배분 전후 자금원별 지출합)"]; ws.getRow(r).values = ["자금원", "재배분 전 지출", "재배분 후 지출(시트)", "차이"]; ws.getRow(r).font = { bold: true }; r++;
  const afterBySrc = {};
  for (const row of res.rows) if (row.incm_sec_cd === 2) afterBySrc[row.sheetAccSecCd] = (afterBySrc[row.sheetAccSecCd] ?? 0) + row.effectiveAmt;
  let beforeTot = 0, afterTot = 0;
  for (const src of SHEET_ORDER) { const b = srcExpenseBefore[src] ?? 0, a = afterBySrc[src] ?? 0; if (b === 0 && a === 0) continue; ws.getRow(r++).values = [SRC_NAME[src], b, a, a - b]; beforeTot += b; afterTot += a; }
  ws.getRow(r++).values = ["총계", beforeTot, afterTot, afterTot - beforeTot]; ws.getRow(r - 1).font = { bold: true };
  ws.getColumn(1).width = 16; ws.getColumn(3).width = 24; [2, 3, 4].forEach((c) => (ws.getColumn(c).width = 16));
}

async function main() {
  // 페이징 — 재배분/총액보존/최저잔액 검증 정확도 위해 전체 행 확보
  const pageSize = 5000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("acc_book")
      .select("acc_book_id, incm_sec_cd, acc_sec_cd, item_sec_cd, acc_date, acc_time, acc_amt, content, rcp_no, bigo, cust_id, customer:cust_id(name, reg_num, addr, job, tel)")
      .eq("org_id", orgId)
      .order("acc_book_id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) { console.error("조회 실패:", error.message); process.exit(1); }
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  console.log(`조회 ${rows.length}행 (org_id=${orgId})`);

  const srcExpenseBefore = {};
  for (const r of rows) if (r.incm_sec_cd === 2) srcExpenseBefore[r.acc_sec_cd] = (srcExpenseBefore[r.acc_sec_cd] ?? 0) + r.acc_amt;

  const res = reallocateFundSources(rows, { overflowPriority: [84, 83, 82] });

  // ── 런타임 검증 (전사 오류·로직 검출) ──
  const totBefore = rows.filter((r) => r.incm_sec_cd === 2).reduce((s, r) => s + r.acc_amt, 0);
  const totAfter = res.rows.filter((r) => r.incm_sec_cd === 2).reduce((s, r) => s + r.effectiveAmt, 0);
  if (Math.abs(totBefore - totAfter) > 0.5) { console.error(`✗ 총 지출 보존 실패: 전 ${won(totBefore)} ≠ 후 ${won(totAfter)}`); process.exit(1); }
  // 자금원별 시간순 최저잔액
  const sorted = [...res.rows].sort((a, b) => compareAccDateTime(a, b) || a.acc_book_id - b.acc_book_id);
  const bal = {}, min = {};
  for (const r of sorted) { const s = r.sheetAccSecCd; bal[s] = (bal[s] ?? 0) + (r.incm_sec_cd === 1 ? r.effectiveAmt : -r.effectiveAmt); min[s] = Math.min(min[s] ?? 0, bal[s]); }
  console.log("재배분 후 자금원별 최저잔액:");
  for (const s of SHEET_ORDER) if (min[s] !== undefined) console.log(`  ${SRC_NAME[s]}: 최저 ${won(min[s])}  ${min[s] < 0 ? "⚠" : "✓"}`);
  console.log(`재배분 이동 ${res.redistributions.length}건, 진짜부족 ${res.shortfalls.length}건, 총지출 보존 ${won(totAfter)} ✓`);

  // ── 엑셀 생성 ──
  const wb = new ExcelJS.Workbook();
  for (const src of SHEET_ORDER) if (res.rows.some((r) => r.sheetAccSecCd === src)) buildSheet(wb, src, res.rows);
  buildReport(wb, res, srcExpenseBefore);
  await wb.xlsx.writeFile(outPath);
  console.log(`\n✅ 엑셀 생성: ${outPath}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
