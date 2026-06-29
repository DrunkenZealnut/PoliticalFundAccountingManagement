import { describe, it, expect } from "vitest";
import { matchProgramOrgId, type MasterOrganRow } from "./organ-match";

const masters: MasterOrganRow[] = [
  { ORG_ID: 1, ORG_SEC_CD: 90, ORG_NAME: "오준석", REG_NUM: "19850228", USERID: "ohjunsuk" },
  {
    ORG_ID: 3,
    ORG_SEC_CD: 596,
    ORG_NAME: "동대문구라선거구구의회의원예비후보자오준석후원회",
    REG_NUM: "220-82-80735",
    USERID: "oh2026",
  },
  { ORG_ID: 5, ORG_SEC_CD: 90, ORG_NAME: "다른후보", REG_NUM: "1112223333", USERID: "other" },
];

describe("matchProgramOrgId", () => {
  it("USERID 정확 일치 → 그 ORG_ID (1순위)", () => {
    const r = matchProgramOrgId(masters, { userid: "oh2026" });
    expect(r).toEqual({ orgId: 3, reason: "userid" });
  });

  it("USERID 대소문자/공백 무시", () => {
    const r = matchProgramOrgId(masters, { userid: "  OH2026 " });
    expect(r.orgId).toBe(3);
    expect(r.reason).toBe("userid");
  });

  it("USERID 없으면 REG_NUM(하이픈 무시)으로 매칭", () => {
    const r = matchProgramOrgId(masters, { reg_num: "2208280735" });
    expect(r).toEqual({ orgId: 3, reason: "reg_num" });
  });

  it("USERID·REG_NUM 없으면 기관명(공백 무시)으로 매칭", () => {
    const r = matchProgramOrgId(masters, {
      org_name: "동대문구라선거구구의회의원예비후보자오준석후원회",
    });
    expect(r).toEqual({ orgId: 3, reason: "name" });
  });

  it("매칭 없음 → none", () => {
    const r = matchProgramOrgId(masters, { userid: "nobody", reg_num: "000", org_name: "없음" });
    expect(r).toEqual({ orgId: null, reason: "none" });
  });

  it("동일 USERID 2건+ → ambiguous(후보 반환)", () => {
    const dup: MasterOrganRow[] = [
      { ORG_ID: 2, USERID: "dup" },
      { ORG_ID: 4, USERID: "dup" },
    ];
    const r = matchProgramOrgId(dup, { userid: "dup" });
    expect(r.orgId).toBeNull();
    expect(r.reason).toBe("ambiguous");
    expect(r.candidates).toHaveLength(2);
  });

  it("USERID는 빈 target이면 건너뛰고 REG_NUM으로", () => {
    const r = matchProgramOrgId(masters, { userid: "", reg_num: "19850228" });
    expect(r).toEqual({ orgId: 1, reason: "reg_num" });
  });

  it("빈 target 전부 → none (빈 문자열이 빈 USERID와 오매칭 안 함)", () => {
    const withEmpty: MasterOrganRow[] = [{ ORG_ID: 9, USERID: "", REG_NUM: "", ORG_NAME: "" }];
    const r = matchProgramOrgId(withEmpty, { userid: "", reg_num: "", org_name: "" });
    expect(r.reason).toBe("none");
  });
});
