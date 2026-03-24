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

interface ReimbRow {
  acc_book_id: number;
  acc_sec_cd: number;
  item_sec_cd: number;
  acc_date: string;
  content: string;
  acc_amt: number;
  rcp_yn: string;
  rcp_no: string | null;
  acc_print_ok: string | null;
  bigo: string | null;
  customer: Record<string, unknown> | Record<string, unknown>[] | null;
}

export default function ReimbursementPage() {
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
  const [records, setRecords] = useState<ReimbRow[]>([]);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // ACC_REL based dropdowns for expense (incm_sec_cd=2)
  const accountOptions = orgSecCd ? getAccounts(orgSecCd, 2) : [];
  const itemOptions =
    orgSecCd && accSecCd ? getItems(orgSecCd, 2, accSecCd) : [];

  const fmt = (n: number) => n.toLocaleString("ko-KR");
  const fmtDate = (d: string) =>
    d.length === 8
      ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
      : d;

  function getCustName(c: ReimbRow["customer"]): string {
    if (!c) return "-";
    const obj = Array.isArray(c) ? c[0] : c;
    return (obj as { name?: string })?.name || "-";
  }

  const handleQuery = useCallback(async () => {
    if (!orgId) return;
    if (!dateFrom || !dateTo) {
      alert("기간을 입력하세요.");
      return;
    }

    setLoading(true);
    const fromStr = dateFrom.replace(/-/g, "");
    const toStr = dateTo.replace(/-/g, "");

    let query = supabase
      .from("acc_book")
      .select(
        "acc_book_id, acc_sec_cd, item_sec_cd, acc_date, content, acc_amt, rcp_yn, rcp_no, acc_print_ok, bigo, customer:cust_id(name)"
      )
      .eq("org_id", orgId)
      .eq("incm_sec_cd", 2)
      .gte("acc_date", fromStr)
      .lte("acc_date", toStr)
      .order("acc_date", { ascending: true })
      .order("acc_sort_num", { ascending: true });

    if (accSecCd) {
      query = query.eq("acc_sec_cd", accSecCd);
    }
    if (itemSecCd) {
      query = query.eq("item_sec_cd", itemSecCd);
    }

    const { data } = await query;
    const rows = (data || []) as unknown as ReimbRow[];
    setRecords(rows);

    // 기존 보전 대상 체크 복원
    const checked = new Set<number>();
    rows.forEach((r) => {
      if (r.acc_print_ok === "Y") {
        checked.add(r.acc_book_id);
      }
    });
    setCheckedIds(checked);

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
    if (checkedIds.size === records.length) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(records.map((r) => r.acc_book_id)));
    }
  }

  async function handleSave() {
    if (!orgId || records.length === 0) return;
    setSaving(true);

    let successCount = 0;
    for (const r of records) {
      const isChecked = checkedIds.has(r.acc_book_id);
      const { error } = await supabase
        .from("acc_book")
        .update({ acc_print_ok: isChecked ? "Y" : "N" })
        .eq("acc_book_id", r.acc_book_id);
      if (!error) successCount++;
    }

    setSaving(false);
    alert(
      `${successCount}/${records.length}건 보전 대상 설정이 저장되었습니다.\n저장한 내용은 로그아웃 이후에도 유지됩니다.`
    );
  }

  const { sorted, sort, toggle } = useSort(records);

  const checkedTotal = records
    .filter((r) => checkedIds.has(r.acc_book_id))
    .reduce((s, r) => s + r.acc_amt, 0);
  const totalAmt = records.reduce((s, r) => s + r.acc_amt, 0);

  if (codesLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        코드 데이터 로딩 중...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">정치자금 수입지출부 보전비용</h2>

      <div className="bg-white rounded-lg border p-4 space-y-4">
        <div className="bg-blue-50 rounded p-3 text-sm text-blue-800">
          선거비용 보전 신청 대상 지출내역을 체크한 후 저장합니다.
          저장한 내용은 로그아웃 이후에도 유지됩니다.
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <HelpTooltip id="report.reimbursement">
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
          </HelpTooltip>
          <CodeSelect
            label="과목"
            value={itemSecCd}
            onChange={setItemSecCd}
            options={itemOptions}
            placeholder="전체 과목"
            disabled={!accSecCd}
          />
          <div>
            <Label>시작일</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div>
            <Label>종료일</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2 pt-4 border-t">
          <Button onClick={handleQuery} disabled={loading}>
            {loading ? "조회 중..." : "조회"}
          </Button>
          <Button
            onClick={handleSave}
            disabled={records.length === 0 || saving}
          >
            {saving ? "저장 중..." : "보전 대상 저장"}
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
            총 지출금액: <b className="text-red-600">{fmt(totalAmt)}원</b>
          </span>
          <span>
            보전 대상: <b className="text-blue-600">{checkedIds.size}건</b>
          </span>
          <span>
            보전 금액:{" "}
            <b className="text-blue-600">{fmt(checkedTotal)}원</b>
          </span>
          <span>
            보전 비율:{" "}
            <b>
              {totalAmt > 0
                ? ((checkedTotal / totalAmt) * 100).toFixed(1)
                : 0}
              %
            </b>
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
                  title="전체 선택"
                />
              </th>
              <th className="px-3 py-2 text-left">번호</th>
              <SortTh label="지출일자" sortKey="acc_date" current={sort} onToggle={toggle} className="text-left" />
              <SortTh label="계정" sortKey="acc_sec_cd" current={sort} onToggle={toggle} className="text-left" />
              <SortTh label="과목" sortKey="item_sec_cd" current={sort} onToggle={toggle} className="text-left" />
              <SortTh label="지출대상자" sortKey="cust_id" current={sort} onToggle={toggle} className="text-left" />
              <SortTh label="지출내역" sortKey="content" current={sort} onToggle={toggle} className="text-left" />
              <SortTh label="금액" sortKey="acc_amt" current={sort} onToggle={toggle} className="text-right" />
              <SortTh label="증빙" sortKey="rcp_yn" current={sort} onToggle={toggle} className="text-center" />
              <SortTh label="비고" sortKey="bigo" current={sort} onToggle={toggle} className="text-left" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={10}
                  className="px-3 py-8 text-center text-gray-400"
                >
                  로딩 중...
                </td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  className="px-3 py-8 text-center text-gray-400"
                >
                  조회된 데이터가 없습니다. 기간을 설정 후 [조회] 버튼을
                  클릭하세요.
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
                  <td className="px-3 py-2 text-center">
                    {r.rcp_yn === "Y" ? "O" : "-"}
                  </td>
                  <td className="px-3 py-2 text-gray-500">{r.bigo}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
