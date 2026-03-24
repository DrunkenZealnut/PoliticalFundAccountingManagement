import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get("orgId");
  const incmSecCd = request.nextUrl.searchParams.get("incmSecCd");

  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  // Fetch records with customer join
  let query = supabase
    .from("acc_book")
    .select("*, customer:cust_id(name)")
    .eq("org_id", Number(orgId));

  if (incmSecCd) query = query.eq("incm_sec_cd", Number(incmSecCd));

  // Apply optional filters from query params
  const dateFrom = request.nextUrl.searchParams.get("dateFrom");
  const dateTo = request.nextUrl.searchParams.get("dateTo");
  const accSecCd = request.nextUrl.searchParams.get("accSecCd");
  const itemSecCd = request.nextUrl.searchParams.get("itemSecCd");
  const keyword = request.nextUrl.searchParams.get("keyword");
  const amtMin = request.nextUrl.searchParams.get("amtMin");
  const amtMax = request.nextUrl.searchParams.get("amtMax");

  if (dateFrom) query = query.gte("acc_date", dateFrom);
  if (dateTo) query = query.lte("acc_date", dateTo);
  if (accSecCd) query = query.eq("acc_sec_cd", Number(accSecCd));
  if (itemSecCd) query = query.eq("item_sec_cd", Number(itemSecCd));
  if (keyword) query = query.ilike("content", `%${keyword}%`);
  if (amtMin) query = query.gte("acc_amt", Number(amtMin));
  if (amtMax) query = query.lte("acc_amt", Number(amtMax));

  const { data, error } = await query
    .order("acc_date", { ascending: true })
    .order("acc_sort_num", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Also fetch summary (total income/expense for this org)
  const { data: allData } = await supabase
    .from("acc_book")
    .select("incm_sec_cd, acc_amt")
    .eq("org_id", Number(orgId));

  const inc = (allData || []).filter((r) => r.incm_sec_cd === 1).reduce((s, r) => s + r.acc_amt, 0);
  const exp = (allData || []).filter((r) => r.incm_sec_cd === 2).reduce((s, r) => s + r.acc_amt, 0);

  return NextResponse.json({
    records: data || [],
    summary: { income: inc, expense: exp, balance: inc - exp },
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, ...payload } = body;

  if (action === "insert") {
    const { data, error } = await supabase.from("acc_book").insert(payload.data).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  }

  if (action === "update") {
    const { error } = await supabase.from("acc_book").update(payload.data).eq("acc_book_id", payload.acc_book_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  }

  if (action === "delete") {
    const { error } = await supabase.from("acc_book").delete().in("acc_book_id", payload.ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  }

  if (action === "backup") {
    const { error } = await supabase.from("acc_book_bak").insert(payload.data);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  }

  if (action === "batch_receipt") {
    const { orgId: oid, incmSecCd: isc } = payload;
    // Find targets (rcp_yn=Y, no rcp_no)
    const { data: targets } = await supabase
      .from("acc_book")
      .select("acc_book_id, rcp_no")
      .eq("org_id", oid).eq("incm_sec_cd", isc).eq("rcp_yn", "Y")
      .or("rcp_no.is.null,rcp_no.eq.")
      .order("acc_date").order("acc_sort_num");

    if (!targets || targets.length === 0) {
      return NextResponse.json({ count: 0 });
    }

    // Get max existing receipt number
    const { data: maxRcp } = await supabase
      .from("acc_book")
      .select("rcp_no, rcp_no2")
      .eq("org_id", oid).eq("incm_sec_cd", isc)
      .not("rcp_no", "is", null).not("rcp_no", "eq", "")
      .order("rcp_no2", { ascending: false }).limit(1);

    let startNum = 1;
    if (maxRcp?.[0]?.rcp_no) {
      const parsed = parseInt(maxRcp[0].rcp_no, 10);
      if (!isNaN(parsed)) startNum = parsed + 1;
    }

    for (let i = 0; i < targets.length; i++) {
      const num = startNum + i;
      await supabase.from("acc_book").update({ rcp_no: String(num), rcp_no2: num }).eq("acc_book_id", targets[i].acc_book_id);
    }

    return NextResponse.json({ count: targets.length, startNum, endNum: startNum + targets.length - 1 });
  }

  if (action === "batch_insert") {
    const { rows } = payload;
    let success = 0;
    const errors: string[] = [];

    // Find or create "익명" customer for anonymous entries
    let anonCustId: number;
    const { data: anonCust } = await supabase.from("customer").select("cust_id").eq("name", "익명").limit(1);
    if (anonCust && anonCust.length > 0) {
      anonCustId = anonCust[0].cust_id;
    } else {
      const { data: newAnon } = await supabase.from("customer").insert({ cust_sec_cd: 63, name: "익명", reg_num: "9999" }).select("cust_id").single();
      anonCustId = (newAnon as { cust_id: number })?.cust_id ?? 0;
    }

    for (const row of rows as Record<string, unknown>[]) {
      // Auto-register or match customer
      let custId = anonCustId;
      const provider = row._provider as string | undefined;
      const regNum = row._regNum as string | undefined;
      const custType = row._custType as string | undefined;

      if (provider && provider !== "익명" && provider.trim() !== "") {
        // Try find existing
        const { data: existing } = await supabase
          .from("customer")
          .select("cust_id")
          .eq("name", provider)
          .limit(1);

        if (existing && existing.length > 0) {
          custId = (existing[0] as { cust_id: number }).cust_id;
        } else {
          const rn = regNum || "9999";
          const csc = custType === "사업자" ? 62 : 63;
          const { data: newCust } = await supabase
            .from("customer")
            .insert({ cust_sec_cd: csc, name: provider, reg_num: rn })
            .select("cust_id")
            .single();
          if (newCust) custId = (newCust as { cust_id: number }).cust_id;
        }
      }

      // Remove internal fields before insert
      const insertData: Record<string, unknown> = { ...row, cust_id: custId };
      delete insertData._provider;
      delete insertData._regNum;
      delete insertData._custType;

      const { error } = await supabase.from("acc_book").insert(insertData);
      if (error) errors.push(`row: ${error.message}`);
      else success++;
    }

    return NextResponse.json({ success, failed: errors.length, errors: errors.slice(0, 5) });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
