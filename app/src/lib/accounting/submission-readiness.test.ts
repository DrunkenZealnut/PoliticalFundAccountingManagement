import { describe, it, expect } from "vitest";
import {
  buildReportReadiness,
  buildReimburseReadiness,
  type ReportReadinessInput,
  type ReimburseReadinessInput,
} from "./submission-readiness";
import type { ReportSummaryRawRow } from "./income-expense-report-summary";

/* ------------------------------------------------------------------ */
/*  픽스처 — 후보자 자금원(82~85) × 과목(86 선거비용 / 87 선거비용외)     */
/* ------------------------------------------------------------------ */

const period = { pre_acc_from: "20250101", acc_from: "20260101", acc_to: "20261231" };
const noPeriod = { acc_from: null, acc_to: null };

let nextId = 1;
function row(over: Partial<ReportSummaryRawRow>): ReportSummaryRawRow {
  return {
    acc_book_id: nextId++,
    incm_sec_cd: 1,
    acc_sec_cd: 82,
    item_sec_cd: 86,
    acc_amt: 0,
    acc_date: "20260301",
    ...over,
  };
}

/** 정상 후보자: 수입 100만(보조금) > 지출 40만 → 잔액 60만, 부족 없음 */
function healthyRows(): ReportSummaryRawRow[] {
  return [
    row({ incm_sec_cd: 1, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 1_000_000 }),
    row({ incm_sec_cd: 2, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 400_000, acc_date: "20260401" }),
  ];
}

/** 통장 전체 부족(총지출 > 총수입) — 재배분으로도 해소 불가한 데이터 오류 */
function shortfallRows(): ReportSummaryRawRow[] {
  return [
    row({ incm_sec_cd: 1, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 100_000 }),
    row({ incm_sec_cd: 2, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 300_000, acc_date: "20260401" }),
  ];
}

const levelOf = (r: { checks: { id: string; level: string }[] }, id: string) =>
  r.checks.find((c) => c.id === id)?.level;

/* ------------------------------------------------------------------ */
/*  buildReportReadiness                                               */
/* ------------------------------------------------------------------ */

describe("buildReportReadiness (보고서 트랙)", () => {
  const base: ReportReadinessInput = {
    rows: healthyRows(),
    estateCashAmount: 600_000,
    estateCount: 1,
    period,
    isCandidate: true,
  };

  it("정상 데이터 → 전 체크 ok, canProceed=true", () => {
    const r = buildReportReadiness(base);
    expect(r.canProceed).toBe(true);
    expect(r.checks.every((c) => c.level === "ok")).toBe(true);
    // 후보자 체크 세트: 공통 3 + 후보자 3
    expect(r.checks.map((c) => c.id)).toEqual([
      "has-rows",
      "period-set",
      "out-of-period",
      "realloc-shortfall",
      "settlement-vs-estate",
      "estate-entered",
    ]);
  });

  it("거래 0건 → has-rows block, canProceed=false", () => {
    const r = buildReportReadiness({ ...base, rows: [] });
    expect(levelOf(r, "has-rows")).toBe("block");
    expect(r.canProceed).toBe(false);
    expect(r.checks.find((c) => c.id === "has-rows")?.fixHref).toBe("/dashboard/income");
  });

  it("회계기간 미설정 → period-set block", () => {
    const r = buildReportReadiness({ ...base, period: noPeriod });
    expect(levelOf(r, "period-set")).toBe("block");
    expect(r.canProceed).toBe(false);
    expect(r.checks.find((c) => c.id === "period-set")?.fixHref).toBe("/dashboard/organ");
  });

  it("주기 외 거래 → out-of-period warn(진행 가능), 건수 표기", () => {
    const rows = [...healthyRows(), row({ acc_date: "20240101", acc_amt: 10_000 })];
    const r = buildReportReadiness({ ...base, rows, estateCashAmount: 610_000 });
    expect(levelOf(r, "out-of-period")).toBe("warn");
    expect(r.checks.find((c) => c.id === "out-of-period")?.detail).toContain("1건");
    expect(r.canProceed).toBe(true);
  });

  it("통장 부족(총지출>총수입) → realloc-shortfall warn", () => {
    const r = buildReportReadiness({ ...base, rows: shortfallRows(), estateCashAmount: -200_000 });
    expect(levelOf(r, "realloc-shortfall")).toBe("warn");
    expect(r.canProceed).toBe(true);
  });

  it("결산 잔액 ≠ 재산(현금및예금) → settlement-vs-estate warn + 차이 표기", () => {
    const r = buildReportReadiness({ ...base, estateCashAmount: 500_000 });
    const c = r.checks.find((x) => x.id === "settlement-vs-estate");
    expect(c?.level).toBe("warn");
    expect(c?.detail).toContain("100,000");
    expect(c?.fixHref).toBe("/dashboard/settlement");
  });

  it("재산명세 0건 → estate-entered warn", () => {
    const r = buildReportReadiness({ ...base, estateCount: 0, estateCashAmount: 600_000 });
    expect(levelOf(r, "estate-entered")).toBe("warn");
    expect(r.checks.find((c) => c.id === "estate-entered")?.fixHref).toBe("/dashboard/estate");
  });

  it("비후보자(isCandidate=false) → 공통 체크만(재배분·결산·재산 체크 생성 안 함)", () => {
    const r = buildReportReadiness({ ...base, isCandidate: false });
    expect(r.checks.map((c) => c.id)).toEqual(["has-rows", "period-set", "out-of-period"]);
    expect(r.canProceed).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  buildReimburseReadiness                                            */
/* ------------------------------------------------------------------ */

type RRow = ReimburseReadinessInput["rows"][number];

function expenseRow(over: Partial<RRow>): RRow {
  return {
    acc_book_id: nextId++,
    incm_sec_cd: 2,
    acc_sec_cd: 84, // 후보자등자산
    item_sec_cd: 86, // 선거비용
    acc_amt: 100_000,
    claim_amt: null,
    acc_print_ok: "Y",
    acc_date: "20260401",
    ...over,
  };
}

describe("buildReimburseReadiness (보전 트랙)", () => {
  const base: ReimburseReadinessInput = {
    rows: [expenseRow({}), expenseRow({ acc_sec_cd: 82, acc_amt: 50_000 })],
    electionExpenseItemCds: [86],
    accSecCdNames: {},
    period,
  };

  it("정상: 보전 체크 존재·전액 4분류 → 전 체크 ok, canProceed=true", () => {
    const r = buildReimburseReadiness(base);
    expect(r.canProceed).toBe(true);
    expect(r.checks.every((c) => c.level === "ok")).toBe(true);
    expect(r.checks.map((c) => c.id)).toEqual([
      "has-rows",
      "period-set",
      "out-of-period",
      "reimburse-checked",
      "funding-unclassified",
      "claim-total",
    ]);
  });

  it("보전 체크 0건 → reimburse-checked block(fixHref=reimbursement)", () => {
    const rows = [expenseRow({ acc_print_ok: null }), expenseRow({ acc_print_ok: "N" })];
    const r = buildReimburseReadiness({ ...base, rows });
    const c = r.checks.find((x) => x.id === "reimburse-checked");
    expect(c?.level).toBe("block");
    expect(c?.fixHref).toBe("/dashboard/reimbursement");
    expect(r.canProceed).toBe(false);
    // 체크 0건이면 청구액 체크는 노이즈라 생성하지 않음
    expect(r.checks.find((x) => x.id === "claim-total")).toBeUndefined();
  });

  it("자금원 미분류(기타) → funding-unclassified warn + 건수·금액 표기", () => {
    const rows = [...base.rows, expenseRow({ acc_sec_cd: 999, acc_amt: 70_000 })];
    const r = buildReimburseReadiness({ ...base, rows });
    const c = r.checks.find((x) => x.id === "funding-unclassified");
    expect(c?.level).toBe("warn");
    expect(c?.detail).toContain("1건");
    expect(c?.detail).toContain("70,000");
    expect(r.canProceed).toBe(true);
  });

  it("청구액 합계 0(청구+환급 상쇄) → claim-total warn", () => {
    const rows = [expenseRow({ acc_amt: 100_000 }), expenseRow({ acc_amt: -100_000 })];
    const r = buildReimburseReadiness({ ...base, rows });
    expect(levelOf(r, "claim-total")).toBe("warn");
    expect(r.canProceed).toBe(true);
  });

  it("거래 0건 → has-rows block", () => {
    const r = buildReimburseReadiness({ ...base, rows: [] });
    expect(levelOf(r, "has-rows")).toBe("block");
    expect(r.canProceed).toBe(false);
  });

  it("주기 외 지출 → out-of-period warn", () => {
    const rows = [...base.rows, expenseRow({ acc_date: "20270101", acc_amt: 10_000 })];
    const r = buildReimburseReadiness({ ...base, rows });
    expect(levelOf(r, "out-of-period")).toBe("warn");
  });

  it("claim_amt 지정 시 acc_amt 대신 청구액으로 집계(ok detail에 합계 반영)", () => {
    const rows = [expenseRow({ acc_amt: 100_000, claim_amt: 80_000 })];
    const r = buildReimburseReadiness({ ...base, rows });
    expect(r.checks.find((c) => c.id === "claim-total")?.detail).toContain("80,000");
  });
});
