"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fmtTooltip = (v: any) => `${Number(v).toLocaleString("ko-KR")}원`;

const TITLE = "수입 출처 구성";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{TITLE}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function FundingSourceChart({ data, loading }: Props) {
  if (loading) {
    return (
      <Shell>
        <div className="h-[300px] flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </Shell>
    );
  }

  const positive = data.filter((d) => d.amount > 0);
  if (positive.length === 0) {
    return (
      <Shell>
        <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
          수입 내역이 없습니다
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
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
            contentStyle={{
              borderRadius: "8px",
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--popover))",
              color: "hsl(var(--popover-foreground))",
              fontSize: "13px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            }}
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
    </Shell>
  );
}
