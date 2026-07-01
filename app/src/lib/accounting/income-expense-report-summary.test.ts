import { describe, it, expect } from "vitest";
import {
  buildCandidateReportSummary,
  allocateCandidateLedgerRows,
  detectCandidateShortfalls,
  detectItemResiduals,
  type ReportSummaryRawRow,
} from "./income-expense-report-summary";
import { planAllocationPersist, applyPlanInMemory, type AllocTrackedRow } from "./persist-allocation";
import { classifyFundingSource, type FundingSource } from "./funding-source";
import { classifyExpenseCategory } from "@/lib/hwpx/report-summary-builder";

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

describe("detectCandidateShortfalls (FR-03 통장 부족 진단 — 순수 헬퍼)", () => {
  it("정상 후보자 데이터(통장≥0)는 부족 없음 → 빈 배열 (TC-1)", () => {
    // 84 수입 100,000 ≥ 82 선거비용 지출 50,000 → 82 부족분은 84로 충당, 부족 없음.
    const shortfalls = detectCandidateShortfalls([
      row({ acc_book_id: 1, incm_sec_cd: 1, acc_sec_cd: 84, item_sec_cd: 86, acc_amt: 100_000 }),
      row({ acc_book_id: 2, incm_sec_cd: 2, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 50_000 }),
    ]);
    expect(shortfalls).toEqual([]);
  });

  it("통장 전체 부족(총지출 > 총수입)은 부족 노출 + shortAmt>0 + 잔류 자금원 식별 (TC-2)", () => {
    // 84 수입 30,000 < 82 지출 50,000 → 풀 전체 20,000 부족이 82에 잔류.
    const shortfalls = detectCandidateShortfalls([
      row({ acc_book_id: 1, incm_sec_cd: 1, acc_sec_cd: 84, item_sec_cd: 86, acc_amt: 30_000 }),
      row({ acc_book_id: 2, incm_sec_cd: 2, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 50_000 }),
    ]);
    expect(shortfalls.length).toBeGreaterThan(0);
    expect(shortfalls.every((s) => s.shortAmt > 0)).toBe(true);
    expect(shortfalls.reduce((sum, s) => sum + s.shortAmt, 0)).toBe(20_000);
    expect(shortfalls.some((s) => s.accSecCd === 82)).toBe(true); // 부족이 잔류한 자금원
  });

  it("비후보자(자금원 82~85 없음)는 배분 미적용 → 빈 배열 (TC-3)", () => {
    // 후원회: 1=수입 100,000 < 2=지출 200,000이어도 자금원 계정이 아니라 진단 대상 아님.
    const shortfalls = detectCandidateShortfalls([
      row({ acc_book_id: 1, incm_sec_cd: 1, acc_sec_cd: 1, item_sec_cd: 94, acc_amt: 100_000 }),
      row({ acc_book_id: 2, incm_sec_cd: 2, acc_sec_cd: 2, item_sec_cd: 97, acc_amt: 200_000 }),
    ]);
    expect(shortfalls).toEqual([]);
  });

  it("빈 입력 → 빈 배열 (경계)", () => {
    expect(detectCandidateShortfalls([])).toEqual([]);
  });

  it("멱등: 같은 입력을 두 번 호출해도 동일 결과 (순수·사이드이펙트 없음)", () => {
    const rows = [
      row({ acc_book_id: 1, incm_sec_cd: 1, acc_sec_cd: 84, acc_amt: 30_000 }),
      row({ acc_book_id: 2, incm_sec_cd: 2, acc_sec_cd: 82, acc_amt: 50_000 }),
    ];
    const first = detectCandidateShortfalls(rows);
    const second = detectCandidateShortfalls(rows);
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0); // 실제 부족 케이스로 멱등 검증
  });
});

describe("교차검증 가드 (FR-04: SSOT·총괄모델·export 세 경로 동일 배분)", () => {
  // 자금원 분할이 실제로 일어나는 픽스처:
  //   84(자산) 수입 100,000 + 82(보조금) 수입 30,000, 이후 82 선거비용 지출 50,000
  //   → 82 가용 30,000으로 부족 → 20,000을 84로 이동(한 지출이 82:30,000 + 84:20,000으로 분할).
  //   음수수입 없음 → Pass0가 no-op이라 export 경로(planAllocationPersist는 Pass0 미적용)와 전제 일치.
  const RAW = [
    { acc_book_id: 1, incm_sec_cd: 1, acc_sec_cd: 84, item_sec_cd: 86, acc_amt: 100_000, acc_date: "20260101" },
    { acc_book_id: 2, incm_sec_cd: 1, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 30_000, acc_date: "20260102" },
    { acc_book_id: 3, incm_sec_cd: 2, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 50_000, acc_date: "20260103" },
  ] as const;

  /** 행들을 "계정:과목:수입지출" → 금액합으로 집계(평이 객체 → toEqual 비교). */
  function cells(
    rows: { acc_sec_cd: number; item_sec_cd: number; incm_sec_cd: number; acc_amt: number }[],
  ): Record<string, number> {
    const m: Record<string, number> = {};
    for (const r of rows) {
      const k = `${r.acc_sec_cd}:${r.item_sec_cd}:${r.incm_sec_cd}`;
      m[k] = (m[k] ?? 0) + Number(r.acc_amt);
    }
    return m;
  }

  /** RAW → export 경로 입력(AllocTrackedRow: 추적/메타 컬럼 전부 null). */
  function toTracked(r: (typeof RAW)[number]): AllocTrackedRow {
    return {
      ...r,
      cust_id: 0, content: null, rcp_no: null, rcp_no2: null, bigo: null, customer: null,
      alloc_src_id: null, alloc_seq: null,
      raw_incm_sec_cd: null, raw_acc_sec_cd: null, raw_item_sec_cd: null, raw_acc_amt: null, alloc_gen: null,
    };
  }

  it("SSOT(allocateCandidateLedgerRows) == export(planAllocationPersist+applyPlanInMemory) — (계정×과목×수입지출) 셀 동일 (표류 방지 핵심 가드)", () => {
    const ssot = cells(allocateCandidateLedgerRows(RAW as unknown as ReportSummaryRawRow[]));
    const tracked = RAW.map(toTracked);
    const exported = cells(applyPlanInMemory(tracked, planAllocationPersist(tracked, "")));
    expect(exported).toEqual(ssot);
  });

  it("픽스처가 degenerate(무분할)가 아님 — 한 지출이 82 잔류 30,000 + 84 이동 20,000으로 실제 분할", () => {
    // 위 동일성이 '아무것도 안 쪼개져서' 우연히 성립한 게 아님을 고정.
    const ssot = cells(allocateCandidateLedgerRows(RAW as unknown as ReportSummaryRawRow[]));
    expect(ssot["82:86:2"]).toBe(30_000); // 82 잔류분
    expect(ssot["84:86:2"]).toBe(20_000); // 82→84 이동분
  });

  it("총괄 모델(buildCandidateReportSummary) 자금원 셀 == SSOT 행을 동일 분류 SSOT로 재집계한 값", () => {
    const aRows = allocateCandidateLedgerRows(RAW as unknown as ReportSummaryRawRow[]);
    // SSOT 행 → 자금원×(선거비용/외) 독립 재집계(classifyFundingSource·classifyExpenseCategory 동일 SSOT).
    const expected = new Map<FundingSource, { income: number; expElection: number; expNonElection: number }>();
    for (const r of aRows) {
      const src = classifyFundingSource(r.acc_sec_cd, getName(r.acc_sec_cd));
      const cell = expected.get(src) ?? { income: 0, expElection: 0, expNonElection: 0 };
      if (r.incm_sec_cd === 1) cell.income += r.acc_amt;
      else if (classifyExpenseCategory(getName(r.item_sec_cd)) === "선거비용") cell.expElection += r.acc_amt;
      else cell.expNonElection += r.acc_amt;
      expected.set(src, cell);
    }
    const model = buildCandidateReportSummary(RAW as unknown as ReportSummaryRawRow[], getName);
    for (const mrow of model.rows) {
      const e = expected.get(mrow.source) ?? { income: 0, expElection: 0, expNonElection: 0 };
      expect(mrow.income).toBe(e.income);
      expect(mrow.expElection).toBe(e.expElection);
      expect(mrow.expNonElection).toBe(e.expNonElection);
    }
    // 합 보존: 세 경로 공통 입력 → 동일 총액(수입 130,000 / 지출 50,000).
    expect(model.total.income).toBe(130_000);
    expect(model.total.expSubtotal).toBe(50_000);
  });
});

describe("allocateCandidateLedgerRows — Pass4 지출일 전파", () => {
  it("Pass4가 이동한 지출일이 결과 행 acc_date에 반영된다(HWPX/22-4 누계 정합)", () => {
    // 총액0·수입 늦음 → Pass4가 지출(9001)을 06-01로 이동. 원본 메타 조인 시 acc_date 유실 회귀 가드.
    const rows: ReportSummaryRawRow[] = [
      { acc_book_id: 9001, incm_sec_cd: 2, acc_sec_cd: 85, item_sec_cd: 87, acc_amt: 500_000, acc_date: "20260501" },
      { acc_book_id: 9002, incm_sec_cd: 1, acc_sec_cd: 85, item_sec_cd: 86, acc_amt: 500_000, acc_date: "20260601" },
    ];
    const out = allocateCandidateLedgerRows(rows);
    const exp = out.filter((r) => r.incm_sec_cd === 2 && r.acc_book_id === 9001);
    expect(exp.length).toBeGreaterThan(0);
    expect(exp.every((r) => r.acc_date === "20260601")).toBe(true);
  });
});

describe("detectItemResiduals — 환급 등 구조적 과목 잔여 표면화", () => {
  it("환급>지출인 과목: 총액0인데 과목 음수 잔여 → itemSecCd 포함 표면화(경로 재사용)", () => {
    // 85: 86 수입100/지출300, 87 수입100/환급-100. 총액0(상쇄)이나 86은 -100 잔존(환급이 87에 갇힘).
    const rows: ReportSummaryRawRow[] = [
      { acc_book_id: 1, incm_sec_cd: 1, acc_sec_cd: 85, item_sec_cd: 86, acc_amt: 100, acc_date: "20260501" },
      { acc_book_id: 2, incm_sec_cd: 2, acc_sec_cd: 85, item_sec_cd: 86, acc_amt: 300, acc_date: "20260502" },
      { acc_book_id: 3, incm_sec_cd: 1, acc_sec_cd: 85, item_sec_cd: 87, acc_amt: 100, acc_date: "20260501" },
      { acc_book_id: 4, incm_sec_cd: 2, acc_sec_cd: 85, item_sec_cd: 87, acc_amt: -100, acc_date: "20260503" },
    ];
    const res = detectItemResiduals(rows);
    expect(res).toHaveLength(1);
    expect(res[0].accSecCd).toBe(85);
    expect(res[0].itemSecCd).toBe(86);
    expect(res[0].shortAmt).toBe(100);
    // 기존 표면화 경로(detectCandidateShortfalls)에 합류 → UI 배너·HWPX 헤더/로그가 자동 노출.
    expect(detectCandidateShortfalls(rows).some((s) => s.itemSecCd === 86 && s.shortAmt === 100)).toBe(true);
  });

  it("정상(총액0·전버킷0): 잔여 없음", () => {
    const rows: ReportSummaryRawRow[] = [
      { acc_book_id: 1, incm_sec_cd: 1, acc_sec_cd: 85, item_sec_cd: 86, acc_amt: 500, acc_date: "20260501" },
      { acc_book_id: 2, incm_sec_cd: 2, acc_sec_cd: 85, item_sec_cd: 86, acc_amt: 500, acc_date: "20260502" },
    ];
    expect(detectItemResiduals(rows)).toEqual([]);
  });

  it("비후보자(후원회 1/2): 잔여 없음", () => {
    const rows: ReportSummaryRawRow[] = [
      { acc_book_id: 1, incm_sec_cd: 1, acc_sec_cd: 1, item_sec_cd: 94, acc_amt: 500, acc_date: "20260501" },
      { acc_book_id: 2, incm_sec_cd: 2, acc_sec_cd: 2, item_sec_cd: 97, acc_amt: 500, acc_date: "20260502" },
    ];
    expect(detectItemResiduals(rows)).toEqual([]);
  });
});
