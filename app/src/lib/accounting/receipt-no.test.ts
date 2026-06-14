import { describe, it, expect } from "vitest";
import {
  accountAbbr,
  itemAbbr,
  formatReceiptNo,
  assignReceiptNumbers,
  type ReceiptTarget,
  type ReceiptCodeNames,
} from "./receipt-no";

const NAMES: ReceiptCodeNames = {
  acc: { 84: "후보자등자산", 85: "후원회기부금", 82: "보조금", 83: "보조금외지원금", 99: "기타계정" },
  item: { 86: "선거비용", 87: "선거비용외정치자금", 50: "후원회기부금" },
};

describe("receipt-no 약자", () => {
  it("T-1 계정 약자 84/85/82/83 → 자/후/보/외", () => {
    expect(accountAbbr(84)).toBe("자");
    expect(accountAbbr(85)).toBe("후");
    expect(accountAbbr(82)).toBe("보");
    expect(accountAbbr(83)).toBe("외");
  });

  it("T-2 미정의 계정 → 코드명 첫 글자 폴백", () => {
    expect(accountAbbr(99, "기타계정")).toBe("기");
    expect(accountAbbr(100)).toBe(""); // 이름도 없으면 빈칸
  });

  it("T-3 과목 약자 선거비용/선거비용외 → 비/비외 (실코드명 '선거비용외정치자금' 포함)", () => {
    expect(itemAbbr("선거비용")).toBe("비");
    expect(itemAbbr("선거비용외")).toBe("비외");
    expect(itemAbbr("선거비용외정치자금")).toBe("비외"); // 실제 codevalue 87 코드명
  });

  it("T-4 미정의 과목 → 첫 글자 폴백", () => {
    expect(itemAbbr("후원회기부금")).toBe("후");
    expect(itemAbbr(null)).toBe("");
  });

  it("T-5 formatReceiptNo", () => {
    expect(formatReceiptNo("자", "비", 1)).toBe("자(비)-1");
  });
});

describe("assignReceiptNumbers", () => {
  const t = (id: number, acc: number, item: number): ReceiptTarget => ({ acc_book_id: id, acc_sec_cd: acc, item_sec_cd: item });

  it("T-6 조합별 순번 1부터 (자(비)-1·2 / 후(비)-1)", () => {
    const out = assignReceiptNumbers(
      [t(1, 84, 86), t(2, 84, 86), t(3, 85, 86)],
      NAMES,
      [],
    );
    expect(out[0].rcp_no).toBe("자(비)-1");
    expect(out[1].rcp_no).toBe("자(비)-2");
    expect(out[2].rcp_no).toBe("후(비)-1");
  });

  it("T-7 기존 조합 max+1 이어서", () => {
    const out = assignReceiptNumbers(
      [t(10, 84, 86)],
      NAMES,
      [{ rcp_no: "자(비)-3", rcp_no2: 3 }, { rcp_no: "후(비)-1", rcp_no2: 1 }],
    );
    expect(out[0].rcp_no).toBe("자(비)-4");
  });

  it("T-8 rcp_no2 전체 순번(기존 max+1부터, 중복 없음)", () => {
    const out = assignReceiptNumbers(
      [t(1, 84, 86), t(2, 85, 86)],
      NAMES,
      [{ rcp_no: "자(비)-5", rcp_no2: 5 }],
    );
    expect(out.map((r) => r.rcp_no2)).toEqual([6, 7]);
  });

  it("T-9 선거비용외 → 자(비외)-1", () => {
    const out = assignReceiptNumbers([t(1, 84, 87)], NAMES, []);
    expect(out[0].rcp_no).toBe("자(비외)-1");
  });

  it("수입 과목(첫 글자 폴백) 조합", () => {
    const out = assignReceiptNumbers([t(1, 85, 50)], NAMES, []);
    expect(out[0].rcp_no).toBe("후(후)-1"); // 후원회기부금 계정(후) + 후원회기부금 과목(후)
  });
});
