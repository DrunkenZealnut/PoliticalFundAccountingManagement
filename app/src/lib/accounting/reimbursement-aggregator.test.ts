import { describe, it, expect } from "vitest";
import {
  aggregateReimbursementByFundingSource,
  type AccBookRow,
} from "./reimbursement-aggregator";

const ELECTION_ITEM_CDS = [101, 102, 103];
const NON_ELECTION_ITEM_CDS = [201, 202];

function row(partial: Partial<AccBookRow>): AccBookRow {
  return {
    acc_book_id: 1,
    acc_sec_cd: 84,
    item_sec_cd: 101,
    acc_amt: 100000,
    acc_print_ok: "Y",
    incm_sec_cd: 2,
    ...partial,
  };
}

describe("aggregateReimbursementByFundingSource", () => {
  it("빈 입력 → 0 합계", () => {
    const r = aggregateReimbursementByFundingSource({
      rows: [],
      electionExpenseItemCds: ELECTION_ITEM_CDS,
    });
    expect(r.byFundingSource.합계).toBe(0);
    expect(r.rowCount).toBe(0);
  });

  it("자금원별 합산 — 4개 코드 매핑", () => {
    const result = aggregateReimbursementByFundingSource({
      rows: [
        row({ acc_book_id: 1, acc_sec_cd: 84, acc_amt: 100000 }), // 후보자자산
        row({ acc_book_id: 2, acc_sec_cd: 85, acc_amt: 200000 }), // 후원회기부금
        row({ acc_book_id: 3, acc_sec_cd: 82, acc_amt: 300000 }), // 보조금
        row({ acc_book_id: 4, acc_sec_cd: 83, acc_amt: 400000 }), // 보조금외
      ],
      electionExpenseItemCds: ELECTION_ITEM_CDS,
    });
    expect(result.byFundingSource.후보자자산).toBe(100000);
    expect(result.byFundingSource.후원회기부금).toBe(200000);
    expect(result.byFundingSource.보조금).toBe(300000);
    expect(result.byFundingSource.보조금외).toBe(400000);
    expect(result.byFundingSource.합계).toBe(1000000);
    expect(result.rowCount).toBe(4);
  });

  it("보전 미체크 행은 제외", () => {
    const result = aggregateReimbursementByFundingSource({
      rows: [
        row({ acc_book_id: 1, acc_print_ok: "Y", acc_amt: 100000 }),
        row({ acc_book_id: 2, acc_print_ok: "N", acc_amt: 200000 }),
        row({ acc_book_id: 3, acc_print_ok: null, acc_amt: 300000 }),
      ],
      electionExpenseItemCds: ELECTION_ITEM_CDS,
    });
    expect(result.byFundingSource.합계).toBe(100000);
    expect(result.rowCount).toBe(1);
    expect(result.uncheckedCount).toBe(2);
  });

  it("선거비용외 행은 제외", () => {
    const result = aggregateReimbursementByFundingSource({
      rows: [
        row({ acc_book_id: 1, item_sec_cd: 101, acc_amt: 100000 }),
        row({ acc_book_id: 2, item_sec_cd: 201, acc_amt: 200000 }), // 비포함
      ],
      electionExpenseItemCds: ELECTION_ITEM_CDS,
    });
    expect(result.byFundingSource.합계).toBe(100000);
    expect(result.rowCount).toBe(1);
    expect(result.nonElectionCount).toBe(1);
  });

  it("incm_sec_cd가 1(수입)인 행은 제외", () => {
    const result = aggregateReimbursementByFundingSource({
      rows: [row({ incm_sec_cd: 1, acc_amt: 999999 })],
      electionExpenseItemCds: ELECTION_ITEM_CDS,
    });
    expect(result.byFundingSource.합계).toBe(0);
  });

  it("음수/0 금액 제외 (취소 거래 등)", () => {
    const result = aggregateReimbursementByFundingSource({
      rows: [
        row({ acc_amt: 100000 }),
        row({ acc_amt: 0 }),
        row({ acc_amt: -50000 }),
      ],
      electionExpenseItemCds: ELECTION_ITEM_CDS,
    });
    expect(result.byFundingSource.합계).toBe(100000);
    expect(result.rowCount).toBe(1);
  });

  it("미등록 acc_sec_cd는 이름 폴백으로 분류", () => {
    const result = aggregateReimbursementByFundingSource({
      rows: [row({ acc_sec_cd: 999, acc_amt: 100000 })],
      electionExpenseItemCds: ELECTION_ITEM_CDS,
      accSecCdNames: { 999: "기부금계정" },
    });
    expect(result.byFundingSource.후원회기부금).toBe(100000);
  });

  it("자금원이 '기타'인 행은 합계에서 제외", () => {
    const result = aggregateReimbursementByFundingSource({
      rows: [
        row({ acc_sec_cd: 84, acc_amt: 100000 }), // 후보자자산
        row({ acc_sec_cd: 999, acc_amt: 200000 }), // 기타 (이름 미제공)
      ],
      electionExpenseItemCds: ELECTION_ITEM_CDS,
    });
    expect(result.byFundingSource.합계).toBe(100000);
    expect(result.rowCount).toBe(1);
  });

  it("4개 자금원의 합 = 합계 (불변식)", () => {
    const result = aggregateReimbursementByFundingSource({
      rows: [
        row({ acc_book_id: 1, acc_sec_cd: 84, acc_amt: 1234567 }),
        row({ acc_book_id: 2, acc_sec_cd: 85, acc_amt: 7654321 }),
        row({ acc_book_id: 3, acc_sec_cd: 82, acc_amt: 100 }),
      ],
      electionExpenseItemCds: ELECTION_ITEM_CDS,
    });
    const f = result.byFundingSource;
    expect(f.후보자자산 + f.후원회기부금 + f.보조금 + f.보조금외).toBe(f.합계);
  });

  it("claim_amt(보전청구액)이 있으면 acc_amt 대신 합산한다 (일할계산)", () => {
    const result = aggregateReimbursementByFundingSource({
      rows: [
        row({ acc_book_id: 1, acc_sec_cd: 84, acc_amt: 965800, claim_amt: 313885 }), // 일할: 청구액
        row({ acc_book_id: 2, acc_sec_cd: 84, acc_amt: 50000 }),                      // claim 없음 → acc_amt
      ],
      electionExpenseItemCds: ELECTION_ITEM_CDS,
    });
    expect(result.byFundingSource.후보자자산).toBe(363885); // 313885 + 50000
    expect(result.byFundingSource.합계).toBe(363885);
  });

  it("claim_amt=0 은 청구 0원으로 합산(게이트 acc_amt>0이라 행은 포함)", () => {
    const result = aggregateReimbursementByFundingSource({
      rows: [row({ acc_book_id: 1, acc_sec_cd: 84, acc_amt: 100000, claim_amt: 0 })],
      electionExpenseItemCds: ELECTION_ITEM_CDS,
    });
    expect(result.rowCount).toBe(1);             // acc_amt>0 게이트 통과
    expect(result.byFundingSource.합계).toBe(0); // 청구액 0
  });

  it("claim_amt=null 은 acc_amt fallback", () => {
    const result = aggregateReimbursementByFundingSource({
      rows: [row({ acc_book_id: 1, acc_sec_cd: 84, acc_amt: 77000, claim_amt: null })],
      electionExpenseItemCds: ELECTION_ITEM_CDS,
    });
    expect(result.byFundingSource.합계).toBe(77000);
  });

  it("미사용 변수 NON_ELECTION_ITEM_CDS — 통합용", () => {
    expect(NON_ELECTION_ITEM_CDS).toContain(201);
  });
});
