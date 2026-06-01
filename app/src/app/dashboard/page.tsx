"use client";

import dynamic from "next/dynamic";
import { useAuth } from "@/stores/auth";
import { useDashboardData } from "@/lib/dashboard/use-dashboard-data";
import { SummaryCards } from "@/components/dashboard/SummaryCards";
import { CandidateSummaryCards } from "@/components/dashboard/candidate/CandidateSummaryCards";
import { SupporterSummaryCards } from "@/components/dashboard/supporter/SupporterSummaryCards";
import { RecentTransactions } from "@/components/dashboard/RecentTransactions";
import { ReceiptAlert } from "@/components/dashboard/ReceiptAlert";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { WorkflowProgress } from "@/components/workflow-progress";

const MonthlyTrendChart = dynamic(
  () => import("@/components/dashboard/MonthlyTrendChart"),
  { ssr: false }
);
const ExpenseCategoryChart = dynamic(
  () => import("@/components/dashboard/ExpenseCategoryChart"),
  { ssr: false }
);
// 후보자 전용 차트
const FundingSourceChart = dynamic(
  () => import("@/components/dashboard/candidate/FundingSourceChart"),
  { ssr: false }
);
const ElectionExpenseChart = dynamic(
  () => import("@/components/dashboard/candidate/ElectionExpenseChart"),
  { ssr: false }
);
// 후원회 전용 차트
const FundraisingTrendChart = dynamic(
  () => import("@/components/dashboard/supporter/FundraisingTrendChart"),
  { ssr: false }
);
const GrantStatusChart = dynamic(
  () => import("@/components/dashboard/supporter/GrantStatusChart"),
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

  // 조직 유형별 요약 카드 분기 (candidate/supporter 전용, 그 외 공통)
  const renderSummary = () => {
    if (orgType === "candidate" && data) {
      return <CandidateSummaryCards metrics={data.candidate} loading={loading} />;
    }
    if (orgType === "supporter" && data) {
      return <SupporterSummaryCards metrics={data.supporter} loading={loading} />;
    }
    return (
      <SummaryCards
        income={data?.summary.income ?? 0}
        expense={data?.summary.expense ?? 0}
        balance={data?.summary.balance ?? 0}
        customerCount={data?.summary.customerCount ?? 0}
        prevMonthIncome={data?.prevMonth.income ?? 0}
        prevMonthExpense={data?.prevMonth.expense ?? 0}
        loading={loading}
      />
    );
  };

  // 조직 유형별 메인 차트 2종 분기
  const renderCharts = () => {
    if (orgType === "candidate") {
      return (
        <>
          <FundingSourceChart data={data?.candidate.fundingSources ?? []} loading={loading} />
          <ElectionExpenseChart
            electionExpense={data?.candidate.electionExpense ?? 0}
            nonElectionExpense={data?.candidate.nonElectionExpense ?? 0}
            loading={loading}
          />
        </>
      );
    }
    if (orgType === "supporter") {
      return (
        <>
          <FundraisingTrendChart data={data?.supporter.monthlyRaised ?? []} loading={loading} />
          {data && <GrantStatusChart metrics={data.supporter} loading={loading} />}
        </>
      );
    }
    return (
      <>
        <MonthlyTrendChart data={data?.monthlyTrend ?? []} loading={loading} />
        <ExpenseCategoryChart data={data?.expenseByCategory ?? []} loading={loading} />
      </>
    );
  };

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

      {/* Workflow Progress (초보자 모드) */}
      <WorkflowProgress />

      {/* Summary Cards (조직 유형별) */}
      {renderSummary()}

      {/* Charts (조직 유형별) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">{renderCharts()}</div>

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
