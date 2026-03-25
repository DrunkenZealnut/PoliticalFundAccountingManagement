"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";

interface Transaction {
  accBookId: number;
  date: string;
  type: "수입" | "지출";
  content: string;
  amount: number;
  customerName: string;
}

interface RecentTransactionsProps {
  transactions: Transaction[];
  loading: boolean;
}

const fmt = (n: number) => n.toLocaleString("ko-KR");

export function RecentTransactions({ transactions, loading }: RecentTransactionsProps) {
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-muted-foreground">최근 거래 내역</CardTitle>
        <Link
          href="/dashboard/income-expense-book"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          전체 보기 <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="h-4 w-20 bg-muted rounded" />
                <div className="h-4 w-10 bg-muted rounded" />
                <div className="h-4 flex-1 bg-muted rounded" />
                <div className="h-4 w-24 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            거래 내역이 없습니다
          </div>
        ) : (
          <div className="space-y-1">
            {/* Header */}
            <div className="grid grid-cols-[80px_48px_1fr_100px_80px] gap-2 px-2 py-1.5 text-xs font-medium text-muted-foreground border-b">
              <span>날짜</span>
              <span>구분</span>
              <span>내용</span>
              <span className="text-right">금액</span>
              <span className="text-right">거래처</span>
            </div>
            {/* Rows */}
            {transactions.map((t) => (
              <div
                key={t.accBookId}
                className="grid grid-cols-[80px_48px_1fr_100px_80px] gap-2 px-2 py-2 text-sm rounded-md hover:bg-muted/50 transition-colors"
              >
                <span className="text-muted-foreground text-xs tabular-nums">{t.date}</span>
                <span>
                  <Badge
                    variant={t.type === "수입" ? "default" : "destructive"}
                    className="text-[10px] px-1.5 py-0 font-normal"
                  >
                    {t.type}
                  </Badge>
                </span>
                <span className="truncate">{t.content || "-"}</span>
                <span className={`text-right tabular-nums font-medium ${t.type === "수입" ? "text-blue-600" : "text-red-500"}`}>
                  {fmt(t.amount)}
                </span>
                <span className="text-right text-xs text-muted-foreground truncate">
                  {t.customerName || "-"}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
