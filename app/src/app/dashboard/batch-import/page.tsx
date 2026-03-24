"use client";

import { useState } from "react";
import { useAuth } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpTooltip } from "@/components/help-tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ParsedRow {
  rowNum: number;
  account: string;
  subject: string;
  date: string;
  content: string;
  provider: string;
  regNum: string;
  amount: number;
  receiptYn: string;
  receiptNo: string;
  custType: string;
  error?: string;
}

export default function BatchImportPage() {
  const { orgId, orgType } = useAuth();

  const [tab, setTab] = useState("income");
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [errors, setErrors] = useState<ParsedRow[]>([]);
  const [validated, setValidated] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setParsed([]);
    setErrors([]);
    setValidated(false);

    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    const buffer = await f.arrayBuffer();
    await workbook.xlsx.load(buffer);

    const sheet = workbook.worksheets[0];
    if (!sheet) { alert("엑셀 시트를 찾을 수 없습니다."); return; }

    const rows: ParsedRow[] = [];
    const startRow = sheet.getRow(1).getCell(1).value ? 2 : 9;

    sheet.eachRow((row, rowNum) => {
      if (rowNum < startRow) return;
      const cells = row.values as (string | number | null)[];
      if (!cells || cells.length < 5) return;

      const isImportFormat = cells.length > 14;

      const parsed: ParsedRow = {
        rowNum,
        account: String(cells[1] || ""),
        subject: String(cells[2] || ""),
        date: String(cells[3] || ""),
        content: String(cells[4] || ""),
        provider: String(cells[5] || ""),
        regNum: String(cells[6] || ""),
        amount: isImportFormat ? Number(cells[12] || 0) : Number(cells[3] || 0),
        receiptYn: String(cells[isImportFormat ? 13 : 0] || "N"),
        receiptNo: String(cells[isImportFormat ? 14 : 0] || ""),
        custType: String(cells[isImportFormat ? 15 : 0] || "개인"),
      };

      // 정치후원금센터 탭: 자동 필드 설정
      if (tab === "supporter-center") {
        parsed.content = parsed.content || "기명후원금(후원금센터)";
      }

      rows.push(parsed);
    });

    setParsed(rows);
  }

  function handleValidate() {
    const errs: ParsedRow[] = [];
    for (const row of parsed) {
      const errMsgs: string[] = [];
      if (!row.date) errMsgs.push("수입일자 누락");
      if (!row.amount || row.amount === 0) errMsgs.push("금액 누락");
      if (!row.content && !row.provider) errMsgs.push("내역 또는 수입제공자 누락");

      // 날짜 형식 검증
      const dateClean = row.date.replace(/[.\-\/]/g, "").slice(0, 8);
      if (dateClean && (dateClean.length !== 8 || isNaN(Number(dateClean)))) {
        errMsgs.push("날짜 형식 오류 (YYYYMMDD)");
      }

      if (errMsgs.length > 0) {
        errs.push({ ...row, error: errMsgs.join(", ") });
      }
    }
    setErrors(errs);
    setValidated(true);

    if (errs.length > 0) {
      alert(`오류 ${errs.length}건 발견. 오류가 있으면 저장할 수 없습니다.\n[오류 엑셀 다운로드] 버튼으로 확인하세요.`);
    } else {
      alert(`${parsed.length}건 검증 완료. 오류 없음. [저장] 가능합니다.`);
    }
  }

  // 오류 엑셀 다운로드
  async function handleDownloadErrors() {
    if (errors.length === 0) return;

    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("오류목록");

    const headers = ["행번호", "오류내용", "일자", "내역", "수입지출처", "금액", "생년월일"];
    const headerRow = sheet.getRow(1);
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC7CE" } };
    });

    errors.forEach((e, i) => {
      const row = sheet.getRow(i + 2);
      row.getCell(1).value = e.rowNum;
      row.getCell(2).value = e.error;
      row.getCell(3).value = e.date;
      row.getCell(4).value = e.content;
      row.getCell(5).value = e.provider;
      row.getCell(6).value = e.amount;
      row.getCell(7).value = e.regNum;
    });

    sheet.columns = [
      { width: 8 }, { width: 30 }, { width: 12 }, { width: 20 },
      { width: 15 }, { width: 12 }, { width: 15 },
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `일괄등록_오류목록_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleSave() {
    if (!orgId || errors.length > 0 || !validated) {
      alert("먼저 [저장 전 자료확인]을 실행하세요.");
      return;
    }

    setSaving(true);
    const incmSecCd = tab === "expense" ? 2 : 1;
    const isSupporterCenter = tab === "supporter-center";

    // Build rows for API batch insert
    const rows = parsed.map((row) => {
      const dateStr = row.date.replace(/[.\-\/]/g, "").slice(0, 8);
      return {
        org_id: orgId,
        incm_sec_cd: incmSecCd,
        acc_sec_cd: isSupporterCenter ? 3 : 0,
        item_sec_cd: isSupporterCenter ? 93 : 0,
        exp_sec_cd: 0,
        acc_date: dateStr,
        content: isSupporterCenter ? (row.content || "기명후원금(후원금센터)") : (row.content || row.subject),
        acc_amt: row.amount,
        rcp_yn: row.receiptYn === "Y" ? "Y" : "N",
        rcp_no: row.receiptNo || null,
        // Internal fields for customer matching (stripped by API)
        _provider: row.provider,
        _regNum: row.regNum,
        _custType: row.custType,
      };
    });

    try {
      const res = await fetch("/api/acc-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "batch_insert", rows }),
      });
      const result = await res.json();

      if (res.ok) {
        alert(`${result.success}/${parsed.length}건 등록 완료${result.failed > 0 ? `\n실패: ${result.failed}건` : ""}`);
      } else {
        alert(`등록 실패: ${result.error}`);
      }
    } catch {
      alert("등록 중 오류가 발생했습니다.");
    }

    setSaving(false);
    setParsed([]);
    setErrors([]);
    setValidated(false);
    setFile(null);
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">수입지출내역 일괄등록</h2>

      <Tabs value={tab} onValueChange={(v) => { setTab(v); setParsed([]); setErrors([]); setValidated(false); setFile(null); }}>
        <TabsList>
          <TabsTrigger value="income">수입내역</TabsTrigger>
          <TabsTrigger value="expense">지출내역</TabsTrigger>
          {orgType === "supporter" && (
            <TabsTrigger value="supporter-center">정치후원금센터 후원금 자료</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value={tab} className="space-y-4">
          {tab === "supporter-center" && (
            <div className="bg-blue-50 rounded-lg border border-blue-200 p-3 text-sm text-blue-800">
              <p className="font-semibold">정치후원금센터 후원금 자료 일괄등록</p>
              <ul className="list-disc pl-5 mt-1 space-y-1">
                <li>계정: 보조금외, 과목: 기명후원금 자동 설정</li>
                <li>내역: &quot;기명후원금(후원금센터)&quot; 자동 입력</li>
                <li>수입지출처 정보가 없는 경우 생년월일은 9999로 자동 채움</li>
              </ul>
            </div>
          )}

          <div className="bg-white rounded-lg border p-4 space-y-4">
            <div className="flex items-end gap-4 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <Label>엑셀파일 선택</Label>
                <Input type="file" accept=".xlsx,.xls" onChange={handleFileSelect} />
              </div>
              <HelpTooltip id="batch.validate">
                <Button variant="outline" onClick={handleValidate} disabled={parsed.length === 0}>
                  저장 전 자료확인
                </Button>
              </HelpTooltip>
              <Button onClick={handleSave} disabled={!validated || errors.length > 0 || saving}>
                {saving ? "저장 중..." : "저장"}
              </Button>
            </div>

            {file && (
              <p className="text-sm text-gray-500">
                파일: {file.name} | 파싱된 건수: {parsed.length}건
                {validated && errors.length === 0 && " | ✅ 오류 없음"}
                {validated && errors.length > 0 && ` | ❌ 오류 ${errors.length}건`}
              </p>
            )}
          </div>

          {/* 오류 목록 */}
          {errors.length > 0 && (
            <div className="bg-red-50 rounded-lg border border-red-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-red-700">오류 목록 ({errors.length}건)</h3>
                <Button variant="outline" size="sm" onClick={handleDownloadErrors}>
                  오류 엑셀 다운로드
                </Button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-red-200">
                    <th className="px-2 py-1 text-left">행</th>
                    <th className="px-2 py-1 text-left">오류 내용</th>
                    <th className="px-2 py-1 text-left">수입제공자</th>
                    <th className="px-2 py-1 text-left">일자</th>
                    <th className="px-2 py-1 text-right">금액</th>
                  </tr>
                </thead>
                <tbody>
                  {errors.map((e) => (
                    <tr key={e.rowNum} className="border-b border-red-100">
                      <td className="px-2 py-1">{e.rowNum}</td>
                      <td className="px-2 py-1 text-red-600">{e.error}</td>
                      <td className="px-2 py-1">{e.provider}</td>
                      <td className="px-2 py-1">{e.date}</td>
                      <td className="px-2 py-1 text-right">{e.amount?.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 파싱 결과 미리보기 */}
          {parsed.length > 0 && errors.length === 0 && (
            <div className="bg-white rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-2 py-2 text-left">행</th>
                    <th className="px-2 py-2 text-left">일자</th>
                    <th className="px-2 py-2 text-left">내역</th>
                    <th className="px-2 py-2 text-left">수입/지출처</th>
                    <th className="px-2 py-2 text-left">생년월일</th>
                    <th className="px-2 py-2 text-right">금액</th>
                    <th className="px-2 py-2 text-center">증빙</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.slice(0, 50).map((r) => (
                    <tr key={r.rowNum} className="border-b">
                      <td className="px-2 py-1">{r.rowNum}</td>
                      <td className="px-2 py-1">{r.date}</td>
                      <td className="px-2 py-1">{r.content || r.subject}</td>
                      <td className="px-2 py-1">{r.provider}</td>
                      <td className="px-2 py-1 text-gray-500">{r.regNum || "-"}</td>
                      <td className="px-2 py-1 text-right font-mono">{r.amount.toLocaleString()}</td>
                      <td className="px-2 py-1 text-center">{r.receiptYn}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.length > 50 && (
                <p className="p-2 text-sm text-gray-400">... 외 {parsed.length - 50}건 더</p>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
