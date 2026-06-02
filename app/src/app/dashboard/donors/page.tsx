"use client";

import { useState, useCallback } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { useSort, SortTh } from "@/hooks/use-sort";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DonorRow {
  cust_id: number;
  name: string;
  reg_num: string;
  addr: string;
  job: string;
  tel: string;
  total_amt: number;
  max_amt: number;
  count: number;
  has_return: boolean;
  return_saved: boolean;
  acc_book_ids: number[];
}

type Category = "over30" | "over300" | "nts";

const CATEGORY_INFO: Record<Category, { label: string; threshold: number; description: string }> = {
  over30: { label: "1회 30만원 초과 기부자", threshold: 300000, description: "1회 후원금이 30만원을 초과한 기부자 명단 (기부자 정보 공개 대상)" },
  over300: { label: "연간 300만원 초과 기부자", threshold: 3000000, description: "연간 후원금 합계가 300만원을 초과한 기부자 명단" },
  nts: { label: "국세청 자료추출", threshold: 0, description: "국세청 제출용 기부금영수증 발급 대상 명단 (전체 기부자)" },
};

export default function DonorsPage() {
  const supabase = createSupabaseBrowser();
  const { orgId, orgSecCd } = useAuth();

  const [category, setCategory] = useState<Category>("over30");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [donors, setDonors] = useState<DonorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [showReturned, setShowReturned] = useState(false);
  const [showPreviousYear, setShowPreviousYear] = useState(false);
  const [showReturnOnly, setShowReturnOnly] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [searchName, setSearchName] = useState("");

  // 후원회별 연간 한도 (공통코드 13)
  const getAnnualLimit = useCallback(() => {
    // 대통령선거경선/후보자 후원회: 500만원, 나머지: 300만원
    if (orgSecCd && [109, 588].includes(orgSecCd)) return 5000000;
    return 3000000;
  }, [orgSecCd]);

  const handleSearch = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setSearched(true);
    setSelected(new Set());

    let query = supabase
      .from("acc_book")
      .select("acc_book_id, cust_id, acc_date, acc_amt, content, return_yn, customer:cust_id(cust_id, name, reg_num, addr, job, tel)")
      .eq("org_id", orgId)
      .eq("incm_sec_cd", 1);

    if (dateFrom) query = query.gte("acc_date", dateFrom.replace(/-/g, ""));
    if (dateTo) query = query.lte("acc_date", dateTo.replace(/-/g, ""));
    if (showReturnOnly) query = query.lt("acc_amt", 0);

    const { data } = await query;

    if (!data || data.length === 0) {
      setDonors([]);
      setLoading(false);
      return;
    }

    // Aggregate by customer
    const custMap = new Map<number, DonorRow>();
    for (const r of data as unknown as Array<{
      acc_book_id: number;
      cust_id: number;
      acc_amt: number;
      return_yn: string;
      customer: Record<string, string> | Record<string, string>[];
    }>) {
      const custId = r.cust_id;
      if (custId <= 0) continue;

      const cust = Array.isArray(r.customer) ? r.customer[0] : r.customer;
      if (!cust) continue;

      const existing = custMap.get(custId);
      if (existing) {
        existing.total_amt += r.acc_amt;
        existing.max_amt = Math.max(existing.max_amt, Math.abs(r.acc_amt));
        existing.count += 1;
        if (r.acc_amt < 0) existing.has_return = true;
        if (r.return_yn === "Y") existing.return_saved = true;
        existing.acc_book_ids.push(r.acc_book_id);
      } else {
        custMap.set(custId, {
          cust_id: custId,
          name: String(cust.name || ""),
          reg_num: String(cust.reg_num || ""),
          addr: String(cust.addr || ""),
          job: String(cust.job || ""),
          tel: String(cust.tel || ""),
          total_amt: r.acc_amt,
          max_amt: Math.abs(r.acc_amt),
          count: 1,
          has_return: r.acc_amt < 0,
          return_saved: r.return_yn === "Y",
          acc_book_ids: [r.acc_book_id],
        });
      }
    }

    // Filter by category threshold
    let filtered = Array.from(custMap.values());

    if (category === "over30") {
      filtered = filtered.filter((d) => d.max_amt > CATEGORY_INFO.over30.threshold);
    } else if (category === "over300") {
      const limit = getAnnualLimit();
      filtered = filtered.filter((d) => d.total_amt > limit);
    }
    // nts: no filter

    // Filter returned data if option is set
    if (showReturned) {
      filtered = filtered.filter((d) => d.return_saved);
    }

    // Filter by name search
    if (searchName.trim()) {
      filtered = filtered.filter((d) => d.name.includes(searchName.trim()));
    }

    filtered.sort((a, b) => b.total_amt - a.total_amt);
    setDonors(filtered);
    setLoading(false);
  }, [orgId, supabase, dateFrom, dateTo, category, showReturned, showReturnOnly, searchName, getAnnualLimit]);

  // 반환자료저장
  async function handleSaveReturn() {
    if (!orgId || selected.size === 0) {
      alert("반환자료를 저장할 기부자를 선택하세요.");
      return;
    }

    const selectedDonors = donors.filter((d) => selected.has(d.cust_id));
    const allBookIds = selectedDonors.flatMap((d) => d.acc_book_ids);

    const { error } = await supabase
      .from("acc_book")
      .update({ return_yn: "Y" })
      .in("acc_book_id", allBookIds);

    if (error) {
      alert(`반환자료 저장 실패: ${error.message}`);
    } else {
      alert(`${selectedDonors.length}명의 반환자료가 저장되었습니다.`);
      handleSearch(); // refresh
    }
  }

  // 반환자료 취소
  async function handleCancelReturn() {
    if (!orgId || selected.size === 0) {
      alert("반환 취소할 기부자를 선택하세요.");
      return;
    }

    const selectedDonors = donors.filter((d) => selected.has(d.cust_id));
    const allBookIds = selectedDonors.flatMap((d) => d.acc_book_ids);

    const { error } = await supabase
      .from("acc_book")
      .update({ return_yn: "N" })
      .in("acc_book_id", allBookIds);

    if (error) {
      alert(`반환 취소 실패: ${error.message}`);
    } else {
      alert(`${selectedDonors.length}명의 반환이 취소되었습니다.`);
      handleSearch();
    }
  }

  // 국세청 자료추출 (엑셀 다운로드)
  async function handleExportNts() {
    if (donors.length === 0) {
      alert("먼저 조회를 실행하세요.");
      return;
    }

    // Dynamic import exceljs for client-side
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("국세청 자료추출");

    // Header
    sheet.mergeCells("A1:H1");
    const titleCell = sheet.getCell("A1");
    titleCell.value = "국세청 기부금영수증 발급 대상 명단";
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: "center" };

    sheet.mergeCells("A2:H2");
    sheet.getCell("A2").value = `후원기간: ${dateFrom || "전체"} ~ ${dateTo || "전체"}`;
    sheet.getCell("A2").alignment = { horizontal: "center" };

    // Column headers
    const headers = ["번호", "성명", "생년월일/사업자번호", "주소", "직업", "전화번호", "후원건수", "후원금액"];
    const headerRow = sheet.getRow(4);
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true };
      cell.alignment = { horizontal: "center" };
      cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
    });

    // Data rows
    donors.forEach((d, i) => {
      const row = sheet.getRow(5 + i);
      row.getCell(1).value = i + 1;
      row.getCell(2).value = d.name;
      row.getCell(3).value = d.reg_num;
      row.getCell(4).value = d.addr;
      row.getCell(5).value = d.job;
      row.getCell(6).value = d.tel;
      row.getCell(7).value = d.count;
      row.getCell(8).value = d.total_amt;
      row.getCell(8).numFmt = "#,##0";

      for (let c = 1; c <= 8; c++) {
        row.getCell(c).border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
      }
    });

    // Summary row
    const sumRow = sheet.getRow(5 + donors.length);
    sumRow.getCell(1).value = "합계";
    sumRow.getCell(1).font = { bold: true };
    sumRow.getCell(7).value = donors.reduce((s, d) => s + d.count, 0);
    sumRow.getCell(8).value = donors.reduce((s, d) => s + d.total_amt, 0);
    sumRow.getCell(8).numFmt = "#,##0";

    // Column widths
    sheet.getColumn(1).width = 8;
    sheet.getColumn(2).width = 15;
    sheet.getColumn(3).width = 18;
    sheet.getColumn(4).width = 30;
    sheet.getColumn(5).width = 12;
    sheet.getColumn(6).width = 15;
    sheet.getColumn(7).width = 10;
    sheet.getColumn(8).width = 15;

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `국세청자료추출_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const toggleSelect = (custId: number) => {
    const next = new Set(selected);
    if (next.has(custId)) next.delete(custId);
    else next.add(custId);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === donors.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(donors.map((d) => d.cust_id)));
    }
  };

  const { sorted: sortedDonors, sort, toggle } = useSort(donors);

  const fmt = (n: number) => n.toLocaleString("ko-KR");
  const totalDonation = donors.reduce((s, d) => s + d.total_amt, 0);
  const info = CATEGORY_INFO[category];
  const threshold = category === "over300" ? getAnnualLimit() : info.threshold;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">후원금 기부자 조회</h2>

      <div className="bg-white rounded-lg border p-4 space-y-4">
        {/* 조회 유형 */}
        <div className="flex gap-4 flex-wrap">
          {(Object.entries(CATEGORY_INFO) as [Category, typeof info][]).map(
            ([key, val]) => (
              <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" checked={category === key} onChange={() => setCategory(key)} />
                {val.label}
              </label>
            )
          )}
        </div>

        <div className="bg-blue-50 rounded p-2 text-sm text-blue-800">
          {info.description}
          {threshold > 0 && (
            <span className="ml-2 font-semibold">(기준: {fmt(threshold)}원)</span>
          )}
        </div>

        {/* 조회 조건 */}
        <div className="flex gap-4 items-end flex-wrap">
          <div>
            <Label>후원기간 From</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <Label>To</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div>
            <Label>기부자 검색</Label>
            <Input value={searchName} onChange={(e) => setSearchName(e.target.value)} placeholder="성명 검색" />
          </div>
        </div>

        <div className="flex gap-4 items-center flex-wrap">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={showPreviousYear} onChange={() => setShowPreviousYear(!showPreviousYear)} />
            전년도 자료 포함
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={showReturned} onChange={() => setShowReturned(!showReturned)} />
            반환자료만 조회
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={showReturnOnly} onChange={() => setShowReturnOnly(!showReturnOnly)} />
            반환금(-금액)만 조회
          </label>
          <Button onClick={handleSearch} disabled={loading}>
            {loading ? "조회 중..." : "조회"}
          </Button>
        </div>
      </div>

      {/* 요약 + 액션 버튼 */}
      {searched && donors.length > 0 && (
        <div className="flex items-center gap-4 flex-wrap bg-gray-50 rounded p-3">
          <span className="text-sm">
            해당 기부자: <b>{donors.length}명</b>
          </span>
          <span className="text-sm">
            후원금 합계: <b className="text-blue-600">{fmt(totalDonation)}원</b>
          </span>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={handleSaveReturn} disabled={selected.size === 0}>
            반환자료저장 ({selected.size}명)
          </Button>
          <Button variant="outline" size="sm" onClick={handleCancelReturn} disabled={selected.size === 0}>
            반환취소
          </Button>
          {category === "nts" && (
            <Button size="sm" onClick={handleExportNts}>
              국세청 자료추출 (엑셀)
            </Button>
          )}
        </div>
      )}

      {/* 데이터 테이블 */}
      {searched && (
        <div className="bg-white rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-2 py-2 text-center w-8">
                  <input type="checkbox" checked={donors.length > 0 && selected.size === donors.length} onChange={toggleAll} />
                </th>
                <th className="px-3 py-2 text-left">번호</th>
                <SortTh label="반환" sortKey="return_saved" current={sort} onToggle={toggle} className="text-center" />
                <SortTh label="성명" sortKey="name" current={sort} onToggle={toggle} className="text-left" />
                <SortTh label="생년월일/사업자번호" sortKey="reg_num" current={sort} onToggle={toggle} className="text-left" />
                <SortTh label="주소" sortKey="addr" current={sort} onToggle={toggle} className="text-left" />
                <SortTh label="직업" sortKey="job" current={sort} onToggle={toggle} className="text-left" />
                <SortTh label="전화번호" sortKey="tel" current={sort} onToggle={toggle} className="text-left" />
                <SortTh label="후원건수" sortKey="count" current={sort} onToggle={toggle} className="text-right" />
                <SortTh label="최대 1회금액" sortKey="max_amt" current={sort} onToggle={toggle} className="text-right" />
                <SortTh label="합계금액" sortKey="total_amt" current={sort} onToggle={toggle} className="text-right" />
              </tr>
            </thead>
            <tbody>
              {donors.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center text-gray-400">
                    해당 조건의 기부자가 없습니다.
                  </td>
                </tr>
              ) : (
                sortedDonors.map((d, i) => (
                  <tr key={d.cust_id} className={`border-b hover:bg-gray-50 ${d.return_saved ? "bg-yellow-50" : ""}`}>
                    <td className="px-2 py-2 text-center">
                      <input type="checkbox" checked={selected.has(d.cust_id)} onChange={() => toggleSelect(d.cust_id)} />
                    </td>
                    <td className="px-3 py-2">{i + 1}</td>
                    <td className="px-3 py-2 text-center">
                      {d.return_saved ? <span className="text-orange-600 font-semibold">반환</span> : d.has_return ? "O" : ""}
                    </td>
                    <td className="px-3 py-2 font-medium">{d.name}</td>
                    <td className="px-3 py-2">{d.reg_num}</td>
                    <td className="px-3 py-2">{d.addr}</td>
                    <td className="px-3 py-2">{d.job}</td>
                    <td className="px-3 py-2">{d.tel}</td>
                    <td className="px-3 py-2 text-right">{d.count}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmt(d.max_amt)}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">{fmt(d.total_amt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
