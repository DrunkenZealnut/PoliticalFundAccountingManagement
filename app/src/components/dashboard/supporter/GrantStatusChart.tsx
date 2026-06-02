"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { ChartShell, fmtTooltip, TOOLTIP_CONTENT_STYLE } from "../chart-common";
import type { SupporterMetrics } from "@/lib/dashboard/org-metrics";

interface Props {
  metrics: SupporterMetrics;
  loading: boolean;
}

const TITLE = "후보자 기부금 지급 현황";

export default function GrantStatusChart({ metrics, loading }: Props) {
  if (loading) {
    return (
      <ChartShell title={TITLE}>
        <div className="h-[300px] flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </ChartShell>
    );
  }

  const otherExpense = Math.max(metrics.totalExpense - metrics.candidateGrantTotal, 0);
  const remaining = Math.max(metrics.remainingFund, 0);
  const total = metrics.candidateGrantTotal + otherExpense + remaining;

  if (total === 0) {
    return (
      <ChartShell title={TITLE}>
        <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
          모금/지출 내역이 없습니다
        </div>
      </ChartShell>
    );
  }

  const data = [
    { label: "후보자 지급", amount: metrics.candidateGrantTotal, color: "#f59e0b" },
    { label: "기타 지출", amount: otherExpense, color: "#ef4444" },
    { label: "잔여 모금액", amount: remaining, color: "#10b981" },
  ]
    .map((d) => ({ ...d, ratio: Math.round((d.amount / total) * 100) }))
    .filter((d) => d.amount > 0);

  return (
    <ChartShell title={TITLE}>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            dataKey="amount"
            nameKey="label"
            strokeWidth={0}
          >
            {data.map((d) => (
              <Cell key={d.label} fill={d.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={fmtTooltip}
            contentStyle={TOOLTIP_CONTENT_STYLE}
          />
          <Legend
            layout="vertical"
            align="right"
            verticalAlign="middle"
            iconType="circle"
            iconSize={8}
            formatter={(value: string, entry: { payload?: { ratio?: number } }) => (
              <span className="text-xs text-foreground">
                {value} <span className="text-muted-foreground">{entry.payload?.ratio ?? 0}%</span>
              </span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}
