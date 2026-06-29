import { describe, it, expect, vi } from "vitest";

// route.ts는 모듈 로드 시 createClient(url,...)를 실행하므로 import 이전에 유효 URL 주입.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
});

import { parseRestoreTs } from "./route";

describe("parseRestoreTs (restore 파일명 타임스탬프)", () => {
  it("유효한 YYYY-MM-DD-HH-mm-ss 파싱", () => {
    expect(parseRestoreTs("2026-06-29-01-40-24")).toEqual({
      y: 2026,
      mo: 6,
      d: 29,
      h: 1,
      mi: 40,
      s: 24,
    });
  });

  it("형식 불일치(하이픈 수/자릿수)면 서버시간 fallback(유효 객체 반환)", () => {
    const r = parseRestoreTs("2026-6-29 1:40:24");
    expect(typeof r.y).toBe("number");
    expect(r.mo).toBeGreaterThanOrEqual(1);
    expect(r.mo).toBeLessThanOrEqual(12);
  });

  it("null이면 서버시간 fallback", () => {
    const r = parseRestoreTs(null);
    expect(typeof r.y).toBe("number");
    expect(r.d).toBeGreaterThanOrEqual(1);
  });
});
