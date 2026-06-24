import { describe, it, expect } from "vitest";
import { buildSettlementSummary } from "./settlement-summary";
import type { ReportSummaryRawRow } from "./income-expense-report-summary";

/**
 * 결산 총괄이 22-1 보고서와 동일한 자금원 재배분 SSOT를 쓰는지 회귀 고정.
 *
 * 픽스처는 의도적으로 "자금원 과지출"(후원회기부금 85가 받은 것보다 더 씀)을
 * 트리거한다 — 해피패스로는 재배분 적용/미적용 차이가 안 드러나기 때문
 * (parity 테스트는 갈리는 조건을 실제로 트리거해야 한다).
 */
const ACC_HUBO = 84; // 후보자등자산
const ACC_HUWON = 85; // 후원회기부금
const ITEM_SEONGEO = 86; // 선거비용

const FIXTURE: ReportSummaryRawRow[] = [
  // 수입 (같은 날, 지출보다 먼저)
  { acc_book_id: 1, incm_sec_cd: 1, acc_sec_cd: ACC_HUBO, item_sec_cd: ITEM_SEONGEO, acc_amt: 1_000_000, acc_date: "20260101" },
  { acc_book_id: 2, incm_sec_cd: 1, acc_sec_cd: ACC_HUWON, item_sec_cd: ITEM_SEONGEO, acc_amt: 300_000, acc_date: "20260101" },
  // 지출 — 후원회기부금이 300k만 받았는데 500k 지출 → 200k 과지출(후보자등자산이 충당해야 함)
  { acc_book_id: 3, incm_sec_cd: 2, acc_sec_cd: ACC_HUWON, item_sec_cd: ITEM_SEONGEO, acc_amt: 500_000, acc_date: "20260102" },
  { acc_book_id: 4, incm_sec_cd: 2, acc_sec_cd: ACC_HUBO, item_sec_cd: ITEM_SEONGEO, acc_amt: 200_000, acc_date: "20260103" },
];

/** 원본(재배분 전) 자금원별 차액 — 결산이 예전에 보여주던 잘못된 값 재현. */
function rawAccountDiff(rows: ReportSummaryRawRow[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const r of rows) {
    const cur = m.get(r.acc_sec_cd) ?? 0;
    m.set(r.acc_sec_cd, cur + (r.incm_sec_cd === 1 ? r.acc_amt : -r.acc_amt));
  }
  return m;
}

describe("buildSettlementSummary", () => {
  it("원본 직접 집계는 자금원별 음수 차액을 만든다(픽스처가 divergence를 트리거함을 확인)", () => {
    const raw = rawAccountDiff(FIXTURE);
    expect(raw.get(ACC_HUWON)).toBe(-200_000); // 후원회기부금 과지출
    expect(raw.get(ACC_HUBO)).toBe(800_000); // 후보자등자산 잉여
  });

  it("재배분 적용 후 자금원별 차액은 모두 ≥ 0 (음수 소멸)", () => {
    const { accounts } = buildSettlementSummary(FIXTURE);
    const diffByAcc = new Map<number, number>();
    for (const a of accounts) {
      diffByAcc.set(a.acc_sec_cd, (diffByAcc.get(a.acc_sec_cd) ?? 0) + a.income - a.expense);
    }
    for (const [, diff] of diffByAcc) expect(diff).toBeGreaterThanOrEqual(0);
    // 과지출 200k가 후보자등자산으로 이동 → 후원회기부금 0, 후보자등자산 600k
    expect(diffByAcc.get(ACC_HUWON)).toBe(0);
    expect(diffByAcc.get(ACC_HUBO)).toBe(600_000);
  });

  it("합 보존: 총수입·총지출·잔액은 재배분으로 불변(재산 검증 영향 없음)", () => {
    const { income, expense, balance } = buildSettlementSummary(FIXTURE);
    expect(income).toBe(1_300_000);
    expect(expense).toBe(700_000);
    expect(balance).toBe(600_000);
  });

  it("정상 데이터는 shortfall 없음", () => {
    expect(buildSettlementSummary(FIXTURE).shortfalls).toEqual([]);
  });

  it("통장 전체 부족(총지출>총수입)은 shortfall로 노출(은폐 금지)", () => {
    const overspent: ReportSummaryRawRow[] = [
      { acc_book_id: 1, incm_sec_cd: 1, acc_sec_cd: ACC_HUBO, item_sec_cd: ITEM_SEONGEO, acc_amt: 100_000, acc_date: "20260101" },
      { acc_book_id: 2, incm_sec_cd: 2, acc_sec_cd: ACC_HUBO, item_sec_cd: ITEM_SEONGEO, acc_amt: 300_000, acc_date: "20260102" },
    ];
    expect(buildSettlementSummary(overspent).shortfalls.length).toBeGreaterThan(0);
  });

  it("비후보자(자금원 82~85 없음)는 raw 집계 유지", () => {
    const supporter: ReportSummaryRawRow[] = [
      { acc_book_id: 1, incm_sec_cd: 1, acc_sec_cd: 1, item_sec_cd: 94, acc_amt: 500_000, acc_date: "20260101" },
      { acc_book_id: 2, incm_sec_cd: 2, acc_sec_cd: 2, item_sec_cd: 97, acc_amt: 200_000, acc_date: "20260102" },
    ];
    const { income, expense, accounts, shortfalls } = buildSettlementSummary(supporter);
    expect(income).toBe(500_000);
    expect(expense).toBe(200_000);
    expect(accounts).toHaveLength(2);
    expect(shortfalls).toEqual([]);
  });
});
