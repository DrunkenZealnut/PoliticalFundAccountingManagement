import { describe, it, expect } from "vitest";
import {
  buildElectionExpenseSummaryModel,
  electionExpenseSummaryTokens,
  type ElectionExpenseSummaryInputRow,
} from "./election-expense-summary-builder";
import { buildReportSummaryModel, type ReportSummaryInputRow } from "./report-summary-builder";

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

function row(p: Partial<ElectionExpenseSummaryInputRow>): ElectionExpenseSummaryInputRow {
  return { incm_sec_cd: 2, acc_sec_cd: 84, item_sec_cd: 10, acc_amt: 1000, ...p };
}

describe("buildElectionExpenseSummaryModel", () => {
  it("TC-1: 수입행·선거비용외 지출행은 무시하고 선거비용 지출만 집계", () => {
    const model = buildElectionExpenseSummaryModel(
      [
        row({ incm_sec_cd: 1, acc_sec_cd: 84, item_sec_cd: 10, acc_amt: 90000000 }), // 수입 → 무시
        row({ incm_sec_cd: 2, acc_sec_cd: 84, item_sec_cd: 11, acc_amt: 30000000 }), // 선거비용외 → 무시
        row({ incm_sec_cd: 2, acc_sec_cd: 84, item_sec_cd: 10, acc_amt: 60000000 }), // 선거비용 → 집계
      ],
      getName,
    );
    expect(model.office.후보자자산).toBe(60000000);
    expect(model.office.계).toBe(60000000);
  });

  it("TC-2: 자금원 코드(82~85)를 4분류로 정확히 가산", () => {
    const model = buildElectionExpenseSummaryModel(
      [
        row({ acc_sec_cd: 84, acc_amt: 60000000 }), // 후보자자산
        row({ acc_sec_cd: 85, acc_amt: 2500000 }), // 후원회기부금
        row({ acc_sec_cd: 82, acc_amt: 2500000 }), // 보조금
        row({ acc_sec_cd: 83, acc_amt: 2500000 }), // 보조금외
      ],
      getName,
    );
    expect(model.office).toMatchObject({
      후보자자산: 60000000,
      후원회기부금: 2500000,
      보조금: 2500000,
      보조금외: 2500000,
    });
  });

  it("TC-3: 계=4열 가로합, total=office(옵션 A), branch는 전부 0", () => {
    const model = buildElectionExpenseSummaryModel(
      [
        row({ acc_sec_cd: 84, acc_amt: 60000000 }),
        row({ acc_sec_cd: 85, acc_amt: 2500000 }),
        row({ acc_sec_cd: 82, acc_amt: 2500000 }),
        row({ acc_sec_cd: 83, acc_amt: 2500000 }),
      ],
      getName,
    );
    // 계 = 가로합
    expect(model.office.계).toBe(67500000);
    // total = office
    expect(model.total).toEqual(model.office);
    // branch 전부 0
    expect(model.branch).toEqual({
      후보자자산: 0,
      후원회기부금: 0,
      보조금: 0,
      보조금외: 0,
      계: 0,
    });
  });

  it("TC-4: 미분류 자금원(기타) 선거비용은 보조금외 열에 흡수", () => {
    const model = buildElectionExpenseSummaryModel(
      [
        row({ acc_sec_cd: 83, acc_amt: 1000000 }), // 보조금외 본래
        row({ acc_sec_cd: 999, acc_amt: 500000 }), // 미분류 → 보조금외 흡수
      ],
      getName,
    );
    expect(model.office.보조금외).toBe(1500000);
    expect(model.office.계).toBe(1500000); // 합계 보존
  });

  it("TC-5: 입력 0건이면 모든 값 0", () => {
    const model = buildElectionExpenseSummaryModel([], getName);
    expect(model.office).toEqual({
      후보자자산: 0,
      후원회기부금: 0,
      보조금: 0,
      보조금외: 0,
      계: 0,
    });
    expect(model.total).toEqual(model.office);
  });

  it("TC-7: 22-1(report-summary) 선거비용 총합과 22-2 total.계가 일치 (기타 포함)", () => {
    const rows = [
      { incm_sec_cd: 1, acc_sec_cd: 84, item_sec_cd: 10, acc_amt: 90000000 }, // 수입
      { incm_sec_cd: 2, acc_sec_cd: 84, item_sec_cd: 10, acc_amt: 60000000 }, // 선거비용
      { incm_sec_cd: 2, acc_sec_cd: 85, item_sec_cd: 10, acc_amt: 2500000 }, // 선거비용
      { incm_sec_cd: 2, acc_sec_cd: 999, item_sec_cd: 10, acc_amt: 500000 }, // 기타 선거비용
      { incm_sec_cd: 2, acc_sec_cd: 84, item_sec_cd: 11, acc_amt: 30000000 }, // 선거비용외
    ];
    const summary = buildReportSummaryModel(rows as ReportSummaryInputRow[], getName);
    const election = buildElectionExpenseSummaryModel(
      rows as ElectionExpenseSummaryInputRow[],
      getName,
    );
    expect(election.total.계).toBe(summary.total.expElection);
    expect(election.total.계).toBe(63000000);
  });
});

describe("electionExpenseSummaryTokens", () => {
  it("TC-6: 15개 토큰(합계/사무소/연락소계 × 5열)을 천단위 콤마로 채운다", () => {
    const model = buildElectionExpenseSummaryModel(
      [
        row({ acc_sec_cd: 84, acc_amt: 60000000 }),
        row({ acc_sec_cd: 85, acc_amt: 2500000 }),
        row({ acc_sec_cd: 82, acc_amt: 2500000 }),
        row({ acc_sec_cd: 83, acc_amt: 2500000 }),
      ],
      getName,
    );
    const tok = electionExpenseSummaryTokens(model);
    const prefixes = ["합계", "사무소", "연락소계"];
    const suffixes = ["계", "후보자자산", "후원회기부금", "보조금", "보조금외"];
    const keys = Object.keys(tok);
    expect(keys).toHaveLength(15);
    for (const p of prefixes) {
      for (const s of suffixes) {
        expect(tok).toHaveProperty(`${p}_${s}`);
      }
    }
    expect(tok["합계_계"]).toBe("67,500,000");
    expect(tok["사무소_후보자자산"]).toBe("60,000,000");
    expect(tok["연락소계_계"]).toBe("0");
  });
});
