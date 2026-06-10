import { describe, it, expect } from "vitest";
import {
  buildReimbursementClaimModel,
  claimTableTokens,
  claimTotalTokens,
  type ReimbursementClaimInputRow,
} from "./reimbursement-claim-builder";
import {
  aggregateReimbursementByFundingSource,
  type AccBookRow,
} from "@/lib/accounting/reimbursement-aggregator";

/** 코드명 맵: 계정(82~85)·과목(10 선거비용 / 11 선거비용외). */
const NAMES: Record<number, string> = {
  82: "보조금인 지원금",
  83: "보조금외 지원금",
  84: "후보자 자산",
  85: "후원회 기부금",
  10: "선거비용",
  11: "선거비용외 정치자금",
};
const getName = (cv: number) => NAMES[cv] ?? `코드${cv}`;

function row(p: Partial<ReimbursementClaimInputRow>): ReimbursementClaimInputRow {
  return { incm_sec_cd: 2, acc_sec_cd: 84, item_sec_cd: 10, acc_amt: 1000, acc_print_ok: "Y", ...p };
}

describe("buildReimbursementClaimModel", () => {
  it("TC-1: 수입·선거비용외·보전 미체크·음수 행은 무시", () => {
    const model = buildReimbursementClaimModel(
      [
        row({ incm_sec_cd: 1, acc_amt: 90000000 }), // 수입 → 무시
        row({ item_sec_cd: 11, acc_amt: 30000000 }), // 선거비용외 → 무시
        row({ acc_print_ok: "N", acc_amt: 5000000 }), // 보전 미체크 → 무시
        row({ acc_print_ok: null, acc_amt: 5000000 }), // 보전 미체크 → 무시
        row({ acc_amt: -1000 }), // 음수 → 무시
        row({ acc_sec_cd: 84, acc_amt: 60000000 }), // 후보자자산 선거비용 보전 → 집계
      ],
      getName,
    );
    expect(model.office.후보자자산).toBe(60000000);
    expect(model.office.합계).toBe(60000000);
  });

  it("TC-2: 자금원 3분류 — 보조금·보조금외·기타는 정당의지원금으로 흡수", () => {
    const model = buildReimbursementClaimModel(
      [
        row({ acc_sec_cd: 84, acc_amt: 60000000 }), // 후보자자산
        row({ acc_sec_cd: 85, acc_amt: 2500000 }), // 후원회기부금
        row({ acc_sec_cd: 82, acc_amt: 2500000 }), // 보조금 → 정당의지원금
        row({ acc_sec_cd: 83, acc_amt: 1000000 }), // 보조금외 → 정당의지원금
        row({ acc_sec_cd: 999, acc_amt: 500000 }), // 기타(미분류) → 정당의지원금
      ],
      getName,
    );
    expect(model.office).toMatchObject({
      후보자자산: 60000000,
      후원회기부금: 2500000,
      정당의지원금: 4000000, // 2,500,000 + 1,000,000 + 500,000
    });
    expect(model.office.합계).toBe(66500000);
  });

  it("TC-3: 옵션 A — total 은 office 와 동일(연락소 0)", () => {
    const model = buildReimbursementClaimModel([row({ acc_amt: 1234000 })], getName);
    expect(model.total).toEqual(model.office);
    expect(model.total.합계).toBe(1234000);
  });

  it("TC-4: claimTableTokens 8개 — 사무소/합계 열만, 천단위 콤마", () => {
    const model = buildReimbursementClaimModel(
      [
        row({ acc_sec_cd: 84, acc_amt: 15000000 }),
        row({ acc_sec_cd: 85, acc_amt: 2500000 }),
        row({ acc_sec_cd: 82, acc_amt: 7500000 }),
      ],
      getName,
    );
    const t = claimTableTokens(model);
    expect(Object.keys(t)).toHaveLength(8);
    expect(t["후보자자산_사무소"]).toBe("15,000,000");
    expect(t["후보자자산_합계"]).toBe("15,000,000");
    expect(t["후원회기부금_사무소"]).toBe("2,500,000");
    expect(t["정당의지원금_사무소"]).toBe("7,500,000");
    expect(t["합계_사무소"]).toBe("25,000,000");
    expect(t["합계_합계"]).toBe("25,000,000");
  });

  it("TC-5: claimTotalTokens — 한글·숫자", () => {
    const model = buildReimbursementClaimModel([row({ acc_amt: 25000000 })], getName);
    const t = claimTotalTokens(model);
    expect(t["보전청구총액_한글"]).toBe("이천오백만");
    expect(t["보전청구총액_숫자"]).toBe("25,000,000");
  });

  it("TC-6: reimbursement-aggregator(보조금+보조금외)와 합계·정당의지원금 교차검증", () => {
    const rows: ReimbursementClaimInputRow[] = [
      row({ acc_sec_cd: 84, acc_amt: 60000000 }),
      row({ acc_sec_cd: 85, acc_amt: 2500000 }),
      row({ acc_sec_cd: 82, acc_amt: 3500000 }),
      row({ acc_sec_cd: 83, acc_amt: 3700000 }),
      row({ acc_print_ok: "N", acc_sec_cd: 84, acc_amt: 9999999 }), // 미체크 — 양쪽 제외
    ];
    const model = buildReimbursementClaimModel(rows, getName);

    const aggRows: AccBookRow[] = rows.map((r, i) => ({
      acc_book_id: i + 1,
      acc_sec_cd: r.acc_sec_cd,
      item_sec_cd: r.item_sec_cd,
      acc_amt: r.acc_amt,
      acc_print_ok: r.acc_print_ok,
      incm_sec_cd: r.incm_sec_cd,
    }));
    const agg = aggregateReimbursementByFundingSource({
      rows: aggRows,
      electionExpenseItemCds: [10],
      accSecCdNames: NAMES,
    }).byFundingSource;

    expect(model.total.합계).toBe(agg.합계);
    expect(model.total.후보자자산).toBe(agg.후보자자산);
    expect(model.total.후원회기부금).toBe(agg.후원회기부금);
    expect(model.total.정당의지원금).toBe(agg.보조금 + agg.보조금외);
  });
});
