import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// route.ts는 모듈 로드 시 SUPABASE_SERVICE_ROLE_KEY를 읽어 fail-fast 가드에 쓴다.
// import 이전(vi.hoisted)에 주입해야 모든 테스트가 503/500으로 떨어지지 않는다.
vi.hoisted(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost";
});

/**
 * /api/organ 테스트.
 * - service role 클라이언트(@supabase/supabase-js)와 SSR 인증(@/lib/supabase/server)을 모킹.
 * - 테이블별로 maybeSingle/limit/count(head) 결과를 state로 제어한다.
 */
const state: {
  user: { id: string } | null;
  membership: Record<string, unknown> | null;
  membershipError: unknown;
  organ: Record<string, unknown> | null;
  accRows: Array<{ incm_sec_cd: number; acc_amt: number }>;
  accError: unknown;
  storagePaths: Array<{ storage_path: string | null }>;
  filesError: unknown;
  counts: Record<string, number>;
  countError: unknown;
  removeError: unknown;
  rpcResult: unknown;
  rpcError: unknown;
  lastRpc: { name: string; params: unknown } | null;
} = {
  user: { id: "u1" },
  membership: { org_id: 10 },
  membershipError: null,
  organ: { org_name: "테스트 후원회" },
  accRows: [],
  accError: null,
  storagePaths: [],
  filesError: null,
  counts: { evidence_file: 0, estate: 0, customer: 0, backup_history: 0 },
  countError: null,
  removeError: null,
  rpcResult: { organ_deleted: 1 },
  rpcError: null,
  lastRpc: null,
};

vi.mock("@supabase/supabase-js", () => {
  function makeChain(table: string) {
    const chain: Record<string, unknown> = { _table: table, _count: false };
    chain.select = vi.fn((_cols?: string, opts?: { head?: boolean }) => {
      if (opts?.head) chain._count = true;
      return chain;
    });
    chain.eq = vi.fn(() => chain);
    chain.limit = vi.fn(() => {
      if (table === "acc_book") return Promise.resolve({ data: state.accRows, error: state.accError });
      if (table === "evidence_file")
        return Promise.resolve({ data: state.storagePaths, error: state.filesError });
      return Promise.resolve({ data: [], error: null });
    });
    chain.maybeSingle = vi.fn(() => {
      if (table === "user_organ")
        return Promise.resolve({ data: state.membership, error: state.membershipError });
      if (table === "organ") return Promise.resolve({ data: state.organ, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      const r = chain._count
        ? { count: state.counts[table] ?? 0, error: state.countError }
        : { data: [], error: null };
      return Promise.resolve(r).then(resolve, reject);
    };
    return chain;
  }

  const client = {
    from: vi.fn((table: string) => makeChain(table)),
    storage: {
      from: vi.fn(() => ({
        remove: vi.fn(() => Promise.resolve({ error: state.removeError })),
      })),
    },
    rpc: vi.fn((name: string, params: unknown) => {
      state.lastRpc = { name, params };
      return Promise.resolve({ data: state.rpcResult, error: state.rpcError });
    }),
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

import { POST } from "./route";

function req(body: Record<string, unknown>) {
  return new NextRequest("http://t/api/organ", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function reset() {
  Object.assign(state, {
    user: { id: "u1" },
    membership: { org_id: 10 },
    membershipError: null,
    organ: { org_name: "테스트 후원회" },
    accRows: [],
    accError: null,
    storagePaths: [],
    filesError: null,
    counts: { evidence_file: 0, estate: 0, customer: 0, backup_history: 0 },
    countError: null,
    removeError: null,
    rpcResult: { organ_deleted: 1 },
    rpcError: null,
    lastRpc: null,
  });
}

beforeEach(reset);

describe("POST /api/organ - 입력/인증/인가", () => {
  it("action이 잘못되면 400", async () => {
    const res = await POST(req({ action: "nope", orgId: 10 }));
    expect(res.status).toBe(400);
  });

  it("orgId가 없으면 400", async () => {
    const res = await POST(req({ action: "preview" }));
    expect(res.status).toBe(400);
  });

  it("비로그인 시 401", async () => {
    state.user = null;
    const res = await POST(req({ action: "delete", orgId: 10 }));
    expect(res.status).toBe(401);
  });

  it("해당 org 비소속이면 403", async () => {
    state.membership = null;
    const res = await POST(req({ action: "delete", orgId: 10 }));
    expect(res.status).toBe(403);
  });

  it("org이 존재하지 않으면 404", async () => {
    state.organ = null;
    const res = await POST(req({ action: "preview", orgId: 10 }));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/organ - DB 오류는 500으로 분기(0건/403/404 오인 금지)", () => {
  it("멤버십 조회 오류 시 403이 아니라 500", async () => {
    state.membershipError = { message: "db down" };
    const res = await POST(req({ action: "delete", orgId: 10 }));
    expect(res.status).toBe(500);
  });

  it("preview acc_book 조회 오류 시 500", async () => {
    state.accError = { message: "timeout" };
    const res = await POST(req({ action: "preview", orgId: 10 }));
    expect(res.status).toBe(500);
  });

  it("preview count 오류 시 500", async () => {
    state.countError = { message: "count failed" };
    const res = await POST(req({ action: "preview", orgId: 10 }));
    expect(res.status).toBe(500);
  });

  it("delete evidence_file 목록 조회 오류 시 500(파일 고아 방지)", async () => {
    state.filesError = { message: "list failed" };
    const res = await POST(req({ action: "delete", orgId: 10 }));
    expect(res.status).toBe(500);
  });
});

describe("POST /api/organ - preview", () => {
  it("수입/지출 건수·금액과 카운트를 집계한다", async () => {
    state.accRows = [
      { incm_sec_cd: 1, acc_amt: 1000 },
      { incm_sec_cd: 1, acc_amt: 2000 },
      { incm_sec_cd: 2, acc_amt: 500 },
    ];
    state.counts = { evidence_file: 4, estate: 1, customer: 7, backup_history: 0 };
    const res = await POST(req({ action: "preview", orgId: 10 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.counts.income).toBe(2);
    expect(json.counts.incomeAmt).toBe(3000);
    expect(json.counts.expense).toBe(1);
    expect(json.counts.expenseAmt).toBe(500);
    expect(json.counts.evidence).toBe(4);
    expect(json.counts.customer).toBe(7);
    expect(json.orgName).toBe("테스트 후원회");
  });
});

describe("POST /api/organ - delete", () => {
  it("Storage 파일 제거 후 RPC를 올바른 p_org_id로 호출한다", async () => {
    state.storagePaths = [{ storage_path: "10/acc/1/a.jpg" }, { storage_path: "10/unlinked/b.png" }];
    const res = await POST(req({ action: "delete", orgId: 10 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deleted).toBe(true);
    expect(json.storageRemoved).toBe(2);
    expect(json.storageFailed).toBe(0);
    expect(state.lastRpc).toEqual({ name: "delete_org_data", params: { p_org_id: 10 } });
    expect(json.result.organ_deleted).toBe(1);
  });

  it("Storage 삭제 실패해도 DB 삭제는 진행하고 storageFailed를 노출한다", async () => {
    state.storagePaths = [{ storage_path: "10/acc/1/a.jpg" }];
    state.removeError = { message: "network" };
    const res = await POST(req({ action: "delete", orgId: 10 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deleted).toBe(true);
    expect(json.storageFailed).toBe(1);
    expect(json.storageRemoved).toBe(0);
  });

  it("null storage_path는 제거 대상에서 제외한다", async () => {
    state.storagePaths = [{ storage_path: null }, { storage_path: "10/acc/1/a.jpg" }];
    const res = await POST(req({ action: "delete", orgId: 10 }));
    const json = await res.json();
    expect(json.storageRemoved).toBe(1);
  });

  it("RPC 실패 시 500", async () => {
    state.rpcError = { message: "fk violation" };
    const res = await POST(req({ action: "delete", orgId: 10 }));
    expect(res.status).toBe(500);
  });
});
