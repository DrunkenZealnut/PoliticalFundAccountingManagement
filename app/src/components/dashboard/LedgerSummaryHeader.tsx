"use client";

import { Card, CardContent } from "@/components/ui/card";
import { HelpTooltip } from "@/components/help-tooltip";
import type { LedgerSummary, StatTone } from "@/lib/accounting/ledger-summary";

const won = (n: number) => n.toLocaleString("ko-KR");

const TONE_CLASS: Record<StatTone, string> = {
  income: "text-blue-600",
  expense: "text-red-600",
  balance: "text-green-600",
  neutral: "text-foreground",
  warn: "text-amber-600",
};

const BAR_CLASS: Record<StatTone, string> = {
  income: "bg-blue-500",
  expense: "bg-red-500",
  balance: "bg-green-500",
  neutral: "bg-slate-400",
  warn: "bg-amber-500",
};

interface Props {
  summary: LedgerSummary;
  /** 예: "현재 조회 14건" / "전체" — breakdown 기준 표기 */
  scopeLabel?: string;
  /** breakdown 막대 색상 톤 (수입=income, 지출=expense) */
  groupTone?: StatTone;
  loading?: boolean;
}

export function LedgerSummaryHeader({ summary, scopeLabel, groupTone = "neutral", loading }: Props) {
  return (
    <Card>
      <CardContent className="py-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-muted-foreground">현황 요약</span>
          {scopeLabel && <span className="text-xs text-muted-foreground">{scopeLabel}</span>}
        </div>

        {/* 주요 지표 */}
        <div className="flex flex-wrap gap-3">
          {summary.primary.map((s) => (
            <div key={s.key} className="min-w-[130px] flex-1 rounded-lg border bg-muted/30 px-3 py-2">
              <div className="text-xs text-muted-foreground">
                {s.helpId ? (
                  <HelpTooltip id={s.helpId}>
                    <span className="underline decoration-dotted underline-offset-2">{s.label}</span>
                  </HelpTooltip>
                ) : (
                  s.label
                )}
              </div>
              <div className={`text-lg font-bold tabular-nums ${TONE_CLASS[s.tone ?? "neutral"]}`}>
                {loading ? "…" : s.unit === "count" ? `${won(s.value)}건` : `${won(s.value)}원`}
              </div>
            </div>
          ))}
        </div>

        {/* 항목별 breakdown */}
        {summary.groups.map((g) =>
          g.rows.length === 0 ? null : (
            <div key={g.title} className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">{g.title}</div>
              <div className="space-y-1">
                {g.rows.map((row) => (
                  <div key={row.key} className="flex items-center gap-2 text-sm">
                    <span className="w-28 shrink-0 truncate" title={row.name}>{row.name}</span>
                    <div className="relative h-3 flex-1 overflow-hidden rounded bg-muted">
                      <div
                        className={`h-full ${BAR_CLASS[groupTone]}`}
                        style={{ width: `${Math.round(row.ratio * 100)}%` }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                      {Math.round(row.ratio * 100)}%
                    </span>
                    <span className="w-28 shrink-0 text-right font-medium tabular-nums">
                      {won(row.amount)}원
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ),
        )}
      </CardContent>
    </Card>
  );
}
