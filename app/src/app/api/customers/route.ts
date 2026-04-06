import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Server-side route using service role key to bypass RLS
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { db: { schema: "pfam" } }
);

export async function GET(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get("orgId");

  if (orgId) {
    // 해당 기관에서 사용 중인 cust_id 목록 조회
    const { data: usedCustIds } = await supabase
      .from("acc_book")
      .select("cust_id")
      .eq("org_id", Number(orgId));

    const custIds = [...new Set((usedCustIds || []).map((r: { cust_id: number }) => r.cust_id).filter(Boolean))];

    if (custIds.length === 0) {
      return NextResponse.json([]);
    }

    const { data, error } = await supabase
      .from("customer")
      .select("*")
      .in("cust_id", custIds)
      .order("cust_id", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data || []);
  }

  // orgId 없으면 전체 (하위 호환)
  const { data, error } = await supabase
    .from("customer")
    .select("*")
    .order("cust_id", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, ...payload } = body;

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
    const { error } = await supabase.from("customer").delete().in("cust_id", payload.ids);
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
