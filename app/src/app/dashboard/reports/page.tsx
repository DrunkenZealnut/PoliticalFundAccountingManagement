"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { useCodeValues } from "@/hooks/use-code-values";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpTooltip } from "@/components/help-tooltip";

export default function ReportsPage() {
  const { orgId, orgName } = useAuth();
  const { getName } = useCodeValues();

  const [covers, setCovers] = useState({
    incomeCover: true,
    expenseCover: true,
    accountCover: true,
    subjectCover: true,
  });
  const [electionName, setElectionName] = useState("");
  const [districtName, setDistrictName] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [generating, setGenerating] = useState(false);

  function handleCoverChange(key: keyof typeof covers) {
    setCovers((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleBatchExcel() {
    if (!orgId || !dateFrom || !dateTo) {
      alert("기간을 설정하세요.");
      return;
    }
    setGenerating(true);

    try {
      const supabase = createSupabaseBrowser();
      const fromStr = dateFrom.replace(/-/g, "");
      const toStr = dateTo.replace(/-/g, "");

      // Fetch all records with customer info
      const { data: records } = await supabase
        .from("acc_book")
        .select("incm_sec_cd, acc_sec_cd, item_sec_cd, acc_date, content, acc_amt, rcp_yn, rcp_no, bigo, customer:cust_id(name, reg_num, addr, job, tel)")
        .eq("org_id", orgId)
        .gte("acc_date", fromStr)
        .lte("acc_date", toStr)
        .order("acc_date")
        .order("acc_sort_num");

      if (!records || records.length === 0) {
        alert("해당 기간에 데이터가 없습니다.");
        setGenerating(false);
        return;
      }

      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();

      // Get unique account/item combinations
      const combos = new Map<string, { accSecCd: number; itemSecCd: number; incmSecCd: number }>();
      for (const r of records) {
        const key = `${r.incm_sec_cd}-${r.acc_sec_cd}-${r.item_sec_cd}`;
        if (!combos.has(key)) {
          combos.set(key, { accSecCd: r.acc_sec_cd, itemSecCd: r.item_sec_cd, incmSecCd: r.incm_sec_cd });
        }
      }

      // Create a sheet per account/item combination
      const sorted = Array.from(combos.values()).sort(
        (a, b) => a.incmSecCd - b.incmSecCd || a.accSecCd - b.accSecCd || a.itemSecCd - b.itemSecCd
      );

      for (const combo of sorted) {
        const sheetRecords = records.filter(
          (r) =>
            r.incm_sec_cd === combo.incmSecCd &&
            r.acc_sec_cd === combo.accSecCd &&
            r.item_sec_cd === combo.itemSecCd
        );

        const typeLabel = combo.incmSecCd === 1 ? "수입" : "지출";
        const accName = getName(combo.accSecCd);
        const itemName = getName(combo.itemSecCd);
        const sheetName = `${typeLabel}_${accName}_${itemName}`.slice(0, 31);

        const ws = wb.addWorksheet(sheetName);

        // Title
        ws.mergeCells("A1:N1");
        const title = ws.getCell("A1");
        title.value = `정 치 자 금  ${typeLabel} 부`;
        title.font = { bold: true, size: 14 };
        title.alignment = { horizontal: "center" };

        ws.getCell("A3").value = `계정(과목)명: ${accName} (${itemName})`;
        if (electionName) ws.getCell("A4").value = `선거명: ${electionName}  선거구명: ${districtName}`;

        // Headers
        const headers = ["년월일", "내역", "금회", "누계", "", "", "잔액",
          "성명", "생년월일", "주소", "직업", "전화번호", "영수증번호", "비고"];
        const hRow = ws.getRow(6);
        headers.forEach((h, i) => { hRow.getCell(i + 1).value = h; hRow.getCell(i + 1).font = { bold: true }; });

        // Data rows with running total
        let cumAmt = 0;
        sheetRecords.forEach((r, idx) => {
          cumAmt += r.acc_amt;
          const row = ws.getRow(7 + idx);
          const date = r.acc_date;
          row.getCell(1).value = date.length === 8 ? `${date.slice(4, 6)}-${date.slice(6, 8)}` : date;
          row.getCell(2).value = r.content;
          row.getCell(3).value = r.acc_amt;
          row.getCell(3).numFmt = "#,##0";
          row.getCell(4).value = cumAmt;
          row.getCell(4).numFmt = "#,##0";
          const cust = Array.isArray(r.customer) ? r.customer[0] : r.customer;
          const c = cust as Record<string, string> | null;
          row.getCell(8).value = c?.name || "";
          row.getCell(9).value = c?.reg_num || "";
          row.getCell(10).value = c?.addr || "";
          row.getCell(11).value = c?.job || "";
          row.getCell(12).value = c?.tel || "";
          row.getCell(13).value = r.rcp_no || "";
          row.getCell(14).value = r.bigo || "";
        });

        // Column widths
        [8, 25, 14, 14, 5, 5, 14, 12, 12, 20, 10, 14, 10, 10].forEach((w, i) => {
          ws.getColumn(i + 1).width = w;
        });
      }

      // Summary sheet
      const sumWs = wb.addWorksheet("총괄");
      sumWs.getCell("A1").value = "보고서 총괄";
      sumWs.getCell("A1").font = { bold: true, size: 14 };
      sumWs.getCell("A2").value = `사용기관: ${orgName}`;
      sumWs.getCell("A3").value = `기간: ${dateFrom} ~ ${dateTo}`;

      const sumHeaders = ["구분", "계정", "과목", "건수", "금액"];
      const sumHRow = sumWs.getRow(5);
      sumHeaders.forEach((h, i) => { sumHRow.getCell(i + 1).value = h; sumHRow.getCell(i + 1).font = { bold: true }; });

      let sumRow = 6;
      for (const combo of sorted) {
        const comboRecords = records.filter(
          (r) => r.incm_sec_cd === combo.incmSecCd && r.acc_sec_cd === combo.accSecCd && r.item_sec_cd === combo.itemSecCd
        );
        const row = sumWs.getRow(sumRow++);
        row.getCell(1).value = combo.incmSecCd === 1 ? "수입" : "지출";
        row.getCell(2).value = getName(combo.accSecCd);
        row.getCell(3).value = getName(combo.itemSecCd);
        row.getCell(4).value = comboRecords.length;
        row.getCell(5).value = comboRecords.reduce((s, r) => s + r.acc_amt, 0);
        row.getCell(5).numFmt = "#,##0";
      }

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `보고서_${orgName}_${dateFrom}_${dateTo}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);

      alert(`보고서가 생성되었습니다.\n\n시트 수: ${sorted.length + 1} (계정/과목별 ${sorted.length}개 + 총괄 1개)`);
    } catch (err) {
      alert(`보고서 생성 실패: ${err instanceof Error ? err.message : "오류"}`);
    } finally {
      setGenerating(false);
    }
  }

  function handleSingleExcel() {
    if (!orgId) return;
    window.open(`/api/excel/export?orgId=${orgId}&type=income`, "_blank");
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">보고서 및 과목별 수입지출부 출력</h2>

      <div className="bg-white rounded-lg border p-4 space-y-6">
        {/* 표지 선택 */}
        <div>
          <HelpTooltip id="report.cover">
            <Label className="text-base font-semibold">표지선택</Label>
          </HelpTooltip>
          <p className="text-xs text-gray-400 mt-1">별도 안내가 없으면 모두 체크하세요.</p>
          <div className="flex flex-wrap gap-6 mt-2">
            {[
              { key: "incomeCover" as const, label: "수입부표지" },
              { key: "expenseCover" as const, label: "지출부표지" },
              { key: "accountCover" as const, label: "계정표지" },
              { key: "subjectCover" as const, label: "과목표지" },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={covers[key]} onChange={() => handleCoverChange(key)} />
                {label}
              </label>
            ))}
          </div>
        </div>

        {/* 선거 정보 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>선거명</Label>
            <Input value={electionName} onChange={(e) => setElectionName(e.target.value)} placeholder="예: 제22대 국회의원선거" />
          </div>
          <div>
            <Label>선거구명</Label>
            <Input value={districtName} onChange={(e) => setDistrictName(e.target.value)} placeholder="예: 서울특별시 종로구" />
          </div>
        </div>

        {/* 기간 설정 */}
        <div>
          <Label className="text-base font-semibold">기간 설정</Label>
          <div className="flex items-center gap-2 mt-2">
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-48" />
            <span className="text-gray-500">~</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-48" />
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex gap-2 pt-4 border-t">
          <HelpTooltip id="report.batch-print">
            <Button onClick={handleBatchExcel} disabled={generating}>
              {generating ? "생성 중..." : "보고서 일괄출력 (엑셀)"}
            </Button>
          </HelpTooltip>
          <Button variant="outline" onClick={handleSingleExcel}>
            수입부 개별출력
          </Button>
        </div>
      </div>

      {/* 안내 */}
      <div className="bg-blue-50 rounded-lg border border-blue-200 p-4 text-sm text-blue-700 space-y-1">
        <p>현재 사용기관: <b>{orgName || "미선택"}</b></p>
        <p>일괄출력: 계정/과목별 수입지출부를 시트별로 구성한 엑셀 파일을 다운로드합니다.</p>
        <p>개별출력: 수입부 또는 지출부를 개별 엑셀 파일로 다운로드합니다.</p>
      </div>
    </div>
  );
}
