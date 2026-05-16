import { describe, it, expect } from "vitest";
import {
  PFUND2_ANONYMOUS_CUSTOMER_ID,
  PFUND2_ANONYMOUS_CUSTOMER_ROW,
  PFUND2_ENSURE_ANONYMOUS_CUSTOMER_SQL,
  PFUND2_CANDIDATE_ORG_ID,
  PFUND2_SUPPORTER_ORG_ID,
  pfund2DownloadFilename,
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
