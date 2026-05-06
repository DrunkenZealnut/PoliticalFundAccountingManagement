import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  aggregateReimbursementByFundingSource,
  type AccBookRow,
} from "@/lib/accounting/reimbursement-aggregator";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { db: { schema: "pfam" } },
);

interface RequestBody {
  orgId: number;
}

export async function POST(request: NextRequest) {
  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }
  if (!body.orgId || typeof body.orgId !== "number") {
    return NextResponse.json({ error: "orgId 필수" }, { status: 400 });
  }

  // 1. 코드값에서 "선거비용" 과목(item_sec_cd) 목록 조회
  // codevalue.cs_id=20이 과목, cv_name이 "선거비용"인 모든 cv_id
  const { data: items, error: itemErr } = await supabase
    .from("codevalue")
    .select("cv_id, cv_name");
  if (itemErr) {
    return NextResponse.json({ error: itemErr.message }, { status: 500 });
  }

  const electionExpenseItemCds: number[] = [];
  const accSecCdNames: Record<number, string> = {};
  for (const cv of items ?? []) {
    const id = cv.cv_id as number;
    const name = String(cv.cv_name ?? "");
    // "선거비용" 정확 매칭 (선거비용외 정치자금 제외)
    if (name === "선거비용") electionExpenseItemCds.push(id);
    accSecCdNames[id] = name;
  }

  // 2. 해당 org의 지출 거래 조회
  const { data: rows, error: rowErr } = await supabase
    .from("acc_book")
    .select("acc_book_id, acc_sec_cd, item_sec_cd, acc_amt, acc_print_ok, incm_sec_cd")
    .eq("org_id", body.orgId)
    .eq("incm_sec_cd", 2);
  if (rowErr) {
    return NextResponse.json({ error: rowErr.message }, { status: 500 });
  }

  // 3. 자금원별 집계
  const result = aggregateReimbursementByFundingSource({
    rows: (rows ?? []) as AccBookRow[],
    electionExpenseItemCds,
    accSecCdNames,
  });

  return NextResponse.json(result);
}
