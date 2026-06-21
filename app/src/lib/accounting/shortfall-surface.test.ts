import { describe, it, expect, vi } from "vitest";
import {
  ALLOCATION_SHORTFALL_HEADER,
  shortfallHeaders,
  logShortfalls,
} from "./shortfall-surface";
import type { Shortfall } from "./fund-realloc";

const sf = (p: Partial<Shortfall> = {}): Shortfall => ({
  acc_book_id: 1,
  acc_date: "20260101",
  accSecCd: 82,
  shortAmt: 1000,
  ...p,
});

describe("shortfallHeaders (보안 계약: 건수만 노출)", () => {
  it("부족 있으면 헤더에 건수만 — 거래 상세는 미포함", () => {
    const headers = shortfallHeaders([sf({ shortAmt: 1200 }), sf({ accSecCd: 84 })]);
    expect(headers).toEqual({ [ALLOCATION_SHORTFALL_HEADER]: "2" });
    // 값은 순수 건수 문자열 — 자금원/일자/금액이 새지 않음.
    expect(headers[ALLOCATION_SHORTFALL_HEADER]).toBe("2");
  });

  it("정상 데이터(빈 배열)면 헤더 미부착(빈 객체)", () => {
    expect(shortfallHeaders([])).toEqual({});
  });
});

describe("logShortfalls (은폐 금지: 상세는 서버 로그에만)", () => {
  it("부족 있으면 tag·context·자금원/일자/금액을 console.warn", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logShortfalls("hwpx/test", "org=7", [sf({ accSecCd: 82, acc_date: "20260315", shortAmt: 1200 })]);
    expect(warn).toHaveBeenCalledOnce();
    const msg = warn.mock.calls[0][0] as string;
    expect(msg).toContain("[hwpx/test]");
    expect(msg).toContain("org=7");
    expect(msg).toContain("82/20260315/1200");
    warn.mockRestore();
  });

  it("정상 데이터(빈 배열)면 로그 안 함", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logShortfalls("hwpx/test", "org=7", []);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
