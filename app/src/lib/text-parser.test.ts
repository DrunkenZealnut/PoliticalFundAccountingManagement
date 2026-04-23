import { describe, it, expect } from "vitest";
import { parseExpenseText } from "./text-parser";

describe("text-parser", () => {
  describe("parseExpenseText", () => {
    it("should return empty result for empty input", () => {
      const result = parseExpenseText("");
      expect(result.amount).toBeNull();
      expect(result.date).toBeNull();
      expect(result.content).toBe("");
    });

    describe("amount extraction", () => {
      it("should parse 만원 format", () => {
        const result = parseExpenseText("명함 50만원");
        expect(result.amount).toBe(500000);
      });

      it("should parse 만 without 원", () => {
        const result = parseExpenseText("현수막 30만");
        expect(result.amount).toBe(300000);
      });

      it("should parse comma-separated format", () => {
        const result = parseExpenseText("명함 500,000원");
        expect(result.amount).toBe(500000);
      });

      it("should parse 만+천 format", () => {
        const result = parseExpenseText("다과비 3만5천원");
        expect(result.amount).toBe(35000);
      });

      it("should parse large numbers without comma", () => {
        const result = parseExpenseText("인쇄비 500000");
        expect(result.amount).toBe(500000);
      });

      it("should return null when no amount", () => {
        const result = parseExpenseText("명함 인쇄");
        expect(result.amount).toBeNull();
      });
    });

    describe("date extraction", () => {
      it("should parse 월일 format", () => {
        const result = parseExpenseText("명함 4월10일");
        expect(result.date).toMatch(/\d{4}-04-10/);
      });

      it("should parse slash format", () => {
        const result = parseExpenseText("명함 4/10");
        expect(result.date).toMatch(/\d{4}-04-10/);
      });

      it("should parse ISO format", () => {
        const result = parseExpenseText("명함 2026-04-10");
        expect(result.date).toBe("2026-04-10");
      });

      it("should parse 어제", () => {
        const result = parseExpenseText("명함 어제");
        expect(result.date).not.toBeNull();
      });

      it("should return null when no date", () => {
        const result = parseExpenseText("명함 인쇄 50만원");
        expect(result.date).toBeNull();
      });
    });

    describe("pay method extraction", () => {
      it("should detect 카드", () => {
        const result = parseExpenseText("명함 50만원 카드");
        expect(result.payMethod).toBe("584");
      });

      it("should detect 현금", () => {
        const result = parseExpenseText("명함 현금");
        expect(result.payMethod).toBe("120");
      });

      it("should detect 계좌이체", () => {
        const result = parseExpenseText("명함 계좌이체");
        expect(result.payMethod).toBe("118");
      });

      it("should detect 체크카드", () => {
        const result = parseExpenseText("명함 체크카드");
        expect(result.payMethod).toBe("585");
      });

      it("should return null when no pay method", () => {
        const result = parseExpenseText("명함 인쇄");
        expect(result.payMethod).toBeNull();
      });
    });

    describe("keyword extraction", () => {
      it("should extract matching keywords", () => {
        const result = parseExpenseText("명함 인쇄 50만원");
        expect(result.keywords).toContain("명함");
        expect(result.keywords).toContain("인쇄");
      });

      it("should extract 현수막 keyword", () => {
        const result = parseExpenseText("현수막 제작 30만원");
        expect(result.keywords).toContain("현수막");
      });

      it("should extract 광고 keyword", () => {
        const result = parseExpenseText("신문 광고비");
        expect(result.keywords).toContain("광고");
      });
    });

    describe("customer name extraction", () => {
      it("should extract customer name", () => {
        const result = parseExpenseText("명함 인쇄 50만원 양지디자인");
        expect(result.customerName).toBe("양지디자인");
      });

      it("should extract customer from complex input", () => {
        const result = parseExpenseText("현수막 제작 30만원 OO간판점 4월10일 카드");
        expect(result.customerName).toContain("OO간판점");
      });
    });

    describe("content extraction", () => {
      it("should extract content without amount/date/pay", () => {
        const result = parseExpenseText("명함 인쇄 50만원 양지디자인 카드");
        expect(result.content).toContain("명함");
        expect(result.content).toContain("인쇄");
      });
    });

    describe("full integration", () => {
      it("should parse complete expense text", () => {
        const result = parseExpenseText("명함 인쇄 50만원 양지디자인 4월10일 카드");
        expect(result.amount).toBe(500000);
        expect(result.date).toMatch(/\d{4}-04-10/);
        expect(result.payMethod).toBe("584");
        expect(result.customerName).toBe("양지디자인");
        expect(result.keywords.length).toBeGreaterThan(0);
      });

      it("should handle minimal input", () => {
        const result = parseExpenseText("사무용품 구입");
        expect(result.amount).toBeNull();
        expect(result.date).toBeNull();
        expect(result.payMethod).toBeNull();
        expect(result.content).toContain("사무용품");
      });
    });
  });
});
