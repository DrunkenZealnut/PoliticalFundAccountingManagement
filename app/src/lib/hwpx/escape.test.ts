import { describe, it, expect } from "vitest";
import { escapeXml, fmtKoreanDate } from "./escape";

describe("escapeXml", () => {
  it("XML 특수문자를 엔티티로 치환한다", () => {
    expect(escapeXml(`<a&b>"'`)).toBe("&lt;a&amp;b&gt;&quot;&apos;");
  });
  it("& 를 먼저 치환하여 이중 이스케이프하지 않는다", () => {
    expect(escapeXml("a<b")).toBe("a&lt;b");
    expect(escapeXml("Tom & Jerry")).toBe("Tom &amp; Jerry");
  });
  it("빈 문자열은 그대로 둔다", () => {
    expect(escapeXml("")).toBe("");
  });
});

describe("fmtKoreanDate", () => {
  it("ISO 날짜를 한글 표기로 변환한다", () => {
    expect(fmtKoreanDate("2026-06-03")).toBe("2026년 6월 3일");
  });
  it("YYYYMMDD 도 허용한다", () => {
    expect(fmtKoreanDate("20261201")).toBe("2026년 12월 1일");
  });
  it("형식 불명/빈값은 원문 반환", () => {
    expect(fmtKoreanDate("미정")).toBe("미정");
    expect(fmtKoreanDate("")).toBe("");
  });
});
