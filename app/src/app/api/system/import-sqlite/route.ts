import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import initSqlJs from "sql.js";
import path from "path";
import { readFileSync } from "fs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Reverse mapping: SQLite UPPER_CASE → PostgreSQL snake_case
const REVERSE_COL_MAP: Record<string, string> = {
  ORG_ID: "org_id", ORG_SEC_CD: "org_sec_cd", ORG_NAME: "org_name",
  REG_NUM: "reg_num", REG_DATE: "reg_date", POST: "post", ADDR: "addr",
  ADDR_DETAIL: "addr_detail", TEL: "tel", FAX: "fax", REP_NAME: "rep_name",
  ACCT_NAME: "acct_name", COMM: "comm", USERID: "userid", PASSWD: "passwd",
  HINT1: "hint1", HINT2: "hint2", ORG_ORDER: "org_order",
  PRE_ACC_FROM: "pre_acc_from", PRE_ACC_TO: "pre_acc_to",
  ACC_FROM: "acc_from", ACC_TO: "acc_to", CODE_DATE: "code_date",
  CUST_ID: "cust_id", CUST_SEC_CD: "cust_sec_cd", NAME: "name",
  JOB: "job", SIDO: "sido", BIGO: "bigo", CUST_ORDER: "cust_order",
  CUST_SEQ: "cust_seq",
  ACC_BOOK_ID: "acc_book_id", INCM_SEC_CD: "incm_sec_cd",
  ACC_SEC_CD: "acc_sec_cd", ITEM_SEC_CD: "item_sec_cd",
  EXP_SEC_CD: "exp_sec_cd", ACC_DATE: "acc_date", CONTENT: "content",
  ACC_AMT: "acc_amt", RCP_YN: "rcp_yn", RCP_NO: "rcp_no",
  RCP_NO2: "rcp_no2", ACC_SORT_NUM: "acc_sort_num",
  ACC_INS_TYPE: "acc_ins_type", ACC_PRINT_OK: "acc_print_ok",
  BIGO2: "bigo2", RETURN_YN: "return_yn", EXP_TYPE_CD: "exp_type_cd",
  EXP_GROUP1_CD: "exp_group1_cd", EXP_GROUP2_CD: "exp_group2_cd",
  EXP_GROUP3_CD: "exp_group3_cd",
  BAK_ID: "bak_id", WORK_KIND: "work_kind",
  SEND_DATE: "send_date",
  ESTATE_ID: "estate_id", ESTATE_SEC_CD: "estate_sec_cd",
  KIND: "kind", QTY: "qty", AMT: "amt", REMARK: "remark",
  ESTATE_ORDER: "estate_order",
  AUDIT_FROM: "audit_from", AUDIT_TO: "audit_to", OPINION: "opinion",
  PRINT_01: "print_01", POSITION: "position",
  JUDGE_FROM: "judge_from", JUDGE_TO: "judge_to",
  INCM_FROM: "incm_from", INCM_TO: "incm_to",
  ESTATE_AMT: "estate_amt", IN_AMT: "in_amt", CM_AMT: "cm_amt",
  BALANCE_AMT: "balance_amt", PRINT_02: "print_02",
  COMM_DESC: "comm_desc", COMM_NAME01: "comm_name01",
  COMM_NAME02: "comm_name02", COMM_NAME03: "comm_name03",
  COMM_NAME04: "comm_name04", COMM_NAME05: "comm_name05",
  ACC_TITLE: "acc_title", ACC_DOCY: "acc_docy",
  ACC_DOCNUM: "acc_docnum", ACC_FDATE: "acc_fdate",
  ACC_COMM: "acc_comm", ACC_TORGNM: "acc_torgnm",
  ACC_BORGNM: "acc_borgnm", ACC_REPNM: "acc_repnm",
  CS_ID: "cs_id", CS_NAME: "cs_name", CS_ACTIVEFLAG: "cs_activeflag",
  CS_COMMENT: "cs_comment",
  CV_ID: "cv_id", CV_NAME: "cv_name", CV_ORDER: "cv_order",
  CV_COMMENT: "cv_comment", CV_ETC: "cv_etc", CV_ETC2: "cv_etc2",
  CV_ETC3: "cv_etc3", CV_ETC4: "cv_etc4", CV_ETC5: "cv_etc5",
  CV_ETC6: "cv_etc6", CV_ETC7: "cv_etc7", CV_ETC8: "cv_etc8",
  CV_ETC9: "cv_etc9", CV_ETC10: "cv_etc10",
  ACC_REL_ID: "acc_rel_id", INPUT_YN: "input_yn", ACC_ORDER: "acc_order",
  SUM_REPT_ID: "sum_rept_id",
  COL_01: "col_01", COL_02: "col_02", COL_03: "col_03",
  COL_04: "col_04", COL_05: "col_05", COL_06: "col_06",
  COL_07: "col_07", COL_08: "col_08", COL_09: "col_09",
  COL_10: "col_10", COL_11: "col_11", COL_12: "col_12",
  COL_13: "col_13", COL_14: "col_14", COL_15: "col_15",
  COL_16: "col_16", COL_17: "col_17", COL_18: "col_18",
  COL_19: "col_19", COL_20: "col_20", COL_21: "col_21",
  COL_22: "col_22", COL_23: "col_23", COL_24: "col_24",
  COL_25: "col_25", COL_26: "col_26", COL_27: "col_27",
  COL_28: "col_28", COL_29: "col_29", COL_30: "col_30",
  COL_31: "col_31", COL_32: "col_32", COL_33: "col_33",
  STATUS: "status", YEAR: "year", TYPE: "type", CHK_YN: "chk_yn",
};

function toLower(col: string): string {
  return REVERSE_COL_MAP[col] || col.toLowerCase();
}

// Columns that are INTEGER/NUMERIC in PostgreSQL — empty strings must become null
const INTEGER_COLS = new Set([
  "org_id", "org_sec_cd", "org_order", "cust_id", "cust_sec_cd", "sido",
  "cust_order", "cust_seq", "acc_book_id", "incm_sec_cd", "acc_sec_cd",
  "item_sec_cd", "exp_sec_cd", "acc_amt", "rcp_no2", "acc_sort_num",
  "exp_type_cd", "bak_id", "work_kind", "estate_id", "estate_sec_cd",
  "qty", "amt", "estate_order", "estate_amt", "in_amt", "cm_amt",
  "balance_amt", "cs_id", "cv_id", "cv_order", "acc_rel_id", "acc_order",
  "sum_rept_id", "org_sec_cd", "type",
  "col_01", "col_02", "col_03", "col_04", "col_05", "col_06",
  "col_07", "col_08", "col_09", "col_10", "col_11", "col_12",
  "col_13", "col_14", "col_15", "col_16", "col_17", "col_18",
  "col_19", "col_20", "col_21", "col_22", "col_23", "col_24",
  "col_25", "col_26", "col_27", "col_28", "col_29", "col_30",
  "col_31", "col_32", "col_33",
]);

// Columns that are NOT NULL text in PostgreSQL — keep empty strings as ""
const NOT_NULL_TEXT_COLS = new Set([
  "org_name", "reg_num", "cv_name", "kind", "content", "remark",
  "input_yn", "rcp_yn", "acc_date", "name",
]);

/**
 * Sanitize a value: empty strings → null for integer columns,
 * but preserve "" for NOT NULL text columns.
 */
function sanitize(col: string, val: unknown): unknown {
  if (val === "" && INTEGER_COLS.has(col)) return null;
  if (val === "" && NOT_NULL_TEXT_COLS.has(col)) return ""; // keep for NOT NULL text
  if (val === "") return null;
  return val;
}

/**
 * Read all rows from a SQLite table, converting column names to snake_case.
 * Optionally strip columns listed in `stripCols`.
 */
function readSqliteTable(
  dbInstance: InstanceType<Awaited<ReturnType<typeof initSqlJs>>["Database"]>,
  tableName: string,
  stripCols: string[] = []
): Record<string, unknown>[] {
  try {
    const results = dbInstance.exec(`SELECT * FROM ${tableName}`);
    if (!results || results.length === 0) return [];

    const { columns, values } = results[0];
    const stripSet = new Set(stripCols);
    return values.map((row) => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col, i) => {
        const pgCol = toLower(col);
        if (!stripSet.has(pgCol)) {
          obj[pgCol] = sanitize(pgCol, row[i]);
        }
      });
      return obj;
    });
  } catch {
    return [];
  }
}

/**
 * Insert rows in chunks via Supabase, counting successes/failures.
 */
async function bulkInsert(
  table: string,
  rows: Record<string, unknown>[]
): Promise<{ imported: number; skipped: number }> {
  if (rows.length === 0) return { imported: 0, skipped: 0 };

  let imported = 0;
  let skipped = 0;
  const CHUNK = 100;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from(table).insert(chunk);

    if (error) {
      // Batch failed — try one-by-one for partial success
      for (const row of chunk) {
        const { error: rowErr } = await supabase.from(table).insert(row);
        if (rowErr) skipped++;
        else imported++;
      }
    } else {
      imported += chunk.length;
    }
  }

  return { imported, skipped };
}

/**
 * Upsert rows (for tables with natural PKs that aren't GENERATED ALWAYS).
 */
async function bulkUpsert(
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string
): Promise<{ imported: number; skipped: number }> {
  if (rows.length === 0) return { imported: 0, skipped: 0 };

  let imported = 0;
  let skipped = 0;
  const CHUNK = 100;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict });

    if (error) {
      for (const row of chunk) {
        const { error: rowErr } = await supabase.from(table).upsert(row, { onConflict });
        if (rowErr) skipped++;
        else imported++;
      }
    } else {
      imported += chunk.length;
    }
  }

  return { imported, skipped };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const orgId = formData.get("orgId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }

    if (!file.name.endsWith(".db")) {
      return NextResponse.json({ error: ".db 파일만 업로드 가능합니다" }, { status: 400 });
    }

    if (!orgId) {
      return NextResponse.json({ error: "orgId required" }, { status: 400 });
    }

    const numOrgId = Number(orgId);

    const buffer = await file.arrayBuffer();
    const wasmPath = path.join(process.cwd(), "node_modules", "sql.js", "dist", "sql-wasm.wasm");
    const wasmBinary = readFileSync(wasmPath);
    const SQL = await initSqlJs({ wasmBinary });
    const db = new SQL.Database(new Uint8Array(buffer));

    // Verify valid SQLite file
    const tablesResult = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
    if (!tablesResult || tablesResult.length === 0) {
      db.close();
      return NextResponse.json({ error: "유효한 데이터가 없는 .db 파일입니다" }, { status: 400 });
    }
    const existingTables = new Set(tablesResult[0].values.map((r) => String(r[0])));

    const report: Record<string, { imported: number; skipped: number; error?: string }> = {};
    let totalImported = 0;

    // ──────────────────────────────────────────────────────
    // STEP 1: Delete existing org-specific data (FK order)
    // ──────────────────────────────────────────────────────
    await supabase.from("accbooksend").delete().gt("acc_book_id", 0); // delete all
    await supabase.from("acc_book_bak").delete().eq("org_id", numOrgId);
    await supabase.from("acc_book").delete().eq("org_id", numOrgId);
    await supabase.from("estate").delete().eq("org_id", numOrgId);
    await supabase.from("opinion").delete().eq("org_id", numOrgId);
    // customer_addr → customer (FK order)
    await supabase.from("customer_addr").delete().gt("cust_id", 0);
    await supabase.from("customer").delete().gt("cust_id", 0);
    // organ — delete only this org
    await supabase.from("organ").delete().eq("org_id", numOrgId);

    // ──────────────────────────────────────────────────────
    // STEP 2: Shared reference tables (upsert with natural PK)
    // These have non-identity PKs (cs_id, cv_id, etc.)
    // ──────────────────────────────────────────────────────

    // CODESET
    if (existingTables.has("CODESET")) {
      const rows = readSqliteTable(db, "CODESET");
      const r = await bulkUpsert("codeset", rows, "cs_id");
      report.CODESET = r;
      totalImported += r.imported;
    }

    // CODEVALUE
    if (existingTables.has("CODEVALUE")) {
      const rows = readSqliteTable(db, "CODEVALUE");
      const r = await bulkUpsert("codevalue", rows, "cv_id");
      report.CODEVALUE = r;
      totalImported += r.imported;
    }

    // ACC_REL — has GENERATED ALWAYS identity, strip it and insert fresh
    if (existingTables.has("ACC_REL")) {
      // Delete all existing first (shared reference data)
      await supabase.from("acc_rel").delete().gt("acc_rel_id", 0);
      const rows = readSqliteTable(db, "ACC_REL", ["acc_rel_id"]);
      const r = await bulkInsert("acc_rel", rows);
      report.ACC_REL = r;
      totalImported += r.imported;
    }

    // ──────────────────────────────────────────────────────
    // STEP 3: ORGAN — update existing org with data from SQLite
    // We don't create a new org; instead update the target org (numOrgId)
    // ──────────────────────────────────────────────────────
    if (existingTables.has("ORGAN")) {
      const rows = readSqliteTable(db, "ORGAN");
      if (rows.length > 0) {
        // Use the first organ row, remap org_id to the target
        const organData = { ...rows[0] };
        delete organData.org_id; // don't try to set identity column
        const { error } = await supabase.from("organ").update(organData).eq("org_id", numOrgId);
        if (error) {
          report.ORGAN = { imported: 0, skipped: 1, error: error.message };
        } else {
          report.ORGAN = { imported: 1, skipped: 0 };
          totalImported += 1;
        }
      }
    }

    // ──────────────────────────────────────────────────────
    // STEP 4: CUSTOMER — strip identity PK, insert fresh
    // Build old→new cust_id mapping for FK references
    // ──────────────────────────────────────────────────────
    const custIdMap = new Map<number, number>(); // old_cust_id → new_cust_id

    if (existingTables.has("CUSTOMER")) {
      const rawRows = readSqliteTable(db, "CUSTOMER"); // includes cust_id
      let imported = 0;
      let skipped = 0;

      for (const row of rawRows) {
        const oldCustId = row.cust_id as number;
        const insertRow = { ...row };
        delete insertRow.cust_id; // strip identity column

        const { data, error } = await supabase
          .from("customer")
          .insert(insertRow)
          .select("cust_id")
          .single();

        if (error) {
          skipped++;
        } else {
          imported++;
          custIdMap.set(oldCustId, (data as { cust_id: number }).cust_id);
        }
      }

      report.CUSTOMER = { imported, skipped };
      totalImported += imported;
    }

    // ──────────────────────────────────────────────────────
    // STEP 5: CUSTOMER_ADDR — remap cust_id
    // ──────────────────────────────────────────────────────
    if (existingTables.has("CUSTOMER_ADDR")) {
      const rows = readSqliteTable(db, "CUSTOMER_ADDR");
      const remapped = rows
        .map((r) => {
          const newCustId = custIdMap.get(r.cust_id as number);
          if (!newCustId) return null;
          return { ...r, cust_id: newCustId };
        })
        .filter(Boolean) as Record<string, unknown>[];
      const r = await bulkInsert("customer_addr", remapped);
      report.CUSTOMER_ADDR = { imported: r.imported, skipped: r.skipped + (rows.length - remapped.length) };
      totalImported += r.imported;
    }

    // ──────────────────────────────────────────────────────
    // STEP 6: ACC_BOOK — strip identity, remap cust_id
    // Find or create "익명" customer for CUST_ID <= 0
    // ──────────────────────────────────────────────────────
    let anonCustId: number;
    const { data: anonCust } = await supabase.from("customer").select("cust_id").eq("name", "익명").limit(1);
    if (anonCust && anonCust.length > 0) {
      anonCustId = anonCust[0].cust_id;
    } else {
      const { data: newAnon } = await supabase.from("customer").insert({ cust_sec_cd: 63, name: "익명", reg_num: "9999" }).select("cust_id").single();
      anonCustId = (newAnon as { cust_id: number })?.cust_id ?? 0;
    }

    const accBookIdMap = new Map<number, number>(); // old → new

    if (existingTables.has("ACC_BOOK")) {
      const rawRows = readSqliteTable(db, "ACC_BOOK");
      let imported = 0;
      let skipped = 0;

      for (const row of rawRows) {
        const oldAccBookId = row.acc_book_id as number;
        const oldCustId = row.cust_id as number;
        const insertRow: Record<string, unknown> = { ...row, org_id: numOrgId };
        delete insertRow.acc_book_id;
        // Remap cust_id: negative/zero → anonymous, positive → mapped
        if (oldCustId <= 0) {
          insertRow.cust_id = anonCustId;
        } else if (oldCustId > 0) {
          const newCustId = custIdMap.get(oldCustId);
          if (newCustId) insertRow.cust_id = newCustId;
        }

        const { data, error } = await supabase
          .from("acc_book")
          .insert(insertRow)
          .select("acc_book_id")
          .single();

        if (error) {
          skipped++;
        } else {
          imported++;
          accBookIdMap.set(oldAccBookId, (data as { acc_book_id: number }).acc_book_id);
        }
      }

      report.ACC_BOOK = { imported, skipped };
      totalImported += imported;
    }

    // ──────────────────────────────────────────────────────
    // STEP 7: ACC_BOOK_BAK — strip identity, remap cust_id + acc_book_id
    // ──────────────────────────────────────────────────────
    if (existingTables.has("ACC_BOOK_BAK")) {
      const rawRows = readSqliteTable(db, "ACC_BOOK_BAK");
      const remapped = rawRows.map((r) => {
        const row: Record<string, unknown> = { ...r, org_id: numOrgId };
        delete row.bak_id;
        const oldCustId = r.cust_id as number;
        if (oldCustId > 0) {
          const newCustId = custIdMap.get(oldCustId);
          if (newCustId) row.cust_id = newCustId;
        }
        const oldAbId = r.acc_book_id as number;
        const newAbId = accBookIdMap.get(oldAbId);
        if (newAbId) row.acc_book_id = newAbId;
        return row;
      });
      const r = await bulkInsert("acc_book_bak", remapped);
      report.ACC_BOOK_BAK = r;
      totalImported += r.imported;
    }

    // ──────────────────────────────────────────────────────
    // STEP 8: ACCBOOKSEND — remap acc_book_id
    // ──────────────────────────────────────────────────────
    if (existingTables.has("ACCBOOKSEND")) {
      const rows = readSqliteTable(db, "ACCBOOKSEND");
      const remapped = rows
        .map((r) => {
          const newId = accBookIdMap.get(r.acc_book_id as number);
          if (!newId) return null;
          return { ...r, acc_book_id: newId };
        })
        .filter(Boolean) as Record<string, unknown>[];
      const r = await bulkInsert("accbooksend", remapped);
      report.ACCBOOKSEND = r;
      totalImported += r.imported;
    }

    // ──────────────────────────────────────────────────────
    // STEP 9: ESTATE — strip identity, remap org_id
    // ──────────────────────────────────────────────────────
    if (existingTables.has("ESTATE")) {
      const rows = readSqliteTable(db, "ESTATE", ["estate_id"]);
      const remapped = rows.map((r) => ({ ...r, org_id: numOrgId }));
      const r = await bulkInsert("estate", remapped);
      report.ESTATE = r;
      totalImported += r.imported;
    }

    // ──────────────────────────────────────────────────────
    // STEP 10: OPINION — remap org_id, upsert
    // ──────────────────────────────────────────────────────
    if (existingTables.has("OPINION")) {
      const rows = readSqliteTable(db, "OPINION");
      const remapped = rows.map((r) => ({ ...r, org_id: numOrgId }));
      const r = await bulkUpsert("opinion", remapped, "org_id");
      report.OPINION = r;
      totalImported += r.imported;
    }

    // ──────────────────────────────────────────────────────
    // Remaining shared tables
    // ──────────────────────────────────────────────────────
    for (const [sqliteName, pgName, pk] of [
      ["SUM_REPT", "sum_rept", "sum_rept_id"],
      ["COL_ORGAN", "col_organ", "org_id"],
      ["ALARM", "alarm", "year,org_id,chk_yn"],
    ] as const) {
      if (existingTables.has(sqliteName) && !report[sqliteName]) {
        const rows = readSqliteTable(db, sqliteName);
        if (rows.length > 0) {
          const r = await bulkUpsert(pgName, rows, pk);
          report[sqliteName] = r;
          totalImported += r.imported;
        } else {
          report[sqliteName] = { imported: 0, skipped: 0 };
        }
      }
    }

    db.close();

    return NextResponse.json({ success: true, totalImported, report });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
