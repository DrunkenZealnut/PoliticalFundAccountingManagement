"use client";

import { useEffect, useState, useCallback } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

interface MonthlyData {
  month: string;
  income: number;
  expense: number;
}

interface CategoryData {
  itemSecCd: number;
  label: string;
  amount: number;
  ratio: number;
}

interface Transaction {
  accBookId: number;
  date: string;
  type: "수입" | "지출";
  content: string;
  amount: number;
  customerName: string;
}

export interface DashboardData {
  summary: {
    income: number;
    expense: number;
    balance: number;
    incomeCount: number;
    expenseCount: number;
    customerCount: number;
  };
  prevMonth: {
    income: number;
    expense: number;
  };
  monthlyTrend: MonthlyData[];
  expenseByCategory: CategoryData[];
  recentTransactions: Transaction[];
  missingReceipts: number;
}

interface AccBookRow {
  acc_book_id: number;
  incm_sec_cd: number;
  acc_date: string;
  acc_amt: number;
  item_sec_cd: number;
  content: string;
  rcp_yn: string | null;
  cust_id: number | null;
  customer: { name: string }[] | null;
}

interface CodeValue {
  cv_id: number;
  cs_id: number;
  cv_name: string;
  cv_order: number;
}

function formatAccDate(accDate: string): string {
  return `${accDate.slice(0, 4)}-${accDate.slice(4, 6)}-${accDate.slice(6)}`;
}

function getMonthKey(accDate: string): string {
  return accDate.slice(0, 6); // YYYYMM
}

function getMonthLabel(ym: string): string {
  return `${parseInt(ym.slice(4))}월`;
}

function processData(records: AccBookRow[], codes: CodeValue[]): DashboardData {
  const now = new Date();
  const currentYM = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prevYM = now.getMonth() === 0
    ? `${now.getFullYear() - 1}12`
    : `${now.getFullYear()}${String(now.getMonth()).padStart(2, "0")}`;

  // Summary
  const incomeItems = records.filter((r) => r.incm_sec_cd === 1);
  const expenseItems = records.filter((r) => r.incm_sec_cd === 2);
  const income = incomeItems.reduce((s, r) => s + r.acc_amt, 0);
  const expense = expenseItems.reduce((s, r) => s + r.acc_amt, 0);

  // Previous month
  const prevMonthIncome = incomeItems
    .filter((r) => getMonthKey(r.acc_date) === prevYM)
    .reduce((s, r) => s + r.acc_amt, 0);
  const prevMonthExpense = expenseItems
    .filter((r) => getMonthKey(r.acc_date) === prevYM)
    .reduce((s, r) => s + r.acc_amt, 0);

  // Monthly trend (last 6 months)
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const monthlyTrend: MonthlyData[] = months.map((ym) => {
    const monthIncome = records
      .filter((r) => r.incm_sec_cd === 1 && getMonthKey(r.acc_date) === ym)
      .reduce((s, r) => s + r.acc_amt, 0);
    const monthExpense = records
      .filter((r) => r.incm_sec_cd === 2 && getMonthKey(r.acc_date) === ym)
      .reduce((s, r) => s + r.acc_amt, 0);
    return { month: getMonthLabel(ym), income: monthIncome, expense: monthExpense };
  });

  // Expense by category (item_sec_cd for expense)
  const expenseCodeMap = new Map<number, string>();
  // cs_id = 5 → 지출 항목 코드 (item_sec_cd for expense)
  codes.filter((c) => c.cs_id === 5).forEach((c) => expenseCodeMap.set(c.cv_id, c.cv_name));

  const categoryMap = new Map<number, number>();
  expenseItems.forEach((r) => {
    categoryMap.set(r.item_sec_cd, (categoryMap.get(r.item_sec_cd) || 0) + r.acc_amt);
  });

  const totalExpense = expense || 1;
  const expenseByCategory: CategoryData[] = Array.from(categoryMap.entries())
    .map(([code, amount]) => ({
      itemSecCd: code,
      label: expenseCodeMap.get(code) || codes.find((c) => c.cv_id === code)?.cv_name || `항목${code}`,
      amount,
      ratio: Math.round((amount / totalExpense) * 100),
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 7);

  // Recent transactions (last 10)
  const sorted = [...records].sort((a, b) => b.acc_date.localeCompare(a.acc_date));
  const recentTransactions: Transaction[] = sorted.slice(0, 10).map((r) => ({
    accBookId: r.acc_book_id,
    date: formatAccDate(r.acc_date),
    type: r.incm_sec_cd === 1 ? "수입" : "지출",
    content: r.content || "",
    amount: r.acc_amt,
    customerName: r.customer?.[0]?.name || "",
  }));

  // Missing receipts (expense only)
  const missingReceipts = expenseItems.filter(
    (r) => r.rcp_yn !== "Y" && r.rcp_yn !== "y"
  ).length;

  return {
    summary: {
      income,
      expense,
      balance: income - expense,
      incomeCount: incomeItems.length,
      expenseCount: expenseItems.length,
      customerCount: 0, // filled separately
    },
    prevMonth: { income: prevMonthIncome, expense: prevMonthExpense },
    monthlyTrend,
    expenseByCategory,
    recentTransactions,
    missingReceipts,
  };
}

export function useDashboardData(orgId: number | null) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);

    try {
      const supabase = createSupabaseBrowser();

      const [accRes, codesRes] = await Promise.all([
        supabase
          .from("acc_book")
          .select("acc_book_id, incm_sec_cd, acc_date, acc_amt, item_sec_cd, content, rcp_yn, cust_id, customer:cust_id(name)")
          .eq("org_id", orgId)
          .order("acc_date", { ascending: false }),
        fetch("/api/codes").then((r) => r.json()),
      ]);

      if (accRes.error) throw new Error(accRes.error.message);

      const records = (accRes.data || []) as AccBookRow[];
      const codes = (codesRes.codeValues || []) as CodeValue[];
      const result = processData(records, codes);
      // 해당 기관에서 사용 중인 고유 거래처 수
      const uniqueCustIds = new Set(records.map((r) => r.cust_id).filter(Boolean));
      result.summary.customerCount = uniqueCustIds.size;

      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "데이터 로딩 실패");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
