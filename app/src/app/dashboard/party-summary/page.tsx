"use client";

import { useState, useCallback } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { useCodeValues } from "@/hooks/use-code-values";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SummaryRow {
  acc_sec_cd: number;
  item_sec_cd: number;
  incm_sec_cd: number;
  total: number;
  count: number;
}

export default function PartySummaryPage() {
  const supabase = createSupabaseBrowser();
  const { orgId } = useAuth();
  const { getName, loading: codesLoading } = useCodeValues();

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [incomeRows, setIncomeRows] = useState<SummaryRow[]>([]);
  const [expenseRows, setExpenseRows] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setSearched(true);

    // 수입 집계
    let incQuery = supabase
      .from("acc_book")
      .select("acc_sec_cd, item_sec_cd, incm_sec_cd, acc_amt")
      .eq("org_id", orgId)
      .eq("incm_sec_cd", 1);

    if (dateFrom) incQuery = incQuery.gte("acc_date", dateFrom.replace(/-/g, ""));
    if (dateTo) incQuery = incQuery.lte("acc_date", dateTo.replace(/-/g, ""));

    const { data: incData } = await incQuery;

    // 지출 집계
    let expQuery = supabase
      .from("acc_book")
      .select("acc_sec_cd, item_sec_cd, incm_sec_cd, acc_amt")
      .eq("org_id", orgId)
      .eq("incm_sec_cd", 2);

    if (dateFrom) expQuery = expQuery.gte("acc_date", dateFrom.replace(/-/g, ""));
    if (dateTo) expQuery = expQuery.lte("acc_date", dateTo.replace(/-/g, ""));

    const { data: expData } = await expQuery;

    // 그룹별 합산
    function aggregate(
      data: { acc_sec_cd: number; item_sec_cd: number; incm_sec_cd: number; acc_amt: number }[] | null
    ): SummaryRow[] {
      if (!data) return [];
      const map = new Map<string, SummaryRow>();
      for (const r of data) {
        const key = `${r.acc_sec_cd}-${r.item_sec_cd}`;
        const existing = map.get(key);
        if (existing) {
          existing.total += r.acc_amt;
          existing.count += 1;
        } else {
          map.set(key, {
            acc_sec_cd: r.acc_sec_cd,
            item_sec_cd: r.item_sec_cd,
            incm_sec_cd: r.incm_sec_cd,
            total: r.acc_amt,
            count: 1,
          });
        }
      }
      return Array.from(map.values()).sort(
        (a, b) => a.acc_sec_cd - b.acc_sec_cd || a.item_sec_cd - b.item_sec_cd
      );
    }

    setIncomeRows(aggregate(incData));
    setExpenseRows(aggregate(expData));
    setLoading(false);
  }, [orgId, dateFrom, dateTo, supabase]);

  const fmt = (n: number) => n.toLocaleString("ko-KR");

  const incomeTotal = incomeRows.reduce((s, r) => s + r.total, 0);
  const expenseTotal = expenseRows.reduce((s, r) => s + r.total, 0);

  if (codesLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        코드 데이터 로딩 중...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">정당의 수입·지출 총괄표</h2>

      <div className="bg-white rounded-lg border p-4 space-y-4">
        <div className="flex gap-4 items-end">
          <div>
            <Label>기간 From</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div>
            <Label>To</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          <Button onClick={handleSearch} disabled={loading}>
            {loading ? "조회 중..." : "조회"}
          </Button>
        </div>

        {searched && (
          <>
            {/* 수입 총괄 */}
            <div>
              <h3 className="font-semibold text-lg mb-2">수입 총괄</h3>
              <div className="border rounded overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-blue-50">
                    <tr>
                      <th className="px-3 py-2 text-left">계정</th>
                      <th className="px-3 py-2 text-left">과목</th>
                      <th className="px-3 py-2 text-right">건수</th>
                      <th className="px-3 py-2 text-right">금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incomeRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-3 py-4 text-center text-gray-400"
                        >
                          수입내역이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      incomeRows.map((r) => (
                        <tr
                          key={`${r.acc_sec_cd}-${r.item_sec_cd}`}
                          className="border-b"
                        >
                          <td className="px-3 py-2">
                            {getName(r.acc_sec_cd)}
                          </td>
                          <td className="px-3 py-2">
                            {getName(r.item_sec_cd)}
                          </td>
                          <td className="px-3 py-2 text-right">{r.count}</td>
                          <td className="px-3 py-2 text-right font-mono">
                            {fmt(r.total)}
                          </td>
                        </tr>
                      ))
                    )}
                    <tr className="bg-blue-50 font-semibold">
                      <td className="px-3 py-2" colSpan={2}>
                        수입 합계
                      </td>
                      <td className="px-3 py-2 text-right">
                        {incomeRows.reduce((s, r) => s + r.count, 0)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {fmt(incomeTotal)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 지출 총괄 */}
            <div>
              <h3 className="font-semibold text-lg mb-2">지출 총괄</h3>
              <div className="border rounded overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-red-50">
                    <tr>
                      <th className="px-3 py-2 text-left">계정</th>
                      <th className="px-3 py-2 text-left">과목</th>
                      <th className="px-3 py-2 text-right">건수</th>
                      <th className="px-3 py-2 text-right">금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenseRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-3 py-4 text-center text-gray-400"
                        >
                          지출내역이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      expenseRows.map((r) => (
                        <tr
                          key={`${r.acc_sec_cd}-${r.item_sec_cd}`}
                          className="border-b"
                        >
                          <td className="px-3 py-2">
                            {getName(r.acc_sec_cd)}
                          </td>
                          <td className="px-3 py-2">
                            {getName(r.item_sec_cd)}
                          </td>
                          <td className="px-3 py-2 text-right">{r.count}</td>
                          <td className="px-3 py-2 text-right font-mono">
                            {fmt(r.total)}
                          </td>
                        </tr>
                      ))
                    )}
                    <tr className="bg-red-50 font-semibold">
                      <td className="px-3 py-2" colSpan={2}>
                        지출 합계
                      </td>
                      <td className="px-3 py-2 text-right">
                        {expenseRows.reduce((s, r) => s + r.count, 0)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {fmt(expenseTotal)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 잔액 요약 */}
            <div className="bg-gray-50 rounded p-4 flex gap-8 text-sm">
              <span>
                수입 합계:{" "}
                <b className="text-blue-600">{fmt(incomeTotal)}원</b>
              </span>
              <span>
                지출 합계:{" "}
                <b className="text-red-600">{fmt(expenseTotal)}원</b>
              </span>
              <span>
                잔액:{" "}
                <b className="text-green-600">
                  {fmt(incomeTotal - expenseTotal)}원
                </b>
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
