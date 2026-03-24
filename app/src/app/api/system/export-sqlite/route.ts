import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import initSqlJs from "sql.js";
import path from "path";
import { readFileSync } from "fs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Column name mapping: PostgreSQL snake_case → SQLite UPPER_CASE
const COL_MAP: Record<string, string> = {
  org_id: "ORG_ID", org_sec_cd: "ORG_SEC_CD", org_name: "ORG_NAME",
  reg_num: "REG_NUM", reg_date: "REG_DATE", post: "POST", addr: "ADDR",
  addr_detail: "ADDR_DETAIL", tel: "TEL", fax: "FAX", rep_name: "REP_NAME",
  acct_name: "ACCT_NAME", comm: "COMM", userid: "USERID", passwd: "PASSWD",
  hint1: "HINT1", hint2: "HINT2", org_order: "ORG_ORDER",
  pre_acc_from: "PRE_ACC_FROM", pre_acc_to: "PRE_ACC_TO",
  acc_from: "ACC_FROM", acc_to: "ACC_TO", code_date: "CODE_DATE",
  cust_id: "CUST_ID", cust_sec_cd: "CUST_SEC_CD", name: "NAME",
  job: "JOB", sido: "SIDO", bigo: "BIGO", cust_order: "CUST_ORDER",
  cust_seq: "CUST_SEQ",
  acc_book_id: "ACC_BOOK_ID", incm_sec_cd: "INCM_SEC_CD",
  acc_sec_cd: "ACC_SEC_CD", item_sec_cd: "ITEM_SEC_CD",
  exp_sec_cd: "EXP_SEC_CD", acc_date: "ACC_DATE", content: "CONTENT",
  acc_amt: "ACC_AMT", rcp_yn: "RCP_YN", rcp_no: "RCP_NO",
  rcp_no2: "RCP_NO2", acc_sort_num: "ACC_SORT_NUM",
  acc_ins_type: "ACC_INS_TYPE", acc_print_ok: "ACC_PRINT_OK",
  bigo2: "BIGO2", return_yn: "RETURN_YN", exp_type_cd: "EXP_TYPE_CD",
  exp_group1_cd: "EXP_GROUP1_CD", exp_group2_cd: "EXP_GROUP2_CD",
  exp_group3_cd: "EXP_GROUP3_CD",
  bak_id: "BAK_ID", work_kind: "WORK_KIND",
  send_date: "SEND_DATE",
  estate_id: "ESTATE_ID", estate_sec_cd: "ESTATE_SEC_CD",
  kind: "KIND", qty: "QTY", amt: "AMT", remark: "REMARK",
  estate_order: "ESTATE_ORDER",
  audit_from: "AUDIT_FROM", audit_to: "AUDIT_TO", opinion: "OPINION",
  print_01: "PRINT_01", position: "POSITION",
  judge_from: "JUDGE_FROM", judge_to: "JUDGE_TO",
  incm_from: "INCM_FROM", incm_to: "INCM_TO",
  estate_amt: "ESTATE_AMT", in_amt: "IN_AMT", cm_amt: "CM_AMT",
  balance_amt: "BALANCE_AMT", print_02: "PRINT_02",
  comm_desc: "COMM_DESC", comm_name01: "COMM_NAME01",
  comm_name02: "COMM_NAME02", comm_name03: "COMM_NAME03",
  comm_name04: "COMM_NAME04", comm_name05: "COMM_NAME05",
  acc_title: "ACC_TITLE", acc_docy: "ACC_DOCY",
  acc_docnum: "ACC_DOCNUM", acc_fdate: "ACC_FDATE",
  acc_comm: "ACC_COMM", acc_torgnm: "ACC_TORGNM",
  acc_borgnm: "ACC_BORGNM", acc_repnm: "ACC_REPNM",
  cs_id: "CS_ID", cs_name: "CS_NAME", cs_activeflag: "CS_ACTIVEFLAG",
  cs_comment: "CS_COMMENT",
  cv_id: "CV_ID", cv_name: "CV_NAME", cv_order: "CV_ORDER",
  cv_comment: "CV_COMMENT", cv_etc: "CV_ETC", cv_etc2: "CV_ETC2",
  cv_etc3: "CV_ETC3", cv_etc4: "CV_ETC4", cv_etc5: "CV_ETC5",
  cv_etc6: "CV_ETC6", cv_etc7: "CV_ETC7", cv_etc8: "CV_ETC8",
  cv_etc9: "CV_ETC9", cv_etc10: "CV_ETC10",
  acc_rel_id: "ACC_REL_ID", input_yn: "INPUT_YN", acc_order: "ACC_ORDER",
  sum_rept_id: "SUM_REPT_ID",
  col_01: "COL_01", col_02: "COL_02", col_03: "COL_03",
  col_04: "COL_04", col_05: "COL_05", col_06: "COL_06",
  col_07: "COL_07", col_08: "COL_08", col_09: "COL_09",
  col_10: "COL_10", col_11: "COL_11", col_12: "COL_12",
  col_13: "COL_13", col_14: "COL_14", col_15: "COL_15",
  col_16: "COL_16", col_17: "COL_17", col_18: "COL_18",
  col_19: "COL_19", col_20: "COL_20", col_21: "COL_21",
  col_22: "COL_22", col_23: "COL_23", col_24: "COL_24",
  col_25: "COL_25", col_26: "COL_26", col_27: "COL_27",
  col_28: "COL_28", col_29: "COL_29", col_30: "COL_30",
  col_31: "COL_31", col_32: "COL_32", col_33: "COL_33",
  status: "STATUS", year: "YEAR", type: "TYPE", chk_yn: "CHK_YN",
};

function toUpper(col: string): string {
  return COL_MAP[col] || col.toUpperCase();
}

// Original SQLite DDL for the .db file
const SQLITE_DDL = `
CREATE TABLE IF NOT EXISTS ORGAN (
  ORG_ID INTEGER PRIMARY KEY, ORG_SEC_CD INTEGER, ORG_NAME TEXT,
  REG_NUM TEXT, REG_DATE TEXT, POST TEXT, ADDR TEXT, ADDR_DETAIL TEXT,
  TEL TEXT, FAX TEXT, REP_NAME TEXT, ACCT_NAME TEXT, COMM TEXT,
  USERID TEXT, PASSWD TEXT, HINT1 TEXT, HINT2 TEXT, ORG_ORDER INTEGER,
  PRE_ACC_FROM TEXT, PRE_ACC_TO TEXT, ACC_FROM TEXT, ACC_TO TEXT, CODE_DATE TEXT
);
CREATE TABLE IF NOT EXISTS CUSTOMER (
  CUST_ID INTEGER PRIMARY KEY, CUST_SEC_CD INTEGER, REG_NUM TEXT,
  NAME TEXT, JOB TEXT, TEL TEXT, SIDO INTEGER, POST TEXT, ADDR TEXT,
  ADDR_DETAIL TEXT, FAX TEXT, BIGO TEXT, REG_DATE TEXT, CUST_ORDER INTEGER
);
CREATE TABLE IF NOT EXISTS CUSTOMER_ADDR (
  CUST_ID INTEGER, CUST_SEQ INTEGER, REG_DATE TEXT, TEL TEXT,
  POST TEXT, ADDR TEXT, ADDR_DETAIL TEXT, PRIMARY KEY (CUST_ID, CUST_SEQ)
);
CREATE TABLE IF NOT EXISTS ACC_BOOK (
  ACC_BOOK_ID INTEGER PRIMARY KEY, ORG_ID INTEGER, INCM_SEC_CD INTEGER,
  ACC_SEC_CD INTEGER, ITEM_SEC_CD INTEGER, EXP_SEC_CD INTEGER,
  CUST_ID INTEGER, ACC_DATE TEXT, CONTENT TEXT, ACC_AMT INTEGER,
  RCP_YN TEXT, RCP_NO TEXT, RCP_NO2 INTEGER, TEL TEXT, POST TEXT,
  ADDR TEXT, ADDR_DETAIL TEXT, ACC_SORT_NUM INTEGER, REG_DATE TEXT,
  ACC_INS_TYPE TEXT, ACC_PRINT_OK TEXT, BIGO TEXT, BIGO2 TEXT,
  RETURN_YN TEXT, EXP_TYPE_CD INTEGER, EXP_GROUP1_CD TEXT,
  EXP_GROUP2_CD TEXT, EXP_GROUP3_CD TEXT
);
CREATE TABLE IF NOT EXISTS ACC_BOOK_BAK (
  BAK_ID INTEGER PRIMARY KEY, WORK_KIND INTEGER,
  ACC_BOOK_ID INTEGER, ORG_ID INTEGER, INCM_SEC_CD INTEGER,
  ACC_SEC_CD INTEGER, ITEM_SEC_CD INTEGER, EXP_SEC_CD INTEGER,
  CUST_ID INTEGER, ACC_DATE TEXT, CONTENT TEXT, ACC_AMT INTEGER,
  RCP_YN TEXT, RCP_NO TEXT, RCP_NO2 INTEGER, TEL TEXT, POST TEXT,
  ADDR TEXT, ADDR_DETAIL TEXT, ACC_SORT_NUM INTEGER, REG_DATE TEXT,
  ACC_INS_TYPE TEXT, ACC_PRINT_OK TEXT, BIGO TEXT, BIGO2 TEXT,
  RETURN_YN TEXT, EXP_TYPE_CD INTEGER, EXP_GROUP1_CD TEXT,
  EXP_GROUP2_CD TEXT, EXP_GROUP3_CD TEXT
);
CREATE TABLE IF NOT EXISTS ACCBOOKSEND (
  ACC_BOOK_ID INTEGER, SEND_DATE TEXT
);
CREATE TABLE IF NOT EXISTS ESTATE (
  ESTATE_ID INTEGER PRIMARY KEY, ORG_ID INTEGER,
  ESTATE_SEC_CD INTEGER, KIND TEXT, QTY INTEGER, CONTENT TEXT,
  AMT INTEGER, REMARK TEXT, REG_DATE TEXT, ESTATE_ORDER INTEGER
);
CREATE TABLE IF NOT EXISTS OPINION (
  ORG_ID INTEGER PRIMARY KEY, ACC_FROM TEXT, ACC_TO TEXT,
  AUDIT_FROM TEXT, AUDIT_TO TEXT, OPINION TEXT, PRINT_01 TEXT,
  POSITION TEXT, ADDR TEXT, NAME TEXT, JUDGE_FROM TEXT, JUDGE_TO TEXT,
  INCM_FROM TEXT, INCM_TO TEXT, ESTATE_AMT INTEGER, IN_AMT INTEGER,
  CM_AMT INTEGER, BALANCE_AMT INTEGER, PRINT_02 TEXT,
  COMM_DESC TEXT, COMM_NAME01 TEXT, COMM_NAME02 TEXT,
  COMM_NAME03 TEXT, COMM_NAME04 TEXT, COMM_NAME05 TEXT,
  ACC_TITLE TEXT, ACC_DOCY TEXT, ACC_DOCNUM TEXT, ACC_FDATE TEXT,
  ACC_COMM TEXT, ACC_TORGNM TEXT, ACC_BORGNM TEXT, ACC_REPNM TEXT
);
CREATE TABLE IF NOT EXISTS CODESET (
  CS_ID INTEGER PRIMARY KEY, CS_NAME TEXT, CS_ACTIVEFLAG TEXT, CS_COMMENT TEXT
);
CREATE TABLE IF NOT EXISTS CODEVALUE (
  CV_ID INTEGER PRIMARY KEY, CS_ID INTEGER, CV_NAME TEXT, CV_ORDER INTEGER,
  CV_COMMENT TEXT, CV_ETC TEXT, CV_ETC2 TEXT, CV_ETC3 TEXT, CV_ETC4 TEXT,
  CV_ETC5 TEXT, CV_ETC6 TEXT, CV_ETC7 TEXT, CV_ETC8 TEXT, CV_ETC9 TEXT, CV_ETC10 TEXT
);
CREATE TABLE IF NOT EXISTS ACC_REL (
  ACC_REL_ID INTEGER PRIMARY KEY, ORG_SEC_CD INTEGER,
  INCM_SEC_CD INTEGER, ACC_SEC_CD INTEGER, ITEM_SEC_CD INTEGER,
  EXP_SEC_CD INTEGER, INPUT_YN TEXT, ACC_ORDER INTEGER
);
CREATE TABLE IF NOT EXISTS SUM_REPT (
  SUM_REPT_ID INTEGER PRIMARY KEY, ORG_ID INTEGER, ACC_SEC_CD INTEGER,
  ORG_SEC_CD INTEGER, ORG_NAME TEXT,
  COL_01 INTEGER, COL_02 INTEGER, COL_03 INTEGER, COL_04 INTEGER,
  COL_05 INTEGER, COL_06 INTEGER, COL_07 INTEGER, COL_08 INTEGER,
  COL_09 INTEGER, COL_10 INTEGER, COL_11 INTEGER, COL_12 INTEGER,
  COL_13 INTEGER, COL_14 INTEGER, COL_15 INTEGER, COL_16 INTEGER,
  COL_17 INTEGER, COL_18 INTEGER, COL_19 INTEGER, COL_20 INTEGER,
  COL_21 INTEGER, COL_22 INTEGER, COL_23 INTEGER, COL_24 INTEGER,
  COL_25 INTEGER, COL_26 INTEGER, COL_27 INTEGER, COL_28 INTEGER,
  COL_29 INTEGER, COL_30 INTEGER, COL_31 INTEGER, COL_32 INTEGER,
  COL_33 INTEGER, STATUS TEXT
);
CREATE TABLE IF NOT EXISTS COL_ORGAN (
  ORG_ID INTEGER PRIMARY KEY, ORG_SEC_CD INTEGER, ORG_NAME TEXT
);
CREATE TABLE IF NOT EXISTS ALARM (
  YEAR TEXT, ORG_ID INTEGER, TYPE INTEGER, CHK_YN TEXT,
  PRIMARY KEY (YEAR, ORG_ID, CHK_YN)
);
CREATE TABLE IF NOT EXISTS info (name TEXT, value TEXT);
`;

async function fetchTable(table: string, orgFilter?: { col: string; orgId: number }) {
  let query = supabase.from(table).select("*");
  if (orgFilter) {
    query = query.eq(orgFilter.col, orgFilter.orgId);
  }
  const { data, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  return data || [];
}

function insertRows(
  db: InstanceType<Awaited<ReturnType<typeof initSqlJs>>["Database"]>,
  tableName: string,
  rows: Record<string, unknown>[]
) {
  if (rows.length === 0) return;
  const cols = Object.keys(rows[0]);
  const upperCols = cols.map(toUpper);
  const placeholders = cols.map(() => "?").join(",");
  const sql = `INSERT INTO ${tableName} (${upperCols.join(",")}) VALUES (${placeholders})`;
  const stmt = db.prepare(sql);
  for (const row of rows) {
    const vals = cols.map((c) => {
      const v = row[c];
      return v === null || v === undefined ? null : v;
    });
    stmt.run(vals);
  }
  stmt.free();
}

export async function GET(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get("orgId");
  const orgName = request.nextUrl.searchParams.get("orgName") || "data";

  if (!orgId) {
    return NextResponse.json({ error: "orgId required" }, { status: 400 });
  }

  const numOrgId = Number(orgId);

  try {
    const wasmPath = path.join(process.cwd(), "node_modules", "sql.js", "dist", "sql-wasm.wasm");
    const wasmBinary = readFileSync(wasmPath);
    const SQL = await initSqlJs({ wasmBinary });
    const db = new SQL.Database();

    // Create schema
    db.run(SQLITE_DDL);

    // Fetch all data from Supabase
    const [organ, customer, customerAddr, accBook, accBookBak, accBookSend,
      estate, opinion, codeset, codevalue, accRel, sumRept, colOrgan, alarm
    ] = await Promise.all([
      fetchTable("organ", { col: "org_id", orgId: numOrgId }),
      fetchTable("customer"),
      fetchTable("customer_addr"),
      fetchTable("acc_book", { col: "org_id", orgId: numOrgId }),
      fetchTable("acc_book_bak", { col: "org_id", orgId: numOrgId }),
      fetchTable("accbooksend"),
      fetchTable("estate", { col: "org_id", orgId: numOrgId }),
      fetchTable("opinion", { col: "org_id", orgId: numOrgId }),
      fetchTable("codeset"),
      fetchTable("codevalue"),
      fetchTable("acc_rel"),
      fetchTable("sum_rept"),
      fetchTable("col_organ"),
      fetchTable("alarm"),
    ]);

    // Insert data into SQLite
    insertRows(db, "ORGAN", organ);
    insertRows(db, "CUSTOMER", customer);
    insertRows(db, "CUSTOMER_ADDR", customerAddr);
    insertRows(db, "ACC_BOOK", accBook);
    insertRows(db, "ACC_BOOK_BAK", accBookBak);
    insertRows(db, "ACCBOOKSEND", accBookSend);
    insertRows(db, "ESTATE", estate);
    insertRows(db, "OPINION", opinion);
    insertRows(db, "CODESET", codeset);
    insertRows(db, "CODEVALUE", codevalue);
    insertRows(db, "ACC_REL", accRel);
    insertRows(db, "SUM_REPT", sumRept);
    insertRows(db, "COL_ORGAN", colOrgan);
    insertRows(db, "ALARM", alarm);

    // Add version info
    db.run("INSERT INTO info (name, value) VALUES ('version', '2.6.1')");
    db.run(`INSERT INTO info (name, value) VALUES ('export_date', '${new Date().toISOString().slice(0, 10).replace(/-/g, "")}')`);

    // Export .db binary
    const dbBinary = db.export();
    db.close();

    const filename = encodeURIComponent(`${orgName}(자체분).db`);

    return new NextResponse(dbBinary.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/x-sqlite3",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
