/**
 * import-sqlite (자료 복구) 경로의 쓰기 헬퍼 + 충돌정책 파서.
 *
 * route.ts에서 분리해 단위테스트 가능하게 한 모듈.
 * - parseConflictPolicy: 사용자 입력(conflictPolicy)을 검증/정규화
 * - bulkInsert / bulkUpsert: 청크 단위 insert/upsert + 실패 시 행 단위 폴백 + 성공/스킵 집계
 *
 * Supabase 클라이언트는 호출자가 주입(BulkClient)한다 — 네트워크 의존 없이 테스트 가능.
 */
import { ParityErrors } from "@/lib/accounting/parity-errors";

export type ConflictPolicy = "overwrite" | "skip" | "merge";

export const VALID_POLICIES: ReadonlySet<ConflictPolicy> = new Set([
  "overwrite",
  "skip",
  "merge",
]);

/**
 * 충돌정책 문자열을 검증한다. 미지정(null/빈값)은 기본 "overwrite".
 * 허용되지 않은 값이면 ParityError(conflictPolicyRequired)를 던진다.
 */
export function parseConflictPolicy(raw: string | null): ConflictPolicy {
  if (!raw) return "overwrite";
  if (VALID_POLICIES.has(raw as ConflictPolicy)) return raw as ConflictPolicy;
  throw ParityErrors.conflictPolicyRequired({
    provided: raw,
    allowed: Array.from(VALID_POLICIES),
  });
}

/**
 * bulkInsert/bulkUpsert가 사용하는 Supabase 클라이언트의 최소 구조 타입.
 * 메서드 문법(bivariant) + PromiseLike로 실제 supabase-js 클라이언트와 호환.
 */
export interface BulkClient {
  from(table: string): {
    insert(values: unknown): PromiseLike<{ error: unknown }>;
    upsert(
      values: unknown,
      options?: { onConflict?: string },
    ): PromiseLike<{ error: unknown }>;
  };
}

const CHUNK = 100;

/**
 * 청크(100행) 단위로 insert. 청크 실패 시 행 단위로 재시도해 부분 성공을 살린다.
 */
export async function bulkInsert(
  client: BulkClient,
  table: string,
  rows: Record<string, unknown>[],
): Promise<{ imported: number; skipped: number }> {
  if (rows.length === 0) return { imported: 0, skipped: 0 };

  let imported = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await client.from(table).insert(chunk);

    if (error) {
      // 배치 실패 — 행 단위로 재시도해 부분 성공 확보
      for (const row of chunk) {
        const { error: rowErr } = await client.from(table).insert(row);
        if (rowErr) skipped++;
        else imported++;
      }
    } else {
      imported += chunk.length;
    }
  }

  return { imported, skipped };
}

/**
 * 자연키(GENERATED ALWAYS가 아닌 PK)를 가진 테이블용 청크 upsert.
 */
export async function bulkUpsert(
  client: BulkClient,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
): Promise<{ imported: number; skipped: number }> {
  if (rows.length === 0) return { imported: 0, skipped: 0 };

  let imported = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await client.from(table).upsert(chunk, { onConflict });

    if (error) {
      for (const row of chunk) {
        const { error: rowErr } = await client.from(table).upsert(row, { onConflict });
        if (rowErr) skipped++;
        else imported++;
      }
    } else {
      imported += chunk.length;
    }
  }

  return { imported, skipped };
}
