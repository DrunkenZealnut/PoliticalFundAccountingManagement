import { describe, it, expect } from "vitest";
import {
  buildIncomeLedgerModel,
  formatAmount,
  formatLedgerDate,
  formatBirthFromRegNum,
  rowTokens,
  groupHeaderTokens,
  LEDGER_ROW_TOKENS,
  type IncomeLedgerInputRow,
} from "./income-ledger-builder";

/** 코드명 맵 (테스트용 getName). */
const NAMES: Record<number, string> = {
  84: "후보자 자산",
  85: "후원회 기부금",
  82: "보조금인 지원금",
  10: "선거비용",
  11: "선거비용외 정치자금",
};
const getName = (cv: number) => NAMES[cv] ?? `코드${cv}`;

function row(p: Partial<IncomeLedgerInputRow>): IncomeLedgerInputRow {
  return {
    acc_date: "20260521",
    incm_sec_cd: 1,
    acc_sec_cd: 84,
    item_sec_cd: 10,
    content: "내역",
    acc_amt: 1000,
    rcp_no: null,
    cust_id: 1,
    customer: { name: "홍길동", reg_num: "570923", addr: "서울 종로", addr_detail: "1번지", job: "회사원", tel: "02-1-2" },
    ...p,
  };
}

describe("formatLedgerDate", () => {
  it("YYYYMMDD → YYYY/M/D (앞 0 제거)", () => {
    expect(formatLedgerDate("20260521")).toBe("2026/5/21");
    expect(formatLedgerDate("20261203")).toBe("2026/12/3");
  });
  it("형식 불명은 원문 반환", () => {
    expect(formatLedgerDate("2026-05")).toBe("2026-05");
    expect(formatLedgerDate("")).toBe("");
  });
});

describe("formatAmount", () => {
  it("천단위 콤마", () => {
    expect(formatAmount(30000000)).toBe("30,000,000");
    expect(formatAmount(0)).toBe("0");
  });
});

describe("formatBirthFromRegNum", () => {
  it("주민번호 앞 6자리 → YY/MM/DD", () => {
    expect(formatBirthFromRegNum("570923")).toBe("57/09/23");
    expect(formatBirthFromRegNum("570923-1234567")).toBe("57/09/23");
  });
  it("사업자등록번호는 그대로 유지", () => {
    expect(formatBirthFromRegNum("123-85-12345")).toBe("123-85-12345");
  });
  it("익명(9999)·빈값·형식 불명은 공란", () => {
    expect(formatBirthFromRegNum("9999")).toBe("");
    expect(formatBirthFromRegNum("")).toBe("");
    expect(formatBirthFromRegNum(null)).toBe("");
    expect(formatBirthFromRegNum("570932")).toBe(""); // 잘못된 일(32)
  });
});

describe("buildIncomeLedgerModel", () => {
  it("계정+과목 조합으로 그룹핑하고 코드명을 채운다", () => {
    const model = buildIncomeLedgerModel(
      [
        row({ acc_sec_cd: 84, item_sec_cd: 10 }),
        row({ acc_sec_cd: 84, item_sec_cd: 11 }),
        row({ acc_sec_cd: 85, item_sec_cd: 10 }),
      ],
      getName,
    );
    expect(model.groups).toHaveLength(3);
    expect(model.groups[0]).toMatchObject({ accountName: "후보자 자산", itemName: "선거비용" });
    expect(model.groups[1]).toMatchObject({ accountName: "후보자 자산", itemName: "선거비용외 정치자금" });
    expect(model.groups[2]).toMatchObject({ accountName: "후원회 기부금", itemName: "선거비용" });
  });

  it("정렬: 계정코드 ASC → 과목코드 ASC", () => {
    const model = buildIncomeLedgerModel(
      [
        row({ acc_sec_cd: 85, item_sec_cd: 10 }),
        row({ acc_sec_cd: 82, item_sec_cd: 11 }),
        row({ acc_sec_cd: 84, item_sec_cd: 10 }),
      ],
      getName,
    );
    expect(model.groups.map((g) => g.accSecCd)).toEqual([82, 84, 85]);
  });

  it("그룹 내 일자순 누계·잔액을 계산한다 (잔액=수입누계)", () => {
    const model = buildIncomeLedgerModel(
      [
        row({ acc_date: "20260522", acc_amt: 1500000, content: "B" }),
        row({ acc_date: "20260521", acc_amt: 20000000, content: "A" }),
      ],
      getName,
    );
    const rows = model.groups[0].rows;
    expect(rows.map((r) => r.content)).toEqual(["A", "B"]); // 일자순
    expect(rows[0]).toMatchObject({ incomeNow: "20,000,000", incomeCum: "20,000,000", balance: "20,000,000" });
    expect(rows[1]).toMatchObject({ incomeNow: "1,500,000", incomeCum: "21,500,000", balance: "21,500,000" });
  });

  it("수입행은 지출 컬럼 공란, 지출행은 수입 컬럼 공란", () => {
    const model = buildIncomeLedgerModel(
      [
        row({ incm_sec_cd: 1, acc_amt: 1000 }),
        row({ incm_sec_cd: 2, acc_amt: 300, acc_date: "20260522" }),
      ],
      getName,
    );
    const [inc, exp] = model.groups[0].rows;
    expect(inc).toMatchObject({ incomeNow: "1,000", expenseNow: "", expenseCum: "" });
    expect(exp).toMatchObject({ expenseNow: "300", incomeNow: "", incomeCum: "" });
  });

  it("같은 계정·과목 그룹에 수입·지출을 일자순 혼합하고 잔액=수입누계-지출누계", () => {
    const model = buildIncomeLedgerModel(
      [
        row({ incm_sec_cd: 1, acc_date: "20260521", acc_amt: 20000000, content: "수입A" }),
        row({ incm_sec_cd: 1, acc_date: "20260522", acc_amt: 1500000, content: "수입B" }),
        row({ incm_sec_cd: 2, acc_date: "20260523", acc_amt: 1500000, content: "지출C" }),
      ],
      getName,
    );
    expect(model.groups).toHaveLength(1); // 수입·지출이 한 그룹
    const rows = model.groups[0].rows;
    expect(rows.map((r) => r.content)).toEqual(["수입A", "수입B", "지출C"]);
    expect(rows[0]).toMatchObject({ incomeCum: "20,000,000", balance: "20,000,000" });
    expect(rows[1]).toMatchObject({ incomeCum: "21,500,000", balance: "21,500,000" });
    expect(rows[2]).toMatchObject({ expenseNow: "1,500,000", expenseCum: "1,500,000", balance: "20,000,000" });
  });

  it("동일자는 수입(incm=1)을 지출보다 먼저 정렬", () => {
    const model = buildIncomeLedgerModel(
      [
        row({ incm_sec_cd: 2, acc_date: "20260521", content: "지출" }),
        row({ incm_sec_cd: 1, acc_date: "20260521", content: "수입" }),
      ],
      getName,
    );
    expect(model.groups[0].rows.map((r) => r.content)).toEqual(["수입", "지출"]);
  });

  it("익명(cust_id=-999)은 상세 셀 공란, 금액은 정상", () => {
    const model = buildIncomeLedgerModel(
      [row({ cust_id: -999, acc_amt: 50000, customer: { name: "익명", reg_num: "9999", addr: "x", addr_detail: "y", job: "z", tel: "t" } })],
      getName,
    );
    const r = model.groups[0].rows[0];
    expect(r.incomeNow).toBe("50,000");
    expect(r.birth).toBe("");
    expect(r.addr).toBe("");
    expect(r.job).toBe("");
    expect(r.tel).toBe("");
    expect(r.name).toBe("익명"); // 이름은 표시
  });

  it("customer null 도 안전 처리", () => {
    const model = buildIncomeLedgerModel([row({ customer: null, cust_id: 5 })], getName);
    const r = model.groups[0].rows[0];
    expect(r.name).toBe("");
    expect(r.addr).toBe("");
  });

  it("영수증번호 매핑 (null→공란)", () => {
    const model = buildIncomeLedgerModel(
      [row({ rcp_no: "12", cust_id: 1 }), row({ rcp_no: null, item_sec_cd: 11 })],
      getName,
    );
    expect(model.groups[0].rows[0].receiptNo).toBe("12");
    expect(model.groups[1].rows[0].receiptNo).toBe("");
  });
});

describe("토큰 매핑", () => {
  it("rowTokens 는 13개 셀 토큰을 모두 채운다", () => {
    const model = buildIncomeLedgerModel([row({})], getName);
    const tok = rowTokens(model.groups[0].rows[0]);
    expect(Object.keys(tok)).toHaveLength(13);
    expect(tok[LEDGER_ROW_TOKENS.date]).toBe("2026/5/21");
    expect(tok[LEDGER_ROW_TOKENS.incomeNow]).toBe("1,000");
  });

  it("groupHeaderTokens 는 계정명/과목명", () => {
    const model = buildIncomeLedgerModel([row({})], getName);
    const tok = groupHeaderTokens(model.groups[0]);
    expect(tok).toEqual({ 계정명: "후보자 자산", 과목명: "선거비용" });
  });
});
