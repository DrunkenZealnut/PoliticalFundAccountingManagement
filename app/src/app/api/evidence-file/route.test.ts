import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Supabase 클라이언트 모킹.
 * 테이블 체인(from().select().eq()...)과 storage를 설정 가능한 state로 제어한다.
 * 한 요청 안에서 from()이 여러 번 호출되어도(목록/카운트/insert/delete) 각자
 * 필요한 필드만 구조분해로 가져가므로 단일 result에 여러 필드를 담아 처리한다.
 */
const state: {
  listRows: Array<Record<string, unknown>>;
  listError: unknown;
  count: number;
  insertRow: Record<string, unknown> | null;
  insertError: unknown;
  findRow: Record<string, unknown> | null;
  findError: unknown;
  deleteError: unknown;
  signedUrls: Array<{ path: string; signedUrl: string }> | null;
  removeError: unknown;
  uploadError: unknown;
  lastUpload: { path: string; opts: unknown } | null;
} = {
  listRows: [],
  listError: null,
  count: 0,
  insertRow: null,
  insertError: null,
  findRow: null,
  findError: null,
  deleteError: null,
  signedUrls: null,
  removeError: null,
  uploadError: null,
  lastUpload: null,
};

vi.mock("@supabase/supabase-js", () => {
  function makeChain() {
    const chain: Record<string, unknown> = { _mode: null };
    chain.select = vi.fn((_cols?: string, opts?: { head?: boolean }) => {
      if (opts?.head) chain._mode = "count";
      return chain;
    });
    chain.insert = vi.fn(() => {
      chain._mode = "insert";
      return chain;
    });
    chain.delete = vi.fn(() => {
      chain._mode = "delete";
      return chain;
    });
    chain.eq = vi.fn(() => chain);
    chain.order = vi.fn(() => Promise.resolve({ data: state.listRows, error: state.listError }));
    chain.single = vi.fn(() => Promise.resolve({ data: state.insertRow, error: state.insertError }));
    chain.maybeSingle = vi.fn(() => Promise.resolve({ data: state.findRow, error: state.findError }));
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      let r: unknown;
      if (chain._mode === "count") r = { count: state.count, error: null };
      else if (chain._mode === "delete") r = { error: state.deleteError };
      else r = { data: state.listRows, error: state.listError };
      return Promise.resolve(r).then(resolve, reject);
    };
    return chain;
  }

  const storageBucket = {
    createSignedUrls: vi.fn((paths: string[]) =>
      Promise.resolve({
        data: state.signedUrls ?? paths.map((p) => ({ path: p, signedUrl: `signed:${p}` })),
        error: null,
      })
    ),
    upload: vi.fn((path: string, _buf: unknown, opts: unknown) => {
      state.lastUpload = { path, opts };
      return Promise.resolve({ error: state.uploadError });
    }),
    remove: vi.fn(() => Promise.resolve({ error: state.removeError })),
  };

  const client = {
    from: vi.fn(() => makeChain()),
    storage: {
      getBucket: vi.fn(() => Promise.resolve({ data: { name: "evidence" } })),
      createBucket: vi.fn(() => Promise.resolve({})),
      from: vi.fn(() => storageBucket),
    },
  };

  return { createClient: vi.fn(() => client) };
});

import { GET, POST, DELETE } from "./route";

function reset() {
  Object.assign(state, {
    listRows: [],
    listError: null,
    count: 0,
    insertRow: null,
    insertError: null,
    findRow: null,
    findError: null,
    deleteError: null,
    signedUrls: null,
    removeError: null,
    uploadError: null,
    lastUpload: null,
  });
}

beforeEach(reset);

describe("GET /api/evidence-file", () => {
  it("accBookId 조회 시 각 행에 signed_url을 동봉한다", async () => {
    state.listRows = [{ file_id: 1, storage_path: "7/acc/10/a.jpg", file_name: "a.jpg" }];
    const res = await GET(new NextRequest("http://t/api/evidence-file?accBookId=10&orgId=7"));
    const json = await res.json();
    expect(json[0].signed_url).toBe("signed:7/acc/10/a.jpg");
  });

  it("signed URL이 없는 경로는 signed_url을 null로 방어한다", async () => {
    state.listRows = [{ file_id: 1, storage_path: "7/acc/10/a.jpg" }];
    state.signedUrls = []; // 어떤 경로도 매핑되지 않음
    const res = await GET(new NextRequest("http://t/api/evidence-file?accBookId=10&orgId=7"));
    const json = await res.json();
    expect(json[0].signed_url).toBeNull();
  });

  it("orgId 단독 조회(배지용)는 signed_url을 생성하지 않는다", async () => {
    state.listRows = [{ file_id: 1, storage_path: "7/acc/10/a.jpg" }];
    const res = await GET(new NextRequest("http://t/api/evidence-file?orgId=7"));
    const json = await res.json();
    expect(json[0].signed_url).toBeUndefined();
  });

  it("accBookId/orgId 모두 없으면 400", async () => {
    const res = await GET(new NextRequest("http://t/api/evidence-file"));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/evidence-file", () => {
  const body = (over: Record<string, unknown> = {}) => ({
    accBookId: 3,
    orgId: 7,
    fileName: "영수증.jpg",
    fileType: "image/jpeg",
    fileData: "QUJD", // "ABC"
    index: 0,
    ...over,
  });

  it("거래당 10건을 초과하면 400을 반환한다", async () => {
    state.count = 10;
    const res = await POST(
      new NextRequest("http://t/api/evidence-file", { method: "POST", body: JSON.stringify(body()) })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("10건");
  });

  it("정상 업로드 시 계층 경로로 저장하고 메타 행을 반환한다", async () => {
    state.count = 0;
    state.insertRow = { file_id: 9, acc_book_id: 3, file_name: "영수증.jpg" };
    const res = await POST(
      new NextRequest("http://t/api/evidence-file", { method: "POST", body: JSON.stringify(body({ index: 2 })) })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.file_id).toBe(9);
    // 계층 경로 스킴: {orgId}/acc/{accBookId}/{ts}_{seq}_{safe}.ext
    expect(state.lastUpload?.path).toMatch(/^7\/acc\/3\/\d+_2_/);
    expect(state.lastUpload?.path).toMatch(/\.jpg$/);
  });

  it("필수 필드 누락 시 400", async () => {
    const res = await POST(
      new NextRequest("http://t/api/evidence-file", {
        method: "POST",
        body: JSON.stringify({ orgId: 7 }),
      })
    );
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/evidence-file", () => {
  it("존재하지 않는 파일은 404", async () => {
    state.findRow = null;
    const res = await DELETE(new NextRequest("http://t/api/evidence-file?fileId=99&orgId=7", { method: "DELETE" }));
    expect(res.status).toBe(404);
  });

  it("정상 삭제 시 Storage·DB를 제거하고 storageRemoved=true", async () => {
    state.findRow = { file_id: 5, storage_path: "7/acc/1/a.jpg" };
    state.removeError = null;
    const res = await DELETE(new NextRequest("http://t/api/evidence-file?fileId=5&orgId=7", { method: "DELETE" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ deleted: true, storageRemoved: true });
  });

  it("Storage 삭제 실패해도 DB는 삭제하고 storageRemoved=false (best-effort)", async () => {
    state.findRow = { file_id: 5, storage_path: "7/acc/1/a.jpg" };
    state.removeError = { message: "storage down" };
    const res = await DELETE(new NextRequest("http://t/api/evidence-file?fileId=5&orgId=7", { method: "DELETE" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ deleted: true, storageRemoved: false });
  });

  it("fileId/orgId 누락 시 400", async () => {
    const res = await DELETE(new NextRequest("http://t/api/evidence-file", { method: "DELETE" }));
    expect(res.status).toBe(400);
  });
});
