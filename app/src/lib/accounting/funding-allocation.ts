/* ------------------------------------------------------------------ */
/*  자금원별 충당 현황 — 순수 집계                                       */
/*                                                                    */
/*  지출내역관리 페이지에서 "어느 수입계정(자금원)으로 지출을 할당할지"   */
/*  가늠하기 위한, 자금원별 수입·지출·가용잔액 집계.                      */
/*                                                                    */
/*  SSOT 정합 (기존 단일 소스 재사용):                                   */
/*   - 자금원 분류: classifyFundingSource(acc_sec_cd, 코드명)           */
/*       (funding-source.ts — 보전청구서 자금원 4분류)                  */
/*   - 선거비용 판별: 과목(item_sec_cd) 코드명 === "선거비용"            */
/*       (ledger-summary.ts ELECTION_ITEM_NAME과 동일 기준)             */
/*   - 마이너스 수입 보정: applyCorrections (settlement-calc SSOT)       */
/*                                                                    */
/*  후보자(candidate) 지출은 acc_sec_cd가 곧 자금원(82/83/84/85)이므로   */
/*  수입·지출을 같은 키로 직접 합산할 수 있다(getAccounts(orgSecCd,2)가   */
/*  자금원 계정을 반환). 법정 우선순위 충당 재배분은 결산(submit) 영역    */
/*  이며 본 모듈은 단순 집계만 한다.                                      */
/*  React/Next 비의존 → 단위 테스트 가능.                              */
/* ------------------------------------------------------------------ */

import { classifyFundingSource, type FundingSource } from "./funding-source";
import { applyCorrections, type AccBookRow } from "./settlement-calc";
// 과목 기준 선거비용 판별은 ledger-summary와 동일 SSOT(과목 item_sec_cd 코드명 === "선거비용")를 공유.
// NOTE: expense-types의 detectItemCategory는 지출유형 대분류명(expGroup1)을 받는 별개 분류라 여기 적용 불가.
import { ELECTION_ITEM_NAME } from "./ledger-summary";

/** 자금원 표시 고정 순서 */
const FUNDING_ORDER: readonly FundingSource[] = [
  "후보자자산",
  "후원회기부금",
  "보조금",
  "보조금외",
  "기타",
];

/** 자금원별 충당 현황 1행 */
export interface FundingAllocationRow {
  source: FundingSource; // 후보자자산|후원회기부금|보조금|보조금외|기타
  income: number; // 자금원 수입 총액 (incm_sec_cd=1)
  electionExpense: number; // 선거비용 지출 (과목 코드명="선거비용")
  nonElectionExpense: number; // 선거비용외 지출
  expense: number; // 지출 합계 = election + nonElection
  available: number; // 가용잔액 = income - expense
  overspent: boolean; // available < 0 (초과충당)
  incomeRatio: number; // 전체 수입 대비 비율 (막대 시각화용, 0~1)
}

export interface FundingAllocation {
  rows: FundingAllocationRow[]; // FUNDING_ORDER 순서, 수입·지출 모두 0인 자금원 제외
  totalIncome: number;
  totalExpense: number;
  totalAvailable: number; // totalIncome - totalExpense
}

export interface BuildFundingAllocationOpts {
  /** cv_id → 코드명 (useCodeValues.getName) */
  getName: (cvId: number) => string;
  /** 마이너스 수입 보정 적용 (결산 정합). 기본 true */
  applyNegativeIncomeRule?: boolean;
}

interface Bucket {
  income: number;
  electionExpense: number;
  nonElectionExpense: number;
}

/**
 * 자금원별 수입·지출·가용잔액을 집계한다.
 *
 * @param rows  org 전체 acc_book 행(수입+지출). 날짜/계정 필터 없이 전체 누적 기준.
 * @param opts  getName(코드명 해석), applyNegativeIncomeRule(기본 true)
 */
export function buildFundingAllocation(
  rows: readonly AccBookRow[],
  opts: BuildFundingAllocationOpts,
): FundingAllocation {
  const { getName, applyNegativeIncomeRule = true } = opts;
  const { rows: effectiveRows } = applyCorrections(rows, { applyNegativeIncomeRule });

  const buckets = new Map<FundingSource, Bucket>();
  const ensure = (s: FundingSource): Bucket => {
    let b = buckets.get(s);
    if (!b) {
      b = { income: 0, electionExpense: 0, nonElectionExpense: 0 };
      buckets.set(s, b);
    }
    return b;
  };

  for (const r of effectiveRows) {
    const source = classifyFundingSource(r.acc_sec_cd, getName(r.acc_sec_cd));
    const b = ensure(source);
    if (r.incm_sec_cd === 1) {
      b.income += r.acc_amt;
    } else if (r.incm_sec_cd === 2) {
      if (getName(r.item_sec_cd) === ELECTION_ITEM_NAME) {
        b.electionExpense += r.acc_amt;
      } else {
        b.nonElectionExpense += r.acc_amt;
      }
    }
  }

  let totalIncome = 0;
  let totalExpense = 0;
  for (const b of buckets.values()) {
    totalIncome += b.income;
    totalExpense += b.electionExpense + b.nonElectionExpense;
  }

  const rowsOut: FundingAllocationRow[] = [];
  for (const source of FUNDING_ORDER) {
    const b = buckets.get(source);
    if (!b) continue;
    const expense = b.electionExpense + b.nonElectionExpense;
    // 수입·지출 모두 0인 자금원은 표시 제외
    if (b.income === 0 && expense === 0) continue;
    const available = b.income - expense;
    rowsOut.push({
      source,
      income: b.income,
      electionExpense: b.electionExpense,
      nonElectionExpense: b.nonElectionExpense,
      expense,
      available,
      overspent: available < 0,
      incomeRatio: totalIncome > 0 ? b.income / totalIncome : 0,
    });
  }

  return {
    rows: rowsOut,
    totalIncome,
    totalExpense,
    totalAvailable: totalIncome - totalExpense,
  };
}
