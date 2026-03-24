"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { useCodeValues } from "@/hooks/use-code-values";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpTooltip } from "@/components/help-tooltip";

interface ItemRow {
  item_sec_cd: number;
  currAmt: number;
  count: number;
}

interface SummaryData {
  incomeItems: ItemRow[];
  expenseItems: ItemRow[];
  totalIncome: number;
  totalExpense: number;
  balance: number;
}

export default function SupporterSummaryPage() {
  const { orgId } = useAuth();
  const { loading: codesLoading, getName } = useCodeValues();

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [includePrevYear, setIncludePrevYear] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SummaryData | null>(null);

  const fmt = (n: number) => n.toLocaleString("ko-KR");

  async function handleQuery() {
    if (!orgId) return;
    if (!dateFrom || !dateTo) {
      alert("기간을 입력하세요.");
      return;
    }
    setLoading(true);

    const fromStr = dateFrom.replace(/-/g, "");
    const toStr = dateTo.replace(/-/g, "");
    const supabase = createSupabaseBrowser();

    const { data: records } = await supabase
      .from("acc_book")
      .select("incm_sec_cd, item_sec_cd, acc_amt")
      .eq("org_id", orgId)
      .gte("acc_date", fromStr)
      .lte("acc_date", toStr);

    if (!records) {
      setData(null);
      setLoading(false);
      return;
    }

    // Aggregate by item_sec_cd
    const incMap = new Map<number, ItemRow>();
    const expMap = new Map<number, ItemRow>();

    for (const r of records) {
      const map = r.incm_sec_cd === 1 ? incMap : expMap;
      const existing = map.get(r.item_sec_cd);
      if (existing) {
        existing.currAmt += r.acc_amt;
        existing.count += 1;
      } else {
        map.set(r.item_sec_cd, {
          item_sec_cd: r.item_sec_cd,
          currAmt: r.acc_amt,
          count: 1,
        });
      }
    }

    const incomeItems = Array.from(incMap.values()).sort(
      (a, b) => a.item_sec_cd - b.item_sec_cd
    );
    const expenseItems = Array.from(expMap.values()).sort(
      (a, b) => a.item_sec_cd - b.item_sec_cd
    );
    const totalIncome = incomeItems.reduce((s, r) => s + r.currAmt, 0);
    const totalExpense = expenseItems.reduce((s, r) => s + r.currAmt, 0);

    setData({
      incomeItems,
      expenseItems,
      totalIncome,
      totalExpense,
      balance: totalIncome - totalExpense,
    });
    setLoading(false);
  }

  async function handleExcel() {
    if (!data) return;
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("후원회 수입지출 총괄표");

    ws.mergeCells("A1:E1");
    const t = ws.getCell("A1");
    t.value = "후원회의 수입·지출 총괄표";
    t.font = { bold: true, size: 14 };
    t.alignment = { horizontal: "center" };

    ws.getCell("A2").value = `기간: ${dateFrom} ~ ${dateTo}`;

    const hdr = ws.getRow(4);
    ["구분", "과목", "건수", "당해연도", "합계"].forEach((h, i) => {
      hdr.getCell(i + 1).value = h;
      hdr.getCell(i + 1).font = { bold: true };
    });

    let row = 5;
    for (const item of data.incomeItems) {
      const r = ws.getRow(row++);
      r.getCell(1).value = "수입";
      r.getCell(2).value = getName(item.item_sec_cd);
      r.getCell(3).value = item.count;
      r.getCell(4).value = item.currAmt;
      r.getCell(4).numFmt = "#,##0";
      r.getCell(5).value = item.currAmt;
      r.getCell(5).numFmt = "#,##0";
    }
    const incTotalRow = ws.getRow(row++);
    incTotalRow.getCell(1).value = "수입 합계";
    incTotalRow.getCell(1).font = { bold: true };
    incTotalRow.getCell(4).value = data.totalIncome;
    incTotalRow.getCell(5).value = data.totalIncome;
    [4, 5].forEach((c) => { incTotalRow.getCell(c).numFmt = "#,##0"; incTotalRow.getCell(c).font = { bold: true }; });

    for (const item of data.expenseItems) {
      const r = ws.getRow(row++);
      r.getCell(1).value = "지출";
      r.getCell(2).value = getName(item.item_sec_cd);
      r.getCell(3).value = item.count;
      r.getCell(4).value = item.currAmt;
      r.getCell(4).numFmt = "#,##0";
      r.getCell(5).value = item.currAmt;
      r.getCell(5).numFmt = "#,##0";
    }
    const expTotalRow = ws.getRow(row++);
    expTotalRow.getCell(1).value = "지출 합계";
    expTotalRow.getCell(1).font = { bold: true };
    expTotalRow.getCell(4).value = data.totalExpense;
    expTotalRow.getCell(5).value = data.totalExpense;
    [4, 5].forEach((c) => { expTotalRow.getCell(c).numFmt = "#,##0"; expTotalRow.getCell(c).font = { bold: true }; });

    const balRow = ws.getRow(row);
    balRow.getCell(1).value = "잔액";
    balRow.getCell(1).font = { bold: true };
    balRow.getCell(4).value = data.balance;
    balRow.getCell(5).value = data.balance;
    [4, 5].forEach((c) => { balRow.getCell(c).numFmt = "#,##0"; balRow.getCell(c).font = { bold: true }; });

    ws.getColumn(1).width = 12;
    ws.getColumn(2).width = 20;
    ws.getColumn(3).width = 8;
    ws.getColumn(4).width = 18;
    ws.getColumn(5).width = 18;

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `후원회_수입지출총괄표_${dateFrom}_${dateTo}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (codesLoading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">코드 데이터 로딩 중...</div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">후원회 수입지출 총괄표</h2>

      <div className="bg-white rounded-lg border p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <HelpTooltip id="report.prev-year"><Label>기간</Label></HelpTooltip>
            <div className="flex items-center gap-2 mt-1">
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-44" />
              <span className="text-gray-500">~</span>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-44" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm pb-1 cursor-pointer">
            <input type="checkbox" checked={includePrevYear} onChange={() => setIncludePrevYear(!includePrevYear)} />
            전년도자료
          </label>
        </div>
        <div className="flex gap-2 pt-4 border-t">
          <Button onClick={handleQuery} disabled={loading}>{loading ? "조회 중..." : "조회"}</Button>
          <Button variant="outline" onClick={handleExcel} disabled={!data}>엑셀</Button>
        </div>
      </div>

      {data && (
        <div className="bg-white rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-2 text-left" rowSpan={2}>구분</th>
                <th className="px-3 py-2 text-left" rowSpan={2}>과목</th>
                <th className="px-3 py-2 text-right" rowSpan={2}>건수</th>
                <th className="px-3 py-2 text-right" colSpan={includePrevYear ? 3 : 1}>금액</th>
              </tr>
              {includePrevYear && (
                <tr>
                  <th className="px-3 py-2 text-right border-l">전년도이월</th>
                  <th className="px-3 py-2 text-right">당해연도</th>
                  <th className="px-3 py-2 text-right">합계</th>
                </tr>
              )}
            </thead>
            <tbody>
              {/* 수입 */}
              {data.incomeItems.map((item, i) => (
                <tr key={`inc-${item.item_sec_cd}`} className="border-b hover:bg-gray-50">
                  {i === 0 && (
                    <td className="px-3 py-2 font-semibold text-blue-600 border-r" rowSpan={data.incomeItems.length}>수입</td>
                  )}
                  <td className="px-3 py-2">{getName(item.item_sec_cd)}</td>
                  <td className="px-3 py-2 text-right">{item.count}</td>
                  {includePrevYear && <td className="px-3 py-2 text-right font-mono text-gray-400">0</td>}
                  <td className="px-3 py-2 text-right font-mono">{fmt(item.currAmt)}</td>
                  {includePrevYear && <td className="px-3 py-2 text-right font-mono font-semibold">{fmt(item.currAmt)}</td>}
                </tr>
              ))}
              {data.incomeItems.length === 0 && (
                <tr className="border-b"><td className="px-3 py-2 font-semibold text-blue-600 border-r">수입</td>
                  <td className="px-3 py-2 text-gray-400" colSpan={includePrevYear ? 4 : 2}>수입내역 없음</td></tr>
              )}
              <tr className="bg-blue-50 border-b font-semibold">
                <td className="px-3 py-2 border-r" colSpan={2}>수입 합계</td>
                <td className="px-3 py-2 text-right">{data.incomeItems.reduce((s, r) => s + r.count, 0)}</td>
                {includePrevYear && <td className="px-3 py-2 text-right font-mono">0</td>}
                <td className="px-3 py-2 text-right font-mono">{fmt(data.totalIncome)}</td>
                {includePrevYear && <td className="px-3 py-2 text-right font-mono">{fmt(data.totalIncome)}</td>}
              </tr>

              {/* 지출 */}
              {data.expenseItems.map((item, i) => (
                <tr key={`exp-${item.item_sec_cd}`} className="border-b hover:bg-gray-50">
                  {i === 0 && (
                    <td className="px-3 py-2 font-semibold text-red-600 border-r" rowSpan={data.expenseItems.length}>지출</td>
                  )}
                  <td className="px-3 py-2">{getName(item.item_sec_cd)}</td>
                  <td className="px-3 py-2 text-right">{item.count}</td>
                  {includePrevYear && <td className="px-3 py-2 text-right font-mono text-gray-400">0</td>}
                  <td className="px-3 py-2 text-right font-mono">{fmt(item.currAmt)}</td>
                  {includePrevYear && <td className="px-3 py-2 text-right font-mono font-semibold">{fmt(item.currAmt)}</td>}
                </tr>
              ))}
              {data.expenseItems.length === 0 && (
                <tr className="border-b"><td className="px-3 py-2 font-semibold text-red-600 border-r">지출</td>
                  <td className="px-3 py-2 text-gray-400" colSpan={includePrevYear ? 4 : 2}>지출내역 없음</td></tr>
              )}
              <tr className="bg-red-50 border-b font-semibold">
                <td className="px-3 py-2 border-r" colSpan={2}>지출 합계</td>
                <td className="px-3 py-2 text-right">{data.expenseItems.reduce((s, r) => s + r.count, 0)}</td>
                {includePrevYear && <td className="px-3 py-2 text-right font-mono">0</td>}
                <td className="px-3 py-2 text-right font-mono">{fmt(data.totalExpense)}</td>
                {includePrevYear && <td className="px-3 py-2 text-right font-mono">{fmt(data.totalExpense)}</td>}
              </tr>

              {/* 잔액 */}
              <tr className="bg-green-50 font-bold">
                <td className="px-3 py-2 border-r" colSpan={3}>잔액 (수입 - 지출)</td>
                {includePrevYear && <td className="px-3 py-2 text-right font-mono">0</td>}
                <td className="px-3 py-2 text-right font-mono text-green-700">{fmt(data.balance)}</td>
                {includePrevYear && <td className="px-3 py-2 text-right font-mono text-green-700">{fmt(data.balance)}</td>}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {!data && !loading && (
        <div className="bg-gray-50 rounded-lg border p-8 text-center text-gray-400">
          기간을 설정하고 [조회] 버튼을 클릭하세요.
        </div>
      )}
    </div>
  );
}
