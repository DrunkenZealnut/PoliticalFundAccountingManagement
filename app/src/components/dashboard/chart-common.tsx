"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * 대시보드 차트 공통 요소 (candidate/supporter 차트 4종 공유).
 * 기존에 각 차트 파일이 동일하게 중복 정의하던 fmtTooltip·Shell을 단일 원천으로 통합.
 */

// recharts Tooltip formatter는 value 타입이 unknown 계열이라 any 허용
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const fmtTooltip = (v: any) => `${Number(v).toLocaleString("ko-KR")}원`;

/** recharts Tooltip 공통 스타일 */
export const TOOLTIP_CONTENT_STYLE: React.CSSProperties = {
  borderRadius: "8px",
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--popover))",
  color: "hsl(var(--popover-foreground))",
  fontSize: "13px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
};

/** 차트 카드 외곽(제목 + 본문) 공통 셸 */
export function ChartShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
