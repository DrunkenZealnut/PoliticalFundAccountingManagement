/**
 * POST /api/system/recompute-settlement
 *
 * 선관위 PFund2와 동일한 결산 보정을 적용하여 합계를 재계산하고,
 * opinion 테이블의 in_amt/cm_amt/balance_amt를 동기화한다.
 *
 * Request body:
 *   {
 *     orgId: number,
 *     dryRun?: boolean,
 *     redistribution?: {
 *       enabled: boolean,
 *       caps?: Record<string, number>,
 *       redistributeSupporterRemainder?: boolean,
 *     }
 *   }
 *
 * 보정 규칙은 lib/accounting/settlement-calc.computeBalances를 단일 진실원천으로 사용.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  computeBalances,
  type AccBookRow,
  type ReimbursementCaps,
} from "@/lib/accounting/settlement-calc";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { db: { schema: "pfam" } },
);

interface RecomputeRequest {
  orgId?: number;
  dryRun?: boolean;
  redistribution?: {
    enabled?: boolean;
    caps?: Record<string, number>;
    redistributeSupporterRemainder?: boolean;
  };
}

export async function POST(request: NextRequest) {
  let body: RecomputeRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const orgId = Number(body.orgId);
  if (!Number.isFinite(orgId) || orgId <= 0) {
    return NextResponse.json(
      { error: "orgId is required (positive integer)" },
      { status: 400 },
    );
  }
  const dryRun = body.dryRun === true;

  // 1) Fetch all acc_book rows for this org
  const { data: accBook, error: accErr } = await supabase
    .from("acc_book")
    .select("acc_book_id, org_id, incm_sec_cd, acc_sec_cd, item_sec_cd, exp_sec_cd, acc_date, acc_amt")
    .eq("org_id", orgId);

  if (accErr) {
    return NextResponse.json(
      { error: `acc_book fetch failed: ${accErr.message}` },
      { status: 500 },
    );
  }

  const rows: AccBookRow[] = (accBook ?? []).map((r) => ({
    acc_book_id: r.acc_book_id,
    org_id: r.org_id,
    incm_sec_cd: r.incm_sec_cd,
    acc_sec_cd: r.acc_sec_cd,
    item_sec_cd: r.item_sec_cd,
    exp_sec_cd: r.exp_sec_cd ?? 0,
    acc_date: r.acc_date,
    acc_amt: Number(r.acc_amt),
  }));

  // 2) Compute settlement with SSOT rules (재배분 옵션 적용)
  const redistInput = body.redistribution;
  const applyFundSourceRedistribution = redistInput?.enabled === true;
  let reimbursementCaps: ReimbursementCaps | undefined;
  if (applyFundSourceRedistribution) {
    const byAccSecCd: Record<number, number> = {};
    for (const [k, v] of Object.entries(redistInput?.caps ?? {})) {
      const key = Number(k);
      if (Number.isFinite(key) && typeof v === "number") byAccSecCd[key] = v;
    }
    reimbursementCaps = {
      byAccSecCd,
      redistributeSupporterRemainder:
        redistInput?.redistributeSupporterRemainder ?? true,
    };
  }
  const result = computeBalances(rows, {
    applyFundSourceRedistribution,
    reimbursementCaps,
  });

  // 3) Optionally read estate total for OPINION.estate_amt
  const { data: estateRows } = await supabase
    .from("estate")
    .select("amt, qty")
    .eq("org_id", orgId);
  const estateTotal = (estateRows ?? []).reduce(
    (acc, row) => acc + Number(row.amt ?? 0) * Number(row.qty ?? 1),
    0,
  );

  let opinionUpdated = false;
  if (!dryRun) {
    const { error } = await supabase
      .from("opinion")
      .upsert(
        {
          org_id: orgId,
          in_amt: result.incomeTotal,
          cm_amt: result.expenseTotal,
          balance_amt: result.balance,
          estate_amt: estateTotal,
        },
        { onConflict: "org_id" },
      );
    if (error) {
      return NextResponse.json(
        { error: `opinion upsert failed: ${error.message}` },
        { status: 500 },
      );
    }
    opinionUpdated = true;
  }

  return NextResponse.json({
    ok: true,
    orgId,
    income: result.incomeTotal,
    expense: result.expenseTotal,
    balance: result.balance,
    estate: estateTotal,
    correctionsCount: result.corrections.length,
    accountsCount: result.byAccount.length,
    redistributions: result.redistributions,
    opinionUpdated,
    dryRun,
  });
}
