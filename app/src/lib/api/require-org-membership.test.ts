import { describe, it, expect, beforeEach, vi } from "vitest";
import { requireOrgMembership, type MembershipQueryClient } from "./require-org-membership";

/**
 * requireOrgMembership 공통 가드 유닛 테스트.
 * createSupabaseServer(SSR 인증)를 모킹하고, service_role 클라이언트는
 * user_organ 조회 체인만 갖는 fake로 주입한다.
 */
const state: {
  user: { id: string } | null;
  membership: Record<string, unknown> | null;
  membershipError: unknown;
} = {
  user: { id: "u1" },
  membership: { org_id: 10 },
  membershipError: null,
};

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServer: vi.fn(() =>
    Promise.resolve({
      auth: {
        getUser: vi.fn(() => Promise.resolve({ data: { user: state.user }, error: null })),
      },
    })
  ),
}));

function fakeClient(): MembershipQueryClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({ data: state.membership, error: state.membershipError }),
          }),
        }),
      }),
    }),
  };
}

function reset() {
  state.user = { id: "u1" };
  state.membership = { org_id: 10 };
  state.membershipError = null;
}
beforeEach(reset);

describe("requireOrgMembership", () => {
  it("정상 소속이면 ok=true + userId/orgId 반환", async () => {
    const r = await requireOrgMembership(10, fakeClient());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.userId).toBe("u1");
      expect(r.orgId).toBe(10);
    }
  });

  it("orgId가 문자열이어도 정수로 정규화한다", async () => {
    const r = await requireOrgMembership("10", fakeClient());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.orgId).toBe(10);
  });

  it.each([[undefined], [null], ["abc"], [0], [-5], [1.5]])(
    "유효하지 않은 orgId(%s)는 400",
    async (bad) => {
      const r = await requireOrgMembership(bad, fakeClient());
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.response.status).toBe(400);
    }
  );

  it("비로그인 시 401", async () => {
    state.user = null;
    const r = await requireOrgMembership(10, fakeClient());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(401);
  });

  it("해당 org 비소속이면 403", async () => {
    state.membership = null;
    const r = await requireOrgMembership(10, fakeClient());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(403);
  });

  it("멤버십 조회 오류는 403이 아니라 500", async () => {
    state.membershipError = { message: "db down" };
    const r = await requireOrgMembership(10, fakeClient());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(500);
  });

  it("orgId 검증이 인증보다 먼저 — 비로그인이어도 잘못된 orgId면 400", async () => {
    state.user = null;
    const r = await requireOrgMembership(0, fakeClient());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(400);
  });
});
