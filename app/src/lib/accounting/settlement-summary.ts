/* ------------------------------------------------------------------ */
/*  결산작업 총괄 모델 — 22-1 보고서와 동일한 재배분 SSOT 위에서 집계      */
/*                                                                    */
/*  결산 화면(dashboard/settlement)이 원본 acc_book을 직접 집계하면        */
/*  후보자 자금원별로 (현실에선 불가능한) 음수 차액이 보인다 — 한 자금원    */
/*  에서 받은 것보다 더 쓴 것처럼 기록된 거래가 실제로는 다른 자금원에서    */
/*  충당된 것이기 때문. 다른 모든 보고 화면·제출서류·.db는 보고 시점       */
/*  재배분(Pass0→1→2)을 거친 정리값을 쓴다.                              */
/*                                                                    */
/*  이 모듈은 22-1 총괄과 동일한 `allocateCandidateLedgerRows`(SSOT)로     */
/*  (계정×과목)을 재배분한 뒤 집계해, 결산 = 수입·지출부 = 22-1 = .db 가    */
/*  같은 데이터면 항상 일치하도록 한다. 통장 전체 부족(데이터 오류)은       */
/*  `detectCandidateShortfalls`로 은폐 없이 그대로 노출한다.              */
/* ------------------------------------------------------------------ */
import {
  allocateCandidateLedgerRows,
  detectCandidateShortfalls,
  type ReportSummaryRawRow,
} from "./income-expense-report-summary";
import type { Shortfall } from "./fund-realloc";

export interface SettlementAccountSummary {
  acc_sec_cd: number;
  item_sec_cd: number;
  income: number;
  expense: number;
  incomeCount: number;
  expenseCount: number;
}

export interface SettlementSummary {
  income: number;
  expense: number;
  balance: number;
  accounts: SettlementAccountSummary[];
  /** 통장(현금풀) 전체 부족 = 실제 데이터 오류. 정상이면 빈 배열. */
  shortfalls: Shortfall[];
}

/**
 * raw acc_book 행 → 결산 총괄(재배분 적용). 순수.
 *
 * 후보자(자금원 82~85 거래 존재)면 `allocateCandidateLedgerRows`로 (계정×과목) 재배분
 * 후 집계하므로 자금원별 차액이 정상화된다(자금원별 잔액 ≥ 0, 합 보존). 비후보자는
 * Pass0(음수수입→지출)만 적용한 raw 집계 — 22-1 총괄과 동일 전처리.
 * `balance`(수입-지출)는 재배분으로 불변이라 재산 검증(잔액==현금및예금)에 영향 없다.
 */
export function buildSettlementSummary(rawRows: ReportSummaryRawRow[]): SettlementSummary {
  const allocated = allocateCandidateLedgerRows(rawRows);

  let income = 0;
  let expense = 0;
  const accountMap = new Map<string, SettlementAccountSummary>();

  for (const r of allocated) {
    const accSecCd = Number(r.acc_sec_cd);
    const itemSecCd = Number(r.item_sec_cd);
    const amt = Number(r.acc_amt ?? 0);
    const isIncome = Number(r.incm_sec_cd) === 1;

    if (isIncome) income += amt;
    else expense += amt;

    const key = `${accSecCd}-${itemSecCd}`;
    const existing = accountMap.get(key);
    if (existing) {
      if (isIncome) {
        existing.income += amt;
        existing.incomeCount += 1;
      } else {
        existing.expense += amt;
        existing.expenseCount += 1;
      }
    } else {
      accountMap.set(key, {
        acc_sec_cd: accSecCd,
        item_sec_cd: itemSecCd,
        income: isIncome ? amt : 0,
        expense: isIncome ? 0 : amt,
        incomeCount: isIncome ? 1 : 0,
        expenseCount: isIncome ? 0 : 1,
      });
    }
  }

  const accounts = Array.from(accountMap.values()).sort(
    (a, b) => a.acc_sec_cd - b.acc_sec_cd || a.item_sec_cd - b.item_sec_cd,
  );

  return {
    income,
    expense,
    balance: income - expense,
    accounts,
    shortfalls: detectCandidateShortfalls(rawRows),
  };
}
