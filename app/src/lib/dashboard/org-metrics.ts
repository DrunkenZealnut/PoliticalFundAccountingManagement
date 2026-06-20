/* ------------------------------------------------------------------ */
/*  대시보드 조직 유형별 파생 지표 계산 (순수 함수)                       */
/*                                                                    */
/*  후보자(candidate): 선거비용/선거비용외·보전예상액·수입출처·집행률      */
/*  후원회(supporter): 모금총액·추이·기부자수·후보자 기부금 지급          */
/*                                                                    */
/*  설계 근거: docs/02-design/features/dashboard-org-differentiation   */
/*  - 선거비용/선거비용외 카드: item_sec_cd∈선거비용 (총괄표·배분과 동일) */
/*  - 보전 예상액: aggregateReimbursementByFundingSource() 재사용      */
/*    → 보전청구서(claim-form)와 100% 동일 기준 (SSOT)                 */
/*  - 수입 자금원 분류: classifyFundingSource(acc_sec_cd) 82~85        */
/*  - 후보자 기부금(후원회 지출): item_sec_cd 코드명 "기부금"          */
/*    ※ 실데이터(Fund_Data_2.db) 검증: 후원회 지출의 acc_sec_cd는      */
/*      수입/지출 플래그(1/2)일 뿐, 기부금은 item "기부금"(예:97)로 기록 */
/* ------------------------------------------------------------------ */

import { classifyFundingSource, type FundingSource } from "@/lib/accounting/funding-source";
import {
  aggregateReimbursementByFundingSource,
  type AccBookRow as ReimbursementRow,
} from "@/lib/accounting/reimbursement-aggregator";

/** org-metrics 계산에 필요한 acc_book 최소 행 */
export interface OrgMetricsRow {
  incm_sec_cd: number; // 1=수입, 2=지출
  acc_sec_cd: number; // 수입 자금원 분류 (82보조금/83보조금외/84후보자자산/85후원회기부금)
  item_sec_cd: number; // 과목 코드 (선거비용 판별·후보자 기부금 식별)
  exp_sec_cd: number; // 지출유형 코드 (보전 세부유형; 선거비용 판별엔 미사용)
  acc_print_ok: string | null; // 보전 체크 ('Y')
  acc_amt: number;
  acc_date: string; // YYYYMMDD
  cust_id: number | null;
}

/** 코드 컨텍스트 — 보전 집계·후보자 기부금 식별에 필요 (codevalue 기반) */
export interface OrgMetricsContext {
  /** 코드명이 정확히 "선거비용"인 item_sec_cd 목록 (보전 집계 기준, claim-form과 동일) */
  electionExpenseItemCds: number[];
  /** cv_id → 코드명 (자금원 이름 폴백 + 후보자 기부금 item 식별) */
  codeNameById: Record<number, string>;
}

const EMPTY_CONTEXT: OrgMetricsContext = { electionExpenseItemCds: [], codeNameById: {} };

/** 후원회 지출에서 "후보자 기부금 지급"으로 식별할 과목 코드명 (후원회기부금 ≠ 기부금) */
const CANDIDATE_GRANT_ITEM_NAME = "기부금";

export interface FundingSourceSlice {
  source: FundingSource;
  amount: number;
  ratio: number; // 정수 % (총수입 대비)
}

export interface CandidateMetrics {
  totalIncome: number;
  totalExpense: number;
  electionExpense: number; // 선거비용 지출 (item_sec_cd∈선거비용)
  nonElectionExpense: number; // 선거비용외 지출 (그 외 과목)
  reimbursableEstimate: number; // 보전 예상액 (선거비용 & acc_print_ok='Y')
  fundingSources: FundingSourceSlice[]; // 수입 출처 4분류
  executionRate: number; // 집행률 = 지출/수입 (%, 0~100)
  balance: number; // 잔액 = 수입 - 지출
}

export interface MonthlyAmount {
  month: string; // "6월"
  amount: number;
}

export interface SupporterMetrics {
  totalRaised: number; // 후원금 모금 총액 (수입 합계)
  totalExpense: number;
  monthlyRaised: MonthlyAmount[]; // 최근 6개월 모금 추이
  donorCount: number; // 수입 거래 고유 기부자(cust_id) 수
  anonymousDonor: boolean; // 익명(cust_id=-999) 기부 포함 여부
  newDonorCount: number; // 당월 최초 기부자 수
  candidateGrantTotal: number; // 후보자 기부금 지급 누계 (지출 & 과목 코드명 "기부금")
  remainingFund: number; // 잔여 모금액 = 모금총액 - 총지출
}

const ANONYMOUS_CUST_ID = -999;
const FUNDING_ORDER: FundingSource[] = [
  "보조금",
  "후원회기부금",
  "후보자자산",
  "보조금외",
  "기타",
];

const isIncome = (r: OrgMetricsRow) => r.incm_sec_cd === 1;
const isExpense = (r: OrgMetricsRow) => r.incm_sec_cd === 2;
const monthKey = (accDate: string) => accDate.slice(0, 6); // YYYYMM

/** YYYYMM 에 delta개월을 더한 YYYYMM (Date 비의존, 결정적) */
function addMonths(ym: string, delta: number): string {
  const y = parseInt(ym.slice(0, 4), 10);
  const m = parseInt(ym.slice(4, 6), 10);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}${String(nm).padStart(2, "0")}`;
}

const monthLabel = (ym: string) => `${parseInt(ym.slice(4, 6), 10)}월`;

/** 후보자 대시보드 지표 */
export function computeCandidateMetrics(
  rows: OrgMetricsRow[],
  ctx: OrgMetricsContext = EMPTY_CONTEXT,
): CandidateMetrics {
  let totalIncome = 0;
  let totalExpense = 0;
  let electionExpense = 0;
  let nonElectionExpense = 0;

  const fundingMap = new Map<FundingSource, number>();
  // 선거비용/선거비용외는 과목(item_sec_cd∈선거비용)으로 분류 — 보전 추정·총괄표·(계정×과목) 배분과 동일 기준.
  // exp_sec_cd(지출유형)는 미입력(0)이 많아 선거비용을 0으로 오분류하므로 쓰지 않는다.
  const electionItems = new Set(ctx.electionExpenseItemCds);

  for (const r of rows) {
    if (isIncome(r)) {
      totalIncome += r.acc_amt;
      const src = classifyFundingSource(r.acc_sec_cd, ctx.codeNameById[r.acc_sec_cd]);
      fundingMap.set(src, (fundingMap.get(src) ?? 0) + r.acc_amt);
    } else if (isExpense(r)) {
      totalExpense += r.acc_amt;
      if (electionItems.has(r.item_sec_cd)) {
        electionExpense += r.acc_amt;
      } else {
        nonElectionExpense += r.acc_amt;
      }
    }
  }

  // 보전 예상액: 보전청구서(claim-form)와 동일하게 aggregator 재사용 (SSOT)
  // 규칙: incm_sec_cd=2 & acc_print_ok='Y' & item_sec_cd∈선거비용 & 자금원≠기타
  const reimbursableEstimate = aggregateReimbursementByFundingSource({
    rows: rows as unknown as ReimbursementRow[], // aggregator는 acc_book_id 미사용 — 필드 호환
    electionExpenseItemCds: ctx.electionExpenseItemCds,
    accSecCdNames: ctx.codeNameById,
  }).byFundingSource.합계;

  const incomeBase = totalIncome || 1;
  const fundingSources: FundingSourceSlice[] = Array.from(fundingMap.entries())
    .map(([source, amount]) => ({
      source,
      amount,
      ratio: Math.round((amount / incomeBase) * 100),
    }))
    .sort(
      (a, b) => FUNDING_ORDER.indexOf(a.source) - FUNDING_ORDER.indexOf(b.source),
    );

  const executionRate =
    totalIncome > 0 ? Math.min(Math.round((totalExpense / totalIncome) * 100), 100) : 0;

  return {
    totalIncome,
    totalExpense,
    electionExpense,
    nonElectionExpense,
    reimbursableEstimate,
    fundingSources,
    executionRate,
    balance: totalIncome - totalExpense,
  };
}

/** 후원회 대시보드 지표 (currentYM: 기준 연월 YYYYMM, 테스트 결정성을 위해 주입) */
export function computeSupporterMetrics(
  rows: OrgMetricsRow[],
  currentYM: string,
  ctx: OrgMetricsContext = EMPTY_CONTEXT,
): SupporterMetrics {
  let totalRaised = 0;
  let totalExpense = 0;
  let candidateGrantTotal = 0;
  let anonymousDonor = false;

  // 기부자별 최초 수입 거래 월 추적 (신규 판정용)
  const donorFirstMonth = new Map<number, string>();
  const donorIds = new Set<number>();

  // 최근 6개월 윈도우
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) months.push(addMonths(currentYM, -i));
  const monthSums = new Map<string, number>(months.map((m) => [m, 0]));

  for (const r of rows) {
    if (isIncome(r)) {
      totalRaised += r.acc_amt;

      const mk = monthKey(r.acc_date);
      if (monthSums.has(mk)) monthSums.set(mk, monthSums.get(mk)! + r.acc_amt);

      if (r.cust_id != null) {
        if (r.cust_id === ANONYMOUS_CUST_ID) {
          anonymousDonor = true;
        } else {
          donorIds.add(r.cust_id);
          const prev = donorFirstMonth.get(r.cust_id);
          if (!prev || mk < prev) donorFirstMonth.set(r.cust_id, mk);
        }
      }
    } else if (isExpense(r)) {
      totalExpense += r.acc_amt;
      // 후보자 기부금 지급 = 후원회 지출 중 과목 코드명이 정확히 "기부금"
      // (후원회 지출 acc_sec_cd는 자금원이 아닌 수입/지출 플래그이므로 item 기반 식별)
      if (ctx.codeNameById[r.item_sec_cd] === CANDIDATE_GRANT_ITEM_NAME) {
        candidateGrantTotal += r.acc_amt;
      }
    }
  }

  let newDonorCount = 0;
  for (const first of donorFirstMonth.values()) {
    if (first === currentYM) newDonorCount++;
  }

  return {
    totalRaised,
    totalExpense,
    monthlyRaised: months.map((m) => ({ month: monthLabel(m), amount: monthSums.get(m)! })),
    donorCount: donorIds.size,
    anonymousDonor,
    newDonorCount,
    candidateGrantTotal,
    remainingFund: totalRaised - totalExpense,
  };
}
