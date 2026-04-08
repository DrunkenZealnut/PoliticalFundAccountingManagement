#!/usr/bin/env node
/**
 * generate-and-compare.mjs
 *
 * Supabase에서 데이터를 가져와 reports/page.tsx와 동일한 방식으로
 * 엑셀 워크북을 생성하고, 레거시 .xls 템플릿과 구조를 비교합니다.
 *
 * 사용법:
 *   node scripts/generate-and-compare.mjs --org-id <id> [--legacy-dir <path>] [--output <path>]
 *   node scripts/generate-and-compare.mjs --help
 *
 * 환경변수 (.env.local에서 자동 로드):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, join } from "path";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";

// ─── Load .env.local ────────────────────────────────────

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    console.error("Error: .env.local not found. Run from app/ directory.");
    process.exit(1);
  }
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

// ─── Excel Style Constants ──────────────────────────────

const THIN_BORDER = {
  top: { style: "thin" }, bottom: { style: "thin" },
  left: { style: "thin" }, right: { style: "thin" },
};
const HEADER_FONT = { bold: true, size: 9 };
const CENTER_ALIGN = { horizontal: "center", vertical: "middle", wrapText: true };

function applyHeaderStyle(ws, rowStart, rowEnd, colStart, colEnd) {
  for (let r = rowStart; r <= rowEnd; r++) {
    for (let c = colStart; c <= colEnd; c++) {
      const cell = ws.getRow(r).getCell(c);
      cell.font = HEADER_FONT;
      cell.alignment = CENTER_ALIGN;
      cell.border = THIN_BORDER;
    }
  }
}

function applyDataCellStyle(ws, row, colStart, colEnd, moneyCols) {
  for (let c = colStart; c <= colEnd; c++) {
    const cell = ws.getRow(row).getCell(c);
    cell.border = THIN_BORDER;
    cell.font = { size: 9 };
    if (moneyCols.includes(c)) {
      cell.numFmt = "#,##0";
      cell.alignment = { horizontal: "right" };
    }
  }
}

function formatDate(d) {
  if (d && d.length === 8) return `${d.slice(0, 4)}/${d.slice(4, 6)}/${d.slice(6, 8)}`;
  return d || "";
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}년 ${String(d.getMonth() + 1).padStart(2, "0")}월 ${String(d.getDate()).padStart(2, "0")}일`;
}

// ─── Sheet Builders (mirrors reports/page.tsx) ──────────

function buildSummarySheet(wb, records, orgName, dateFrom, dateTo, getName, acctName, electionName, districtName) {
  const ws = wb.addWorksheet("정치자금 수입지출보고서");

  // Row 1: Title
  ws.mergeCells("A1:H1");
  ws.getCell("A1").value = "정치자금 수입·지출보고서";
  ws.getCell("A1").font = { bold: true, size: 16 };
  ws.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };

  // Row 2: 문서번호
  ws.mergeCells("A2:H2");
  ws.getCell("A2").value = "문서번호 :";

  // Row 3: 선거명/선거구명
  ws.mergeCells("A3:B3"); ws.getCell("A3").value = "선  거  명";
  ws.getCell("A3").border = THIN_BORDER; ws.getCell("A3").alignment = CENTER_ALIGN;
  ws.mergeCells("C3:E3"); ws.getCell("C3").value = electionName || "";
  ws.getCell("C3").border = THIN_BORDER; ws.getCell("C3").alignment = CENTER_ALIGN;
  ws.getCell("F3").value = "선거구명";
  ws.getCell("F3").border = THIN_BORDER; ws.getCell("F3").alignment = CENTER_ALIGN;
  ws.mergeCells("G3:H3"); ws.getCell("G3").value = districtName || "";
  ws.getCell("G3").border = THIN_BORDER; ws.getCell("G3").alignment = CENTER_ALIGN;

  // Row 4: 성명
  ws.mergeCells("A4:B4");
  ws.getCell("A4").value = "국회의원·후보자·예비후보자 등의\n성명 및 연락소의 명칭";
  ws.getCell("A4").border = THIN_BORDER; ws.getCell("A4").alignment = { ...CENTER_ALIGN, wrapText: true };
  ws.getCell("A4").font = { size: 9 };
  ws.mergeCells("C4:H4"); ws.getCell("C4").value = orgName;
  ws.getCell("C4").border = THIN_BORDER; ws.getCell("C4").alignment = CENTER_ALIGN;

  // Row 5
  ws.mergeCells("A5:H5"); ws.getCell("A5").value = "정치자금 수입·지출액";
  ws.getCell("A5").alignment = CENTER_ALIGN; ws.getCell("A5").font = { bold: true, size: 10 };
  ws.getCell("A5").border = THIN_BORDER;

  // Row 6-7 headers
  ws.mergeCells("A6:B7"); ws.getRow(6).getCell(1).value = "구        분";
  ws.mergeCells("C6:C7"); ws.getRow(6).getCell(3).value = "수 입";
  ws.mergeCells("D6:F6"); ws.getRow(6).getCell(4).value = "지     출";
  ws.getRow(7).getCell(4).value = "선거비용"; ws.getRow(7).getCell(5).value = "선거비용외"; ws.getRow(7).getCell(6).value = "소계";
  ws.mergeCells("G6:G7"); ws.getRow(6).getCell(7).value = "잔 액";
  ws.mergeCells("H6:H7"); ws.getRow(6).getCell(8).value = "비 고";
  applyHeaderStyle(ws, 6, 7, 1, 8);

  // Aggregate into fixed categories
  const cats = [
    { income: 0, expE: 0, expO: 0 }, // 자산
    { income: 0, expE: 0, expO: 0 }, // 후원회기부금
    { income: 0, expE: 0, expO: 0 }, // 보조금
    { income: 0, expE: 0, expO: 0 }, // 보조금외
  ];
  for (const r of records) {
    const n = getName(r.acc_sec_cd).toLowerCase();
    let ci = 0;
    if (n.includes("후원회") || n.includes("기부금")) ci = 1;
    else if (n.includes("보조금")) ci = 2;
    const isE = r.item_sec_cd ? !getName(r.item_sec_cd).includes("선거비용외") && getName(r.item_sec_cd).includes("선거비용") : false;
    if (r.incm_sec_cd === 1) cats[ci].income += r.acc_amt;
    else if (isE) cats[ci].expE += r.acc_amt;
    else cats[ci].expO += r.acc_amt;
  }

  function wr(row, c1, c2, c) {
    const r = ws.getRow(row);
    r.getCell(1).value = c1; r.getCell(2).value = c2;
    r.getCell(3).value = c.income; r.getCell(4).value = c.expE;
    r.getCell(5).value = c.expO; r.getCell(6).value = c.expE + c.expO;
    r.getCell(7).value = c.income - c.expE - c.expO; r.getCell(8).value = "";
    applyDataCellStyle(ws, row, 1, 8, [3, 4, 5, 6, 7]);
  }

  let rowIdx = 8;
  wr(rowIdx, "자        산", "", cats[0]); rowIdx++;
  wr(rowIdx, "후원회기부금", "", cats[1]); rowIdx++;
  ws.mergeCells(`A${rowIdx}:A${rowIdx+1}`);
  ws.getRow(rowIdx).getCell(1).value = "정당의 지원금";
  wr(rowIdx, "", "보조금", cats[2]); ws.getRow(rowIdx).getCell(1).value = "정당의 지원금"; rowIdx++;
  wr(rowIdx, "", "보조금외", cats[3]); rowIdx++;

  const tI = cats.reduce((s,c)=>s+c.income,0), tE = cats.reduce((s,c)=>s+c.expE,0), tO = cats.reduce((s,c)=>s+c.expO,0);
  ws.mergeCells(`A${rowIdx}:B${rowIdx}`);
  wr(rowIdx, "합        계", "", { income: tI, expE: tE, expO: tO });
  for (let c = 1; c <= 8; c++) ws.getRow(rowIdx).getCell(c).font = { bold: true, size: 9 };
  rowIdx += 2;

  // Footer
  ws.mergeCells(`A${rowIdx}:H${rowIdx}`);
  ws.getCell(`A${rowIdx}`).value = "「정치자금법」 제 40조의 규정에 의하여 위와 같이  정치자금의 수입·지출내역을 보고합니다.";
  rowIdx += 2;
  const dateStr = dateTo.length === 8 ? `${dateTo.slice(0,4)}년 ${dateTo.slice(4,6)}월 ${dateTo.slice(6,8)}일` : "";
  ws.mergeCells(`A${rowIdx}:H${rowIdx}`); ws.getCell(`A${rowIdx}`).value = dateStr;
  ws.getCell(`A${rowIdx}`).alignment = { horizontal: "center" }; rowIdx += 2;
  ws.mergeCells(`A${rowIdx}:H${rowIdx}`); ws.getCell(`A${rowIdx}`).value = `${orgName}  회계책임자  ${acctName || ""}  (인)`;
  ws.getCell(`A${rowIdx}`).alignment = { horizontal: "center" }; rowIdx += 2;
  ws.mergeCells(`A${rowIdx}:F${rowIdx}`); ws.getCell(`A${rowIdx}`).value = "(예비)후보자                    (인)";
  ws.getCell(`A${rowIdx}`).alignment = { horizontal: "center" }; rowIdx += 2;
  ws.mergeCells(`A${rowIdx}:F${rowIdx}`); ws.getCell(`A${rowIdx}`).value = "선거사무(연락)소장              (인)";
  ws.getCell(`A${rowIdx}`).alignment = { horizontal: "center" }; rowIdx += 2;
  ws.mergeCells(`A${rowIdx}:H${rowIdx}`); ws.getCell(`A${rowIdx}`).value = `${districtName || ""}선거관리위원회 귀중`;
  ws.getCell(`A${rowIdx}`).font = { bold: true, size: 14 }; ws.getCell(`A${rowIdx}`).alignment = { horizontal: "center" }; rowIdx += 2;
  ws.getCell(`A${rowIdx}`).value = "※ 구비서류"; ws.getCell(`A${rowIdx}`).font = { bold: true }; rowIdx++;
  for (const d of ["1. 재산명세서 1부.","2. 과목별 정치자금 수입·지출부 1부.","3. 정치자금 수입·지출 예금통장 사본 1부.","4. 과목별 영수증 그 밖의 증빙서류 사본 1부.","5. 선거비용지출내역 수입·지출집계표(선거연락소를 설치한 선거사무소에 한함) 1부."]) {
    ws.mergeCells(`A${rowIdx}:H${rowIdx}`); ws.getCell(`A${rowIdx}`).value = d; ws.getCell(`A${rowIdx}`).font = { size: 9 }; rowIdx++;
  }

  [12,10,14,14,14,14,14,10].forEach((w,i) => { ws.getColumn(i+1).width = w; });
}

function buildLedgerSheet(wb, sheetRecords, custMap, typeLabel, accName, itemName, orgName, acctName, sheetName) {
  const ws = wb.addWorksheet(sheetName);

  ws.mergeCells("A1:O1");
  ws.getCell("A1").value = "정 치 자 금  수 입 ·지 출 부";
  ws.getCell("A1").font = { bold: true, size: 16 };
  ws.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };

  ws.mergeCells("N2:O2");
  ws.getCell("N2").value = "(금액단위 : 원)";
  ws.getCell("N2").alignment = { horizontal: "right" };
  ws.getCell("N2").font = { size: 9 };

  ws.mergeCells("A3:O3");
  ws.getCell("A3").value = `[계정(과 목)명: ${accName} (${itemName}) ]`;
  ws.getCell("A3").font = { bold: true, size: 11 };

  // Headers
  ws.mergeCells("A5:A6"); ws.getRow(5).getCell(1).value = "년월일";
  ws.mergeCells("B5:B6"); ws.getRow(5).getCell(2).value = "내 역";
  ws.mergeCells("C5:D5"); ws.getRow(5).getCell(3).value = "수 입 액";
  ws.getRow(6).getCell(3).value = "금회"; ws.getRow(6).getCell(4).value = "누계";
  ws.mergeCells("E5:F5"); ws.getRow(5).getCell(5).value = "지 출 액";
  ws.getRow(6).getCell(5).value = "금회"; ws.getRow(6).getCell(6).value = "누계";
  ws.mergeCells("G5:G6"); ws.getRow(5).getCell(7).value = "잔 액";
  ws.mergeCells("H5:M5"); ws.getRow(5).getCell(8).value = "수입을 제공한 자 또는 지출을 받은 자";
  ws.getRow(6).getCell(8).value = "성 명\n(법인·단체명)";
  ws.getRow(6).getCell(9).value = "생년월일\n(사업자번호)";
  ws.getRow(6).getCell(10).value = "주소 또는\n사무소소재지";
  ws.getRow(6).getCell(11).value = "직업\n(업종)";
  ws.getRow(6).getCell(12).value = "전화번호";
  ws.mergeCells("N5:N6"); ws.getRow(5).getCell(14).value = "영수증\n일련번호";
  ws.mergeCells("O5:O6"); ws.getRow(5).getCell(15).value = "비 고";
  applyHeaderStyle(ws, 5, 6, 1, 15);

  const widths = [10, 18, 12, 12, 12, 12, 12, 12, 12, 20, 8, 14, 2, 10, 8];
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  let incCum = 0, expCum = 0, rowIdx = 7;
  for (const r of sheetRecords) {
    const cust = custMap.get(r.cust_id);
    const isIncome = r.incm_sec_cd === 1;
    if (isIncome) incCum += r.acc_amt; else expCum += r.acc_amt;

    const row = ws.getRow(rowIdx);
    row.getCell(1).value = formatDate(r.acc_date);
    row.getCell(2).value = r.content;
    row.getCell(3).value = isIncome ? r.acc_amt : "";
    row.getCell(4).value = incCum;
    row.getCell(5).value = !isIncome ? r.acc_amt : "";
    row.getCell(6).value = expCum;
    row.getCell(7).value = incCum - expCum;
    row.getCell(8).value = cust?.name || "";
    row.getCell(9).value = cust?.reg_num || "";
    row.getCell(10).value = cust?.addr || "";
    row.getCell(11).value = cust?.job || "";
    row.getCell(12).value = cust?.tel || "";
    row.getCell(14).value = r.rcp_no || "";
    row.getCell(15).value = r.bigo || "";
    applyDataCellStyle(ws, rowIdx, 1, 15, [3, 4, 5, 6, 7]);
    rowIdx++;
  }

  rowIdx++;
  ws.mergeCells(`A${rowIdx}:O${rowIdx}`);
  ws.getCell(`A${rowIdx}`).value = `작성연월일 : ${todayStr()}`;
  ws.getCell(`A${rowIdx}`).alignment = { horizontal: "right" };
  rowIdx++;
  ws.mergeCells(`A${rowIdx}:O${rowIdx}`);
  ws.getCell(`A${rowIdx}`).value = `${orgName}   회계책임자  ${acctName || ""}  (인)`;
  ws.getCell(`A${rowIdx}`).alignment = { horizontal: "center" };
}

// ─── Main ───────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.length === 0) {
    console.log(`
generate-and-compare.mjs — Supabase 데이터로 엑셀 생성 후 레거시와 비교

사용법:
  node scripts/generate-and-compare.mjs --org-id <id> [options]

옵션:
  --org-id <id>        사용기관 ID (필수)
  --legacy-dir <path>  레거시 엑셀 디렉토리 (기본: ../중앙선거관리위원회_정치자금회계관리2/Excel)
  --output <path>      생성된 엑셀 저장 경로 (기본: /tmp/webapp-report.xlsx)
  --compare-output     비교 결과 JSON 경로 (기본: compare-result.json)
  --date-from YYYYMMDD 시작일 (기본: 전체)
  --date-to YYYYMMDD   종료일 (기본: 전체)
  --help               이 도움말 표시
`);
    process.exit(0);
  }

  // Parse args
  let orgId = null, legacyDir = null, outputPath = "/tmp/webapp-report.xlsx";
  let compareOutput = "compare-result.json", dateFrom = null, dateTo = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--org-id") orgId = Number(args[++i]);
    else if (args[i] === "--legacy-dir") legacyDir = args[++i];
    else if (args[i] === "--output") outputPath = args[++i];
    else if (args[i] === "--compare-output") compareOutput = args[++i];
    else if (args[i] === "--date-from") dateFrom = args[++i];
    else if (args[i] === "--date-to") dateTo = args[++i];
  }

  if (!orgId) { console.error("Error: --org-id required"); process.exit(1); }

  // Default legacy dir
  if (!legacyDir) {
    legacyDir = resolve(process.cwd(), "..", "중앙선거관리위원회_정치자금회계관리2", "Excel");
  }

  console.log(`\n📊 Generating Excel report for org_id=${orgId}...`);

  // ─── Fetch data from Supabase ───

  // 1. Organ info
  const { data: organ, error: organErr } = await supabase
    .from("organ").select("*").eq("org_id", orgId).single();
  if (organErr || !organ) {
    console.error(`Error: org_id=${orgId} not found.`, organErr?.message);
    process.exit(1);
  }
  console.log(`  기관: ${organ.org_name} (org_sec_cd: ${organ.org_sec_cd})`);

  // 2. Code values (for getName)
  const { data: codeValues } = await supabase.from("codevalue").select("cv_id, cv_name");
  const codeMap = new Map();
  for (const cv of codeValues || []) codeMap.set(cv.cv_id, cv.cv_name);
  const getName = (id) => codeMap.get(id) || `코드${id}`;

  // 3. Acc book records
  let query = supabase.from("acc_book").select("*").eq("org_id", orgId);
  if (dateFrom) query = query.gte("acc_date", dateFrom);
  if (dateTo) query = query.lte("acc_date", dateTo);
  const { data: records } = await query.order("acc_date").order("acc_sort_num");
  console.log(`  회계 레코드: ${(records || []).length}건`);

  if (!records || records.length === 0) {
    console.log("  ⚠️  데이터 없음. 빈 엑셀을 생성합니다.");
  }

  // 4. Customers
  const { data: customers } = await supabase.from("customer").select("*");
  const custMap = new Map();
  for (const c of customers || []) custMap.set(c.cust_id, c);

  // ─── Generate Excel ───

  const wb = new ExcelJS.Workbook();
  const orgName = organ.org_name || "";
  const acctName = organ.acct_name || "";
  const accFrom = dateFrom || organ.acc_from || "";
  const accTo = dateTo || organ.acc_to || "";

  // Sheet 1: Summary
  buildSummarySheet(wb, records || [], orgName, accFrom, accTo, getName, acctName, "", "");

  // Sheets 2+: Per account/item ledgers
  // Combine income+expense per acc_sec_cd + item_sec_cd (legacy format)
  const comboMap = new Map();
  for (const r of (records || [])) {
    const key = `${r.acc_sec_cd}-${r.item_sec_cd}`;
    if (!comboMap.has(key)) {
      comboMap.set(key, { accSecCd: r.acc_sec_cd, itemSecCd: r.item_sec_cd });
    }
  }

  const combos = Array.from(comboMap.values()).sort(
    (a, b) => a.accSecCd - b.accSecCd || a.itemSecCd - b.itemSecCd
  );

  let sheetNum = 0;
  for (const combo of combos) {
    sheetNum++;
    const accName = getName(combo.accSecCd);
    const itemName = getName(combo.itemSecCd);
    const sheetRecords = (records || []).filter(
      r => r.acc_sec_cd === combo.accSecCd && r.item_sec_cd === combo.itemSecCd
    );
    const ledgerName = `${sheetNum}_${accName}_${itemName}`.slice(0, 31);
    buildLedgerSheet(wb, sheetRecords, custMap, "수 입", accName, itemName, orgName, acctName, ledgerName);
  }

  // Save
  const buffer = await wb.xlsx.writeBuffer();
  writeFileSync(resolve(outputPath), Buffer.from(buffer));
  console.log(`\n  ✅ Excel saved: ${resolve(outputPath)}`);
  console.log(`  총 시트: ${wb.worksheets.length} (총괄표 1 + 수입지출부 ${combos.length}개)`);

  // ─── Compare with legacy ───

  if (existsSync(legacyDir)) {
    console.log(`\n📋 Comparing with legacy templates...`);
    console.log(`  Legacy dir: ${legacyDir}`);

    // Run compare-excel.mjs as a child process
    const { execSync } = await import("child_process");
    const compareScript = resolve(process.cwd(), "scripts", "compare-excel.mjs");

    // Compare generated file with the main legacy template
    const legacyFile = join(legacyDir, "정치자금 수입지출보고서.xls");
    if (existsSync(legacyFile)) {
      try {
        const result = execSync(
          `node "${compareScript}" "${legacyFile}" "${resolve(outputPath)}" --output "${resolve(compareOutput)}"`,
          { encoding: "utf-8", timeout: 30000 }
        );
        console.log(result);
      } catch (e) {
        // Exit code 1 means FAIL (mismatches found), which is expected
        console.log(e.stdout || "");
        console.log(e.stderr || "");
      }
    } else {
      console.log(`  ⚠️  Legacy template not found: ${legacyFile}`);
    }
  } else {
    console.log(`\n  ⚠️  Legacy dir not found: ${legacyDir}`);
    console.log(`  Run compare separately: node scripts/compare-excel.mjs <legacy.xls> ${outputPath}`);
  }

  console.log("\nDone.");
}

main().catch(err => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
