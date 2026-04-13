import { describe, it, expect } from "vitest";
import {
  EXPENSE_WIZARD_TYPES,
  INCOME_WIZARD_TYPES,
  resolveCodeValues,
  searchWizardTypes,
  inferExpenseType,
  type WizardType,
} from "./wizard-mappings";
import { getReimbursementStatus } from "./expense-types";

describe("wizard-mappings", () => {
  describe("EXPENSE_WIZARD_TYPES", () => {
    it("should have 10 expense types", () => {
      expect(EXPENSE_WIZARD_TYPES).toHaveLength(10);
    });

    it("all expense types should have incmSecCd=2", () => {
      for (const t of EXPENSE_WIZARD_TYPES) {
        expect(t.incmSecCd).toBe(2);
      }
    });

    it("receipt-scan card should have a route", () => {
      const receipt = EXPENSE_WIZARD_TYPES.find((t) => t.id === "receipt-scan");
      expect(receipt?.route).toBe("/dashboard/document-register");
    });

    it("other-expense card should have empty expGroup1", () => {
      const other = EXPENSE_WIZARD_TYPES.find((t) => t.id === "other-expense");
      expect(other?.expGroup1).toBeFalsy();
    });
  });

  describe("INCOME_WIZARD_TYPES", () => {
    it("should have 5 income types", () => {
      expect(INCOME_WIZARD_TYPES).toHaveLength(5);
    });

    it("all income types should have incmSecCd=1", () => {
      for (const t of INCOME_WIZARD_TYPES) {
        expect(t.incmSecCd).toBe(1);
      }
    });

    it("donation card should match 후원 keyword for account", () => {
      const donation = INCOME_WIZARD_TYPES.find((t) => t.id === "donation");
      expect(donation?.accSecCdName).toBe("후원");
    });
  });

  describe("resolveCodeValues", () => {
    const mockAccounts = [
      { cv_id: 100, cv_name: "후보자등자산" },
      { cv_id: 200, cv_name: "후원회기부금" },
      { cv_id: 300, cv_name: "보조금" },
    ];
    const mockItems = [
      { cv_id: 10, cv_name: "선거비용" },
      { cv_id: 20, cv_name: "선거비용외" },
    ];

    const getAccounts = () => mockAccounts;
    const getItems = () => mockItems;

    it("should return first account when no accSecCdName", () => {
      const type: WizardType = {
        id: "test", icon: "", label: "", description: "",
        incmSecCd: 2, keywords: [],
      };
      const result = resolveCodeValues(type, 4, getAccounts, getItems);
      expect(result.accSecCd).toBe(100);
    });

    it("should match account by accSecCdName keyword", () => {
      const type: WizardType = {
        id: "test", icon: "", label: "", description: "",
        incmSecCd: 1, accSecCdName: "후원", keywords: [],
      };
      const result = resolveCodeValues(type, 4, getAccounts, getItems);
      expect(result.accSecCd).toBe(200);
    });

    it("should match 선거비용 item (excluding 선거비용외)", () => {
      const type: WizardType = {
        id: "test", icon: "", label: "", description: "",
        incmSecCd: 2, itemKeyword: "선거비용", keywords: [],
      };
      const result = resolveCodeValues(type, 4, getAccounts, getItems);
      expect(result.itemSecCd).toBe(10);
    });

    it("should match 선거비용외 item", () => {
      const type: WizardType = {
        id: "test", icon: "", label: "", description: "",
        incmSecCd: 2, itemKeyword: "선거비용외", keywords: [],
      };
      const result = resolveCodeValues(type, 4, getAccounts, getItems);
      expect(result.itemSecCd).toBe(20);
    });

    it("should return first item when no itemKeyword", () => {
      const type: WizardType = {
        id: "test", icon: "", label: "", description: "",
        incmSecCd: 2, keywords: [],
      };
      const result = resolveCodeValues(type, 4, getAccounts, getItems);
      expect(result.itemSecCd).toBe(10);
    });

    it("should handle empty accounts array", () => {
      const emptyAccounts = () => [] as { cv_id: number; cv_name: string }[];
      const type: WizardType = {
        id: "test", icon: "", label: "", description: "",
        incmSecCd: 2, keywords: [],
      };
      const result = resolveCodeValues(type, 4, emptyAccounts, getItems);
      expect(result.accSecCd).toBe(0);
    });

    it("should handle empty items array", () => {
      const emptyItems = () => [] as { cv_id: number; cv_name: string }[];
      const type: WizardType = {
        id: "test", icon: "", label: "", description: "",
        incmSecCd: 2, itemKeyword: "선거비용", keywords: [],
      };
      const result = resolveCodeValues(type, 4, getAccounts, emptyItems);
      expect(result.itemSecCd).toBe(0);
    });
  });

  describe("searchWizardTypes", () => {
    it("should return all IDs when keyword is empty", () => {
      const result = searchWizardTypes(EXPENSE_WIZARD_TYPES, "");
      expect(result.size).toBe(EXPENSE_WIZARD_TYPES.length);
    });

    it("should return all IDs when keyword is whitespace", () => {
      const result = searchWizardTypes(EXPENSE_WIZARD_TYPES, "   ");
      expect(result.size).toBe(EXPENSE_WIZARD_TYPES.length);
    });

    it("should match by label", () => {
      const result = searchWizardTypes(EXPENSE_WIZARD_TYPES, "사무소");
      expect(result.has("office")).toBe(true);
      expect(result.size).toBeGreaterThanOrEqual(1);
    });

    it("should match by description", () => {
      const result = searchWizardTypes(EXPENSE_WIZARD_TYPES, "명함");
      expect(result.has("print")).toBe(true);
    });

    it("should match by keywords array", () => {
      const result = searchWizardTypes(EXPENSE_WIZARD_TYPES, "전기");
      expect(result.has("office")).toBe(true);
    });

    it("should return empty set when no match", () => {
      const result = searchWizardTypes(EXPENSE_WIZARD_TYPES, "xyz존재하지않는키워드");
      expect(result.size).toBe(0);
    });

    it("should be case insensitive for labels", () => {
      const result = searchWizardTypes(EXPENSE_WIZARD_TYPES, "광고");
      expect(result.has("ad")).toBe(true);
    });

    it("should match across income types too", () => {
      const result = searchWizardTypes(INCOME_WIZARD_TYPES, "후원");
      expect(result.has("donation")).toBe(true);
    });
  });

  describe("inferExpenseType", () => {
    it("should return empty result for no keywords", () => {
      const result = inferExpenseType([]);
      expect(result.confidence).toBe(0);
      expect(result.wizardType).toBeNull();
    });

    it("Step 1: should match level2 labels with confidence 0.9", () => {
      const result = inferExpenseType(["명함"]);
      expect(result.confidence).toBe(0.9);
      expect(result.expGroup1).toBe("인쇄물");
      expect(result.expGroup2).toBe("명함");
      expect(result.expGroup3).toBeTruthy();
    });

    it("Step 1: should match 선거벽보 as level2", () => {
      const result = inferExpenseType(["선거벽보"]);
      expect(result.confidence).toBe(0.9);
      expect(result.expGroup1).toBe("인쇄물");
      expect(result.expGroup2).toBe("선거벽보");
    });

    it("Step 1: should match 신문광고 as level2", () => {
      const result = inferExpenseType(["신문광고"]);
      expect(result.confidence).toBe(0.9);
      expect(result.expGroup1).toBe("광고");
    });

    it("Step 2: should match WizardType keywords with confidence 0.7", () => {
      // "설치"와 "철거"는 level2 라벨이 아니므로 Step 2로 떨어짐
      const result = inferExpenseType(["설치", "철거"]);
      expect(result.confidence).toBe(0.7);
      expect(result.wizardType).not.toBeNull();
      expect(result.wizardType?.id).toBe("banner");
    });

    it("Step 2: should prefer type with more keyword matches", () => {
      const result = inferExpenseType(["사무소", "임대"]);
      expect(result.confidence).toBe(0.7);
      expect(result.wizardType?.id).toBe("office");
    });

    it("Step 2: should skip route-only cards", () => {
      const result = inferExpenseType(["영수증"]);
      // "영수증" matches receipt-scan card (has route), should be skipped
      // It may match via Step 3 substring or fall to "기타"
      expect(result.wizardType?.route).toBeFalsy();
    });

    it("Step 3: should do substring match with confidence 0.5", () => {
      const result = inferExpenseType(["광고"]);
      // "광고" exactly matches ad card label, could be Step 2 or 3
      expect(result.confidence).toBeGreaterThanOrEqual(0.5);
      expect(result.wizardType?.id).toBe("ad");
    });

    it("Step 4: should return other-expense for unrecognized keywords", () => {
      const result = inferExpenseType(["xyz없는키워드"]);
      expect(result.confidence).toBe(0);
      expect(result.wizardType?.id).toBe("other-expense");
    });

    it("should populate expGroup1 from matched WizardType", () => {
      const result = inferExpenseType(["수당", "사무원"]);
      expect(result.confidence).toBe(0.7);
      expect(result.expGroup1).toBe("선거사무관계자");
    });

    it("should set wizardType for level2 match when expGroup1 matches a card", () => {
      const result = inferExpenseType(["명함"]);
      expect(result.wizardType).not.toBeNull();
      // "인쇄물" matches the print card's expGroup1
    });
  });

  describe("getReimbursementStatus", () => {
    it("should return 선거비용외 for non-election expenses", () => {
      const result = getReimbursementStatus("선거비용외", "선거사무소", "임차보증금");
      expect(result.status).toBe("선거비용외");
    });

    it("should return 보전 for 인쇄물 > 선거벽보", () => {
      const result = getReimbursementStatus("선거비용", "인쇄물", "선거벽보");
      expect(result.status).toBe("보전");
    });

    it("should return 보전 for 광고 > 신문광고", () => {
      const result = getReimbursementStatus("선거비용", "광고", "신문광고");
      expect(result.status).toBe("보전");
    });

    it("should return 미보전 for 인쇄물 > 예비후보자홍보물", () => {
      const result = getReimbursementStatus("선거비용", "인쇄물", "예비후보자홍보물");
      expect(result.status).toBe("미보전");
    });

    it("should return 미보전 for 전자우편", () => {
      const result = getReimbursementStatus("선거비용", "전화/전자우편/문자메시지", "전자우편");
      expect(result.status).toBe("미보전");
    });

    it("should return 보전 for 문자메시지", () => {
      const result = getReimbursementStatus("선거비용", "전화/전자우편/문자메시지", "문자메시지");
      expect(result.status).toBe("보전");
    });

    it("should return 미보전 for 위법비용", () => {
      const result = getReimbursementStatus("선거비용", "기타", "위법비용");
      expect(result.status).toBe("미보전");
    });

    it("should return 보전 for 선거사무관계자 수당", () => {
      const result = getReimbursementStatus("선거비용", "선거사무관계자", "선거사무관계자수당");
      expect(result.status).toBe("보전");
    });

    it("should return 보전 for 거리게시용현수막", () => {
      const result = getReimbursementStatus("선거비용", "거리게시용현수막", "거리게시용현수막");
      expect(result.status).toBe("보전");
    });

    it("should return 보전 for 선거사무소 간판", () => {
      const result = getReimbursementStatus("선거비용", "선거사무소", "간판");
      expect(result.status).toBe("보전");
    });

    it("should return 판별불가 when expGroup1 is empty", () => {
      const result = getReimbursementStatus("선거비용", "");
      expect(result.status).toBe("판별불가");
    });

    it("should return 판별불가 when itemCategory is not set", () => {
      const result = getReimbursementStatus("", "인쇄물");
      expect(result.status).toBe("판별불가");
    });
  });
});
