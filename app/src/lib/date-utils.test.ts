import { describe, it, expect } from "vitest";
import { fmtTimeInput, toAccTime } from "./date-utils";

describe("fmtTimeInput (HHmm → HH:mm)", () => {
  it("정상 변환", () => {
    expect(fmtTimeInput("1430")).toBe("14:30");
  });
  it("자정/경계", () => {
    expect(fmtTimeInput("0000")).toBe("00:00");
    expect(fmtTimeInput("2359")).toBe("23:59");
  });
  it("null/빈값 → 빈 문자열", () => {
    expect(fmtTimeInput(null)).toBe("");
    expect(fmtTimeInput(undefined)).toBe("");
    expect(fmtTimeInput("")).toBe("");
  });
  it("비정상 길이/문자 → 빈 문자열", () => {
    expect(fmtTimeInput("12")).toBe("");
    expect(fmtTimeInput("abcd")).toBe("");
    expect(fmtTimeInput("143")).toBe("");
  });
  it("CHAR(4) 공백 패딩 방어", () => {
    expect(fmtTimeInput("1430 ".trimEnd())).toBe("14:30");
  });
});

describe("toAccTime (HH:mm → HHmm)", () => {
  it("정상 변환", () => {
    expect(toAccTime("14:30")).toBe("1430");
  });
  it("경계", () => {
    expect(toAccTime("00:00")).toBe("0000");
    expect(toAccTime("23:59")).toBe("2359");
  });
  it("빈값/null → null", () => {
    expect(toAccTime("")).toBeNull();
    expect(toAccTime(null)).toBeNull();
    expect(toAccTime(undefined)).toBeNull();
  });
  it("비정상값 → null", () => {
    expect(toAccTime("99")).toBeNull();
    expect(toAccTime("ab:cd")).toBeNull();
  });
});

describe("round-trip", () => {
  it("HHmm → HH:mm → HHmm 보존", () => {
    expect(toAccTime(fmtTimeInput("0930"))).toBe("0930");
    expect(toAccTime(fmtTimeInput("0000"))).toBe("0000");
  });
});
