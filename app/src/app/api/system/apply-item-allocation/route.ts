/**
 * POST /api/system/apply-item-allocation
 *
 * 후보자 acc_book을 공식 Fund_Data_1.db와 동일한 (계정×과목) 균형 구조로 영구화한다.
 * 계산은 buildLedgerRows/planAllocationPersist(순수, lib/accounting), 쓰기는 RPC
 * pfam.apply_item_allocation(scripts/017, 단일 트랜잭션)이 수행한다. scripts/016·017 선행 필수.
 *
 * Request body:
 *   { orgId: number, dryRun?: boolean, rollback?: boolean, generation?: string(YYYYMMDD) }
 *
 * 동작:
 *   - rollback=true: 배분 해제(이동분 삭제 + slice0 raw 복원).
 *   - dryRun=true: 계획·균형 미리보기만(write 없음).
 *   - 그 외: 불변식(무음수·합보존) 검사 통과 시 RPC로 영구화. 위반 시 422(미기록).
 *
 * 후보자 기관(org_sec_cd ∈ CANDIDATE_SEC_CDS)만 허용. 그 외는 400.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { CANDIDATE_SEC_CDS } from "@/lib/accounting/organ-pair";
import { compareAccDateTime } from "@/lib/accounting/acc-book-sort";
import {
  planAllocationPersist,
  planRollback,
  applyPlanInMemory,
  type AllocTrackedRow,
  type AllocPersistPlan,
} from "@/lib/accounting/persist-allocation";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { db: { schema: "pfam" } },
);

interface ApplyRequest {
  orgId?: number;
  dryRun?: boolean;
  rollback?: boolean;
  generation?: string;
}

const num = (v: unknown): number => (v == null ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));

/** YYYYMMDD (서버 로컬). */
function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * (계정×과목)별 시간순 잔액 요약 + 무음수(I2) 판정.
 * 합보존(I1)은 buildLedgerRows가 보장(단위테스트)하므로 여기선 무음수만 게이트.
 */
function summarize(rows: AllocTrackedRow[]) {
  const sorted = [...rows].sort(
    (a, b) => compareAccDateTime(a, b) || a.incm_sec_cd - b.incm_sec_cd || a.acc_book_id - b.acc_book_id,
  );
  const acc = new Map<string, { accSecCd: number; itemSecCd: number; income: number; expense: number; balance: number; minBalance: number }>();
  let income = 0;
  let expense = 0;
  for (const r of sorted) {
    const key = `${r.acc_sec_cd}:${r.item_sec_cd}`;
    const e = acc.get(key) ?? { accSecCd: r.acc_sec_cd, itemSecCd: r.item_sec_cd, income: 0, expense: 0, balance: 0, minBalance: 0 };
    if (r.incm_sec_cd === 1) {
      e.income += r.acc_amt;
      e.balance += r.acc_amt;
      income += r.acc_amt;
    } else {
      e.expense += r.acc_amt;
      e.balance -= r.acc_amt;
      expense += r.acc_amt;
    }
    e.minBalance = Math.min(e.minBalance, e.balance);
    acc.set(key, e);
  }
  const byAccountItem = [...acc.values()].sort((a, b) => a.accSecCd - b.accSecCd || a.itemSecCd - b.itemSecCd);
  const hasNegative = byAccountItem.some((b) => b.minBalance < -0.5); // 부동소수 여유
  return { byAccountItem, totalIncome: income, totalExpense: expense, cashBalance: income - expense, hasNegative };
}

export async function POST(request: NextRequest) {
  let body: ApplyRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const orgId = Number(body.orgId);
  if (!Number.isFinite(orgId) || orgId <= 0) {
    return NextResponse.json({ error: "orgId is required (positive integer)" }, { status: 400 });
  }
  const dryRun = body.dryRun === true;
  const rollback = body.rollback === true;
  const generation = body.generation && /^\d{8}$/.test(body.generation) ? body.generation : todayYmd();

  // 1) 후보자 기관 가드
  const { data: organ, error: organErr } = await supabase
    .from("organ")
    .select("org_sec_cd")
    .eq("org_id", orgId)
    .maybeSingle();
  if (organErr) {
    return NextResponse.json({ error: `organ fetch failed: ${organErr.message}` }, { status: 500 });
  }
  if (!organ) {
    return NextResponse.json({ error: `org ${orgId} not found` }, { status: 404 });
  }
  if (!CANDIDATE_SEC_CDS.has(Number(organ.org_sec_cd))) {
    return NextResponse.json(
      { error: "과목 배분은 후보자 기관에만 적용됩니다.", orgSecCd: organ.org_sec_cd },
      { status: 400 },
    );
  }

  // 2) 현재 acc_book 행 전부 조회(메타·추적컬럼 포함)
  const { data: accRows, error: accErr } = await supabase.from("acc_book").select("*").eq("org_id", orgId);
  if (accErr) {
    return NextResponse.json({ error: `acc_book fetch failed: ${accErr.message}` }, { status: 500 });
  }
  const current: AllocTrackedRow[] = (accRows ?? []).map((r) => ({
    ...r,
    acc_book_id: Number(r.acc_book_id),
    incm_sec_cd: Number(r.incm_sec_cd),
    acc_sec_cd: Number(r.acc_sec_cd),
    item_sec_cd: Number(r.item_sec_cd),
    acc_amt: num(r.acc_amt),
    acc_date: String(r.acc_date),
    acc_time: r.acc_time ?? null,
    cust_id: Number(r.cust_id),
    content: r.content ?? null,
    rcp_no: r.rcp_no ?? null,
    rcp_no2: numOrNull(r.rcp_no2),
    bigo: r.bigo ?? null,
    customer: null,
    alloc_src_id: numOrNull(r.alloc_src_id),
    alloc_seq: numOrNull(r.alloc_seq),
    raw_incm_sec_cd: numOrNull(r.raw_incm_sec_cd),
    raw_acc_sec_cd: numOrNull(r.raw_acc_sec_cd),
    raw_item_sec_cd: numOrNull(r.raw_item_sec_cd),
    raw_acc_amt: numOrNull(r.raw_acc_amt),
    alloc_gen: r.alloc_gen ?? null,
  }));

  // 3) 계획 산출(rollback vs apply)
  let plan: AllocPersistPlan;
  try {
    plan = rollback ? planRollback(current) : planAllocationPersist(current, generation);
  } catch (e) {
    return NextResponse.json({ error: `allocation planning failed: ${(e as Error).message}` }, { status: 500 });
  }

  // 4) 적용 결과 미리보기 + 무음수 불변식 검사(apply 경로만)
  const applied = applyPlanInMemory(current, plan);
  const summary = summarize(applied);

  if (!rollback && summary.hasNegative) {
    return NextResponse.json(
      {
        ok: false,
        error: "무음수 불변식 위반 — (계정×과목) 음수 잔액이 남습니다. 영구화하지 않았습니다(통장 누적 음수=데이터 점검 필요).",
        negativeAccounts: summary.byAccountItem.filter((b) => b.minBalance < -0.5),
        dryRun,
      },
      { status: 422 },
    );
  }

  // 5) dryRun → 미리보기만
  if (dryRun) {
    return NextResponse.json({ ok: true, orgId, dryRun: true, rollback, generation, plan: plan.stats, summary });
  }

  // 6) 영구화 RPC (단일 트랜잭션)
  const { data: rpcData, error: rpcErr } = await supabase.rpc("apply_item_allocation", {
    p_org_id: orgId,
    p_generation: rollback ? "" : generation,
    p_updates: plan.updates,
    p_inserts: plan.inserts,
  });
  if (rpcErr) {
    return NextResponse.json({ error: `apply_item_allocation RPC failed: ${rpcErr.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, orgId, rollback, generation, plan: plan.stats, summary, rpc: rpcData });
}
