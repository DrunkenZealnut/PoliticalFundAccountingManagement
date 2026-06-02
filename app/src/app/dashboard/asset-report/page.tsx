"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { useCodeValues } from "@/hooks/use-code-values";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpTooltip } from "@/components/help-tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Estate {
  estate_id: number;
  estate_sec_cd: number;
  kind: string;
  qty: number;
  content: string;
  amt: number;
  remark: string;
}

const ESTATE_TYPES = [
  { value: 0, label: "전체" },
  { value: 43, label: "토지" },
  { value: 44, label: "건물" },
  { value: 45, label: "주식/유가증권" },
  { value: 46, label: "비품" },
  { value: 47, label: "현금및예금" },
  { value: 48, label: "그 밖의 재산" },
  { value: 49, label: "차입금" },
];

export default function AssetReportPage() {
  const { orgId, orgName } = useAuth();
  const { loading: codesLoading, getName } = useCodeValues();

  const [tab, setTab] = useState("0");
  const [records, setRecords] = useState<Estate[]>([]);
  const [loading, setLoading] = useState(true);
  const [baseDate, setBaseDate] = useState("");
  const [writeDate, setWriteDate] = useState("");

  const fmt = (n: number) => n.toLocaleString("ko-KR");

  useEffect(() => {
    if (!orgId) { setLoading(false); return; }
    const sb = createSupabaseBrowser();
    sb.from("estate").select("*").eq("org_id", orgId)
      .order("estate_sec_cd").order("estate_order")
      .then(({ data }) => { setRecords((data as Estate[]) || []); setLoading(false); });
  }, [orgId]);

  const activeTab = Number(tab);
  const filteredRecords =
    activeTab === 0
      ? records
      : records.filter((r) => r.estate_sec_cd === activeTab);

  const summaryByType = ESTATE_TYPES.filter((t) => t.value !== 0).map((t) => {
    const items = records.filter((r) => r.estate_sec_cd === t.value);
    return {
      ...t,
      count: items.length,
      totalQty: items.reduce((s, r) => s + r.qty, 0),
      totalAmt: items.reduce((s, r) => s + r.amt, 0),
    };
  });

  const grandTotal = summaryByType.reduce((s, t) => s + t.totalAmt, 0);

  function getTypeName(cd: number): string {
    return getName(cd) !== String(cd) ? getName(cd) : (ESTATE_TYPES.find((t) => t.value === cd)?.label || String(cd));
  }

  async function handleExcelReport() {
    if (records.length === 0) {
      alert("재산 데이터가 없습니다.");
      return;
    }

    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();

    // 재산명세서 시트
    const ws = wb.addWorksheet("재산명세서");
    ws.mergeCells("A1:F1");
    const title = ws.getCell("A1");
    title.value = "재 산 명 세 서";
    title.font = { bold: true, size: 14 };
    title.alignment = { horizontal: "center" };

    if (orgName) ws.getCell("A2").value = `사용기관: ${orgName}`;
    if (baseDate) ws.getCell("A3").value = `기준연월일: ${baseDate}`;
    if (writeDate) ws.getCell("D3").value = `작성연월일: ${writeDate}`;

    // Summary table
    const sumHeaders = ["재산구분", "건수", "수량합계", "금액합계"];
    const sumHRow = ws.getRow(5);
    sumHeaders.forEach((h, i) => { sumHRow.getCell(i + 1).value = h; sumHRow.getCell(i + 1).font = { bold: true }; });

    let row = 6;
    for (const t of summaryByType) {
      if (t.count === 0) continue;
      const r = ws.getRow(row++);
      r.getCell(1).value = t.label;
      r.getCell(2).value = t.count;
      r.getCell(3).value = t.totalQty;
      r.getCell(4).value = t.totalAmt;
      r.getCell(4).numFmt = "#,##0";
    }
    const totalRow = ws.getRow(row++);
    totalRow.getCell(1).value = "합계";
    totalRow.getCell(1).font = { bold: true };
    totalRow.getCell(2).value = summaryByType.reduce((s, t) => s + t.count, 0);
    totalRow.getCell(3).value = summaryByType.reduce((s, t) => s + t.totalQty, 0);
    totalRow.getCell(4).value = grandTotal;
    totalRow.getCell(4).numFmt = "#,##0";
    totalRow.getCell(4).font = { bold: true };

    // Detail table
    row += 1;
    ws.getRow(row).getCell(1).value = "세부내역";
    ws.getRow(row).getCell(1).font = { bold: true, size: 12 };
    row++;

    const detHeaders = ["재산구분", "종류", "수량", "내용", "가액", "비고"];
    const detHRow = ws.getRow(row++);
    detHeaders.forEach((h, i) => { detHRow.getCell(i + 1).value = h; detHRow.getCell(i + 1).font = { bold: true }; });

    for (const r of records) {
      const dr = ws.getRow(row++);
      dr.getCell(1).value = getTypeName(r.estate_sec_cd);
      dr.getCell(2).value = r.kind;
      dr.getCell(3).value = r.qty;
      dr.getCell(4).value = r.content;
      dr.getCell(5).value = r.amt;
      dr.getCell(5).numFmt = "#,##0";
      dr.getCell(6).value = r.remark;
    }

    ws.getColumn(1).width = 16;
    ws.getColumn(2).width = 20;
    ws.getColumn(3).width = 10;
    ws.getColumn(4).width = 30;
    ws.getColumn(5).width = 18;
    ws.getColumn(6).width = 20;

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `재산명세서_${orgName || "기관"}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (codesLoading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">코드 데이터 로딩 중...</div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">재산명세서</h2>

      <div className="bg-white rounded-lg border p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <HelpTooltip id="estate.type"><Label>기준연월일</Label></HelpTooltip>
            <Input type="date" value={baseDate} onChange={(e) => setBaseDate(e.target.value)} />
          </div>
          <div>
            <Label>작성연월일</Label>
            <Input type="date" value={writeDate} onChange={(e) => setWriteDate(e.target.value)} />
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={handleExcelReport}>재산명세서 엑셀</Button>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {ESTATE_TYPES.map((t) => (
            <TabsTrigger key={t.value} value={String(t.value)}>{t.label}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={tab} className="space-y-4">
          {activeTab === 0 && (
            <div className="bg-white rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left">재산구분</th>
                    <th className="px-3 py-2 text-right">건수</th>
                    <th className="px-3 py-2 text-right">수량합계</th>
                    <th className="px-3 py-2 text-right">금액합계</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryByType.map((t) => (
                    <tr key={t.value} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">{t.label}</td>
                      <td className="px-3 py-2 text-right">{t.count}</td>
                      <td className="px-3 py-2 text-right">{t.totalQty}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(t.totalAmt)}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-100 font-bold">
                    <td className="px-3 py-2">합계</td>
                    <td className="px-3 py-2 text-right">{summaryByType.reduce((s, t) => s + t.count, 0)}</td>
                    <td className="px-3 py-2 text-right">{summaryByType.reduce((s, t) => s + t.totalQty, 0)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmt(grandTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <div className="bg-white rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-2 text-left">번호</th>
                  {activeTab === 0 && <th className="px-3 py-2 text-left">재산구분</th>}
                  <th className="px-3 py-2 text-left">종류</th>
                  <th className="px-3 py-2 text-right">수량</th>
                  <th className="px-3 py-2 text-left">내용</th>
                  <th className="px-3 py-2 text-right">가액</th>
                  <th className="px-3 py-2 text-left">비고</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={activeTab === 0 ? 7 : 6} className="px-3 py-8 text-center text-gray-400">로딩 중...</td></tr>
                ) : filteredRecords.length === 0 ? (
                  <tr><td colSpan={activeTab === 0 ? 7 : 6} className="px-3 py-8 text-center text-gray-400">해당 재산내역이 없습니다.</td></tr>
                ) : (
                  filteredRecords.map((r, i) => (
                    <tr key={r.estate_id} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2">{i + 1}</td>
                      {activeTab === 0 && <td className="px-3 py-2">{getTypeName(r.estate_sec_cd)}</td>}
                      <td className="px-3 py-2">{r.kind}</td>
                      <td className="px-3 py-2 text-right">{r.qty}</td>
                      <td className="px-3 py-2">{r.content}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(r.amt)}</td>
                      <td className="px-3 py-2 text-gray-500">{r.remark}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
