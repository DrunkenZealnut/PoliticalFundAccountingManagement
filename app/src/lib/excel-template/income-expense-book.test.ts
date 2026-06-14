import { describe, it, expect } from "vitest";
import { buildIncomeExpenseBookModel, type IebInputRow, type IebCtx } from "./income-expense-book";
import { aggregateReimbursementByFundingSource, type AccBookRow } from "@/lib/accounting/reimbursement-aggregator";

const ELECTION = [86];
const CTX: IebCtx = {
  electionExpenseItemCds: ELECTION,
  accSecCdNames: { 82: "보조금", 83: "보조금외지원금", 84: "후보자등자산", 85: "후원회기부금", 999: "기타계정" },
};

function row(p: Partial<IebInputRow>): IebInputRow {
  return {
    acc_book_id: 1,
    incm_sec_cd: 2,
    acc_date: "20260601",
    content: "내역",
    acc_amt: 100000,
    claim_amt: null,
    acc_print_ok: "Y",
    acc_sec_cd: 84,
    item_sec_cd: 86,
    exp_group1_cd: null,
    exp_group2_cd: null,
    exp_group3_cd: null,
    rcp_no: null,
    bigo: null,
    cust_id: 1,
    customer: { name: "업체", reg_num: "111-11-11111", addr: "주소", job: "직업", tel: "02-1" },
    ...p,
  };
}

describe("buildIncomeExpenseBookModel", () => {
  it("T-1 자금원별 그룹·시트 분리 + 출력 순서(후보자자산→후원회기부금→보조금→보조금외)", () => {
    const m = buildIncomeExpenseBookModel(
      [
        row({ acc_book_id: 1, acc_sec_cd: 83, acc_amt: 300000 }),
        row({ acc_book_id: 2, acc_sec_cd: 84, acc_amt: 100000 }),
        row({ acc_book_id: 3, acc_sec_cd: 85, acc_amt: 200000 }),
      ],
      CTX,
    );
    expect(m.accounts.map((a) => a.source)).toEqual(["후보자자산", "후원회기부금", "보조금외"]);
    expect(m.accounts[0].accName).toBe("후보자등자산");
  });

  it("T-2 지출액 = claimAmount(일할계산 반영)", () => {
    const m = buildIncomeExpenseBookModel(
      [row({ acc_book_id: 1, acc_sec_cd: 84, acc_amt: 965800, claim_amt: 313885 })],
      CTX,
    );
    expect(m.accounts[0].rows[0].expenseNow).toBe(313885);
    expect(m.accounts[0].expenseTotal).toBe(313885);
  });

  it("T-3 환급(음수) 차감", () => {
    const m = buildIncomeExpenseBookModel(
      [
        row({ acc_book_id: 1, acc_sec_cd: 85, acc_amt: 200000 }),
        row({ acc_book_id: 2, acc_sec_cd: 85, acc_amt: -108583 }), // 환급
      ],
      CTX,
    );
    const a = m.accounts[0];
    expect(a.rows).toHaveLength(2);
    expect(a.expenseTotal).toBe(91417); // 200000 - 108583
  });

  it("T-4 0원/미체크/선거비용외 제외", () => {
    const m = buildIncomeExpenseBookModel(
      [
        row({ acc_book_id: 1, acc_amt: 100000 }),
        row({ acc_book_id: 2, acc_amt: 0 }), // 0원 → 제외
        row({ acc_book_id: 3, acc_amt: 50000, acc_print_ok: "N" }), // 미체크 → 제외
        row({ acc_book_id: 4, acc_amt: 70000, item_sec_cd: 87 }), // 선거비용외 → 제외
      ],
      CTX,
    );
    expect(m.grandTotal).toBe(100000);
    expect(m.accounts[0].rows).toHaveLength(1);
  });

  it("T-5 누계·잔액", () => {
    const m = buildIncomeExpenseBookModel(
      [
        row({ acc_book_id: 1, acc_sec_cd: 84, acc_date: "20260601", acc_amt: 100000 }),
        row({ acc_book_id: 2, acc_sec_cd: 84, acc_date: "20260602", acc_amt: 50000 }),
      ],
      CTX,
    );
    const rows = m.accounts[0].rows;
    expect(rows[0].expenseCum).toBe(100000);
    expect(rows[0].balance).toBe(-100000);
    expect(rows[1].expenseCum).toBe(150000);
    expect(rows[1].balance).toBe(-150000);
  });

  it("T-6 내역 포맷 (g1-g2-g3-content, 빈값 스킵)", () => {
    const m = buildIncomeExpenseBookModel(
      [
        row({ acc_book_id: 1, exp_group1_cd: "인쇄물", exp_group2_cd: "선거공보", exp_group3_cd: "인쇄비", content: "공식공보물" }),
        row({ acc_book_id: 2, acc_date: "20260602", exp_group1_cd: "소품", exp_group2_cd: null, exp_group3_cd: "", content: "어깨띠" }),
      ],
      CTX,
    );
    expect(m.accounts[0].rows[0].content).toBe("인쇄물-선거공보-인쇄비-공식공보물");
    expect(m.accounts[0].rows[1].content).toBe("소품-어깨띠");
  });

  it("T-7 익명 거래처 정규화", () => {
    const m = buildIncomeExpenseBookModel(
      [row({ acc_book_id: 1, cust_id: -999, customer: { name: "익명아님", reg_num: null, addr: "x", job: "y", tel: "z" } })],
      CTX,
    );
    const r = m.accounts[0].rows[0];
    expect(r.name).toBe("익명");
    expect(r.addr).toBe("");
  });

  it("T-8 교차검증: grandTotal == aggregator.합계, 계정별 == byFundingSource[source]", () => {
    const rows = [
      row({ acc_book_id: 1, acc_sec_cd: 84, acc_amt: 1000000 }),
      row({ acc_book_id: 2, acc_sec_cd: 85, acc_amt: 200000, claim_amt: 150000 }),
      row({ acc_book_id: 3, acc_sec_cd: 83, acc_amt: 300000 }),
      row({ acc_book_id: 4, acc_sec_cd: 84, acc_amt: -50000 }), // 환급
    ];
    const m = buildIncomeExpenseBookModel(rows, CTX);
    const agg = aggregateReimbursementByFundingSource({
      rows: rows as unknown as AccBookRow[],
      electionExpenseItemCds: ELECTION,
      accSecCdNames: CTX.accSecCdNames,
    });
    expect(m.grandTotal).toBe(agg.byFundingSource.합계);
    for (const acc of m.accounts) {
      expect(acc.expenseTotal).toBe(agg.byFundingSource[acc.source]);
    }
  });

  it("T-9 자금원 '기타'는 합계 제외 + otherCount/Amt 분리", () => {
    const m = buildIncomeExpenseBookModel(
      [
        row({ acc_book_id: 1, acc_sec_cd: 84, acc_amt: 100000 }),
        row({ acc_book_id: 2, acc_sec_cd: 999, acc_amt: 70000 }), // 기타
      ],
      CTX,
    );
    expect(m.grandTotal).toBe(100000);
    expect(m.accounts).toHaveLength(1);
    expect(m.otherCount).toBe(1);
    expect(m.otherAmt).toBe(70000);
  });

  it("T-10 영수증 첨부분/생략분 집계(rcp_yn)", () => {
    const m = buildIncomeExpenseBookModel(
      [
        row({ acc_book_id: 1, acc_sec_cd: 84, acc_amt: 100000, rcp_yn: "Y" }),
        row({ acc_book_id: 2, acc_sec_cd: 84, acc_amt: 50000, rcp_yn: "N" }),
        row({ acc_book_id: 3, acc_sec_cd: 84, acc_amt: 30000 }), // rcp_yn 없음 → 생략분
      ],
      CTX,
    );
    const a = m.accounts[0];
    expect(a.attachedAmt).toBe(100000);
    expect(a.attachedCount).toBe(1);
    expect(a.omittedAmt).toBe(80000); // 50000 + 30000
    expect(a.omittedCount).toBe(2);
    expect(a.expenseTotal).toBe(180000); // 첨부+생략 = 전체
  });

  it("T-11 영수증 일련번호 형식(접두사+번호+결제방법)", () => {
    const m = buildIncomeExpenseBookModel(
      [
        row({ acc_sec_cd: 84, rcp_no: "4", acc_ins_type: "118" }), // 후보자자산
        row({ acc_book_id: 2, acc_sec_cd: 83, acc_date: "20260602", rcp_no: "1", acc_ins_type: "118" }), // 보조금외
        row({ acc_book_id: 3, acc_sec_cd: 84, acc_date: "20260603", rcp_no: "" }), // 번호 없음 → 빈칸
      ],
      CTX,
    );
    const asset = m.accounts.find((a) => a.source === "후보자자산")!;
    const etc = m.accounts.find((a) => a.source === "보조금외")!;
    expect(asset.rows[0].rcpNo).toBe("자(비)-4\n계좌입금");
    expect(etc.rows[0].rcpNo).toBe("외(비)-1\n계좌입금");
    expect(asset.rows[1].rcpNo).toBe(""); // rcp_no 없음
  });

  it("빈 입력 → 계정 0, 합계 0", () => {
    const m = buildIncomeExpenseBookModel([], CTX);
    expect(m.accounts).toHaveLength(0);
    expect(m.grandTotal).toBe(0);
  });
});
