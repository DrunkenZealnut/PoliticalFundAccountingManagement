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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { db: { schema: "pfam" } }
);

const MAX_ROWS = 100000;

export async function POST(request: NextRequest) {
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
  const { data: membership } = await supabase
    .from("user_organ")
    .select("org_id")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: "해당 기관에 대한 권한이 없습니다" }, { status: 403 });
  }

  // org 존재 확인 + 이름 확보
  const { data: organ } = await supabase
    .from("organ")
    .select("org_name")
    .eq("org_id", orgId)
    .maybeSingle();
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
  const { data: accRows } = await supabase
    .from("acc_book")
    .select("incm_sec_cd, acc_amt")
    .eq("org_id", orgId)
    .limit(MAX_ROWS);
  const rows = (accRows || []) as { incm_sec_cd: number; acc_amt: number }[];
  const inc = rows.filter((r) => r.incm_sec_cd === 1);
  const exp = rows.filter((r) => r.incm_sec_cd === 2);

  const [evidence, estate, customer, backup] = await Promise.all([
    countOf("evidence_file", "file_id", orgId),
    countOf("estate", "estate_id", orgId),
    countOf("customer", "cust_id", orgId),
    countOf("backup_history", "id", orgId),
  ]);

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
  const { data: files } = await supabase
    .from("evidence_file")
    .select("storage_path")
    .eq("org_id", orgId)
    .limit(MAX_ROWS);
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

/** head:true count 조회 헬퍼 */
async function countOf(table: string, idCol: string, orgId: number): Promise<number> {
  const { count } = await supabase
    .from(table)
    .select(idCol, { count: "exact", head: true })
    .eq("org_id", orgId);
  return count ?? 0;
}
