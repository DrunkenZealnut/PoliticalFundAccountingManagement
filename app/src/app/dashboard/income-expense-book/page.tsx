"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { useCodeValues } from "@/hooks/use-code-values";
import { useSort, SortTh } from "@/hooks/use-sort";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CodeSelect } from "@/components/code-select";

interface BookRow {
  acc_book_id: number;
  incm_sec_cd: number;
  acc_sec_cd: number;
  item_sec_cd: number;
  acc_date: string;
  content: string;
  acc_amt: number;
  rcp_yn: string;
  rcp_no: string | null;
  bigo: string | null;
  customer: Record<string, unknown> | Record<string, unknown>[] | null;
}

export default function IncomeExpenseBookPage() {
  const { orgId, orgSecCd } = useAuth();
  const { loading: codesLoading, getName, getAccounts, getItems } = useCodeValues();

  const [accSecCd, setAccSecCd] = useState(0);
  const [itemSecCd, setItemSecCd] = useState(0);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [records, setRecords] = useState<BookRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Combine income+expense account options
  const incAccounts = orgSecCd ? getAccounts(orgSecCd, 1) : [];
  const expAccounts = orgSecCd ? getAccounts(orgSecCd, 2) : [];
  const allAccounts = [...new Map([...incAccounts, ...expAccounts].map((a) => [a.cv_id, a])).values()];
  const incItems = orgSecCd && accSecCd ? getItems(orgSecCd, 1, accSecCd) : [];
  const expItems = orgSecCd && accSecCd ? getItems(orgSecCd, 2, accSecCd) : [];
  const allItems = [...new Map([...incItems, ...expItems].map((a) => [a.cv_id, a])).values()];

  const fmt = (n: number) => n.toLocaleString("ko-KR");
  const fmtDate = (d: string) =>
    d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d;

  function getCustName(c: BookRow["customer"]): string {
    if (!c) return "-";
    const obj = Array.isArray(c) ? c[0] : c;
    return (obj as { name?: string })?.name || "-";
  }

  async function handleQuery() {
    if (!orgId) return;
    if (!dateFrom || !dateTo) { alert("기간을 입력하세요."); return; }
    setLoading(true);

    const fromStr = dateFrom.replace(/-/g, "");
    const toStr = dateTo.replace(/-/g, "");
    const supabase = createSupabaseBrowser();

    let query = supabase
      .from("acc_book")
      .select("acc_book_id, incm_sec_cd, acc_sec_cd, item_sec_cd, acc_date, content, acc_amt, rcp_yn, rcp_no, bigo, customer:cust_id(name)")
      .eq("org_id", orgId)
      .gte("acc_date", fromStr)
      .lte("acc_date", toStr)
      .order("acc_date", { ascending: true })
      .order("acc_sort_num", { ascending: true });

    if (accSecCd) query = query.eq("acc_sec_cd", accSecCd);
    if (itemSecCd) query = query.eq("item_sec_cd", itemSecCd);

    const { data } = await query;
    setRecords((data || []) as unknown as BookRow[]);
    setLoading(false);
  }

  async function handleExcel() {
    if (records.length === 0) { alert("조회된 데이터가 없습니다."); return; }

    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("수입지출부");

    ws.mergeCells("A1:N1");
    const title = ws.getCell("A1");
    title.value = "정 치 자 금  수 입 · 지 출 부";
    title.font = { bold: true, size: 14 };
    title.alignment = { horizontal: "center" };

    if (accSecCd || itemSecCd) {
      ws.getCell("A3").value = `계정: ${accSecCd ? getName(accSecCd) : "전체"} / 과목: ${itemSecCd ? getName(itemSecCd) : "전체"}`;
    }

    const headers = ["년월일", "내역", "수입금회", "수입누계", "지출금회", "지출누계", "잔액",
      "성명", "생년월일", "주소", "직업", "전화번호", "영수증번호", "비고"];
    const hRow = ws.getRow(5);
    headers.forEach((h, i) => { hRow.getCell(i + 1).value = h; hRow.getCell(i + 1).font = { bold: true }; });

    let incCum = 0;
    let expCum = 0;
    records.forEach((r, idx) => {
      const isIncome = r.incm_sec_cd === 1;
      if (isIncome) incCum += r.acc_amt; else expCum += r.acc_amt;
      const row = ws.getRow(6 + idx);
      row.getCell(1).value = fmtDate(r.acc_date);
      row.getCell(2).value = r.content;
      row.getCell(3).value = isIncome ? r.acc_amt : null;
      row.getCell(4).value = incCum;
      row.getCell(5).value = !isIncome ? r.acc_amt : null;
      row.getCell(6).value = expCum;
      row.getCell(7).value = incCum - expCum;
      row.getCell(8).value = getCustName(r.customer);
      row.getCell(13).value = r.rcp_no || "";
      row.getCell(14).value = r.bigo || "";
      [3, 4, 5, 6, 7].forEach((c) => { row.getCell(c).numFmt = "#,##0"; });
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `수입지출부_${dateFrom}_${dateTo}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Running totals
  let incCum = 0;
  let expCum = 0;
  const rowsWithTotals = records.map((r) => {
    if (r.incm_sec_cd === 1) incCum += r.acc_amt; else expCum += r.acc_amt;
    return { ...r, incCum, expCum, balance: incCum - expCum };
  });

  const totalIncome = records.filter((r) => r.incm_sec_cd === 1).reduce((s, r) => s + r.acc_amt, 0);
  const totalExpense = records.filter((r) => r.incm_sec_cd === 2).reduce((s, r) => s + r.acc_amt, 0);

  const { sorted: sortedRows, sort, toggle } = useSort(rowsWithTotals);

  if (codesLoading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">코드 데이터 로딩 중...</div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">정치자금 수입지출부</h2>

      <div className="bg-white rounded-lg border p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <CodeSelect label="계정" value={accSecCd}
            onChange={(v) => { setAccSecCd(v); setItemSecCd(0); }}
            options={allAccounts} placeholder="전체 계정" />
          <CodeSelect label="과목" value={itemSecCd} onChange={setItemSecCd}
            options={allItems} placeholder="전체 과목" disabled={!accSecCd} />
          <div><Label>시작일</Label><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
          <div><Label>종료일</Label><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
        </div>
        <div className="flex gap-2 pt-4 border-t">
          <Button onClick={handleQuery} disabled={loading}>{loading ? "조회 중..." : "조회"}</Button>
          <Button variant="outline" onClick={handleExcel} disabled={records.length === 0}>엑셀</Button>
        </div>
      </div>

      {/* 합계 */}
      {records.length > 0 && (
        <div className="flex gap-6 text-sm bg-gray-50 rounded p-3">
          <span>총 건수: <b>{records.length}건</b></span>
          <span>수입합계: <b className="text-blue-600">{fmt(totalIncome)}원</b></span>
          <span>지출합계: <b className="text-red-600">{fmt(totalExpense)}원</b></span>
          <span>잔액: <b className="text-green-600">{fmt(totalIncome - totalExpense)}원</b></span>
        </div>
      )}

      {/* 데이터 테이블 */}
      <div className="bg-white rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-2 py-2 text-left">번호</th>
              <SortTh label="수/지" sortKey="incm_sec_cd" current={sort} onToggle={toggle} className="text-center" />
              <SortTh label="일자" sortKey="acc_date" current={sort} onToggle={toggle} className="text-left" />
              <SortTh label="계정" sortKey="acc_sec_cd" current={sort} onToggle={toggle} className="text-left" />
              <SortTh label="과목" sortKey="item_sec_cd" current={sort} onToggle={toggle} className="text-left" />
              <SortTh label="수입지출처" sortKey="cust_id" current={sort} onToggle={toggle} className="text-left" />
              <SortTh label="내역" sortKey="content" current={sort} onToggle={toggle} className="text-left" />
              <SortTh label="수입금회" sortKey="acc_amt" current={sort} onToggle={toggle} className="text-right" />
              <th className="px-2 py-2 text-right">수입누계</th>
              <th className="px-2 py-2 text-right">지출금회</th>
              <th className="px-2 py-2 text-right">지출누계</th>
              <SortTh label="잔액" sortKey="balance" current={sort} onToggle={toggle} className="text-right" />
              <SortTh label="증빙" sortKey="rcp_yn" current={sort} onToggle={toggle} className="text-center" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={13} className="px-3 py-8 text-center text-gray-400">로딩 중...</td></tr>
            ) : records.length === 0 ? (
              <tr><td colSpan={13} className="px-3 py-8 text-center text-gray-400">기간을 설정 후 [조회]를 클릭하세요.</td></tr>
            ) : (
              sortedRows.map((r, i) => (
                <tr key={r.acc_book_id} className="border-b hover:bg-gray-50">
                  <td className="px-2 py-1.5">{i + 1}</td>
                  <td className="px-2 py-1.5 text-center">
                    <span className={r.incm_sec_cd === 1 ? "text-blue-600 font-semibold" : "text-red-600 font-semibold"}>
                      {r.incm_sec_cd === 1 ? "수입" : "지출"}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">{fmtDate(r.acc_date)}</td>
                  <td className="px-2 py-1.5">{getName(r.acc_sec_cd)}</td>
                  <td className="px-2 py-1.5">{getName(r.item_sec_cd)}</td>
                  <td className="px-2 py-1.5 text-gray-600">{getCustName(r.customer)}</td>
                  <td className="px-2 py-1.5">{r.content}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-blue-600">
                    {r.incm_sec_cd === 1 ? fmt(r.acc_amt) : ""}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-blue-400">
                    {fmt(r.incCum)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-red-600">
                    {r.incm_sec_cd === 2 ? fmt(r.acc_amt) : ""}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-red-400">
                    {fmt(r.expCum)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono font-semibold text-green-600">
                    {fmt(r.balance)}
                  </td>
                  <td className="px-2 py-1.5 text-center">{r.rcp_yn === "Y" ? "O" : "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
