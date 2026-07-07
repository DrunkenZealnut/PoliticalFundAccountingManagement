/* ------------------------------------------------------------------ */
/*  HWPX 서식 생성 공용 헬퍼 — FormInputPanel 에서 추출                    */
/*                                                                    */
/*  submission-forms 페이지(개별 다운로드)와 제출 마법사 GenerateStep      */
/*  (zip 묶음)이 같은 엔드포인트 매핑·payload 구성·파일명 규칙을 쓰도록     */
/*  분리했다. generateFormBlob 은 blob 만 반환하고 다운로드 방식은          */
/*  호출부가 결정한다(개별 저장 vs JSZip).                                */
/* ------------------------------------------------------------------ */
import { fmtKoreanDate } from "@/lib/hwpx/escape";
import type { HwpxFormDef } from "@/lib/hwpx/form-fields";

/** dataFill 서식 → 호출할 데이터 채움 API 경로. */
export const DATA_FILL_ENDPOINT: Record<NonNullable<HwpxFormDef["dataFill"]>, string> = {
  "income-ledger": "/api/hwpx/income-ledger",
  "accounting-report": "/api/hwpx/accounting-report",
  "reimbursement": "/api/hwpx/reimbursement-claim",
  "reimbursement-doclist": "/api/hwpx/reimbursement-doclist",
};

/** 서식 라벨 → 안전한 .hwpx 파일명. */
export const safeFileName = (label: string) =>
  `${label.replace(/[\\/:*?"<>|·\s]+/g, "_")}.hwpx`;

/** def.fields 값 → 전송 payload. 날짜 필드는 한글 표기(fmtKoreanDate)로 변환. 순수. */
export function buildFieldValues(
  def: HwpxFormDef,
  values: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of def.fields) {
    const raw = values[f.token] ?? "";
    out[f.token] = f.type === "date" && raw ? fmtKoreanDate(raw) : raw;
  }
  return out;
}

/** 서식별 생성 엔드포인트: dataFill 이면 데이터 채움 API, 아니면 토큰 치환 generate. */
export function endpointFor(def: HwpxFormDef): string {
  return def.dataFill ? DATA_FILL_ENDPOINT[def.dataFill] : "/api/hwpx/generate";
}

/**
 * 서식별 POST payload. dataFill 은 orgId(+formId 분기, 하이브리드면 values),
 * 일반 서식은 formId+values. (FormInputPanel 기존 두 핸들러의 payload 와 동일)
 */
export function buildPayload(
  def: HwpxFormDef,
  opts: { orgId: number | null; values?: Record<string, string> },
): Record<string, unknown> {
  if (def.dataFill) {
    const payload: Record<string, unknown> = { orgId: opts.orgId, formId: def.id };
    if (def.fields.length > 0) payload.values = buildFieldValues(def, opts.values ?? {});
    return payload;
  }
  return { formId: def.id, values: buildFieldValues(def, opts.values ?? {}) };
}

/**
 * 서식 1건 생성 → { filename, blob }. 실패 시 서버 에러 메시지로 throw.
 * dataFill 서식은 orgId 필수(없으면 throw — 호출부에서 기관 선택 검증).
 */
export async function generateFormBlob(
  def: HwpxFormDef,
  opts: { orgId: number | null; values?: Record<string, string> },
): Promise<{ filename: string; blob: Blob }> {
  if (def.dataFill && !opts.orgId) throw new Error("사용기관을 먼저 선택하세요.");
  const res = await fetch(endpointFor(def), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildPayload(def, opts)),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? `생성 실패 (${res.status})`);
  }
  return { filename: safeFileName(def.label), blob: await res.blob() };
}

/** Blob 을 첨부 파일로 다운로드(브라우저 전용). */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
