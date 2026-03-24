"use client";

import { useState, useCallback } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { useCodeValues } from "@/hooks/use-code-values";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpTooltip } from "@/components/help-tooltip";

interface AccountRow {
  acc_sec_cd: number;
  income: number;
  electionExpense: number;
  nonElectionExpense: number;
}

export default function IncomeExpenseReportPage() {
  const supabase = createSupabaseBrowser();
  const { orgId } = useAuth();
  const { loading: codesLoading, getName } = useCodeValues();

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [includePrevYear, setIncludePrevYear] = useState(false);
  const [electionName, setElectionName] = useState("");
  const [districtName, setDistrictName] = useState("");
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [searched, setSearched] = useState(false);

  const fmt = (n: number) => n.toLocaleString("ko-KR");

  const handleQuery = useCallback(async () => {
    if (!orgId) return;
    if (!dateFrom || !dateTo) {
      alert("기간을 입력하세요.");
      return;
    }
    setLoading(true);
    setSearched(true);

    const fromStr = dateFrom.replace(/-/g, "");
    const toStr = dateTo.replace(/-/g, "");

    const { data } = await supabase
      .from("acc_book")
      .select("incm_sec_cd, acc_sec_cd, item_sec_cd, acc_amt")
      .eq("org_id", orgId)
      .gte("acc_date", fromStr)
      .lte("acc_date", toStr);

    if (!data) {
      setAccounts([]);
      setLoading(false);
      return;
    }

    // Aggregate by acc_sec_cd
    const map = new Map<number, AccountRow>();
    for (const r of data) {
      const existing = map.get(r.acc_sec_cd);
      // 선거비용 과목: item_sec_cd = 86 (선거비용) or 19 (선거비용)
      const isElectionExpense =
        r.incm_sec_cd === 2 && (r.item_sec_cd === 86 || r.item_sec_cd === 19);
      const isNonElectionExpense = r.incm_sec_cd === 2 && !isElectionExpense;

      if (existing) {
        if (r.incm_sec_cd === 1) existing.income += r.acc_amt;
        if (isElectionExpense) existing.electionExpense += r.acc_amt;
        if (isNonElectionExpense) existing.nonElectionExpense += r.acc_amt;
      } else {
        map.set(r.acc_sec_cd, {
          acc_sec_cd: r.acc_sec_cd,
          income: r.incm_sec_cd === 1 ? r.acc_amt : 0,
          electionExpense: isElectionExpense ? r.acc_amt : 0,
          nonElectionExpense: isNonElectionExpense ? r.acc_amt : 0,
        });
      }
    }

    setAccounts(
      Array.from(map.values()).sort((a, b) => a.acc_sec_cd - b.acc_sec_cd)
    );
    setLoading(false);
  }, [orgId, supabase, dateFrom, dateTo]);

  async function handleExcel() {
    if (accounts.length === 0) {
      alert("조회된 데이터가 없습니다.");
      return;
    }

    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("수입지출보고서");

    sheet.mergeCells("A1:F1");
    const title = sheet.getCell("A1");
    title.value = "정치자금 수입/지출보고서";
    title.font = { bold: true, size: 14 };
    title.alignment = { horizontal: "center" };

    if (electionName) sheet.getCell("A2").value = `선거명: ${electionName}`;
    if (districtName) sheet.getCell("A3").value = `선거구명: ${districtName}`;

    const headers = ["구분", "수입", "선거비용", "선거비용외", "지출소계", "잔액"];
    const hRow = sheet.getRow(5);
    headers.forEach((h, i) => {
      hRow.getCell(i + 1).value = h;
      hRow.getCell(i + 1).font = { bold: true };
    });

    let rowIdx = 6;
    for (const a of accounts) {
      const row = sheet.getRow(rowIdx++);
      const totalExp = a.electionExpense + a.nonElectionExpense;
      row.getCell(1).value = getName(a.acc_sec_cd);
      row.getCell(2).value = a.income;
      row.getCell(2).numFmt = "#,##0";
      row.getCell(3).value = a.electionExpense;
      row.getCell(3).numFmt = "#,##0";
      row.getCell(4).value = a.nonElectionExpense;
      row.getCell(4).numFmt = "#,##0";
      row.getCell(5).value = totalExp;
      row.getCell(5).numFmt = "#,##0";
      row.getCell(6).value = a.income - totalExp;
      row.getCell(6).numFmt = "#,##0";
    }

    const totals = accounts.reduce(
      (s, a) => ({
        income: s.income + a.income,
        elec: s.elec + a.electionExpense,
        nonElec: s.nonElec + a.nonElectionExpense,
      }),
      { income: 0, elec: 0, nonElec: 0 }
    );
    const tRow = sheet.getRow(rowIdx);
    tRow.getCell(1).value = "합계";
    tRow.getCell(1).font = { bold: true };
    tRow.getCell(2).value = totals.income;
    tRow.getCell(3).value = totals.elec;
    tRow.getCell(4).value = totals.nonElec;
    tRow.getCell(5).value = totals.elec + totals.nonElec;
    tRow.getCell(6).value = totals.income - totals.elec - totals.nonElec;
    [2, 3, 4, 5, 6].forEach((c) => {
      tRow.getCell(c).numFmt = "#,##0";
      tRow.getCell(c).font = { bold: true };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `수입지출보고서_${dateFrom}_${dateTo}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Totals
  const totals = accounts.reduce(
    (s, a) => ({
      income: s.income + a.income,
      elec: s.elec + a.electionExpense,
      nonElec: s.nonElec + a.nonElectionExpense,
    }),
    { income: 0, elec: 0, nonElec: 0 }
  );
  const totalExpense = totals.elec + totals.nonElec;
  const balance = totals.income - totalExpense;

  if (codesLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        코드 데이터 로딩 중...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">정치자금 수입지출보고서</h2>

      <div className="bg-white rounded-lg border p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <HelpTooltip id="report.prev-year">
              <Label>기간</Label>
            </HelpTooltip>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-44"
              />
              <span className="text-gray-500">~</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-44"
              />
            </div>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm pb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includePrevYear}
                onChange={() => setIncludePrevYear(!includePrevYear)}
              />
              전년도자료 포함
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>선거명</Label>
            <Input
              value={electionName}
              onChange={(e) => setElectionName(e.target.value)}
              placeholder="예: 제22대 국회의원선거"
            />
          </div>
          <div>
            <Label>선거구명</Label>
            <Input
              value={districtName}
              onChange={(e) => setDistrictName(e.target.value)}
              placeholder="예: 서울특별시 종로구"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-4 border-t">
          <Button onClick={handleQuery} disabled={loading}>
            {loading ? "조회 중..." : "조회"}
          </Button>
          <Button
            variant="outline"
            onClick={handleExcel}
            disabled={accounts.length === 0}
          >
            엑셀 다운로드
          </Button>
        </div>
      </div>

      {searched && (
        <div className="bg-white rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-2 text-left" rowSpan={2}>
                  구분 (계정)
                </th>
                <th className="px-3 py-2 text-right" rowSpan={2}>
                  수입
                </th>
                <th className="px-3 py-2 text-center" colSpan={3}>
                  지출
                </th>
                <th className="px-3 py-2 text-right" rowSpan={2}>
                  잔액
                </th>
              </tr>
              <tr>
                <th className="px-3 py-2 text-right border-l">선거비용</th>
                <th className="px-3 py-2 text-right">선거비용외</th>
                <th className="px-3 py-2 text-right">소계</th>
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-gray-400"
                  >
                    조회된 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                <>
                  {accounts.map((a) => {
                    const exp = a.electionExpense + a.nonElectionExpense;
                    return (
                      <tr
                        key={a.acc_sec_cd}
                        className="border-b hover:bg-gray-50"
                      >
                        <td className="px-3 py-3 font-medium">
                          {getName(a.acc_sec_cd)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-blue-600">
                          {a.income > 0 ? fmt(a.income) : "-"}
                        </td>
                        <td className="px-3 py-3 text-right font-mono">
                          {a.electionExpense > 0
                            ? fmt(a.electionExpense)
                            : "-"}
                        </td>
                        <td className="px-3 py-3 text-right font-mono">
                          {a.nonElectionExpense > 0
                            ? fmt(a.nonElectionExpense)
                            : "-"}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-red-600">
                          {exp > 0 ? fmt(exp) : "-"}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-green-600 font-semibold">
                          {fmt(a.income - exp)}
                        </td>
                      </tr>
                    );
                  })}

                  {includePrevYear && (
                    <tr className="border-b text-gray-400">
                      <td className="px-3 py-3">전년도 이월</td>
                      <td className="px-3 py-3 text-right">-</td>
                      <td className="px-3 py-3 text-right">-</td>
                      <td className="px-3 py-3 text-right">-</td>
                      <td className="px-3 py-3 text-right">-</td>
                      <td className="px-3 py-3 text-right">-</td>
                    </tr>
                  )}

                  <tr className="bg-gray-100 font-bold">
                    <td className="px-3 py-3">합계</td>
                    <td className="px-3 py-3 text-right font-mono text-blue-700">
                      {fmt(totals.income)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono">
                      {fmt(totals.elec)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono">
                      {fmt(totals.nonElec)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-red-700">
                      {fmt(totalExpense)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-green-700">
                      {fmt(balance)}
                    </td>
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
