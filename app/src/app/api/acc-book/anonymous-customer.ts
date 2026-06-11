/**
 * 익명 거래처(cust_id) 서버측 resolve.
 *
 * 클라이언트(수입/지출/수기입력)는 거래처 미선택 시 PFund2 호환 센티널 `-999`를
 * 보내지만, Supabase `customer`에는 -999 행이 존재하지 않는다(import-sqlite 가
 * cust_id 를 remap 하므로 PFund2 복원으로도 생기지 않음). 공유 익명 거래처는
 * `name='익명' AND org_id IS NULL` 규약(CLAUDE.md)이며 cust_id 는 auto id 다.
 * → INSERT 전에 센티널/빈값을 실제 익명 cust_id 로 치환해야 FK
 *   (acc_book_cust_id_fkey) 위반이 나지 않는다.
 *
 * supabase 클라이언트는 주입받는다(단위 테스트용 — import-helpers 패턴).
 */

/** 클라이언트가 "거래처 없음"으로 보내는 PFund2 호환 센티널. */
export const ANONYMOUS_CUST_ID_SENTINEL = -999;

/** 이 cust_id 값이면 익명 거래처로 치환해야 하는가 (-999/0/null/undefined). */
export function needsAnonymousResolve(custId: unknown): boolean {
  if (custId === null || custId === undefined) return true;
  const n = Number(custId);
  return !Number.isFinite(n) || n === 0 || n === ANONYMOUS_CUST_ID_SENTINEL;
}

/** resolve에 필요한 최소 쿼리 표면 (supabase-js 체인 서브셋). */
export interface AnonymousCustomerClient {
  from(table: "customer"): {
    select(cols: string): {
      eq(
        col: "name",
        v: string,
      ): {
        is(
          col: "org_id",
          v: null,
        ): {
          order(
            col: "cust_id",
            opts: { ascending: boolean },
          ): {
            limit(n: number): PromiseLike<{ data: { cust_id: number }[] | null; error: { message: string } | null }>;
          };
        };
      };
    };
    insert(row: Record<string, unknown>): {
      select(cols: string): {
        single(): PromiseLike<{ data: { cust_id: number } | null; error: { message: string } | null }>;
      };
    };
  };
}

/**
 * 공유 익명 거래처의 실제 cust_id 를 반환한다.
 * 1) `name='익명' AND org_id IS NULL` 중 cust_id 최솟값(중복 데이터가 있어도 결정론적 정본)
 * 2) 없으면 생성(cust_sec_cd 63, reg_num '9999', org_id NULL — batch_insert 기존 규약)
 */
export async function resolveAnonymousCustId(client: AnonymousCustomerClient): Promise<number> {
  const { data: existing, error: selErr } = await client
    .from("customer")
    .select("cust_id")
    .eq("name", "익명")
    .is("org_id", null)
    .order("cust_id", { ascending: true })
    .limit(1);
  if (selErr) throw new Error(`익명 거래처 조회 실패: ${selErr.message}`);
  if (existing && existing.length > 0) return existing[0].cust_id;

  const { data: created, error: insErr } = await client
    .from("customer")
    .insert({ cust_sec_cd: 63, name: "익명", reg_num: "9999" })
    .select("cust_id")
    .single();
  if (insErr || !created) throw new Error(`익명 거래처 생성 실패: ${insErr?.message ?? "no data"}`);
  return created.cust_id;
}
