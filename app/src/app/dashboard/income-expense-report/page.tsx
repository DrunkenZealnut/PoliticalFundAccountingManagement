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
  const { orgId, orgName, acctName } = useAuth();
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
    const ws = workbook.addWorksheet("수입지출보고서");

    const thin: Partial<import("exceljs").Borders> = {
      top: { style: "thin" }, bottom: { style: "thin" },
      left: { style: "thin" }, right: { style: "thin" },
    };
    const bFont: Partial<import("exceljs").Font> = { name: "맑은 고딕", size: 10 };
    const ctr: Partial<import("exceljs").Alignment> = { horizontal: "center", vertical: "middle", wrapText: true };

    /* Map account data to 4 fixed rows */
    const rows = [
      { label: "자        산", income: 0, elec: 0, nonElec: 0 },        // Row 8
      { label: "후원회기부금", income: 0, elec: 0, nonElec: 0 },          // Row 9
      { label: "보조금", income: 0, elec: 0, nonElec: 0, sub: true },    // Row 10
      { label: "보조금외", income: 0, elec: 0, nonElec: 0, sub: true },  // Row 11
    ];
    for (const acc of accounts) {
      const name = getName(acc.acc_sec_cd);
      let idx: number;
      if (name.includes("보조금외")) idx = 3;
      else if (name.includes("보조금")) idx = 2;
      else if (name.includes("후원") || name.includes("기부")) idx = 1;
      else idx = 0;
      rows[idx].income += acc.income;
      rows[idx].elec += acc.electionExpense;
      rows[idx].nonElec += acc.nonElectionExpense;
    }

    const totIncome = rows.reduce((s, r) => s + r.income, 0);
    const totElec = rows.reduce((s, r) => s + r.elec, 0);
    const totNonElec = rows.reduce((s, r) => s + r.nonElec, 0);
    const totExp = totElec + totNonElec;

    const today = new Date();
    const todayFmt = `${today.getFullYear()}년 ${String(today.getMonth() + 1).padStart(2, "0")}월 ${String(today.getDate()).padStart(2, "0")}일`;

    function applyBorders(r1: number, c1: number, r2: number, c2: number) {
      for (let r = r1; r <= r2; r++)
        for (let c = c1; c <= c2; c++)
          ws.getRow(r).getCell(c).border = thin;
    }

    /* Row 1: Title */
    ws.mergeCells("A1:H1");
    ws.getCell("A1").value = "정치자금 수입·지출보고서";
    ws.getCell("A1").font = { ...bFont, bold: true, size: 14 };
    ws.getCell("A1").alignment = ctr;

    /* Row 2: 문서번호 */
    ws.mergeCells("A2:H2");
    ws.getCell("A2").value = "문서번호 : ";
    ws.getCell("A2").font = bFont;

    /* Row 3: 선거명 + 선거구명 */
    ws.mergeCells("A3:B3");
    ws.getCell("A3").value = "선    거    명";
    ws.getCell("A3").font = bFont;
    ws.getCell("A3").alignment = ctr;
    ws.mergeCells("C3:E3");
    ws.getCell("C3").value = electionName || "";
    ws.getCell("C3").font = bFont;
    ws.getCell("C3").alignment = ctr;
    ws.getCell("F3").value = "선거구명";
    ws.getCell("F3").font = bFont;
    ws.getCell("F3").alignment = ctr;
    ws.mergeCells("G3:H3");
    ws.getCell("G3").value = districtName || "";
    ws.getCell("G3").font = bFont;
    ws.getCell("G3").alignment = ctr;

    /* Row 4: 후보자 성명 */
    ws.mergeCells("A4:B4");
    ws.getCell("A4").value = "국회의원·후보자·예비후보자 등의\n성명 및 연락소의 명칭";
    ws.getCell("A4").font = bFont;
    ws.getCell("A4").alignment = ctr;
    ws.mergeCells("C4:H4");
    ws.getCell("C4").value = orgName || "";
    ws.getCell("C4").font = bFont;
    ws.getCell("C4").alignment = ctr;

    /* Row 5: Section header */
    ws.mergeCells("A5:H5");
    ws.getCell("A5").value = "정치자금 수입·지출액";
    ws.getCell("A5").font = { ...bFont, bold: true };
    ws.getCell("A5").alignment = ctr;

    /* Row 6-7: Column headers */
    ws.mergeCells("A6:B7");
    ws.getCell("A6").value = "구        분";
    ws.getCell("A6").font = bFont;
    ws.getCell("A6").alignment = ctr;

    ws.mergeCells("C6:C7");
    ws.getCell("C6").value = "수 입";
    ws.getCell("C6").font = bFont;
    ws.getCell("C6").alignment = ctr;

    ws.mergeCells("D6:F6");
    ws.getCell("D6").value = "지     출";
    ws.getCell("D6").font = bFont;
    ws.getCell("D6").alignment = ctr;

    ws.getCell("D7").value = "선거비용";
    ws.getCell("D7").font = bFont;
    ws.getCell("D7").alignment = ctr;
    ws.getCell("E7").value = "선거비용외";
    ws.getCell("E7").font = bFont;
    ws.getCell("E7").alignment = ctr;
    ws.getCell("F7").value = "소계";
    ws.getCell("F7").font = bFont;
    ws.getCell("F7").alignment = ctr;

    ws.mergeCells("G6:G7");
    ws.getCell("G6").value = "잔 액";
    ws.getCell("G6").font = bFont;
    ws.getCell("G6").alignment = ctr;

    ws.mergeCells("H6:H7");
    ws.getCell("H6").value = "비 고";
    ws.getCell("H6").font = bFont;
    ws.getCell("H6").alignment = ctr;

    /* Row 8: 자산 */
    ws.mergeCells("A8:B8");
    ws.getCell("A8").value = rows[0].label;
    ws.getCell("A8").font = bFont;
    ws.getCell("A8").alignment = ctr;

    /* Row 9: 후원회기부금 */
    ws.mergeCells("A9:B9");
    ws.getCell("A9").value = rows[1].label;
    ws.getCell("A9").font = bFont;
    ws.getCell("A9").alignment = ctr;

    /* Row 10-11: 정당의 지원금 */
    ws.mergeCells("A10:A11");
    ws.getCell("A10").value = "정당의 지원금";
    ws.getCell("A10").font = bFont;
    ws.getCell("A10").alignment = ctr;
    ws.getCell("B10").value = rows[2].label;
    ws.getCell("B10").font = bFont;
    ws.getCell("B10").alignment = ctr;
    ws.getCell("B11").value = rows[3].label;
    ws.getCell("B11").font = bFont;
    ws.getCell("B11").alignment = ctr;

    /* Data values (rows 8-11) */
    const dataRows = [
      { row: 8, d: rows[0] },
      { row: 9, d: rows[1] },
      { row: 10, d: rows[2] },
      { row: 11, d: rows[3] },
    ];
    for (const { row, d } of dataRows) {
      const expTotal = d.elec + d.nonElec;
      ws.getRow(row).getCell(3).value = d.income;
      ws.getRow(row).getCell(4).value = d.elec;
      ws.getRow(row).getCell(5).value = d.nonElec;
      ws.getRow(row).getCell(6).value = expTotal;
      ws.getRow(row).getCell(7).value = d.income - expTotal;
      for (let c = 3; c <= 7; c++) {
        ws.getRow(row).getCell(c).numFmt = "#,##0";
        ws.getRow(row).getCell(c).font = bFont;
        ws.getRow(row).getCell(c).alignment = { horizontal: "right", vertical: "middle" };
      }
    }

    /* Row 12: 합계 */
    ws.mergeCells("A12:B12");
    ws.getCell("A12").value = "합        계";
    ws.getCell("A12").font = { ...bFont, bold: true };
    ws.getCell("A12").alignment = ctr;
    ws.getRow(12).getCell(3).value = totIncome;
    ws.getRow(12).getCell(4).value = totElec;
    ws.getRow(12).getCell(5).value = totNonElec;
    ws.getRow(12).getCell(6).value = totExp;
    ws.getRow(12).getCell(7).value = totIncome - totExp;
    for (let c = 3; c <= 7; c++) {
      ws.getRow(12).getCell(c).numFmt = "#,##0";
      ws.getRow(12).getCell(c).font = { ...bFont, bold: true };
      ws.getRow(12).getCell(c).alignment = { horizontal: "right", vertical: "middle" };
    }

    /* Apply borders to table area */
    applyBorders(3, 1, 12, 8);

    /* Row 13: Legal text */
    ws.mergeCells("A13:H13");
    ws.getCell("A13").value =
      "「정치자금법」 제 40조의 규정에 의하여 위와 같이  정치자금의 수입·지출보고서를 제출합니다.";
    ws.getCell("A13").font = bFont;
    ws.getCell("A13").alignment = ctr;

    /* Row 14: Date */
    ws.mergeCells("A14:H14");
    ws.getCell("A14").value = todayFmt;
    ws.getCell("A14").font = bFont;
    ws.getCell("A14").alignment = ctr;

    /* Row 15-17: Signatures */
    ws.mergeCells("A15:F15");
    ws.getCell("A15").value = `${orgName || ""}   회계책임자  ${acctName || ""}  (인)`;
    ws.getCell("A15").font = bFont;
    ws.getCell("A15").alignment = ctr;

    ws.mergeCells("A16:F16");
    ws.getCell("A16").value = "(예비)후보자                     (인)";
    ws.getCell("A16").font = bFont;
    ws.getCell("A16").alignment = ctr;

    ws.mergeCells("A17:F17");
    ws.getCell("A17").value = "선거사무(연락소)장                     (인)";
    ws.getCell("A17").font = bFont;
    ws.getCell("A17").alignment = ctr;

    /* Row 18: 귀중 */
    ws.mergeCells("A18:H18");
    ws.getCell("A18").value = "선거관리위원회 귀중";
    ws.getCell("A18").font = bFont;
    ws.getCell("A18").alignment = ctr;

    /* Row 19-24: 구비서류 */
    const footnotes = [
      "※ 구비서류",
      "   1. 재산명세서 1부.",
      "   2. 정치자금 수입·지출부 1부.",
      "   3. 영수증 그 밖의 증빙서류 사본 1부.",
      "   4. 정치자금 수입·지출 예금통장 사본 1부.",
      "   5. 선거비용 지출내역 집계표(선거연락소를 설치한 선거사무소에 한함)",
    ];
    footnotes.forEach((text, i) => {
      const rn = 19 + i;
      ws.mergeCells(`A${rn}:H${rn}`);
      ws.getCell(`A${rn}`).value = text;
      ws.getCell(`A${rn}`).font = { ...bFont, size: 9 };
      ws.getCell(`A${rn}`).alignment = { vertical: "middle", wrapText: true };
    });

    /* Column widths */
    ws.getColumn(1).width = 10;
    ws.getColumn(2).width = 10;
    ws.getColumn(3).width = 14;
    ws.getColumn(4).width = 14;
    ws.getColumn(5).width = 14;
    ws.getColumn(6).width = 14;
    ws.getColumn(7).width = 14;
    ws.getColumn(8).width = 8;

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const dl = document.createElement("a");
    dl.href = url;
    dl.download = `정치자금_수입지출보고서_${dateFrom}_${dateTo}.xlsx`;
    dl.click();
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
