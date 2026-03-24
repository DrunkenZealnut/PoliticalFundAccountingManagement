"use client";

import { useState, useCallback } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { useCodeValues } from "@/hooks/use-code-values";
import { useSort, SortTh } from "@/hooks/use-sort";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SupportRecord {
  acc_book_id: number;
  acc_date: string;
  acc_sec_cd: number;
  item_sec_cd: number;
  content: string;
  acc_amt: number;
  rcp_no: string | null;
  customer: Record<string, unknown> | Record<string, unknown>[] | null;
}

export default function SupportDetailPage() {
  const supabase = createSupabaseBrowser();
  const { orgId } = useAuth();
  const { getName, loading: codesLoading } = useCodeValues();

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [docNum, setDocNum] = useState("");
  const [records, setRecords] = useState<SupportRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setSearched(true);

    const from = dateFrom.replace(/-/g, "");
    const to = dateTo.replace(/-/g, "");

    // 지원금(경비구분 42) 지출내역 조회
    let query = supabase
      .from("acc_book")
      .select(
        "acc_book_id, acc_date, acc_sec_cd, item_sec_cd, content, acc_amt, rcp_no, customer:cust_id(name)"
      )
      .eq("org_id", orgId)
      .eq("incm_sec_cd", 2)
      .eq("exp_sec_cd", 42)
      .order("acc_date");

    if (from) query = query.gte("acc_date", from);
    if (to) query = query.lte("acc_date", to);

    const { data } = await query;
    setRecords((data || []) as unknown as SupportRecord[]);
    setLoading(false);
  }, [orgId, dateFrom, dateTo, supabase]);

  function getCustName(c: SupportRecord["customer"]): string {
    if (!c) return "-";
    const obj = Array.isArray(c) ? c[0] : c;
    return (obj as { name?: string })?.name || "-";
  }

  const { sorted, sort, toggle } = useSort(records);

  const fmt = (n: number) => n.toLocaleString("ko-KR");
  const fmtDate = (d: string) =>
    d.length === 8
      ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
      : d;
  const totalAmount = records.reduce((s, r) => s + r.acc_amt, 0);

  if (codesLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        코드 데이터 로딩 중...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">지원금내역</h2>

      <div className="bg-white rounded-lg border p-4 space-y-4">
        <div className="flex gap-4 items-end flex-wrap">
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
          <div>
            <Label>문서번호</Label>
            <Input
              value={docNum}
              onChange={(e) => setDocNum(e.target.value)}
              placeholder="출력에만 반영"
            />
          </div>
          <Button onClick={handleSearch} disabled={loading}>
            {loading ? "조회 중..." : "조회"}
          </Button>
        </div>
      </div>

      {searched && (
        <div className="bg-white rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-2 text-left">번호</th>
                <SortTh label="지출일자" sortKey="acc_date" current={sort} onToggle={toggle} className="text-left" />
                <SortTh label="계정" sortKey="acc_sec_cd" current={sort} onToggle={toggle} className="text-left" />
                <SortTh label="과목" sortKey="item_sec_cd" current={sort} onToggle={toggle} className="text-left" />
                <SortTh label="지출대상자" sortKey="cust_id" current={sort} onToggle={toggle} className="text-left" />
                <SortTh label="내역" sortKey="content" current={sort} onToggle={toggle} className="text-left" />
                <SortTh label="금액" sortKey="acc_amt" current={sort} onToggle={toggle} className="text-right" />
                <SortTh label="증빙번호" sortKey="rcp_no" current={sort} onToggle={toggle} className="text-left" />
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-8 text-center text-gray-400"
                  >
                    {loading
                      ? "로딩 중..."
                      : "지원금 지출내역이 없습니다."}
                  </td>
                </tr>
              ) : (
                <>
                  {sorted.map((r, i) => (
                    <tr key={r.acc_book_id} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2">{i + 1}</td>
                      <td className="px-3 py-2">{fmtDate(r.acc_date)}</td>
                      <td className="px-3 py-2">{getName(r.acc_sec_cd)}</td>
                      <td className="px-3 py-2">{getName(r.item_sec_cd)}</td>
                      <td className="px-3 py-2">
                        {getCustName(r.customer)}
                      </td>
                      <td className="px-3 py-2">{r.content}</td>
                      <td className="px-3 py-2 text-right font-mono">
                        {fmt(r.acc_amt)}
                      </td>
                      <td className="px-3 py-2">{r.rcp_no || "-"}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold border-t">
                    <td className="px-3 py-2" colSpan={6}>
                      합계 ({records.length}건)
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {fmt(totalAmount)}
                    </td>
                    <td className="px-3 py-2" />
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
