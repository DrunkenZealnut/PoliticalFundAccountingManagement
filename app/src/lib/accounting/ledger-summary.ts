/* ------------------------------------------------------------------ */
/*  수입·지출 내역 현황 요약 — 순수 집계 (뷰모델 빌더)                    */
/*                                                                    */
/*  SSOT 정합 (기존 단일 소스 재사용):                                  */
/*   - 과목 선거비용: 과목(item_sec_cd) 코드명 === "선거비용"           */
/*       (reimbursement-aggregator의 electionExpenseItemCds와 동일)    */
/*   - 보전대상 선거비용: exp_sec_cd > 0                                */
/*       (org-metrics.computeCandidateMetrics·대시보드 '선거비용 지출' KPI) */
/*   - 수입원 분류: classifyFundingSource(acc_sec_cd, 코드명)          */
/*  React/Next 비의존 → 단위 테스트 가능.                              */
/* ------------------------------------------------------------------ */

import { classifyFundingSource } from "./funding-source";

export type StatTone = "income" | "expense" | "balance" | "neutral" | "warn";

export interface SummaryStat {
  key: string;
  label: string;
  value: number; // 금액(원) 또는 건수
  unit: "won" | "count" | "percent";
  tone?: StatTone;
  /** 초보자 모드 도움말 id (HELP_TEXTS의 키). 있으면 라벨에 HelpTooltip 적용 */
  helpId?: string;
}

export interface SummaryGroupRow {
  key: string;
  name: string;
  amount: number;
  count: number;
  ratio: number; // 0~1, 그룹 총액 대비
}

export interface SummaryGroup {
  title: string;
  rows: SummaryGroupRow[]; // 금액 내림차순, 상위 N-1 + "기타"
}

export interface LedgerSummary {
  primary: SummaryStat[];
  groups: SummaryGroup[];
  totalCount: number;
}

/** 집계에 필요한 acc_book 최소 행 (income/expense 페이지의 AccBook과 호환) */
export interface LedgerRow {
  acc_amt: number;
  acc_sec_cd: number;
  item_sec_cd: number;
  exp_sec_cd: number;
  /** 보전 체크 여부 ('Y'=보전 대상). 보전 예상액 산정에 사용 */
  acc_print_ok?: string | null;
}

export interface BuildOpts {
  /** cv_id → 코드명 (useCodeValues.getName) */
  getName: (cvId: number) => string;
  /** 전체 기준 잔액(수입-지출). 페이지 summary.balance 주입 시 표시 */
  balance?: number;
  /** breakdown 상위 표시 개수 (초과분은 "기타"로 합산) */
  topN?: number;
  /** 기관유형 — 지표 차등(FR-08). candidate=선거비용/보전 표시, supporter=후원금 라벨 */
  orgType?: string | null;
}

const sumAmt = (rows: LedgerRow[]) => rows.reduce((s, r) => s + (r.acc_amt || 0), 0);

/** 키별 합계·건수 → 금액 내림차순 SummaryGroupRow[]. 상위 topN-1 + "기타" 합산. */
export function groupSum(
  rows: LedgerRow[],
  keyFn: (r: LedgerRow) => number | string,
  labelFn: (key: number | string) => string,
  topN = 8,
): SummaryGroupRow[] {
  const map = new Map<number | string, { amount: number; count: number }>();
  for (const r of rows) {
    const k = keyFn(r);
    const e = map.get(k) ?? { amount: 0, count: 0 };
    e.amount += r.acc_amt || 0;
    e.count += 1;
    map.set(k, e);
  }
  const total = Array.from(map.values()).reduce((s, e) => s + e.amount, 0) || 1;
  const all = Array.from(map.entries())
    .map(([k, e]) => ({
      key: String(k),
      name: labelFn(k),
      amount: e.amount,
      count: e.count,
      ratio: e.amount / total,
    }))
    .sort((a, b) => b.amount - a.amount);

  if (all.length <= topN) return all;
  const head = all.slice(0, topN - 1);
  const rest = all.slice(topN - 1);
  head.push({
    key: "__other__",
    name: "기타",
    amount: rest.reduce((s, r) => s + r.amount, 0),
    count: rest.reduce((s, r) => s + r.count, 0),
    ratio: rest.reduce((s, r) => s + r.amount, 0) / total,
  });
  return head;
}

/** 수입내역 현황: 수입 총액·건수·(잔액) + 수입원별 breakdown.
 *  FR-08: 후원회(supporter)는 "후원금 총액"으로 라벨 차등. */
export function buildIncomeSummary(rows: LedgerRow[], opts: BuildOpts): LedgerSummary {
  const total = sumAmt(rows);
  const totalLabel = opts.orgType === "supporter" ? "후원금 총액" : "수입 총액";
  const primary: SummaryStat[] = [
    { key: "total", label: totalLabel, value: total, unit: "won", tone: "income", helpId: "ledger.income-total" },
    { key: "count", label: "건수", value: rows.length, unit: "count", tone: "neutral" },
  ];
  if (opts.balance != null) {
    primary.push({ key: "balance", label: "잔액(전체)", value: opts.balance, unit: "won", tone: "balance", helpId: "ledger.balance" });
  }
  const bySource = groupSum(
    rows,
    (r) => classifyFundingSource(r.acc_sec_cd, opts.getName(r.acc_sec_cd)),
    (k) => String(k),
    opts.topN,
  );
  return { primary, groups: [{ title: "수입원별", rows: bySource }], totalCount: rows.length };
}

/** 과목 기준 선거비용 판별: 과목(item_sec_cd) 코드명 === "선거비용"
 *  SSOT: reimbursement-aggregator / use-dashboard-data의 electionExpenseItemCds와 동일 기준 */
const ELECTION_ITEM_NAME = "선거비용";

/** 지출내역 현황: 지출 총액·(후보자) 선거비용/외(과목)·보전 예상액·건수·(잔액) + 과목별 breakdown.
 *  FR-08: 선거비용/보전 예상액은 후보자(candidate) 전용 개념 → candidate에서만 표시. */
export function buildExpenseSummary(rows: LedgerRow[], opts: BuildOpts): LedgerSummary {
  const total = sumAmt(rows);
  const primary: SummaryStat[] = [
    { key: "total", label: "지출 총액", value: total, unit: "won", tone: "expense" },
  ];
  if (opts.orgType === "candidate") {
    // 과목 기준 선거비용/선거비용외 (사용자가 보는 과목·breakdown과 동일 기준)
    const election = sumAmt(rows.filter((r) => opts.getName(r.item_sec_cd) === ELECTION_ITEM_NAME));
    const nonElection = total - election;
    // 보전 예상액 = 보전 체크(acc_print_ok='Y') & 선거비용 과목 & 자금원≠기타
    //   (reimbursement-aggregator·대시보드 '보전 예상액'과 동일 기준)
    const reimbursable = sumAmt(
      rows.filter(
        (r) =>
          r.acc_print_ok === "Y" &&
          opts.getName(r.item_sec_cd) === ELECTION_ITEM_NAME &&
          classifyFundingSource(r.acc_sec_cd, opts.getName(r.acc_sec_cd)) !== "기타",
      ),
    );
    primary.push(
      { key: "election", label: "선거비용(과목)", value: election, unit: "won", tone: "warn", helpId: "ledger.election-item" },
      { key: "nonElection", label: "선거비용외(과목)", value: nonElection, unit: "won", tone: "neutral" },
      { key: "reimbursable", label: "보전 예상액", value: reimbursable, unit: "won", tone: "balance", helpId: "ledger.reimbursable" },
    );
  }
  primary.push({ key: "count", label: "건수", value: rows.length, unit: "count", tone: "neutral" });
  if (opts.balance != null) {
    primary.push({ key: "balance", label: "잔액(전체)", value: opts.balance, unit: "won", tone: "income", helpId: "ledger.balance" });
  }
  const byType = groupSum(rows, (r) => r.item_sec_cd, (k) => opts.getName(Number(k)), opts.topN);
  return { primary, groups: [{ title: "과목별", rows: byType }], totalCount: rows.length };
}
