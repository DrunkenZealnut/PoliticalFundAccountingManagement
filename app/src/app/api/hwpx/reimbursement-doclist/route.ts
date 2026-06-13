/**
 * POST /api/hwpx/reimbursement-doclist
 * 선택 org(후보자) 의 **보전 체크(acc_print_ok='Y')된 선거비용 지출** 을
 * 공직선거법 조항별 보전 항목(7종)으로 분류해 「선거비용 보전 첨부서류 점검목록표」
 * .hwpx 로 채워 반환한다. 첨부증빙은 evidence_file 메타데이터(매수·유형·파일명)만 기재.
 *
 * Request:  { orgId: number }
 * Response: 200 application/hwp+zip (attachment) | 4xx/5xx { error }
 *
 * 흐름: 인증·멤버십 가드(income-ledger 동일) → acc_book(지출+customer)·evidence_file
 *   조회 → 증빙 acc_book_id 집계 → buildDoclistModel → form-doclist-fill.hwpx
 *   표/행 동적 복제(renderDoclistSection) → 재패키징.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createSupabaseServer } from "@/lib/supabase/server";
import { transformSection } from "@/lib/hwpx/generate";
import { renderDoclistSection } from "@/lib/hwpx/owpml-table";
import {
  buildDoclistModel,
  type DoclistInputRow,
  type EvidenceSummary,
} from "@/lib/hwpx/reimbursement-doclist-builder";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { db: { schema: "pfam" } },
);

const TEMPLATE = "form-doclist-fill.hwpx";
const FILENAME = "선거비용보전_첨부서류목록.hwpx";

function errorResponse(code: string, message: string, status: number, extra?: object) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status });
}

export async function POST(request: NextRequest) {
  let body: { orgId?: unknown };
  try {
    body = (await request.json()) as { orgId?: unknown };
  } catch {
    return errorResponse("INVALID_REQUEST", "요청 본문이 올바른 JSON이 아닙니다.", 400);
  }

  const orgId = Number(body.orgId);
  if (!Number.isInteger(orgId) || orgId <= 0) {
    return errorResponse("INVALID_REQUEST", "유효한 orgId가 필요합니다.", 400);
  }

  // 인증 + 멤버십 검증 — service-role 은 RLS 우회하므로 SSR 쿠키 로그인 + user_organ
  // 소속을 확인해 타 기관 데이터 열람(IDOR)을 막는다. (income-ledger 동일)
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
    // 조회(병렬): 지출행(+거래처) / 증빙파일(org 격리). 모두 org_id 필터.
    const [rowsRes, evRes] = await Promise.all([
      supabase
        .from("acc_book")
        .select(
          "acc_book_id, acc_date, content, acc_amt, claim_amt, acc_print_ok, cust_id, " +
            "exp_group1_cd, exp_group2_cd, customer:cust_id(name, reg_num)",
        )
        .eq("org_id", orgId)
        .eq("incm_sec_cd", 2),
      supabase.from("evidence_file").select("acc_book_id, file_name, file_type").eq("org_id", orgId).order("file_id", { ascending: true }),
    ]);
    if (rowsRes.error) {
      return errorResponse("QUERY_FAILED", "지출내역 조회에 실패했습니다.", 500, { detail: rowsRes.error.message });
    }
    if (evRes.error) {
      return errorResponse("QUERY_FAILED", "증빙파일 조회에 실패했습니다.", 500, { detail: evRes.error.message });
    }

    // 증빙 집계: acc_book_id → {images, docs, firstName}
    const evidence = new Map<number, EvidenceSummary>();
    for (const f of evRes.data ?? []) {
      const id = f.acc_book_id as number | null;
      if (id == null) continue;
      const cur = evidence.get(id) ?? { images: 0, docs: 0, firstName: "" };
      if (String(f.file_type ?? "").startsWith("image/")) cur.images++;
      else cur.docs++;
      if (!cur.firstName) cur.firstName = String(f.file_name ?? "");
      evidence.set(id, cur);
    }

    const model = buildDoclistModel(
      (rowsRes.data ?? []) as unknown as DoclistInputRow[],
      evidence,
    );

    // 템플릿 → section 렌더 → 재패키징 (ZIP 1회 해제)
    const bytes = await transformSection(template, (section) => renderDoclistSection(section, model));

    return new NextResponse(bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/hwp+zip",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(FILENAME)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse("GENERATE_FAILED", "보전 첨부서류목록 생성 중 오류가 발생했습니다.", 500, {
      detail: String(e),
    });
  }
}
