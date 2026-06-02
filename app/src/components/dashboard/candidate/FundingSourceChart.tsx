"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { ChartShell, fmtTooltip, TOOLTIP_CONTENT_STYLE } from "../chart-common";
import type { FundingSourceSlice } from "@/lib/dashboard/org-metrics";

interface Props {
  data: FundingSourceSlice[];
  loading: boolean;
}

/** 자금원별 고정 색상 (카드/차트 일관성) */
const SOURCE_COLOR: Record<string, string> = {
  보조금: "#3b82f6",
  후원회기부금: "#8b5cf6",
  후보자자산: "#10b981",
  보조금외: "#f59e0b",
  기타: "#6b7280",
};

const TITLE = "수입 출처 구성";

export default function FundingSourceChart({ data, loading }: Props) {
  if (loading) {
    return (
      <ChartShell title={TITLE}>
        <div className="h-[300px] flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </ChartShell>
    );
  }

  const positive = data.filter((d) => d.amount > 0);
  if (positive.length === 0) {
    return (
      <ChartShell title={TITLE}>
        <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
          수입 내역이 없습니다
        </div>
      </ChartShell>
    );
  }

  return (
    <ChartShell title={TITLE}>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={positive}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            dataKey="amount"
            nameKey="source"
            strokeWidth={0}
          >
            {positive.map((d) => (
              <Cell key={d.source} fill={SOURCE_COLOR[d.source] ?? "#6b7280"} />
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
