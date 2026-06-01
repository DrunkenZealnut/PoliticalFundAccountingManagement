import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase/server";
import { EVIDENCE_BUCKET } from "@/lib/evidence/storage-path";

/**
 * 사용기관(organ) 삭제 API (organ-deletion design §4)
 *
 * action-dispatch:
 *   - preview: 삭제 영향 건수 집계(수입/지출/증빙/자산/수입지출처/백업)
 *   - delete:  evidence Storage 파일 선제거 → RPC delete_org_data 원자적 삭제
 *
 * 보안: service role은 RLS를 우회하므로, SSR 쿠키의 인증 사용자 + user_organ
 * 멤버십을 서버에서 명시 검증한 뒤에만 동작한다(클라이언트가 보낸 userId 불신).
 */

export const maxDuration = 60;

// 삭제는 service role(RLS 우회)이 필수. 키 없이 anon으로 대체하면 권한 경로가
// 조용히 어긋나므로 fallback 없이 명시적으로 구성하고, 요청 시 fail-fast로 검증한다.
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  // 빌드/임포트 단계 크래시 방지를 위해 init은 폴백을 두되, 실제 동작은 아래 가드로 차단
  SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { db: { schema: "pfam" } }
);

const MAX_ROWS = 100000;

export async function POST(request: NextRequest) {
  // service role 키 미설정 시 즉시 중단(설정 오류를 감추지 않음)
  if (!SERVICE_ROLE_KEY) {
    console.error("[organ] SUPABASE_SERVICE_ROLE_KEY 미설정 — 삭제 API 비활성화");
    return NextResponse.json({ error: "서버 설정 오류입니다" }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const action = body.action as string | undefined;
  const orgId = Number(body.orgId);

  if (action !== "preview" && action !== "delete") {
    return NextResponse.json({ error: "action은 preview 또는 delete여야 합니다" }, { status: 400 });
  }
  if (!Number.isInteger(orgId) || orgId <= 0) {
    return NextResponse.json({ error: "유효한 orgId가 필요합니다" }, { status: 400 });
  }

  // 1) 인증 사용자 확인 (SSR 쿠키)
  const server = await createSupabaseServer();
  const {
    data: { user },
  } = await server.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  // 2) 멤버십 검증 (호출자가 해당 org에 소속되어야 함)
  //    DB 오류를 0건(=403)으로 오인하지 않도록 error를 먼저 처리한다.
  const { data: membership, error: membershipError } = await supabase
    .from("user_organ")
    .select("org_id")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (membershipError) {
    return NextResponse.json({ error: "권한 확인 중 오류가 발생했습니다" }, { status: 500 });
  }
  if (!membership) {
    return NextResponse.json({ error: "해당 기관에 대한 권한이 없습니다" }, { status: 403 });
  }

  // org 존재 확인 + 이름 확보 (DB 오류를 404로 오인 금지)
  const { data: organ, error: organError } = await supabase
    .from("organ")
    .select("org_name")
    .eq("org_id", orgId)
    .maybeSingle();
  if (organError) {
    return NextResponse.json({ error: "기관 조회 중 오류가 발생했습니다" }, { status: 500 });
  }
  if (!organ) {
    return NextResponse.json({ error: "기관을 찾을 수 없습니다" }, { status: 404 });
  }
  const orgName = (organ as { org_name: string }).org_name;

  if (action === "preview") {
    return previewOrg(orgId, orgName);
  }
  return deleteOrg(orgId, orgName);
}

async function previewOrg(orgId: number, orgName: string) {
  // 수입/지출: 건수·금액은 JS 집계(acc-book GET과 동일 패턴)
  // 조회 오류를 0건으로 오인해 과소 집계를 노출하지 않도록 error를 명시 처리한다.
  const { data: accRows, error: accError } = await supabase
    .from("acc_book")
    .select("incm_sec_cd, acc_amt")
    .eq("org_id", orgId)
    .limit(MAX_ROWS);
  if (accError) {
    return NextResponse.json({ error: "거래 내역 집계 중 오류가 발생했습니다" }, { status: 500 });
  }
  const rows = (accRows || []) as { incm_sec_cd: number; acc_amt: number }[];
  const inc = rows.filter((r) => r.incm_sec_cd === 1);
  const exp = rows.filter((r) => r.incm_sec_cd === 2);

  let evidence: number, estate: number, customer: number, backup: number;
  try {
    [evidence, estate, customer, backup] = await Promise.all([
      countOf("evidence_file", "file_id", orgId),
      countOf("estate", "estate_id", orgId),
      countOf("customer", "cust_id", orgId),
      countOf("backup_history", "id", orgId),
    ]);
  } catch (e) {
    console.error(`[organ] preview count 실패 org=${orgId}:`, e);
    return NextResponse.json({ error: "영향 자료 집계 중 오류가 발생했습니다" }, { status: 500 });
  }

  return NextResponse.json({
    orgId,
    orgName,
    counts: {
      income: inc.length,
      incomeAmt: inc.reduce((s, r) => s + r.acc_amt, 0),
      expense: exp.length,
      expenseAmt: exp.reduce((s, r) => s + r.acc_amt, 0),
      evidence,
      estate,
      customer,
      backup,
    },
  });
}

async function deleteOrg(orgId: number, orgName: string) {
  // 3) evidence Storage 파일 선제거 (DB cascade 밖 영역) — storage_path가 SSOT
  //    목록 조회 실패를 0건으로 오인하면 파일이 고아로 남으므로 명시 처리한다.
  const { data: files, error: filesError } = await supabase
    .from("evidence_file")
    .select("storage_path")
    .eq("org_id", orgId)
    .limit(MAX_ROWS);
  if (filesError) {
    return NextResponse.json({ error: "증빙파일 조회 중 오류가 발생했습니다" }, { status: 500 });
  }
  const paths = ((files || []) as { storage_path: string | null }[])
    .map((f) => f.storage_path)
    .filter((p): p is string => Boolean(p));

  let storageRemoved = 0;
  let storageFailed = 0;
  if (paths.length > 0) {
    const { error: removeError } = await supabase.storage.from(EVIDENCE_BUCKET).remove(paths);
    if (removeError) {
      storageFailed = paths.length;
      console.error(`[organ] Storage 삭제 실패(고아 가능) org=${orgId}:`, removeError.message);
    } else {
      storageRemoved = paths.length;
    }
  }

  // 4) RPC 원자적 삭제 (자식 → organ)
  const { data: result, error } = await supabase.rpc("delete_org_data", { p_org_id: orgId });
  if (error) {
    return NextResponse.json(
      { error: `삭제 중 오류가 발생했습니다: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    deleted: true,
    orgName,
    storageRemoved,
    storageFailed,
    result,
  });
}

/** head:true count 조회 헬퍼. 오류는 throw하여 호출부(previewOrg)에서 500으로 처리한다. */
async function countOf(table: string, idCol: string, orgId: number): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select(idCol, { count: "exact", head: true })
    .eq("org_id", orgId);
  if (error) {
    throw new Error(`${table} count 실패: ${error.message}`);
  }
  return count ?? 0;
}
