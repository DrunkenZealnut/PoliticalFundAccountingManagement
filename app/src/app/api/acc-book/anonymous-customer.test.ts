import { describe, it, expect } from "vitest";
import {
  ANONYMOUS_CUST_ID_SENTINEL,
  needsAnonymousResolve,
  resolveAnonymousCustId,
  type AnonymousCustomerClient,
} from "./anonymous-customer";

/**
 * 수입/지출 신규 저장 FK 위반 회귀 테스트.
 * 원인: 페이지가 거래처 미선택 시 PFund2 센티널 cust_id=-999 를 보내고 단건
 *   insert 가 그대로 INSERT → Supabase customer 에 -999 가 없어
 *   "violates foreign key constraint acc_book_cust_id_fkey".
 *   (import-sqlite 가 cust_id 를 remap 하므로 -999 는 이 DB에 절대 생기지 않음)
 * 수정: insert/update/batch 공통으로 익명(-999/0/null)을
 *   name='익명' AND org_id IS NULL 정본의 실제 cust_id 로 서버에서 치환.
 */

describe("needsAnonymousResolve", () => {
  it("센티널 -999 / 0 / null / undefined 는 치환 대상", () => {
    expect(needsAnonymousResolve(ANONYMOUS_CUST_ID_SENTINEL)).toBe(true);
    expect(needsAnonymousResolve(-999)).toBe(true);
    expect(needsAnonymousResolve(0)).toBe(true);
    expect(needsAnonymousResolve(null)).toBe(true);
    expect(needsAnonymousResolve(undefined)).toBe(true);
    expect(needsAnonymousResolve(Number.NaN)).toBe(true);
  });

  it("실제 거래처 id(양수)는 그대로 둔다", () => {
    expect(needsAnonymousResolve(38)).toBe(false);
    expect(needsAnonymousResolve(117)).toBe(false);
    expect(needsAnonymousResolve(1)).toBe(false);
  });
});

/** supabase 체인 mock — select(name='익명', org_id IS NULL) 결과와 insert 결과를 주입. */
function fakeClient(opts: {
  existing: { cust_id: number }[] | null;
  selectError?: { message: string } | null;
  insertedId?: number;
  insertError?: { message: string } | null;
  onInsert?: (row: Record<string, unknown>) => void;
}): AnonymousCustomerClient {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                is() {
                  return {
                    order() {
                      return {
                        limit() {
                          return Promise.resolve({
                            data: opts.existing,
                            error: opts.selectError ?? null,
                          });
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
        insert(row: Record<string, unknown>) {
          opts.onInsert?.(row);
          return {
            select() {
              return {
                single() {
                  return Promise.resolve({
                    data: opts.insertError ? null : { cust_id: opts.insertedId ?? -1 },
                    error: opts.insertError ?? null,
                  });
                },
              };
            },
          };
        },
      };
    },
  };
}

describe("resolveAnonymousCustId", () => {
  it("org_id IS NULL 익명이 있으면 그 cust_id(최솟값 정본)를 반환한다 — INSERT 없음", async () => {
    let inserted = false;
    const client = fakeClient({ existing: [{ cust_id: 39 }], onInsert: () => (inserted = true) });
    await expect(resolveAnonymousCustId(client)).resolves.toBe(39);
    expect(inserted).toBe(false);
  });

  it("익명이 없으면 규약(cust_sec_cd 63, reg_num 9999)으로 생성하고 새 id 반환", async () => {
    let row: Record<string, unknown> | undefined;
    const client = fakeClient({ existing: [], insertedId: 501, onInsert: (r) => (row = r) });
    await expect(resolveAnonymousCustId(client)).resolves.toBe(501);
    expect(row).toEqual({ cust_sec_cd: 63, name: "익명", reg_num: "9999" });
  });

  it("센티널 -999 를 반환하는 일은 결코 없다 (FK 위반 원인 차단)", async () => {
    const a = await resolveAnonymousCustId(fakeClient({ existing: [{ cust_id: 39 }] }));
    const b = await resolveAnonymousCustId(fakeClient({ existing: [], insertedId: 501 }));
    expect(a).not.toBe(ANONYMOUS_CUST_ID_SENTINEL);
    expect(b).not.toBe(ANONYMOUS_CUST_ID_SENTINEL);
  });

  it("조회 실패 시 throw (조용한 -999 통과 금지)", async () => {
    const client = fakeClient({ existing: null, selectError: { message: "boom" } });
    await expect(resolveAnonymousCustId(client)).rejects.toThrow("익명 거래처 조회 실패");
  });

  it("생성 실패 시 throw", async () => {
    const client = fakeClient({ existing: [], insertError: { message: "denied" } });
    await expect(resolveAnonymousCustId(client)).rejects.toThrow("익명 거래처 생성 실패");
  });
});
