import { describe, it, expect } from "vitest";
import {
  SUBMISSION_FORMS,
  getRequiredForms,
  getFormsGroupedByStage,
  getUncheckedForms,
} from "./submission-forms";

describe("SUBMISSION_FORMS 카탈로그", () => {
  it("모든 양식은 id, label, stage 보유", () => {
    for (const f of SUBMISSION_FORMS) {
      expect(f.id).toBeTruthy();
      expect(f.label).toBeTruthy();
      expect(f.stage).toBeTruthy();
    }
  });

  it("id는 중복 없음", () => {
    const ids = SUBMISSION_FORMS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("선거비용 보전청구서는 parityChecked=true (최근 머지됨)", () => {
    const reimbursement = SUBMISSION_FORMS.find(
      (f) => f.id === "reimbursement-1",
    );
    expect(reimbursement?.parityChecked).toBe(true);
  });
});

describe("getRequiredForms - orgSecCd 필터", () => {
  it("후보자(90)는 회계보고서 + 회계책임자 + 보전청구서 모두 보임", () => {
    const forms = getRequiredForms(90);
    const ids = forms.map((f) => f.id);
    expect(ids).toContain("audit-opinion");
    expect(ids).toContain("2-1");
    expect(ids).toContain("reimbursement-1");
  });

  it("후보자(90)는 후보자 전용 양식(2-3, 12-1) 보임", () => {
    const ids = getRequiredForms(90).map((f) => f.id);
    expect(ids).toContain("2-3");
    expect(ids).toContain("12-1");
  });

  it("후원회(109)는 후보자 전용 양식 제외", () => {
    const ids = getRequiredForms(109).map((f) => f.id);
    expect(ids).not.toContain("2-3"); // CANDIDATE_LIST 전용
    expect(ids).not.toContain("12-1");
    expect(ids).not.toContain("reimbursement-1"); // 보전청구는 후보자만
    expect(ids).toContain("audit-opinion"); // 공통은 있음
    expect(ids).toContain("4"); // 예금계좌 신고서 공통
  });

  it("정당(50, ALL_ORGS만)은 공통 양식만 보임", () => {
    const ids = getRequiredForms(50).map((f) => f.id);
    expect(ids).toContain("audit-opinion");
    expect(ids).not.toContain("reimbursement-1");
    expect(ids).not.toContain("2-3");
  });

  it("빈 requiredFor인 양식은 모든 orgSecCd에서 반환", () => {
    const forAny = SUBMISSION_FORMS.filter((f) => f.requiredFor.length === 0);
    const for90 = getRequiredForms(90).map((f) => f.id);
    for (const f of forAny) {
      expect(for90).toContain(f.id);
    }
  });
});

describe("getFormsGroupedByStage", () => {
  it("Stage별로 정렬되어 반환", () => {
    const grouped = getFormsGroupedByStage(90);
    const stages = grouped.map((g) => g.stage);
    const sorted = [...stages].sort();
    expect(stages).toEqual(sorted);
  });

  it("각 그룹은 1개 이상의 양식 보유", () => {
    const grouped = getFormsGroupedByStage(90);
    for (const g of grouped) {
      expect(g.forms.length).toBeGreaterThan(0);
    }
  });

  it("후보자(90)에서는 Stage 1~5 모두 등장", () => {
    const grouped = getFormsGroupedByStage(90);
    const stages = grouped.map((g) => g.stage);
    expect(stages).toContain("1");
    expect(stages).toContain("2");
    expect(stages).toContain("3");
    expect(stages).toContain("4");
    expect(stages).toContain("5");
  });
});

describe("getUncheckedForms - parity 검증 안 됨", () => {
  it("후보자(90)에서 미검증 양식 수가 검증된 것보다 많음 (초기 상태)", () => {
    const unchecked = getUncheckedForms(90);
    const all = getRequiredForms(90);
    expect(unchecked.length).toBeLessThanOrEqual(all.length);
    expect(unchecked.length).toBeGreaterThan(0);
  });

  it("reimbursement-1은 미검증 목록에 없음", () => {
    const unchecked = getUncheckedForms(90);
    expect(unchecked.find((f) => f.id === "reimbursement-1")).toBeUndefined();
  });
});
