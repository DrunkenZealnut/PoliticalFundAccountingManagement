import { describe, it, expect } from "vitest";
import {
  PFUND2_ANONYMOUS_CUSTOMER_ID,
  PFUND2_ANONYMOUS_CUSTOMER_ROW,
  PFUND2_ENSURE_ANONYMOUS_CUSTOMER_SQL,
  PFUND2_CANDIDATE_ORG_ID,
  PFUND2_SUPPORTER_ORG_ID,
  pfund2DownloadFilename,
  pfund2RestoreFilename,
  nowRestoreTimestamp,
  type RestoreTimestamp,
} from "./pfund2-constants";

describe("PFund2 reserved 상수", () => {
  it("익명 CUST_ID = -999 (PFund2 reserved)", () => {
    expect(PFUND2_ANONYMOUS_CUSTOMER_ID).toBe(-999);
  });

  it("익명 customer 행 — CUST_ID/CUST_SEC_CD/NAME", () => {
    expect(PFUND2_ANONYMOUS_CUSTOMER_ROW).toEqual({
      CUST_ID: -999,
      CUST_SEC_CD: 63,
      NAME: "익명",
    });
  });

  it("INSERT OR IGNORE SQL — supabase에 -999 있어도 충돌 없음", () => {
    expect(PFUND2_ENSURE_ANONYMOUS_CUSTOMER_SQL).toMatch(/INSERT OR IGNORE INTO CUSTOMER/);
    expect(PFUND2_ENSURE_ANONYMOUS_CUSTOMER_SQL).toMatch(/-999/);
    expect(PFUND2_ENSURE_ANONYMOUS_CUSTOMER_SQL).toMatch(/'익명'/);
    expect(PFUND2_ENSURE_ANONYMOUS_CUSTOMER_SQL).toMatch(/\b63\b/);
  });

  it("ORG_ID 매핑 — 후보자=1, 후원회=2 (페어 export 기준)", () => {
    expect(PFUND2_CANDIDATE_ORG_ID).toBe(1);
    expect(PFUND2_SUPPORTER_ORG_ID).toBe(2);
  });
});

describe("pfund2DownloadFilename", () => {
  it("master → Fund_Master.db", () => {
    expect(pfund2DownloadFilename("master", "오준석후보")).toBe("Fund_Master.db");
  });

  it("data1 → Fund_Data_1.db (후보자)", () => {
    expect(pfund2DownloadFilename("data1", "오준석후보")).toBe("Fund_Data_1.db");
  });

  it("data2 → Fund_Data_2.db (후원회)", () => {
    expect(pfund2DownloadFilename("data2", "후원회")).toBe("Fund_Data_2.db");
  });

  it("full + year → 자체분-YYYY.db", () => {
    expect(pfund2DownloadFilename("full", "오준석후보", "2026")).toBe("오준석후보(자체분-2026).db");
  });

  it("full + year 없음 → 자체분.db", () => {
    expect(pfund2DownloadFilename("full", "오준석후보")).toBe("오준석후보(자체분).db");
  });

  it("master는 year 인자 무시 (거래 비움)", () => {
    expect(pfund2DownloadFilename("master", "오준석후보", "2026")).toBe("Fund_Master.db");
  });
});

describe("pfund2RestoreFilename (보관자료 형식)", () => {
  const ts: RestoreTimestamp = { y: 2026, mo: 6, d: 29, h: 1, mi: 40, s: 24 };

  it("프로그램 네이티브 보관자료 파일명 형식 (대괄호 안 공백·HH시MM분SS초)", () => {
    expect(pfund2RestoreFilename("동대문구라선거구구의회의원예비후보자오준석후원회", ts)).toBe(
      "정치자금【 동대문구라선거구구의회의원예비후보자오준석후원회 】보관자료_2026-06-29 01시40분24초.db",
    );
  });

  it("월·일·시·분·초 0패딩", () => {
    expect(pfund2RestoreFilename("기관", { y: 2026, mo: 1, d: 3, h: 9, mi: 5, s: 7 })).toBe(
      "정치자금【 기관 】보관자료_2026-01-03 09시05분07초.db",
    );
  });

  it("pfund2DownloadFilename('restore', ...)도 동일 형식", () => {
    expect(pfund2DownloadFilename("restore", "기관", undefined, ts)).toBe(
      "정치자금【 기관 】보관자료_2026-06-29 01시40분24초.db",
    );
  });

  it("nowRestoreTimestamp는 주어진 Date를 로컬시간으로 분해", () => {
    const d = new Date(2026, 5, 29, 1, 40, 24); // month 0-based: 5=6월
    expect(nowRestoreTimestamp(d)).toEqual({ y: 2026, mo: 6, d: 29, h: 1, mi: 40, s: 24 });
  });
});
