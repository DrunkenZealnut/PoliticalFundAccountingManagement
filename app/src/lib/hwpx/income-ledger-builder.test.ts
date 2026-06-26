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
    acc_book_id: 1,
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

  it("동일자·시각 미입력이면 수입(incm=1)을 지출보다 먼저 정렬", () => {
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

  it("영수증번호 매핑 — 지출은 rcp_no (null→공란)", () => {
    const model = buildIncomeLedgerModel(
      [
        row({ incm_sec_cd: 2, rcp_no: "12", cust_id: 1 }),
        row({ incm_sec_cd: 2, rcp_no: null, item_sec_cd: 11 }),
      ],
      getName,
    );
    expect(model.groups[0].rows[0].receiptNo).toBe("12");
    expect(model.groups[1].rows[0].receiptNo).toBe("");
  });

  it("수입 행은 영수증번호 생략 (rcp_no 무시)", () => {
    // 공식 양식·Fund_Data_*.db: 수입(incm_sec_cd=1)은 영수증 일련번호를 "생략"으로 표기.
    const model = buildIncomeLedgerModel(
      [row({ incm_sec_cd: 1, rcp_no: "9" }), row({ incm_sec_cd: 1, rcp_no: null })],
      getName,
    );
    expect(model.groups[0].rows[0].receiptNo).toBe("생략");
    expect(model.groups[0].rows[1].receiptNo).toBe("생략");
  });
});

describe("표준 계정·과목 전체 출력 (standardCombos)", () => {
  // 후보자 org 표준 8조합 중 일부를 단순화 (계정 82/84/85 × 과목 10/11)
  const COMBOS = [
    { accSecCd: 82, itemSecCd: 10 },
    { accSecCd: 82, itemSecCd: 11 },
    { accSecCd: 84, itemSecCd: 10 },
    { accSecCd: 85, itemSecCd: 11 },
  ];

  it("거래 없는 조합도 빈 표(빈 행 1개)로 생성하고 전달 순서를 따른다", () => {
    // 84:10 에만 거래
    const model = buildIncomeLedgerModel(
      [row({ acc_sec_cd: 84, item_sec_cd: 10, acc_amt: 1000 })],
      getName,
      COMBOS,
    );
    expect(model.groups).toHaveLength(4);
    expect(model.groups.map((g) => `${g.accSecCd}:${g.itemSecCd}`)).toEqual([
      "82:10",
      "82:11",
      "84:10",
      "85:11",
    ]);
    // 거래 있는 그룹: 정상 데이터행
    const filled = model.groups[2];
    expect(filled.rows).toHaveLength(1);
    expect(filled.rows[0].incomeNow).toBe("1,000");
    // 거래 없는 그룹: 헤더는 채우고 빈 행 1개(모든 셀 공란)
    const empty = model.groups[0];
    expect(empty.accountName).toBe("보조금인 지원금");
    expect(empty.itemName).toBe("선거비용");
    expect(empty.rows).toHaveLength(1);
    expect(empty.rows[0]).toMatchObject({
      date: "",
      content: "",
      incomeNow: "",
      incomeCum: "",
      expenseNow: "",
      expenseCum: "",
      balance: "",
      name: "",
    });
  });

  it("표준 조합에 없지만 거래가 있는 조합은 코드순으로 뒤에 추가한다", () => {
    const model = buildIncomeLedgerModel(
      [row({ acc_sec_cd: 99, item_sec_cd: 11, acc_amt: 500 })],
      getName,
      COMBOS,
    );
    expect(model.groups).toHaveLength(5); // 표준 4 + 추가 1
    expect(model.groups[4]).toMatchObject({ accSecCd: 99, itemSecCd: 11 });
  });

  it("standardCombos 미지정 시 기존 동작(실거래 그룹만)", () => {
    const model = buildIncomeLedgerModel([row({ acc_sec_cd: 84, item_sec_cd: 10 })], getName);
    expect(model.groups).toHaveLength(1);
  });

  it("빈 배열 standardCombos 는 기존 동작으로 취급", () => {
    const model = buildIncomeLedgerModel([row({ acc_sec_cd: 84, item_sec_cd: 10 })], getName, []);
    expect(model.groups).toHaveLength(1);
  });
});

describe("토큰 매핑", () => {
  it("rowTokens 는 14개 셀 토큰을 모두 채운다 (비고 포함)", () => {
    const model = buildIncomeLedgerModel([row({})], getName);
    const tok = rowTokens(model.groups[0].rows[0]);
    expect(Object.keys(tok)).toHaveLength(14);
    expect(tok[LEDGER_ROW_TOKENS.date]).toBe("2026/5/21");
    expect(tok[LEDGER_ROW_TOKENS.incomeNow]).toBe("1,000");
    expect(tok[LEDGER_ROW_TOKENS.remark]).toBe(""); // 비고: acc_book 무필드 → 공란
  });

  it("groupHeaderTokens 는 계정명/과목명", () => {
    const model = buildIncomeLedgerModel([row({})], getName);
    const tok = groupHeaderTokens(model.groups[0]);
    expect(tok).toEqual({ 계정명: "후보자 자산", 과목명: "선거비용" });
  });
});
