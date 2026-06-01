"use client";

import { Vote, Receipt, HandCoins, Wallet } from "lucide-react";
import { MetricCardGrid, type MetricCard } from "../MetricCardGrid";
import type { CandidateMetrics } from "@/lib/dashboard/org-metrics";

interface Props {
  metrics: CandidateMetrics;
  loading: boolean;
}

/** 후보자(candidate) 전용 요약 카드: 선거비용/선거비용외·보전예상액·잔액/집행률 */
export function CandidateSummaryCards({ metrics, loading }: Props) {
  const cards: MetricCard[] = [
    {
      title: "선거비용 지출",
      value: metrics.electionExpense,
      unit: "원",
      icon: Vote,
      color: "text-red-500",
      bgColor: "bg-red-50 dark:bg-red-950/30",
      iconColor: "text-red-500",
      sub: <span>보전 대상 선거비용</span>,
    },
    {
      title: "선거비용외 지출",
      value: metrics.nonElectionExpense,
      unit: "원",
      icon: Receipt,
      color: "text-amber-600",
      bgColor: "bg-amber-50 dark:bg-amber-950/30",
      iconColor: "text-amber-500",
      sub: <span>보전 비대상</span>,
    },
    {
      title: "보전 예상액",
      value: metrics.reimbursableEstimate,
      unit: "원",
      icon: HandCoins,
      color: "text-emerald-600",
      bgColor: "bg-emerald-50 dark:bg-emerald-950/30",
      iconColor: "text-emerald-500",
      sub: <span>보전 체크된 선거비용</span>,
    },
    {
      title: "잔액",
      value: metrics.balance,
      unit: "원",
      icon: Wallet,
      color: metrics.balance >= 0 ? "text-blue-600" : "text-rose-600",
      bgColor: "bg-blue-50 dark:bg-blue-950/30",
      iconColor: "text-blue-500",
      sub: <span>집행률 {metrics.executionRate}%</span>,
    },
  ];

  return <MetricCardGrid cards={cards} loading={loading} />;
}
