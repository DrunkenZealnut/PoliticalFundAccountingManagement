"use client";

import { HandCoins, Users, Send, Wallet } from "lucide-react";
import { MetricCardGrid, type MetricCard } from "../MetricCardGrid";
import type { SupporterMetrics } from "@/lib/dashboard/org-metrics";

interface Props {
  metrics: SupporterMetrics;
  loading: boolean;
}

/** 후원회(supporter) 전용 요약 카드: 모금총액·기부자수·후보자지급·잔여모금액 */
export function SupporterSummaryCards({ metrics, loading }: Props) {
  const cards: MetricCard[] = [
    {
      title: "후원금 모금 총액",
      value: metrics.totalRaised,
      unit: "원",
      icon: HandCoins,
      color: "text-blue-600",
      bgColor: "bg-blue-50 dark:bg-blue-950/30",
      iconColor: "text-blue-500",
      sub: <span>누적 모금액</span>,
    },
    {
      title: "기부자 수",
      value: metrics.donorCount,
      unit: "명",
      icon: Users,
      color: "text-violet-600",
      bgColor: "bg-violet-50 dark:bg-violet-950/30",
      iconColor: "text-violet-500",
      sub: (
        <span>
          신규 {metrics.newDonorCount}명(당월)
          {metrics.anonymousDonor ? " · 익명 포함" : ""}
        </span>
      ),
    },
    {
      title: "후보자 기부금 지급",
      value: metrics.candidateGrantTotal,
      unit: "원",
      icon: Send,
      color: "text-amber-600",
      bgColor: "bg-amber-50 dark:bg-amber-950/30",
      iconColor: "text-amber-500",
      sub: <span>후원회 → 후보자</span>,
    },
    {
      title: "잔여 모금액",
      value: metrics.remainingFund,
      unit: "원",
      icon: Wallet,
      color: metrics.remainingFund >= 0 ? "text-emerald-600" : "text-rose-600",
      bgColor: "bg-emerald-50 dark:bg-emerald-950/30",
      iconColor: "text-emerald-500",
      sub: <span>모금 − 지출</span>,
    },
  ];

  return <MetricCardGrid cards={cards} loading={loading} />;
}
