import { describe, it, expect, beforeEach } from "vitest";
import { useAuth } from "./auth";

const ORG = { org_id: 10, org_sec_cd: 92, org_name: "테스트 후원회" };

describe("auth store - clearOrgan", () => {
  beforeEach(() => {
    useAuth.setState({
      user: { id: "u1" } as never,
      orgId: null,
      orgSecCd: null,
      orgName: null,
      orgType: null,
      acctName: null,
      accFrom: null,
      accTo: null,
    });
  });

  it("clearOrgan은 선택 기관 정보만 초기화하고 user는 유지한다", () => {
    useAuth.getState().setOrgan(ORG);
    expect(useAuth.getState().orgId).toBe(10);
    expect(useAuth.getState().orgType).toBe("supporter");

    useAuth.getState().clearOrgan();

    const s = useAuth.getState();
    expect(s.orgId).toBeNull();
    expect(s.orgSecCd).toBeNull();
    expect(s.orgName).toBeNull();
    expect(s.orgType).toBeNull();
    expect(s.acctName).toBeNull();
    // user는 유지(로그아웃 아님)
    expect(s.user).not.toBeNull();
    expect(s.user?.id).toBe("u1");
  });

  it("clear는 user까지 모두 초기화한다(로그아웃)", () => {
    useAuth.getState().setOrgan(ORG);
    useAuth.getState().clear();

    const s = useAuth.getState();
    expect(s.user).toBeNull();
    expect(s.orgId).toBeNull();
  });
});
