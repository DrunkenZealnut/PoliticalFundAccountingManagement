/**
 * POST /api/hwpx/accounting-report
 * 선택 org 의 수입·지출·재산 데이터를 (예비)후보자 회계보고서(공식 서식
 * 22-1 수입·지출보고서 / 22-2 선거비용 지출내역 집계표 / 22-3 재산명세서 /
 * 22-4 수입·지출부) 레이아웃으로 채운 .hwpx 를 반환한다.
 *
 * Request:  { orgId: number, formId: "22-1" | "22-2" | "22-3" | "22-4" }
 * Response: 200 application/hwp+zip (attachment) | 4xx/5xx { error }
 *
 * 흐름: 인증·멤버십 가드(income-ledger 동일) → 데이터 조회 → formId 분기:
 *   22-1 buildReportSummaryModel → summaryTokens → generateHwpx(셀 치환)
 *   22-2 buildElectionExpenseSummaryModel → electionExpenseSummaryTokens → generateHwpx(셀 치환)
 *   22-3 buildEstateModel → renderEstateSection(표 행 복제)
 *   22-4 buildIncomeLedgerModel → renderIncomeLedgerSection(표 행 복제)
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createSupabaseServer } from "@/lib/supabase/server";
import { generateHwpx, transformSection } from "@/lib/hwpx/generate";
import {
  buildIncomeLedgerModel,
  type IncomeLedgerInputRow,
} from "@/lib/hwpx/income-ledger-builder";
import { renderIncomeLedgerSection, renderEstateSection } from "@/lib/hwpx/owpml-table";
import {
  buildReportSummaryModel,
  summaryTokens,
  type ReportSummaryInputRow,
} from "@/lib/hwpx/report-summary-builder";
import { buildEstateModel, type EstateInputRow } from "@/lib/hwpx/estate-builder";
import {
  buildElectionExpenseSummaryModel,
  electionExpenseSummaryTokens,
  type ElectionExpenseSummaryInputRow,
} from "@/lib/hwpx/election-expense-summary-builder";
import { buildLedgerRows } from "@/lib/accounting/ledger-allocation";
import type { ReallocRow } from "@/lib/accounting/fund-realloc";

const CANDIDATE_ACC_SEC_CDS = [82, 83, 84, 85];

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { db: { schema: "pfam" } }
);

/** 지원 서식 → 채움 템플릿. */
const TEMPLATES: Record<string, string> = {
  "22-1": "form-22-1-fill.hwpx",
  "22-2": "form-22-2-fill.hwpx",
  "22-3": "form-22-3-fill.hwpx",
  "22-4": "form-22-4-fill.hwpx",
};
const FILENAMES: Record<string, string> = {
  "22-1": "예비후보자_회계보고서_수입·지출보고서.hwpx",
  "22-2": "예비후보자_회계보고서_선거비용지출내역집계표.hwpx",
  "22-3": "예비후보자_회계보고서_재산명세서.hwpx",
  "22-4": "예비후보자_회계보고서_수입·지출부.hwpx",
};

function errorResponse(code: string, message: string, status: number, extra?: object) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status });
}

export async function POST(request: NextRequest) {
  let body: { orgId?: unknown; formId?: unknown };
  try {
    body = (await request.json()) as { orgId?: unknown; formId?: unknown };
  } catch {
    return errorResponse("INVALID_REQUEST", "요청 본문이 올바른 JSON이 아닙니다.", 400);
  }

  const orgId = Number(body.orgId);
  if (!Number.isInteger(orgId) || orgId <= 0) {
    return errorResponse("INVALID_REQUEST", "유효한 orgId가 필요합니다.", 400);
  }
  const formId = String(body.formId ?? "");
  if (!TEMPLATES[formId]) {
    return errorResponse("INVALID_REQUEST", `지원하지 않는 서식입니다: ${formId}`, 400);
  }

  // 인증 + 멤버십 검증 (income-ledger route 와 동일 IDOR 가드)
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

  // 템플릿 로드 (공통)
  let template: Buffer;
  try {
    template = await readFile(join(process.cwd(), "public", "hwpx-templates", TEMPLATES[formId]));
  } catch (e) {
    return errorResponse("TEMPLATE_MISSING", `템플릿을 불러올 수 없습니다: ${TEMPLATES[formId]}`, 500, {
      detail: String(e),
    });
  }

  // formId 분기: 조회 + 렌더
  try {
    let bytes: Uint8Array;

    if (formId === "22-3") {
      // 재산명세서: estate 조회 → 구분별 그룹/소계/합계 → 표 행 동적 복제
      const { data: estates, error: estErr } = await supabase
        .from("estate")
        .select("estate_sec_cd, kind, qty, content, amt, remark")
        .eq("org_id", orgId)
        .order("estate_sec_cd")
        .order("estate_order");
      if (estErr) {
        return errorResponse("QUERY_FAILED", "재산내역 조회에 실패했습니다.", 500, { detail: estErr.message });
      }
      const model = buildEstateModel((estates ?? []) as unknown as EstateInputRow[]);
      bytes = await transformSection(template, (section) => renderEstateSection(section, model));
    } else {
      // 22-1/22-4: acc_book(수입+지출) + customer 상세 + codevalue.
      // 22-1 은 집계만 사용(customer 무시), 22-4 는 수입지출처 상세 필요 → 통합 조회.
      const { data: rows, error: rowsErr } = await supabase
        .from("acc_book")
        .select(
          "acc_book_id, acc_date, incm_sec_cd, acc_sec_cd, item_sec_cd, content, acc_amt, rcp_no, cust_id, " +
            "customer:cust_id(name, reg_num, addr, addr_detail, job, tel)"
        )
        .eq("org_id", orgId)
        .order("acc_date", { ascending: true });
      if (rowsErr) {
        return errorResponse("QUERY_FAILED", "수입·지출내역 조회에 실패했습니다.", 500, { detail: rowsErr.message });
      }
      const { data: cvs, error: cvErr } = await supabase.from("codevalue").select("cv_id, cv_name");
      if (cvErr) {
        return errorResponse("QUERY_FAILED", "코드 조회에 실패했습니다.", 500, { detail: cvErr.message });
      }
      const nameMap = new Map<number, string>((cvs ?? []).map((c) => [c.cv_id, c.cv_name]));
      const getName = (id: number) => nameMap.get(id) ?? String(id);

      // 후보자(자금원 82~85) 거래는 보고 시점 (계정×과목) 분할(buildLedgerRows) → acc_book_id로 원본 메타 조인.
      //   acc_book(데이터)은 실거래 원본 그대로, 회계보고서 생성 시에만 분할. 22-1/22-2/22-4 일관 적용.
      const rawRows = (rows ?? []) as unknown as {
        acc_book_id: number; incm_sec_cd: number; acc_sec_cd: number; item_sec_cd: number;
        acc_date: string; acc_time: string | null; content: string | null; acc_amt: number;
        rcp_no: string | null; cust_id: number;
      }[];
      let ledgerRows: typeof rawRows = rawRows;
      if (rawRows.some((r) => CANDIDATE_ACC_SEC_CDS.includes(Number(r.acc_sec_cd)))) {
        const origById = new Map(rawRows.map((r) => [r.acc_book_id, r]));
        const input: ReallocRow[] = rawRows.map((r) => ({
          acc_book_id: r.acc_book_id, incm_sec_cd: r.incm_sec_cd, acc_sec_cd: r.acc_sec_cd,
          item_sec_cd: r.item_sec_cd, acc_date: r.acc_date, acc_time: r.acc_time ?? null,
          acc_amt: Number(r.acc_amt), content: r.content ?? null, rcp_no: null, bigo: null,
          cust_id: r.cust_id, customer: null,
        }));
        ledgerRows = buildLedgerRows(input).map((lr) => {
          const o = origById.get(lr.acc_book_id)!;
          return { ...o, acc_sec_cd: lr.accSecCd, item_sec_cd: lr.itemSecCd, acc_amt: lr.amt, incm_sec_cd: lr.incm_sec_cd };
        });
      }

      if (formId === "22-4") {
        const model = buildIncomeLedgerModel(ledgerRows as unknown as IncomeLedgerInputRow[], getName);
        bytes = await transformSection(template, (section) => renderIncomeLedgerSection(section, model));
      } else if (formId === "22-2") {
        // 선거비용 지출내역 집계표: 선거비용 지출을 자금원 구분별 집계 → 고정 셀 토큰 치환
        const model = buildElectionExpenseSummaryModel(
          ledgerRows as unknown as ElectionExpenseSummaryInputRow[],
          getName,
        );
        ({ bytes } = await generateHwpx(template, electionExpenseSummaryTokens(model)));
      } else {
        // 22-1 총괄표: 고정 셀 토큰 치환
        const model = buildReportSummaryModel(ledgerRows as unknown as ReportSummaryInputRow[], getName);
        ({ bytes } = await generateHwpx(template, summaryTokens(model)));
      }
    }

    const filename = FILENAMES[formId];
    return new NextResponse(bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/hwp+zip",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse("GENERATE_FAILED", "회계보고서 생성 중 오류가 발생했습니다.", 500, {
      detail: String(e),
    });
  }
}
