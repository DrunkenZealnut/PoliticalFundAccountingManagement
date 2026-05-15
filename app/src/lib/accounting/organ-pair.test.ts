import { describe, it, expect } from "vitest";
import {
  buildOrganExport,
  parseOrganImport,
  remapOrgId,
  deriveCandidateNameFromSupporter,
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

  it("후보자 행은 후원회 정식명에서 후보자명을 유도 (acct_name보다 우선)", () => {
    // baseSupporter.org_name = "...후보자오준석후원회"
    // acct_name "신하섭"은 후원회 회계책임자라 후보자명으로 부적합 → derive가 우선
    const { organRows } = buildOrganExport(baseSupporter);
    expect(organRows[0].ORG_NAME).toBe("오준석후보");
  });

  it("후원회명 유도 실패 시 acct_name fallback", () => {
    const supporter = {
      ...baseSupporter,
      org_name: "이상한이름", // 유도 패턴 매칭 실패
    };
    const { organRows } = buildOrganExport(supporter);
    expect(organRows[0].ORG_NAME).toBe("신하섭"); // acct_name fallback
  });

  it("후원회명 유도 실패 + acct_name 없으면 rep_name fallback", () => {
    const supporter = {
      ...baseSupporter,
      org_name: "이상한이름",
      acct_name: null,
    };
    const { organRows } = buildOrganExport(supporter);
    expect(organRows[0].ORG_NAME).toBe("양진성"); // rep_name fallback
  });

  it("모든 fallback 실패 시 '후보자' 기본값", () => {
    const supporter = {
      ...baseSupporter,
      acct_name: null,
      rep_name: null,
      org_name: "이상한이름",
    };
    const { organRows } = buildOrganExport(supporter);
    expect(organRows[0].ORG_NAME).toBe("후보자");
  });

  it("acct_name이 공백 1자(' ')라도 derive가 우선", () => {
    const supporter = { ...baseSupporter, acct_name: " ", rep_name: null };
    const { organRows } = buildOrganExport(supporter);
    expect(organRows[0].ORG_NAME).toBe("오준석후보"); // derive
  });

  it("PASSWD는 기본적으로 null 마스킹", () => {
    const { organRows } = buildOrganExport(baseSupporter);
    expect(organRows[1].PASSWD).toBeNull();
  });

  it("maskPasswd=false면 PASSWD 보존", () => {
    const { organRows } = buildOrganExport(baseSupporter, { maskPasswd: false });
    expect(organRows[1].PASSWD).toBe("secret-cloud-only");
  });

  describe("candidate_* 컬럼 (010 마이그레이션 — PFund2 호환)", () => {
    const baseWithCandidate: SupabaseOrgan = {
      ...baseSupporter,
      candidate_org_name: "오준석후보",
      candidate_reg_num: "19850228",
      candidate_reg_date: "20220428",
      candidate_post: "02441",
      candidate_addr: "서울특별시 동대문구 휘경로 14 (이문동)",
      candidate_addr_detail: "2층",
      candidate_tel: "0260811700",
      candidate_rep_name: "곽호준",
      candidate_acct_name: "오준석",
      candidate_userid: "ohjunsuk",
      candidate_passwd: "0427",
      candidate_hint1: "427선언",
      candidate_hint2: "0427",
    };

    it("candidate_* 값이 후보자 행에 그대로 반영됨", () => {
      const { organRows } = buildOrganExport(baseWithCandidate, {
        maskPasswd: false,
      });
      const cand = organRows[0];
      expect(cand.ORG_ID).toBe(1);
      expect(cand.ORG_NAME).toBe("오준석후보");
      expect(cand.REG_NUM).toBe("19850228");
      expect(cand.REG_DATE).toBe("20220428");
      expect(cand.POST).toBe("02441");
      expect(cand.ADDR).toBe("서울특별시 동대문구 휘경로 14 (이문동)");
      expect(cand.ADDR_DETAIL).toBe("2층");
      expect(cand.TEL).toBe("0260811700");
      expect(cand.REP_NAME).toBe("곽호준");
      expect(cand.ACCT_NAME).toBe("오준석");
      expect(cand.USERID).toBe("ohjunsuk");
      expect(cand.PASSWD).toBe("0427");
      expect(cand.HINT1).toBe("427선언");
      expect(cand.HINT2).toBe("0427");
    });

    it("candidate_org_name이 derive 결과보다 우선", () => {
      // derive("...오준석후원회") = "오준석후보". 그러나 명시값이 있으면 그게 우선.
      const supporter: SupabaseOrgan = {
        ...baseSupporter,
        candidate_org_name: "곽호준후보", // 명시값 (다름)
      };
      const { organRows } = buildOrganExport(supporter);
      expect(organRows[0].ORG_NAME).toBe("곽호준후보");
    });

    it("후원회 행은 candidate_*에 영향받지 않음", () => {
      const { organRows } = buildOrganExport(baseWithCandidate, {
        maskPasswd: false,
      });
      const sup = organRows[1];
      expect(sup.ORG_ID).toBe(2);
      expect(sup.ORG_NAME).toBe("동대문구라선거구구의회의원후보자오준석후원회");
      expect(sup.USERID).toBe(baseSupporter.userid ?? null);
    });

    it("candidate_userid는 organ.userid보다 우선, candidateCredentials보다는 후순위", () => {
      const supporter: SupabaseOrgan = {
        ...baseSupporter,
        userid: "supporter_id",
        candidate_userid: "saved_cand_id",
      };
      // candidateCredentials 없음 → candidate_userid 사용
      const { organRows: a } = buildOrganExport(supporter, {
        maskPasswd: false,
      });
      expect(a[0].USERID).toBe("saved_cand_id");

      // candidateCredentials 명시 → override
      const { organRows: b } = buildOrganExport(supporter, {
        maskPasswd: false,
        candidateCredentials: { userid: "session_cand_id", passwd: "p" },
      });
      expect(b[0].USERID).toBe("session_cand_id");
    });

    it("candidate_passwd는 maskPasswd=true면 null 마스킹", () => {
      const { organRows } = buildOrganExport(baseWithCandidate);
      expect(organRows[0].PASSWD).toBeNull();
    });
  });

  describe("candidateCredentials 옵션 (FR-05/FR-06)", () => {
    it("FR-05: candidateCredentials 명시 시 후보자 행 USERID/PASSWD에 적용", () => {
      const supporter: SupabaseOrgan = { ...baseSupporter, userid: "supporter_id" };
      const { organRows } = buildOrganExport(supporter, {
        maskPasswd: false,
        candidateCredentials: { userid: "cand_id", passwd: "cand_pw" },
      });
      expect(organRows[0].USERID).toBe("cand_id");
      expect(organRows[0].PASSWD).toBe("cand_pw");
      // 후원회 행은 supporter 자격증명 유지
      expect(organRows[1].USERID).toBe("supporter_id");
      expect(organRows[1].PASSWD).toBe("secret-cloud-only");
    });

    it("FR-06 fallback: candidateCredentials 미지정 시 후보자 행은 후원회 자격증명 복제", () => {
      const supporter: SupabaseOrgan = {
        ...baseSupporter,
        userid: "shared_id",
        passwd: "shared_pw",
      };
      const { organRows } = buildOrganExport(supporter, { maskPasswd: false });
      expect(organRows[0].USERID).toBe("shared_id");
      expect(organRows[0].PASSWD).toBe("shared_pw");
      expect(organRows[1].USERID).toBe("shared_id");
      expect(organRows[1].PASSWD).toBe("shared_pw");
    });

    it("maskPasswd=true(기본)면 candidateCredentials.passwd가 있어도 후보자 PASSWD 마스킹", () => {
      const { organRows } = buildOrganExport(baseSupporter, {
        candidateCredentials: { userid: "cand_id", passwd: "cand_pw" },
      });
      expect(organRows[0].USERID).toBe("cand_id"); // userid는 보존
      expect(organRows[0].PASSWD).toBeNull(); // passwd는 마스킹
      expect(organRows[1].PASSWD).toBeNull();
    });

    it("정당(후원회 아님)에서는 candidateCredentials가 무시됨 (단일 행)", () => {
      const party: SupabaseOrgan = { ...baseCandidate, org_sec_cd: 50, org_name: "정당" };
      const { organRows } = buildOrganExport(party, {
        maskPasswd: false,
        candidateCredentials: { userid: "x", passwd: "y" },
      });
      expect(organRows).toHaveLength(1);
      // 정당 row의 USERID는 party.userid (null), 무시된 x는 반영 안 됨
      expect(organRows[0].USERID).toBeNull();
    });
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

describe("deriveCandidateNameFromSupporter", () => {
  it("표준 패턴 — '후보자{이름}후원회' → '{이름}후보'", () => {
    expect(
      deriveCandidateNameFromSupporter(
        "동대문구라선거구구의회의원후보자오준석후원회",
      ),
    ).toBe("오준석후보");
  });

  it("대통령 케이스도 매칭", () => {
    expect(
      deriveCandidateNameFromSupporter("대통령선거후보자홍길동후원회"),
    ).toBe("홍길동후보");
  });

  it("매칭 패턴 없으면 null", () => {
    expect(deriveCandidateNameFromSupporter("그냥기관명")).toBeNull();
    expect(deriveCandidateNameFromSupporter("후보자후원회")).toBeNull(); // 이름 부분 비어 있음
  });

  it("null/undefined/빈 입력 → null", () => {
    expect(deriveCandidateNameFromSupporter(null)).toBeNull();
    expect(deriveCandidateNameFromSupporter(undefined)).toBeNull();
    expect(deriveCandidateNameFromSupporter("")).toBeNull();
  });

  it("내부 이름이 공백이면 null (truthy로 통과 안 됨)", () => {
    expect(
      deriveCandidateNameFromSupporter("선거구구의회의원후보자   후원회"),
    ).toBeNull();
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
