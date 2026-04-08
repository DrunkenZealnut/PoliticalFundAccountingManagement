#!/usr/bin/env node
/**
 * compare-excel.mjs — 레거시 .xls와 웹앱 .xlsx의 셀 단위 비교 스크립트
 *
 * 사용법:
 *   node scripts/compare-excel.mjs <legacy.xls> <webapp.xlsx> [--output result.json]
 *   node scripts/compare-excel.mjs --dir <legacy-dir> <webapp-dir> [--output result.json]
 *   node scripts/compare-excel.mjs --help
 *
 * 비교 기준:
 *   (A) 셀 값 동일성 — 필수. 데이터 셀 불일치 0건이 목표.
 *   (B) 구조적 동일성 — 필수. 행/열 레이아웃, 셀 병합.
 *   (C) 서식 충실도 — 권장. 글꼴, 테두리, 숫자 포맷.
 *
 * 출력: JSON 파일 + 터미널 요약
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { resolve, basename, extname, join } from "path";

// SheetJS for .xls reading, also handles .xlsx
import XLSX from "xlsx";

// ─── Helpers ────────────────────────────────────────────

function normalizeValue(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed === "") return null;
    // Try parsing as number if it looks numeric
    const num = Number(trimmed);
    if (!isNaN(num) && trimmed !== "") return num;
    return trimmed;
  }
  if (typeof val === "number") {
    // Round to avoid floating point noise
    return Math.round(val * 100) / 100;
  }
  if (typeof val === "boolean") return val ? 1 : 0;
  return val;
}

function normalizeDate(val) {
  if (typeof val === "number" && val > 30000 && val < 60000) {
    // Excel serial date → YYYYMMDD
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return `${d.y}${String(d.m).padStart(2, "0")}${String(d.d).padStart(2, "0")}`;
  }
  if (typeof val === "string") {
    // Normalize date formats: YYYY/MM/DD, YYYY-MM-DD, YYYYMMDD → YYYYMMDD
    const cleaned = val.replace(/[\/\-\.]/g, "");
    if (/^\d{8}$/.test(cleaned)) return cleaned;
  }
  return val;
}

function cellsEqual(a, b) {
  const na = normalizeValue(a);
  const nb = normalizeValue(b);

  if (na === null && nb === null) return true;
  if (na === null || nb === null) return false;

  // Date normalization
  const da = normalizeDate(na);
  const db = normalizeDate(nb);
  if (da !== na || db !== nb) {
    return da === db;
  }

  // Number comparison with tolerance
  if (typeof na === "number" && typeof nb === "number") {
    return Math.abs(na - nb) < 0.01;
  }

  // String comparison (case-sensitive, whitespace-normalized)
  if (typeof na === "string" && typeof nb === "string") {
    return na.replace(/\s+/g, " ") === nb.replace(/\s+/g, " ");
  }

  return na === nb;
}

function encodeCell(r, c) {
  return XLSX.utils.encode_cell({ r, c });
}

function encodeMerge(m) {
  return XLSX.utils.encode_range(m);
}

// ─── Sheet Comparison ───────────────────────────────────

function compareSheets(legacyWS, webappWS, sheetName) {
  const result = {
    sheet: sheetName,
    cellValueMismatches: [],
    structureMismatches: [],
    formattingDiffs: [],
    stats: { totalCells: 0, matchedCells: 0, mismatchedCells: 0 },
  };

  // Get ranges
  const legacyRef = legacyWS["!ref"];
  const webappRef = webappWS["!ref"];

  if (!legacyRef && !webappRef) {
    result.stats.note = "Both sheets empty";
    return result;
  }
  if (!legacyRef || !webappRef) {
    result.structureMismatches.push({
      type: "range",
      detail: `Legacy: ${legacyRef || "empty"}, Webapp: ${webappRef || "empty"}`,
    });
    return result;
  }

  const lr = XLSX.utils.decode_range(legacyRef);
  const wr = XLSX.utils.decode_range(webappRef);

  // Dimension check
  const legacyRows = lr.e.r + 1;
  const legacyCols = lr.e.c + 1;
  const webappRows = wr.e.r + 1;
  const webappCols = wr.e.c + 1;

  if (legacyRows !== webappRows || legacyCols !== webappCols) {
    result.structureMismatches.push({
      type: "dimensions",
      legacy: `${legacyRows}x${legacyCols}`,
      webapp: `${webappRows}x${webappCols}`,
    });
  }

  // Compare cells over the union of both ranges
  const maxRow = Math.max(lr.e.r, wr.e.r);
  const maxCol = Math.max(lr.e.c, wr.e.c);

  for (let r = 0; r <= maxRow; r++) {
    for (let c = 0; c <= maxCol; c++) {
      const addr = encodeCell(r, c);
      const lCell = legacyWS[addr];
      const wCell = webappWS[addr];
      const lVal = lCell ? lCell.v : null;
      const wVal = wCell ? wCell.v : null;

      result.stats.totalCells++;

      if (cellsEqual(lVal, wVal)) {
        result.stats.matchedCells++;
      } else {
        result.stats.mismatchedCells++;
        result.cellValueMismatches.push({
          cell: addr,
          row: r,
          col: c,
          legacy: lVal,
          legacyType: lCell ? lCell.t : "empty",
          webapp: wVal,
          webappType: wCell ? wCell.t : "empty",
        });
      }
    }
  }

  // Compare merges
  const legacyMerges = (legacyWS["!merges"] || []).map(encodeMerge).sort();
  const webappMerges = (webappWS["!merges"] || []).map(encodeMerge).sort();

  const mergesOnlyInLegacy = legacyMerges.filter((m) => !webappMerges.includes(m));
  const mergesOnlyInWebapp = webappMerges.filter((m) => !legacyMerges.includes(m));

  if (mergesOnlyInLegacy.length > 0) {
    result.structureMismatches.push({
      type: "merges_only_in_legacy",
      count: mergesOnlyInLegacy.length,
      ranges: mergesOnlyInLegacy.slice(0, 20),
    });
  }
  if (mergesOnlyInWebapp.length > 0) {
    result.structureMismatches.push({
      type: "merges_only_in_webapp",
      count: mergesOnlyInWebapp.length,
      ranges: mergesOnlyInWebapp.slice(0, 20),
    });
  }

  // Compare column widths (formatting)
  const legacyCols_ = legacyWS["!cols"] || [];
  const webappCols_ = webappWS["!cols"] || [];
  const maxColLen = Math.max(legacyCols_.length, webappCols_.length);
  for (let i = 0; i < maxColLen; i++) {
    const lw = legacyCols_[i]?.wch || legacyCols_[i]?.wpx;
    const ww = webappCols_[i]?.wch || webappCols_[i]?.wpx;
    if (lw && ww && Math.abs(lw - ww) > 2) {
      result.formattingDiffs.push({
        type: "column_width",
        col: i,
        legacy: lw,
        webapp: ww,
      });
    }
  }

  return result;
}

// ─── Workbook Comparison ────────────────────────────────

function compareWorkbooks(legacyPath, webappPath) {
  let legacyWB, webappWB;

  try {
    legacyWB = XLSX.readFile(legacyPath);
  } catch (e) {
    return { error: `Failed to read legacy file: ${legacyPath}\n${e.message}` };
  }

  try {
    webappWB = XLSX.readFile(webappPath);
  } catch (e) {
    return { error: `Failed to read webapp file: ${webappPath}\n${e.message}` };
  }

  const result = {
    legacyFile: basename(legacyPath),
    webappFile: basename(webappPath),
    timestamp: new Date().toISOString(),
    sheetComparison: [],
    summary: {
      totalDataCellMismatches: 0,
      totalStructureMismatches: 0,
      totalFormattingDiffs: 0,
      sheetsCompared: 0,
      sheetsOnlyInLegacy: [],
      sheetsOnlyInWebapp: [],
    },
  };

  // Filter out empty sheets from legacy (Sheet2, Sheet3 are always empty)
  const legacySheets = legacyWB.SheetNames.filter((name) => {
    const ws = legacyWB.Sheets[name];
    return ws["!ref"] != null;
  });
  const webappSheets = webappWB.SheetNames.filter((name) => {
    const ws = webappWB.Sheets[name];
    return ws["!ref"] != null;
  });

  // Match sheets by index (legacy templates often use generic names like Sheet1)
  const pairs = [];
  const maxSheets = Math.max(legacySheets.length, webappSheets.length);

  for (let i = 0; i < maxSheets; i++) {
    const lName = legacySheets[i];
    const wName = webappSheets[i];

    if (lName && wName) {
      pairs.push({ legacySheet: lName, webappSheet: wName });
    } else if (lName) {
      result.summary.sheetsOnlyInLegacy.push(lName);
    } else if (wName) {
      result.summary.sheetsOnlyInWebapp.push(wName);
    }
  }

  // Also try name-based matching for unmatched sheets
  for (const lName of result.summary.sheetsOnlyInLegacy.slice()) {
    const match = webappSheets.find(
      (wName) =>
        wName === lName ||
        wName.includes(lName) ||
        lName.includes(wName)
    );
    if (match && !pairs.some((p) => p.webappSheet === match)) {
      pairs.push({ legacySheet: lName, webappSheet: match });
      result.summary.sheetsOnlyInLegacy = result.summary.sheetsOnlyInLegacy.filter((n) => n !== lName);
      result.summary.sheetsOnlyInWebapp = result.summary.sheetsOnlyInWebapp.filter((n) => n !== match);
    }
  }

  for (const pair of pairs) {
    const lWS = legacyWB.Sheets[pair.legacySheet];
    const wWS = webappWB.Sheets[pair.webappSheet];
    const sheetResult = compareSheets(lWS, wWS, `${pair.legacySheet} ↔ ${pair.webappSheet}`);
    result.sheetComparison.push(sheetResult);
    result.summary.totalDataCellMismatches += sheetResult.stats.mismatchedCells;
    result.summary.totalStructureMismatches += sheetResult.structureMismatches.length;
    result.summary.totalFormattingDiffs += sheetResult.formattingDiffs.length;
    result.summary.sheetsCompared++;
  }

  // Verdict
  result.summary.verdict =
    result.summary.totalDataCellMismatches === 0 && result.summary.totalStructureMismatches === 0
      ? "PASS"
      : "FAIL";

  return result;
}

// ─── Directory Mode ─────────────────────────────────────

function compareDirectories(legacyDir, webappDir) {
  const legacyFiles = readdirSync(legacyDir)
    .filter((f) => /\.(xls|xlsx)$/i.test(f))
    .sort();
  const webappFiles = readdirSync(webappDir)
    .filter((f) => /\.(xls|xlsx)$/i.test(f))
    .sort();

  const results = {
    timestamp: new Date().toISOString(),
    legacyDir,
    webappDir,
    files: [],
    overallSummary: {
      filesCompared: 0,
      totalDataCellMismatches: 0,
      totalStructureMismatches: 0,
      filesMatched: 0,
      filesFailed: 0,
      unmatchedLegacy: [],
      unmatchedWebapp: [],
    },
  };

  // Match files by name similarity
  const paired = [];
  const usedWebapp = new Set();

  for (const lf of legacyFiles) {
    const lBase = basename(lf, extname(lf)).replace(/\s+/g, "");
    let bestMatch = null;
    let bestScore = 0;

    for (const wf of webappFiles) {
      if (usedWebapp.has(wf)) continue;
      const wBase = basename(wf, extname(wf)).replace(/\s+/g, "");

      // Simple similarity: shared characters ratio
      let shared = 0;
      for (const ch of lBase) {
        if (wBase.includes(ch)) shared++;
      }
      const score = shared / Math.max(lBase.length, wBase.length);
      if (score > bestScore && score > 0.5) {
        bestScore = score;
        bestMatch = wf;
      }
    }

    if (bestMatch) {
      paired.push({ legacy: lf, webapp: bestMatch, score: bestScore });
      usedWebapp.add(bestMatch);
    } else {
      results.overallSummary.unmatchedLegacy.push(lf);
    }
  }

  for (const wf of webappFiles) {
    if (!usedWebapp.has(wf)) {
      results.overallSummary.unmatchedWebapp.push(wf);
    }
  }

  for (const pair of paired) {
    const fileResult = compareWorkbooks(
      join(legacyDir, pair.legacy),
      join(webappDir, pair.webapp)
    );
    results.files.push(fileResult);
    results.overallSummary.filesCompared++;

    if (fileResult.error) {
      results.overallSummary.filesFailed++;
    } else {
      results.overallSummary.totalDataCellMismatches += fileResult.summary.totalDataCellMismatches;
      results.overallSummary.totalStructureMismatches += fileResult.summary.totalStructureMismatches;
      if (fileResult.summary.verdict === "PASS") {
        results.overallSummary.filesMatched++;
      } else {
        results.overallSummary.filesFailed++;
      }
    }
  }

  results.overallSummary.verdict =
    results.overallSummary.totalDataCellMismatches === 0 ? "PASS" : "FAIL";

  return results;
}

// ─── Terminal Output ────────────────────────────────────

function printSummary(result) {
  console.log("\n" + "═".repeat(60));
  console.log("  문서 충실도 비교 결과");
  console.log("═".repeat(60));

  if (result.error) {
    console.log(`\n  ❌ ERROR: ${result.error}\n`);
    return;
  }

  // Single file mode
  if (result.sheetComparison) {
    console.log(`  Legacy:  ${result.legacyFile}`);
    console.log(`  Webapp:  ${result.webappFile}`);
    console.log(`  Time:    ${result.timestamp}`);
    console.log("─".repeat(60));

    for (const sheet of result.sheetComparison) {
      const icon = sheet.stats.mismatchedCells === 0 ? "✅" : "❌";
      console.log(
        `  ${icon} ${sheet.sheet}: ${sheet.stats.matchedCells}/${sheet.stats.totalCells} cells match`
      );

      if (sheet.stats.mismatchedCells > 0) {
        const show = sheet.cellValueMismatches.slice(0, 10);
        for (const m of show) {
          console.log(
            `     ${m.cell}: legacy=${JSON.stringify(m.legacy)} (${m.legacyType}) → webapp=${JSON.stringify(m.webapp)} (${m.webappType})`
          );
        }
        if (sheet.cellValueMismatches.length > 10) {
          console.log(`     ... and ${sheet.cellValueMismatches.length - 10} more`);
        }
      }

      if (sheet.structureMismatches.length > 0) {
        for (const s of sheet.structureMismatches) {
          console.log(`     ⚠️  Structure: ${s.type} — ${s.detail || JSON.stringify(s)}`);
        }
      }
    }

    console.log("─".repeat(60));
    const v = result.summary.verdict === "PASS" ? "✅ PASS" : "❌ FAIL";
    console.log(`  Data cell mismatches: ${result.summary.totalDataCellMismatches}`);
    console.log(`  Structure mismatches: ${result.summary.totalStructureMismatches}`);
    console.log(`  Formatting diffs:     ${result.summary.totalFormattingDiffs}`);
    console.log(`  VERDICT: ${v}`);
  }

  // Directory mode
  if (result.files) {
    console.log(`  Legacy dir:  ${result.legacyDir}`);
    console.log(`  Webapp dir:  ${result.webappDir}`);
    console.log(`  Time:        ${result.timestamp}`);
    console.log("─".repeat(60));

    for (const file of result.files) {
      if (file.error) {
        console.log(`  ❌ ${file.error}`);
        continue;
      }
      const icon = file.summary.verdict === "PASS" ? "✅" : "❌";
      console.log(
        `  ${icon} ${file.legacyFile} ↔ ${file.webappFile}: ${file.summary.totalDataCellMismatches} mismatches`
      );
    }

    if (result.overallSummary.unmatchedLegacy.length > 0) {
      console.log(`\n  ⚠️  Unmatched legacy files:`);
      for (const f of result.overallSummary.unmatchedLegacy) console.log(`     ${f}`);
    }
    if (result.overallSummary.unmatchedWebapp.length > 0) {
      console.log(`\n  ⚠️  Unmatched webapp files:`);
      for (const f of result.overallSummary.unmatchedWebapp) console.log(`     ${f}`);
    }

    console.log("─".repeat(60));
    const v = result.overallSummary.verdict === "PASS" ? "✅ PASS" : "❌ FAIL";
    console.log(`  Files compared:       ${result.overallSummary.filesCompared}`);
    console.log(`  Files matched:        ${result.overallSummary.filesMatched}`);
    console.log(`  Files failed:         ${result.overallSummary.filesFailed}`);
    console.log(`  Total data mismatches: ${result.overallSummary.totalDataCellMismatches}`);
    console.log(`  VERDICT: ${v}`);
  }

  console.log("═".repeat(60) + "\n");
}

// ─── CLI ────────────────────────────────────────────────

function printHelp() {
  console.log(`
compare-excel.mjs — 레거시 .xls와 웹앱 .xlsx 셀 단위 비교

사용법:
  node scripts/compare-excel.mjs <legacy.xls> <webapp.xlsx>
  node scripts/compare-excel.mjs --dir <legacy-dir> <webapp-dir>

옵션:
  --output <path>   결과를 JSON 파일로 저장 (기본: compare-result.json)
  --help            이 도움말 표시

비교 기준:
  (A) 셀 값 동일성 — 데이터 셀 불일치 0건이 목표
  (B) 구조적 동일성 — 행/열, 셀 병합 비교
  (C) 서식 충실도 — 열 너비 등 (참고용)

예시:
  # 단일 파일 비교
  node scripts/compare-excel.mjs legacy-report.xls webapp-report.xlsx

  # 디렉토리 비교 (이름 유사도로 자동 매칭)
  node scripts/compare-excel.mjs --dir ./legacy-excel/ ./webapp-excel/
`);
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.length === 0) {
    printHelp();
    process.exit(0);
  }

  let outputPath = "compare-result.json";
  const outputIdx = args.indexOf("--output");
  if (outputIdx !== -1) {
    outputPath = args[outputIdx + 1];
    args.splice(outputIdx, 2);
  }

  let result;

  if (args[0] === "--dir") {
    if (args.length < 3) {
      console.error("Error: --dir requires <legacy-dir> <webapp-dir>");
      process.exit(1);
    }
    const legacyDir = resolve(args[1]);
    const webappDir = resolve(args[2]);

    try { statSync(legacyDir); } catch { console.error(`Directory not found: ${legacyDir}`); process.exit(1); }
    try { statSync(webappDir); } catch { console.error(`Directory not found: ${webappDir}`); process.exit(1); }

    result = compareDirectories(legacyDir, webappDir);
  } else {
    if (args.length < 2) {
      console.error("Error: requires <legacy-file> <webapp-file>");
      process.exit(1);
    }
    const legacyPath = resolve(args[0]);
    const webappPath = resolve(args[1]);

    try { statSync(legacyPath); } catch { console.error(`File not found: ${legacyPath}`); process.exit(1); }
    try { statSync(webappPath); } catch { console.error(`File not found: ${webappPath}`); process.exit(1); }

    result = compareWorkbooks(legacyPath, webappPath);
  }

  // Save JSON
  writeFileSync(resolve(outputPath), JSON.stringify(result, null, 2), "utf-8");
  console.log(`Result saved to: ${resolve(outputPath)}`);

  // Print terminal summary
  printSummary(result);

  // Exit code: 0 if pass, 1 if fail
  const verdict = result.summary?.verdict || result.overallSummary?.verdict;
  process.exit(verdict === "PASS" ? 0 : 1);
}

main();
