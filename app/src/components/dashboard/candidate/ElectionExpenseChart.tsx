"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  electionExpense: number;
  nonElectionExpense: number;
  loading: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fmtTooltip = (v: any) => `${Number(v).toLocaleString("ko-KR")}원`;

const TITLE = "선거비용 vs 선거비용외";

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

export default function ElectionExpenseChart({
  electionExpense,
  nonElectionExpense,
  loading,
}: Props) {
  if (loading) {
    return (
      <Shell>
        <div className="h-[300px] flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </Shell>
    );
  }

  const total = electionExpense + nonElectionExpense;
  if (total === 0) {
    return (
      <Shell>
        <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
          지출 내역이 없습니다
        </div>
      </Shell>
    );
  }

  const data = [
    {
      label: "선거비용",
      amount: electionExpense,
      ratio: Math.round((electionExpense / total) * 100),
      color: "#ef4444",
    },
    {
      label: "선거비용외",
      amount: nonElectionExpense,
      ratio: Math.round((nonElectionExpense / total) * 100),
      color: "#f59e0b",
    },
  ].filter((d) => d.amount > 0);

  return (
    <Shell>
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
