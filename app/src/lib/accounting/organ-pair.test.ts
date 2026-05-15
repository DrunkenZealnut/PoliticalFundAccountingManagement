import { describe, it, expect } from "vitest";
import {
  buildOrganExport,
  parseOrganImport,
  remapOrgId,
  SUPPORTER_SEC_CDS,
  CANDIDATE_SEC_CDS,
  type SupabaseOrgan,
  type ExportOrganRow,
} from "./organ-pair";

const baseSupporter: SupabaseOrgan = {
  org_id: 11,
  org_sec_cd: 109,
  org_name: "동대문구라선거구구의회의원후보자오준석후원회",
  reg_num: "2348261566",
  reg_date: "20220420",
  post: "02580",
  addr: "서울특별시 동대문구",
  addr_detail: "왕산로 100",
  tel: "02-1234-5678",
  fax: null,
  rep_name: "양진성",
  acct_name: "신하섭",
  comm: null,
  userid: null,
  passwd: "secret-cloud-only",
  hint1: null,
  hint2: null,
  org_order: 1,
  pre_acc_from: null,
  pre_acc_to: null,
  acc_from: "20220420",
  acc_to: "20220621",
  code_date: null,
};

const baseCandidate: SupabaseOrgan = {
  ...baseSupporter,
  org_id: 5,
  org_sec_cd: 90,
  org_name: "오준석후보",
  reg_num: "19850228",
  rep_name: "곽호준",
  acct_name: "오준석",
};

describe("buildOrganExport - 후원회(109)", () => {
  it("후보자 페어 + 후원회 = 2행 반환", () => {
    const { organRows } = buildOrganExport(baseSupporter);
    expect(organRows).toHaveLength(2);
    expect(organRows[0].ORG_ID).toBe(1);
    expect(organRows[0].ORG_SEC_CD).toBe(90); // 후보자
    expect(organRows[1].ORG_ID).toBe(2);
    expect(organRows[1].ORG_SEC_CD).toBe(109); // 후원회
  });

  it("orgIdMap: Supabase org_id → 2 (후원회 자신)", () => {
    const { orgIdMap } = buildOrganExport(baseSupporter);
    expect(orgIdMap.get(11)).toBe(2);
  });

  it("후보자 행은 acct_name을 ORG_NAME으로 사용", () => {
    const { organRows } = buildOrganExport(baseSupporter);
    expect(organRows[0].ORG_NAME).toBe("신하섭"); // acct_name
  });

  it("acct_name 없으면 rep_name fallback", () => {
    const supporter = { ...baseSupporter, acct_name: null };
    const { organRows } = buildOrganExport(supporter);
    expect(organRows[0].ORG_NAME).toBe("양진성"); // rep_name
  });

  it("acct_name, rep_name 모두 없으면 '후보자' 기본값", () => {
    const supporter = { ...baseSupporter, acct_name: null, rep_name: null };
    const { organRows } = buildOrganExport(supporter);
    expect(organRows[0].ORG_NAME).toBe("후보자");
  });

  it("PASSWD는 기본적으로 null 마스킹", () => {
    const { organRows } = buildOrganExport(baseSupporter);
    expect(organRows[1].PASSWD).toBeNull();
  });

  it("maskPasswd=false면 PASSWD 보존", () => {
    const { organRows } = buildOrganExport(baseSupporter, { maskPasswd: false });
    expect(organRows[1].PASSWD).toBe("secret-cloud-only");
  });
});

describe("buildOrganExport - 후보자(90)", () => {
  it("단일 행, ORG_ID=1", () => {
    const { organRows, orgIdMap } = buildOrganExport(baseCandidate);
    expect(organRows).toHaveLength(1);
    expect(organRows[0].ORG_ID).toBe(1);
    expect(organRows[0].ORG_SEC_CD).toBe(90);
    expect(orgIdMap.get(5)).toBe(1);
  });
});

describe("buildOrganExport - 정당(50)", () => {
  it("단일 행, ORG_ID=1", () => {
    const party: SupabaseOrgan = { ...baseCandidate, org_sec_cd: 50, org_name: "정당" };
    const { organRows } = buildOrganExport(party);
    expect(organRows).toHaveLength(1);
    expect(organRows[0].ORG_SEC_CD).toBe(50);
  });
});

describe("remapOrgId", () => {
  it("org_id 필드를 매핑에 따라 치환", () => {
    const rows = [
      { org_id: 11, content: "a" },
      { org_id: 11, content: "b" },
      { org_id: 99, content: "c" }, // 매핑에 없음
    ];
    const map = new Map([[11, 2]]);
    const result = remapOrgId(rows, map);
    expect(result[0].org_id).toBe(2);
    expect(result[1].org_id).toBe(2);
    expect(result[2].org_id).toBe(99); // 미매핑은 그대로
  });

  it("원본 배열은 mutate되지 않음", () => {
    const rows = [{ org_id: 11, content: "x" }];
    const map = new Map([[11, 2]]);
    remapOrgId(rows, map);
    expect(rows[0].org_id).toBe(11);
  });
});

describe("parseOrganImport", () => {
  function makeExportRow(overrides: Partial<ExportOrganRow>): ExportOrganRow {
    return {
      ORG_ID: 1,
      ORG_SEC_CD: 90,
      ORG_NAME: "X",
      REG_NUM: "",
      REG_DATE: null,
      POST: null,
      ADDR: null,
      ADDR_DETAIL: null,
      TEL: null,
      FAX: null,
      REP_NAME: null,
      ACCT_NAME: null,
      COMM: null,
      USERID: null,
      PASSWD: null,
      HINT1: null,
      HINT2: null,
      ORG_ORDER: 1,
      PRE_ACC_FROM: null,
      PRE_ACC_TO: null,
      ACC_FROM: null,
      ACC_TO: null,
      CODE_DATE: null,
      ...overrides,
    };
  }

  it("빈 배열 → conflictReason=no_rows", () => {
    const result = parseOrganImport([]);
    expect(result.candidates).toEqual([]);
    expect(result.conflictReason).toBe("no_rows");
  });

  it("단일 행 → source='single'", () => {
    const result = parseOrganImport([makeExportRow({ ORG_SEC_CD: 90 })]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].source).toBe("single");
    expect(result.candidates[0].exportOrgId).toBe(1);
  });

  it("페어 (후보자 + 후원회) → 각각 candidate/supporter로 분류", () => {
    const result = parseOrganImport([
      makeExportRow({ ORG_ID: 1, ORG_SEC_CD: 90, ORG_NAME: "오준석후보" }),
      makeExportRow({ ORG_ID: 2, ORG_SEC_CD: 109, ORG_NAME: "오준석후보후원회" }),
    ]);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0].source).toBe("candidate");
    expect(result.candidates[1].source).toBe("supporter");
  });

  it("organ 데이터가 ExportOrganRow에서 정확히 복사됨", () => {
    const result = parseOrganImport([
      makeExportRow({
        ORG_SEC_CD: 90,
        ORG_NAME: "테스트후보",
        REG_NUM: "12345",
        ADDR: "서울",
        PASSWD: "should-be-preserved",
      }),
    ]);
    expect(result.candidates[0].organ.org_sec_cd).toBe(90);
    expect(result.candidates[0].organ.org_name).toBe("테스트후보");
    expect(result.candidates[0].organ.reg_num).toBe("12345");
    expect(result.candidates[0].organ.addr).toBe("서울");
    expect(result.candidates[0].organ.passwd).toBe("should-be-preserved");
  });
});

describe("상수 sanity check", () => {
  it("SUPPORTER_SEC_CDS는 109(시구의원후원회) 포함", () => {
    expect(SUPPORTER_SEC_CDS.has(109)).toBe(true);
  });
  it("CANDIDATE_SEC_CDS는 90((예비)후보자) 포함", () => {
    expect(CANDIDATE_SEC_CDS.has(90)).toBe(true);
  });
  it("90은 후원회가 아님", () => {
    expect(SUPPORTER_SEC_CDS.has(90)).toBe(false);
  });
});
