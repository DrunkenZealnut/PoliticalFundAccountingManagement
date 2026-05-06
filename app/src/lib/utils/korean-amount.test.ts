import { describe, it, expect } from "vitest";
import { toKoreanAmount } from "./korean-amount";

describe("toKoreanAmount", () => {
  describe("기본 단위", () => {
    it("0 → 빈 문자열", () => {
      expect(toKoreanAmount(0)).toBe("");
    });
    it("1 → 일", () => {
      expect(toKoreanAmount(1)).toBe("일");
    });
    it("10 → 일십", () => {
      expect(toKoreanAmount(10)).toBe("일십");
    });
    it("100 → 일백", () => {
      expect(toKoreanAmount(100)).toBe("일백");
    });
    it("1000 → 일천", () => {
      expect(toKoreanAmount(1000)).toBe("일천");
    });
  });

  describe("만 단위", () => {
    it("10000 → 일만", () => {
      expect(toKoreanAmount(10000)).toBe("일만");
    });
    it("12345 → 일만이천삼백사십오", () => {
      expect(toKoreanAmount(12345)).toBe("일만이천삼백사십오");
    });
    it("100000 → 일십만", () => {
      expect(toKoreanAmount(100000)).toBe("일십만");
    });
    it("1230000 → 일백이십삼만", () => {
      expect(toKoreanAmount(1230000)).toBe("일백이십삼만");
    });
    it("12300000 → 일천이백삼십만", () => {
      expect(toKoreanAmount(12300000)).toBe("일천이백삼십만");
    });
  });

  describe("억 단위", () => {
    it("100000000 → 일억", () => {
      expect(toKoreanAmount(100000000)).toBe("일억");
    });
    it("1234567890 → 일십이억삼천사백오십육만칠천팔백구십", () => {
      expect(toKoreanAmount(1234567890)).toBe("일십이억삼천사백오십육만칠천팔백구십");
    });
  });

  describe("0 자리 생략", () => {
    it("10001 → 일만일 (0인 자리 생략)", () => {
      expect(toKoreanAmount(10001)).toBe("일만일");
    });
    it("1000000 → 일백만 (만 단위 생략)", () => {
      expect(toKoreanAmount(1000000)).toBe("일백만");
    });
    it("10000000 → 일천만", () => {
      expect(toKoreanAmount(10000000)).toBe("일천만");
    });
  });

  describe("유효하지 않은 입력", () => {
    it("음수 → 빈 문자열", () => {
      expect(toKoreanAmount(-100)).toBe("");
    });
    it("소수 → 빈 문자열", () => {
      expect(toKoreanAmount(1.5)).toBe("");
    });
    it("NaN → 빈 문자열", () => {
      expect(toKoreanAmount(NaN)).toBe("");
    });
    it("Infinity → 빈 문자열", () => {
      expect(toKoreanAmount(Infinity)).toBe("");
    });
  });
});
