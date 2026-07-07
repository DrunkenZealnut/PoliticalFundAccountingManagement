"use client";

/**
 * 마법사 스텝 2 — 데이터 재산출 미리보기(FR-3).
 * 수치는 전부 기존 SSOT: 보고서=buildSettlementSummary(재배분 적용, 22-1과 동일),
 * 보전=aggregateReimbursementByFundingSource(서식43과 동일). 신규 계산 금지 —
 * "이 숫자 그대로 서식이 만들어집니다"가 구조적으로 참이 되게 한다.
 */
import { useMemo } from "react";
import { buildSettlementSummary } from "@/lib/accounting/settlement-summary";
import type { ReportSummaryRawRow } from "@/lib/accounting/income-expense-report-summary";
import {
  aggregateReimbursementByFundingSource,
  type AccBookRow,
} from "@/lib/accounting/reimbursement-aggregator";
import type { WizardData, WizardTrack } from "./wizard-types";

interface Props {
  track: WizardTrack;
  data: WizardData;
  orgType: string | null;
  getName: (cvId: number) => string;
}

const fmt = (n: number) => n.toLocaleString("ko-KR");

const cellCls = "border px-3 py-1.5 text-right tabular-nums";
const headCls = "border bg-muted px-3 py-1.5 text-center font-semibold";

export default function PreviewStep({ track, data, orgType, getName }: Props) {
  if (track === "reimburse") {
    return <ReimbursePreview data={data} />;
  }
  return <ReportPreview data={data} orgType={orgType} getName={getName} />;
}

/* ------------------------------------------------------------------ */
/*  보고서 트랙                                                         */
/* ------------------------------------------------------------------ */

function ReportPreview({ data, orgType, getName }: Omit<Props, "track">) {
  const isCandidate = orgType === "candidate";

  const summary = useMemo(
    () => buildSettlementSummary(data.records as unknown as ReportSummaryRawRow[]),
    [data.records],
  );

  // 자금원(계정)별 수입/지출(선거비용·외) 집계 — 과목 분류는 과목명 기준(SSOT 규칙: cv_id 하드코딩 금지)
  const byAccount = useMemo(() => {
    const map = new Map<number, { income: number; expElection: number; expOther: number }>();
    for (const a of summary.accounts) {
      const cur = map.get(a.acc_sec_cd) ?? { income: 0, expElection: 0, expOther: 0 };
      cur.income += a.income;
      if (getName(a.item_sec_cd) === "선거비용") cur.expElection += a.expense;
      else cur.expOther += a.expense;
      map.set(a.acc_sec_cd, cur);
    }
    return Array.from(map.entries()).sort((x, y) => x[0] - y[0]);
  }, [summary, getName]);

  const estateDiff = summary.balance - data.estateCashAmount;

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={headCls}>계정(자금원)</th>
              <th className={headCls}>수입</th>
              <th className={headCls}>지출(선거비용)</th>
              <th className={headCls}>지출(선거비용외)</th>
              <th className={headCls}>잔액</th>
            </tr>
          </thead>
          <tbody>
            {byAccount.map(([accSecCd, v]) => (
              <tr key={accSecCd}>
                <td className="border px-3 py-1.5">{getName(accSecCd)}</td>
                <td className={cellCls}>{fmt(v.income)}</td>
                <td className={cellCls}>{fmt(v.expElection)}</td>
                <td className={cellCls}>{fmt(v.expOther)}</td>
                <td className={cellCls}>{fmt(v.income - v.expElection - v.expOther)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="border bg-muted px-3 py-1.5">합계</td>
              <td className={cellCls}>{fmt(summary.income)}</td>
              <td className={cellCls}>
                {fmt(byAccount.reduce((s, [, v]) => s + v.expElection, 0))}
              </td>
              <td className={cellCls}>
                {fmt(byAccount.reduce((s, [, v]) => s + v.expOther, 0))}
              </td>
              <td className={cellCls}>{fmt(summary.balance)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {isCandidate && (
        <p className="text-sm">
          결산 잔액 <b>{fmt(summary.balance)}원</b> / 재산(현금및예금){" "}
          <b>{fmt(data.estateCashAmount)}원</b>{" "}
          {estateDiff === 0 ? (
            <span className="text-green-600">— 일치 ✅</span>
          ) : (
            <span className="text-amber-600">— 차이 {fmt(Math.abs(estateDiff))}원 ⚠️</span>
          )}
        </p>
      )}

      {!isCandidate && (
        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          이 기관 유형의 회계보고서 서식은 <b>빈 양식</b>으로 제공됩니다(자동 채움 없음).
          수입·지출부 Excel 에만 위 데이터가 채워집니다.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        위 표는 보고 시점 재배분(자금원·과목 정리)을 적용한 수치로, 생성되는 서식·Excel 과 동일한
        계산 기준입니다 — 이 숫자 그대로 서식이 만들어집니다.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  보전 트랙                                                           */
/* ------------------------------------------------------------------ */

function ReimbursePreview({ data }: { data: WizardData }) {
  const agg = useMemo(
    () =>
      aggregateReimbursementByFundingSource({
        rows: data.records as unknown as AccBookRow[],
        electionExpenseItemCds: data.electionExpenseItemCds,
        accSecCdNames: data.accSecCdNames,
      }),
    [data],
  );

  const rows: [string, number][] = [
    ["후보자 자산", agg.byFundingSource.후보자자산],
    ["후원회 기부금", agg.byFundingSource.후원회기부금],
    ["보조금", agg.byFundingSource.보조금],
    ["보조금 외", agg.byFundingSource.보조금외],
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={headCls}>자금원</th>
              <th className={headCls}>보전 청구액</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, amt]) => (
              <tr key={label}>
                <td className="border px-3 py-1.5">{label}</td>
                <td className={cellCls}>{fmt(amt)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="border bg-muted px-3 py-1.5">합계 ({agg.rowCount}건)</td>
              <td className={cellCls}>{fmt(agg.byFundingSource.합계)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {agg.otherFundingCount > 0 && (
        <p className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          ⚠️ 자금원 미분류(기타) {agg.otherFundingCount}건 · {fmt(agg.otherFundingAmt)}원은 위 합계에서
          제외되어 있습니다. 지출내역관리에서 해당 거래의 계정(자금원)을 교정하세요.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        보전청구서(서식43)와 동일한 집계 기준입니다 — 이 숫자 그대로 서식이 만들어집니다.
      </p>
    </div>
  );
}
