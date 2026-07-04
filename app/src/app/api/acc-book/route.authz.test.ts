import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * /api/acc-book 인가 가드(IDOR 방어) 회귀 테스트.
 * service_role 클라이언트(@supabase/supabase-js)와 SSR 인증(@/lib/supabase/server)을 모킹.
 * 데이터 정확성이 아니라 "비로그인 401 / 비소속 403 / 소속 200" 게이트만 고정한다.
 */
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
});

const state: {
  user: { id: string } | null;
  membership: Record<string, unknown> | null;
  membershipError: unknown;
  accRows: Array<Record<string, unknown>>;
  settledOpinion: { settled_at: string | null; acc_from: string | null; acc_to: string | null } | null;
} = {
  user: { id: "u1" },
  membership: { org_id: 10 },
  membershipError: null,
  accRows: [],
  settledOpinion: null,
};

vi.mock("@supabase/supabase-js", () => {
  function makeChain(table: string): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    chain.select = vi.fn(passthrough);
    chain.eq = vi.fn(passthrough);
    chain.in = vi.fn(passthrough);
    chain.is = vi.fn(passthrough);
    chain.not = vi.fn(passthrough);
    chain.gte = vi.fn(passthrough);
    chain.lte = vi.fn(passthrough);
    chain.ilike = vi.fn(passthrough);
    chain.order = vi.fn(passthrough);
    chain.insert = vi.fn(passthrough);
    chain.update = vi.fn(passthrough);
    chain.delete = vi.fn(passthrough);
    chain.limit = vi.fn(() =>
      Promise.resolve({ data: table === "acc_book" ? state.accRows : [], error: null })
    );
    chain.single = vi.fn(() =>
      Promise.resolve({
        data: table === "customer" ? { cust_id: 99 } : { acc_book_id: 1 },
        error: null,
      })
    );
    chain.maybeSingle = vi.fn(() => {
      if (table === "user_organ")
        return Promise.resolve({ data: state.membership, error: state.membershipError });
      if (table === "organ")
        return Promise.resolve({
          data: { acc_from: "20260101", acc_to: "20261231", pre_acc_from: null },
          error: null,
        });
      if (table === "opinion")
        return Promise.resolve({ data: state.settledOpinion, error: null });
      if (table === "acc_book")
        return Promise.resolve({ data: state.accRows[0] ?? null, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    // await chain (delete org 역조회, insert/update/delete 최종)
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve({ data: table === "acc_book" ? state.accRows : [], error: null }).then(
        resolve,
        reject
      );
    return chain;
  }
  const client = {
    from: vi.fn((t: string) => makeChain(t)),
    // org_income_expense_totals(P-3): 빈 결과 → inc/exp 0 (폴백 미사용 경로 검증)
    rpc: vi.fn(() => Promise.resolve({ data: [], error: null })),
  };
  return { createClient: vi.fn(() => client) };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServer: vi.fn(() =>
    Promise.resolve({
      auth: {
        getUser: vi.fn(() => Promise.resolve({ data: { user: state.user }, error: null })),
      },
    })
  ),
}));

import { GET, POST } from "./route";

function get(qs: string) {
  return new NextRequest(`http://t/api/acc-book?${qs}`);
}
function post(body: Record<string, unknown>) {
  return new NextRequest("http://t/api/acc-book", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function reset() {
  state.user = { id: "u1" };
  state.membership = { org_id: 10 };
  state.membershipError = null;
  state.accRows = [];
  state.settledOpinion = null;
}
beforeEach(reset);

describe("GET /api/acc-book 인가", () => {
  it("비로그인 401", async () => {
    state.user = null;
    expect((await GET(get("orgId=10"))).status).toBe(401);
  });
  it("orgId 없으면 400", async () => {
    expect((await GET(get(""))).status).toBe(400);
  });
  it("해당 org 비소속 403", async () => {
    state.membership = null;
    expect((await GET(get("orgId=10"))).status).toBe(403);
  });
  it("소속이면 200", async () => {
    expect((await GET(get("orgId=10"))).status).toBe(200);
  });
});

describe("POST /api/acc-book 인가", () => {
  it("insert 비소속 403", async () => {
    state.membership = null;
    const res = await POST(post({ action: "insert", data: { org_id: 10, acc_date: "20260601" } }));
    expect(res.status).toBe(403);
  });
  it("delete 비소속 403", async () => {
    state.accRows = [{ org_id: 10 }];
    state.membership = null;
    const res = await POST(post({ action: "delete", ids: [1, 2] }));
    expect(res.status).toBe(403);
  });
  it("delete ids 없으면 400", async () => {
    const res = await POST(post({ action: "delete", ids: [] }));
    expect(res.status).toBe(400);
  });
  it("batch_insert 여러 org 혼재 400", async () => {
    const res = await POST(
      post({ action: "batch_insert", rows: [{ org_id: 10 }, { org_id: 11 }] })
    );
    expect(res.status).toBe(400);
  });
  it("unknown action 400", async () => {
    const res = await POST(post({ action: "nope" }));
    expect(res.status).toBe(400);
  });

  it("batch_insert 정상(단일 org, provider 없음) — 청크 배열 insert 로 success 카운트", async () => {
    const res = await POST(
      post({
        action: "batch_insert",
        rows: [
          { org_id: 10, acc_date: "20260601", acc_sec_cd: 82, item_sec_cd: 86, incm_sec_cd: 2, acc_amt: 1000 },
          { org_id: 10, acc_date: "20260602", acc_sec_cd: 82, item_sec_cd: 86, incm_sec_cd: 2, acc_amt: 2000 },
        ],
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(2); // 2행 청크 배열 insert 성공
    expect(json.failed).toBe(0);
  });
  it("비로그인 insert 401", async () => {
    state.user = null;
    const res = await POST(post({ action: "insert", data: { org_id: 10 } }));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/acc-book 결산확정 경고(SETTLED_PERIOD, BX7)", () => {
  const settled = { settled_at: "2026-01-01T00:00:00Z", acc_from: "20260101", acc_to: "20261231" };

  it("확정 기간 내 insert 는 SETTLED_PERIOD 400", async () => {
    state.settledOpinion = settled;
    const res = await POST(
      post({ action: "insert", data: { org_id: 10, acc_date: "20260601", cust_id: 5 } })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("SETTLED_PERIOD");
  });

  it("_allowSettled override 시 통과(400 아님)", async () => {
    state.settledOpinion = settled;
    const res = await POST(
      post({ action: "insert", data: { org_id: 10, acc_date: "20260601", cust_id: 5, _allowSettled: true } })
    );
    expect(res.status).not.toBe(400);
  });

  it("확정 기간 밖 거래일은 경고 없음", async () => {
    state.settledOpinion = { settled_at: "2026-01-01T00:00:00Z", acc_from: "20260101", acc_to: "20260331" };
    const res = await POST(
      post({ action: "insert", data: { org_id: 10, acc_date: "20260601", cust_id: 5 } })
    );
    expect(res.status).not.toBe(400); // 6월은 확정기간(1~3월) 밖
  });

  it("미확정(settled_at null) org 는 경고 없음", async () => {
    state.settledOpinion = { settled_at: null, acc_from: "20260101", acc_to: "20261231" };
    const res = await POST(
      post({ action: "insert", data: { org_id: 10, acc_date: "20260601", cust_id: 5 } })
    );
    expect(res.status).not.toBe(400);
  });
});
