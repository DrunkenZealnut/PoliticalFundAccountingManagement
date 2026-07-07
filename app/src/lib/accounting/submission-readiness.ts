/* ------------------------------------------------------------------ */
/*  제출 마법사 준비상태 판정(신호등) — 순수 조합 레이어                   */
/*                                                                    */
/*  기존 SSOT(buildSettlementSummary·countOutOfPeriodRows·orgValidRange  */
/*  ·aggregateReimbursementByFundingSource)가 낸 값을 읽어 ok/warn/block  */
/*  으로 조합만 한다. 여기서 수치를 새로 계산하면 미리보기·생성 서식과      */
/*  달라지므로 신규 집계 금지(설계 §0.1).                                 */
/*                                                                    */
/*  차단(block)은 데이터 무결성 최소치(거래0·기간미설정·보전0)만,          */
/*  나머지(재배분·결산·주기 외)는 경고+진행 허용 — 은폐 금지 방침.         */
/* ------------------------------------------------------------------ */
import { buildSettlementSummary } from "./settlement-summary";
import type { ReportSummaryRawRow } from "./income-expense-report-summary";
import { countOutOfPeriodRows, orgValidRange, ymdToDash, type OrgPeriod } from "./acc-period";
import {
  aggregateReimbursementByFundingSource,
  type AccBookRow,
} from "./reimbursement-aggregator";

export interface ReadinessCheck {
  id: string;
  label: string;
  level: "ok" | "warn" | "block";
  detail?: string;
  /** 문제 위치로 이동하는 대시보드 라우트("고치러 가기") */
  fixHref?: string;
}

export interface ReadinessResult {
  checks: ReadinessCheck[];
  /** block 이 하나도 없으면 true — 다음 스텝 진행 가능 */
  canProceed: boolean;
}

export interface ReportReadinessInput {
  rows: ReportSummaryRawRow[];
  /** estate_sec_cd=47(현금및예금) 합계 — estateAmount SSOT 로 합산해 전달 */
  estateCashAmount: number;
  estateCount: number;
  period: OrgPeriod;
  /** false(후원회·정당)면 공통 체크만 — 재배분·결산·재산은 후보자 전용(22-3 등) */
  isCandidate: boolean;
}

export interface ReimburseReadinessInput {
  rows: (AccBookRow & { acc_date?: string | null })[];
  electionExpenseItemCds: number[];
  accSecCdNames?: Record<number, string>;
  period: OrgPeriod;
}

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const dashDate = ymdToDash;

function finalize(checks: ReadinessCheck[]): ReadinessResult {
  return { checks, canProceed: !checks.some((c) => c.level === "block") };
}

/** 공통 체크 3종: 거래 존재·회계기간 설정·주기 외 거래 */
function commonChecks(
  rows: { acc_date?: string | null }[],
  period: OrgPeriod,
  emptyFixHref: string,
): ReadinessCheck[] {
  const checks: ReadinessCheck[] = [];

  checks.push(
    rows.length === 0
      ? {
          id: "has-rows",
          label: "거래 입력",
          level: "block",
          detail: "입력된 거래가 없습니다 — 수입·지출을 먼저 입력하세요.",
          fixHref: emptyFixHref,
        }
      : { id: "has-rows", label: "거래 입력", level: "ok", detail: `거래 ${rows.length}건` },
  );

  const range = orgValidRange(period);
  checks.push(
    range === null
      ? {
          id: "period-set",
          label: "회계기간 설정",
          level: "block",
          detail: "기관의 회계기간(시작·종료일)이 설정되지 않았습니다.",
          fixHref: "/dashboard/organ",
        }
      : {
          id: "period-set",
          label: "회계기간 설정",
          level: "ok",
          detail: `${dashDate(range.lo)} ~ ${dashDate(range.hi)}`,
        },
  );

  const oop = countOutOfPeriodRows(rows, period);
  checks.push(
    oop.count > 0
      ? {
          id: "out-of-period",
          label: "회계기간 외 거래",
          level: "warn",
          detail: `회계기간 밖 거래 ${oop.count}건 (예: ${oop.samples
            .map((s) => dashDate(s.acc_date))
            .join(", ")}) — 다른 선거주기 자료가 섞였는지 확인하세요.`,
        }
      : { id: "out-of-period", label: "회계기간 외 거래", level: "ok", detail: "없음" },
  );

  return checks;
}

/**
 * 보고서 트랙(수입·지출보고서) 준비상태. 순수.
 * 비후보자(isCandidate=false)는 공통 체크만 반환한다 — 재배분·결산·재산 체크는
 * 후보자 전용 서식(22-1~4)에만 의미가 있다(후원회 재산은 23-2 빈 양식).
 */
export function buildReportReadiness(input: ReportReadinessInput): ReadinessResult {
  const checks = commonChecks(input.rows, input.period, "/dashboard/income");

  if (input.isCandidate) {
    // 재배분·결산은 동일 SSOT 1회 호출로 함께 읽는다(이중 계산 방지).
    const summary = buildSettlementSummary(input.rows);

    checks.push(
      summary.shortfalls.length > 0
        ? {
            id: "realloc-shortfall",
            label: "재배분 정리",
            level: "warn",
            detail: `자금원 부족 ${summary.shortfalls.length}건 — 통장 잔액 부족(총지출>총수입)은 재배분으로 해소되지 않는 데이터 문제입니다. 음수 수입·누락 거래를 확인하세요.`,
            fixHref: "/dashboard/income-expense-book",
          }
        : { id: "realloc-shortfall", label: "재배분 정리", level: "ok", detail: "부족 없음" },
    );

    const diff = summary.balance - input.estateCashAmount;
    checks.push(
      diff !== 0
        ? {
            id: "settlement-vs-estate",
            label: "결산 잔액 = 재산(현금및예금)",
            level: "warn",
            detail: `결산 잔액 ${won(summary.balance)} ≠ 재산 ${won(input.estateCashAmount)} (차이 ${won(Math.abs(diff))})`,
            fixHref: "/dashboard/settlement",
          }
        : {
            id: "settlement-vs-estate",
            label: "결산 잔액 = 재산(현금및예금)",
            level: "ok",
            detail: `잔액 ${won(summary.balance)} 일치`,
          },
    );

    checks.push(
      input.estateCount === 0
        ? {
            id: "estate-entered",
            label: "재산명세 입력",
            level: "warn",
            detail: "재산 현황이 입력되지 않았습니다 — 재산명세서(22-3)가 비어 나옵니다.",
            fixHref: "/dashboard/estate",
          }
        : {
            id: "estate-entered",
            label: "재산명세 입력",
            level: "ok",
            detail: `재산 ${input.estateCount}건`,
          },
    );
  }

  return finalize(checks);
}

/**
 * 보전 트랙(선거비용 보전신청서) 준비상태. 순수. 후보자 전용 트랙.
 * 집계는 aggregateReimbursementByFundingSource(SSOT) 결과만 읽는다.
 */
export function buildReimburseReadiness(input: ReimburseReadinessInput): ReadinessResult {
  const checks = commonChecks(input.rows, input.period, "/dashboard/expense");

  const agg = aggregateReimbursementByFundingSource({
    rows: input.rows,
    electionExpenseItemCds: input.electionExpenseItemCds,
    accSecCdNames: input.accSecCdNames,
  });
  // 보전 체크된 선거비용 지출 건수(4분류 + 기타 포함)
  const checkedCount = agg.rowCount + agg.otherFundingCount;

  checks.push(
    checkedCount === 0
      ? {
          id: "reimburse-checked",
          label: "보전 대상 체크",
          level: "block",
          detail: "보전 체크된 선거비용 지출이 없습니다 — 지출내역관리에서 보전 대상을 먼저 체크하세요.",
          fixHref: "/dashboard/reimbursement",
        }
      : {
          id: "reimburse-checked",
          label: "보전 대상 체크",
          level: "ok",
          detail: `보전 체크 ${checkedCount}건`,
        },
  );

  checks.push(
    agg.otherFundingCount > 0
      ? {
          id: "funding-unclassified",
          label: "자금원 분류",
          level: "warn",
          detail: `자금원 미분류(기타) ${agg.otherFundingCount}건 · ${won(agg.otherFundingAmt)} — 4분류 합계에서 제외됩니다. 계정을 교정하세요.`,
          fixHref: "/dashboard/reimbursement",
        }
      : { id: "funding-unclassified", label: "자금원 분류", level: "ok", detail: "전건 4분류" },
  );

  // 체크 0건이면 청구액 체크는 노이즈(위 block 이 원인을 이미 설명) — 생성하지 않는다.
  if (checkedCount > 0) {
    checks.push(
      agg.byFundingSource.합계 === 0
        ? {
            id: "claim-total",
            label: "보전 청구액",
            level: "warn",
            detail: "보전 청구액 합계가 0원입니다(청구·환급 상쇄 등) — 청구 내역을 확인하세요.",
            fixHref: "/dashboard/reimbursement",
          }
        : {
            id: "claim-total",
            label: "보전 청구액",
            level: "ok",
            detail: `청구액 합계 ${won(agg.byFundingSource.합계)} · ${agg.rowCount}건`,
          },
    );
  }

  return finalize(checks);
}
