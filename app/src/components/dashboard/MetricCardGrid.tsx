"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export interface MetricCard {
  title: string;
  value: number;
  unit: string;
  icon: LucideIcon;
  color: string; // value 텍스트 색
  bgColor: string; // 아이콘 배경
  iconColor: string; // 아이콘 색
  /** 값 아래 보조 표시 (변화율, 비율 등) */
  sub?: ReactNode;
}

const fmt = (n: number) => n.toLocaleString("ko-KR");

interface MetricCardGridProps {
  cards: MetricCard[];
  loading: boolean;
}

/**
 * 대시보드 요약 카드 그리드 (조직 유형별 공통 렌더러).
 * 기존 SummaryCards 의 시각 패턴(border-0 shadow-sm, 아이콘 배지)을 일반화.
 */
export function MetricCardGrid({ cards, loading }: MetricCardGridProps) {
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
                {card.sub && !loading && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    {card.sub}
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
