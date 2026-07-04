import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  requireOrgMembership,
  type MembershipQueryClient,
} from "@/lib/api/require-org-membership";

// Server-side route using service role key to bypass RLS
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { db: { schema: "pfam" } }
);
const membershipClient = supabase as unknown as MembershipQueryClient;

// POST action별 대상 org 를 확정 후 소속검증(IDOR 방어).
// customer.org_id 는 nullable(공유 익명은 NULL) — 공유 익명 정본의 수정/삭제는 거부한다.
async function authorizeCustomers(
  action: string,
  payload: Record<string, unknown>,
): Promise<{ ok: true; orgId: number } | { ok: false; response: NextResponse }> {
  const reject = (msg: string, status: number) => ({
    ok: false as const,
    response: NextResponse.json({ error: msg }, { status }),
  });

  let rawOrgId: unknown = null;

  if (action === "insert") {
    rawOrgId = (payload.data as Record<string, unknown> | undefined)?.org_id;
  } else if (action === "update" || action === "save_addr_history") {
    const custId = payload.cust_id;
    if (custId == null) return reject("cust_id 가 필요합니다", 400);
    const { data, error } = await supabase
      .from("customer")
      .select("org_id")
      .eq("cust_id", custId)
      .maybeSingle();
    if (error) return reject("거래처 조회 중 오류", 500);
    rawOrgId = (data as { org_id?: number } | null)?.org_id ?? null;
    // 공유 익명(org_id NULL) 또는 미존재 거래처는 개별 org 권한으로 수정 불가.
    if (rawOrgId == null) return reject("해당 거래처에 대한 권한이 없습니다", 403);
  } else if (action === "delete" || action === "check_used") {
    const ids = payload.ids as unknown;
    if (!Array.isArray(ids) || ids.length === 0) return reject("ids 가 필요합니다", 400);
    const { data, error } = await supabase
      .from("customer")
      .select("org_id")
      .in("cust_id", ids);
    if (error) return reject("거래처 조회 중 오류", 500);
    const orgs = [...new Set((data ?? []).map((r) => (r as { org_id: number | null }).org_id))];
    if (orgs.length !== 1 || orgs[0] == null) {
      return reject("여러 기관·공유 거래처가 섞여 있어 처리할 수 없습니다", 400);
    }
    rawOrgId = orgs[0];
  } else {
    return reject("Unknown action", 400);
  }

  const auth = await requireOrgMembership(rawOrgId, membershipClient);
  if (!auth.ok) return { ok: false, response: auth.response };
  return { ok: true, orgId: auth.orgId };
}

export async function GET(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get("orgId");
  const search = request.nextUrl.searchParams.get("search");

  // 인가: orgId 필수 + 소속검증. (과거 search-only/전체 반환 분기는 전 기관 PII 유출이라 제거)
  const auth = await requireOrgMembership(orgId, membershipClient);
  if (!auth.ok) return auth.response;

  // org_id 기준 직접 격리 (011 마이그레이션). 본 기관 소속 거래처만 반환.
  let query = supabase.from("customer").select("*").eq("org_id", auth.orgId);
  if (search) {
    query = query.ilike("name", `%${search}%`);
  }
  const { data, error } = await query.order("cust_id", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, ...payload } = body;

  // 인가: action별 대상 org 확정 후 소속검증(IDOR 방어).
  const guard = await authorizeCustomers(action, payload);
  if (!guard.ok) return guard.response;

  if (action === "insert") {
    const { data, error } = await supabase
      .from("customer")
      .insert(payload.data)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  }

  if (action === "update") {
    const { error } = await supabase
      .from("customer")
      .update(payload.data)
      .eq("cust_id", payload.cust_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  }

  if (action === "delete") {
    // Check if customer has acc_book records
    const { count } = await supabase
      .from("acc_book")
      .select("*", { count: "exact", head: true })
      .in("cust_id", payload.ids);

    if (count && count > 0) {
      return NextResponse.json(
        { error: "수입/지출내역이 등록된 수입지출처는 삭제할 수 없습니다", usedCount: count },
        { status: 400 }
      );
    }

    await supabase.from("customer_addr").delete().in("cust_id", payload.ids);
    // 검증된 org 로 스코프를 걸어 심층 방어(가드가 이미 단일 org 소속을 확인).
    const { error } = await supabase
      .from("customer")
      .delete()
      .eq("org_id", guard.orgId)
      .in("cust_id", payload.ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  }

  if (action === "check_used") {
    const { data } = await supabase
      .from("acc_book")
      .select("cust_id")
      .in("cust_id", payload.ids);
    const usedIds = [...new Set((data || []).map((r: { cust_id: number }) => r.cust_id))];
    return NextResponse.json({ usedIds });
  }

  if (action === "save_addr_history") {
    const { data: maxSeq } = await supabase
      .from("customer_addr")
      .select("cust_seq")
      .eq("cust_id", payload.cust_id)
      .order("cust_seq", { ascending: false })
      .limit(1);

    const nextSeq = maxSeq && maxSeq.length > 0 ? maxSeq[0].cust_seq + 1 : 1;
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");

    await supabase.from("customer_addr").insert({
      cust_id: payload.cust_id,
      cust_seq: nextSeq,
      reg_date: today,
      tel: payload.tel,
      post: payload.post,
      addr: payload.addr,
      addr_detail: payload.addr_detail,
    });

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
