"use client";

import { useState, useCallback } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { useSort, SortTh } from "@/hooks/use-sort";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DuesRecord {
  acc_book_id: number;
  acc_date: string;
  acc_amt: number;
  content: string;
  rcp_no: string | null;
  customer: Record<string, unknown> | Record<string, unknown>[] | null;
}

export default function ReceiptPage() {
  const supabase = createSupabaseBrowser();
  const { orgId } = useAuth();

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchName, setSearchName] = useState("");
  const [records, setRecords] = useState<DuesRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Supabase join can return object or array
  function getCust(c: DuesRecord["customer"]): { name?: string; reg_num?: string; addr?: string } | null {
    if (!c) return null;
    if (Array.isArray(c)) return (c[0] as { name?: string; reg_num?: string; addr?: string }) || null;
    return c as { name?: string; reg_num?: string; addr?: string };
  }

  const handleSearch = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setSearched(true);

    // 당비 과목 (item_sec_cd = 8) 수입내역 조회
    let query = supabase
      .from("acc_book")
      .select("acc_book_id, acc_date, acc_amt, content, rcp_no, customer:cust_id(name, reg_num, addr)")
      .eq("org_id", orgId)
      .eq("incm_sec_cd", 1)
      .eq("item_sec_cd", 8)
      .order("acc_date");

    if (dateFrom) query = query.gte("acc_date", dateFrom.replace(/-/g, ""));
    if (dateTo) query = query.lte("acc_date", dateTo.replace(/-/g, ""));

    const { data } = await query;

    let results = (data || []) as unknown as DuesRecord[];

    // 이름 필터 (클라이언트 사이드)
    if (searchName.trim()) {
      results = results.filter((r) => {
        const cust = getCust(r.customer);
        return cust?.name?.includes(searchName);
      });
    }

    setRecords(results);
    setSelectedIds(new Set());
    setLoading(false);
  }, [orgId, dateFrom, dateTo, searchName, supabase]);

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selectedIds.size === records.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(records.map((r) => r.acc_book_id)));
    }
  }

  async function handlePrint() {
    if (selectedIds.size === 0) {
      alert("영수증을 출력할 건을 선택하세요.");
      return;
    }

    const selected = records.filter((r) => selectedIds.has(r.acc_book_id));
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("당비영수증");

    ws.mergeCells("A1:F1");
    const title = ws.getCell("A1");
    title.value = "당 비 영 수 증";
    title.font = { bold: true, size: 14 };
    title.alignment = { horizontal: "center" };

    const headers = ["번호", "납입일자", "납입자", "생년월일/사업자번호", "납입금액", "영수증번호"];
    const hRow = ws.getRow(3);
    headers.forEach((h, i) => { hRow.getCell(i + 1).value = h; hRow.getCell(i + 1).font = { bold: true }; });

    let total = 0;
    selected.forEach((r, idx) => {
      const cust = getCust(r.customer);
      const row = ws.getRow(4 + idx);
      row.getCell(1).value = idx + 1;
      row.getCell(2).value = fmtDate(r.acc_date);
      row.getCell(3).value = cust?.name || "";
      row.getCell(4).value = cust?.reg_num || "";
      row.getCell(5).value = r.acc_amt;
      row.getCell(5).numFmt = "#,##0";
      row.getCell(6).value = r.rcp_no || "";
      total += r.acc_amt;
    });

    const totalRow = ws.getRow(4 + selected.length);
    totalRow.getCell(1).value = "합계";
    totalRow.getCell(1).font = { bold: true };
    totalRow.getCell(5).value = total;
    totalRow.getCell(5).numFmt = "#,##0";
    totalRow.getCell(5).font = { bold: true };

    [8, 14, 14, 18, 16, 14].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `당비영수증_${selected.length}건.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const { sorted, sort, toggle } = useSort(records);

  const fmt = (n: number) => n.toLocaleString("ko-KR");
  const fmtDate = (d: string) =>
    d.length === 8
      ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
      : d;

  const totalAmount = records.reduce((s, r) => s + r.acc_amt, 0);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">당비영수증 출력</h2>
      <div className="bg-white rounded-lg border p-4 space-y-4">
        <div className="flex gap-4 items-end flex-wrap">
          <div>
            <Label>납입기간 From</Label>
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
            <Label>납입자</Label>
            <Input
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              placeholder="이름 검색"
            />
          </div>
          <Button onClick={handleSearch} disabled={loading}>
            {loading ? "조회 중..." : "조회"}
          </Button>
          <Button variant="outline" onClick={handlePrint} disabled={selectedIds.size === 0}>
            엑셀 출력 ({selectedIds.size}건)
          </Button>
        </div>

        {searched && (
          <>
            <div className="text-sm text-gray-500">
              당비(과목코드 8) 수입내역 중 조건에 맞는 건: {records.length}건 /
              합계: {fmt(totalAmount)}원
            </div>

            <div className="border rounded overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-center w-10">
                      <input
                        type="checkbox"
                        checked={
                          records.length > 0 &&
                          selectedIds.size === records.length
                        }
                        onChange={selectAll}
                      />
                    </th>
                    <th className="px-3 py-2 text-left">번호</th>
                    <SortTh label="납입일자" sortKey="acc_date" current={sort} onToggle={toggle} className="text-left" />
                    <SortTh label="납입자" sortKey="cust_id" current={sort} onToggle={toggle} className="text-left" />
                    <SortTh label="생년월일/사업자번호" sortKey="cust_id" current={sort} onToggle={toggle} className="text-left" />
                    <SortTh label="납입금액" sortKey="acc_amt" current={sort} onToggle={toggle} className="text-right" />
                    <SortTh label="영수증번호" sortKey="rcp_no" current={sort} onToggle={toggle} className="text-left" />
                  </tr>
                </thead>
                <tbody>
                  {records.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-3 py-8 text-center text-gray-400"
                      >
                        해당 기간의 당비 수입내역이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    sorted.map((r, i) => (
                      <tr
                        key={r.acc_book_id}
                        className="border-b hover:bg-gray-50"
                      >
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(r.acc_book_id)}
                            onChange={() => toggleSelect(r.acc_book_id)}
                          />
                        </td>
                        <td className="px-3 py-2">{i + 1}</td>
                        <td className="px-3 py-2">{fmtDate(r.acc_date)}</td>
                        <td className="px-3 py-2 font-medium">
                          {getCust(r.customer)?.name || "-"}
                        </td>
                        <td className="px-3 py-2">
                          {getCust(r.customer)?.reg_num || "-"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {fmt(r.acc_amt)}
                        </td>
                        <td className="px-3 py-2">{r.rcp_no || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
