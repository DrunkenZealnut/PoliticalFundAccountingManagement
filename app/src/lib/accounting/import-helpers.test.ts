import { describe, it, expect } from "vitest";
import {
  parseConflictPolicy,
  VALID_POLICIES,
  bulkInsert,
  bulkUpsert,
  type BulkClient,
} from "./import-helpers";
import { ParityError } from "./parity-errors";

// ──────────────────────────────────────────────────────────────
// 테스트용 가짜 Supabase 클라이언트
//   - insertResult/upsertResult로 호출별 에러를 프로그래밍
//   - 모든 호출(table, values)을 기록해 검증
// ──────────────────────────────────────────────────────────────
function makeClient(opts: {
  // (table, values) → error(없으면 null). values가 배열이면 청크, 객체면 행단위 폴백.
  onInsert?: (table: string, values: unknown) => unknown;
  onUpsert?: (table: string, values: unknown, onConflict?: string) => unknown;
} = {}) {
  const calls: { op: "insert" | "upsert"; table: string; values: unknown; onConflict?: string }[] = [];
  const client: BulkClient = {
    from(table: string) {
      return {
        insert(values: unknown) {
          calls.push({ op: "insert", table, values });
          return Promise.resolve({ error: opts.onInsert?.(table, values) ?? null });
        },
        upsert(values: unknown, options?: { onConflict?: string }) {
          calls.push({ op: "upsert", table, values, onConflict: options?.onConflict });
          return Promise.resolve({ error: opts.onUpsert?.(table, values, options?.onConflict) ?? null });
        },
      };
    },
  };
  return { client, calls };
}

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }));

describe("parseConflictPolicy", () => {
  it("null/빈값은 기본 overwrite", () => {
    expect(parseConflictPolicy(null)).toBe("overwrite");
    expect(parseConflictPolicy("")).toBe("overwrite");
  });

  it("허용된 값은 그대로 통과", () => {
    for (const p of VALID_POLICIES) {
      expect(parseConflictPolicy(p)).toBe(p);
    }
  });

  it("허용되지 않은 값은 ParityError를 던진다", () => {
    expect(() => parseConflictPolicy("delete-all")).toThrow(ParityError);
  });
});

describe("bulkInsert", () => {
  it("빈 배열은 호출 없이 {0,0}", async () => {
    const { client, calls } = makeClient();
    expect(await bulkInsert(client, "customer", [])).toEqual({ imported: 0, skipped: 0 });
    expect(calls).toHaveLength(0);
  });

  it("성공 시 전체 imported, 청크는 100행 단위로 분할", async () => {
    const { client, calls } = makeClient();
    const r = await bulkInsert(client, "acc_book", rows(250));
    expect(r).toEqual({ imported: 250, skipped: 0 });
    // 100 + 100 + 50 → 청크 insert 3회 (행단위 폴백 없음)
    expect(calls.filter((c) => Array.isArray(c.values))).toHaveLength(3);
    expect(calls.every((c) => c.table === "acc_book")).toBe(true);
  });

  it("청크 실패 시 행 단위 폴백으로 부분 성공/스킵 집계", async () => {
    // 첫 청크(배열)는 실패시키고, 폴백 행 중 id가 짝수만 실패
    const { client, calls } = makeClient({
      onInsert: (_t, values) => {
        if (Array.isArray(values)) return { message: "batch failed" };
        const id = (values as { id: number }).id;
        return id % 2 === 0 ? { message: "row failed" } : null;
      },
    });
    const r = await bulkInsert(client, "customer", rows(10));
    // 0~9 중 홀수 5개 성공, 짝수 5개 스킵
    expect(r).toEqual({ imported: 5, skipped: 5 });
    // 배열 1회 + 행단위 10회
    expect(calls.filter((c) => Array.isArray(c.values))).toHaveLength(1);
    expect(calls.filter((c) => !Array.isArray(c.values))).toHaveLength(10);
  });
});

describe("bulkUpsert", () => {
  it("onConflict가 모든 호출에 전달된다", async () => {
    const { client, calls } = makeClient();
    const r = await bulkUpsert(client, "codeset", rows(3), "cs_id");
    expect(r).toEqual({ imported: 3, skipped: 0 });
    expect(calls.every((c) => c.op === "upsert" && c.onConflict === "cs_id")).toBe(true);
  });

  it("청크 실패 시 행 단위 폴백 (onConflict 유지)", async () => {
    const { client, calls } = makeClient({
      onUpsert: (_t, values) => (Array.isArray(values) ? { message: "fail" } : null),
    });
    const r = await bulkUpsert(client, "opinion", rows(2), "org_id");
    expect(r).toEqual({ imported: 2, skipped: 0 });
    // 폴백 행단위 호출도 onConflict 유지
    expect(calls.filter((c) => !Array.isArray(c.values)).every((c) => c.onConflict === "org_id")).toBe(true);
  });
});
