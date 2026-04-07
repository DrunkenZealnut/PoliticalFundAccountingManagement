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
        "acc_book_id, acc_sec_cd, item_sec_cd, exp_sec_cd, acc_date, content, acc_amt, rcp_yn, rcp_no, acc_ins_type, bigo, customer:cust_id(name)"
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
    const sheet = workbook.addWorksheet("지출결의서");

    // Title
    sheet.mergeCells("A1:H1");
    const titleCell = sheet.getCell("A1");
    titleCell.value = "지 출 결 의 서";
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: "center" };

    // Meta info
    sheet.getCell("A3").value = "소관부서:";
    sheet.getCell("B3").value = department || "-";
    sheet.getCell("D3").value = "정치자금종류:";
    sheet.getCell("E3").value = fundType || "-";
    sheet.getCell("A4").value = "지출기간:";
    sheet.getCell("B4").value = `${dateFrom} ~ ${dateTo}`;

    // Headers
    const headerRow = sheet.getRow(6);
    const headers = [
      "번호", "지출일자", "계정", "과목", "지출대상자",
      "지출내역", "금액", "지출방법", "증빙", "증빙서이름",
    ];
    headers.forEach((h, i) => {
      headerRow.getCell(i + 1).value = h;
      headerRow.getCell(i + 1).font = { bold: true };
    });

    // Data
    let totalAmt = 0;
    selected.forEach((r, i) => {
      const row = sheet.getRow(7 + i);
      row.getCell(1).value = i + 1;
      row.getCell(2).value = fmtDate(r.acc_date);
      row.getCell(3).value = getName(r.acc_sec_cd);
      row.getCell(4).value = getName(r.item_sec_cd);
      row.getCell(5).value = getCustName(r.customer);
      row.getCell(6).value = r.content;
      row.getCell(7).value = r.acc_amt;
      row.getCell(7).numFmt = "#,##0";
      row.getCell(8).value = r.acc_ins_type
        ? PAY_METHODS[r.acc_ins_type] || r.acc_ins_type
        : "-";
      row.getCell(9).value = r.rcp_yn === "Y" ? "O" : "X";
      row.getCell(10).value = r.rcp_yn === "Y" && r.rcp_no
        ? buildReceiptLabel(getName(r.acc_sec_cd), getName(r.item_sec_cd), r.rcp_no)
        : "";
      totalAmt += r.acc_amt;
    });

    // Total row
    const totalRow = sheet.getRow(7 + selected.length);
    totalRow.getCell(1).value = "합계";
    totalRow.getCell(1).font = { bold: true };
    totalRow.getCell(7).value = totalAmt;
    totalRow.getCell(7).numFmt = "#,##0";
    totalRow.getCell(7).font = { bold: true };

    // Column widths
    sheet.getColumn(1).width = 6;
    sheet.getColumn(2).width = 12;
    sheet.getColumn(3).width = 14;
    sheet.getColumn(4).width = 14;
    sheet.getColumn(5).width = 14;
    sheet.getColumn(6).width = 30;
    sheet.getColumn(7).width = 15;
    sheet.getColumn(8).width = 12;
    sheet.getColumn(9).width = 6;
    sheet.getColumn(10).width = 14;

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
