import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  tryResolveAccountCodes,
  type CodeValueLike,
  type AccRelLike,
} from "@/lib/accounting/code-mapping";
import {
  needsAnonymousResolve,
  resolveAnonymousCustId,
  type AnonymousCustomerClient,
} from "./anonymous-customer";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { db: { schema: "pfam" } }
);

// resolveAnonymousCustId 는 단위 테스트용 narrow 인터페이스(AnonymousCustomerClient)를
// 받는다. supabase-js 의 깊은 제네릭 체인을 이 인터페이스에 직접 구조적 매칭하면
// TS2589(과도한 타입 인스턴스화)가 나므로 경계에서 한 번 좁힌다.
const anonClient = supabase as unknown as AnonymousCustomerClient;

export async function GET(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get("orgId");
  const incmSecCd = request.nextUrl.searchParams.get("incmSecCd");

  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  // maxRcpNo 조회 (증빙서번호 자동채번용)
  const maxRcpNoFlag = request.nextUrl.searchParams.get("maxRcpNo");
  if (maxRcpNoFlag) {
    const { data: maxRcp } = await supabase
      .from("acc_book")
      .select("rcp_no2")
      .eq("org_id", Number(orgId))
      .eq("incm_sec_cd", Number(incmSecCd || 2))
      .not("rcp_no2", "is", null)
      .order("rcp_no2", { ascending: false })
      .limit(1);
    const maxNo = maxRcp?.[0]?.rcp_no2 ?? 0;
    return NextResponse.json({ maxRcpNo: maxNo });
  }

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
    .order("acc_time", { ascending: true, nullsFirst: true })
    .order("acc_sort_num", { ascending: true })
    .limit(100000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Also fetch summary (total income/expense for this org)
  const { data: allData } = await supabase
    .from("acc_book")
    .select("incm_sec_cd, acc_amt")
    .eq("org_id", Number(orgId))
    .limit(100000);

  const inc = (allData || []).filter((r) => r.incm_sec_cd === 1).reduce((s, r) => s + r.acc_amt, 0);
  const exp = (allData || []).filter((r) => r.incm_sec_cd === 2).reduce((s, r) => s + r.acc_amt, 0);

  // Filtered summary (sum of currently returned records)
  const records = data || [];
  const filteredTotal = records.reduce((s: number, r: { acc_amt: number }) => s + r.acc_amt, 0);

  return NextResponse.json({
    records,
    summary: { income: inc, expense: exp, balance: inc - exp },
    filteredSummary: { income: filteredTotal, expense: filteredTotal, balance: 0, count: records.length },
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, ...payload } = body;

  if (action === "insert") {
    const data0 = payload.data as Record<string, unknown>;
    // 거래처 미선택(-999/0/null)은 공유 익명 거래처의 실제 cust_id 로 치환.
    // -999 는 PFund2 호환 센티널일 뿐 Supabase customer 에는 존재하지 않아
    // 그대로 INSERT 하면 acc_book_cust_id_fkey 위반이 난다.
    if (needsAnonymousResolve(data0.cust_id)) {
      try {
        data0.cust_id = await resolveAnonymousCustId(anonClient);
      } catch (e) {
        return NextResponse.json({ error: String(e) }, { status: 500 });
      }
    }
    const { data, error } = await supabase.from("acc_book").insert(data0).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  }

  if (action === "update") {
    const data0 = payload.data as Record<string, unknown>;
    if ("cust_id" in data0 && needsAnonymousResolve(data0.cust_id)) {
      try {
        data0.cust_id = await resolveAnonymousCustId(anonClient);
      } catch (e) {
        return NextResponse.json({ error: String(e) }, { status: 500 });
      }
    }
    const { error } = await supabase.from("acc_book").update(data0).eq("acc_book_id", payload.acc_book_id);
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
    // (insert/update 단건 경로와 동일 헬퍼 — org_id IS NULL 공유 익명 정본 사용)
    let anonCustId: number;
    try {
      anonCustId = await resolveAnonymousCustId(anonClient);
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }

    // Safety net: load code/org references once for fallback mapping.
    // Old clients may still send acc_sec_cd=0; server resolves from _account/_subject.
    const orgIds = [...new Set((rows as Record<string, unknown>[]).map((r) => r.org_id as number).filter(Boolean))];
    const [cvRes, arRes, orgRes] = await Promise.all([
      supabase.from("codevalue").select("cv_id, cs_id, cv_name"),
      supabase.from("acc_rel").select("org_sec_cd, incm_sec_cd, acc_sec_cd, item_sec_cd, exp_sec_cd, input_yn, acc_order").eq("input_yn", "Y"),
      orgIds.length > 0
        ? supabase.from("organ").select("org_id, org_sec_cd").in("org_id", orgIds)
        : Promise.resolve({ data: [] as { org_id: number; org_sec_cd: number }[] }),
    ]);
    const codeValues = (cvRes.data || []) as CodeValueLike[];
    const accRels = (arRes.data || []) as AccRelLike[];
    const orgSecMap = new Map<number, number>(
      (orgRes.data || []).map((o) => [o.org_id, o.org_sec_cd]),
    );

    for (const row of rows as Record<string, unknown>[]) {
      // Safety net: if client sent acc_sec_cd=0 but provided _account/_subject, map server-side
      const accSecRaw = row.acc_sec_cd;
      const orgId = row.org_id as number | undefined;
      const account = row._account as string | undefined;
      const subject = row._subject as string | undefined;
      const incmSec = row.incm_sec_cd as number | undefined;
      const orgSec = orgId != null ? orgSecMap.get(orgId) : undefined;

      if (
        (accSecRaw === 0 || accSecRaw == null) &&
        account && subject && orgSec != null && incmSec != null
      ) {
        const codes = tryResolveAccountCodes(
          account, subject,
          { orgSecCd: orgSec, incmSecCd: incmSec },
          codeValues, accRels,
        );
        if (codes) {
          row.acc_sec_cd = codes.acc_sec_cd;
          row.item_sec_cd = codes.item_sec_cd;
          row.exp_sec_cd = codes.exp_sec_cd;
        } else {
          errors.push(`row ${account}/${subject}: 코드 매핑 실패 (orgSec=${orgSec}, incm=${incmSec})`);
          continue;
        }
      }

      // Auto-register or match customer
      let custId = anonCustId;
      const provider = row._provider as string | undefined;
      const regNum = row._regNum as string | undefined;
      const custType = row._custType as string | undefined;

      if (provider && provider !== "익명" && provider.trim() !== "") {
        // 거래처 매칭/생성을 org 범위로 격리 (011): 같은 이름이라도 org가 다르면 별개 거래처.
        let existingQuery = supabase
          .from("customer")
          .select("cust_id")
          .eq("name", provider);
        if (orgId != null) existingQuery = existingQuery.eq("org_id", orgId);
        const { data: existing } = await existingQuery.limit(1);

        if (existing && existing.length > 0) {
          custId = (existing[0] as { cust_id: number }).cust_id;
        } else {
          const rn = regNum || "9999";
          const csc = custType === "사업자" ? 62 : 63;
          const { data: newCust } = await supabase
            .from("customer")
            .insert({
              cust_sec_cd: csc,
              name: provider,
              reg_num: rn,
              org_id: orgId ?? null,
              addr: row._addr as string || null,
              job: row._job as string || null,
              tel: row._tel as string || null,
            })
            .select("cust_id")
            .single();
          if (newCust) custId = (newCust as { cust_id: number }).cust_id;
        }
      }

      // Remove all internal (_-prefixed) fields before insert
      const insertData: Record<string, unknown> = { ...row, cust_id: custId };
      for (const key of Object.keys(insertData)) {
        if (key.startsWith("_")) delete insertData[key];
      }

      const { error } = await supabase.from("acc_book").insert(insertData);
      if (error) errors.push(`row: ${error.message}`);
      else success++;
    }

    return NextResponse.json({ success, failed: errors.length, errors: errors.slice(0, 5) });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
