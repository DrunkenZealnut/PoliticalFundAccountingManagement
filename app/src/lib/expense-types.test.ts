import { describe, it, expect } from "vitest";
import {
  NON_ELECTION_EXP_TYPES,
  ELECTION_EXP_TYPES,
  getExpTypeData,
  detectItemCategory,
  getReimbursementStatus,
} from "./expense-types";

describe("expense-types 부담비용", () => {
  describe("NON_ELECTION_EXP_TYPES 부담비용 카테고리", () => {
    const burden = NON_ELECTION_EXP_TYPES.find((t) => t.label === "부담비용");

    it("부담비용 카테고리가 존재한다", () => {
      expect(burden).toBeDefined();
    });

    it("4개의 level2 항목이 있다 (점자형선거공보, 점자형선거공약서, 저장매체, 활동보조인)", () => {
      expect(burden!.level2).toHaveLength(4);
      const labels = burden!.level2.map((l) => l.label);
      expect(labels).toContain("점자형선거공보");
      expect(labels).toContain("점자형선거공약서");
      expect(labels).toContain("저장매체");
      expect(labels).toContain("활동보조인");
    });

    it("점자형선거공보의 level3에 지대/인쇄비, 한글인쇄료, 운반비가 있다", () => {
      const item = burden!.level2.find((l) => l.label === "점자형선거공보");
      expect(item!.level3).toContain("지대/인쇄비/제본비");
      expect(item!.level3).toContain("한글인쇄료");
      expect(item!.level3).toContain("운반비");
    });

    it("활동보조인의 level3에 수당, 실비, 산재보험료가 있다", () => {
      const item = burden!.level2.find((l) => l.label === "활동보조인");
      expect(item!.level3).toEqual(["수당", "실비", "산재보험료"]);
    });
  });

  describe("detectItemCategory", () => {
    it("부담비용은 양쪽에 없으므로 선거비용외를 반환한다", () => {
      const inElection = ELECTION_EXP_TYPES.some((t) => t.label === "부담비용");
      const inNonElection = NON_ELECTION_EXP_TYPES.some((t) => t.label === "부담비용");
      expect(inElection).toBe(false);
      expect(inNonElection).toBe(true);
      expect(detectItemCategory("부담비용")).toBe("선거비용외");
    });

    it("선거사무소는 양쪽 모두 존재하므로 null", () => {
      expect(detectItemCategory("선거사무소")).toBeNull();
    });

    it("인쇄물은 선거비용만 존재", () => {
      expect(detectItemCategory("인쇄물")).toBe("선거비용");
    });
  });

  describe("getReimbursementStatus 부담비용 판별", () => {
    it("선거비용외 + 부담비용 → 부담비용 상태", () => {
      const result = getReimbursementStatus("선거비용외정치자금", "부담비용");
      expect(result.status).toBe("부담비용");
      expect(result.reason).toContain("국가/지자체가 부담");
    });

    it("선거비용외 + 부담비용 + 점자형선거공보 → 세부 안내 포함", () => {
      const result = getReimbursementStatus("선거비용외정치자금", "부담비용", "점자형선거공보");
      expect(result.status).toBe("부담비용");
      expect(result.reason).toContain("점자형선거공보");
      expect(result.reason).toContain("선거일 후 10일");
    });

    it("선거비용외 + 선거사무소 → 선거비용외 (부담비용 아님)", () => {
      const result = getReimbursementStatus("선거비용외정치자금", "선거사무소");
      expect(result.status).toBe("선거비용외");
    });

    it("선거비용 + 인쇄물 + 선거벽보 → 보전", () => {
      const result = getReimbursementStatus("선거비용", "인쇄물", "선거벽보");
      expect(result.status).toBe("보전");
    });
  });

  describe("getExpTypeData", () => {
    it("선거비용 → ELECTION_EXP_TYPES 반환", () => {
      const data = getExpTypeData("선거비용");
      expect(data).toBe(ELECTION_EXP_TYPES);
    });

    it("선거비용외 → NON_ELECTION_EXP_TYPES 반환 (부담비용 포함)", () => {
      const data = getExpTypeData("선거비용외");
      expect(data).toBe(NON_ELECTION_EXP_TYPES);
      expect(data.some((t) => t.label === "부담비용")).toBe(true);
    });
  });
});
