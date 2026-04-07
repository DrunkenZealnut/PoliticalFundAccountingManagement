"use client";

import { useState, useRef } from "react";
import { useAuth } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ParsedRow {
  rowNum: number;
  account: string;   // A: 계정
  subject: string;   // B: 과목
  date: string;      // C: 수입(지출)일자
  content: string;   // D: 내역
  provider: string;  // E: 수입제공자/지출대상자
  regNum: string;    // F: 생년월일(사업자번호)
  postCode: string;  // G: 우편번호
  addr: string;      // H: 주소
  addrDetail: string;// I: 상세주소
  job: string;       // J: 직업(업종)
  tel: string;       // K: 전화번호
  amount: number;    // L: 금액
  receiptYn: string; // M: 증빙서첨부
  receiptNo: string; // N: 영수증번호/미첨부사유
  custType: string;  // O: 수입지출처구분
  bigo: string;      // P: 비고
}

interface ErrorRow extends ParsedRow {
  errorType: "required" | "format";
  error: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fmt(n: number) { return n.toLocaleString("ko-KR"); }

function fmtDate(d: string) {
  const s = d.replace(/[.\-\/]/g, "").slice(0, 8);
  if (s.length === 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return d;
}

function cellStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object" && "result" in (v as Record<string, unknown>)) return String((v as Record<string, unknown>).result ?? "");
  return String(v);
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function BatchImportPage() {
  const { orgId, orgType } = useAuth();

  const [tab, setTab] = useState("income");
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [requiredErrors, setRequiredErrors] = useState<ErrorRow[]>([]);
  const [formatErrors, setFormatErrors] = useState<ErrorRow[]>([]);
  const [validated, setValidated] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const totalAmount = parsed.reduce((s, r) => s + r.amount, 0);
  const errorCount = requiredErrors.length + formatErrors.length;
  const isExpense = tab === "expense";
  const typeLabel = isExpense ? "지출" : "수입";

  /* ---- Excel parsing ---- */
  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setParsed([]);
    setRequiredErrors([]);
    setFormatErrors([]);
    setValidated(false);

    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    const buffer = await f.arrayBuffer();
    await workbook.xlsx.load(buffer);

    // Find first visible data sheet (skip DB sheet)
    const sheet = workbook.worksheets.find((ws) => ws.name !== "DB") || workbook.worksheets[0];
    if (!sheet) { alert("엑셀 시트를 찾을 수 없습니다."); return; }

    // Find header row (row 5 in template: *계정, *과목, ...)
    let headerRow = 5;
    for (let r = 1; r <= 10; r++) {
      const val = cellStr(sheet.getRow(r).getCell(1).value);
      if (val.includes("계정")) { headerRow = r; break; }
    }
    const dataStartRow = headerRow + 1;

    const rows: ParsedRow[] = [];
    sheet.eachRow((row, rowNum) => {
      if (rowNum < dataStartRow) return;
      const c = (col: number) => cellStr(row.getCell(col).value);
      // Skip entirely empty rows
      if (!c(1) && !c(3) && !c(4) && !c(5) && !c(12)) return;

      rows.push({
        rowNum,
        account: c(1),
        subject: c(2),
        date: c(3),
        content: c(4),
        provider: c(5),
        regNum: c(6),
        postCode: c(7),
        addr: c(8),
        addrDetail: c(9),
        job: c(10),
        tel: c(11),
        amount: Number(c(12)) || 0,
        receiptYn: c(13).toUpperCase() || "N",
        receiptNo: c(14),
        custType: c(15) || "개인",
        bigo: c(16),
      });
    });

    setParsed(rows);
  }

  /* ---- Validation ---- */
  function handleValidate() {
    const reqErrs: ErrorRow[] = [];
    const fmtErrs: ErrorRow[] = [];

    for (const row of parsed) {
      // 필수 입력 오류
      const missing: string[] = [];
      if (!row.account) missing.push("계정");
      if (!row.subject) missing.push("과목");
      if (!row.date) missing.push(`${typeLabel}일자`);
      if (!row.content) missing.push("내역");
      if (!row.amount) missing.push("금액");
      if (!row.receiptYn) missing.push("증빙서첨부");
      if (!row.custType) missing.push("수입지출처구분");

      if (missing.length > 0) {
        reqErrs.push({ ...row, errorType: "required", error: `필수항목 누락: ${missing.join(", ")}` });
      }

      // 데이터 형식 오류
      const fmtMsgs: string[] = [];
      const dateClean = row.date.replace(/[.\-\/]/g, "").slice(0, 8);
      if (dateClean && (dateClean.length !== 8 || isNaN(Number(dateClean)))) {
        fmtMsgs.push("일자 형식 오류 (YYYYMMDD 또는 YYYY-MM-DD)");
      }
      if (row.amount && isNaN(row.amount)) {
        fmtMsgs.push("금액은 숫자만 입력");
      }
      if (row.receiptYn && !["Y", "N"].includes(row.receiptYn)) {
        fmtMsgs.push("증빙서첨부는 Y 또는 N");
      }

      if (fmtMsgs.length > 0) {
        fmtErrs.push({ ...row, errorType: "format", error: fmtMsgs.join(", ") });
      }
    }

    setRequiredErrors(reqErrs);
    setFormatErrors(fmtErrs);
    setValidated(true);

    const total = reqErrs.length + fmtErrs.length;
    if (total > 0) {
      alert(`오류 ${total}건 발견 (필수입력 ${reqErrs.length}건, 형식 ${fmtErrs.length}건).\n오류를 수정한 후 다시 업로드하세요.`);
    } else {
      alert(`${parsed.length}건 검증 완료. 오류 없음. [저장] 가능합니다.`);
    }
  }

  /* ---- Save ---- */
  async function handleSave() {
    if (!orgId || errorCount > 0 || !validated) {
      alert("먼저 [저장 전 자료확인]을 실행하세요.");
      return;
    }
    if (!confirm(`${parsed.length}건을 일괄 등록하시겠습니까?`)) return;

    setSaving(true);
    const incmSecCd = isExpense ? 2 : 1;

    const rows = parsed.map((row) => {
      const dateStr = row.date.replace(/[.\-\/]/g, "").slice(0, 8);
      return {
        org_id: orgId,
        incm_sec_cd: incmSecCd,
        acc_sec_cd: 0,
        item_sec_cd: 0,
        exp_sec_cd: 0,
        acc_date: dateStr,
        content: row.content,
        acc_amt: row.amount,
        rcp_yn: row.receiptYn === "Y" ? "Y" : "N",
        rcp_no: row.receiptYn === "Y" ? (row.receiptNo || null) : null,
        bigo: row.receiptYn === "N" ? (row.receiptNo || null) : (row.bigo || null),
        _provider: row.provider,
        _regNum: row.regNum,
        _custType: row.custType,
        _account: row.account,
        _subject: row.subject,
        _addr: row.addr,
        _addrDetail: row.addrDetail,
        _job: row.job,
        _tel: row.tel,
        _postCode: row.postCode,
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
        handleReset();
      } else {
        alert(`등록 실패: ${result.error}`);
      }
    } catch {
      alert("등록 중 오류가 발생했습니다.");
    }
    setSaving(false);
  }

  /* ---- Error Excel download ---- */
  async function handleDownloadErrors() {
    const allErrors = [...requiredErrors, ...formatErrors];
    if (allErrors.length === 0) return;

    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("오류목록");
    const headers = ["행번호", "오류유형", "오류내용", "계정", "과목", "일자", "내역", "수입제공자", "금액"];
    const hr = ws.getRow(1);
    headers.forEach((h, i) => {
      const cell = hr.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC7CE" } };
    });
    allErrors.forEach((e, i) => {
      const row = ws.getRow(i + 2);
      row.getCell(1).value = e.rowNum;
      row.getCell(2).value = e.errorType === "required" ? "필수입력" : "형식오류";
      row.getCell(3).value = e.error;
      row.getCell(4).value = e.account;
      row.getCell(5).value = e.subject;
      row.getCell(6).value = e.date;
      row.getCell(7).value = e.content;
      row.getCell(8).value = e.provider;
      row.getCell(9).value = e.amount;
    });
    ws.columns = [{ width: 8 }, { width: 10 }, { width: 35 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 20 }, { width: 15 }, { width: 12 }];
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `일괄등록_오류_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleReset() {
    setFile(null);
    setParsed([]);
    setRequiredErrors([]);
    setFormatErrors([]);
    setValidated(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  /* ---- Error table component ---- */
  function ErrorTable({ rows, title }: { rows: ErrorRow[]; title: string }) {
    if (rows.length === 0) return <p className="text-sm text-gray-400 py-4 text-center">{title} 없음</p>;
    return (
      <div className="overflow-auto max-h-[250px]">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b sticky top-0">
            <tr>
              <th className="px-2 py-1 text-left">번호</th>
              <th className="px-2 py-1 text-left">구분</th>
              <th className="px-2 py-1 text-left">{typeLabel}제공자</th>
              <th className="px-2 py-1 text-left">생년월일(사업자번호)</th>
              <th className="px-2 py-1 text-left">내역</th>
              <th className="px-2 py-1 text-left">오류내용</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b hover:bg-red-50/50">
                <td className="px-2 py-1">{r.rowNum}</td>
                <td className="px-2 py-1">{r.account}/{r.subject}</td>
                <td className="px-2 py-1">{r.provider}</td>
                <td className="px-2 py-1">{r.regNum}</td>
                <td className="px-2 py-1">{r.content}</td>
                <td className="px-2 py-1 text-red-600">{r.error}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  /* ---- Render ---- */
  const thCls = "px-2 py-1.5 text-left text-xs font-semibold bg-gray-50 border-b whitespace-nowrap";
  const tdCls = "px-2 py-1 text-xs border-b whitespace-nowrap";

  return (
    <div className="space-y-4">
      {/* Header + actions */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">수입 지출내역 일괄등록</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleValidate} disabled={parsed.length === 0}>
            저장 전 자료확인
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!validated || errorCount > 0 || saving}>
            {saving ? "저장 중..." : "저장"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset}>
            초기화
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => { setTab(v); handleReset(); }}>
        <TabsList>
          <TabsTrigger value="income">수 입 내 역</TabsTrigger>
          <TabsTrigger value="expense">지 출 내 역</TabsTrigger>
          {orgType === "supporter" && (
            <TabsTrigger value="supporter-center">정치후원금센터 후원금 자료 (수입)</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value={tab} className="space-y-4">
          {/* Upper grid: parsed data preview */}
          <div className="bg-white rounded-lg border">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50">
              <span className="text-sm font-semibold">{typeLabel}내역 미리보기</span>
              <span className="text-sm">
                자 료 <b className="text-blue-600 mx-1">{parsed.length}</b>건
                <span className="ml-4">{fmt(totalAmount)}</span> 원
              </span>
            </div>
            <div className="overflow-auto max-h-[320px]">
              <table className="w-full text-left">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className={thCls}>번호</th>
                    <th className={thCls}>계정</th>
                    <th className={thCls}>과목</th>
                    <th className={thCls}>{typeLabel}일자</th>
                    <th className={thCls}>내역</th>
                    <th className={thCls}>{typeLabel}제공자</th>
                    <th className={thCls}>생년월일(사업자번호)</th>
                    <th className={thCls}>주소</th>
                    <th className={thCls}>직업(업종)</th>
                    <th className={thCls}>전화번호</th>
                    <th className={`${thCls} text-right`}>금액</th>
                    <th className={thCls}>증빙</th>
                    <th className={thCls}>증빙서번호/미첨부사유</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.length === 0 ? (
                    <tr><td colSpan={13} className="px-3 py-8 text-center text-gray-400 text-sm">엑셀파일을 업로드하면 여기에 미리보기가 표시됩니다.</td></tr>
                  ) : (
                    parsed.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className={tdCls}>{i + 1}</td>
                        <td className={tdCls}>{r.account}</td>
                        <td className={tdCls}>{r.subject}</td>
                        <td className={tdCls}>{fmtDate(r.date)}</td>
                        <td className={tdCls}>{r.content}</td>
                        <td className={tdCls}>{r.provider}</td>
                        <td className={tdCls}>{r.regNum}</td>
                        <td className={tdCls}>{[r.addr, r.addrDetail].filter(Boolean).join(" ")}</td>
                        <td className={tdCls}>{r.job}</td>
                        <td className={tdCls}>{r.tel}</td>
                        <td className={`${tdCls} text-right font-mono`}>{fmt(r.amount)}</td>
                        <td className={tdCls}>{r.receiptYn === "Y" ? <span className="text-green-600">O</span> : <span className="text-red-500">X</span>}</td>
                        <td className={tdCls}>{r.receiptNo}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Lower section: file upload + errors */}
          <div className="bg-white rounded-lg border p-4 space-y-4">
            {/* File upload row */}
            <div className="flex items-end gap-4 flex-wrap">
              <div className="flex items-end gap-2 flex-1 min-w-[300px]">
                <div className="flex-1">
                  <Label>엑셀파일</Label>
                  <Input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFileSelect} />
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                {file && <span className="text-gray-500">{file.name}</span>}
                <span>엑셀파일 내 자료건수 <b className="text-blue-600">{parsed.length}</b></span>
                <span>오류건수 <b className={errorCount > 0 ? "text-red-600" : "text-gray-600"}>{errorCount}</b></span>
              </div>
              <Button variant="outline" size="sm" onClick={handleDownloadErrors} disabled={errorCount === 0}>
                오류 엑셀
              </Button>
            </div>

            {/* Sample download */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500">샘플 양식:</span>
              <a
                href="/templates/수입지출_일괄등록_샘플.xlsx"
                download
                className="text-blue-600 hover:underline"
              >
                수입지출 일괄등록 엑셀 샘플 다운로드
              </a>
              <span className="text-gray-400 text-xs">
                (* 계정, 과목, {typeLabel}일자, 내역, 금액, 증빙서첨부, 수입지출처구분 필수)
              </span>
            </div>

            {/* Error tabs */}
            {validated && (
              <Tabs defaultValue={0}>
                <TabsList variant="line">
                  <TabsTrigger value={0}>필수 입력 오류 ({requiredErrors.length})</TabsTrigger>
                  <TabsTrigger value={1}>데이터 형식 오류 ({formatErrors.length})</TabsTrigger>
                </TabsList>
                <TabsContent value={0} className="pt-2">
                  <ErrorTable rows={requiredErrors} title="필수 입력 오류" />
                </TabsContent>
                <TabsContent value={1} className="pt-2">
                  <ErrorTable rows={formatErrors} title="데이터 형식 오류" />
                </TabsContent>
              </Tabs>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
