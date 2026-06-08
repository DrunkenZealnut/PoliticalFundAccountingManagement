import { describe, it, expect } from "vitest";
import {
  buildReportSummaryModel,
  classifyExpenseCategory,
  summaryTokens,
  type ReportSummaryInputRow,
} from "./report-summary-builder";

/** 코드명 맵: 계정(82~85)·과목(10 선거비용 / 11 선거비용외). */
const NAMES: Record<number, string> = {
  82: "보조금인 지원금",
  83: "보조금외 지원금",
  84: "후보자 자산",
  85: "후원회 기부금",
  10: "선거비용",
  11: "선거비용외 정치자금",
};
const getName = (cv: number) => NAMES[cv] ?? `코드${cv}`;

function row(p: Partial<ReportSummaryInputRow>): ReportSummaryInputRow {
  return { incm_sec_cd: 1, acc_sec_cd: 84, item_sec_cd: 10, acc_amt: 1000, ...p };
}

describe("classifyExpenseCategory", () => {
  it("'선거비용외' 포함 → 선거비용외", () => {
    expect(classifyExpenseCategory("선거비용외 정치자금")).toBe("선거비용외");
  });
  it("'선거비용' 포함(외 아님) → 선거비용", () => {
    expect(classifyExpenseCategory("선거비용")).toBe("선거비용");
  });
  it("불명은 보수적으로 선거비용외", () => {
    expect(classifyExpenseCategory("기타")).toBe("선거비용외");
    expect(classifyExpenseCategory("")).toBe("선거비용외");
  });
});

describe("buildReportSummaryModel", () => {
  it("구분 행은 자산·후원회기부금·보조금·보조금외 고정 순서", () => {
    const model = buildReportSummaryModel([], getName);
    expect(model.rows.map((r) => r.source)).toEqual([
      "후보자자산",
      "후원회기부금",
      "보조금",
      "보조금외",
    ]);
  });

  it("수입을 구분(funding source)별로 합산한다", () => {
    const model = buildReportSummaryModel(
      [
        row({ incm_sec_cd: 1, acc_sec_cd: 84, acc_amt: 90000000 }), // 자산
        row({ incm_sec_cd: 1, acc_sec_cd: 85, acc_amt: 3500000 }), // 후원회기부금
        row({ incm_sec_cd: 1, acc_sec_cd: 82, acc_amt: 1000000 }), // 보조금
      ],
      getName,
    );
    expect(model.rows[0]).toMatchObject({ source: "후보자자산", income: 90000000 });
    expect(model.rows[1]).toMatchObject({ source: "후원회기부금", income: 3500000 });
    expect(model.rows[2]).toMatchObject({ source: "보조금", income: 1000000 });
  });

  it("지출을 과목(선거비용/선거비용외)으로 나눠 구분별 집계하고 소계·잔액 계산", () => {
    const model = buildReportSummaryModel(
      [
        row({ incm_sec_cd: 1, acc_sec_cd: 84, acc_amt: 90000000 }),
        row({ incm_sec_cd: 2, acc_sec_cd: 84, item_sec_cd: 10, acc_amt: 60000000 }), // 선거비용
        row({ incm_sec_cd: 2, acc_sec_cd: 84, item_sec_cd: 11, acc_amt: 30000000 }), // 선거비용외
      ],
      getName,
    );
    const asset = model.rows[0];
    expect(asset).toMatchObject({
      income: 90000000,
      expElection: 60000000,
      expNonElection: 30000000,
      expSubtotal: 90000000,
      balance: 0,
    });
  });

  it("합계행은 각 열의 총합", () => {
    const model = buildReportSummaryModel(
      [
        row({ incm_sec_cd: 1, acc_sec_cd: 84, acc_amt: 90000000 }),
        row({ incm_sec_cd: 1, acc_sec_cd: 85, acc_amt: 10500000 }),
        row({ incm_sec_cd: 2, acc_sec_cd: 84, item_sec_cd: 10, acc_amt: 60000000 }),
        row({ incm_sec_cd: 2, acc_sec_cd: 85, item_sec_cd: 11, acc_amt: 1000000 }),
      ],
      getName,
    );
    expect(model.total).toMatchObject({
      income: 100500000,
      expElection: 60000000,
      expNonElection: 1000000,
      expSubtotal: 61000000,
      balance: 39500000,
    });
  });

  it("미분류 계정(기타)은 표 행이 아닌 합계에만 반영", () => {
    const model = buildReportSummaryModel(
      [
        row({ incm_sec_cd: 1, acc_sec_cd: 84, acc_amt: 1000 }),
        row({ incm_sec_cd: 1, acc_sec_cd: 999, acc_amt: 500 }), // 미분류 → 기타
      ],
      getName,
    );
    // 표 행 합은 1000, 합계는 1500
    expect(model.rows.reduce((a, r) => a + r.income, 0)).toBe(1000);
    expect(model.total.income).toBe(1500);
  });
});

describe("summaryTokens", () => {
  it("구분×5열 + 합계 토큰을 천단위 콤마로 채운다", () => {
    const model = buildReportSummaryModel(
      [
        row({ incm_sec_cd: 1, acc_sec_cd: 84, acc_amt: 90000000 }),
        row({ incm_sec_cd: 2, acc_sec_cd: 84, item_sec_cd: 10, acc_amt: 60000000 }),
        row({ incm_sec_cd: 2, acc_sec_cd: 84, item_sec_cd: 11, acc_amt: 30000000 }),
      ],
      getName,
    );
    const tok = summaryTokens(model);
    expect(tok["자산_수입"]).toBe("90,000,000");
    expect(tok["자산_선거비용"]).toBe("60,000,000");
    expect(tok["자산_선거비용외"]).toBe("30,000,000");
    expect(tok["자산_소계"]).toBe("90,000,000");
    expect(tok["자산_잔액"]).toBe("0");
    expect(tok["합계_수입"]).toBe("90,000,000");
    expect(tok["합계_소계"]).toBe("90,000,000");
  });
});
