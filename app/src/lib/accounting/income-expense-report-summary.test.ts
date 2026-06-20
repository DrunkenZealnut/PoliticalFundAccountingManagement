import { describe, it, expect } from "vitest";
import {
  buildCandidateReportSummary,
  allocateCandidateLedgerRows,
  type ReportSummaryRawRow,
} from "./income-expense-report-summary";

/**
 * 코드명 맵. 86·19 둘 다 "선거비용"(시스템에 cs_id 11/3 두 개 존재) — 과목명으로
 * 분류돼야 함을 강제한다(income-expense-report 페이지의 `item_sec_cd===86||19` 하드코딩 금지).
 */
const NAMES: Record<number, string> = {
  82: "보조금인 지원금",
  83: "보조금외 지원금",
  84: "후보자 자산",
  85: "후원회 기부금",
  86: "선거비용",
  87: "선거비용외 정치자금",
  19: "선거비용",
};
const getName = (cv: number) => NAMES[cv] ?? `코드${cv}`;

let _id = 0;
function row(p: Partial<ReportSummaryRawRow>): ReportSummaryRawRow {
  return {
    acc_book_id: ++_id,
    incm_sec_cd: 1,
    acc_sec_cd: 84,
    item_sec_cd: 86,
    acc_amt: 1000,
    acc_date: "20260101",
    acc_time: null,
    ...p,
  };
}

describe("buildCandidateReportSummary", () => {
  it("보조금(82)과 보조금외(83)를 분리 집계한다 (data-query 병합/subsidyOther=0 회귀)", () => {
    const model = buildCandidateReportSummary(
      [
        row({ incm_sec_cd: 1, acc_sec_cd: 82, acc_amt: 1_000_000 }),
        row({ incm_sec_cd: 1, acc_sec_cd: 83, acc_amt: 2_000_000 }),
      ],
      getName,
    );
    const subsidy = model.rows.find((r) => r.source === "보조금")!;
    const subsidyOther = model.rows.find((r) => r.source === "보조금외")!;
    expect(subsidy.income).toBe(1_000_000);
    expect(subsidyOther.income).toBe(2_000_000); // 보조금에 흡수/0이 아니라 분리
  });

  it("선거비용/외를 과목명으로 분류 — cv_id 86·19 둘 다 선거비용 (하드코딩 금지)", () => {
    const model = buildCandidateReportSummary(
      [
        row({ incm_sec_cd: 1, acc_sec_cd: 84, item_sec_cd: 86, acc_amt: 100_000 }),
        row({ incm_sec_cd: 2, acc_sec_cd: 84, item_sec_cd: 86, acc_amt: 30_000 }),
        row({ incm_sec_cd: 2, acc_sec_cd: 84, item_sec_cd: 19, acc_amt: 20_000 }),
        row({ incm_sec_cd: 2, acc_sec_cd: 84, item_sec_cd: 87, acc_amt: 10_000 }),
      ],
      getName,
    );
    const asset = model.rows.find((r) => r.source === "후보자자산")!;
    expect(asset.expElection).toBe(50_000); // 86 + 19 (둘 다 '선거비용')
    expect(asset.expNonElection).toBe(10_000); // 87
  });

  it("자금원 부족 지출을 다른 계정으로 이동하되 과목(선거비용)은 불변 (Pass1 + I4)", () => {
    // 82(보조금) 선거비용 지출 50,000 — 82 수입 0 → 84(자산)로 이동, '선거비용' 유지.
    const model = buildCandidateReportSummary(
      [
        row({ incm_sec_cd: 1, acc_sec_cd: 84, item_sec_cd: 86, acc_amt: 100_000 }),
        row({ incm_sec_cd: 2, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 50_000 }),
      ],
      getName,
    );
    const subsidy = model.rows.find((r) => r.source === "보조금")!;
    const asset = model.rows.find((r) => r.source === "후보자자산")!;
    expect(subsidy.expElection).toBe(0); // 이동돼 나감
    expect(subsidy.balance).toBe(0); // 음수 아님
    expect(asset.expElection).toBe(50_000); // 자산 '선거비용'(외 아님)
    expect(asset.expNonElection).toBe(0);
    expect(asset.balance).toBe(50_000);
  });

  it("합 보존: 분할은 총수입·총지출·총잔액을 바꾸지 않는다", () => {
    const model = buildCandidateReportSummary(
      [
        row({ incm_sec_cd: 1, acc_sec_cd: 84, item_sec_cd: 86, acc_amt: 100_000 }),
        row({ incm_sec_cd: 2, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 50_000 }),
      ],
      getName,
    );
    expect(model.total.income).toBe(100_000);
    expect(model.total.expSubtotal).toBe(50_000);
    expect(model.total.balance).toBe(50_000);
  });

  it("비후보자(자금원 82~85 거래 없음)는 배분 없이 raw 집계", () => {
    const model = buildCandidateReportSummary(
      [
        row({ incm_sec_cd: 1, acc_sec_cd: 1, item_sec_cd: 94, acc_amt: 500_000 }),
        row({ incm_sec_cd: 2, acc_sec_cd: 2, item_sec_cd: 97, acc_amt: 200_000 }),
      ],
      getName,
    );
    expect(model.rows.every((r) => r.income === 0 && r.expSubtotal === 0)).toBe(true);
    expect(model.total.income).toBe(500_000);
    expect(model.total.expSubtotal).toBe(200_000);
  });

  it("음수 수입은 비후보자 경로에서도 지출로 전환 (보정 배너 정합 — Pass0 보편 적용)", () => {
    // 비후보자(82~85 없음) + 음수 수입. 페이지는 applyCorrections 배너를 게이트 없이 띄우므로,
    // 집계도 Pass0(adjustNegativeIncome)를 적용해야 배너 문구와 총괄이 일치한다.
    const model = buildCandidateReportSummary(
      [
        row({ incm_sec_cd: 1, acc_sec_cd: 1, item_sec_cd: 94, acc_amt: 500_000 }),
        row({ incm_sec_cd: 1, acc_sec_cd: 2, item_sec_cd: 97, acc_amt: -200_000 }),
      ],
      getName,
    );
    // -200,000 수입 → +200,000 지출로 전환: 수입엔 안 잡히고 지출에 반영.
    expect(model.total.income).toBe(500_000);
    expect(model.total.expSubtotal).toBe(200_000);
  });
});

describe("allocateCandidateLedgerRows (page·HWPX 22-1/22-2/22-4 공유 SSOT)", () => {
  type MetaRow = ReportSummaryRawRow & { content: string | null; cust_id: number; rcp_no: string | null };
  const meta = (p: Partial<MetaRow>): MetaRow => ({
    acc_book_id: ++_id,
    incm_sec_cd: 1,
    acc_sec_cd: 84,
    item_sec_cd: 86,
    acc_amt: 1000,
    acc_date: "20260101",
    acc_time: null,
    content: null,
    cust_id: 0,
    rcp_no: null,
    ...p,
  });

  it("후보자: 자금원 부족 지출을 이동하되 과목 불변 + 원본 메타(내용·거래처·영수증번호) 보존", () => {
    const out = allocateCandidateLedgerRows([
      meta({ acc_book_id: 1, incm_sec_cd: 1, acc_sec_cd: 84, item_sec_cd: 86, acc_amt: 100_000 }),
      meta({ acc_book_id: 2, incm_sec_cd: 2, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 50_000, content: "지출X", cust_id: 9, rcp_no: "자(비)-1" }),
    ]);
    const moved = out.find((r) => r.acc_book_id === 2)!;
    expect(moved.acc_sec_cd).toBe(84); // 82→84 이동
    expect(moved.item_sec_cd).toBe(86); // 과목(선거비용) 불변 (I4)
    expect(moved.content).toBe("지출X"); // 원본 메타 보존
    expect(moved.cust_id).toBe(9);
    expect(moved.rcp_no).toBe("자(비)-1"); // 22-4 ledger가 receiptNo로 렌더 → 재조인 시 보존돼야 함
  });

  it("빈 입력 → 빈 배열 (조기반환 경계)", () => {
    expect(allocateCandidateLedgerRows([])).toEqual([]);
  });

  it("비후보자: 배분 안 함, acc_amt 숫자화 + Pass0(음수수입→지출)", () => {
    const out = allocateCandidateLedgerRows([
      meta({ acc_book_id: 1, incm_sec_cd: 1, acc_sec_cd: 1, item_sec_cd: 94, acc_amt: "500000" as unknown as number }),
      meta({ acc_book_id: 2, incm_sec_cd: 1, acc_sec_cd: 2, item_sec_cd: 97, acc_amt: "-200000" as unknown as number }),
    ]);
    expect(out.length).toBe(2); // 분할 없음
    expect(out.every((r) => typeof r.acc_amt === "number")).toBe(true); // 문자열→숫자 (G4)
    const conv = out.find((r) => r.acc_book_id === 2)!;
    expect(conv.incm_sec_cd).toBe(2); // 음수수입→지출
    expect(conv.acc_amt).toBe(200_000);
  });

  it("합 보존: 분할해도 총수입·총지출 불변", () => {
    const out = allocateCandidateLedgerRows([
      meta({ acc_book_id: 1, incm_sec_cd: 1, acc_sec_cd: 84, item_sec_cd: 86, acc_amt: 100_000 }),
      meta({ acc_book_id: 2, incm_sec_cd: 2, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 50_000 }),
    ]);
    expect(out.filter((r) => r.incm_sec_cd === 1).reduce((s, r) => s + r.acc_amt, 0)).toBe(100_000);
    expect(out.filter((r) => r.incm_sec_cd === 2).reduce((s, r) => s + r.acc_amt, 0)).toBe(50_000);
  });

  it("한 지출이 여러 slice로 분할돼도 각 조각이 원본 메타·과목을 보존하고 금액 합이 보존된다", () => {
    // 82 수입 30,000 < 82 선거비용 지출 50,000 → 부족분 20,000을 84(자산)로 이동.
    // 지출 행 하나(acc_book_id=3)가 [82:30,000 + 84:20,000] 두 조각으로 분할 — 가장 위험한 경로.
    const out = allocateCandidateLedgerRows([
      meta({ acc_book_id: 1, incm_sec_cd: 1, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 30_000 }),
      meta({ acc_book_id: 2, incm_sec_cd: 1, acc_sec_cd: 84, item_sec_cd: 86, acc_amt: 100_000 }),
      meta({ acc_book_id: 3, incm_sec_cd: 2, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 50_000, content: "분할Y", cust_id: 7, rcp_no: "자(비)-9" }),
    ]);
    const slices = out.filter((r) => r.acc_book_id === 3);
    expect(slices.length).toBe(2); // 단일 지출이 두 자금원으로 분할
    expect(slices.reduce((s, r) => s + r.acc_amt, 0)).toBe(50_000); // 합 보존
    expect(slices.map((r) => r.acc_sec_cd).sort()).toEqual([82, 84]); // 일부는 82 유지, 일부는 84로 이동
    for (const s of slices) {
      expect(s.item_sec_cd).toBe(86); // 모든 조각 과목 불변 (I4)
      expect(s.content).toBe("분할Y"); // 모든 조각 원본 메타 보존
      expect(s.cust_id).toBe(7);
      expect(s.rcp_no).toBe("자(비)-9");
    }
  });
});
