import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import initSqlJs from "sql.js";
import path from "path";
import { readFileSync } from "fs";
import accRel2Seed from "@/lib/sqlite-seed/acc_rel2.json";
import {
  buildOrganExport as buildOrganExportShared,
  remapOrgId as remapOrgIdShared,
  type SupabaseOrgan as OrganRowShared,
  type CandidateCredentials,
} from "@/lib/accounting/organ-pair";
import { computeBalances, type AccBookRow } from "@/lib/accounting/settlement-calc";
import { ParityError, ParityErrors } from "@/lib/accounting/parity-errors";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { db: { schema: "pfam" } }
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

// SQLite DDL matching the 선관위 Fund_Master.db format.
// Includes NOT NULL/FK constraints and the 5 auxiliary tables expected by the
// Windows accounting program (ACC_REL2, CODESETTEMP, CODEVALUETEMP, CUSTOMERTEMP, TEST).
const SQLITE_DDL = `
CREATE TABLE [ORGAN] (
  [ORG_ID] INTEGER NOT NULL PRIMARY KEY,
  [ORG_SEC_CD] INTEGER NOT NULL CONSTRAINT [ORGAN_FK1] REFERENCES [CODEVALUE]([CV_ID]),
  [ORG_NAME] varchar(100) NOT NULL,
  [REG_NUM] varchar(13) NOT NULL,
  [REG_DATE] Char(8),
  [POST] varchar(6),
  [ADDR] varchar(100),
  [ADDR_DETAIL] varchar(100),
  [TEL] varchar(20),
  [FAX] varchar(20),
  [REP_NAME] varchar(50),
  [ACCT_NAME] varchar(50),
  [COMM] varchar(50),
  [USERID] varchar(20),
  [PASSWD] varchar(20),
  [HINT1] varchar(50),
  [HINT2] varchar(50),
  [ORG_ORDER] INTEGER,
  [PRE_ACC_FROM] Char(8),
  [PRE_ACC_TO] Char(8),
  [ACC_FROM] Char(8),
  [ACC_TO] Char(8),
  [CODE_DATE] CHAR(8)
);
CREATE TABLE CUSTOMER (
  CUST_ID INTEGER NOT NULL,
  CUST_SEC_CD INTEGER NOT NULL,
  REG_NUM VARCHAR(15),
  NAME VARCHAR(50),
  JOB VARCHAR(30),
  TEL VARCHAR(20),
  SIDO INTEGER,
  POST VARCHAR(7),
  ADDR VARCHAR(100),
  ADDR_DETAIL VARCHAR(100),
  FAX VARCHAR(20),
  BIGO VARCHAR(50),
  REG_DATE VARCHAR(8),
  CUST_ORDER INTEGER,
  CONSTRAINT CUSTOMER_PK PRIMARY KEY (CUST_ID),
  CONSTRAINT CUSTOMER_FK1 FOREIGN KEY (CUST_SEC_CD) REFERENCES CODEVALUE(CV_ID)
);
CREATE TABLE CUSTOMER_ADDR (
  CUST_ID INTEGER NOT NULL,
  CUST_SEQ INTEGER NOT NULL,
  REG_DATE VARCHAR(8),
  TEL VARCHAR(20),
  POST VARCHAR(7),
  ADDR VARCHAR(100),
  ADDR_DETAIL VARCHAR(100),
  CONSTRAINT CUSTOMER_ADDR_PK PRIMARY KEY (CUST_ID, CUST_SEQ),
  CONSTRAINT CUSTOMER_ADDR_FK1 FOREIGN KEY (CUST_ID) REFERENCES CUSTOMER(CUST_ID)
);
CREATE TABLE [ACC_BOOK] (
  [ACC_BOOK_ID] INTEGER NOT NULL PRIMARY KEY,
  [ORG_ID] INTEGER NOT NULL CONSTRAINT [ACC_BOOK_FK1] REFERENCES [ORGAN]([ORG_ID]),
  [INCM_SEC_CD] INTEGER NOT NULL,
  [ACC_SEC_CD] INTEGER NOT NULL,
  [ITEM_SEC_CD] INTEGER NOT NULL,
  [EXP_SEC_CD] INTEGER NOT NULL,
  [CUST_ID] INTEGER NOT NULL CONSTRAINT [ACC_BOOK_FK3] REFERENCES [CUSTOMER]([CUST_ID]),
  [ACC_DATE] CHAR(8) NOT NULL,
  [CONTENT] VARCHAR(100) NOT NULL,
  [ACC_AMT] NUMERIC(15,0) NOT NULL,
  [RCP_YN] CHAR(1) NOT NULL,
  [RCP_NO] VARCHAR(30),
  [RCP_NO2] INTEGER DEFAULT 0,
  [TEL] VARCHAR(20),
  [POST] VARCHAR(7),
  [ADDR] VARCHAR(100),
  [ADDR_DETAIL] VARCHAR(100),
  [ACC_SORT_NUM] INTEGER,
  [REG_DATE] CHAR(8),
  [ACC_INS_TYPE] CHAR(2),
  [ACC_PRINT_OK] CHAR(1) DEFAULT 'N',
  [BIGO] VARCHAR(100),
  [BIGO2] VARCHAR(100),
  [RETURN_YN] CHAR(1) DEFAULT 'N',
  [EXP_TYPE_CD] INTEGER DEFAULT (-1),
  [EXP_GROUP1_CD] VARCHAR(40),
  [EXP_GROUP2_CD] VARCHAR(40),
  [EXP_GROUP3_CD] VARCHAR(40)
);
CREATE TABLE [ACC_BOOK_BAK] (
  [BAK_ID] INTEGER NOT NULL PRIMARY KEY,
  [WORK_KIND] INTEGER NOT NULL,
  [ACC_BOOK_ID] INTEGER NOT NULL,
  [ORG_ID] INTEGER NOT NULL,
  [INCM_SEC_CD] INTEGER NOT NULL,
  [ACC_SEC_CD] INTEGER NOT NULL,
  [ITEM_SEC_CD] INTEGER NOT NULL,
  [EXP_SEC_CD] INTEGER NOT NULL,
  [CUST_ID] INTEGER NOT NULL,
  [ACC_DATE] CHAR(8) NOT NULL,
  [CONTENT] VARCHAR(100) NOT NULL,
  [ACC_AMT] NUMERIC(15,0) NOT NULL,
  [RCP_YN] CHAR(1) NOT NULL,
  [RCP_NO] VARCHAR(30),
  [RCP_NO2] INTEGER DEFAULT 0,
  [TEL] VARCHAR(20),
  [POST] VARCHAR(7),
  [ADDR] VARCHAR(100),
  [ADDR_DETAIL] VARCHAR(100),
  [ACC_SORT_NUM] INTEGER,
  [REG_DATE] CHAR(8),
  [ACC_INS_TYPE] CHAR(2),
  [ACC_PRINT_OK] CHAR(1),
  [BIGO] VARCHAR(100),
  [BIGO2] VARCHAR(100),
  [RETURN_YN] CHAR(1),
  [EXP_TYPE_CD] INTEGER DEFAULT (-1),
  [EXP_GROUP1_CD] VARCHAR(40),
  [EXP_GROUP2_CD] VARCHAR(40),
  [EXP_GROUP3_CD] VARCHAR(40)
);
CREATE TABLE ACCBOOKSEND (
  ACC_BOOK_ID INTEGER NOT NULL,
  SEND_DATE Char(8)
);
CREATE TABLE ESTATE (
  ESTATE_ID INTEGER NOT NULL,
  ORG_ID INTEGER NOT NULL,
  ESTATE_SEC_CD INTEGER NOT NULL,
  KIND varchar(50) NOT NULL,
  QTY INTEGER NOT NULL,
  CONTENT varchar(100) NOT NULL,
  AMT INTEGER NOT NULL,
  REMARK varchar(100) NOT NULL,
  REG_DATE varCHAR(8),
  ESTATE_ORDER INTEGER DEFAULT 0,
  CONSTRAINT ESTATE_PK PRIMARY KEY (ESTATE_ID),
  CONSTRAINT ESTATE_FK1 FOREIGN KEY (ORG_ID) REFERENCES ORGAN(ORG_ID),
  CONSTRAINT ESTATE_FK2 FOREIGN KEY (ESTATE_SEC_CD) REFERENCES CODEVALUE(CV_ID)
);
CREATE TABLE OPINION (
  ORG_ID INTEGER NOT NULL,
  ACC_FROM CHAR(8),
  ACC_TO CHAR(8),
  AUDIT_FROM CHAR(8),
  AUDIT_TO CHAR(8),
  OPINION Varchar(100),
  PRINT_01 CHAR(8),
  POSITION Varchar(50),
  ADDR Varchar(50),
  NAME Varchar(50),
  JUDGE_FROM CHAR(8),
  JUDGE_TO CHAR(8),
  INCM_FROM CHAR(8),
  INCM_TO CHAR(8),
  ESTATE_AMT NUMERIC(15,0),
  IN_AMT NUMERIC(15,0),
  CM_AMT NUMERIC(15,0),
  BALANCE_AMT NUMERIC(15,0),
  PRINT_02 CHAR(8),
  COMM_DESC Varchar(50),
  COMM_NAME01 Varchar(50),
  COMM_NAME02 Varchar(50),
  COMM_NAME03 Varchar(50),
  COMM_NAME04 Varchar(50),
  COMM_NAME05 Varchar(50),
  ACC_TITLE Varchar(50),
  ACC_DOCY CHAR(4),
  ACC_DOCNUM CHAR(4),
  ACC_FDATE CHAR(8),
  ACC_COMM Varchar(20),
  ACC_TORGNM Varchar(50),
  ACC_BORGNM Varchar(50),
  ACC_REPNM Varchar(20),
  CONSTRAINT OPINION_PK PRIMARY KEY (ORG_ID)
);
CREATE TABLE CODESET (
  CS_ID INTEGER PRIMARY KEY,
  CS_NAME Varchar(30),
  CS_ACTIVEFLAG Varchar(5),
  CS_COMMENT Varchar(255)
);
CREATE TABLE CODEVALUE (
  CS_ID INTEGER NOT NULL,
  CV_ID INTEGER NOT NULL,
  CV_NAME VARCHAR(30) NOT NULL,
  CV_ORDER INTEGER NOT NULL,
  CV_COMMENT VARCHAR(255),
  CV_ETC VARCHAR(50),
  CV_ETC2 VARCHAR(50),
  CV_ETC3 VARCHAR(50),
  CV_ETC4 VARCHAR(50),
  CV_ETC5 VARCHAR(50),
  CV_ETC6 VARCHAR(50),
  CV_ETC7 VARCHAR(50),
  CV_ETC8 VARCHAR(50),
  CV_ETC9 VARCHAR(50),
  CV_ETC10 VARCHAR(50),
  CONSTRAINT CODEVALUE_PK PRIMARY KEY (CV_ID),
  CONSTRAINT CODEVALUE_FK1 FOREIGN KEY (CS_ID) REFERENCES CODESET(CS_ID)
);
CREATE TABLE ACC_REL (
  ACC_REL_ID INTEGER PRIMARY KEY,
  ORG_SEC_CD INTEGER NOT NULL,
  INCM_SEC_CD INTEGER NOT NULL,
  ACC_SEC_CD INTEGER NOT NULL,
  ITEM_SEC_CD INTEGER NOT NULL,
  EXP_SEC_CD INTEGER NOT NULL,
  INPUT_YN CHAR(1) NOT NULL,
  ACC_ORDER INTEGER NOT NULL,
  CONSTRAINT ACC_REL_FK1 FOREIGN KEY(ORG_SEC_CD) REFERENCES CODEVALUE(CV_ID),
  CONSTRAINT ACC_REL_FK2 FOREIGN KEY(INCM_SEC_CD) REFERENCES CODEVALUE(CV_ID),
  CONSTRAINT ACC_REL_FK3 FOREIGN KEY(ACC_SEC_CD) REFERENCES CODEVALUE(CV_ID),
  CONSTRAINT ACC_REL_FK4 FOREIGN KEY(ITEM_SEC_CD) REFERENCES CODEVALUE(CV_ID)
);
CREATE TABLE ACC_REL2 (
  ACC_REL_ID INTEGER NOT NULL,
  ORG_SEC_CD INTEGER NOT NULL,
  INCM_SEC_CD INTEGER NOT NULL,
  ACC_SEC_CD INTEGER NOT NULL,
  ITEM_SEC_CD INTEGER NOT NULL,
  EXP_SEC_CD INTEGER NOT NULL,
  INPUT_YN CHAR(1) NOT NULL,
  ACC_ORDER INTEGER NOT NULL,
  CONSTRAINT ACC_REL2_PK PRIMARY KEY (ACC_REL_ID),
  CONSTRAINT ACC_REL2_FK1 FOREIGN KEY(ORG_SEC_CD) REFERENCES CODEVALUE(CV_ID),
  CONSTRAINT ACC_REL2_FK2 FOREIGN KEY(INCM_SEC_CD) REFERENCES CODEVALUE(CV_ID),
  CONSTRAINT ACC_REL2_FK3 FOREIGN KEY(ACC_SEC_CD) REFERENCES CODEVALUE(CV_ID),
  CONSTRAINT ACC_REL2_FK4 FOREIGN KEY(ITEM_SEC_CD) REFERENCES CODEVALUE(CV_ID),
  CONSTRAINT ACC_REL2_FK5 FOREIGN KEY(EXP_SEC_CD) REFERENCES CODEVALUE(CV_ID)
);
CREATE TABLE SUM_REPT (
  SUM_REPT_ID INTEGER NOT NULL,
  ORG_ID INTEGER,
  ACC_SEC_CD INTEGER,
  ORG_SEC_CD INTEGER,
  ORG_NAME VARCHAR(50),
  COL_01 NUMERIC(15,0), COL_02 NUMERIC(15,0), COL_03 NUMERIC(15,0), COL_04 NUMERIC(15,0),
  COL_05 NUMERIC(15,0), COL_06 NUMERIC(15,0), COL_07 NUMERIC(15,0), COL_08 NUMERIC(15,0),
  COL_09 NUMERIC(15,0), COL_10 NUMERIC(15,0), COL_11 NUMERIC(15,0), COL_12 NUMERIC(15,0),
  COL_13 NUMERIC(15,0), COL_14 NUMERIC(15,0), COL_15 NUMERIC(15,0), COL_16 NUMERIC(15,0),
  COL_17 NUMERIC(15,0), COL_18 NUMERIC(15,0), COL_19 NUMERIC(15,0), COL_20 NUMERIC(15,0),
  COL_21 NUMERIC(15,0), COL_22 NUMERIC(15,0), COL_23 NUMERIC(15,0), COL_24 NUMERIC(15,0),
  COL_25 NUMERIC(15,0), COL_26 NUMERIC(15,0), COL_27 NUMERIC(15,0), COL_28 NUMERIC(15,0),
  COL_29 NUMERIC(15,0), COL_30 NUMERIC(15,0), COL_31 NUMERIC(15,0), COL_32 NUMERIC(15,0),
  COL_33 NUMERIC(15,0),
  STATUS VARCHAR(1),
  CONSTRAINT SUM_REPT_PK PRIMARY KEY (SUM_REPT_ID),
  CONSTRAINT SUM_REPT_FK2 FOREIGN KEY (ACC_SEC_CD) REFERENCES CODEVALUE(CV_ID)
);
CREATE TABLE COL_ORGAN (
  ORG_ID INTEGER NOT NULL,
  ORG_SEC_CD INTEGER NOT NULL,
  ORG_NAME Varchar(50) NOT NULL,
  CONSTRAINT COL_ORGAN_PK PRIMARY KEY (ORG_ID),
  CONSTRAINT COL_ORGAN_FK1 FOREIGN KEY(ORG_SEC_CD) REFERENCES CODEVALUE(CV_ID)
);
CREATE TABLE ALARM (
  YEAR CHAR(4),
  ORG_ID INTEGER,
  TYPE INTEGER,
  CHK_YN CHAR(1),
  CONSTRAINT ALARM_PK PRIMARY KEY (YEAR, ORG_ID, CHK_YN)
);
CREATE TABLE CODESETTEMP (
  CS_ID INTEGER PRIMARY KEY,
  CS_NAME Varchar(30),
  CS_ACTIVEFLAG Varchar(5),
  CS_COMMENT Varchar(255)
);
CREATE TABLE CODEVALUETEMP (
  CS_ID INTEGER NOT NULL,
  CV_ID INTEGER NOT NULL,
  CV_NAME VARCHAR(30) NOT NULL,
  CV_ORDER INTEGER NOT NULL,
  CV_COMMENT VARCHAR(255),
  CV_ETC VARCHAR(50), CV_ETC2 VARCHAR(50), CV_ETC3 VARCHAR(50),
  CV_ETC4 VARCHAR(50), CV_ETC5 VARCHAR(50), CV_ETC6 VARCHAR(50),
  CV_ETC7 VARCHAR(50), CV_ETC8 VARCHAR(50), CV_ETC9 VARCHAR(50),
  CV_ETC10 VARCHAR(50),
  CONSTRAINT CODEVALUETEMP_PK PRIMARY KEY (CV_ID),
  CONSTRAINT CODEVALUETEMP_FK1 FOREIGN KEY (CS_ID) REFERENCES CODESETTEMP(CS_ID)
);
CREATE TABLE CUSTOMERTEMP (
  TEMPINDEX integer,
  CUST_SEC_CD integer,
  NAME Varchar(50),
  REG_NUM Varchar(15),
  JOB Varchar(30),
  SIDO integer,
  POST Varchar(7),
  ADDR Varchar(100),
  ADDR_DETAIL Varchar(100),
  TEL Varchar(20),
  FAX Varchar(20),
  BIGO Varchar(50),
  CVNAMEERROR Varchar(10),
  NAMEERROR Varchar(10),
  REG_NUMERROR Varchar(10),
  JOBERROR Varchar(10),
  SIDOERROR Varchar(10),
  POSTERROR Varchar(10),
  MASTERCHECK Varchar(10),
  DETAILCHECK Varchar(10)
);
CREATE TABLE TEST (AA INTEGER PRIMARY KEY, NAME VARCHAR(20));
CREATE TABLE info (
  no integer primary key,
  name varchar(10),
  number varchar(10)
);
`;

type SupabaseOrgan = OrganRowShared & { [key: string]: unknown };

// ORGAN pair 변환과 org_id remap은 lib/accounting/organ-pair로 이동.
const buildOrganExport = (
  org: SupabaseOrgan,
  candidateCredentials?: CandidateCredentials,
) =>
  buildOrganExportShared(org, {
    maskPasswd: false,
    candidateCredentials,
  }) as unknown as {
    organRows: Record<string, unknown>[];
    orgIdMap: Map<number, number>;
  };
const remapOrgId = remapOrgIdShared;

async function fetchTable(
  table: string,
  orgFilter?: { col: string; orgId: number },
  yearFilter?: { col: string; year: string },
) {
  let query = supabase.from(table).select("*");
  if (orgFilter) {
    query = query.eq(orgFilter.col, orgFilter.orgId);
  }
  if (yearFilter) {
    query = query
      .gte(yearFilter.col, `${yearFilter.year}0101`)
      .lte(yearFilter.col, `${yearFilter.year}1231`);
  }
  const { data, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  return data || [];
}

function insertRows(
  db: InstanceType<Awaited<ReturnType<typeof initSqlJs>>["Database"]>,
  tableName: string,
  rows: Record<string, unknown>[],
  alreadyUpper = false,
) {
  if (rows.length === 0) return;
  const cols = Object.keys(rows[0]);
  const upperCols = alreadyUpper ? cols : cols.map(toUpper);
  const placeholders = cols.map(() => "?").join(",");
  const sql = `INSERT INTO ${tableName} (${upperCols.join(",")}) VALUES (${placeholders})`;
  const stmt = db.prepare(sql);
  for (const row of rows) {
    const vals = cols.map((c) => {
      const v = row[c];
      return v === null || v === undefined ? null : v;
    });
    stmt.run(vals as never);
  }
  stmt.free();
}

export async function GET(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get("orgId");
  const orgName = request.nextUrl.searchParams.get("orgName") || "data";
  const candUseridParam = request.nextUrl.searchParams.get("candUserid");
  const candPasswdParam = request.nextUrl.searchParams.get("candPasswd");
  const yearParam = request.nextUrl.searchParams.get("year");

  if (!orgId) {
    return NextResponse.json({ error: "orgId required" }, { status: 400 });
  }

  // year은 옵션. 형식 YYYY (1900~2099). 잘못된 값은 400.
  let yearFilter: { col: string; year: string } | undefined;
  if (yearParam !== null && yearParam !== "") {
    if (!/^(19|20)\d{2}$/.test(yearParam)) {
      return NextResponse.json(
        { error: { code: "INVALID_YEAR", message: "year은 YYYY 형식이어야 합니다 (예: 2026)" } },
        { status: 400 },
      );
    }
    yearFilter = { col: "acc_date", year: yearParam };
  }

  const numOrgId = Number(orgId);

  try {
    // ──────────────────────────────────────────────────────
    // Step 0: 사전 검증 — PFund2 호환 자격증명 (PARITY-007)
    // WASM/DDL 비용 회피를 위해 fail-fast.
    // ──────────────────────────────────────────────────────
    const { data: credCheck, error: credErr } = await supabase
      .from("organ")
      .select("userid, passwd")
      .eq("org_id", numOrgId)
      .maybeSingle();

    if (credErr) throw new Error(`organ credential check: ${credErr.message}`);
    if (!credCheck) {
      return NextResponse.json({ error: "organ not found" }, { status: 404 });
    }

    const missing: string[] = [];
    if (!credCheck.userid || String(credCheck.userid).trim() === "") missing.push("userid");
    if (!credCheck.passwd || String(credCheck.passwd).trim() === "") missing.push("passwd");
    if (missing.length > 0) {
      throw ParityErrors.organCredentialsMissing({
        organId: numOrgId,
        missing,
        actionUrl: "/dashboard/organ",
      });
    }

    // 페어 자격증명 partial 검증 — 둘 다 입력하거나 둘 다 비워야 함
    const candUseridTrimmed = candUseridParam?.trim() ?? "";
    const candPasswdTrimmed = candPasswdParam?.trim() ?? "";
    const hasCandUserid = candUseridTrimmed.length > 0;
    const hasCandPasswd = candPasswdTrimmed.length > 0;
    if (hasCandUserid !== hasCandPasswd) {
      throw ParityErrors.organCredentialsMissing({
        organId: numOrgId,
        candidate_partial: true,
        message_detail:
          "후보자 계정 자격증명은 ID/비밀번호 둘 다 입력하거나 둘 다 비워야 합니다",
      });
    }

    const candidateCredentials: CandidateCredentials | undefined =
      hasCandUserid && hasCandPasswd
        ? { userid: candUseridTrimmed, passwd: candPasswdTrimmed }
        : undefined;

    const wasmPath = path.join(process.cwd(), "node_modules", "sql.js", "dist", "sql-wasm.wasm");
    const wasmBinary = readFileSync(wasmPath);
    const SQL = await initSqlJs({ wasmBinary });
    const db = new SQL.Database();

    // Create full Fund_Master-compatible schema
    db.run(SQLITE_DDL);

    // Fetch all data from Supabase
    const [organList, customer, customerAddr, accBook, accBookBak, accBookSend,
      estate, opinion, codeset, codevalue, accRel, sumRept, colOrgan, alarm,
    ] = await Promise.all([
      fetchTable("organ", { col: "org_id", orgId: numOrgId }),
      fetchTable("customer"),
      fetchTable("customer_addr"),
      // year 지정 시 acc_date 기준으로 회계연도 1년만 추출 (PFund2 호환 유지)
      fetchTable("acc_book", { col: "org_id", orgId: numOrgId }, yearFilter),
      fetchTable("acc_book_bak", { col: "org_id", orgId: numOrgId }, yearFilter),
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

    if (organList.length === 0) {
      db.close();
      return NextResponse.json({ error: "organ not found" }, { status: 404 });
    }
    const supabaseOrgan = organList[0] as SupabaseOrgan;

    // Build ORGAN export rows + org_id remap (supports 후보자+후원회 pair)
    const { organRows, orgIdMap } = buildOrganExport(supabaseOrgan, candidateCredentials);

    // OPINION 결산 동기화: 마이너스 수입 보정 후 in_amt/cm_amt/balance_amt + estate 합계
    const accBookRows: AccBookRow[] = (accBook as Record<string, unknown>[])
      .map((r) => ({
        acc_book_id: Number(r.acc_book_id ?? 0),
        org_id: Number(r.org_id ?? 0),
        incm_sec_cd: Number(r.incm_sec_cd ?? 0),
        acc_sec_cd: Number(r.acc_sec_cd ?? 0),
        item_sec_cd: Number(r.item_sec_cd ?? 0),
        exp_sec_cd: Number(r.exp_sec_cd ?? 0),
        acc_date: String(r.acc_date ?? ""),
        acc_amt: Number(r.acc_amt ?? 0),
      }));
    const settlement = computeBalances(accBookRows);
    const estateTotal = (estate as Record<string, unknown>[])
      .reduce(
        (sum, e) => sum + Number(e.amt ?? 0) * Number(e.qty ?? 1),
        0,
      );

    const settlementOverlay = {
      in_amt: settlement.incomeTotal,
      cm_amt: settlement.expenseTotal,
      balance_amt: settlement.balance,
      estate_amt: estateTotal,
    };
    const syncedOpinion: Record<string, unknown>[] = opinion.length > 0
      ? opinion.map((row) => ({ ...row, ...settlementOverlay }))
      : [{ org_id: orgIdMap.get(numOrgId) ?? 1, ...settlementOverlay }];

    // Insert reference codes first (FK constraints in ACC_BOOK depend on these)
    insertRows(db, "CODESET", codeset);
    insertRows(db, "CODEVALUE", codevalue);
    insertRows(db, "ACC_REL", accRel);
    insertRows(db, "ACC_REL2", accRel2Seed as Record<string, unknown>[], true);

    // ORGAN with the remapped pair
    insertRows(db, "ORGAN", organRows, true);

    // Customer (no org_id) — insert as-is
    insertRows(db, "CUSTOMER", customer);
    insertRows(db, "CUSTOMER_ADDR", customerAddr);

    // Tables with org_id — remap before insert
    insertRows(db, "ACC_BOOK", remapOrgId(accBook, orgIdMap));
    insertRows(db, "ACC_BOOK_BAK", remapOrgId(accBookBak, orgIdMap));
    insertRows(db, "ACCBOOKSEND", accBookSend);
    insertRows(db, "ESTATE", remapOrgId(estate, orgIdMap));
    insertRows(db, "OPINION", remapOrgId(syncedOpinion, orgIdMap));
    insertRows(db, "SUM_REPT", remapOrgId(sumRept, orgIdMap));
    insertRows(db, "COL_ORGAN", remapOrgId(colOrgan, orgIdMap));
    insertRows(db, "ALARM", remapOrgId(alarm, orgIdMap));

    // info: 선관위 프로그램이 이 테이블을 사용하지 않으므로 빈 상태 유지

    // Export .db binary
    const dbBinary = db.export();
    db.close();

    const suffix = yearFilter ? `자체분-${yearFilter.year}` : "자체분";
    const filename = encodeURIComponent(`${orgName}(${suffix}).db`);

    return new NextResponse(dbBinary.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/x-sqlite3",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    if (err instanceof ParityError) {
      return NextResponse.json(err.toResponse(), { status: err.httpStatus });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: { code: "INTERNAL", message } },
      { status: 500 },
    );
  }
}
