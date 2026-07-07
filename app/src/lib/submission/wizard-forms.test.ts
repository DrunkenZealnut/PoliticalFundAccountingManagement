import { describe, it, expect } from "vitest";
import { reportFormsFor, reimburseFormsFor } from "./wizard-forms";

describe("reportFormsFor (보고서 트랙 서식 집합)", () => {
  it("candidate → 서식7(데이터채움)+20(빈양식)+22-1~4(데이터채움)", () => {
    const ids = reportFormsFor("candidate").map((f) => f.id);
    expect(ids).toEqual(["7", "20", "22-1", "22-2", "22-3", "22-4"]);
  });

  it("candidate 데이터 채움 구분: 서식7·22-x 는 dataFill, 20 은 빈 양식", () => {
    const forms = reportFormsFor("candidate");
    const filled = forms.filter((f) => f.dataFill).map((f) => f.id);
    const blank = forms.filter((f) => !f.dataFill).map((f) => f.id);
    expect(filled).toEqual(["7", "22-1", "22-2", "22-3", "22-4"]);
    expect(blank).toEqual(["20"]);
  });

  it("supporter → 서식8·20·23-x 전부 빈 양식(dataFill 없음)", () => {
    const forms = reportFormsFor("supporter");
    expect(forms.map((f) => f.id)).toEqual([
      "8", "20",
      "23-1", "23-2", "23-3", "23-4", "23-5", "23-6",
      "23-7", "23-8", "23-9", "23-10", "23-11",
    ]);
    expect(forms.every((f) => !f.dataFill)).toBe(true);
  });

  it("party/lawmaker → candidate 스코프(기존 formsForOrgType 규칙과 동일)", () => {
    expect(reportFormsFor("party").map((f) => f.id)).toEqual(
      reportFormsFor("candidate").map((f) => f.id),
    );
  });
});

describe("reimburseFormsFor (보전 트랙 서식 집합)", () => {
  it("candidate → 서식43(보전청구서)+보전목록", () => {
    expect(reimburseFormsFor("candidate").map((f) => f.id)).toEqual(["43", "보전목록"]);
  });

  it("서식44(점자형 부담비용)는 마법사 보전 세트에서 제외", () => {
    expect(reimburseFormsFor("candidate").some((f) => f.id === "44")).toBe(false);
  });

  it("supporter·party·null → 빈 배열(후보자 전용 트랙)", () => {
    expect(reimburseFormsFor("supporter")).toEqual([]);
    expect(reimburseFormsFor("party")).toEqual([]);
    expect(reimburseFormsFor(null)).toEqual([]);
  });
});
