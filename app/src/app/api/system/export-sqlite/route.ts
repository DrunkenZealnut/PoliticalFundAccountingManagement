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
import { fillExportReceiptNumbers, parseRcpNo } from "@/lib/accounting/receipt-no";
import { fillExportSortNumbers } from "@/lib/accounting/acc-book-sort";
import { buildAdjustedAccBook } from "@/lib/accounting/adjusted-ledger";
import { ParityError, ParityErrors } from "@/lib/accounting/parity-errors";
import {
  PFUND2_ENSURE_ANONYMOUS_CUSTOMER_SQL,
  pfund2DownloadFilename,
  nowRestoreTimestamp,
  type Pfund2ExportMode,
  type RestoreTimestamp,
} from "@/lib/accounting/pfund2-constants";

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

/**
 * restore 파일명 타임스탬프 파싱. 클라이언트가 로컬시간을 "YYYY-MM-DD-HH-mm-ss"로 전달.
 * 유효하지 않으면 서버 로컬시간(nowRestoreTimestamp) fallback.
 */
export function parseRestoreTs(raw: string | null): RestoreTimestamp {
  if (raw) {
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})$/);
    if (m) {
      return {
        y: Number(m[1]),
        mo: Number(m[2]),
        d: Number(m[3]),
        h: Number(m[4]),
        mi: Number(m[5]),
        s: Number(m[6]),
      };
    }
  }
  return nowRestoreTimestamp();
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
  singleOrgId?: number,
) =>
  buildOrganExportShared(org, {
    maskPasswd: false,
    candidateCredentials,
    singleOrgId,
  }) as unknown as {
    organRows: Record<string, unknown>[];
    orgIdMap: Map<number, number>;
  };
const remapOrgId = remapOrgIdShared;

/**
 * 공식 선관위 ACC_BOOK 포맷 정규화 (지출 행 한정).
 *
 * 앱은 '지출방법' 코드(예: "118"=계좌입금, 3자리)를 `acc_ins_type` 문자열에 저장하지만,
 * 공식 스키마의 `ACC_INS_TYPE`은 `CHAR(2)`라 3자리 값이 들어가면 윈도우 선관위 프로그램이
 * 지출부 로드 시 거부 → 지출부 전체가 표시되지 않는다(수입부는 acc_ins_type이 비어 정상).
 *
 * 원본 선관위 데이터는 지출방법 코드를 `EXP_TYPE_CD`(정수)에 담고 `ACC_INS_TYPE`은 비운다.
 * 이 함수는 export 시 그 공식 포맷으로 변환한다:
 *   - acc_ins_type이 2자리 초과(=PAY_METHODS 코드)이고 exp_type_cd가 미설정(-1/빈값)이면
 *     해당 숫자 코드를 exp_type_cd로 이동하고 acc_ins_type은 비운다.
 *   - 그 외 2자리 초과 잔여 문자열도 CHAR(2) 초과 방지를 위해 비운다.
 * 수입 행·이미 공식 포맷(acc_ins_type 빈값/2자리 이하)인 행은 변경하지 않는다.
 */
export function normalizeOfficialExpenseRow(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const ins = row.acc_ins_type;
  if (typeof ins !== "string" || ins.length <= 2) return row;

  const out = { ...row };
  const expTypeCd = Number(out.exp_type_cd ?? -1);
  const insNum = Number(ins);
  // 지출방법 숫자 코드이고 exp_type_cd가 미설정(-1/NaN)이면 공식 위치(EXP_TYPE_CD)로 이동
  if (Number.isInteger(insNum) && (expTypeCd === -1 || !Number.isFinite(expTypeCd))) {
    out.exp_type_cd = insNum;
  }
  // CHAR(2) 초과 방지: acc_ins_type 비움
  out.acc_ins_type = null;
  return out;
}

/**
 * PFund2/선관위 공식 ACC_BOOK 포맷에 없는 앱 전용 확장 컬럼 목록.
 *
 * 공식 SQLite 스키마(ACC_BOOK/ACC_BOOK_BAK DDL)에 존재하지 않는 컬럼은 export 직전 제거해야 한다.
 * fetch가 `SELECT *`라 이 컬럼들이 따라오는데, insertRows가 컬럼명을 그대로 대문자화해 INSERT하면
 * "table ACC_BOOK has no column named ..."로 export 전체가 실패하기 때문이다.
 * - `claim_amt`(보전청구액, scripts/015의 BIGINT)
 * - `alloc_src_id`·`alloc_seq`·`raw_incm_sec_cd`·`raw_acc_sec_cd`·`raw_item_sec_cd`·`raw_acc_amt`·`alloc_gen`
 *   (과목 배분 추적/raw 복원용, scripts/016) — 분할된 ACC_BOOK 행은 공식 .db에선 순수 거래 행만 남아야 함.
 * - `customer`(거래처 조인 객체): `buildAdjustedAccBook`(=allocateCandidateAccBookForExport)이 후보자
 *   재조정 행마다 주입한다(adjusted-ledger.ts). 제거 안 하면 insertRows가
 *   "table ACC_BOOK has no column named CUSTOMER"로 export 전체가 실패.
 * (과거 `acc_time`[scripts/014]도 여기 있었으나 acc-time-removal/scripts/019로 컬럼 자체를 DROP해 제거.)
 */
const APP_ONLY_ACC_BOOK_COLUMNS = [
  "claim_amt",
  "alloc_src_id",
  "alloc_seq",
  "raw_incm_sec_cd",
  "raw_acc_sec_cd",
  "raw_item_sec_cd",
  "raw_acc_amt",
  "alloc_gen",
  "customer",
] as const;

/**
 * 앱 전용 확장 컬럼 제거(공식 포맷 정렬). CUSTOMER.org_id를 export 시 제거하는 것과 동일 처리.
 * 제거 대상 컬럼이 하나도 없으면 원본 참조를 그대로 반환(불변).
 */
export function stripAppOnlyAccBookColumns(
  row: Record<string, unknown>,
): Record<string, unknown> {
  if (!APP_ONLY_ACC_BOOK_COLUMNS.some((c) => c in row)) return row;
  const rest = { ...row };
  for (const c of APP_ONLY_ACC_BOOK_COLUMNS) delete rest[c];
  return rest;
}

/**
 * PFund2/선관위 공식 OPINION 포맷에 없는 앱 전용 확장 컬럼 목록(복수 감사자 2~5번).
 *
 * 공식 OPINION DDL 에는 감사자가 POSITION/ADDR/NAME 단일 세트뿐이다(1명). 앱은 감사 2명 이상을
 * 위해 position02~05 / addr02~05 / name02~05 (scripts/020)를 두는데, fetch 가 `SELECT *`라
 * 이 컬럼들이 따라온다. insertRows 가 컬럼명을 대문자화(POSITION02 등)해 INSERT 하면 공식 DDL 에
 * 없어 "table OPINION has no column named ..."로 export 전체가 실패한다(ACC_BOOK 의
 * acc_time/customer 사례와 동일 클래스). → export 직전 제거해 공식 포맷엔 1번 감사자만 내보낸다.
 */
const APP_ONLY_OPINION_COLUMNS = [
  "position02", "addr02", "name02",
  "position03", "addr03", "name03",
  "position04", "addr04", "name04",
  "position05", "addr05", "name05",
] as const;

/**
 * 앱 전용 감사자 2~5번 컬럼 제거(공식 OPINION 포맷 정렬). stripAppOnlyAccBookColumns 와 동일 패턴.
 * 제거 대상이 하나도 없으면 원본 참조를 그대로 반환(불변).
 */
export function stripAppOnlyOpinionColumns(
  row: Record<string, unknown>,
): Record<string, unknown> {
  if (!APP_ONLY_OPINION_COLUMNS.some((c) => c in row)) return row;
  const rest = { ...row };
  for (const c of APP_ONLY_OPINION_COLUMNS) delete rest[c];
  return rest;
}

/**
 * export용 (계정×과목) 분할 — 재조정 SSOT `buildAdjustedAccBook` 재사용.
 * acc_book(데이터)은 실거래 원본 그대로, 보고자료(.db)에서만 분할(메모리, DB write 없음).
 * 비후보자 무변경. 추적 컬럼은 이후 stripAppOnlyAccBookColumns 가 제거.
 * 재조정 데이터 뷰어(income-expense-book)와 **같은 함수** → 화면 == .db 정합 보장.
 */
export const allocateCandidateAccBookForExport = buildAdjustedAccBook;

/**
 * 영수증 일련번호를 선관위 PFund2 공식 분리 포맷으로 변환.
 *
 * 우리 내부 모델: `rcp_no`="자(비)-24"(전체 문자열), `rcp_no2`=전역 카운터(정렬·중복방지용).
 * 공식 포맷(윈도우 프로그램이 만든 Fund_Data_*.db로 확인): **RCP_NO=접두사(끝 `-` 포함, 예 "자(비)-"),
 * RCP_NO2=숫자 시퀀스(예 24)**. 윈도우 프로그램은 수입·지출부 인쇄 시 `RCP_NO + RCP_NO2`를
 * 이어붙여 표시한다. 따라서 전체 문자열을 RCP_NO에 넣고 카운터를 RCP_NO2에 넣으면
 * "자(비)-24" + "67" = "자(비)-2467"처럼 뒤에 카운터가 덧붙는다.
 * → export 직전 `rcp_no`를 접두사/숫자로 분리한다. 숫자형 영수증이 아니면(빈값·"미지급" 등)
 *   RCP_NO2=0(공식: 숫자부 없음)으로 두어 덧붙음을 방지한다.
 */
export function splitOfficialReceiptNo(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const parsed = parseRcpNo(row.rcp_no as string | null | undefined);
  if (parsed) return { ...row, rcp_no: `${parsed.prefix}-`, rcp_no2: parsed.seq };
  return { ...row, rcp_no2: 0 };
}

/**
 * data1/data2 export용 CUSTOMER 선정 — 거래(ACC_BOOK/ACC_BOOK_BAK)가 실제 참조하는
 * cust_id 집합으로 필터한다.
 *
 * 기존 org_id 필터(`org_id === targetExportOrgId`)는 거래가 참조하는 org_id=NULL(공유)·
 * 타 org 거래처를 빠뜨려 ACC_BOOK이 `ACC_BOOK_FK3 REFERENCES CUSTOMER`를 못 채우는 FK
 * 고아 행을 만든다. 윈도우 선관위(PFund2)는 정치자금수입지출부에서 거래처(수입제공자/
 * 지출받은자)를 join할 때 고아 행을 드롭 → 계정별 수입·지출이 누락된다. 참조 기준으로
 * 선정하면 NULL·타org 참조 거래처까지 포함돼 참조무결성이 보장된다(익명 -999는 별도 보장).
 */
export function selectReferencedCustomers(
  customers: Record<string, unknown>[],
  ...rowSets: Record<string, unknown>[][]
): Record<string, unknown>[] {
  const ids = new Set<number>();
  for (const rows of rowSets) {
    for (const r of rows) {
      const id = Number(r.cust_id);
      if (Number.isFinite(id)) ids.add(id); // NaN(누락/비숫자) 키가 SameValueZero로 오매칭되는 것 방지
    }
  }
  return customers.filter((c) => {
    const id = Number(c.cust_id);
    return Number.isFinite(id) && ids.has(id);
  });
}

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
  const restoreOrgIdParam = request.nextUrl.searchParams.get("restoreOrgId");
  const tsParam = request.nextUrl.searchParams.get("ts");
  // mode 옵션 (PFund2 운영 .db 구조와 1:1 대응):
  //   full   (default)  → 우리 통합본 (ORGAN 페어 + 모든 거래 + reference)
  //   master            → Fund_Master.db 호환 (ORGAN 페어 + reference + CUSTOMER, 거래 0)
  //   data1             → Fund_Data_1.db 호환 (후보자 ORGAN 단행 + 그 organ 거래만)
  //   data2             → Fund_Data_2.db 호환 (후원회 ORGAN 단행 + 그 organ 거래만)
  //   restore           → 단일기관 보관자료 스냅샷. ORGAN 1행(프로그램 실제 ORG_ID) +
  //                       그 organ 거래 + reference 풀세트. [자료 복구]로 적재(Data 폴더 교체 X).
  const modeParam = request.nextUrl.searchParams.get("mode");
  const mode: Pfund2ExportMode =
    modeParam === "master" ||
    modeParam === "data1" ||
    modeParam === "data2" ||
    modeParam === "restore"
      ? modeParam
      : "full";
  const isMasterMode = mode === "master";
  const isData1Mode = mode === "data1";
  const isData2Mode = mode === "data2";
  const isRestoreMode = mode === "restore";

  if (!orgId) {
    return NextResponse.json({ error: "orgId required" }, { status: 400 });
  }

  // restore 모드: 프로그램 실제 ORG_ID 필수(복구는 ORGAN을 이 ID 그대로 INSERT).
  let restoreOrgId: number | null = null;
  if (isRestoreMode) {
    const n = Number(restoreOrgIdParam);
    if (!restoreOrgIdParam || !Number.isInteger(n) || n <= 0) {
      return NextResponse.json(
        {
          error: {
            code: "RESTORE_ORG_ID_REQUIRED",
            message:
              "restore 모드는 restoreOrgId(프로그램 기관번호, 양의 정수)가 필요합니다. Fund_Master.db에서 해당 기관의 ORG_ID를 확인하세요.",
          },
        },
        { status: 400 },
      );
    }
    restoreOrgId = n;
  }

  // data1=후보자(ORG_ID=1), data2=후원회(ORG_ID=2), restore=프로그램 실제 ID, full/master=필터 없음.
  // ESTATE/OPINION/SUM_REPT/COL_ORGAN/ALARM 등 org_id 종속 테이블 일괄 필터에 사용.
  const targetExportOrgId: number | null = isData1Mode
    ? 1
    : isData2Mode
      ? 2
      : isRestoreMode
        ? restoreOrgId
        : null;

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
  // master 모드면 yearFilter 무시 (어차피 거래 비움). data1/data2는 year 필터 적용.
  if (isMasterMode) yearFilter = undefined;

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
      // master 모드: 거래 테이블 빈 배열. full/year 모드: 정상 fetch.
      isMasterMode ? Promise.resolve([]) : fetchTable("acc_book", { col: "org_id", orgId: numOrgId }, yearFilter),
      isMasterMode ? Promise.resolve([]) : fetchTable("acc_book_bak", { col: "org_id", orgId: numOrgId }, yearFilter),
      isMasterMode ? Promise.resolve([]) : fetchTable("accbooksend"),
      isMasterMode ? Promise.resolve([]) : fetchTable("estate", { col: "org_id", orgId: numOrgId }),
      isMasterMode ? Promise.resolve([]) : fetchTable("opinion", { col: "org_id", orgId: numOrgId }),
      fetchTable("codeset"),
      fetchTable("codevalue"),
      fetchTable("acc_rel"),
      // sum_rept/col_organ/alarm: master 모드면 비움 (PFund2 Fund_Master.db에도 비어 있음)
      isMasterMode ? Promise.resolve([]) : fetchTable("sum_rept", { col: "org_id", orgId: numOrgId }),
      isMasterMode ? Promise.resolve([]) : fetchTable("col_organ", { col: "org_id", orgId: numOrgId }),
      isMasterMode ? Promise.resolve([]) : fetchTable("alarm", { col: "org_id", orgId: numOrgId }),
    ]);

    if (organList.length === 0) {
      db.close();
      return NextResponse.json({ error: "organ not found" }, { status: 404 });
    }
    const supabaseOrgan = organList[0] as SupabaseOrgan;

    // Build ORGAN export rows + org_id remap (supports 후보자+후원회 pair)
    // restore 모드: 페어 생성 없이 프로그램 실제 ORG_ID로 단일기관만 export.
    const { organRows, orgIdMap } = buildOrganExport(
      supabaseOrgan,
      candidateCredentials,
      restoreOrgId ?? undefined,
    );

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
    // OPINION fallback ORG_ID 우선순위:
    //   1) data1/data2 모드면 그 export ORG_ID로 강제 (ORGAN 필터 결과와 일치 보장)
    //   2) 그 외(full/master)는 supabase org_id → export ORG_ID 매핑
    //   3) 매핑 실패 시 1 (최소 후보자 행)
    const fallbackOpinionOrgId =
      targetExportOrgId ?? orgIdMap.get(numOrgId) ?? 1;
    const syncedOpinion: Record<string, unknown>[] = opinion.length > 0
      ? opinion.map((row) => ({ ...row, ...settlementOverlay }))
      : [{ org_id: fallbackOpinionOrgId, ...settlementOverlay }];

    // Insert reference codes first (FK constraints in ACC_BOOK depend on these)
    insertRows(db, "CODESET", codeset);
    insertRows(db, "CODEVALUE", codevalue);
    insertRows(db, "ACC_REL", accRel);
    insertRows(db, "ACC_REL2", accRel2Seed as Record<string, unknown>[], true);

    // ORGAN: mode별 행 필터
    //   master/full → 페어 그대로
    //   data1 → ORG_ID=1 (후보자) 단행
    //   data2 → ORG_ID=2 (후원회) 단행
    const filteredOrganRows = isData1Mode
      ? organRows.filter((r) => Number(r.ORG_ID) === 1)
      : isData2Mode
        ? organRows.filter((r) => Number(r.ORG_ID) === 2)
        : organRows;
    insertRows(db, "ORGAN", filteredOrganRows, true);

    // org_id 종속 테이블 공용 필터 (data1→ORG_ID=1, data2→ORG_ID=2, full/master→통과).
    //   ESTATE/OPINION/SUM_REPT/COL_ORGAN/ALARM이 ORGAN(ORG_ID)과 매핑돼야 PFund2 무결성 가정 성립.
    //   CUSTOMER 참조 cust_id 산출(아래)보다 먼저 정의해야 하므로 위로 끌어올림.
    const filterByExportOrgId = <T extends Record<string, unknown>>(rows: T[]): T[] =>
      targetExportOrgId === null
        ? rows
        : rows.filter((r) => Number(r.org_id) === targetExportOrgId);

    // ACC_BOOK/ACC_BOOK_BAK 최종 행: 모드별 거래 필터 + 공식 포맷 정규화 + 영수증번호 자동 채번.
    //   정규화: 지출 행의 3자리 acc_ins_type(지출방법)을 EXP_TYPE_CD로 이동하고 ACC_INS_TYPE
    //   (CHAR(2))을 비워 선관위 프로그램이 지출부를 정상 로드하도록. (수입 행·공식 포맷 행은 무변경.)
    //   채번: rcp_yn='Y'인데 rcp_no가 빈 행에 조합별 영수증번호(SSOT) 부여 — 빈 RCP_NO로 export 시
    //   윈도우 프로그램이 수입지출부 영수증일련번호를 단일 버킷으로 폴백 생성하는 문제 회피.
    //   CUSTOMER 선정(참조 cust_id)에 쓰이므로 CUSTOMER insert보다 먼저 계산한다.
    const cvNameById: Record<number, string> = {};
    for (const c of codevalue as Record<string, unknown>[]) {
      cvNameById[Number(c.cv_id)] = String(c.cv_name ?? "");
    }
    const exportCodeNames = { acc: cvNameById, item: cvNameById };
    // acc_sort_num 정규순서 재부여(수입먼저) — 공식 프로그램이 acc_date→acc_sort_num으로 정렬해도
    //   수입이 지출보다 먼저 와 수입지출부 누계가 음수가 안 되게(시분초 미사용, acc_time 컬럼 없음).
    // 채번(fillExportReceiptNumbers) 후 splitOfficialReceiptNo로 공식 분리 포맷(RCP_NO=접두사,
    //   RCP_NO2=숫자)으로 변환 — 윈도우 프로그램의 RCP_NO+RCP_NO2 덧붙임 표시("자(비)-2467") 방지.
    const finalAccBook = fillExportReceiptNumbers(
      fillExportSortNumbers(
        allocateCandidateAccBookForExport(filterByExportOrgId(remapOrgId(accBook, orgIdMap)))
          .map(normalizeOfficialExpenseRow),
      ).map(stripAppOnlyAccBookColumns),
      exportCodeNames,
    ).map(splitOfficialReceiptNo);
    const finalAccBookBak = fillExportReceiptNumbers(
      fillExportSortNumbers(
        filterByExportOrgId(remapOrgId(accBookBak, orgIdMap)).map(normalizeOfficialExpenseRow),
      ).map(stripAppOnlyAccBookColumns),
      exportCodeNames,
    ).map(splitOfficialReceiptNo);

    // Customer — data1/data2 모드는 "거래(ACC_BOOK/ACC_BOOK_BAK)가 참조하는 cust_id"로 선정한다.
    //   org_id 필터는 org_id=NULL(공유)·타 org 참조 거래처를 빠뜨려 FK 고아→수입지출부 누락을
    //   유발하므로 참조 기준으로 교체. 익명(-999)은 ENSURE_ANONYMOUS로 별도 보장.
    // org_id는 PFund2 CUSTOMER DDL에 없으므로 insert 전 제거 (011 마이그레이션 대응).
    const remappedCustomer = remapOrgId(customer, orgIdMap);
    const exportCustomer =
      targetExportOrgId === null
        ? remappedCustomer
        : selectReferencedCustomers(remappedCustomer, finalAccBook, finalAccBookBak);
    const exportCustIds = new Set(exportCustomer.map((c) => Number(c.cust_id)));
    insertRows(
      db,
      "CUSTOMER",
      exportCustomer.map((c) => {
        const rest = { ...c };
        delete rest.org_id;
        return rest;
      }),
    );
    // CUSTOMER_ADDR: export된 거래처의 주소만 (CUSTOMER_ADDR_FK1 무결성). org_id 컬럼 없음.
    insertRows(
      db,
      "CUSTOMER_ADDR",
      (customerAddr as Record<string, unknown>[]).filter((a) =>
        exportCustIds.has(Number(a.cust_id)),
      ),
    );

    // PFund2 표준 익명 customer (CUST_ID=-999) 보장. 상세는 pfund2-constants.ts
    db.run(PFUND2_ENSURE_ANONYMOUS_CUSTOMER_SQL);

    // ACC_BOOK/ACC_BOOK_BAK insert — finalAccBook*는 CUSTOMER 선정을 위해 위에서 선계산함.
    //   (master → 0건, data1/data2 → 해당 export ORG_ID 거래만, full → 전체)
    insertRows(db, "ACC_BOOK", finalAccBook);
    insertRows(db, "ACC_BOOK_BAK", finalAccBookBak);

    // ACCBOOKSEND: 실제 export된 ACC_BOOK 행의 acc_book_id에 속하는 것만
    const myAccBookIds = new Set(
      finalAccBook.map((r) => Number(r.acc_book_id ?? -1)),
    );
    const filteredAccBookSend = (accBookSend as Record<string, unknown>[]).filter((r) =>
      myAccBookIds.has(Number(r.acc_book_id ?? -1)),
    );
    insertRows(db, "ACCBOOKSEND", filteredAccBookSend);

    // ESTATE/OPINION: ORGAN(ORG_ID) FK·PK 매핑 일관성 위해 data1/data2면 필터.
    insertRows(db, "ESTATE", filterByExportOrgId(remapOrgId(estate, orgIdMap)));
    insertRows(
      db,
      "OPINION",
      filterByExportOrgId(remapOrgId(syncedOpinion, orgIdMap)).map(stripAppOnlyOpinionColumns),
    );

    // SUM_REPT: PK = SUM_REPT_ID. fetch 단에서 org_id 필터 적용했지만,
    // data1/data2 모드에서는 ORGAN과 ORG_ID 매핑 정합 유지를 위해 추가 필터.
    insertRows(db, "SUM_REPT", filterByExportOrgId(remapOrgId(sumRept, orgIdMap)));

    // COL_ORGAN: PK = ORG_ID. remap 후 동일 ORG_ID 행이 여러 개면 PK 충돌 → dedup.
    const colOrganRemapped = filterByExportOrgId(remapOrgId(colOrgan, orgIdMap));
    const seenColOrganIds = new Set<number>();
    const dedupedColOrgan = colOrganRemapped.filter((r) => {
      const oid = Number((r as Record<string, unknown>).org_id ?? -1);
      if (seenColOrganIds.has(oid)) return false;
      seenColOrganIds.add(oid);
      return true;
    });
    insertRows(db, "COL_ORGAN", dedupedColOrgan);

    // ALARM: PK = (YEAR, ORG_ID, CHK_YN). 사용자 환경에서 중복 행이 발견됨.
    // remap 후 (YEAR, ORG_ID, CHK_YN) 조합 dedup으로 PK 충돌 완전 차단.
    const alarmRemapped = filterByExportOrgId(remapOrgId(alarm, orgIdMap));
    const seenAlarmKey = new Set<string>();
    const dedupedAlarm = alarmRemapped.filter((r) => {
      const row = r as Record<string, unknown>;
      const key = `${row.year ?? ""}|${row.org_id ?? ""}|${row.chk_yn ?? ""}`;
      if (seenAlarmKey.has(key)) return false;
      seenAlarmKey.add(key);
      return true;
    });
    insertRows(db, "ALARM", dedupedAlarm);

    // info: 선관위 프로그램이 이 테이블을 사용하지 않으므로 빈 상태 유지

    // Export .db binary
    const dbBinary = db.export();
    db.close();

    // mode별 파일명 — pfund2-constants.ts의 pfund2DownloadFilename 사용.
    //   restore: 보관자료 형식(타임스탬프). ts 파라미터(클라이언트 로컬시간 "YYYY-MM-DD-HH-mm-ss")가
    //   있으면 사용, 없으면 서버 시간. 프로그램 [자료 복구] 목록 표시·정렬용이라 정확 형식이 중요.
    const restoreTs = isRestoreMode ? parseRestoreTs(tsParam) : undefined;
    const filename = encodeURIComponent(
      pfund2DownloadFilename(mode, orgName, yearFilter?.year, restoreTs),
    );

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
