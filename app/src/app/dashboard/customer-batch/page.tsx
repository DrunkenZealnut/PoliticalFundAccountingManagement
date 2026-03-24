"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpTooltip } from "@/components/help-tooltip";

interface ParsedCustomer {
  rowNum: number;
  custSecCd: string;
  name: string;
  regNum: string;
  job: string;
  tel: string;
  post: string;
  addr: string;
  addrDetail: string;
  bigo: string;
  error?: string;
}

const CUST_TYPE_MAP: Record<string, number> = {
  사업자: 62,
  개인: 63,
  후원회: 89,
  중앙당: 88,
  시도당: 57,
  정책연구소: 58,
  정당선거사무소: 59,
  국회의원: 60,
  "(예비)후보자": 61,
  기타: 103,
};

export default function CustomerBatchPage() {
  const supabase = createSupabaseBrowser();

  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedCustomer[]>([]);
  const [errors, setErrors] = useState<ParsedCustomer[]>([]);
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
    if (!sheet) {
      alert("엑셀 시트를 찾을 수 없습니다.");
      return;
    }

    const rows: ParsedCustomer[] = [];
    sheet.eachRow((row, rowNum) => {
      if (rowNum < 2) return; // 헤더 건너뜀
      const cells = row.values as (string | number | null)[];
      if (!cells || cells.length < 3) return;

      rows.push({
        rowNum,
        custSecCd: String(cells[1] || "개인"),
        name: String(cells[2] || ""),
        regNum: String(cells[3] || ""),
        job: String(cells[4] || ""),
        tel: String(cells[5] || ""),
        post: String(cells[6] || ""),
        addr: String(cells[7] || ""),
        addrDetail: String(cells[8] || ""),
        bigo: String(cells[9] || ""),
      });
    });

    setParsed(rows);
  }

  function handleValidate() {
    const errs: ParsedCustomer[] = [];
    for (const row of parsed) {
      const errMsgs: string[] = [];
      if (!row.name) errMsgs.push("성명(명칭) 누락");
      if (!row.custSecCd) errMsgs.push("구분 누락");
      if (!(row.custSecCd in CUST_TYPE_MAP) && isNaN(Number(row.custSecCd))) {
        errMsgs.push(`알 수 없는 구분: ${row.custSecCd}`);
      }

      if (errMsgs.length > 0) {
        errs.push({ ...row, error: errMsgs.join(", ") });
      }
    }
    setErrors(errs);
    setValidated(true);

    if (errs.length > 0) {
      alert(`오류 ${errs.length}건 발견. 오류를 수정 후 다시 시도하세요.`);
    } else {
      alert(`${parsed.length}건 검증 완료. 오류 없음. [저장] 가능합니다.`);
    }
  }

  async function handleSave() {
    if (!validated || errors.length > 0) {
      alert("먼저 [저장 전 자료확인]을 실행하세요.");
      return;
    }

    setSaving(true);
    let success = 0;

    for (const row of parsed) {
      const custSecCd =
        CUST_TYPE_MAP[row.custSecCd] || Number(row.custSecCd) || 63;

      // 중복 체크
      const { data: dup } = await supabase
        .from("customer")
        .select("cust_id")
        .eq("cust_sec_cd", custSecCd)
        .eq("name", row.name)
        .eq("reg_num", row.regNum || "")
        .limit(1);

      if (dup && dup.length > 0) continue; // 중복은 건너뜀

      const { error } = await supabase.from("customer").insert({
        cust_sec_cd: custSecCd,
        name: row.name,
        reg_num: row.regNum || null,
        job: row.job || null,
        tel: row.tel || null,
        post: row.post || null,
        addr: row.addr || null,
        addr_detail: row.addrDetail || null,
        bigo: row.bigo || null,
      });

      if (!error) success++;
    }

    setSaving(false);
    alert(`${success}/${parsed.length}건 등록 완료 (중복 제외)`);
    setParsed([]);
    setErrors([]);
    setValidated(false);
    setFile(null);
  }

  async function handleDeleteAll() {
    if (
      !confirm(
        "파싱된 자료 목록의 수입지출처를 모두 삭제하시겠습니까? (실제 DB에서 삭제됩니다)"
      )
    ) {
      return;
    }

    let deleted = 0;
    for (const row of parsed) {
      const custSecCd =
        CUST_TYPE_MAP[row.custSecCd] || Number(row.custSecCd) || 63;

      const { data: existing } = await supabase
        .from("customer")
        .select("cust_id")
        .eq("cust_sec_cd", custSecCd)
        .eq("name", row.name)
        .limit(1);

      if (existing && existing.length > 0) {
        const { count } = await supabase
          .from("acc_book")
          .select("*", { count: "exact", head: true })
          .eq("cust_id", (existing[0] as { cust_id: number }).cust_id);

        if (!count || count === 0) {
          await supabase
            .from("customer")
            .delete()
            .eq("cust_id", (existing[0] as { cust_id: number }).cust_id);
          deleted++;
        }
      }
    }

    alert(`${deleted}건 삭제 완료 (수입지출 내역이 있는 건은 제외)`);
  }

  async function handleExcel() {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("수입지출처 일괄등록");

    // Header row
    const headers = ["구분*", "성명(명칭)*", "생년월일/사업자번호", "직업(업종)", "우편번호", "주소", "상세주소", "전화번호", "비고"];
    const hRow = ws.getRow(1);
    headers.forEach((h, i) => { hRow.getCell(i + 1).value = h; hRow.getCell(i + 1).font = { bold: true }; });

    // Sample data
    const sampleRow = ws.getRow(2);
    ["개인", "홍길동", "19900101", "회사원", "06236", "서울특별시 강남구 테헤란로 123", "4층", "01012345678", ""].forEach(
      (v, i) => { sampleRow.getCell(i + 1).value = v; sampleRow.getCell(i + 1).font = { color: { argb: "FF999999" } }; }
    );

    // Notes
    ws.getRow(4).getCell(1).value = "※ 유의사항";
    ws.getRow(4).getCell(1).font = { bold: true, color: { argb: "FFFF0000" } };
    ws.getRow(5).getCell(1).value = "1. * 표시 항목은 필수 입력입니다.";
    ws.getRow(6).getCell(1).value = "2. 구분: 개인, 사업자, 후원회, 중앙당, 시도당, 정책연구소, 정당선거사무소, 국회의원, (예비)후보자, 기타";
    ws.getRow(7).getCell(1).value = "3. 생년월일은 YYYYMMDD 형식, 사업자번호는 10자리 숫자로 입력하세요.";
    ws.getRow(8).getCell(1).value = "4. 이 유의사항 행들을 삭제하지 마세요. 데이터는 2행부터 입력하세요.";

    [12, 16, 18, 12, 8, 30, 20, 14, 14].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "수입지출처_일괄등록_양식.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">수입지출처 일괄등록</h2>

      <div className="bg-white rounded-lg border p-4 space-y-4">
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <HelpTooltip id="cust-batch.file">
              <Label>엑셀파일 선택</Label>
            </HelpTooltip>
            <Input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileSelect}
            />
          </div>
        </div>

        {file && (
          <p className="text-sm text-gray-500">
            파일: {file.name} | 파싱된 건수: {parsed.length}건
            {validated && errors.length === 0 && " | 오류 없음"}
            {validated && errors.length > 0 && ` | 오류 ${errors.length}건`}
          </p>
        )}

        <div className="flex gap-2 pt-4 border-t">
          <HelpTooltip id="cust-batch.validate">
            <Button
              variant="outline"
              onClick={handleValidate}
              disabled={parsed.length === 0}
            >
              저장 전 자료확인
            </Button>
          </HelpTooltip>
          <HelpTooltip id="cust-batch.save">
            <Button
              onClick={handleSave}
              disabled={!validated || errors.length > 0 || saving}
            >
              {saving ? "저장 중..." : "저장"}
            </Button>
          </HelpTooltip>
          <Button
            variant="outline"
            onClick={() => {
              setParsed([]);
              setErrors([]);
              setValidated(false);
              setFile(null);
            }}
            disabled={parsed.length === 0}
          >
            삭제
          </Button>
          <Button
            variant="destructive"
            onClick={handleDeleteAll}
            disabled={parsed.length === 0}
          >
            일괄삭제
          </Button>
          <HelpTooltip id="cust-batch.excel">
            <Button variant="outline" onClick={handleExcel}>
              엑셀
            </Button>
          </HelpTooltip>
        </div>
      </div>

      {/* 오류 표시 */}
      {errors.length > 0 && (
        <div className="bg-red-50 rounded-lg border border-red-200 p-4">
          <h3 className="font-semibold text-red-700 mb-2">
            오류 목록 ({errors.length}건)
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-red-200">
                <th className="px-2 py-1 text-left">행</th>
                <th className="px-2 py-1 text-left">오류 내용</th>
                <th className="px-2 py-1 text-left">성명</th>
                <th className="px-2 py-1 text-left">구분</th>
              </tr>
            </thead>
            <tbody>
              {errors.map((e) => (
                <tr key={e.rowNum} className="border-b border-red-100">
                  <td className="px-2 py-1">{e.rowNum}</td>
                  <td className="px-2 py-1 text-red-600">{e.error}</td>
                  <td className="px-2 py-1">{e.name}</td>
                  <td className="px-2 py-1">{e.custSecCd}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 데이터 미리보기 */}
      {parsed.length > 0 && errors.length === 0 && (
        <div className="bg-white rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-2 py-2 text-left">행</th>
                <th className="px-2 py-2 text-left">구분</th>
                <th className="px-2 py-2 text-left">성명(명칭)</th>
                <th className="px-2 py-2 text-left">생년월일/사업자번호</th>
                <th className="px-2 py-2 text-left">직업</th>
                <th className="px-2 py-2 text-left">전화번호</th>
                <th className="px-2 py-2 text-left">주소</th>
              </tr>
            </thead>
            <tbody>
              {parsed.slice(0, 100).map((r) => (
                <tr key={r.rowNum} className="border-b">
                  <td className="px-2 py-1">{r.rowNum}</td>
                  <td className="px-2 py-1">{r.custSecCd}</td>
                  <td className="px-2 py-1 font-medium">{r.name}</td>
                  <td className="px-2 py-1">{r.regNum}</td>
                  <td className="px-2 py-1">{r.job}</td>
                  <td className="px-2 py-1">{r.tel}</td>
                  <td className="px-2 py-1">
                    {r.addr}
                    {r.addrDetail ? ` ${r.addrDetail}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {parsed.length > 100 && (
            <p className="p-2 text-sm text-gray-400">
              ... 외 {parsed.length - 100}건 더
            </p>
          )}
        </div>
      )}
    </div>
  );
}
