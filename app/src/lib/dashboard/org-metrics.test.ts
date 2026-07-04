import { describe, it, expect } from "vitest";
import {
  computeCandidateMetrics,
  computeSupporterMetrics,
  type OrgMetricsRow,
  type OrgMetricsContext,
} from "./org-metrics";

/** 테스트용 행 생성 헬퍼 (필수 필드 기본값 + override) */
function row(over: Partial<OrgMetricsRow>): OrgMetricsRow {
  return {
    incm_sec_cd: 2,
    acc_sec_cd: 0,
    item_sec_cd: 0,
    exp_sec_cd: 0,
    acc_print_ok: null,
    acc_amt: 0,
    acc_date: "20260601",
    cust_id: null,
    ...over,
  };
}

/**
 * 테스트 코드 컨텍스트:
 * - item_sec_cd 200 = "선거비용" 과목 (보전 집계 대상)
 * - acc_sec_cd 82 = "보조금", 85 = "후원회기부금" (자금원)
 * - item_sec_cd 97 = "기부금" (후원회→후보자 지급), 101 = "그 밖의 경비"
 */
const CTX: OrgMetricsContext = {
  electionExpenseItemCds: [200],
  codeNameById: {
    82: "보조금",
    84: "후보자등 자산",
    85: "후원회기부금",
    97: "기부금",
    101: "그 밖의 경비",
    200: "선거비용",
  },
};

describe("computeCandidateMetrics", () => {
  it("선거비용/선거비용외는 과목(item_sec_cd∈선거비용)으로 분리한다 — exp_sec_cd 무관", () => {
    // 지출유형(exp_sec_cd) 미입력(0)이어도 과목이 선거비용(200)이면 선거비용. (계정×과목)·총괄표와 동일 기준.
    const rows = [
      row({ incm_sec_cd: 2, item_sec_cd: 200, exp_sec_cd: 0, acc_amt: 1000 }), // 선거비용 과목
      row({ incm_sec_cd: 2, item_sec_cd: 200, exp_sec_cd: 0, acc_amt: 500 }), // 선거비용 과목
      row({ incm_sec_cd: 2, item_sec_cd: 101, exp_sec_cd: 0, acc_amt: 300 }), // 선거비용 과목 아님 → 선거비용외
      row({ incm_sec_cd: 1, item_sec_cd: 200, acc_amt: 9999 }), // 수입(지출 아님 → 제외)
    ];
    const m = computeCandidateMetrics(rows, CTX);
    expect(m.electionExpense).toBe(1500);
    expect(m.nonElectionExpense).toBe(300);
  });

  it("보전 예상액은 claim-form과 동일 기준(선거비용 과목 & acc_print_ok='Y' & 자금원≠기타)으로 합산", () => {
    const rows = [
      // 선거비용 과목(200) + 보전체크 + 자금원 보조금 → 합산
      row({ incm_sec_cd: 2, item_sec_cd: 200, acc_sec_cd: 82, acc_print_ok: "Y", acc_amt: 1000 }),
      row({ incm_sec_cd: 2, item_sec_cd: 200, acc_sec_cd: 85, acc_print_ok: "Y", acc_amt: 2000 }),
      // 보전 미체크 → 제외
      row({ incm_sec_cd: 2, item_sec_cd: 200, acc_sec_cd: 82, acc_print_ok: null, acc_amt: 500 }),
      // 선거비용 과목 아님(101) → 제외
      row({ incm_sec_cd: 2, item_sec_cd: 101, acc_sec_cd: 82, acc_print_ok: "Y", acc_amt: 700 }),
      // 자금원 "기타"(acc_sec_cd 미매핑 0) → aggregator가 제외
      row({ incm_sec_cd: 2, item_sec_cd: 200, acc_sec_cd: 0, acc_print_ok: "Y", acc_amt: 900 }),
    ];
    const m = computeCandidateMetrics(rows, CTX);
    expect(m.reimbursableEstimate).toBe(3000);
  });

  it("수입 출처를 acc_sec_cd로 4분류하고 비율을 계산한다", () => {
    const rows = [
      row({ incm_sec_cd: 1, acc_sec_cd: 82, acc_amt: 6000 }), // 보조금
      row({ incm_sec_cd: 1, acc_sec_cd: 85, acc_amt: 3000 }), // 후원회기부금
      row({ incm_sec_cd: 1, acc_sec_cd: 84, acc_amt: 1000 }), // 후보자자산
      row({ incm_sec_cd: 2, acc_sec_cd: 82, acc_amt: 5000 }), // 지출 → 제외
    ];
    const m = computeCandidateMetrics(rows, CTX);
    const subsidy = m.fundingSources.find((f) => f.source === "보조금");
    expect(subsidy?.amount).toBe(6000);
    expect(subsidy?.ratio).toBe(60); // 6000/10000
    expect(m.fundingSources.reduce((s, f) => s + f.amount, 0)).toBe(10000);
  });

  it("집행률 = 지출/수입, 수입 0이면 0으로 안전 처리한다", () => {
    expect(
      computeCandidateMetrics(
        [
          row({ incm_sec_cd: 1, acc_amt: 10000 }),
          row({ incm_sec_cd: 2, exp_sec_cd: 1, acc_amt: 8600 }),
        ],
        CTX,
      ).executionRate,
    ).toBe(86);

    expect(
      computeCandidateMetrics([row({ incm_sec_cd: 2, acc_amt: 500 })], CTX).executionRate,
    ).toBe(0);
  });

  it("잔액 = 총수입 - 총지출", () => {
    const m = computeCandidateMetrics(
      [
        row({ incm_sec_cd: 1, acc_amt: 10000 }),
        row({ incm_sec_cd: 2, exp_sec_cd: 1, acc_amt: 3000 }),
        row({ incm_sec_cd: 2, exp_sec_cd: 0, acc_amt: 2000 }),
      ],
      CTX,
    );
    expect(m.balance).toBe(5000);
  });

  it("ctx 없이 호출해도 안전하다 (보전 0, 자금원 코드값 폴백)", () => {
    const m = computeCandidateMetrics([
      row({ incm_sec_cd: 1, acc_sec_cd: 82, acc_amt: 1000 }),
      row({ incm_sec_cd: 2, exp_sec_cd: 1, item_sec_cd: 200, acc_print_ok: "Y", acc_amt: 500 }),
    ]);
    expect(m.reimbursableEstimate).toBe(0); // electionExpenseItemCds 비어있음 → 0
    expect(m.fundingSources.find((f) => f.source === "보조금")?.amount).toBe(1000);
  });

  it("Edge: 빈 데이터는 0으로 처리", () => {
    const m = computeCandidateMetrics([], CTX);
    expect(m.totalIncome).toBe(0);
    expect(m.totalExpense).toBe(0);
    expect(m.balance).toBe(0);
    expect(m.executionRate).toBe(0);
    expect(m.fundingSources).toHaveLength(0);
  });

  it("Edge: 환급(음수) 선거비용·보전 거래를 과목 기준으로 반영한다 (aggregator SSOT)", () => {
    const rows = [
      row({ incm_sec_cd: 2, item_sec_cd: 200, acc_amt: 1000 }), // 선거비용
      row({ incm_sec_cd: 2, item_sec_cd: 200, acc_amt: -300 }), // 환급(음수)
      // 보전: 양수=청구, 음수=환급/조정 차감 (acc_amt!==0 이면 합산)
      row({ incm_sec_cd: 2, item_sec_cd: 200, acc_sec_cd: 82, acc_print_ok: "Y", acc_amt: 800 }),
      row({ incm_sec_cd: 2, item_sec_cd: 200, acc_sec_cd: 82, acc_print_ok: "Y", acc_amt: -200 }),
    ];
    const m = computeCandidateMetrics(rows, CTX);
    // electionExpense는 음수 보정 반영, 전부 선거비용 과목(200)
    expect(m.electionExpense).toBe(1300); // 1000 - 300 + 800 - 200
    expect(m.reimbursableEstimate).toBe(600); // 800 - 200(환급 차감)
  });
});

describe("computeSupporterMetrics", () => {
  it("모금 총액은 수입(incm_sec_cd=1) 합계", () => {
    const m = computeSupporterMetrics(
      [
        row({ incm_sec_cd: 1, acc_amt: 5000, cust_id: 1 }),
        row({ incm_sec_cd: 1, acc_amt: 3000, cust_id: 2 }),
        row({ incm_sec_cd: 2, acc_amt: 1000 }),
      ],
      "202606",
      CTX,
    );
    expect(m.totalRaised).toBe(8000);
  });

  it("후보자 기부금 지급 = 지출 중 과목 코드명이 '기부금'인 합계 (실데이터 검증 반영)", () => {
    const m = computeSupporterMetrics(
      [
        row({ incm_sec_cd: 2, item_sec_cd: 97, acc_amt: 20000 }), // 기부금
        row({ incm_sec_cd: 2, item_sec_cd: 97, acc_amt: 5000 }), // 기부금
        row({ incm_sec_cd: 2, item_sec_cd: 101, acc_amt: 1000 }), // 그 밖의 경비 → 제외
        row({ incm_sec_cd: 1, item_sec_cd: 97, acc_amt: 999 }), // 수입 → 제외
      ],
      "202606",
      CTX,
    );
    expect(m.candidateGrantTotal).toBe(25000);
  });

  it("'후원회기부금'(수입 자금원명)은 후보자 기부금 지급으로 오집계하지 않는다", () => {
    const m = computeSupporterMetrics(
      [
        // item 코드명이 "후원회기부금"(85)인 지출 → "기부금" 정확매칭 아니므로 제외
        row({ incm_sec_cd: 2, item_sec_cd: 85, acc_amt: 7000 }),
        row({ incm_sec_cd: 2, item_sec_cd: 97, acc_amt: 3000 }), // 기부금 → 포함
      ],
      "202606",
      CTX,
    );
    expect(m.candidateGrantTotal).toBe(3000);
  });

  it("기부자 수는 수입 거래의 고유 cust_id, 신규는 당월 최초 거래자만 카운트", () => {
    const m = computeSupporterMetrics(
      [
        // 기부자1: 과거+당월 (신규 아님)
        row({ incm_sec_cd: 1, cust_id: 1, acc_amt: 1000, acc_date: "20260501" }),
        row({ incm_sec_cd: 1, cust_id: 1, acc_amt: 1000, acc_date: "20260605" }),
        // 기부자2: 당월 최초 (신규)
        row({ incm_sec_cd: 1, cust_id: 2, acc_amt: 2000, acc_date: "20260610" }),
        // 기부자3: 과거만 (신규 아님)
        row({ incm_sec_cd: 1, cust_id: 3, acc_amt: 3000, acc_date: "20260401" }),
      ],
      "202606",
      CTX,
    );
    expect(m.donorCount).toBe(3);
    expect(m.newDonorCount).toBe(1); // 기부자2만
  });

  it("익명(cust_id=-999) 기부는 anonymousDonor 플래그로 표기하고 기부자 수에서 분리", () => {
    const m = computeSupporterMetrics(
      [
        row({ incm_sec_cd: 1, cust_id: -999, acc_amt: 1000 }),
        row({ incm_sec_cd: 1, cust_id: 5, acc_amt: 2000 }),
      ],
      "202606",
      CTX,
    );
    expect(m.donorCount).toBe(1); // 익명 제외
    expect(m.anonymousDonor).toBe(true);
  });

  it("실제 익명 cust_id(양수)를 anonymousCustIds 로 판정 — 중복 익명이 기부자 수를 부풀리지 않음", () => {
    // DB엔 -999가 없고 익명 정본·중복이 양수 cust_id(예: 39/65/117)로 저장됨.
    const ctx: OrgMetricsContext = { ...CTX, anonymousCustIds: new Set([39, 65, 117]) };
    const m = computeSupporterMetrics(
      [
        row({ incm_sec_cd: 1, cust_id: 39, acc_amt: 1000 }),
        row({ incm_sec_cd: 1, cust_id: 65, acc_amt: 1500 }), // 익명 중복 — 별도 기부자로 세면 안 됨
        row({ incm_sec_cd: 1, cust_id: 117, acc_amt: 500 }),
        row({ incm_sec_cd: 1, cust_id: 5, acc_amt: 2000 }), // 실명 기부자 1명
      ],
      "202606",
      ctx,
    );
    expect(m.donorCount).toBe(1); // 실명 5만 — 익명 3행 제외
    expect(m.anonymousDonor).toBe(true);
    expect(m.totalRaised).toBe(5000); // 모금총액은 익명 포함 전액
  });

  it("anonymousCustIds 미지정이면 익명이 기부자로 잘못 집계됨(회귀 방지 — 로더가 반드시 채워야 함)", () => {
    const m = computeSupporterMetrics(
      [row({ incm_sec_cd: 1, cust_id: 39, acc_amt: 1000 })],
      "202606",
      CTX, // anonymousCustIds 없음
    );
    expect(m.donorCount).toBe(1); // 판정 불가 → 실명 취급(이 상황을 로더가 anonymousCustIds로 방지)
    expect(m.anonymousDonor).toBe(false);
  });

  it("잔여 모금액 = 모금총액 - 총지출", () => {
    const m = computeSupporterMetrics(
      [
        row({ incm_sec_cd: 1, acc_amt: 25500000, cust_id: 1 }),
        row({ incm_sec_cd: 2, item_sec_cd: 97, acc_amt: 20000000 }),
        row({ incm_sec_cd: 2, item_sec_cd: 101, acc_amt: 1200000 }),
      ],
      "202606",
      CTX,
    );
    expect(m.remainingFund).toBe(4300000);
  });

  it("월별 모금 추이는 currentYM 기준 최근 6개월을 반환한다", () => {
    const m = computeSupporterMetrics(
      [
        row({ incm_sec_cd: 1, acc_amt: 1000, acc_date: "20260601" }),
        row({ incm_sec_cd: 1, acc_amt: 500, acc_date: "20260315" }),
        row({ incm_sec_cd: 1, acc_amt: 9999, acc_date: "20251201" }), // 6개월 밖 → 제외
      ],
      "202606",
      CTX,
    );
    expect(m.monthlyRaised).toHaveLength(6);
    expect(m.monthlyRaised[m.monthlyRaised.length - 1]).toEqual({ month: "6월", amount: 1000 });
    expect(m.monthlyRaised.find((x) => x.month === "3월")?.amount).toBe(500);
    expect(m.monthlyRaised.reduce((s, x) => s + x.amount, 0)).toBe(1500);
  });
});
