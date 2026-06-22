import { describe, it, expect } from "vitest";
import { fmtAccDate } from "./date-utils";

describe("fmtAccDate (YYYYMMDD → YYYY-MM-DD)", () => {
  it("정상 변환", () => {
    expect(fmtAccDate("20260622")).toBe("2026-06-22");
  });
  it("null/빈값 → 빈 문자열", () => {
    expect(fmtAccDate(null)).toBe("");
    expect(fmtAccDate(undefined)).toBe("");
    expect(fmtAccDate("")).toBe("");
  });
  it("8자리 아니면 원본 그대로", () => {
    expect(fmtAccDate("2026")).toBe("2026");
    expect(fmtAccDate("99999999")).toBe("9999-99-99");
  });
  it("공백 패딩 방어 (trim)", () => {
    expect(fmtAccDate(" 20260622 ")).toBe("2026-06-22");
  });
});
