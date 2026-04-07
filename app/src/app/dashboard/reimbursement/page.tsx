"use client";

import { useState, useCallback } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { useCodeValues } from "@/hooks/use-code-values";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CodeSelect } from "@/components/code-select";

interface ReimbRow {
  acc_book_id: number;
  incm_sec_cd: number;
  acc_sec_cd: number;
  item_sec_cd: number;
  acc_date: string;
  content: string;
  acc_amt: number;
  rcp_yn: string;
  rcp_no: string | null;
  acc_print_ok: string | null;
  bigo: string | null;
  customer: {
    name: string | null;
    reg_num: string | null;
    addr: string | null;
    job: string | null;
    tel: string | null;
  } | null;
}

export default function ReimbursementPage() {
  const supabase = createSupabaseBrowser();
  const { orgId, orgSecCd } = useAuth();
  const { loading: codesLoading, getAccounts, getItems } = useCodeValues();

  const [accSecCd, setAccSecCd] = useState(0);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [records, setRecords] = useState<ReimbRow[]>([]);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const accountOptions = orgSecCd ? getAccounts(orgSecCd, 2) : [];
  const itemOptions = orgSecCd && accSecCd ? getItems(orgSecCd, 2, accSecCd) : [];

  // 과목 "선거비용" 고정: 선거비용외 제외
  const electionItem = itemOptions.find((i) =>
    i.cv_name.includes("선거비용") && !i.cv_name.includes("선거비용외")
  );
  const itemSecCd = electionItem?.cv_id || 0;
  const itemLabel = electionItem?.cv_name || "선거비용";

  const fmt = (n: number) => n.toLocaleString("ko-KR");
  const fmtDate = (d: string) =>
    d.length === 8 ? `${d.slice(0, 4)}/${d.slice(4, 6)}/${d.slice(6, 8)}` : d;

  function getCust(r: ReimbRow) {
    const c = r.customer;
    if (!c) return { name: "-", regNum: "", addr: "", job: "", tel: "" };
    const obj = Array.isArray(c) ? c[0] : c;
    return {
      name: (obj as Record<string, string>)?.name || "-",
      regNum: (obj as Record<string, string>)?.reg_num || "",
      addr: (obj as Record<string, string>)?.addr || "",
      job: (obj as Record<string, string>)?.job || "",
      tel: (obj as Record<string, string>)?.tel || "",
    };
  }

  const handleQuery = useCallback(async () => {
    if (!orgId) return;
    if (!dateFrom || !dateTo) { alert("기간을 입력하세요."); return; }
    setLoading(true);

    const fromStr = dateFrom.replace(/-/g, "");
    const toStr = dateTo.replace(/-/g, "");

    let query = supabase
      .from("acc_book")
      .select("acc_book_id, incm_sec_cd, acc_sec_cd, item_sec_cd, acc_date, content, acc_amt, rcp_yn, rcp_no, acc_print_ok, bigo, customer:cust_id(name, reg_num, addr, job, tel)")
      .eq("org_id", orgId)
      .eq("incm_sec_cd", 2)
      .gte("acc_date", fromStr)
      .lte("acc_date", toStr)
      .order("acc_date", { ascending: true })
      .order("acc_sort_num", { ascending: true });

    if (accSecCd) query = query.eq("acc_sec_cd", accSecCd);
    if (itemSecCd) query = query.eq("item_sec_cd", itemSecCd);

    const { data } = await query;
    const rows = (data || []) as unknown as ReimbRow[];
    setRecords(rows);

    // 기존 보전 대상(acc_print_ok=Y) 체크 복원
    const checked = new Set<number>();
    rows.forEach((r) => { if (r.acc_print_ok === "Y") checked.add(r.acc_book_id); });
    setCheckedIds(checked);
    setLoading(false);
  }, [orgId, supabase, dateFrom, dateTo, accSecCd, itemSecCd]);

  function toggleCheck(id: number) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (checkedIds.size === records.length) setCheckedIds(new Set());
    else setCheckedIds(new Set(records.map((r) => r.acc_book_id)));
  }

  async function handleSave() {
    if (!orgId || records.length === 0) return;
    setSaving(true);
    let ok = 0;
    for (const r of records) {
      const { error } = await supabase
        .from("acc_book")
        .update({ acc_print_ok: checkedIds.has(r.acc_book_id) ? "Y" : "N" })
        .eq("acc_book_id", r.acc_book_id);
      if (!error) ok++;
    }
    setSaving(false);
    alert(`${ok}/${records.length}건 보전 대상 저장 완료`);
  }

  // 누계 계산
  let expCum = 0;
  const rows = records.map((r) => {
    expCum += r.acc_amt;
    return { ...r, expCum };
  });

  const totalAmt = records.reduce((s, r) => s + r.acc_amt, 0);
  const checkedTotal = records.filter((r) => checkedIds.has(r.acc_book_id)).reduce((s, r) => s + r.acc_amt, 0);

  if (codesLoading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">코드 데이터 로딩 중...</div>;
  }

  const th1 = "border border-gray-300 px-2 py-1.5 text-xs font-bold text-center bg-gray-100 whitespace-nowrap";
  const th2 = "border border-gray-300 px-2 py-1 text-[11px] font-bold text-center bg-gray-100 whitespace-nowrap";
  const td = "border border-gray-300 px-2 py-1 text-xs whitespace-nowrap";
  const tdR = "border border-gray-300 px-2 py-1 text-xs whitespace-nowrap text-right font-mono";

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">정치자금 수입지출부 보전비용</h2>

      <div className="bg-white rounded-lg border p-4 space-y-4">
        <div className="bg-blue-50 rounded p-3 text-sm text-blue-800">
          선거비용 보전 신청 대상 지출내역을 체크한 후 저장합니다. 과목은 &quot;선거비용&quot;으로 고정됩니다.
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <CodeSelect
            label="계정"
            value={accSecCd}
            onChange={setAccSecCd}
            options={accountOptions}
            placeholder="전체 계정"
          />
          <div>
            <Label>과목</Label>
            <Input value={itemLabel} readOnly className="mt-1 bg-gray-50" />
          </div>
          <div><Label>시작일</Label><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
          <div><Label>종료일</Label><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
        </div>

        <div className="flex gap-2 pt-4 border-t">
          <Button onClick={handleQuery} disabled={loading}>{loading ? "조회 중..." : "조회"}</Button>
          <Button onClick={handleSave} disabled={records.length === 0 || saving}>{saving ? "저장 중..." : "보전 대상 저장"}</Button>
        </div>
      </div>

      {/* 합계 */}
      {records.length > 0 && (
        <div className="flex gap-6 text-sm bg-gray-50 rounded p-3">
          <span>총 건수: <b>{records.length}건</b></span>
          <span>총 지출금액: <b className="text-red-600">{fmt(totalAmt)}원</b></span>
          <span>보전 대상: <b className="text-blue-600">{checkedIds.size}건</b></span>
          <span>보전 금액: <b className="text-blue-600">{fmt(checkedTotal)}원</b></span>
          <span>보전 비율: <b>{totalAmt > 0 ? ((checkedTotal / totalAmt) * 100).toFixed(1) : 0}%</b></span>
        </div>
      )}

      {/* 2단 헤더 테이블 (수입지출부 동일) */}
      <div className="bg-white rounded-lg border overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th rowSpan={2} className={th1}>번호</th>
              <th rowSpan={2} className={th1}>
                <div className="flex flex-col items-center gap-0.5">
                  <span>보전</span>
                  <input
                    type="checkbox"
                    checked={records.length > 0 && checkedIds.size === records.length}
                    onChange={toggleAll}
                    title="전체 선택"
                  />
                </div>
              </th>
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
                const cust = getCust(r);
                const isChecked = checkedIds.has(r.acc_book_id);
                return (
                  <tr key={r.acc_book_id} className={`hover:bg-gray-50 ${isChecked ? "bg-blue-50" : ""}`}>
                    <td className={td}>{i + 1}</td>
                    <td className={`${td} text-center`}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleCheck(r.acc_book_id)}
                      />
                    </td>
                    <td className={td}>{fmtDate(r.acc_date)}</td>
                    <td className={td}>{r.content}</td>
                    {/* 수입액: 지출전용이므로 비움 */}
                    <td className={td} />
                    <td className={td} />
                    {/* 지출액 */}
                    <td className={`${tdR} text-red-600`}>{fmt(r.acc_amt)}</td>
                    <td className={`${tdR} text-red-400`}>{fmt(r.expCum)}</td>
                    {/* 잔액 (지출만이므로 음수) */}
                    <td className={`${tdR} font-semibold`}>{fmt(-r.expCum)}</td>
                    {/* 거래처 */}
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
                <td className={tdR} />
                <td className={tdR} />
                <td className={`${tdR} text-red-700`}>{fmt(totalAmt)}</td>
                <td className={tdR} />
                <td className={tdR} />
                <td colSpan={7} className={td} />
              </tr>
              <tr className="bg-blue-50 font-bold">
                <td colSpan={4} className={`${td} text-right text-blue-700`}>보전 대상 합계 ({checkedIds.size}건)</td>
                <td className={tdR} />
                <td className={tdR} />
                <td className={`${tdR} text-blue-700`}>{fmt(checkedTotal)}</td>
                <td className={tdR} />
                <td className={tdR} />
                <td colSpan={7} className={td} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
