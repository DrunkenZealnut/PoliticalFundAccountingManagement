import { describe, it, expect } from "vitest";
import { classifyFundingSource, FUNDING_SOURCE_BY_ACC_SEC_CD } from "./funding-source";

describe("classifyFundingSource", () => {
  describe("코드값 매핑 (1차)", () => {
    it("82 → 보조금", () => {
      expect(classifyFundingSource(82)).toBe("보조금");
    });
    it("83 → 보조금외", () => {
      expect(classifyFundingSource(83)).toBe("보조금외");
    });
    it("84 → 후보자자산", () => {
      expect(classifyFundingSource(84)).toBe("후보자자산");
    });
    it("85 → 후원회기부금", () => {
      expect(classifyFundingSource(85)).toBe("후원회기부금");
    });
  });

  describe("이름 폴백 (2차, 코드값 미등록 시)", () => {
    it("'보조금외 지원금' → 보조금외", () => {
      expect(classifyFundingSource(999, "보조금외 지원금")).toBe("보조금외");
    });
    it("'국고보조금' → 보조금", () => {
      expect(classifyFundingSource(999, "국고보조금")).toBe("보조금");
    });
    it("'후원회기부금' → 후원회기부금", () => {
      expect(classifyFundingSource(999, "후원회기부금")).toBe("후원회기부금");
    });
    it("'후원금' → 후원회기부금", () => {
      expect(classifyFundingSource(999, "후원금")).toBe("후원회기부금");
    });
    it("'후보자등 자산' → 후보자자산", () => {
      expect(classifyFundingSource(999, "후보자등 자산")).toBe("후보자자산");
    });
    it("매칭 없으면 기타", () => {
      expect(classifyFundingSource(999, "임의계정")).toBe("기타");
    });
    it("이름 미제공 시 기타", () => {
      expect(classifyFundingSource(999)).toBe("기타");
    });
  });

  describe("우선순위 — 보조금외가 보조금보다 먼저 매칭", () => {
    it("'보조금외'가 포함되면 보조금이 아닌 보조금외", () => {
      expect(classifyFundingSource(999, "정당의 보조금외 지원금")).toBe("보조금외");
    });
  });

  describe("매핑 상수", () => {
    it("4개 코드만 정의됨", () => {
      expect(Object.keys(FUNDING_SOURCE_BY_ACC_SEC_CD)).toHaveLength(4);
    });
  });
});
