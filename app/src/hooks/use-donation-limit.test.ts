import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { CodeValue } from "./use-code-values";

/**
 * 후원금 한도 검증 — 과목 코드 반전 버그(donation-code-fix) 회귀 방지.
 *
 * 공식 PFund2 v2.6.1 (CS_ID=12 후원회 과목):
 *   94=기명후원금, 95=익명후원금, 96=그 밖의 수입
 * 정당 과목(CS_ID=3)엔 기명/익명후원금 자체가 없음 (16=상급당부보조금외).
 *
 * 분류는 cv_id 하드코딩이 아니라 과목명(getName)으로 판별해야 한다.
 */

// useCodeValues를 명칭 기반 픽스처로 모킹
const FIXTURE: CodeValue[] = [
  { cv_id: 8, cs_id: 3, cv_name: "당비", cv_order: 2, cv_etc: null, cv_etc2: null },
  { cv_id: 16, cs_id: 3, cv_name: "상급당부보조금외", cv_order: 10, cv_etc: null, cv_etc2: null },
  { cv_id: 94, cs_id: 12, cv_name: "기명후원금", cv_order: 2, cv_etc: null, cv_etc2: null },
  { cv_id: 95, cs_id: 12, cv_name: "익명후원금", cv_order: 3, cv_etc: null, cv_etc2: null },
  { cv_id: 96, cs_id: 12, cv_name: "그 밖의 수입", cv_order: 4, cv_etc: null, cv_etc2: null },
  // 한도 코드
  { cv_id: 117, cs_id: 14, cv_name: "10만원", cv_order: 1, cv_etc: "100000", cv_etc2: null },
  { cv_id: 102, cs_id: 13, cv_name: "1회 30만원 초과 기부자", cv_order: 1, cv_etc: "300000", cv_etc2: null },
];

vi.mock("./use-code-values", () => ({
  useCodeValues: () => ({
    getByCategory: (csId: number) => FIXTURE.filter((cv) => cv.cs_id === csId),
    getName: (cvId: number) =>
      FIXTURE.find((cv) => cv.cv_id === cvId)?.cv_name || String(cvId),
  }),
}));

// 연간 한도 분기(custId>0)는 본 테스트에서 custId=0으로 우회하므로 호출되지 않음.
// 안전을 위해 Supabase 클라이언트는 빈 스텁으로 모킹.
vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowser: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              gte: () => ({ lte: () => ({ data: [] }) }),
            }),
          }),
        }),
      }),
    }),
  }),
}));

import { useDonationLimit } from "./use-donation-limit";

function check(args: { itemSecCd: number; amount: number; custId?: number }) {
  const { result } = renderHook(() => useDonationLimit());
  return result.current.checkLimit({
    orgId: 11,
    custId: args.custId ?? 0, // 0 → 연간 한도(Supabase) 분기 우회
    itemSecCd: args.itemSecCd,
    amount: args.amount,
    accDate: "2026-06-11",
  });
}

describe("useDonationLimit — 과목명 기반 분류", () => {
  beforeEach(() => vi.clearAllMocks());

  it("익명후원금(95) 1회 10만원 초과 → 한도 경고", async () => {
    const r = await check({ itemSecCd: 95, amount: 110000 });
    expect(r.isOverLimit).toBe(true);
    expect(r.warnings.some((w) => w.includes("익명후원금 1회 한도"))).toBe(true);
  });

  it("익명후원금(95) 10만원 이하 → 경고 없음", async () => {
    const r = await check({ itemSecCd: 95, amount: 90000 });
    expect(r.isOverLimit).toBe(false);
    expect(r.warnings).toHaveLength(0);
  });

  it("기명후원금(94) 1회 30만원 초과 → 공개대상 경고", async () => {
    const r = await check({ itemSecCd: 94, amount: 310000 });
    expect(r.isOverLimit).toBe(true);
    expect(r.warnings.some((w) => w.includes("기명후원금 1회 30만원"))).toBe(true);
  });

  it("기명후원금(94)에는 익명 한도 경고가 붙지 않음", async () => {
    const r = await check({ itemSecCd: 94, amount: 110000 });
    expect(r.warnings.some((w) => w.includes("익명후원금 1회 한도"))).toBe(false);
  });

  // 회귀 핵심: 과거 버그(96을 익명으로 오판)에서는 경고가 떴다.
  it("그 밖의 수입(96)은 후원금 경고 대상이 아님", async () => {
    const r = await check({ itemSecCd: 96, amount: 110000 });
    expect(r.isOverLimit).toBe(false);
    expect(r.warnings).toHaveLength(0);
  });

  // 회귀 핵심: 과거 버그(16을 익명으로 오판)에서는 경고가 떴다.
  it("정당 과목(16=상급당부보조금외)은 후원금 경고 대상이 아님", async () => {
    const r = await check({ itemSecCd: 16, amount: 110000 });
    expect(r.isOverLimit).toBe(false);
    expect(r.warnings).toHaveLength(0);
  });
});
