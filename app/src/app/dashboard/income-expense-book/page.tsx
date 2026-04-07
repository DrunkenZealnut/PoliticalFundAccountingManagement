"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { useCodeValues } from "@/hooks/use-code-values";
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
  acc_print_ok: string | null;
  customer: {
    name: string | null;
    reg_num: string | null;
    addr: string | null;
    job: string | null;
    tel: string | null;
  } | null;
}

interface RowWithTotals extends BookRow {
  incCum: number;
  expCum: number;
  balance: number;
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

  const incAccounts = orgSecCd ? getAccounts(orgSecCd, 1) : [];
  const expAccounts = orgSecCd ? getAccounts(orgSecCd, 2) : [];
  const allAccounts = [...new Map([...incAccounts, ...expAccounts].map((a) => [a.cv_id, a])).values()];
  const incItems = orgSecCd && accSecCd ? getItems(orgSecCd, 1, accSecCd) : [];
  const expItems = orgSecCd && accSecCd ? getItems(orgSecCd, 2, accSecCd) : [];
  const allItems = [...new Map([...incItems, ...expItems].map((a) => [a.cv_id, a])).values()];

  const fmt = (n: number) => n.toLocaleString("ko-KR");
  const fmtDate = (d: string) =>
    d.length === 8 ? `${d.slice(0, 4)}/${d.slice(4, 6)}/${d.slice(6, 8)}` : d;

  function getCust(r: BookRow) {
    const c = r.customer;
    if (!c) return { name: "-", regNum: "", addr: "", job: "", tel: "" };
    // Handle array case from Supabase join
    const obj = Array.isArray(c) ? c[0] : c;
    return {
      name: (obj as { name?: string })?.name || "-",
      regNum: (obj as { reg_num?: string })?.reg_num || "",
      addr: (obj as { addr?: string })?.addr || "",
      job: (obj as { job?: string })?.job || "",
      tel: (obj as { tel?: string })?.tel || "",
    };
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
      .select("acc_book_id, incm_sec_cd, acc_sec_cd, item_sec_cd, acc_date, content, acc_amt, rcp_yn, rcp_no, bigo, acc_print_ok, customer:cust_id(name, reg_num, addr, job, tel)")
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

    const border: Partial<import("exceljs").Borders> = {
      top: { style: "thin" }, bottom: { style: "thin" },
      left: { style: "thin" }, right: { style: "thin" },
    };
    const hdrFont: Partial<import("exceljs").Font> = { bold: true, size: 9 };
    const ctrAlign: Partial<import("exceljs").Alignment> = { horizontal: "center", vertical: "middle", wrapText: true };

    // Title
    ws.mergeCells("A1:O1");
    const title = ws.getCell("A1");
    title.value = "정 치 자 금  수 입 · 지 출 부";
    title.font = { bold: true, size: 14 };
    title.alignment = { horizontal: "center" };

    ws.mergeCells("N2:O2");
    ws.getCell("N2").value = "(금액단위 : 원)";
    ws.getCell("N2").alignment = { horizontal: "right" };
    ws.getCell("N2").font = { size: 9 };

    if (accSecCd || itemSecCd) {
      ws.getCell("A3").value = `[계정: ${accSecCd ? getName(accSecCd) : "전체"}]  [과목: ${itemSecCd ? getName(itemSecCd) : "전체"}]`;
      ws.getCell("A3").font = { bold: true, size: 10 };
    }

    // 2-row headers (row 5-6)
    ws.mergeCells("A5:A6"); ws.getRow(5).getCell(1).value = "번호";
    ws.mergeCells("B5:B6"); ws.getRow(5).getCell(2).value = "년월일";
    ws.mergeCells("C5:C6"); ws.getRow(5).getCell(3).value = "내 역";
    ws.mergeCells("D5:E5"); ws.getRow(5).getCell(4).value = "수 입 액";
    ws.getRow(6).getCell(4).value = "금회"; ws.getRow(6).getCell(5).value = "누계";
    ws.mergeCells("F5:G5"); ws.getRow(5).getCell(6).value = "지 출 액";
    ws.getRow(6).getCell(6).value = "금회"; ws.getRow(6).getCell(7).value = "누계";
    ws.mergeCells("H5:H6"); ws.getRow(5).getCell(8).value = "잔 액";
    ws.mergeCells("I5:M5"); ws.getRow(5).getCell(9).value = "수입을 제공한 자 또는 지출을 받은 자";
    ws.getRow(6).getCell(9).value = "성명\n(법인·단체명)";
    ws.getRow(6).getCell(10).value = "생년월일\n(사업자번호)";
    ws.getRow(6).getCell(11).value = "주소";
    ws.getRow(6).getCell(12).value = "직업\n(업종)";
    ws.getRow(6).getCell(13).value = "전화번호";
    ws.mergeCells("N5:N6"); ws.getRow(5).getCell(14).value = "영수증\n일련번호";
    ws.mergeCells("O5:O6"); ws.getRow(5).getCell(15).value = "비 고";

    for (let r = 5; r <= 6; r++) {
      for (let c = 1; c <= 15; c++) {
        const cell = ws.getRow(r).getCell(c);
        cell.font = hdrFont; cell.alignment = ctrAlign; cell.border = border;
      }
    }

    ws.getColumn(1).width = 5; ws.getColumn(2).width = 11; ws.getColumn(3).width = 18;
    ws.getColumn(4).width = 12; ws.getColumn(5).width = 12;
    ws.getColumn(6).width = 12; ws.getColumn(7).width = 12;
    ws.getColumn(8).width = 12; ws.getColumn(9).width = 12;
    ws.getColumn(10).width = 12; ws.getColumn(11).width = 20;
    ws.getColumn(12).width = 8; ws.getColumn(13).width = 14;
    ws.getColumn(14).width = 10; ws.getColumn(15).width = 8;

    let incCum = 0, expCum = 0;
    records.forEach((r, idx) => {
      const isIncome = r.incm_sec_cd === 1;
      if (isIncome) incCum += r.acc_amt; else expCum += r.acc_amt;
      const cust = getCust(r);
      const row = ws.getRow(7 + idx);
      row.getCell(1).value = idx + 1;
      row.getCell(2).value = fmtDate(r.acc_date);
      row.getCell(3).value = r.content;
      row.getCell(4).value = isIncome ? r.acc_amt : null;
      row.getCell(5).value = isIncome ? incCum : null;
      row.getCell(6).value = !isIncome ? r.acc_amt : null;
      row.getCell(7).value = !isIncome ? expCum : null;
      row.getCell(8).value = incCum - expCum;
      row.getCell(9).value = cust.name;
      row.getCell(10).value = cust.regNum;
      row.getCell(11).value = cust.addr;
      row.getCell(12).value = cust.job;
      row.getCell(13).value = cust.tel;
      row.getCell(14).value = r.rcp_no || "";
      row.getCell(15).value = r.bigo || "";
      for (let c = 1; c <= 15; c++) {
        row.getCell(c).border = border;
        row.getCell(c).font = { size: 9 };
        if ([4, 5, 6, 7, 8].includes(c)) { row.getCell(c).numFmt = "#,##0"; row.getCell(c).alignment = { horizontal: "right" }; }
      }
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
  const rows: RowWithTotals[] = records.map((r) => {
    if (r.incm_sec_cd === 1) incCum += r.acc_amt; else expCum += r.acc_amt;
    return { ...r, incCum, expCum, balance: incCum - expCum };
  });

  const totalIncome = records.filter((r) => r.incm_sec_cd === 1).reduce((s, r) => s + r.acc_amt, 0);
  const totalExpense = records.filter((r) => r.incm_sec_cd === 2).reduce((s, r) => s + r.acc_amt, 0);

  if (codesLoading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">코드 데이터 로딩 중...</div>;
  }

  const th1 = "border border-gray-300 px-2 py-1.5 text-xs font-bold text-center bg-gray-100 whitespace-nowrap";
  const th2 = "border border-gray-300 px-2 py-1 text-[11px] font-bold text-center bg-gray-100 whitespace-nowrap";
  const td = "border border-gray-300 px-2 py-1 text-xs whitespace-nowrap";
  const tdR = "border border-gray-300 px-2 py-1 text-xs whitespace-nowrap text-right font-mono";

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

      {records.length > 0 && (
        <div className="flex gap-6 text-sm bg-gray-50 rounded p-3">
          <span>총 건수: <b>{records.length}건</b></span>
          <span>수입합계: <b className="text-blue-600">{fmt(totalIncome)}원</b></span>
          <span>지출합계: <b className="text-red-600">{fmt(totalExpense)}원</b></span>
          <span>잔액: <b className="text-green-600">{fmt(totalIncome - totalExpense)}원</b></span>
        </div>
      )}

      {/* 2단 헤더 테이블 */}
      <div className="bg-white rounded-lg border overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th rowSpan={2} className={th1}>번호</th>
              <th rowSpan={2} className={th1}>전송</th>
              <th rowSpan={2} className={th1}>년월일</th>
              <th rowSpan={2} className={th1}>내 역</th>
              <th colSpan={2} className={th1}>수 입 액</th>
              <th colSpan={2} className={th1}>지 출 액</th>
              <th rowSpan={2} className={th1}>잔 액</th>
              <th colSpan={5} className={th1}>수입을 제공한 자 또는 지출을 받은 자</th>
              <th rowSpan={2} className={th1}>영수증<br/>일련번호</th>
              <th rowSpan={2} className={th1}>비고</th>
            </tr>
            <tr>
              <th className={th2}>금회</th>
              <th className={th2}>누계</th>
              <th className={th2}>금회</th>
              <th className={th2}>누계</th>
              <th className={th2}>성명<br/>(법인·단체명)</th>
              <th className={th2}>생년월일<br/>(사업자번호)</th>
              <th className={th2}>주소 또는<br/>사무소소재지</th>
              <th className={th2}>직업<br/>(업종)</th>
              <th className={th2}>전화번호</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={16} className="px-3 py-8 text-center text-gray-400">로딩 중...</td></tr>
            ) : records.length === 0 ? (
              <tr><td colSpan={16} className="px-3 py-8 text-center text-gray-400">기간을 설정 후 [조회]를 클릭하세요.</td></tr>
            ) : (
              rows.map((r, i) => {
                const isIncome = r.incm_sec_cd === 1;
                const cust = getCust(r);
                return (
                  <tr key={r.acc_book_id} className="hover:bg-gray-50">
                    <td className={td}>{i + 1}</td>
                    <td className={`${td} text-center`}>
                      {r.acc_print_ok === "Y" ? <span className="text-green-500">V</span> : ""}
                    </td>
                    <td className={td}>{fmtDate(r.acc_date)}</td>
                    <td className={td}>{r.content}</td>
                    <td className={`${tdR} text-blue-600`}>{isIncome ? fmt(r.acc_amt) : ""}</td>
                    <td className={`${tdR} text-blue-400`}>{isIncome ? fmt(r.incCum) : ""}</td>
                    <td className={`${tdR} text-red-600`}>{!isIncome ? fmt(r.acc_amt) : ""}</td>
                    <td className={`${tdR} text-red-400`}>{!isIncome ? fmt(r.expCum) : ""}</td>
                    <td className={`${tdR} font-semibold text-green-700`}>{fmt(r.balance)}</td>
                    <td className={td}>{cust.name}</td>
                    <td className={td}>{cust.regNum}</td>
                    <td className={td}>{cust.addr}</td>
                    <td className={td}>{cust.job}</td>
                    <td className={td}>{cust.tel}</td>
                    <td className={td}>{r.rcp_no || ""}</td>
                    <td className={`${td} text-gray-500`}>{r.bigo || ""}</td>
                  </tr>
                );
              })
            )}
          </tbody>
          {records.length > 0 && (
            <tfoot>
              <tr className="bg-gray-100 font-bold">
                <td colSpan={4} className={`${td} text-right`}>합 계</td>
                <td className={tdR}>{fmt(totalIncome)}</td>
                <td className={tdR} />
                <td className={tdR}>{fmt(totalExpense)}</td>
                <td className={tdR} />
                <td className={`${tdR} text-green-700`}>{fmt(totalIncome - totalExpense)}</td>
                <td colSpan={7} className={td} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
