"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { ChartShell, fmtTooltip, TOOLTIP_CONTENT_STYLE } from "../chart-common";
import type { MonthlyAmount } from "@/lib/dashboard/org-metrics";

interface Props {
  data: MonthlyAmount[];
  loading: boolean;
}

const fmtAxis = (v: number) => {
  if (v >= 10_000_000) return `${Math.round(v / 10_000_000)}천만`;
  if (v >= 10_000) return `${Math.round(v / 10_000)}만`;
  return v.toLocaleString();
};

const TITLE = "월별 후원금 모금 추이";

export default function FundraisingTrendChart({ data, loading }: Props) {
  if (loading) {
    return (
      <ChartShell title={TITLE}>
        <div className="h-[300px] flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </ChartShell>
    );
  }

  const hasData = data.some((d) => d.amount > 0);

  return (
    <ChartShell title={TITLE}>
      {!hasData ? (
        <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
          모금 내역이 없습니다
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 12 }}
              className="text-muted-foreground"
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={fmtAxis}
              tick={{ fontSize: 11 }}
              className="text-muted-foreground"
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={fmtTooltip}
              contentStyle={TOOLTIP_CONTENT_STYLE}
            />
            <Bar dataKey="amount" name="모금액" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartShell>
  );
}
