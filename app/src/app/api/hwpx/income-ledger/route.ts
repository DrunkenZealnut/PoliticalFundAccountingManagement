/**
 * POST /api/hwpx/income-ledger
 * 선택 org 의 수입내역(incm_sec_cd=1)을 (예비)후보자 정치자금 수입계정별
 * 회계장부(공식 서식 7) 레이아웃으로 채운 .hwpx 를 반환한다.
 *
 * Request:  { orgId: number }
 * Response: 200 application/hwp+zip (attachment) | 4xx/5xx { error }
 *
 * 흐름: acc_book(+customer 상세) 조회 → codevalue 코드명 맵 →
 *       buildIncomeLedgerModel → form-7-fill.hwpx 표/행 복제 → 재패키징.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import JSZip from "jszip";
import { createSupabaseServer } from "@/lib/supabase/server";
import { repackageSection } from "@/lib/hwpx/generate";
import {
  buildIncomeLedgerModel,
  type IncomeLedgerInputRow,
} from "@/lib/hwpx/income-ledger-builder";
import { buildLedgerRows } from "@/lib/accounting/ledger-allocation";
import { detectCandidateShortfalls } from "@/lib/accounting/income-expense-report-summary";
import { logShortfalls, shortfallHeaders } from "@/lib/accounting/shortfall-surface";
import { CANDIDATE_SEC_CDS } from "@/lib/accounting/organ-pair";
import type { ReallocRow, Shortfall } from "@/lib/accounting/fund-realloc";
import { renderIncomeLedgerSection } from "@/lib/hwpx/owpml-table";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { db: { schema: "pfam" } }
);

const TEMPLATE = "form-7-fill.hwpx";
const SECTION_PATH = "Contents/section0.xml";

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

  // 인증 + 멤버십 검증 — service-role 은 RLS 를 우회하므로, SSR 쿠키의 로그인
  // 사용자 + user_organ 소속을 확인해야 타 기관 데이터 열람(IDOR)을 막는다.
  // (/api/organ 과 동일한 가드)
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

  // 0. 기관 유형(org_sec_cd) — acc_rel 표준 계정·과목 조합 조회에 사용.
  const { data: org, error: orgErr } = await supabase
    .from("organ")
    .select("org_sec_cd")
    .eq("org_id", orgId)
    .maybeSingle();
  if (orgErr) {
    return errorResponse("QUERY_FAILED", "기관 정보 조회에 실패했습니다.", 500, { detail: orgErr.message });
  }
  const orgSecCd = Number(org?.org_sec_cd);

  // 0b. 표준 계정·과목 조합 (acc_rel). 거래가 없는 계정·과목도 빈 표(빈 행 1개)로
  //     생성하기 위해, 해당 기관 유형의 input_yn='Y' 행에서 (acc_sec_cd,item_sec_cd)
  //     유니크 조합을 acc_order 순으로 추린다. 조회 실패/없음이면 기존 동작(실거래만).
  let standardCombos: { accSecCd: number; itemSecCd: number }[] | undefined;
  if (Number.isFinite(orgSecCd) && orgSecCd > 0) {
    const { data: accRels, error: arErr } = await supabase
      .from("acc_rel")
      .select("acc_sec_cd, item_sec_cd, acc_order")
      .eq("org_sec_cd", orgSecCd)
      .eq("input_yn", "Y")
      .order("acc_order", { ascending: true });
    if (arErr) {
      return errorResponse("QUERY_FAILED", "계정·과목 구성 조회에 실패했습니다.", 500, { detail: arErr.message });
    }
    const seenCombo = new Set<string>();
    standardCombos = [];
    for (const r of accRels ?? []) {
      const key = `${r.acc_sec_cd}:${r.item_sec_cd}`;
      if (seenCombo.has(key)) continue;
      seenCombo.add(key);
      standardCombos.push({ accSecCd: r.acc_sec_cd, itemSecCd: r.item_sec_cd });
    }
  }

  // 1. 수입·지출행 + customer 상세 (org 스코프 강제). 서식 7은 수입·지출부이므로
  //    incm_sec_cd 필터 없이 모두 조회 → 계정·과목 그룹 내에서 수입·지출을 합산.
  const { data: rows, error: rowsErr } = await supabase
    .from("acc_book")
    .select(
      "acc_book_id, acc_date, incm_sec_cd, acc_sec_cd, item_sec_cd, content, acc_amt, rcp_no, cust_id, " +
        "customer:cust_id(name, reg_num, addr, addr_detail, job, tel)"
    )
    .eq("org_id", orgId)
    // 정렬 SSOT(acc-book-sort): acc_date → acc_sort_num → acc_book_id. 같은 날 순서는 수입·지출부
    // 빌더가 compareAccDateTime + tie-break(수입 먼저)로 재정렬하므로 결정적 보조키만 부여한다.
    .order("acc_date", { ascending: true })
    .order("acc_sort_num", { ascending: true, nullsFirst: true })
    .order("acc_book_id", { ascending: true });

  if (rowsErr) {
    return errorResponse("QUERY_FAILED", "수입·지출내역 조회에 실패했습니다.", 500, { detail: rowsErr.message });
  }

  // 2. codevalue 코드명 맵 (계정명/과목명)
  const { data: cvs, error: cvErr } = await supabase.from("codevalue").select("cv_id, cv_name");
  if (cvErr) {
    return errorResponse("QUERY_FAILED", "코드 조회에 실패했습니다.", 500, { detail: cvErr.message });
  }
  const nameMap = new Map<number, string>((cvs ?? []).map((c) => [c.cv_id, c.cv_name]));
  const getName = (id: number) => nameMap.get(id) ?? String(id);

  // 3. 후보자: 보고 시점 (계정×과목) 분할(buildLedgerRows) → acc_book_id로 원본 메타 조인.
  //    acc_book(데이터)은 실거래 원본 그대로, 보고서 생성 시에만 금액 분할. 비후보자는 원본.
  const rawRows = (rows ?? []) as unknown as (IncomeLedgerInputRow & {
    acc_book_id: number;
    cust_id: number;
    acc_amt: number;
  })[];
  let ledgerInput: IncomeLedgerInputRow[];
  // 통장 전체 부족(데이터 오류) 신호 — 생성은 막지 않고 표면화(은폐 금지). 후보자만 산출.
  let shortfalls: Shortfall[] = [];
  if (CANDIDATE_SEC_CDS.has(orgSecCd)) {
    // 통장 부족(총지출 > 총수입) 진단 — page 총괄·22-1과 동일 SSOT(detectCandidateShortfalls). 상세는 서버 로그에만.
    shortfalls = detectCandidateShortfalls(rawRows);
    logShortfalls("hwpx/income-ledger", `org=${orgId}`, shortfalls);
    const origById = new Map(rawRows.map((r) => [r.acc_book_id, r]));
    const reallocInput: ReallocRow[] = rawRows.map((r) => ({
      acc_book_id: r.acc_book_id,
      incm_sec_cd: r.incm_sec_cd,
      acc_sec_cd: r.acc_sec_cd,
      item_sec_cd: r.item_sec_cd,
      acc_date: r.acc_date,
      acc_amt: Number(r.acc_amt),
      content: r.content ?? null,
      rcp_no: null,
      bigo: null,
      cust_id: r.cust_id,
      customer: null,
    }));
    ledgerInput = buildLedgerRows(reallocInput).map((lr) => {
      const o = origById.get(lr.acc_book_id)!;
      // acc_date: Pass4 이동 날짜 반영(서식7/22-4 누계잔액≥0). 미전파 시 원 날짜로 음수 누계가 찍힌다.
      return { ...o, acc_sec_cd: lr.accSecCd, item_sec_cd: lr.itemSecCd, acc_amt: lr.amt, incm_sec_cd: lr.incm_sec_cd, acc_date: lr.acc_date };
    });
  } else {
    ledgerInput = rawRows;
  }

  // 뷰모델 (표준 계정·과목 조합 전달 → 거래 없는 계정도 빈 표로 생성)
  const model = buildIncomeLedgerModel(ledgerInput, getName, standardCombos);

  // 4. 템플릿 로드 → section 렌더 → 재패키징
  let template: Buffer;
  try {
    template = await readFile(join(process.cwd(), "public", "hwpx-templates", TEMPLATE));
  } catch (e) {
    return errorResponse("TEMPLATE_MISSING", `템플릿을 불러올 수 없습니다: ${TEMPLATE}`, 500, {
      detail: String(e),
    });
  }

  try {
    const zip = await JSZip.loadAsync(template);
    const secFile = zip.file(SECTION_PATH);
    if (!secFile) throw new Error(`${SECTION_PATH} 없음`);
    const section = await secFile.async("string");
    const newSection = renderIncomeLedgerSection(section, model);
    const bytes = await repackageSection(template, newSection);

    const filename = "예비후보자_정치자금_수입계정별_회계장부.hwpx";
    return new NextResponse(bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/hwp+zip",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
        // 통장 부족 표면화(은폐 금지). 보안: 건수만 노출, 거래 상세는 서버 로그에만(shortfall-surface SSOT).
        ...shortfallHeaders(shortfalls),
      },
    });
  } catch (e) {
    return errorResponse("GENERATE_FAILED", "회계장부 생성 중 오류가 발생했습니다.", 500, {
      detail: String(e),
    });
  }
}
