/**
 * POST /api/hwpx/generate
 * 사전 제작 HWPX 템플릿의 {{토큰}}을 입력값으로 치환한 .hwpx 를 반환한다.
 *
 * Request:  { formId: string, values: Record<string,string> }
 * Response: 200 application/hwp+zip (attachment) | 4xx/5xx { error }
 *
 * 템플릿은 동일 origin의 정적 자산(/hwpx-templates/*)을 fetch 로 로드한다
 * (로컬·Vercel 양쪽에서 안정적). 토큰 치환은 lib/hwpx/generate 의 순수 코어 사용.
 */
import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { generateHwpx } from "@/lib/hwpx/generate";
import { getFormDef } from "@/lib/hwpx/form-fields";

interface GenerateBody {
  formId?: string;
  values?: Record<string, string>;
}

/** 필드 타입별 입력 길이 상한 (셀 폭 초과 쪽수 드리프트 + DoS 완화). */
const MAX_LEN: Record<string, number> = {
  tel: 40,
  account: 40,
  date: 20,
  text: 200,
  textarea: 1000,
};
const maxLenFor = (type: string) => MAX_LEN[type] ?? 200;

function errorResponse(code: string, message: string, status: number, extra?: object) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status });
}

export async function POST(request: NextRequest) {
  let body: GenerateBody;
  try {
    body = (await request.json()) as GenerateBody;
  } catch {
    return errorResponse("INVALID_REQUEST", "요청 본문이 올바른 JSON이 아닙니다.", 400);
  }

  const { formId, values } = body;
  if (!formId || typeof values !== "object" || values === null) {
    return errorResponse("INVALID_REQUEST", "formId와 values가 필요합니다.", 400);
  }

  const def = getFormDef(formId);
  if (!def) {
    return errorResponse("FORM_NOT_FOUND", `정의되지 않은 서식입니다: ${formId}`, 404);
  }

  // 필수 필드 2차 검증(서버)
  const missing = def.fields
    .filter((f) => f.required && !String(values[f.token] ?? "").trim())
    .map((f) => f.label);
  if (missing.length > 0) {
    return errorResponse("MISSING_REQUIRED", `필수 항목이 비어 있습니다: ${missing.join(", ")}`, 422, {
      fields: missing,
    });
  }

  // 입력 길이 제한 (쪽수 드리프트 + DoS 완화)
  const tooLong = def.fields
    .filter((f) => String(values[f.token] ?? "").length > maxLenFor(f.type))
    .map((f) => `${f.label}(≤${maxLenFor(f.type)}자)`);
  if (tooLong.length > 0) {
    return errorResponse("INVALID_LENGTH", `입력값이 너무 깁니다: ${tooLong.join(", ")}`, 422, {
      fields: tooLong,
    });
  }

  // 템플릿 로드 (파일시스템 — 인증 미들웨어 우회). public/hwpx-templates 는
  // next.config 의 outputFileTracingIncludes 로 서버리스 번들에 포함된다.
  let template: Buffer;
  try {
    template = await readFile(join(process.cwd(), "public", "hwpx-templates", def.template));
  } catch (e) {
    return errorResponse("TEMPLATE_MISSING", `템플릿을 불러올 수 없습니다: ${def.template}`, 500, {
      detail: String(e),
    });
  }

  // 정의된 토큰만 추려 치환 (화이트리스트)
  const safeValues: Record<string, string> = {};
  for (const field of def.fields) {
    safeValues[field.token] = String(values[field.token] ?? "");
  }

  try {
    const { bytes } = await generateHwpx(template, safeValues);
    const filename = `${def.label.replace(/[\\/:*?"<>|·\s]+/g, "_")}.hwpx`;
    return new NextResponse(bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/hwp+zip",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse("GENERATE_FAILED", "HWPX 생성 중 오류가 발생했습니다.", 500, {
      detail: String(e),
    });
  }
}
