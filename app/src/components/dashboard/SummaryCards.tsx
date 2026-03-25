"use client";

import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownRight, Users } from "lucide-react";

interface SummaryCardsProps {
  income: number;
  expense: number;
  balance: number;
  customerCount: number;
  prevMonthIncome: number;
  prevMonthExpense: number;
  loading: boolean;
}

function ChangeRate({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return null;
  const rate = Math.round(((current - previous) / previous) * 100);
  if (rate === 0) return <span className="text-xs text-muted-foreground">전월 동일</span>;

  return rate > 0 ? (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-600">
      <ArrowUpRight className="h-3 w-3" />
      {rate}%
    </span>
  ) : (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-rose-600">
      <ArrowDownRight className="h-3 w-3" />
      {Math.abs(rate)}%
    </span>
  );
}

const fmt = (n: number) => n.toLocaleString("ko-KR");

export function SummaryCards({
  income, expense, balance, customerCount,
  prevMonthIncome, prevMonthExpense, loading,
}: SummaryCardsProps) {
  const cards = [
    {
      title: "총 수입",
      value: income,
      icon: TrendingUp,
      color: "text-blue-600",
      bgColor: "bg-blue-50 dark:bg-blue-950/30",
      iconColor: "text-blue-500",
      change: { current: income, previous: prevMonthIncome },
      unit: "원",
    },
    {
      title: "총 지출",
      value: expense,
      icon: TrendingDown,
      color: "text-red-500",
      bgColor: "bg-red-50 dark:bg-red-950/30",
      iconColor: "text-red-500",
      change: { current: expense, previous: prevMonthExpense },
      unit: "원",
    },
    {
      title: "잔액",
      value: balance,
      icon: Wallet,
      color: balance >= 0 ? "text-emerald-600" : "text-rose-600",
      bgColor: "bg-emerald-50 dark:bg-emerald-950/30",
      iconColor: "text-emerald-500",
      unit: "원",
    },
    {
      title: "등록 거래처",
      value: customerCount,
      icon: Users,
      color: "text-foreground",
      bgColor: "bg-gray-50 dark:bg-gray-900/30",
      iconColor: "text-gray-500",
      unit: "건",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.title} className="relative overflow-hidden border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {card.title}
                </span>
                <div className={`rounded-lg p-2 ${card.bgColor}`}>
                  <Icon className={`h-4 w-4 ${card.iconColor}`} />
                </div>
              </div>
              <div className="space-y-1">
                <p className={`text-2xl font-bold tracking-tight ${card.color}`}>
                  {loading ? "..." : `${fmt(card.value)}${card.unit}`}
                </p>
                {card.change && !loading && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    전월 대비
                    <ChangeRate current={card.change.current} previous={card.change.previous} />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
