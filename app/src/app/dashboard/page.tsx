"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  const { orgId, orgName, orgType } = useAuth();

  const [summary, setSummary] = useState({
    income: 0,
    expense: 0,
    balance: 0,
    incomeCount: 0,
    expenseCount: 0,
    customerCount: 0,
  });
  const [loading, setLoading] = useState(!!orgId);

  const orgTypeLabel: Record<string, string> = {
    party: "정당",
    lawmaker: "국회의원/경선후보자",
    candidate: "(예비)후보자",
    supporter: "후원회",
  };

  // Fetch data on mount - .then() keeps setState out of synchronous effect body
  useEffect(() => {
    if (!orgId) return;
    const supabase = createSupabaseBrowser();
    Promise.all([
      supabase.from("acc_book").select("incm_sec_cd, acc_amt").eq("org_id", orgId),
      supabase.from("customer").select("*", { count: "exact", head: true }),
    ]).then(([accRes, custRes]) => {
      const data = accRes.data || [];
      const incomeItems = data.filter((r) => r.incm_sec_cd === 1);
      const expenseItems = data.filter((r) => r.incm_sec_cd === 2);
      const income = incomeItems.reduce((s, r) => s + r.acc_amt, 0);
      const expense = expenseItems.reduce((s, r) => s + r.acc_amt, 0);
      setSummary({
        income,
        expense,
        balance: income - expense,
        incomeCount: incomeItems.length,
        expenseCount: expenseItems.length,
        customerCount: custRes.count || 0,
      });
      setLoading(false);
    });
  }, [orgId]);

  const fmt = (n: number) => n.toLocaleString("ko-KR");

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">대시보드</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-gray-500">사용기관</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">{orgName || "-"}</p>
            <p className="text-sm text-gray-400">
              {orgType ? orgTypeLabel[orgType] : "-"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-gray-500">수입액 합계</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold text-blue-600">
              {loading ? "..." : `${fmt(summary.income)}원`}
            </p>
            <p className="text-sm text-gray-400">
              {loading ? "" : `${summary.incomeCount}건`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-gray-500">지출액 합계</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold text-red-600">
              {loading ? "..." : `${fmt(summary.expense)}원`}
            </p>
            <p className="text-sm text-gray-400">
              {loading ? "" : `${summary.expenseCount}건`}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-gray-500">잔액</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">
              {loading ? "..." : `${fmt(summary.balance)}원`}
            </p>
            <p className="text-sm text-gray-400">수입 - 지출</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-gray-500">
              등록 수입지출처
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {loading ? "..." : `${summary.customerCount}건`}
            </p>
          </CardContent>
        </Card>
      </div>

      <p className="text-sm text-gray-400">
        좌측 메뉴에서 기능을 선택하여 사용하세요.
      </p>
    </div>
  );
}
