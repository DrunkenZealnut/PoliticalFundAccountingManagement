/**
 * ORGAN 페어 변환 (Supabase pfam ↔ 선관위 PFund2 SQLite).
 *
 * 선관위 PFund2는 한 회계 단위(.db 파일)에 후보자(ORG_ID=1) + 후원회(ORG_ID=2)를
 * 페어로 보유한다. 우리 Supabase는 사용자가 한 행만 가진 경우가 많아 export 시점에
 * 페어 보강이 필요하다.
 *
 * 사용처: export-sqlite (forward), import-sqlite (reverse).
 */

export const SUPPORTER_SEC_CDS: ReadonlySet<number> = new Set([
  91, 92, 107, 108, 109, 587, 588,
]);

export const CANDIDATE_SEC_CDS: ReadonlySet<number> = new Set([54, 90, 106]);

export interface SupabaseOrgan {
  org_id: number;
  org_sec_cd: number;
  org_name: string;
  reg_num: string;
  reg_date?: string | null;
  post?: string | null;
  addr?: string | null;
  addr_detail?: string | null;
  tel?: string | null;
  fax?: string | null;
  rep_name?: string | null;
  acct_name?: string | null;
  comm?: string | null;
  userid?: string | null;
  passwd?: string | null;
  hint1?: string | null;
  hint2?: string | null;
  org_order?: number | null;
  pre_acc_from?: string | null;
  pre_acc_to?: string | null;
  acc_from?: string | null;
  acc_to?: string | null;
  code_date?: string | null;
}

export interface ExportOrganRow {
  ORG_ID: number;
  ORG_SEC_CD: number;
  ORG_NAME: string;
  REG_NUM: string;
  REG_DATE: string | null;
  POST: string | null;
  ADDR: string | null;
  ADDR_DETAIL: string | null;
  TEL: string | null;
  FAX: string | null;
  REP_NAME: string | null;
  ACCT_NAME: string | null;
  COMM: string | null;
  USERID: string | null;
  PASSWD: string | null;
  HINT1: string | null;
  HINT2: string | null;
  ORG_ORDER: number;
  PRE_ACC_FROM: string | null;
  PRE_ACC_TO: string | null;
  ACC_FROM: string | null;
  ACC_TO: string | null;
  CODE_DATE: string | null;
}

export interface BuildOrganExportResult {
  organRows: ExportOrganRow[];
  /** Supabase org_id → export ORG_ID (1 or 2) */
  orgIdMap: Map<number, number>;
}

/**
 * Supabase organ → 선관위 export용 ORGAN 행(들) + ORG_ID 매핑.
 *
 * - 후원회면 자동으로 후보자 페어 행 생성 (ORG_ID=1 후보자, ORG_ID=2 후원회)
 * - 후보자/정당이면 단일 행 (ORG_ID=1)
 *
 * 보안: PASSWD 필드는 export 시점에 null로 마스킹된다 (클라우드 비밀번호 누출 방지).
 */
function makeOrganRow(
  src: SupabaseOrgan,
  overrides: Partial<ExportOrganRow>,
): ExportOrganRow {
  return {
    ORG_ID: 1,
    ORG_SEC_CD: src.org_sec_cd,
    ORG_NAME: src.org_name,
    REG_NUM: src.reg_num,
    REG_DATE: src.reg_date ?? null,
    POST: src.post ?? null,
    ADDR: src.addr ?? null,
    ADDR_DETAIL: src.addr_detail ?? null,
    TEL: src.tel ?? null,
    FAX: src.fax ?? null,
    REP_NAME: src.rep_name ?? null,
    ACCT_NAME: src.acct_name ?? null,
    COMM: src.comm ?? null,
    USERID: src.userid ?? null,
    PASSWD: src.passwd ?? null,
    HINT1: src.hint1 ?? null,
    HINT2: src.hint2 ?? null,
    ORG_ORDER: src.org_order ?? 1,
    PRE_ACC_FROM: src.pre_acc_from ?? null,
    PRE_ACC_TO: src.pre_acc_to ?? null,
    ACC_FROM: src.acc_from ?? null,
    ACC_TO: src.acc_to ?? null,
    CODE_DATE: src.code_date ?? null,
    ...overrides,
  };
}

export function buildOrganExport(
  supabaseOrgan: SupabaseOrgan,
  options: { maskPasswd?: boolean } = {},
): BuildOrganExportResult {
  const { maskPasswd = true } = options;
  const passwd = maskPasswd ? null : supabaseOrgan.passwd ?? null;
  const orgIdMap = new Map<number, number>();

  if (SUPPORTER_SEC_CDS.has(supabaseOrgan.org_sec_cd)) {
    const candidateName =
      supabaseOrgan.acct_name || supabaseOrgan.rep_name || "후보자";

    const candidateRow = makeOrganRow(supabaseOrgan, {
      ORG_ID: 1,
      ORG_SEC_CD: 90,
      ORG_NAME: candidateName,
      REG_NUM: "",
      POST: null,
      ADDR: null,
      ADDR_DETAIL: null,
      TEL: null,
      FAX: null,
      REP_NAME: candidateName,
      ACCT_NAME: candidateName,
      USERID: null,
      PASSWD: null,
      HINT1: null,
      HINT2: null,
      ORG_ORDER: 1,
    });

    const supporterRow = makeOrganRow(supabaseOrgan, {
      ORG_ID: 2,
      PASSWD: passwd,
      ORG_ORDER: 2,
    });

    orgIdMap.set(supabaseOrgan.org_id, 2);
    return { organRows: [candidateRow, supporterRow], orgIdMap };
  }

  const singleRow = makeOrganRow(supabaseOrgan, {
    ORG_ID: 1,
    PASSWD: passwd,
    ORG_ORDER: 1,
  });
  orgIdMap.set(supabaseOrgan.org_id, 1);
  return { organRows: [singleRow], orgIdMap };
}

/** Remap org_id field on each row using the mapping table. */
export function remapOrgId<T extends Record<string, unknown>>(
  rows: T[],
  orgIdMap: Map<number, number>,
): T[] {
  return rows.map((r) => {
    const orgId = r.org_id as number | undefined;
    if (orgId != null && orgIdMap.has(orgId)) {
      return { ...r, org_id: orgIdMap.get(orgId) };
    }
    return r;
  });
}

export interface OrganImportCandidate {
  source: "candidate" | "supporter" | "single";
  organ: Omit<SupabaseOrgan, "org_id">;
  /** 원본 .db에서의 ORG_ID (1 or 2) */
  exportOrgId: number;
}

export interface ParseOrganImportResult {
  candidates: OrganImportCandidate[];
  conflictReason?: "no_rows" | "incompatible";
}

/**
 * 선관위 .db의 ORGAN 행(들)을 import 후보 목록으로 변환.
 *
 * - 행이 0개: conflictReason="no_rows"
 * - 행이 1개: source="single"
 * - 행이 2개 이상: 각각을 candidate 또는 supporter로 분류
 *
 * import 시점에 사용자가 이 candidates 중 어떤 organ을 자신의 pfam.organ에 매핑할지
 * 선택할 수 있도록 한다.
 */
export function parseOrganImport(
  organRows: readonly ExportOrganRow[],
): ParseOrganImportResult {
  if (organRows.length === 0) {
    return { candidates: [], conflictReason: "no_rows" };
  }

  const candidates: OrganImportCandidate[] = organRows.map((row) => {
    let source: OrganImportCandidate["source"] = "single";
    if (organRows.length > 1) {
      if (SUPPORTER_SEC_CDS.has(row.ORG_SEC_CD)) source = "supporter";
      else if (CANDIDATE_SEC_CDS.has(row.ORG_SEC_CD)) source = "candidate";
      else source = "single";
    }

    return {
      source,
      exportOrgId: row.ORG_ID,
      organ: {
        org_sec_cd: row.ORG_SEC_CD,
        org_name: row.ORG_NAME,
        reg_num: row.REG_NUM,
        reg_date: row.REG_DATE,
        post: row.POST,
        addr: row.ADDR,
        addr_detail: row.ADDR_DETAIL,
        tel: row.TEL,
        fax: row.FAX,
        rep_name: row.REP_NAME,
        acct_name: row.ACCT_NAME,
        comm: row.COMM,
        userid: row.USERID,
        passwd: row.PASSWD,
        hint1: row.HINT1,
        hint2: row.HINT2,
        org_order: row.ORG_ORDER,
        pre_acc_from: row.PRE_ACC_FROM,
        pre_acc_to: row.PRE_ACC_TO,
        acc_from: row.ACC_FROM,
        acc_to: row.ACC_TO,
        code_date: row.CODE_DATE,
      },
    };
  });

  return { candidates };
}
