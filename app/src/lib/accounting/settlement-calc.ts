/**
 * 결산 계산 단일 진실원천 (Settlement Calculation SSOT).
 *
 * 선관위 PFund2.exe 결산 로직과 동일한 수치를 산출하기 위한 보정 규칙을 한 곳에 모은다.
 * 사용처: income-expense-report, aggregate, submit, export-sqlite의 OPINION 동기화.
 *
 * 규칙 1 (마이너스 수입 → 지출 전환):
 *   - `incm_sec_cd === 1 && acc_amt < 0`인 행을 가상으로 지출 행으로 치환하여 합산.
 *   - 원본 데이터는 수정하지 않음. corrections audit log에 변환 내역 기록.
 *
 * 규칙 2 (자금출처별 보전 비인정분 자산 충당) — 옵트인:
 *   - 보조금 보전 비인정분과 후원회기부금 잔액을 자산 선거비용으로 이전.
 *   - 수입/지출 총액은 변하지 않음. byAccount 분포만 이동.
 *   - 후보자 계정구분 코드: 82=보조금, 83=보조금외지원금, 84=자산, 85=후원회기부금.
 *   - 후보자 과목 코드: 86=선거비용, 87=선거비용외.
 */

/** 후보자 계정구분 (CS_ID=10). PFund2 reverse-engineering으로 확정. */
const CANDIDATE_SUBSIDY_ACC_SEC_CDS: ReadonlySet<number> = new Set([82, 83]);
const CANDIDATE_ASSET_ACC_SEC_CD = 84;
const CANDIDATE_SUPPORTER_ACC_SEC_CD = 85;
const CANDIDATE_ELECTION_EXPENSE_ITEM_SEC_CD = 86;

export interface AccBookRow {
  acc_book_id?: number;
  org_id?: number;
  incm_sec_cd: number;
  acc_sec_cd: number;
  item_sec_cd: number;
  exp_sec_cd?: number;
  acc_date: string;
  acc_amt: number;
}

export type FundSource =
  | "보조금"
  | "후원회기부금"
  | "자산"
  | "당비"
  | "기탁금"
  | "차입금"
  | "이월"
  | "그외";

export interface AccountBreakdown {
  acc_sec_cd: number;
  income: number;
  electionExpense: number;
  nonElectionExpense: number;
}

export interface FundSourceBreakdown {
  source: FundSource;
  reimbursable: number;
  nonReimbursable: number;
  total: number;
}

export type CorrectionRule =
  | "negative_income_to_expense"
  | "subsidy_overflow_to_asset"
  | "supporter_remainder_to_asset";

export interface Correction {
  acc_book_id?: number;
  rule: CorrectionRule;
  before: { incm_sec_cd: number; acc_amt: number; acc_sec_cd?: number };
  after: { incm_sec_cd: number; acc_amt: number; acc_sec_cd?: number };
  reason: string;
}

export interface RedistributionDetail {
  /** 출발 자금출처 acc_sec_cd */
  fromAccSecCd: number;
  /** 도착 자금출처 acc_sec_cd (현재는 항상 84=자산) */
  toAccSecCd: number;
  /** 도착 항목 item_sec_cd (현재는 항상 86=선거비용) */
  toItemSecCd: number;
  /** 이전 금액 (양수) */
  amount: number;
}

export interface SettlementResult {
  incomeTotal: number;
  expenseTotal: number;
  balance: number;
  byAccount: AccountBreakdown[];
  byFundSource: FundSourceBreakdown[];
  corrections: Correction[];
  /** Rule 2 재배분 적용 결과. 비활성/0이면 빈 배열. */
  redistributions: RedistributionDetail[];
}

export interface ReimbursementCaps {
  /**
   * 자금출처(acc_sec_cd)별 보전 인정액 (원).
   * 키 없는 자금출처는 cap=0 (전액 비인정).
   * 예: { 82: 2_548_335 } — 보조금(82) 보전 인정액 254만원.
   */
  byAccSecCd: Record<number, number>;
  /**
   * 후원회기부금(85) 잔액의 자산 이전 활성화. 기본 true.
   */
  redistributeSupporterRemainder?: boolean;
}

export interface ComputeBalancesOptions {
  dateFrom?: string;
  dateTo?: string;
  applyNegativeIncomeRule?: boolean;
  applyFundSourceRedistribution?: boolean;
  /** 재배분 활성화 시 필수 입력. 미지정 시 재배분 0 적용. */
  reimbursementCaps?: ReimbursementCaps;
  /** 선거비용으로 간주할 acc_sec_cd 집합. 기본: [3] (선거비용). */
  electionExpenseAccSecCds?: ReadonlySet<number>;
}

const DEFAULT_ELECTION_EXPENSE_ACC_SEC_CDS: ReadonlySet<number> = new Set([3]);

/**
 * 마이너스 수입 행 1건을 양수 지출 행으로 변환한 사본을 반환.
 */
function convertNegativeIncome(row: AccBookRow): AccBookRow {
  return {
    ...row,
    incm_sec_cd: 2,
    acc_amt: Math.abs(row.acc_amt),
  };
}

export interface ApplyCorrectionsResult {
  rows: AccBookRow[];
  corrections: Correction[];
}

/**
 * 보정 규칙만 적용해 corrected rows를 반환. 합계/집계는 호출자가 직접 수행.
 *
 * 페이지가 자체 분류 로직(예: item_sec_cd 기반 선거비용 판단)을 갖고 있을 때
 * 마이너스 수입 보정만 받아 쓰고 싶을 때 유용.
 *
 * 원본 rows는 mutate하지 않는다.
 */
export function applyCorrections(
  rows: readonly AccBookRow[],
  options: { applyNegativeIncomeRule?: boolean } = {},
): ApplyCorrectionsResult {
  const { applyNegativeIncomeRule = true } = options;
  const corrections: Correction[] = [];
  const corrected = rows.map((row) => {
    if (
      applyNegativeIncomeRule &&
      row.incm_sec_cd === 1 &&
      row.acc_amt < 0
    ) {
      const converted = convertNegativeIncome(row);
      corrections.push({
        acc_book_id: row.acc_book_id,
        rule: "negative_income_to_expense",
        before: { incm_sec_cd: row.incm_sec_cd, acc_amt: row.acc_amt },
        after: { incm_sec_cd: converted.incm_sec_cd, acc_amt: converted.acc_amt },
        reason: "마이너스 수입을 지출로 전환 (선관위 PFund2 규칙)",
      });
      return converted;
    }
    return row;
  });
  return { rows: corrected, corrections };
}

function inDateRange(
  date: string,
  from: string | undefined,
  to: string | undefined,
): boolean {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

/**
 * 메인 결산 계산 함수.
 *
 * 1. 날짜 필터 적용
 * 2. 규칙 1 적용 (기본 true)
 * 3. 규칙 2 적용 (기본 false — placeholder)
 * 4. 합계/계정별/자금출처별 집계
 *
 * 원본 rows는 절대 mutate하지 않는다.
 */
export function computeBalances(
  rows: readonly AccBookRow[],
  options: ComputeBalancesOptions = {},
): SettlementResult {
  const {
    dateFrom,
    dateTo,
    applyNegativeIncomeRule = true,
    applyFundSourceRedistribution = false,
    electionExpenseAccSecCds = DEFAULT_ELECTION_EXPENSE_ACC_SEC_CDS,
  } = options;

  const filtered = rows.filter((r) => inDateRange(r.acc_date, dateFrom, dateTo));
  const { rows: effectiveRows, corrections } = applyCorrections(filtered, {
    applyNegativeIncomeRule,
  });

  let incomeTotal = 0;
  let expenseTotal = 0;
  const accountMap = new Map<number, AccountBreakdown>();

  for (const row of effectiveRows) {
    if (row.incm_sec_cd === 1) {
      incomeTotal += row.acc_amt;
    } else if (row.incm_sec_cd === 2) {
      expenseTotal += row.acc_amt;
    }

    let bucket = accountMap.get(row.acc_sec_cd);
    if (!bucket) {
      bucket = {
        acc_sec_cd: row.acc_sec_cd,
        income: 0,
        electionExpense: 0,
        nonElectionExpense: 0,
      };
      accountMap.set(row.acc_sec_cd, bucket);
    }

    if (row.incm_sec_cd === 1) {
      bucket.income += row.acc_amt;
    } else if (row.incm_sec_cd === 2) {
      // 선거비용 분류: exp_sec_cd가 있으면 그 의미를 우선시. acc_sec_cd=3을 선거비용으로 보는 단순 규칙으로 시작.
      if (electionExpenseAccSecCds.has(row.acc_sec_cd)) {
        bucket.electionExpense += row.acc_amt;
      } else {
        bucket.nonElectionExpense += row.acc_amt;
      }
    }
  }

  // Rule 2: 자금출처 충당 재배분 (opt-in)
  const redistributions: RedistributionDetail[] = applyFundSourceRedistribution
    ? computeRedistributions(effectiveRows, options.reimbursementCaps)
    : [];

  if (redistributions.length > 0) {
    applyRedistributionsToBuckets(accountMap, redistributions, corrections);
  }

  const byAccount = Array.from(accountMap.values()).sort(
    (a, b) => a.acc_sec_cd - b.acc_sec_cd,
  );

  const byFundSource = buildFundSourceBreakdown(effectiveRows);

  return {
    incomeTotal,
    expenseTotal,
    balance: incomeTotal - expenseTotal,
    byAccount,
    byFundSource,
    corrections,
    redistributions,
  };
}

/**
 * Rule 2 알고리즘. 가설 v1 (PFund2 Phase 1 reverse-engineering 결과).
 *
 * 5.1 보조금 비인정분 → 자산 선거비용
 *     for each subsidyCd in {82, 83}:
 *       nonReimbursable = max(0, subsidyExpense - cap)
 *
 * 5.2 후원회기부금 잔액 → 자산 선거비용
 *     remainder = supporterIncome - supporterExpense
 *     (양수일 때만)
 *
 * 주의: byAccount의 electionExpense는 `electionExpenseAccSecCds` 기준 acc_sec_cd 분류.
 * 후보자 데이터의 PFund2 호환 표시는 item_sec_cd=86 기반이라 페이지 측에서 별도 분류 필요.
 * 본 모듈은 redistributions detail을 정확히 산출하며 page는 그 detail로 자체 표시를 보정함.
 *
 * @internal — computeBalances 내부에서만 호출. UI/API는 SettlementResult.redistributions를 통해 접근.
 */
function computeRedistributions(
  rows: readonly AccBookRow[],
  caps?: ReimbursementCaps,
): RedistributionDetail[] {
  const details: RedistributionDetail[] = [];
  const capMap = caps?.byAccSecCd ?? {};
  const redistributeSupporter = caps?.redistributeSupporterRemainder ?? true;

  // 5.1 보조금 비인정분
  for (const subsidyCd of CANDIDATE_SUBSIDY_ACC_SEC_CDS) {
    let subsidyExpense = 0;
    for (const r of rows) {
      if (r.incm_sec_cd === 2 && r.acc_sec_cd === subsidyCd) {
        subsidyExpense += r.acc_amt;
      }
    }
    if (subsidyExpense === 0) continue;
    const cap = capMap[subsidyCd] ?? 0;
    const nonReimbursable = Math.max(0, subsidyExpense - cap);
    if (nonReimbursable > 0) {
      details.push({
        fromAccSecCd: subsidyCd,
        toAccSecCd: CANDIDATE_ASSET_ACC_SEC_CD,
        toItemSecCd: CANDIDATE_ELECTION_EXPENSE_ITEM_SEC_CD,
        amount: nonReimbursable,
      });
    }
  }

  // 5.2 후원회기부금 잔액
  if (redistributeSupporter) {
    let supporterIncome = 0;
    let supporterExpense = 0;
    for (const r of rows) {
      if (r.acc_sec_cd !== CANDIDATE_SUPPORTER_ACC_SEC_CD) continue;
      if (r.incm_sec_cd === 1) supporterIncome += r.acc_amt;
      else if (r.incm_sec_cd === 2) supporterExpense += r.acc_amt;
    }
    const remainder = supporterIncome - supporterExpense;
    if (remainder > 0) {
      details.push({
        fromAccSecCd: CANDIDATE_SUPPORTER_ACC_SEC_CD,
        toAccSecCd: CANDIDATE_ASSET_ACC_SEC_CD,
        toItemSecCd: CANDIDATE_ELECTION_EXPENSE_ITEM_SEC_CD,
        amount: remainder,
      });
    }
  }

  return details;
}

function applyRedistributionsToBuckets(
  accountMap: Map<number, AccountBreakdown>,
  details: readonly RedistributionDetail[],
  corrections: Correction[],
): void {
  for (const d of details) {
    const from = accountMap.get(d.fromAccSecCd);
    if (from) {
      from.electionExpense = Math.max(0, from.electionExpense - d.amount);
    }
    let to = accountMap.get(d.toAccSecCd);
    if (!to) {
      to = {
        acc_sec_cd: d.toAccSecCd,
        income: 0,
        electionExpense: 0,
        nonElectionExpense: 0,
      };
      accountMap.set(d.toAccSecCd, to);
    }
    to.electionExpense += d.amount;

    const rule: CorrectionRule =
      d.fromAccSecCd === CANDIDATE_SUPPORTER_ACC_SEC_CD
        ? "supporter_remainder_to_asset"
        : "subsidy_overflow_to_asset";
    corrections.push({
      rule,
      before: { incm_sec_cd: 2, acc_amt: d.amount, acc_sec_cd: d.fromAccSecCd },
      after: { incm_sec_cd: 2, acc_amt: d.amount, acc_sec_cd: d.toAccSecCd },
      reason:
        rule === "supporter_remainder_to_asset"
          ? `후원회기부금 잔액 ${d.amount.toLocaleString()}원을 자산 선거비용으로 이전`
          : `보조금(${d.fromAccSecCd}) 보전 비인정분 ${d.amount.toLocaleString()}원을 자산 선거비용으로 이전`,
    });
  }
}

/**
 * acc_sec_cd → FundSource 단순 매핑.
 * CS_ID=2 계정구분: 3=보조금외, 4=경상보조금, 5=선거보조금, 6=여성추천보조금, 104=장애인추천보조금
 *
 * PFund2의 정확한 자금출처 분류는 계정과목(item_sec_cd) 단위까지 보아야 하지만,
 * 본 헬퍼는 계정구분 단위의 1차 근사 분류만 제공한다.
 */
function classifyFundSource(row: AccBookRow): FundSource {
  if (row.incm_sec_cd !== 1) {
    // 지출 행의 출처 분류는 짝지어진 수입에 의존하므로 단순 분류 불가.
    return "그외";
  }
  if ([4, 5, 6, 104].includes(row.acc_sec_cd)) return "보조금";
  return "그외";
}

function buildFundSourceBreakdown(rows: AccBookRow[]): FundSourceBreakdown[] {
  const map = new Map<FundSource, FundSourceBreakdown>();
  for (const row of rows) {
    if (row.incm_sec_cd !== 1) continue;
    const source = classifyFundSource(row);
    let bucket = map.get(source);
    if (!bucket) {
      bucket = { source, reimbursable: 0, nonReimbursable: 0, total: 0 };
      map.set(source, bucket);
    }
    bucket.total += row.acc_amt;
  }
  return Array.from(map.values());
}
