import { describe, it, expect } from "vitest";
import { claimTableTokens, claimTotalTokens } from "./reimbursement-claim-builder";
import {
  aggregateReimbursementByFundingSource,
  type AccBookRow,
  type ClaimAmounts,
} from "@/lib/accounting/reimbursement-aggregator";

/**
 * 보전청구서(서식 43) 토큰 빌더 — 공식 축(행=장소, 열=자금원 4분류).
 * 빌더는 aggregator의 ClaimAmounts(후보자자산·후원회기부금·보조금·보조금외·합계)를
 * 받아 표 토큰 10개(사무소_ 5 + 합계_ 5) + 본문 토큰 2개로 매핑한다(순수).
 */

const NAMES: Record<number, string> = {
  82: "보조금인 지원금",
  83: "보조금외 지원금",
  84: "후보자 자산",
  85: "후원회 기부금",
  10: "선거비용",
  11: "선거비용외 정치자금",
};

function amounts(p: Partial<ClaimAmounts>): ClaimAmounts {
  return { 후보자자산: 0, 후원회기부금: 0, 보조금: 0, 보조금외: 0, 합계: 0, ...p };
}

describe("claimTableTokens — 행=장소/열=자금원 4분류", () => {
  it("TC-1: 토큰 10개(사무소_* 5 + 합계_* 5), 천단위 콤마", () => {
    const a = amounts({
      후보자자산: 15000000,
      후원회기부금: 2500000,
      보조금: 5000000,
      보조금외: 2500000,
      합계: 25000000,
    });
    const t = claimTableTokens(a);
    expect(Object.keys(t)).toHaveLength(10);
    // 사무소 행
    expect(t["사무소_후보자자산"]).toBe("15,000,000");
    expect(t["사무소_후원회기부금"]).toBe("2,500,000");
    expect(t["사무소_보조금"]).toBe("5,000,000");
    expect(t["사무소_보조금외"]).toBe("2,500,000");
    expect(t["사무소_합계"]).toBe("25,000,000");
  });

  it("TC-2: 옵션 A — 합계 행 == 사무소 행(동일 금액)", () => {
    const a = amounts({ 후보자자산: 60000000, 합계: 60000000 });
    const t = claimTableTokens(a);
    expect(t["합계_후보자자산"]).toBe(t["사무소_후보자자산"]);
    expect(t["합계_합계"]).toBe(t["사무소_합계"]);
    expect(t["합계_합계"]).toBe("60,000,000");
  });

  it("TC-3: 보조금/보조금외 분리 — 정당의지원금 합산 토큰 없음", () => {
    const a = amounts({ 보조금: 5000000, 보조금외: 2000000, 합계: 7000000 });
    const t = claimTableTokens(a);
    expect(t["사무소_보조금"]).toBe("5,000,000");
    expect(t["사무소_보조금외"]).toBe("2,000,000");
    expect(t).not.toHaveProperty("사무소_정당의지원금");
    expect(t).not.toHaveProperty("후보자자산_사무소"); // 구 축(자금원=행) 토큰 제거 확인
  });
});

describe("claimTotalTokens", () => {
  it("TC-4: 한글·숫자 표기", () => {
    const t = claimTotalTokens(amounts({ 합계: 25000000 }));
    expect(t["보전청구총액_한글"]).toBe("이천오백만");
    expect(t["보전청구총액_숫자"]).toBe("25,000,000");
  });

  it("TC-5: 0원 → 빈 한글 표기", () => {
    const t = claimTotalTokens(amounts({ 합계: 0 }));
    expect(t["보전청구총액_숫자"]).toBe("0");
    expect(t["보전청구총액_한글"]).toBe("");
  });
});

describe("교차 정합 — aggregator SSOT == HWPX 토큰", () => {
  it("TC-6: 동일 입력에서 HWPX 표 토큰 == Excel aggregator 결과", () => {
    const rows: AccBookRow[] = [
      { acc_book_id: 1, acc_sec_cd: 84, item_sec_cd: 10, acc_amt: 60000000, acc_print_ok: "Y", incm_sec_cd: 2 },
      { acc_book_id: 2, acc_sec_cd: 85, item_sec_cd: 10, acc_amt: 2500000, acc_print_ok: "Y", incm_sec_cd: 2 },
      { acc_book_id: 3, acc_sec_cd: 82, item_sec_cd: 10, acc_amt: 3500000, acc_print_ok: "Y", incm_sec_cd: 2 },
      { acc_book_id: 4, acc_sec_cd: 83, item_sec_cd: 10, acc_amt: 3700000, acc_print_ok: "Y", incm_sec_cd: 2 },
      // 보전 미체크 → aggregator가 제외
      { acc_book_id: 5, acc_sec_cd: 84, item_sec_cd: 10, acc_amt: 9999999, acc_print_ok: "N", incm_sec_cd: 2 },
      // 선거비용외 → 제외
      { acc_book_id: 6, acc_sec_cd: 84, item_sec_cd: 11, acc_amt: 8888888, acc_print_ok: "Y", incm_sec_cd: 2 },
    ];
    const agg = aggregateReimbursementByFundingSource({
      rows,
      electionExpenseItemCds: [10],
      accSecCdNames: NAMES,
    }).byFundingSource;

    const t = claimTableTokens(agg);
    expect(t["사무소_후보자자산"]).toBe("60,000,000");
    expect(t["사무소_후원회기부금"]).toBe("2,500,000");
    expect(t["사무소_보조금"]).toBe("3,500,000");
    expect(t["사무소_보조금외"]).toBe("3,700,000");
    expect(t["사무소_합계"]).toBe(formatAmountStr(agg.합계));
    expect(agg.합계).toBe(60000000 + 2500000 + 3500000 + 3700000); // 미체크·선거비용외 제외
  });

  // 기타 자금원(미분류)은 aggregator가 드롭 → 합계 미포함(공식 양식 기준)
  it("TC-7: 기타 자금원(미분류 acc_sec_cd)은 합계에서 제외", () => {
    const rows: AccBookRow[] = [
      { acc_book_id: 1, acc_sec_cd: 84, item_sec_cd: 10, acc_amt: 1000000, acc_print_ok: "Y", incm_sec_cd: 2 },
      { acc_book_id: 2, acc_sec_cd: 999, item_sec_cd: 10, acc_amt: 500000, acc_print_ok: "Y", incm_sec_cd: 2 },
    ];
    const agg = aggregateReimbursementByFundingSource({
      rows,
      electionExpenseItemCds: [10],
      accSecCdNames: { ...NAMES, 999: "정체불명" },
    }).byFundingSource;
    expect(agg.합계).toBe(1000000); // 999(기타) 500,000 드롭
    expect(claimTableTokens(agg)["사무소_합계"]).toBe("1,000,000");
  });
});

function formatAmountStr(n: number): string {
  return n.toLocaleString("ko-KR");
}
