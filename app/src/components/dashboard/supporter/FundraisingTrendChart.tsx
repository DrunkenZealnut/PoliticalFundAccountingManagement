"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fmtTooltip = (v: any) => `${Number(v).toLocaleString("ko-KR")}원`;

const TITLE = "월별 후원금 모금 추이";

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

export default function FundraisingTrendChart({ data, loading }: Props) {
  if (loading) {
    return (
      <Shell>
        <div className="h-[300px] flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </Shell>
    );
  }

  const hasData = data.some((d) => d.amount > 0);

  return (
    <Shell>
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
              contentStyle={{
                borderRadius: "8px",
                border: "1px solid hsl(var(--border))",
                background: "hsl(var(--popover))",
                color: "hsl(var(--popover-foreground))",
                fontSize: "13px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
              }}
            />
            <Bar dataKey="amount" name="모금액" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Shell>
  );
}
