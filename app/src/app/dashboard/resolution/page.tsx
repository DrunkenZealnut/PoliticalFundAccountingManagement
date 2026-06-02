"use client";

import { useState, useCallback } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { useCodeValues } from "@/hooks/use-code-values";
import { useSort, SortTh } from "@/hooks/use-sort";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpTooltip } from "@/components/help-tooltip";
import { CodeSelect } from "@/components/code-select";

const PAY_METHODS: Record<string, string> = {
  "118": "계좌입금",
  "119": "카드",
  "120": "현금",
  "583": "수표",
  "584": "신용카드",
  "585": "체크카드",
  "121": "미지급",
  "122": "기타",
};

const MAX_EXCEL_ITEMS = 10;

/** 계정명 → 증빙서 접두어 */
const ACC_PREFIX_MAP: Record<string, string> = {
  "후보자등자산": "자",
  "후원회기부금": "후",
  "보조금": "보",
  "보조금외지원금": "기",
};

/** 증빙서이름 생성: 예) 자(비)-1, 보-3 */
function buildReceiptLabel(
  accName: string,
  itemName: string,
  rcpNo: string | null,
): string {
  if (!rcpNo) return "";
  // 계정 접두어
  let prefix = "";
  for (const [key, val] of Object.entries(ACC_PREFIX_MAP)) {
    if (accName.includes(key)) { prefix = val; break; }
  }
  if (!prefix) prefix = accName.charAt(0) || "?";
  // 과목: 선거비용외 → (비), 선거비용 → 없음
  const isNonElection = itemName.includes("선거비용외") || itemName.includes("비용외");
  const suffix = isNonElection ? "(비)" : "";
  return `${prefix}${suffix}-${rcpNo}`;
}

interface ResolutionRow {
  acc_book_id: number;
  acc_sec_cd: number;
  item_sec_cd: number;
  exp_sec_cd: number;
  acc_date: string;
  content: string;
  acc_amt: number;
  rcp_yn: string;
  rcp_no: string | null;
  acc_ins_type: string | null;
  bigo: string | null;
  customer: Record<string, unknown> | Record<string, unknown>[] | null;
}

export default function ResolutionPage() {
  const supabase = createSupabaseBrowser();
  const { orgId, orgSecCd } = useAuth();
  const {
    loading: codesLoading,
    getName,
    getAccounts,
    getItems,
  } = useCodeValues();

  const [accSecCd, setAccSecCd] = useState(0);
  const [itemSecCd, setItemSecCd] = useState(0);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [department, setDepartment] = useState("");
  const [fundType, setFundType] = useState("");
  const [records, setRecords] = useState<ResolutionRow[]>([]);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);

  const accountOptions = orgSecCd ? getAccounts(orgSecCd, 2) : [];
  const itemOptions =
    orgSecCd && accSecCd ? getItems(orgSecCd, 2, accSecCd) : [];

  const fmt = (n: number) => n.toLocaleString("ko-KR");
  const fmtDate = (d: string) =>
    d.length === 8
      ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
      : d;

  function getCustName(c: ResolutionRow["customer"]): string {
    if (!c) return "-";
    const obj = Array.isArray(c) ? c[0] : c;
    return (obj as { name?: string })?.name || "-";
  }

  const handleQuery = useCallback(async () => {
    if (!orgId) return;
    if (!dateFrom || !dateTo) {
      alert("지출기간을 입력하세요.");
      return;
    }

    setLoading(true);
    const fromStr = dateFrom.replace(/-/g, "");
    const toStr = dateTo.replace(/-/g, "");

    let query = supabase
      .from("acc_book")
      .select(
        "acc_book_id, acc_sec_cd, item_sec_cd, exp_sec_cd, acc_date, content, acc_amt, rcp_yn, rcp_no, acc_ins_type, bigo, customer:cust_id(name, reg_num, addr, job, tel)"
      )
      .eq("org_id", orgId)
      .eq("incm_sec_cd", 2)
      .gte("acc_date", fromStr)
      .lte("acc_date", toStr)
      .order("acc_date", { ascending: true })
      .order("acc_sort_num", { ascending: true });

    if (accSecCd) query = query.eq("acc_sec_cd", accSecCd);
    if (itemSecCd) query = query.eq("item_sec_cd", itemSecCd);

    const { data } = await query;
    setRecords((data || []) as unknown as ResolutionRow[]);
    setCheckedIds(new Set());
    setLoading(false);
  }, [orgId, supabase, dateFrom, dateTo, accSecCd, itemSecCd]);

  function toggleCheck(id: number) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (checkedIds.size === records.length) setCheckedIds(new Set());
    else setCheckedIds(new Set(records.map((r) => r.acc_book_id)));
  }

  async function handleExcel() {
    if (checkedIds.size === 0) {
      alert("출력할 지출내역을 선택하세요.");
      return;
    }
    if (checkedIds.size > MAX_EXCEL_ITEMS) {
      alert(`지출결의서는 최대 ${MAX_EXCEL_ITEMS}건까지 출력 가능합니다.`);
      return;
    }

    const selected = records.filter((r) => checkedIds.has(r.acc_book_id));

    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();

    const thin: Partial<import("exceljs").Borders> = {
      top: { style: "thin" }, bottom: { style: "thin" },
      left: { style: "thin" }, right: { style: "thin" },
    };
    const ctr: Partial<import("exceljs").Alignment> = { horizontal: "center", vertical: "middle", wrapText: true };
    const bFont: Partial<import("exceljs").Font> = { name: "맑은 고딕", size: 10 };

    const today = new Date();
    const todayFmt = `${today.getFullYear()}년${String(today.getMonth() + 1).padStart(2, "0")}월${String(today.getDate()).padStart(2, "0")}일`;

    function fmtDateKo(d: string) {
      if (d.length === 8) return `${d.slice(0, 4)}년 ${d.slice(4, 6)}월 ${d.slice(6, 8)}일`;
      return d;
    }

    function getCust(c: ResolutionRow["customer"]): Record<string, string> {
      if (!c) return {};
      const obj = Array.isArray(c) ? c[0] : c;
      return (obj || {}) as Record<string, string>;
    }

    /** Apply thin border to a rectangular range */
    function applyBorders(sheet: import("exceljs").Worksheet, r1: number, c1: number, r2: number, c2: number) {
      for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) {
          sheet.getRow(r).getCell(c).border = thin;
        }
      }
    }

    selected.forEach((r, idx) => {
      const cust = getCust(r.customer);
      const accName = getName(r.acc_sec_cd);
      const itemName = getName(r.item_sec_cd);
      const sheetName = `결의서${idx + 1}`;
      const ws = workbook.addWorksheet(sheetName);

      /* Row heights */
      ws.getRow(2).height = 54;
      ws.getRow(3).height = 26.25;
      ws.getRow(4).height = 46.5;
      ws.getRow(5).height = 18.75;
      for (let i = 6; i <= 18; i++) ws.getRow(i).height = 34.5;
      for (let i = 19; i <= 21; i++) ws.getRow(i).height = 25.5;

      /* Row 2: Title */
      ws.mergeCells("A2:G2");
      const title = ws.getCell("A2");
      title.value = "지 출 결 의 서";
      title.font = { ...bFont, bold: true, size: 16 };
      title.alignment = ctr;

      /* Row 3-4: 결의문 + 결재 */
      ws.mergeCells("A3:B4");
      ws.getCell("A3").value = "아래와 같이 지출할 것을 결의함.";
      ws.getCell("A3").font = bFont;
      ws.getCell("A3").alignment = { ...ctr, wrapText: true };

      ws.mergeCells("C3:C4");
      ws.getCell("C3").value = "결\n\n재";
      ws.getCell("C3").font = { ...bFont, bold: true };
      ws.getCell("C3").alignment = ctr;
      // 결재란 D-G columns row 3-4 (stamp boxes)
      for (let c = 3; c <= 7; c++) {
        ws.getRow(3).getCell(c).border = thin;
        ws.getRow(4).getCell(c).border = thin;
      }

      /* Row 5: Date */
      ws.mergeCells("A5:B5");
      ws.getCell("A5").value = fmtDateKo(r.acc_date);
      ws.getCell("A5").font = bFont;
      ws.getCell("A5").alignment = ctr;
      ws.mergeCells("C5:G5");

      /* Row 6: 소관부서 + 청구일자 */
      ws.getCell("A6").value = "소 관 (발 의)\n부         서";
      ws.getCell("A6").font = bFont;
      ws.getCell("A6").alignment = ctr;
      ws.getCell("B6").value = department || "";
      ws.getCell("B6").font = bFont;
      ws.getCell("B6").alignment = ctr;
      ws.mergeCells("C6:D6");
      ws.getCell("C6").value = "청 구 일 자";
      ws.getCell("C6").font = bFont;
      ws.getCell("C6").alignment = ctr;
      ws.mergeCells("E6:G6");
      ws.getCell("E6").value = todayFmt;
      ws.getCell("E6").font = bFont;
      ws.getCell("E6").alignment = ctr;

      /* Row 7-8: 정치자금종류 + 지출금액 + 지출과목 */
      ws.getCell("A7").value = "정치자금 종류";
      ws.getCell("A7").font = bFont;
      ws.getCell("A7").alignment = ctr;
      ws.getCell("B7").value = fundType || accName;
      ws.getCell("B7").font = bFont;
      ws.getCell("B7").alignment = ctr;
      ws.mergeCells("C7:D8");
      ws.getCell("C7").value = "지 출 금 액";
      ws.getCell("C7").font = bFont;
      ws.getCell("C7").alignment = ctr;
      ws.mergeCells("E7:G8");
      ws.getCell("E7").value = r.acc_amt;
      ws.getCell("E7").numFmt = "#,##0";
      ws.getCell("E7").font = { ...bFont, bold: true, size: 12 };
      ws.getCell("E7").alignment = ctr;

      ws.getCell("A8").value = "지 출 과 목";
      ws.getCell("A8").font = bFont;
      ws.getCell("A8").alignment = ctr;
      ws.getCell("B8").value = itemName;
      ws.getCell("B8").font = bFont;
      ws.getCell("B8").alignment = ctr;

      /* Row 9: 적요 header */
      ws.mergeCells("A9:B9");
      ws.getCell("A9").value = "적        요";
      ws.getCell("A9").font = bFont;
      ws.getCell("A9").alignment = ctr;
      ws.mergeCells("C9:D9");
      ws.getCell("C9").value = "구   분";
      ws.getCell("C9").font = bFont;
      ws.getCell("C9").alignment = ctr;
      ws.getCell("E9").value = "일 자";
      ws.getCell("E9").font = bFont;
      ws.getCell("E9").alignment = ctr;
      ws.mergeCells("F9:G9");
      ws.getCell("F9").value = "담당자";
      ws.getCell("F9").font = bFont;
      ws.getCell("F9").alignment = ctr;

      /* Row 10-12: 적요 body */
      ws.mergeCells("A10:B12");
      ws.getCell("A10").value = r.content;
      ws.getCell("A10").font = bFont;
      ws.getCell("A10").alignment = { ...ctr, wrapText: true };

      ws.mergeCells("C10:D10");
      ws.getCell("C10").value = "계   약";
      ws.getCell("C10").font = bFont;
      ws.getCell("C10").alignment = ctr;
      ws.mergeCells("C11:D11");
      ws.getCell("C11").value = "검   수";
      ws.getCell("C11").font = bFont;
      ws.getCell("C11").alignment = ctr;
      ws.mergeCells("C12:D12");
      ws.getCell("C12").value = "회계장부기록";
      ws.getCell("C12").font = bFont;
      ws.getCell("C12").alignment = ctr;

      ws.mergeCells("F10:G10");
      ws.mergeCells("F11:G11");
      ws.mergeCells("F12:G12");

      /* Row 13-18: 수령인 */
      ws.mergeCells("A13:B13");
      ws.getCell("A13").value = "수    령    인";
      ws.getCell("A13").font = { ...bFont, bold: true };
      ws.getCell("A13").alignment = ctr;
      ws.mergeCells("C13:G18");

      const custLabels: [string, string][] = [
        ["성        명\n(법인·단체명)", cust.name || ""],
        ["생 년 월 일\n(사업자번호)", cust.reg_num || ""],
        ["주        소\n(사무소소재지)", cust.addr || ""],
        ["직        업\n(업      종)", cust.job || ""],
        ["전 화 번 호", cust.tel || ""],
      ];
      custLabels.forEach(([label, val], i) => {
        const row = 14 + i;
        ws.getCell(`A${row}`).value = label;
        ws.getCell(`A${row}`).font = bFont;
        ws.getCell(`A${row}`).alignment = ctr;
        ws.getCell(`B${row}`).value = val;
        ws.getCell(`B${row}`).font = bFont;
        ws.getCell(`B${row}`).alignment = { vertical: "middle", wrapText: true };
      });

      /* Row 19-21: Footnotes */
      ws.mergeCells("A19:G19");
      ws.getCell("A19").value = "주 1. 적요란은 지출내역( 지출의 목적, 지출일자 등 )을 구체적으로기재하되, 별지 제36호 서식 구입·지급\n      품의서의 적요란 또는 내부결재의 기재내용과 같아야 합니다";
      ws.getCell("A19").font = { ...bFont, size: 8 };
      ws.getCell("A19").alignment = { vertical: "top", wrapText: true };

      ws.mergeCells("A20:G20");
      ws.getCell("A20").value = '   2. "정치자금 종류" 란에는 별표 1  "수입·지출과목 해소표"의 수입과목을,    지출과목은 그  별표 1의  \n      지출과목을 기재합니다.';
      ws.getCell("A20").font = { ...bFont, size: 8 };
      ws.getCell("A20").alignment = { vertical: "top", wrapText: true };

      ws.mergeCells("A21:G21");
      ws.getCell("A21").value = "   3. 지출결의서에는 구입·지급품의서 또는 내부결재문서 및 지출관련 증빙자료(계약서 등)를  첨부하여야\n      합니다.";
      ws.getCell("A21").font = { ...bFont, size: 8 };
      ws.getCell("A21").alignment = { vertical: "top", wrapText: true };

      /* Apply borders to form area (rows 5-18) */
      applyBorders(ws, 5, 1, 18, 7);

      /* Column widths (approximate to template) */
      ws.getColumn(1).width = 11;
      ws.getColumn(2).width = 14;
      ws.getColumn(3).width = 7;
      ws.getColumn(4).width = 7;
      ws.getColumn(5).width = 7;
      ws.getColumn(6).width = 5;
      ws.getColumn(7).width = 10;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `지출결의서_${dateFrom}_${dateTo}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleClear() {
    setAccSecCd(0);
    setItemSecCd(0);
    setDateFrom("");
    setDateTo("");
    setDepartment("");
    setFundType("");
    setRecords([]);
    setCheckedIds(new Set());
  }

  const { sorted, sort, toggle } = useSort(records);

  const checkedTotal = records
    .filter((r) => checkedIds.has(r.acc_book_id))
    .reduce((s, r) => s + r.acc_amt, 0);

  if (codesLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        코드 데이터 로딩 중...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">지출결의서 출력</h2>

      <div className="bg-white rounded-lg border p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <CodeSelect
            label="계정"
            value={accSecCd}
            onChange={(v) => {
              setAccSecCd(v);
              setItemSecCd(0);
            }}
            options={accountOptions}
            placeholder="전체 계정"
          />
          <CodeSelect
            label="과목"
            value={itemSecCd}
            onChange={setItemSecCd}
            options={itemOptions}
            placeholder="전체 과목"
            disabled={!accSecCd}
          />
          <div>
            <HelpTooltip id="expense.resolution">
              <Label>정치자금종류</Label>
            </HelpTooltip>
            <Input
              value={fundType}
              onChange={(e) => setFundType(e.target.value)}
              placeholder="예: 후원금"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>지출기간 시작</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div>
            <Label>지출기간 종료</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          <div>
            <Label>소관(발의)부서</Label>
            <Input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="예: 사무국"
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
            disabled={checkedIds.size === 0}
          >
            엑셀 출력 ({checkedIds.size}건
            {checkedIds.size > MAX_EXCEL_ITEMS ? ` - 최대 ${MAX_EXCEL_ITEMS}건` : ""}
            )
          </Button>
          <Button variant="outline" onClick={handleClear}>
            지우기
          </Button>
        </div>
      </div>

      {/* 합계 */}
      {records.length > 0 && (
        <div className="flex gap-6 text-sm bg-gray-50 rounded p-3">
          <span>
            총 건수: <b>{records.length}건</b>
          </span>
          <span>
            선택: <b className="text-blue-600">{checkedIds.size}건</b>
          </span>
          <span>
            선택 금액:{" "}
            <b className="text-blue-600">{fmt(checkedTotal)}원</b>
          </span>
        </div>
      )}

      {/* 데이터 테이블 */}
      <div className="bg-white rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-3 py-2 text-center w-10">
                <input
                  type="checkbox"
                  checked={
                    records.length > 0 && checkedIds.size === records.length
                  }
                  onChange={toggleAll}
                />
              </th>
              <th className="px-3 py-2 text-left">번호</th>
              <SortTh label="지출일자" sortKey="acc_date" current={sort} onToggle={toggle} className="text-left" />
              <SortTh label="계정" sortKey="acc_sec_cd" current={sort} onToggle={toggle} className="text-left" />
              <SortTh label="과목" sortKey="item_sec_cd" current={sort} onToggle={toggle} className="text-left" />
              <SortTh label="지출대상자" sortKey="cust_id" current={sort} onToggle={toggle} className="text-left" />
              <SortTh label="지출내역" sortKey="content" current={sort} onToggle={toggle} className="text-left" />
              <SortTh label="금액" sortKey="acc_amt" current={sort} onToggle={toggle} className="text-right" />
              <SortTh label="지출방법" sortKey="acc_ins_type" current={sort} onToggle={toggle} className="text-left" />
              <SortTh label="증빙" sortKey="rcp_yn" current={sort} onToggle={toggle} className="text-center" />
              <th className="px-3 py-2 text-left">증빙서이름</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={11}
                  className="px-3 py-8 text-center text-gray-400"
                >
                  로딩 중...
                </td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td
                  colSpan={11}
                  className="px-3 py-8 text-center text-gray-400"
                >
                  조건을 설정 후 [조회]를 클릭하세요.
                </td>
              </tr>
            ) : (
              sorted.map((r, i) => (
                <tr
                  key={r.acc_book_id}
                  className={`border-b hover:bg-gray-50 ${
                    checkedIds.has(r.acc_book_id) ? "bg-blue-50" : ""
                  }`}
                >
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={checkedIds.has(r.acc_book_id)}
                      onChange={() => toggleCheck(r.acc_book_id)}
                    />
                  </td>
                  <td className="px-3 py-2">{i + 1}</td>
                  <td className="px-3 py-2">{fmtDate(r.acc_date)}</td>
                  <td className="px-3 py-2">{getName(r.acc_sec_cd)}</td>
                  <td className="px-3 py-2">{getName(r.item_sec_cd)}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {getCustName(r.customer)}
                  </td>
                  <td className="px-3 py-2">{r.content}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {fmt(r.acc_amt)}
                  </td>
                  <td className="px-3 py-2">
                    {r.acc_ins_type
                      ? PAY_METHODS[r.acc_ins_type] || r.acc_ins_type
                      : "-"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {r.rcp_yn === "Y" ? "O" : "-"}
                  </td>
                  <td className="px-3 py-2 text-blue-700 font-mono">
                    {r.rcp_yn === "Y" && r.rcp_no
                      ? buildReceiptLabel(getName(r.acc_sec_cd), getName(r.item_sec_cd), r.rcp_no)
                      : ""}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
