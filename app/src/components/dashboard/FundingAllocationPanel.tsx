"use client";

import { Card, CardContent } from "@/components/ui/card";
import { HelpTooltip } from "@/components/help-tooltip";
import type { FundingAllocation } from "@/lib/accounting/funding-allocation";

const won = (n: number) => n.toLocaleString("ko-KR");

interface Props {
  allocation: FundingAllocation;
  loading?: boolean;
}

/**
 * 자금원별 충당 현황 패널 (후보자 전용).
 * org 전체 누적 기준으로 자금원별 수입·지출·가용잔액을 보여준다.
 * 가용잔액 음수(초과충당)는 경고 톤으로만 표시 — 입력 차단 없음.
 */
export function FundingAllocationPanel({ allocation, loading }: Props) {
  const { rows, totalIncome, totalExpense, totalAvailable } = allocation;

  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-muted-foreground">
            <HelpTooltip id="expense.funding-allocation">
              <span className="underline decoration-dotted underline-offset-2">
                자금원별 충당 현황
              </span>
            </HelpTooltip>
          </span>
          <span className="text-xs text-muted-foreground">전체 기준</span>
        </div>

        {rows.length === 0 ? (
          <div className="py-2 text-sm text-muted-foreground">표시할 자금원이 없습니다.</div>
        ) : (
          <div className="space-y-1.5">
            {/* 헤더 */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-24 shrink-0">자금원</span>
              <div className="flex-1" />
              <span className="w-28 shrink-0 text-right">수입</span>
              <span className="w-28 shrink-0 text-right">지출</span>
              <span className="w-32 shrink-0 text-right">가용잔액</span>
            </div>

            {rows.map((r) => (
              <div key={r.source} className="flex items-center gap-2 text-sm">
                <span className="w-24 shrink-0 truncate" title={r.source}>
                  {r.source}
                </span>
                <div className="relative h-2 flex-1 overflow-hidden rounded bg-muted">
                  <div
                    className="h-full bg-blue-500"
                    style={{ width: `${Math.round(r.incomeRatio * 100)}%` }}
                  />
                </div>
                <span className="w-28 shrink-0 text-right tabular-nums text-blue-600">
                  {loading ? "…" : `${won(r.income)}원`}
                </span>
                <span className="w-28 shrink-0 text-right tabular-nums text-red-600">
                  {loading ? "…" : `${won(r.expense)}원`}
                </span>
                <span
                  className={`w-32 shrink-0 text-right font-semibold tabular-nums ${
                    r.overspent ? "text-red-600" : "text-green-600"
                  }`}
                >
                  {loading ? "…" : `${won(r.available)}원${r.overspent ? " ⚠" : ""}`}
                </span>
              </div>
            ))}

            {/* 합계 */}
            <div className="flex items-center gap-2 border-t pt-2 text-sm font-semibold">
              <span className="w-24 shrink-0">합계</span>
              <div className="flex-1" />
              <span className="w-28 shrink-0 text-right tabular-nums text-blue-600">
                {won(totalIncome)}원
              </span>
              <span className="w-28 shrink-0 text-right tabular-nums text-red-600">
                {won(totalExpense)}원
              </span>
              <span
                className={`w-32 shrink-0 text-right tabular-nums ${
                  totalAvailable < 0 ? "text-red-600" : "text-green-600"
                }`}
              >
                {won(totalAvailable)}원
              </span>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          ※ 자금원별 가용잔액은 참고용 추정치입니다. 보전·확정 금액은 결산 기준으로 산정됩니다.
        </p>
      </CardContent>
    </Card>
  );
}
