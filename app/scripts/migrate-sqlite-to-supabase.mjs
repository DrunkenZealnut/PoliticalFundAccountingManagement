/**
 * SQLite → Supabase 마이그레이션 스크립트
 *
 * 사용법:
 *   node scripts/migrate-sqlite-to-supabase.mjs <Fund_Master.db> [Fund_Data_1.db]
 *
 * Fund_Master.db: CODESET, CODEVALUE, ACC_REL (필수)
 * Fund_Data_1.db: ORGAN, CUSTOMER, ACC_BOOK, ESTATE 등 (선택 - 실데이터)
 *
 * 환경변수: .env.local에서 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요
 * (SERVICE_ROLE_KEY는 RLS를 우회하므로 마이그레이션에 필요)
 */

import initSqlJs from "sql.js";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  try {
    const envPath = resolve(__dirname, "../.env.local");
    const content = readFileSync(envPath, "utf-8");
    const vars = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [key, ...rest] = trimmed.split("=");
      vars[key.trim()] = rest.join("=").trim();
    }
    return vars;
  } catch {
    return {};
  }
}

// Tables from Fund_Master.db (코드/설정)
const MASTER_TABLES = [
  "CODESET",
  "CODEVALUE",
  "ACC_REL",
  "ACC_REL2",
];

// Tables from Fund_Data_*.db (실데이터)
const DATA_TABLES = [
  "ORGAN",
  "CUSTOMER",
  "CUSTOMER_ADDR",
  "ACC_BOOK",
  "ACC_BOOK_BAK",
  "ACCBOOKSEND",
  "ESTATE",
  "OPINION",
  "COL_ORGAN",
  "SUM_REPT",
  "ALARM",
];

// Tables with IDENTITY columns (must use OVERRIDING SYSTEM VALUE or omit the column)
const IDENTITY_TABLES = new Set([
  "organ", "customer", "acc_book", "acc_book_bak", "estate", "acc_rel",
  "user_organ", "backup_history",
]);

// All IDENTITY PK columns (always strip, build ID mapping for FK tables)
const IDENTITY_PK = {
  organ: "org_id",
  customer: "cust_id",
  acc_book: "acc_book_id",
  acc_book_bak: "bak_id",
  estate: "estate_id",
  acc_rel: "acc_rel_id",
};

// ID mapping: old SQLite ID → new Supabase ID
const idMap = {
  organ: new Map(),    // old org_id → new org_id
  customer: new Map(), // old cust_id → new cust_id
  acc_book: new Map(), // old acc_book_id → new acc_book_id
};

function toSnakeCase(str) {
  return str.toLowerCase();
}

async function openSqliteDb(filePath) {
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
  } catch {
    return [];
  }
}

async function migrateTable(supabase, db, sqliteTable, report) {
  const pgTable = toSnakeCase(sqliteTable);
  const rows = queryAll(db, sqliteTable);

  if (rows.length === 0) {
    console.log(`  ⏭️  ${sqliteTable} → ${pgTable}: 0건 (스킵)`);
    return;
  }

  // Convert column names to snake_case, strip IDENTITY PKs, fix types, remap FKs
  const pkCol = IDENTITY_PK[pgTable] || null;

  // INTEGER columns that SQLite might store as empty string
  const intColumns = new Set(["sido", "cust_order", "org_order", "estate_order",
    "acc_sort_num", "rcp_no2", "exp_type_cd", "cv_order", "cs_id", "qty"]);

  const converted = rows.map((row) => {
    const newRow = {};
    for (const [key, value] of Object.entries(row)) {
      const pgCol = toSnakeCase(key);
      // Skip IDENTITY PKs for tables that have them
      if (pkCol && pgCol === pkCol) continue;
      // Fix empty strings → null for integer columns
      if (intColumns.has(pgCol) && (value === "" || value === undefined)) {
        newRow[pgCol] = null;
      }
      // Fix empty strings → null for nullable text fields
      else if (value === "" && !["name", "content", "cv_name", "org_name", "reg_num", "kind", "remark"].includes(pgCol)) {
        newRow[pgCol] = null;
      }
      else {
        newRow[pgCol] = value;
      }
    }
    return newRow;
  });

  // Remap FK references using idMap
  for (const row of converted) {
    if (row.org_id !== undefined && pgTable !== "organ" && idMap.organ.size > 0) {
      const newId = idMap.organ.get(row.org_id);
      if (newId !== undefined) row.org_id = newId;
    }
    if (row.cust_id !== undefined && pgTable !== "customer" && idMap.customer.size > 0) {
      const newId = idMap.customer.get(row.cust_id);
      if (newId !== undefined) row.cust_id = newId;
    }
    if (row.acc_book_id !== undefined && pgTable !== "acc_book" && idMap.acc_book.size > 0) {
      const newId = idMap.acc_book.get(row.acc_book_id);
      if (newId !== undefined) row.acc_book_id = newId;
    }
  }

  // For tables that need ID mapping, insert one-by-one to capture new IDs
  const needsMapping = pgTable === "organ" || pgTable === "customer" || pgTable === "acc_book";
  const conflictCol =
    pgTable === "codeset" ? "cs_id" :
    pgTable === "codevalue" ? "cv_id" :
    pgTable === "opinion" ? "org_id" :
    pgTable === "customer_addr" ? "cust_id,cust_seq" :
    undefined;

  let inserted = 0;
  let errorCount = 0;

  if (needsMapping) {
    // Insert one-by-one to capture old→new ID mapping
    const originalRows = rows;
    for (let idx = 0; idx < converted.length; idx++) {
      const row = converted[idx];
      const origRow = originalRows[idx];
      const oldPk = origRow[pkCol.toUpperCase()] ?? origRow[pkCol];

      const res = await supabase.from(pgTable).insert(row).select(pkCol).single();
      if (res.error) {
        errorCount++;
        if (errorCount <= 3) console.error(`    ⚠️  ${pgTable} row error: ${res.error.message}`);
      } else {
        inserted++;
        const newPk = res.data[pkCol];
        idMap[pgTable].set(oldPk, newPk);
      }
    }
  } else {
    // Batch insert
    const batchSize = 100;
    for (let i = 0; i < converted.length; i += batchSize) {
      const batch = converted.slice(i, i + batchSize);
      let error;
      if (conflictCol) {
        const res = await supabase.from(pgTable).upsert(batch, { onConflict: conflictCol });
        error = res.error;
      } else {
        const res = await supabase.from(pgTable).insert(batch);
        error = res.error;
      }

      if (error) {
        for (const row of batch) {
          const res = conflictCol
            ? await supabase.from(pgTable).upsert(row, { onConflict: conflictCol })
            : await supabase.from(pgTable).insert(row);
          if (res.error) {
            errorCount++;
            if (errorCount <= 3) console.error(`    ⚠️  ${pgTable} row error: ${res.error.message}`);
          } else {
            inserted++;
          }
        }
      } else {
        inserted += batch.length;
      }
    }
  }

  const status = errorCount === 0 ? "✅" : inserted > 0 ? "⚠️" : "❌";
  console.log(
    `  ${status} ${sqliteTable} → ${pgTable}: ${inserted}/${rows.length}건` +
    (errorCount > 0 ? ` (오류 ${errorCount}건)` : "")
  );

  report.total += rows.length;
  report.success += inserted;
  if (errorCount > 0) {
    report.errors.push({ table: sqliteTable, count: errorCount });
  }
}

async function migrate(masterPath, dataPath) {
  const env = loadEnv();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  let serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    console.error("❌ NEXT_PUBLIC_SUPABASE_URL이 .env.local에 설정되지 않았습니다.");
    process.exit(1);
  }
  if (!serviceKey) {
    const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!anonKey) {
      console.error("❌ SUPABASE_SERVICE_ROLE_KEY 또는 ANON_KEY가 설정되지 않았습니다.");
      process.exit(1);
    }
    console.warn("⚠️  SERVICE_ROLE_KEY 없이 ANON_KEY로 실행합니다.");
    console.warn("   RLS 정책에 의해 일부 테이블 쓰기가 실패할 수 있습니다.");
    console.warn("   정상 마이그레이션을 위해 SERVICE_ROLE_KEY를 설정하세요.\n");
    serviceKey = anonKey;
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const report = { total: 0, success: 0, errors: [] };

  // 1. Master DB 마이그레이션
  console.log(`\n${"=".repeat(50)}`);
  console.log(`📂 Master DB: ${masterPath}`);
  const masterDb = await openSqliteDb(masterPath);
  const masterTableNames = getTableNames(masterDb);
  console.log(`   테이블: ${masterTableNames.join(", ")}`);
  console.log("");

  for (const table of MASTER_TABLES) {
    if (masterTableNames.includes(table)) {
      await migrateTable(supabase, masterDb, table, report);
    } else {
      console.log(`  ⏭️  ${table}: Master DB에 없음 (스킵)`);
    }
  }
  masterDb.close();

  // 2. Data DB 마이그레이션 (선택)
  if (dataPath) {
    console.log(`\n${"=".repeat(50)}`);
    console.log(`📂 Data DB: ${dataPath}`);
    const dataDb = await openSqliteDb(dataPath);
    const dataTableNames = getTableNames(dataDb);
    console.log(`   테이블: ${dataTableNames.join(", ")}`);
    console.log("");

    for (const table of DATA_TABLES) {
      if (dataTableNames.includes(table)) {
        await migrateTable(supabase, dataDb, table, report);
      } else {
        console.log(`  ⏭️  ${table}: Data DB에 없음 (스킵)`);
      }
    }
    dataDb.close();
  }

  // 3. 검증
  console.log(`\n${"=".repeat(50)}`);
  console.log("📊 마이그레이션 결과");
  console.log(`  총 레코드: ${report.total}`);
  console.log(`  성공: ${report.success}`);
  console.log(`  오류: ${report.errors.reduce((s, e) => s + e.count, 0)}건`);

  if (report.errors.length > 0) {
    console.log("\n⚠️  오류 상세:");
    for (const err of report.errors) {
      console.log(`  - ${err.table}: ${err.count}건 실패`);
    }
  }

  // 4. Supabase 레코드 수 검증
  console.log("\n📋 Supabase 레코드 수 확인:");
  const verifyTables = ["codeset", "codevalue", "acc_rel", "organ", "customer", "acc_book", "estate"];
  for (const t of verifyTables) {
    const { count } = await supabase.from(t).select("*", { count: "exact", head: true });
    console.log(`  ${t}: ${count ?? 0}건`);
  }

  console.log(`${"=".repeat(50)}\n`);
}

// 실행
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log(`
사용법: node scripts/migrate-sqlite-to-supabase.mjs <Fund_Master.db> [Fund_Data.db]

예시:
  # Master(코드) + Data(실데이터) 함께 마이그레이션
  node scripts/migrate-sqlite-to-supabase.mjs \\
    ../중앙선거관리위원회_정치자금회계관리2/Data/Fund_Master.db \\
    ../중앙선거관리위원회_정치자금회계관리2/Data/Fund_Data_1.db

  # Master(코드)만 마이그레이션
  node scripts/migrate-sqlite-to-supabase.mjs \\
    ../중앙선거관리위원회_정치자금회계관리2/Data/Fund_Master.db

환경변수 (.env.local):
  NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=eyJ...  (서비스 역할 키)
`);
  process.exit(0);
}

const masterPath = resolve(args[0]);
const dataPath = args[1] ? resolve(args[1]) : null;

migrate(masterPath, dataPath).catch((err) => {
  console.error("❌ 마이그레이션 실패:", err.message);
  process.exit(1);
});
