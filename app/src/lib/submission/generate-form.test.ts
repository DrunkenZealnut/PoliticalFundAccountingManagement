import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  safeFileName,
  buildFieldValues,
  endpointFor,
  buildPayload,
  generateFormBlob,
} from "./generate-form";
import { getFormDef } from "@/lib/hwpx/form-fields";

const form7 = getFormDef("7")!; // dataFill: income-ledger, fields 없음
const form43 = getFormDef("43")!; // dataFill: reimbursement, 하이브리드(수동 필드)
const form20 = getFormDef("20")!; // 빈 양식(dataFill 없음, fields 없음)
const form221 = getFormDef("22-1")!; // dataFill: accounting-report

describe("safeFileName", () => {
  it("경로·특수문자·공백을 _ 로 치환하고 .hwpx 확장자", () => {
    expect(safeFileName("(예비)후보자 회계보고서(수입·지출보고서)")).toBe(
      "(예비)후보자_회계보고서(수입_지출보고서).hwpx",
    );
  });
});

describe("endpointFor", () => {
  it("dataFill 별 엔드포인트 매핑", () => {
    expect(endpointFor(form7)).toBe("/api/hwpx/income-ledger");
    expect(endpointFor(form221)).toBe("/api/hwpx/accounting-report");
    expect(endpointFor(form43)).toBe("/api/hwpx/reimbursement-claim");
    expect(endpointFor(getFormDef("보전목록")!)).toBe("/api/hwpx/reimbursement-doclist");
  });
  it("일반/빈 양식은 generate", () => {
    expect(endpointFor(form20)).toBe("/api/hwpx/generate");
  });
});

describe("buildFieldValues", () => {
  it("date 타입 필드는 한글 날짜로 변환, 미입력은 빈 문자열", () => {
    const def = getFormDef("1-1")!; // 인계인수서: date 필드 보유
    const dateField = def.fields.find((f) => f.type === "date");
    if (!dateField) return; // 픽스처 가드
    const out = buildFieldValues(def, { [dateField.token]: "2026-06-03" });
    expect(out[dateField.token]).toContain("2026");
    expect(out[dateField.token]).not.toBe("2026-06-03"); // 한글 표기 변환됨
  });
});

describe("buildPayload", () => {
  it("dataFill(필드 없음): orgId+formId 만", () => {
    expect(buildPayload(form7, { orgId: 5 })).toEqual({ orgId: 5, formId: "7" });
  });
  it("dataFill 하이브리드(서식43): orgId+formId+values", () => {
    const p = buildPayload(form43, { orgId: 5, values: { 선거구명: "송파구" } });
    expect(p.orgId).toBe(5);
    expect(p.formId).toBe("43");
    expect((p.values as Record<string, string>).선거구명).toBe("송파구");
  });
  it("일반 서식: formId+values(orgId 없음)", () => {
    const p = buildPayload(form20, { orgId: 5 });
    expect(p).toEqual({ formId: "20", values: {} });
  });
});

describe("generateFormBlob", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("성공: 매핑된 엔드포인트로 POST, {filename, blob} 반환", async () => {
    const blob = new Blob(["hwpx"]);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      blob: async () => blob,
    });
    const r = await generateFormBlob(form7, { orgId: 5 });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/hwpx/income-ledger",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ orgId: 5, formId: "7" }),
      }),
    );
    expect(r.blob).toBe(blob);
    expect(r.filename.endsWith(".hwpx")).toBe(true);
  });

  it("실패: 서버 에러 메시지로 throw", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: "회계기간이 없습니다" } }),
    });
    await expect(generateFormBlob(form7, { orgId: 5 })).rejects.toThrow("회계기간이 없습니다");
  });

  it("실패(본문 없음): 상태코드 메시지로 throw", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("no json");
      },
    });
    await expect(generateFormBlob(form7, { orgId: 5 })).rejects.toThrow("생성 실패 (500)");
  });

  it("dataFill 서식에 orgId 없으면 fetch 없이 throw", async () => {
    await expect(generateFormBlob(form7, { orgId: null })).rejects.toThrow("사용기관");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
