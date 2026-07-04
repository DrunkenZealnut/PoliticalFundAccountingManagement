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
import { assignReceiptNumbers } from "@/lib/accounting/receipt-no";
import { isAccDateInOrgPeriod, type OrgPeriod, type PeriodCheck } from "@/lib/accounting/acc-period";
import {
  requireOrgMembership,
  type MembershipQueryClient,
} from "@/lib/api/require-org-membership";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { db: { schema: "pfam" } }
);

// resolveAnonymousCustId 는 단위 테스트용 narrow 인터페이스(AnonymousCustomerClient)를
// 받는다. supabase-js 의 깊은 제네릭 체인을 이 인터페이스에 직접 구조적 매칭하면
// TS2589(과도한 타입 인스턴스화)가 나므로 경계에서 한 번 좁힌다.
const anonClient = supabase as unknown as AnonymousCustomerClient;
const membershipClient = supabase as unknown as MembershipQueryClient;

// POST action별 대상 org 를 확정한 뒤 호출자 소속을 검증한다(IDOR 방어).
// org_id 가 본문에 없는 update/delete 는 acc_book_id/ids 로 기존 행 org 를 역조회한다.
async function authorizeAccBook(
  action: string,
  payload: Record<string, unknown>,
): Promise<{ ok: true; orgId: number } | { ok: false; response: NextResponse }> {
  let rawOrgId: unknown = null;

  if (action === "insert" || action === "backup") {
    rawOrgId = (payload.data as Record<string, unknown> | undefined)?.org_id;
  } else if (action === "update") {
    const data0 = payload.data as Record<string, unknown> | undefined;
    rawOrgId = data0?.org_id;
    if (rawOrgId == null && payload.acc_book_id != null) {
      const { data: ex } = await supabase
        .from("acc_book")
        .select("org_id")
        .eq("acc_book_id", payload.acc_book_id)
        .maybeSingle();
      rawOrgId = (ex as { org_id?: number } | null)?.org_id ?? null;
    }
  } else if (action === "batch_receipt") {
    rawOrgId = payload.orgId;
  } else if (action === "batch_insert") {
    const orgIds = [
      ...new Set(
        ((payload.rows as Record<string, unknown>[]) ?? [])
          .map((r) => r.org_id)
          .filter((v) => v != null),
      ),
    ];
    if (orgIds.length !== 1) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "batch_insert 는 단일 사용기관 행만 허용합니다" },
          { status: 400 },
        ),
      };
    }
    rawOrgId = orgIds[0];
  } else if (action === "delete") {
    const ids = payload.ids as unknown;
    if (!Array.isArray(ids) || ids.length === 0) {
      return {
        ok: false,
        response: NextResponse.json({ error: "삭제할 ids 가 필요합니다" }, { status: 400 }),
      };
    }
    // 삭제 대상 행들이 실제로 속한 org 를 역조회 — 여러 org 혼재 시 거부.
    const { data: rows, error } = await supabase
      .from("acc_book")
      .select("org_id")
      .in("acc_book_id", ids);
    if (error) {
      return {
        ok: false,
        response: NextResponse.json({ error: "삭제 대상 조회 중 오류" }, { status: 500 }),
      };
    }
    const orgs = [...new Set((rows ?? []).map((r) => (r as { org_id: number }).org_id))];
    if (orgs.length !== 1) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "여러 사용기관에 걸친 삭제는 허용되지 않습니다" },
          { status: 400 },
        ),
      };
    }
    rawOrgId = orgs[0];
  } else {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unknown action" }, { status: 400 }),
    };
  }

  const auth = await requireOrgMembership(rawOrgId, membershipClient);
  if (!auth.ok) return { ok: false, response: auth.response };
  return { ok: true, orgId: auth.orgId };
}

// 거래일 ↔ 회계기간 검증 (year-data-separation 가드). org 회계기간 조회 + 표준 에러.
async function fetchOrgPeriod(orgId: number): Promise<OrgPeriod | null> {
  const { data } = await supabase
    .from("organ")
    .select("acc_from, acc_to, pre_acc_from")
    .eq("org_id", orgId)
    .maybeSingle();
  return (data as OrgPeriod) ?? null;
}
function outOfPeriodBody(orgId: number, accDate: string, chk: PeriodCheck) {
  return {
    error: {
      code: "OUT_OF_PERIOD",
      message: `거래일 ${accDate}가 사용기관 회계기간(${chk.lo}~${chk.hi}) 밖입니다. 연도가 맞는 사용기관인지 확인하세요.`,
      org_id: orgId,
      acc_date: accDate,
      range: [chk.lo, chk.hi],
    },
  };
}

// 결산확정 경고 (BX7). org 가 결산확정(opinion.settled_at)됐고 거래일이 확정 결산기간
// [acc_from, acc_to] 내이면 SETTLED_PERIOD 로 표면화 — 차단이 아니라 클라 confirm 후
// _allowSettled override 재요청(postAccBook). 확정치와 원장이 어긋날 수 있음을 알리는 경고.
async function checkSettledPeriod(
  orgId: number,
  accDate: string,
): Promise<{ blocked: boolean; from?: string; to?: string }> {
  const { data } = await supabase
    .from("opinion")
    .select("settled_at, acc_from, acc_to")
    .eq("org_id", orgId)
    .maybeSingle();
  const row = data as { settled_at: string | null; acc_from: string | null; acc_to: string | null } | null;
  if (!row?.settled_at || !row.acc_from || !row.acc_to) return { blocked: false };
  // YYYYMMDD 사전식 비교(acc-period 와 동일).
  if (accDate >= row.acc_from && accDate <= row.acc_to) {
    return { blocked: true, from: row.acc_from, to: row.acc_to };
  }
  return { blocked: false };
}
function settledPeriodBody(orgId: number, accDate: string, from: string, to: string) {
  return {
    error: {
      code: "SETTLED_PERIOD",
      message: `거래일 ${accDate}가 결산확정된 기간(${from}~${to}) 내입니다. 확정 후 수정은 결산치와 원장을 어긋나게 할 수 있습니다.`,
      org_id: orgId,
      acc_date: accDate,
      range: [from, to],
    },
  };
}

export async function GET(request: NextRequest) {
  const orgIdParam = request.nextUrl.searchParams.get("orgId");
  const incmSecCd = request.nextUrl.searchParams.get("incmSecCd");

  // 인가: 로그인 + 해당 org 소속 검증(IDOR 방어). orgId 는 여기서 정수로 확정된다.
  const auth = await requireOrgMembership(orgIdParam, membershipClient);
  if (!auth.ok) return auth.response;
  const orgId = auth.orgId;

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
    .order("acc_sort_num", { ascending: true })
    .limit(100000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 요약(총수입/총지출) — DB 집계 RPC(SUM GROUP BY, scripts/025)로 2행만 받는다.
  // RPC 미적용 환경에서는 기존 전건 fetch+reduce 로 폴백(무해).
  let inc = 0;
  let exp = 0;
  const { data: totals, error: totalsErr } = await supabase.rpc("org_income_expense_totals", {
    p_org_id: orgId,
  });
  if (!totalsErr && Array.isArray(totals)) {
    for (const t of totals as { incm_sec_cd: number; total: number }[]) {
      if (t.incm_sec_cd === 1) inc = Number(t.total) || 0;
      else if (t.incm_sec_cd === 2) exp = Number(t.total) || 0;
    }
  } else {
    const { data: allData } = await supabase
      .from("acc_book")
      .select("incm_sec_cd, acc_amt")
      .eq("org_id", orgId)
      .limit(100000);
    inc = (allData || []).filter((r) => r.incm_sec_cd === 1).reduce((s, r) => s + r.acc_amt, 0);
    exp = (allData || []).filter((r) => r.incm_sec_cd === 2).reduce((s, r) => s + r.acc_amt, 0);
  }

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

  // 인가: action별 대상 org 확정 후 소속검증(IDOR 방어). 검증된 org 는 delete 스코프에 사용.
  const guard = await authorizeAccBook(action, payload);
  if (!guard.ok) return guard.response;
  const authOrgId = guard.orgId;

  if (action === "insert") {
    const data0 = payload.data as Record<string, unknown>;
    // 거래일↔회계기간 검증 (year-data-separation). override(_allowOutOfPeriod) 시 통과.
    const allowOOP = data0._allowOutOfPeriod === true;
    const allowSettled = data0._allowSettled === true;
    delete data0._allowOutOfPeriod;
    delete data0._allowSettled;
    if (data0.acc_date && data0.org_id != null && !allowOOP) {
      const period = await fetchOrgPeriod(Number(data0.org_id));
      if (period) {
        const chk = isAccDateInOrgPeriod(String(data0.acc_date), period);
        if (!chk.ok) {
          return NextResponse.json(
            outOfPeriodBody(Number(data0.org_id), String(data0.acc_date), chk),
            { status: 400 },
          );
        }
      }
    }
    // 결산확정 경고 (BX7). authOrgId = 소속검증된 org.
    if (data0.acc_date && !allowSettled) {
      const s = await checkSettledPeriod(authOrgId, String(data0.acc_date));
      if (s.blocked) {
        return NextResponse.json(
          settledPeriodBody(authOrgId, String(data0.acc_date), s.from!, s.to!),
          { status: 400 },
        );
      }
    }
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
    // 거래일↔회계기간 검증 (acc_date 변경 시). 대상 org 는 소속검증된 authOrgId.
    const allowOOP = data0._allowOutOfPeriod === true;
    const allowSettled = data0._allowSettled === true;
    delete data0._allowOutOfPeriod;
    delete data0._allowSettled;
    if (data0.acc_date && !allowOOP) {
      const period = await fetchOrgPeriod(authOrgId);
      if (period) {
        const chk = isAccDateInOrgPeriod(String(data0.acc_date), period);
        if (!chk.ok) {
          return NextResponse.json(outOfPeriodBody(authOrgId, String(data0.acc_date), chk), {
            status: 400,
          });
        }
      }
    }
    // 결산확정 경고 (BX7).
    if (data0.acc_date && !allowSettled) {
      const s = await checkSettledPeriod(authOrgId, String(data0.acc_date));
      if (s.blocked) {
        return NextResponse.json(
          settledPeriodBody(authOrgId, String(data0.acc_date), s.from!, s.to!),
          { status: 400 },
        );
      }
    }
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
    // 검증된 org 로 스코프를 걸어 심층 방어(가드가 이미 단일 org 소속을 확인).
    const { error } = await supabase
      .from("acc_book")
      .delete()
      .eq("org_id", authOrgId)
      .in("acc_book_id", payload.ids);
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
    // 수입(incm_sec_cd=1)은 영수증번호 생략(공식 양식·Fund_Data_*.db 기준) — 채번하지 않는다.
    //   지출만 채번하므로 수입 요청은 즉시 no-op으로 응답한다.
    if (Number(isc) === 1) {
      return NextResponse.json({ count: 0, omitted: true });
    }
    // 미부여 대상 (rcp_yn=Y, rcp_no 없음) — 계정·과목 포함
    const { data: targets, error: targetsErr } = await supabase
      .from("acc_book")
      .select("acc_book_id, acc_sec_cd, item_sec_cd, rcp_no")
      .eq("org_id", oid).eq("incm_sec_cd", isc).eq("rcp_yn", "Y")
      .or("rcp_no.is.null,rcp_no.eq.")
      .order("acc_date").order("acc_sort_num");
    if (targetsErr) {
      return NextResponse.json({ error: targetsErr.message }, { status: 500 });
    }

    if (!targets || targets.length === 0) {
      return NextResponse.json({ count: 0 });
    }

    // 기존 부여분 (조합별 max 순번 · 전체 max rcp_no2 산출용)
    const { data: existing, error: existingErr } = await supabase
      .from("acc_book")
      .select("rcp_no, rcp_no2")
      .eq("org_id", oid).eq("incm_sec_cd", isc)
      .not("rcp_no", "is", null).not("rcp_no", "eq", "");
    if (existingErr) {
      return NextResponse.json({ error: existingErr.message }, { status: 500 });
    }

    // 계정·과목 코드명 (약자 매핑용) — acc_sec_cd/item_sec_cd 모두 cv_id
    const { data: cv, error: cvErr } = await supabase.from("codevalue").select("cv_id, cv_name");
    if (cvErr) {
      return NextResponse.json({ error: cvErr.message }, { status: 500 });
    }
    const nameById: Record<number, string> = {};
    for (const c of cv ?? []) nameById[c.cv_id as number] = String(c.cv_name ?? "");

    const assignments = assignReceiptNumbers(
      targets as { acc_book_id: number; acc_sec_cd: number; item_sec_cd: number }[],
      { acc: nameById, item: nameById },
      existing ?? [],
    );
    // 행별 update — 실패 건을 즉시 감지(부분 반영 silent 방지).
    // 단일 사용자 일괄작업이라 동시성 위험은 낮아 RPC 트랜잭션은 도입하지 않음.
    const results = await Promise.all(
      assignments.map((a) =>
        supabase.from("acc_book").update({ rcp_no: a.rcp_no, rcp_no2: a.rcp_no2 }).eq("acc_book_id", a.acc_book_id),
      ),
    );
    const failed = results.filter((r) => r.error);
    if (failed.length > 0) {
      return NextResponse.json(
        {
          error: failed[0].error?.message ?? "일부 영수증 번호 반영에 실패했습니다.",
          count: assignments.length - failed.length,
          failed: failed.length,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ count: assignments.length });
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
        ? supabase
            .from("organ")
            .select("org_id, org_sec_cd, acc_from, acc_to, pre_acc_from")
            .in("org_id", orgIds)
        : Promise.resolve({
            data: [] as {
              org_id: number;
              org_sec_cd: number;
              acc_from: string | null;
              acc_to: string | null;
              pre_acc_from: string | null;
            }[],
          }),
    ]);
    const codeValues = (cvRes.data || []) as CodeValueLike[];
    const accRels = (arRes.data || []) as AccRelLike[];
    const orgList = (orgRes.data || []) as {
      org_id: number;
      org_sec_cd: number;
      acc_from: string | null;
      acc_to: string | null;
      pre_acc_from: string | null;
    }[];
    const orgSecMap = new Map<number, number>(orgList.map((o) => [o.org_id, o.org_sec_cd]));

    // 거래일↔회계기간 검증 (year-data-separation). 위반 시 전체 배치 차단 unless allowOutOfPeriod.
    if (payload.allowOutOfPeriod !== true) {
      const orgPeriodMap = new Map<number, OrgPeriod>(
        orgList.map((o) => [o.org_id, { acc_from: o.acc_from, acc_to: o.acc_to, pre_acc_from: o.pre_acc_from }]),
      );
      const violations: { index: number; acc_date: string; org_id: number; range: (string | undefined)[] }[] = [];
      (rows as Record<string, unknown>[]).forEach((r, i) => {
        const oid = r.org_id != null ? Number(r.org_id) : null;
        const period = oid != null ? orgPeriodMap.get(oid) : null;
        if (period && r.acc_date) {
          const chk = isAccDateInOrgPeriod(String(r.acc_date), period);
          if (!chk.ok) violations.push({ index: i, acc_date: String(r.acc_date), org_id: oid as number, range: [chk.lo, chk.hi] });
        }
      });
      if (violations.length > 0) {
        return NextResponse.json(
          {
            error: {
              code: "OUT_OF_PERIOD",
              message: `${violations.length}건의 거래일이 사용기관 회계기간 밖입니다. 연도가 맞는 사용기관인지 확인하세요.`,
              rows: violations.slice(0, 20),
            },
          },
          { status: 400 },
        );
      }
    }

    // 성능(P-2): 행당 customer 조회+생성+acc_book insert(3N 왕복)를 일괄화한다.
    //   ① 코드매핑(메모리) + provider 수집 → ② customer 일괄 조회 → ③ 신규 일괄 생성
    //   → ④ acc_book 청크 배열 insert. 거래처 매칭은 org 범위 격리 유지(011, key="org|name").
    const custKey = (orgId: number | null | undefined, name: string) => `${orgId ?? "null"}|${name}`;
    const namedProvider = (p: string | undefined): p is string =>
      !!p && p !== "익명" && p.trim() !== "";

    // ① 코드매핑 + provider 수집 (DB 왕복 없음)
    const preparedRows: Record<string, unknown>[] = [];
    const providerInfo = new Map<
      string,
      { name: string; orgId: number | null; regNum: string; custType: string | undefined;
        addr: string | null; job: string | null; tel: string | null }
    >();
    for (const row of rows as Record<string, unknown>[]) {
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

      const provider = row._provider as string | undefined;
      if (namedProvider(provider)) {
        const key = custKey(orgId, provider);
        if (!providerInfo.has(key)) {
          providerInfo.set(key, {
            name: provider,
            orgId: orgId ?? null,
            regNum: (row._regNum as string) || "9999",
            custType: row._custType as string | undefined,
            addr: (row._addr as string) || null,
            job: (row._job as string) || null,
            tel: (row._tel as string) || null,
          });
        }
      }
      preparedRows.push(row);
    }

    // ② 기존 customer 일괄 조회 (org 격리는 key 로 판별)
    const custMap = new Map<string, number>();
    const uniqueNames = [...new Set([...providerInfo.values()].map((p) => p.name))];
    if (uniqueNames.length > 0) {
      const { data: existingCusts } = await supabase
        .from("customer")
        .select("cust_id, name, org_id")
        .in("name", uniqueNames);
      for (const c of (existingCusts ?? []) as { cust_id: number; name: string; org_id: number | null }[]) {
        custMap.set(custKey(c.org_id, c.name), c.cust_id);
      }
    }

    // ③ 없는 provider 일괄 생성
    const toCreate = [...providerInfo.entries()]
      .filter(([key]) => !custMap.has(key))
      .map(([, p]) => ({
        cust_sec_cd: p.custType === "사업자" ? 62 : 63,
        name: p.name,
        reg_num: p.regNum,
        org_id: p.orgId,
        addr: p.addr,
        job: p.job,
        tel: p.tel,
      }));
    if (toCreate.length > 0) {
      const { data: created, error: createErr } = await supabase
        .from("customer")
        .insert(toCreate)
        .select("cust_id, name, org_id");
      if (createErr) {
        return NextResponse.json({ error: `거래처 일괄 생성 실패: ${createErr.message}` }, { status: 400 });
      }
      for (const c of (created ?? []) as { cust_id: number; name: string; org_id: number | null }[]) {
        custMap.set(custKey(c.org_id, c.name), c.cust_id);
      }
    }

    // ④ acc_book 행 구성 + 청크 배열 insert
    const insertRows = preparedRows.map((row) => {
      const orgId = row.org_id as number | undefined;
      const provider = row._provider as string | undefined;
      const custId = namedProvider(provider)
        ? custMap.get(custKey(orgId, provider)) ?? anonCustId
        : anonCustId;
      const insertData: Record<string, unknown> = { ...row, cust_id: custId };
      for (const key of Object.keys(insertData)) {
        if (key.startsWith("_")) delete insertData[key];
      }
      return insertData;
    });

    const CHUNK = 500;
    for (let i = 0; i < insertRows.length; i += CHUNK) {
      const chunk = insertRows.slice(i, i + CHUNK);
      const { error } = await supabase.from("acc_book").insert(chunk);
      if (error) errors.push(`${i + 1}~${i + chunk.length}행: ${error.message}`);
      else success += chunk.length;
    }

    return NextResponse.json({ success, failed: errors.length, errors: errors.slice(0, 5) });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
