/**
 * SQLite 데이터 미리보기 - 마이그레이션 전 데이터 검증
 *
 * 사용법: node scripts/preview-sqlite-data.mjs <Fund_Master.db> [Fund_Data.db]
 */

import initSqlJs from "sql.js";
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function openDb(filePath) {
  const SQL = await initSqlJs();
  const buffer = readFileSync(filePath);
  return new SQL.Database(buffer);
}

function getTableNames(db) {
  const result = db.exec(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  );
  if (!result.length) return [];
  return result[0].values.map((row) => row[0]);
}

function queryAll(db, tableName) {
  try {
    const stmt = db.prepare(`SELECT * FROM "${tableName}"`);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  } catch (e) {
    console.error(`  ⚠️  ${tableName}: ${e.message}`);
    return [];
  }
}

function getColumns(db, tableName) {
  try {
    const result = db.exec(`PRAGMA table_info("${tableName}")`);
    if (!result.length) return [];
    return result[0].values.map((row) => ({
      name: row[1],
      type: row[2],
      notNull: row[3] === 1,
      pk: row[5] === 1,
    }));
  } catch {
    return [];
  }
}

async function preview(masterPath, dataPath) {
  const allData = {};
  let totalRows = 0;

  // Master DB
  console.log(`\n${"=".repeat(60)}`);
  console.log(`📂 Master DB: ${masterPath}`);
  console.log(`${"=".repeat(60)}`);

  const masterDb = await openDb(masterPath);
  const masterTables = getTableNames(masterDb);
  console.log(`테이블: ${masterTables.join(", ")}\n`);

  for (const table of masterTables) {
    const cols = getColumns(masterDb, table);
    const rows = queryAll(masterDb, table);
    totalRows += rows.length;
    allData[table] = rows;

    console.log(`📊 ${table} (${rows.length}건)`);
    console.log(`   컬럼: ${cols.map((c) => `${c.name}(${c.type}${c.pk ? ",PK" : ""})`).join(", ")}`);

    // Sample data
    if (rows.length > 0) {
      const sample = rows.slice(0, 3);
      for (const row of sample) {
        const preview = Object.entries(row)
          .map(([k, v]) => {
            const val = v === null ? "NULL" : String(v).length > 30 ? String(v).slice(0, 30) + "..." : String(v);
            return `${k}=${val}`;
          })
          .join(", ");
        console.log(`   → ${preview}`);
      }
      if (rows.length > 3) console.log(`   ... 외 ${rows.length - 3}건`);
    }
    console.log("");
  }
  masterDb.close();

  // Data DB
  if (dataPath) {
    console.log(`${"=".repeat(60)}`);
    console.log(`📂 Data DB: ${dataPath}`);
    console.log(`${"=".repeat(60)}`);

    const dataDb = await openDb(dataPath);
    const dataTables = getTableNames(dataDb);
    console.log(`테이블: ${dataTables.join(", ")}\n`);

    for (const table of dataTables) {
      const cols = getColumns(dataDb, table);
      const rows = queryAll(dataDb, table);
      totalRows += rows.length;
      allData[table] = rows;

      console.log(`📊 ${table} (${rows.length}건)`);
      console.log(`   컬럼: ${cols.map((c) => `${c.name}(${c.type}${c.pk ? ",PK" : ""})`).join(", ")}`);

      if (rows.length > 0) {
        const sample = rows.slice(0, 3);
        for (const row of sample) {
          const preview = Object.entries(row)
            .map(([k, v]) => {
              const val = v === null ? "NULL" : String(v).length > 30 ? String(v).slice(0, 30) + "..." : String(v);
              return `${k}=${val}`;
            })
            .join(", ");
          console.log(`   → ${preview}`);
        }
        if (rows.length > 3) console.log(`   ... 외 ${rows.length - 3}건`);
      }
      console.log("");
    }
    dataDb.close();
  }

  // Export to JSON for review
  const outputPath = resolve(__dirname, "migration-preview.json");
  const exportData = {};
  for (const [table, rows] of Object.entries(allData)) {
    exportData[table.toLowerCase()] = {
      count: rows.length,
      sample: rows.slice(0, 5),
    };
  }
  writeFileSync(outputPath, JSON.stringify(exportData, null, 2));

  console.log(`${"=".repeat(60)}`);
  console.log(`📊 총 레코드: ${totalRows}건`);
  console.log(`📄 미리보기 JSON: ${outputPath}`);
  console.log(`${"=".repeat(60)}\n`);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log("사용법: node scripts/preview-sqlite-data.mjs <Fund_Master.db> [Fund_Data.db]");
  process.exit(0);
}

preview(resolve(args[0]), args[1] ? resolve(args[1]) : null).catch(console.error);
