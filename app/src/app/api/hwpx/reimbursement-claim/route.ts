/**
 * POST /api/hwpx/reimbursement-claim
 * 선택 org 의 **보전 체크(acc_print_ok='Y')된 선거비용** 지출을 자금원별로 집계해
 * 「선거비용 보전청구서」(공식 서식 43) 레이아웃으로 채운 .hwpx 를 반환한다.
 *
 * Request:  { orgId: number, values?: Record<string,string> }
 *   values: 본문 텍스트 토큰(선거명·선거구명·후보자명·수령계좌·선관위명) 수동 입력.
 *           미제공·화이트리스트 외 키는 빈칸 처리.
 * Response: 200 application/hwp+zip (attachment) | 4xx/5xx { error }
 *
 * 흐름: 인증·멤버십 가드(accounting-report 동일) → acc_book·codevalue·organ 조회 →
 *   buildReimbursementClaimModel → claimTableTokens + claimTotalTokens +
 *   텍스트 토큰(values 우선, organ/고정값 fallback) → generateHwpx(셀·본문 치환).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createSupabaseServer } from "@/lib/supabase/server";
import { generateHwpx } from "@/lib/hwpx/generate";
import { getFormDef } from "@/lib/hwpx/form-fields";
import { claimTableTokens, claimTotalTokens } from "@/lib/hwpx/reimbursement-claim-builder";
import {
  aggregateReimbursementByFundingSource,
  type AccBookRow,
} from "@/lib/accounting/reimbursement-aggregator";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { db: { schema: "pfam" } },
);

const TEMPLATE = "form-43-fill.hwpx";
const FILENAME = "선거비용보전청구서.hwpx";
const MAX_LEN = 200;
/** 본문에 채울 수 있는 텍스트 토큰 = 서식 43 fields(form-fields SSOT). 그 외 values 키는 무시. */
const TEXT_TOKENS = (getFormDef("43")?.fields ?? []).map((f) => f.token);

function errorResponse(code: string, message: string, status: number, extra?: object) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status });
}

export async function POST(request: NextRequest) {
  let body: { orgId?: unknown; values?: unknown };
  try {
    body = (await request.json()) as { orgId?: unknown; values?: unknown };
  } catch {
    return errorResponse("INVALID_REQUEST", "요청 본문이 올바른 JSON이 아닙니다.", 400);
  }

  const orgId = Number(body.orgId);
  if (!Number.isInteger(orgId) || orgId <= 0) {
    return errorResponse("INVALID_REQUEST", "유효한 orgId가 필요합니다.", 400);
  }
  const rawValues =
    body.values && typeof body.values === "object" && !Array.isArray(body.values)
      ? (body.values as Record<string, unknown>)
      : {};

  // 인증 + 멤버십 검증 (accounting-report route 와 동일 IDOR 가드)
  const server = await createSupabaseServer();
  const {
    data: { user },
  } = await server.auth.getUser();
  if (!user) {
    return errorResponse("UNAUTHORIZED", "로그인이 필요합니다.", 401);
  }
  const { data: membership, error: membershipError } = await supabase
    .from("user_organ")
    .select("org_id")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (membershipError) {
    return errorResponse("AUTH_CHECK_FAILED", "권한 확인 중 오류가 발생했습니다.", 500, {
      detail: membershipError.message,
    });
  }
  if (!membership) {
    return errorResponse("FORBIDDEN", "해당 기관에 대한 권한이 없습니다.", 403);
  }

  // 템플릿 로드
  let template: Buffer;
  try {
    template = await readFile(join(process.cwd(), "public", "hwpx-templates", TEMPLATE));
  } catch (e) {
    return errorResponse("TEMPLATE_MISSING", `템플릿을 불러올 수 없습니다: ${TEMPLATE}`, 500, {
      detail: String(e),
    });
  }

  try {
    // 조회: acc_book(보전체크 포함) + codevalue + organ — 서로 독립이므로 병렬
    const [rowsRes, cvRes, organRes] = await Promise.all([
      supabase
        .from("acc_book")
        .select("acc_book_id, incm_sec_cd, acc_sec_cd, item_sec_cd, acc_amt, claim_amt, acc_print_ok")
        .eq("org_id", orgId)
        .eq("incm_sec_cd", 2),
      supabase.from("codevalue").select("cv_id, cv_name"),
      supabase.from("organ").select("org_name, rep_name").eq("org_id", orgId).maybeSingle(),
    ]);
    if (rowsRes.error) {
      return errorResponse("QUERY_FAILED", "수입·지출내역 조회에 실패했습니다.", 500, { detail: rowsRes.error.message });
    }
    if (cvRes.error) {
      return errorResponse("QUERY_FAILED", "코드 조회에 실패했습니다.", 500, { detail: cvRes.error.message });
    }
    const organ = organRes.data;

    // 선거비용 과목(cv_name==="선거비용") + 자금원 코드명 — Excel claim-form/aggregate 와 동일 SSOT
    const electionExpenseItemCds: number[] = [];
    const accSecCdNames: Record<number, string> = {};
    for (const cv of cvRes.data ?? []) {
      const id = cv.cv_id as number;
      const name = String(cv.cv_name ?? "");
      if (name === "선거비용") electionExpenseItemCds.push(id);
      accSecCdNames[id] = name;
    }

    const { byFundingSource } = aggregateReimbursementByFundingSource({
      rows: (rowsRes.data ?? []) as AccBookRow[],
      electionExpenseItemCds,
      accSecCdNames,
    });

    // 본문 텍스트 토큰: values 우선(화이트리스트·길이 제한), 핵심 항목은 organ/고정값 fallback
    const textTokens: Record<string, string> = {};
    for (const k of TEXT_TOKENS) {
      const v = rawValues[k];
      textTokens[k] = typeof v === "string" ? v.slice(0, MAX_LEN) : "";
    }
    if (!textTokens.선거명) textTokens.선거명 = "제9회 전국동시지방선거";
    if (!textTokens.후보자명) textTokens.후보자명 = organ?.rep_name ?? organ?.org_name ?? "";

    const tokens = { ...claimTableTokens(byFundingSource), ...claimTotalTokens(byFundingSource), ...textTokens };
    const { bytes } = await generateHwpx(template, tokens);

    return new NextResponse(bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/hwp+zip",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(FILENAME)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse("GENERATE_FAILED", "보전청구서 생성 중 오류가 발생했습니다.", 500, {
      detail: String(e),
    });
  }
}
