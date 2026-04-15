import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { db: { schema: "pfam" } }
);

// 실측 가능한 단계만 포함 (settlement/reports/backup/donors는 완료 신호가 없어 제외)
const WORKFLOW_DEFINITIONS: Record<string, string[]> = {
  party:     ["organ", "customer", "income", "expense", "estate"],
  lawmaker:  ["organ", "customer", "income", "expense", "estate"],
  candidate: ["organ", "customer", "income", "expense", "estate"],
  supporter: ["organ", "customer", "income", "expense", "estate"],
};

const STEP_META: Record<string, { label: string; href: string; wizardHref?: string }> = {
  organ:      { label: "사용기관관리", href: "/dashboard/organ" },
  customer:   { label: "수입지출처 등록", href: "/dashboard/customer" },
  income:     { label: "수입 등록", href: "/dashboard/income", wizardHref: "/dashboard/wizard" },
  expense:    { label: "지출 등록", href: "/dashboard/expense", wizardHref: "/dashboard/wizard" },
  estate:     { label: "재산관리", href: "/dashboard/estate" },
  settlement: { label: "결산작업", href: "/dashboard/settlement" },
  donors:     { label: "기부자 조회", href: "/dashboard/donors" },
  reports:    { label: "보고서 출력", href: "/dashboard/reports" },
  backup:     { label: "자료 백업", href: "/dashboard/backup" },
};

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("orgId");
  const orgType = req.nextUrl.searchParams.get("orgType") || "candidate";

  if (!orgId) {
    return NextResponse.json({ error: "orgId required" }, { status: 400 });
  }

  const numOrgId = Number(orgId);

  // 소유권 검증: 해당 orgId가 실제 존재하는지 확인
  const { count: orgExists } = await supabase
    .from("organ")
    .select("org_id", { count: "exact", head: true })
    .eq("org_id", numOrgId);
  if (!orgExists) {
    return NextResponse.json({ error: "invalid orgId" }, { status: 403 });
  }

  const stepIds = WORKFLOW_DEFINITIONS[orgType] || WORKFLOW_DEFINITIONS.candidate;

  const [customerRes, incomeRes, expenseRes, estateRes] = await Promise.all([
    supabase.from("customer").select("cust_id", { count: "exact", head: true }).eq("org_id", numOrgId),
    supabase.from("acc_book").select("acc_book_id", { count: "exact", head: true }).eq("org_id", numOrgId).eq("incm_sec_cd", 1),
    supabase.from("acc_book").select("acc_book_id", { count: "exact", head: true }).eq("org_id", numOrgId).eq("incm_sec_cd", 2),
    supabase.from("estate").select("estate_id", { count: "exact", head: true }).eq("org_id", numOrgId),
  ]);

  const counts: Record<string, number> = {
    organ: 1,
    customer: customerRes.count ?? 0,
    income: incomeRes.count ?? 0,
    expense: expenseRes.count ?? 0,
    estate: estateRes.count ?? 0,
  };

  const steps = stepIds.map((id) => ({
    id,
    ...STEP_META[id],
    completed: counts[id] > 0,
    count: counts[id],
  }));

  const currentStep = steps.find((s) => !s.completed)?.id || steps[steps.length - 1].id;

  return NextResponse.json({ steps, currentStep, orgType });
}
