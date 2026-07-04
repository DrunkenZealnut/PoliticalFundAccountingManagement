import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

/**
 * service_role API 라우트용 공통 인가 가드 (IDOR 방어 SSOT).
 *
 * 대부분의 API 라우트는 `SUPABASE_SERVICE_ROLE_KEY`로 RLS를 우회하고, 미들웨어는
 * `/api`를 공개 경로로 두므로(lib/supabase/middleware.ts), 각 라우트가 스스로
 * ① 로그인 사용자 확인(SSR 쿠키) ② user_organ 소속검증을 하지 않으면 임의
 * orgId로 타 기관 데이터를 읽고/쓸 수 있다(IDOR). `/api/organ`·`/api/hwpx/income-ledger`가
 * 확립한 4단계 패턴을 한 곳으로 추출해 재사용한다.
 *
 * 사용:
 *   const auth = await requireOrgMembership(rawOrgId, supabase);
 *   if (!auth.ok) return auth.response;
 *   // auth.userId, auth.orgId 사용
 *
 * 핵심 원칙:
 * - 클라이언트가 보낸 userId/orgId는 불신 — `auth.getUser()`의 user.id만 신뢰.
 * - 소속검증은 반드시 service_role 클라이언트로 user_organ을 조회(브라우저 RLS와 무관하게
 *   서버가 진실 판정).
 * - user_organ 조회 error를 0건(=403)으로 오인하지 않도록 error를 먼저 500 처리.
 */

/** user_organ 소속 조회만 하는 narrow 인터페이스. supabase-js 의 깊은 제네릭 체인을
 *  그대로 받으면 TS2589가 나므로 호출부에서 `client as unknown as MembershipQueryClient`로 좁힌다. */
export interface MembershipQueryClient {
  from(table: "user_organ"): {
    select(cols: string): {
      eq(
        col: string,
        val: unknown
      ): {
        eq(
          col: string,
          val: unknown
        ): {
          maybeSingle(): Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  };
}

export type OrgMembershipResult =
  | { ok: true; userId: string; orgId: number }
  | { ok: false; response: NextResponse };

/**
 * 호출자가 로그인했고 `rawOrgId` 기관에 소속되어 있는지 검증한다.
 * @param rawOrgId 쿼리/바디/formData에서 온 미검증 orgId(문자열 허용 — 내부에서 Number 정규화)
 * @param serviceClient service_role 로 만든 supabase 클라이언트(라우트가 이미 보유)
 */
export async function requireOrgMembership(
  rawOrgId: unknown,
  serviceClient: MembershipQueryClient
): Promise<OrgMembershipResult> {
  const orgId = Number(rawOrgId);
  if (!Number.isInteger(orgId) || orgId <= 0) {
    return {
      ok: false,
      response: NextResponse.json({ error: "유효한 orgId가 필요합니다" }, { status: 400 }),
    };
  }

  // 1) 인증 사용자 확인 (SSR 쿠키)
  const server = await createSupabaseServer();
  const {
    data: { user },
  } = await server.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 }),
    };
  }

  // 2) 멤버십 검증 — DB 오류를 0건(=403)으로 오인하지 않도록 error를 먼저 처리
  const { data: membership, error } = await serviceClient
    .from("user_organ")
    .select("org_id")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) {
    return {
      ok: false,
      response: NextResponse.json({ error: "권한 확인 중 오류가 발생했습니다" }, { status: 500 }),
    };
  }
  if (!membership) {
    return {
      ok: false,
      response: NextResponse.json({ error: "해당 기관에 대한 권한이 없습니다" }, { status: 403 }),
    };
  }

  return { ok: true, userId: user.id, orgId };
}
