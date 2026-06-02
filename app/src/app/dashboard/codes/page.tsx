"use client";

import { useState, useCallback } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useSort, SortTh } from "@/hooks/use-sort";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpTooltip } from "@/components/help-tooltip";

interface CodeSet {
  cs_id: number;
  cs_name: string | null;
  cs_activeflag: string | null;
  cs_comment: string | null;
}

interface CodeValue {
  cv_id: number;
  cs_id: number;
  cv_name: string;
  cv_order: number;
  cv_comment: string | null;
  cv_etc: string | null;
  cv_etc2: string | null;
  cv_etc3: string | null;
  cv_etc4: string | null;
}

export default function CodesPage() {
  const supabase = createSupabaseBrowser();

  const [mode, setMode] = useState<"db" | "excel">("db");
  const [codeSets, setCodeSets] = useState<CodeSet[]>([]);
  const [codeValues, setCodeValues] = useState<CodeValue[]>([]);
  const [selectedCsId, setSelectedCsId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  const loadCodeSets = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("codeset")
      .select("*")
      .order("cs_id");
    setCodeSets(data || []);
    setSelectedCsId(null);
    setCodeValues([]);
    setLoading(false);
  }, [supabase]);

  async function loadCodeValues(csId: number) {
    setSelectedCsId(csId);
    setLoading(true);
    const { data } = await supabase
      .from("codevalue")
      .select("*")
      .eq("cs_id", csId)
      .order("cv_order");
    setCodeValues(data || []);
    setLoading(false);
  }

  async function handleExcelImport() {
    if (!file) {
      alert("엑셀파일을 선택하세요.");
      return;
    }

    setImporting(true);
    try {
      // Dynamic import of ExcelJS for client-side parsing
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      const buffer = await file.arrayBuffer();
      await workbook.xlsx.load(buffer);

      const sheet = workbook.worksheets[0];
      if (!sheet) {
        alert("엑셀 시트를 찾을 수 없습니다.");
        setImporting(false);
        return;
      }

      // Parse rows: expect columns [cv_id, cs_id, cv_name, cv_order, cv_comment, cv_etc, ...]
      const rows: CodeValue[] = [];
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber <= 1) return; // skip header
        const cvId = Number(row.getCell(1).value);
        const csId = Number(row.getCell(2).value);
        const cvName = String(row.getCell(3).value || "");
        const cvOrder = Number(row.getCell(4).value || 0);
        const cvComment = row.getCell(5).value ? String(row.getCell(5).value) : null;
        const cvEtc = row.getCell(6).value ? String(row.getCell(6).value) : null;
        const cvEtc2 = row.getCell(7).value ? String(row.getCell(7).value) : null;
        const cvEtc3 = row.getCell(8).value ? String(row.getCell(8).value) : null;
        const cvEtc4 = row.getCell(9).value ? String(row.getCell(9).value) : null;

        if (cvId && csId && cvName) {
          rows.push({
            cv_id: cvId,
            cs_id: csId,
            cv_name: cvName,
            cv_order: cvOrder,
            cv_comment: cvComment,
            cv_etc: cvEtc,
            cv_etc2: cvEtc2,
            cv_etc3: cvEtc3,
            cv_etc4: cvEtc4,
          });
        }
      });

      if (rows.length === 0) {
        alert("유효한 코드 데이터가 없습니다.\n형식: cv_id, cs_id, cv_name, cv_order, cv_comment, cv_etc, cv_etc2");
        setImporting(false);
        return;
      }

      if (
        !confirm(
          `${rows.length}건의 코드 데이터를 등록/업데이트합니다.\n\n기존 동일 cv_id의 코드가 있으면 덮어씁니다.\n계속하시겠습니까?`
        )
      ) {
        setImporting(false);
        return;
      }

      // Upsert rows
      const { error } = await supabase
        .from("codevalue")
        .upsert(rows, { onConflict: "cv_id" });

      if (error) {
        alert(`코드 등록 실패: ${error.message}`);
      } else {
        alert(
          `${rows.length}건의 코드 데이터가 등록/업데이트되었습니다.\n\n변경 적용을 위해 로그아웃 후 재로그인하세요.`
        );
        // Reload if viewing
        if (selectedCsId !== null) {
          loadCodeValues(selectedCsId);
        }
      }
    } catch (err) {
      alert(
        `엑셀 파일 처리 실패: ${err instanceof Error ? err.message : "오류"}`
      );
    } finally {
      setImporting(false);
    }
  }

  async function handleExcelExport() {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("코드자료");

    // Header
    sheet.addRow([
      "cv_id",
      "cs_id",
      "cv_name",
      "cv_order",
      "cv_comment",
      "cv_etc",
      "cv_etc2",
      "cv_etc3",
      "cv_etc4",
    ]);
    sheet.getRow(1).font = { bold: true };

    // Data
    const targetValues =
      selectedCsId !== null
        ? codeValues
        : (
            await supabase
              .from("codevalue")
              .select("*")
              .order("cs_id")
              .order("cv_order")
          ).data || [];

    for (const cv of targetValues as CodeValue[]) {
      sheet.addRow([
        cv.cv_id,
        cv.cs_id,
        cv.cv_name,
        cv.cv_order,
        cv.cv_comment || "",
        cv.cv_etc || "",
        cv.cv_etc2 || "",
        cv.cv_etc3 || "",
        cv.cv_etc4 || "",
      ]);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = selectedCsId !== null ? `code_${selectedCsId}.xlsx` : "code_all.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  const { sorted: sortedCodeValues, sort, toggle } = useSort(codeValues);

  const selectedCsName =
    codeSets.find((cs) => cs.cs_id === selectedCsId)?.cs_name || "";

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">코드관리</h2>

      <div className="bg-white rounded-lg border p-4 space-y-4">
        <div>
          <HelpTooltip id="system.code-manage">
            <Label className="text-base font-semibold">자료 원본</Label>
          </HelpTooltip>
          <div className="flex gap-6 mt-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="codeMode"
                checked={mode === "db"}
                onChange={() => setMode("db")}
              />
              DB에 등록된 코드자료 조회
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="codeMode"
                checked={mode === "excel"}
                onChange={() => setMode("excel")}
              />
              엑셀파일의 코드자료 불러오기
            </label>
          </div>
        </div>

        {mode === "excel" && (
          <div className="space-y-2">
            <Label>엑셀파일 선택</Label>
            <Input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <p className="text-xs text-gray-400">
              형식: cv_id, cs_id, cv_name, cv_order, cv_comment, cv_etc, cv_etc2
            </p>
          </div>
        )}

        <div className="flex gap-2 pt-4 border-t">
          {mode === "db" ? (
            <Button onClick={loadCodeSets} disabled={loading}>
              {loading ? "로딩 중..." : "코드분류 조회"}
            </Button>
          ) : (
            <Button onClick={handleExcelImport} disabled={importing || !file}>
              {importing ? "처리 중..." : "엑셀 코드 등록"}
            </Button>
          )}
          <Button variant="outline" onClick={handleExcelExport}>
            엑셀 다운로드
          </Button>
        </div>
      </div>

      {/* 코드분류 목록 */}
      {mode === "db" && codeSets.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border overflow-y-auto max-h-96">
            <div className="px-3 py-2 bg-gray-50 border-b text-sm font-semibold sticky top-0">
              코드분류 (CS_ID)
            </div>
            {codeSets.map((cs) => (
              <button
                key={cs.cs_id}
                className={`w-full text-left px-3 py-2 text-sm border-b hover:bg-blue-50 ${
                  selectedCsId === cs.cs_id ? "bg-blue-50 font-semibold" : ""
                }`}
                onClick={() => loadCodeValues(cs.cs_id)}
              >
                <span className="font-mono text-gray-500 mr-2">
                  {cs.cs_id}
                </span>
                {cs.cs_name || "-"}
              </button>
            ))}
          </div>

          <div className="md:col-span-3 bg-white rounded-lg border overflow-x-auto">
            {selectedCsId === null ? (
              <div className="px-3 py-8 text-center text-gray-400">
                좌측에서 코드분류를 선택하세요.
              </div>
            ) : (
              <>
                <div className="px-3 py-2 bg-gray-50 border-b text-sm font-semibold">
                  {selectedCsName} (CS_ID: {selectedCsId}) - {codeValues.length}
                  건
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <SortTh label="CV_ID" sortKey="cv_id" current={sort} onToggle={toggle} className="text-left" />
                      <SortTh label="코드명" sortKey="cv_name" current={sort} onToggle={toggle} className="text-left min-w-[80px]" />
                      <SortTh label="정렬순서" sortKey="cv_order" current={sort} onToggle={toggle} className="text-right" />
                      <SortTh label="비고" sortKey="cv_comment" current={sort} onToggle={toggle} className="text-left" />
                      <SortTh label="사용기관" sortKey="cv_etc" current={sort} onToggle={toggle} className="text-left" />
                      <SortTh label="대분류" sortKey="cv_etc2" current={sort} onToggle={toggle} className="text-left" />
                      <SortTh label="중분류" sortKey="cv_etc3" current={sort} onToggle={toggle} className="text-left" />
                      <SortTh label="소분류" sortKey="cv_etc4" current={sort} onToggle={toggle} className="text-left" />
                    </tr>
                  </thead>
                  <tbody>
                    {codeValues.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-3 py-4 text-center text-gray-400"
                        >
                          {loading ? "로딩 중..." : "코드값이 없습니다."}
                        </td>
                      </tr>
                    ) : (
                      sortedCodeValues.map((cv) => (
                        <tr key={cv.cv_id} className="border-b hover:bg-gray-50">
                          <td className="px-3 py-2 font-mono text-blue-600">
                            {cv.cv_id}
                          </td>
                          <td className="px-3 py-2 font-medium whitespace-nowrap">
                            {cv.cv_name}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {cv.cv_order}
                          </td>
                          <td className="px-3 py-2 text-gray-500">
                            {cv.cv_comment || "-"}
                          </td>
                          <td className="px-3 py-2 text-gray-400">
                            {cv.cv_etc || "-"}
                          </td>
                          <td className="px-3 py-2 text-gray-400">
                            {cv.cv_etc2 || "-"}
                          </td>
                          <td className="px-3 py-2 text-gray-400">
                            {cv.cv_etc3 || "-"}
                          </td>
                          <td className="px-3 py-2 text-gray-400">
                            {cv.cv_etc4 || "-"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
