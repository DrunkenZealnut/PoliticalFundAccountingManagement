"use client";

import dynamic from "next/dynamic";
import { useAuth } from "@/stores/auth";
import { useDashboardData } from "@/lib/dashboard/use-dashboard-data";
import { SummaryCards } from "@/components/dashboard/SummaryCards";
import { RecentTransactions } from "@/components/dashboard/RecentTransactions";
import { ReceiptAlert } from "@/components/dashboard/ReceiptAlert";
import { QuickActions } from "@/components/dashboard/QuickActions";

const MonthlyTrendChart = dynamic(
  () => import("@/components/dashboard/MonthlyTrendChart"),
  { ssr: false }
);
const ExpenseCategoryChart = dynamic(
  () => import("@/components/dashboard/ExpenseCategoryChart"),
  { ssr: false }
);

const orgTypeLabel: Record<string, string> = {
  party: "정당",
  lawmaker: "국회의원/경선후보자",
  candidate: "(예비)후보자",
  supporter: "후원회",
};

export default function DashboardPage() {
  const { orgId, orgName, orgType } = useAuth();
  const { data, loading } = useDashboardData(orgId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">대시보드</h2>
          {orgName && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {orgName} · {orgType ? orgTypeLabel[orgType] : ""}
            </p>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <SummaryCards
        income={data?.summary.income ?? 0}
        expense={data?.summary.expense ?? 0}
        balance={data?.summary.balance ?? 0}
        customerCount={data?.summary.customerCount ?? 0}
        prevMonthIncome={data?.prevMonth.income ?? 0}
        prevMonthExpense={data?.prevMonth.expense ?? 0}
        loading={loading}
      />

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MonthlyTrendChart
          data={data?.monthlyTrend ?? []}
          loading={loading}
        />
        <ExpenseCategoryChart
          data={data?.expenseByCategory ?? []}
          loading={loading}
        />
      </div>

      {/* Receipt Alert */}
      {data && <ReceiptAlert count={data.missingReceipts} />}

      {/* Recent Transactions */}
      <RecentTransactions
        transactions={data?.recentTransactions ?? []}
        loading={loading}
      />

      {/* Quick Actions */}
      <QuickActions orgType={orgType} />
    </div>
  );
}
