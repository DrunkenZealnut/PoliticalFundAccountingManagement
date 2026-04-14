"use client";

import { useState, useCallback } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { useCodeValues } from "@/hooks/use-code-values";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CodeSelect } from "@/components/code-select";
import { generateBurdenCostForm, type BurdenCostFormData, type BurdenCostAmounts } from "@/lib/excel-template/burden-cost-form";

/* ================================================================== */
/*  공통 타입                                                          */
/* ================================================================== */

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
  exp_group1_cd: string | null;
  exp_group2_cd: string | null;
  exp_group3_cd: string | null;
  customer: {
    name: string | null;
    reg_num: string | null;
    addr: string | null;
    job: string | null;
    tel: string | null;
  } | null;
}

const fmt = (n: number) => n.toLocaleString("ko-KR");
const fmtDate = (d: string) =>
  d.length === 8 ? `${d.slice(0, 4)}/${d.slice(4, 6)}/${d.slice(6, 8)}` : d;

function getCust(r: ReimbRow) {
  const c = r.customer;
  if (!c) return { name: "-", regNum: "", addr: "", job: "", tel: "" };
  return { name: c.name || "-", regNum: c.reg_num || "", addr: c.addr || "", job: c.job || "", tel: c.tel || "" };
}

const th1 = "border border-gray-300 px-2 py-1.5 text-xs font-bold text-center bg-gray-100 whitespace-nowrap";
const th2 = "border border-gray-300 px-2 py-1 text-[11px] font-bold text-center bg-gray-100 whitespace-nowrap";
const td = "border border-gray-300 px-2 py-1 text-xs whitespace-nowrap";
const tdR = "border border-gray-300 px-2 py-1 text-xs whitespace-nowrap text-right font-mono";

/* ================================================================== */
/*  메인 페이지 — 탭 구조                                              */
/* ================================================================== */

export default function ReimbursementPage() {
  const { loading: codesLoading } = useCodeValues();
  const [activeTab, setActiveTab] = useState<"reimbursement" | "burden">("reimbursement");

  if (codesLoading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">코드 데이터 로딩 중...</div>;
  }

  const tabCls = (t: string) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      activeTab === t ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700"
    }`;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">보전비용 관리</h2>

      <div className="flex border-b">
        <button className={tabCls("reimbursement")} onClick={() => setActiveTab("reimbursement")}>
          선거비용 보전
        </button>
        <button className={tabCls("burden")} onClick={() => setActiveTab("burden")}>
          부담비용 청구
        </button>
      </div>

      {activeTab === "reimbursement" ? <ReimbursementTab /> : <BurdenCostTab />}
    </div>
  );
}

/* ================================================================== */
/*  선거비용 보전 탭 (기존 기능)                                        */
/* ================================================================== */

function ReimbursementTab() {
  const supabase = createSupabaseBrowser();
  const { orgId, orgSecCd } = useAuth();
  const { getAccounts, getItems } = useCodeValues();

  const [accSecCd, setAccSecCd] = useState(0);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [records, setRecords] = useState<ReimbRow[]>([]);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const accountOptions = orgSecCd ? getAccounts(orgSecCd, 2) : [];
  const itemOptions = orgSecCd && accSecCd ? getItems(orgSecCd, 2, accSecCd) : [];
  const electionItem = itemOptions.find((i) => i.cv_name.includes("선거비용") && !i.cv_name.includes("선거비용외"));
  const itemSecCd = electionItem?.cv_id || 0;
  const itemLabel = electionItem?.cv_name || "선거비용";

  const handleQuery = useCallback(async () => {
    if (!orgId) return;
    if (!dateFrom || !dateTo) { alert("기간을 입력하세요."); return; }
    setLoading(true);
    const fromStr = dateFrom.replace(/-/g, "");
    const toStr = dateTo.replace(/-/g, "");
    let query = supabase.from("acc_book")
      .select("acc_book_id, incm_sec_cd, acc_sec_cd, item_sec_cd, acc_date, content, acc_amt, rcp_yn, rcp_no, acc_print_ok, bigo, exp_group1_cd, exp_group2_cd, exp_group3_cd, customer:cust_id(name, reg_num, addr, job, tel)")
      .eq("org_id", orgId).eq("incm_sec_cd", 2)
      .gte("acc_date", fromStr).lte("acc_date", toStr)
      .order("acc_date", { ascending: true }).order("acc_sort_num", { ascending: true });
    if (accSecCd) query = query.eq("acc_sec_cd", accSecCd);
    if (itemSecCd) query = query.eq("item_sec_cd", itemSecCd);
    const { data } = await query;
    const rows = (data || []) as unknown as ReimbRow[];
    setRecords(rows);
    const checked = new Set<number>();
    rows.forEach((r) => { if (r.acc_print_ok === "Y") checked.add(r.acc_book_id); });
    setCheckedIds(checked);
    setLoading(false);
  }, [orgId, supabase, dateFrom, dateTo, accSecCd, itemSecCd]);

  function toggleCheck(id: number) {
    setCheckedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
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
      const { error } = await supabase.from("acc_book")
        .update({ acc_print_ok: checkedIds.has(r.acc_book_id) ? "Y" : "N" })
        .eq("acc_book_id", r.acc_book_id);
      if (!error) ok++;
    }
    setSaving(false);
    alert(`${ok}/${records.length}건 보전 대상 저장 완료`);
  }

  let expCum = 0;
  const rows = records.map((r) => { expCum += r.acc_amt; return { ...r, expCum }; });
  const totalAmt = records.reduce((s, r) => s + r.acc_amt, 0);
  const checkedTotal = records.filter((r) => checkedIds.has(r.acc_book_id)).reduce((s, r) => s + r.acc_amt, 0);

  return (
    <div className="space-y-4 mt-4">
      <div className="bg-white rounded-lg border p-4 space-y-4">
        <div className="bg-blue-50 rounded p-3 text-sm text-blue-800">
          선거비용 보전 신청 대상 지출내역을 체크한 후 저장합니다. 과목은 &quot;선거비용&quot;으로 고정됩니다.
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <CodeSelect label="계정" value={accSecCd} onChange={setAccSecCd} options={accountOptions} placeholder="전체 계정" />
          <div><Label>과목</Label><Input value={itemLabel} readOnly className="mt-1 bg-gray-50" /></div>
          <div><Label>시작일</Label><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
          <div><Label>종료일</Label><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
        </div>
        <div className="flex gap-2 pt-4 border-t">
          <Button onClick={handleQuery} disabled={loading}>{loading ? "조회 중..." : "조회"}</Button>
          <Button onClick={handleSave} disabled={records.length === 0 || saving}>{saving ? "저장 중..." : "보전 대상 저장"}</Button>
        </div>
      </div>

      {records.length > 0 && (
        <div className="flex gap-6 text-sm bg-gray-50 rounded p-3">
          <span>총 건수: <b>{records.length}건</b></span>
          <span>총 지출금액: <b className="text-red-600">{fmt(totalAmt)}원</b></span>
          <span>보전 대상: <b className="text-blue-600">{checkedIds.size}건</b></span>
          <span>보전 금액: <b className="text-blue-600">{fmt(checkedTotal)}원</b></span>
          <span>보전 비율: <b>{totalAmt > 0 ? ((checkedTotal / totalAmt) * 100).toFixed(1) : 0}%</b></span>
        </div>
      )}

      <LedgerTable records={rows} checkedIds={checkedIds} loading={loading} totalAmt={totalAmt} checkedTotal={checkedTotal}
        onToggle={toggleCheck} onToggleAll={toggleAll} checkLabel="보전" />
    </div>
  );
}

/* ================================================================== */
/*  부담비용 청구 탭                                                   */
/* ================================================================== */

function BurdenCostTab() {
  const supabase = createSupabaseBrowser();
  const { orgId, orgSecCd, orgName } = useAuth();
  const { getAccounts, getItems } = useCodeValues();

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [records, setRecords] = useState<ReimbRow[]>([]);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showFormDialog, setShowFormDialog] = useState(false);

  // 선거비용외 과목 자동 결정
  const accountOptions = orgSecCd ? getAccounts(orgSecCd, 2) : [];
  const accSecCd = accountOptions[0]?.cv_id || 0;
  const itemOptions = orgSecCd && accSecCd ? getItems(orgSecCd, 2, accSecCd) : [];
  const nonElectionItem = itemOptions.find((i) => i.cv_name.includes("선거비용외"));

  const handleQuery = useCallback(async () => {
    if (!orgId) return;
    if (!dateFrom || !dateTo) { alert("기간을 입력하세요."); return; }
    setLoading(true);
    const fromStr = dateFrom.replace(/-/g, "");
    const toStr = dateTo.replace(/-/g, "");
    // 선거비용외 지출 조회 후 클라이언트에서 부담비용 해당 건만 필터
    let query = supabase.from("acc_book")
      .select("acc_book_id, incm_sec_cd, acc_sec_cd, item_sec_cd, acc_date, content, acc_amt, rcp_yn, rcp_no, acc_print_ok, bigo, exp_group1_cd, exp_group2_cd, exp_group3_cd, customer:cust_id(name, reg_num, addr, job, tel)")
      .eq("org_id", orgId).eq("incm_sec_cd", 2)
      .gte("acc_date", fromStr).lte("acc_date", toStr)
      .order("acc_date", { ascending: true }).order("acc_sort_num", { ascending: true });
    if (nonElectionItem) query = query.eq("item_sec_cd", nonElectionItem.cv_id);
    const { data } = await query;
    const rows = ((data || []) as unknown as ReimbRow[]).filter(isBurdenCostRow);
    setRecords(rows);
    const checked = new Set<number>();
    rows.forEach((r) => { if (r.acc_print_ok === "Y") checked.add(r.acc_book_id); });
    setCheckedIds(checked);
    setLoading(false);
  }, [orgId, supabase, dateFrom, dateTo, nonElectionItem]);

  function toggleCheck(id: number) {
    setCheckedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
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
      const { error } = await supabase.from("acc_book")
        .update({ acc_print_ok: checkedIds.has(r.acc_book_id) ? "Y" : "N" })
        .eq("acc_book_id", r.acc_book_id);
      if (!error) ok++;
    }
    setSaving(false);
    alert(`${ok}/${records.length}건 청구 대상 저장 완료`);
  }

  const summary = calcBurdenSummary(records, checkedIds);
  let expCum = 0;
  const rows = records.map((r) => { expCum += r.acc_amt; return { ...r, expCum }; });
  const totalAmt = records.reduce((s, r) => s + r.acc_amt, 0);

  async function handleGenerateForm(formInput: {
    braillePublic: { count: number; pagesPerCopy: number };
    braillePledge: { count: number; pagesPerCopy: number };
    storageMedia: { count: number };
    account: { holder: string; bankName: string; accountNumber: string };
  }) {
    const data: BurdenCostFormData = {
      electionName: "제9회 전국동시지방선거",
      partyName: "",
      candidateName: orgName || "",
      ...formInput,
      amounts: summary,
    };
    const wb = await generateBurdenCostForm(data);
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `부담비용_지급청구서_${data.candidateName || "청구서"}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    setShowFormDialog(false);
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="bg-white rounded-lg border p-4 space-y-4">
        <div className="bg-blue-50 rounded p-3 text-sm text-blue-800">
          선거비용외 정치자금 지출내역을 조회합니다. 부담비용(점자형 선거공보, 저장매체, 활동보조인 등)에 해당하는 항목을 체크하여 청구서를 생성하세요.<br />
          청구기한: <b>선거일 후 10일 이내</b>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><Label>과목</Label><Input value={nonElectionItem?.cv_name || "선거비용외"} readOnly className="mt-1 bg-gray-50" /></div>
          <div><Label>시작일</Label><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
          <div><Label>종료일</Label><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
        </div>
        <div className="flex gap-2 pt-4 border-t">
          <Button onClick={handleQuery} disabled={loading}>{loading ? "조회 중..." : "조회"}</Button>
          <Button onClick={handleSave} disabled={records.length === 0 || saving}>{saving ? "저장 중..." : "청구 대상 저장"}</Button>
          <Button variant="outline" onClick={() => setShowFormDialog(true)} disabled={checkedIds.size === 0}>
            청구서 생성 (서식7)
          </Button>
        </div>
      </div>

      {/* 항목별 소계 */}
      {records.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {([
            ["점자형선거공보", summary.점자형선거공보],
            ["점자형선거공약서", summary.점자형선거공약서],
            ["저장매체", summary.저장매체],
            ["활동보조인", summary.활동보조인],
            ["합계", summary.total],
          ] as [string, number][]).map(([label, amt]) => (
            <div key={label} className={`rounded-lg border p-3 text-center ${label === "합계" ? "bg-blue-50 border-blue-200" : "bg-white"}`}>
              <div className="text-xs text-gray-500">{label}</div>
              <div className={`font-bold text-sm mt-1 ${label === "합계" ? "text-blue-700" : "text-gray-800"}`}>
                {fmt(amt)}원
              </div>
            </div>
          ))}
        </div>
      )}

      <LedgerTable records={rows} checkedIds={checkedIds} loading={loading} totalAmt={totalAmt} checkedTotal={summary.total}
        onToggle={toggleCheck} onToggleAll={toggleAll} checkLabel="청구" />

      {/* 청구서 정보 입력 Dialog */}
      {showFormDialog && (
        <BurdenCostFormDialog summary={summary} onGenerate={handleGenerateForm} onClose={() => setShowFormDialog(false)} />
      )}
    </div>
  );
}

/* ================================================================== */
/*  부담비용 소계 계산                                                  */
/* ================================================================== */

/** 부담비용 해당 여부 판별 (exp_group1_cd 또는 content 키워드) */
const BURDEN_KEYWORDS = ["점자", "저장매체", "디지털파일", "활동보조", "수화통역"];
function isBurdenCostRow(r: ReimbRow): boolean {
  if (r.exp_group1_cd === "부담비용") return true;
  const c = (r.content || "").toLowerCase();
  return BURDEN_KEYWORDS.some((kw) => c.includes(kw));
}

/** 부담비용 항목 자동 분류 (exp_group2_cd 우선, 없으면 content 키워드 매칭) */
function detectBurdenCategory(r: ReimbRow): "점자형선거공보" | "점자형선거공약서" | "저장매체" | "활동보조인" | "기타" {
  const g2 = r.exp_group2_cd || "";
  if (g2 === "점자형선거공보") return "점자형선거공보";
  if (g2 === "점자형선거공약서") return "점자형선거공약서";
  if (g2 === "저장매체") return "저장매체";
  if (g2 === "활동보조인") return "활동보조인";
  // content 키워드 매칭 (기존 데이터 대응)
  const c = (r.content || "").toLowerCase();
  if (c.includes("점자") && c.includes("공보")) return "점자형선거공보";
  if (c.includes("점자") && c.includes("공약")) return "점자형선거공약서";
  if (c.includes("저장매체") || c.includes("디지털파일")) return "저장매체";
  if (c.includes("활동보조") || c.includes("수화통역")) return "활동보조인";
  return "기타";
}

function calcBurdenSummary(records: ReimbRow[], checkedIds: Set<number>): BurdenCostAmounts {
  const checked = records.filter((r) => checkedIds.has(r.acc_book_id));
  const byCategory = (cat: string) => checked.filter((r) => detectBurdenCategory(r) === cat).reduce((s, r) => s + r.acc_amt, 0);
  return {
    점자형선거공보: byCategory("점자형선거공보"),
    점자형선거공약서: byCategory("점자형선거공약서"),
    저장매체: byCategory("저장매체"),
    활동보조인: byCategory("활동보조인"),
    total: checked.reduce((s, r) => s + r.acc_amt, 0),
  };
}

/* ================================================================== */
/*  공통 수입지출부 테이블                                              */
/* ================================================================== */

function LedgerTable({ records, checkedIds, loading, totalAmt, checkedTotal, onToggle, onToggleAll, checkLabel }: {
  records: (ReimbRow & { expCum: number })[];
  checkedIds: Set<number>;
  loading: boolean;
  totalAmt: number;
  checkedTotal: number;
  onToggle: (id: number) => void;
  onToggleAll: () => void;
  checkLabel: string;
}) {
  return (
    <div className="bg-white rounded-lg border overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th rowSpan={2} className={th1}>번호</th>
            <th rowSpan={2} className={th1}>
              <div className="flex flex-col items-center gap-0.5">
                <span>{checkLabel}</span>
                <input type="checkbox" checked={records.length > 0 && checkedIds.size === records.length} onChange={onToggleAll} title="전체 선택" />
              </div>
            </th>
            <th rowSpan={2} className={th1}>년월일</th>
            <th rowSpan={2} className={th1}>내 역</th>
            <th colSpan={2} className={th1}>지 출 액</th>
            <th rowSpan={2} className={th1}>누 계</th>
            <th colSpan={5} className={th1}>지출을 받은 자</th>
            <th rowSpan={2} className={th1}>영수증<br />번호</th>
            <th rowSpan={2} className={th1}>비고</th>
          </tr>
          <tr>
            <th className={th2}>금회</th>
            <th className={th2}>누계</th>
            <th className={th2}>성명</th>
            <th className={th2}>생년월일</th>
            <th className={th2}>주소</th>
            <th className={th2}>직업</th>
            <th className={th2}>전화번호</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={14} className="px-3 py-8 text-center text-gray-400">로딩 중...</td></tr>
          ) : records.length === 0 ? (
            <tr><td colSpan={14} className="px-3 py-8 text-center text-gray-400">기간을 설정 후 [조회]를 클릭하세요.</td></tr>
          ) : records.map((r, i) => {
            const cust = getCust(r);
            const isChecked = checkedIds.has(r.acc_book_id);
            return (
              <tr key={r.acc_book_id} className={`hover:bg-gray-50 ${isChecked ? "bg-blue-50" : ""}`}>
                <td className={td}>{i + 1}</td>
                <td className={`${td} text-center`}><input type="checkbox" checked={isChecked} onChange={() => onToggle(r.acc_book_id)} /></td>
                <td className={td}>{fmtDate(r.acc_date)}</td>
                <td className={td}>{r.content}</td>
                <td className={`${tdR} text-red-600`}>{fmt(r.acc_amt)}</td>
                <td className={`${tdR} text-red-400`}>{fmt(r.expCum)}</td>
                <td className={`${tdR} font-semibold`}>{fmt(-r.expCum)}</td>
                <td className={td}>{cust.name}</td>
                <td className={td}>{cust.regNum}</td>
                <td className={td}>{cust.addr}</td>
                <td className={td}>{cust.job}</td>
                <td className={td}>{cust.tel}</td>
                <td className={td}>{r.rcp_no || ""}</td>
                <td className={`${td} text-gray-500`}>{r.bigo || ""}</td>
              </tr>
            );
          })}
        </tbody>
        {records.length > 0 && (
          <tfoot>
            <tr className="bg-gray-100 font-bold">
              <td colSpan={4} className={`${td} text-right`}>합 계</td>
              <td className={`${tdR} text-red-700`}>{fmt(totalAmt)}</td>
              <td colSpan={9} className={td} />
            </tr>
            <tr className="bg-blue-50 font-bold">
              <td colSpan={4} className={`${td} text-right text-blue-700`}>{checkLabel} 대상 합계 ({checkedIds.size}건)</td>
              <td className={`${tdR} text-blue-700`}>{fmt(checkedTotal)}</td>
              <td colSpan={9} className={td} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/* ================================================================== */
/*  청구서 정보 입력 Dialog                                            */
/* ================================================================== */

function BurdenCostFormDialog({ summary, onGenerate, onClose }: {
  summary: BurdenCostAmounts;
  onGenerate: (input: {
    braillePublic: { count: number; pagesPerCopy: number };
    braillePledge: { count: number; pagesPerCopy: number };
    storageMedia: { count: number };
    account: { holder: string; bankName: string; accountNumber: string };
  }) => void;
  onClose: () => void;
}) {
  const [braillePublicCount, setBraillePublicCount] = useState(0);
  const [braillePublicPages, setBraillePublicPages] = useState(0);
  const [braillePledgeCount, setBraillePledgeCount] = useState(0);
  const [braillePledgePages, setBraillePledgePages] = useState(0);
  const [storageCount, setStorageCount] = useState(0);
  const [holder, setHolder] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");

  function handleSubmit() {
    onGenerate({
      braillePublic: { count: braillePublicCount, pagesPerCopy: braillePublicPages },
      braillePledge: { count: braillePledgeCount, pagesPerCopy: braillePledgePages },
      storageMedia: { count: storageCount },
      account: { holder, bankName, accountNumber },
    });
  }

  const inputCls = "mt-1 w-full border rounded px-2 py-1.5 text-sm";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold">부담비용 지급청구서 생성 (서식7)</h3>

        {/* 작성/제출 수량 */}
        <div>
          <h4 className="font-semibold text-sm mb-2">작성·제출 수량</h4>
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <Label className="text-xs col-span-3">점자형 선거공보</Label>
              <div><Label className="text-[11px]">부수(A)</Label><input type="number" min={0} className={inputCls} value={braillePublicCount || ""} onChange={(e) => setBraillePublicCount(Number(e.target.value))} /></div>
              <div><Label className="text-[11px]">1부당 매수(B)</Label><input type="number" min={0} className={inputCls} value={braillePublicPages || ""} onChange={(e) => setBraillePublicPages(Number(e.target.value))} /></div>
              <div><Label className="text-[11px]">총매수(C=A×B)</Label><input readOnly className={`${inputCls} bg-gray-50`} value={braillePublicCount * braillePublicPages || ""} /></div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Label className="text-xs col-span-3">점자형 선거공약서</Label>
              <div><Label className="text-[11px]">부수(A)</Label><input type="number" min={0} className={inputCls} value={braillePledgeCount || ""} onChange={(e) => setBraillePledgeCount(Number(e.target.value))} /></div>
              <div><Label className="text-[11px]">1부당 매수(B)</Label><input type="number" min={0} className={inputCls} value={braillePledgePages || ""} onChange={(e) => setBraillePledgePages(Number(e.target.value))} /></div>
              <div><Label className="text-[11px]">총매수(C=A×B)</Label><input readOnly className={`${inputCls} bg-gray-50`} value={braillePledgeCount * braillePledgePages || ""} /></div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Label className="text-xs col-span-3">저장매체</Label>
              <div><Label className="text-[11px]">개수</Label><input type="number" min={0} className={inputCls} value={storageCount || ""} onChange={(e) => setStorageCount(Number(e.target.value))} /></div>
            </div>
          </div>
        </div>

        {/* 수령계좌 */}
        <div>
          <h4 className="font-semibold text-sm mb-2">수령계좌</h4>
          <div className="grid grid-cols-3 gap-2">
            <div><Label className="text-[11px]">예금주</Label><input className={inputCls} value={holder} onChange={(e) => setHolder(e.target.value)} /></div>
            <div><Label className="text-[11px]">금융기관</Label><input className={inputCls} value={bankName} onChange={(e) => setBankName(e.target.value)} /></div>
            <div><Label className="text-[11px]">계좌번호</Label><input className={inputCls} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} /></div>
          </div>
        </div>

        {/* 청구금액 확인 */}
        <div>
          <h4 className="font-semibold text-sm mb-2">청구금액 확인</h4>
          <div className="bg-gray-50 rounded p-3 text-sm space-y-1">
            <div className="flex justify-between"><span>점자형 선거공보</span><span className="font-mono">{fmt(summary.점자형선거공보)}원</span></div>
            <div className="flex justify-between"><span>점자형 선거공약서</span><span className="font-mono">{fmt(summary.점자형선거공약서)}원</span></div>
            <div className="flex justify-between"><span>저장매체</span><span className="font-mono">{fmt(summary.저장매체)}원</span></div>
            <div className="flex justify-between"><span>활동보조인</span><span className="font-mono">{fmt(summary.활동보조인)}원</span></div>
            <div className="flex justify-between border-t pt-1 font-bold text-blue-700"><span>합계</span><span className="font-mono">{fmt(summary.total)}원</span></div>
          </div>
        </div>

        {/* 첨부서류 안내 */}
        <div>
          <h4 className="font-semibold text-sm mb-1">필수 첨부서류</h4>
          <ul className="text-xs text-gray-600 space-y-0.5 list-disc pl-4">
            <li>정치자금 수입·지출부 사본</li>
            <li>활동보조인 수당·실비 지급 명세서</li>
            <li>영수증 등 증빙서류 사본</li>
            <li>수령계좌 통장 사본</li>
          </ul>
        </div>

        {/* 버튼 */}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={handleSubmit}>청구서 Excel 다운로드</Button>
        </div>
      </div>
    </div>
  );
}
