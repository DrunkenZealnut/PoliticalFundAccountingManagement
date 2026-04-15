"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { useSort, SortTh } from "@/hooks/use-sort";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpTooltip } from "@/components/help-tooltip";
import { PageGuide } from "@/components/page-guide";
import { EmptyState } from "@/components/empty-state";
import { PAGE_GUIDES } from "@/lib/page-guides";

interface Estate {
  estate_id: number;
  org_id: number;
  estate_sec_cd: number;
  kind: string;
  qty: number;
  content: string;
  amt: number;
  remark: string;
  reg_date: string | null;
  estate_order: number | null;
}

const ESTATE_TYPES = [
  { value: 43, label: "토지" },
  { value: 44, label: "건물" },
  { value: 45, label: "주식 또는 유가증권" },
  { value: 46, label: "비품" },
  { value: 47, label: "현금 및 예금" },
  { value: 48, label: "그 밖의 재산" },
  { value: 49, label: "차입금" },
];

export default function EstatePage() {
  const supabase = createSupabaseBrowser();
  const { orgId } = useAuth();

  const [records, setRecords] = useState<Estate[]>([]);
  const [selected, setSelected] = useState<Estate | null>(null);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    estate_sec_cd: 47,
    kind: "",
    qty: 1,
    content: "",
    amt: 0,
    remark: "",
  });

  function loadRecords() {
    if (!orgId) return;
    const supabase = createSupabaseBrowser();
    setLoading(true);
    supabase.from("estate").select("*").eq("org_id", orgId)
      .order("estate_sec_cd").order("estate_order")
      .then(({ data }) => { setRecords((data as Estate[]) || []); setLoading(false); });
  }

  useEffect(() => {
    if (!orgId) return;
    const supabase = createSupabaseBrowser();
    supabase.from("estate").select("*").eq("org_id", orgId)
      .order("estate_sec_cd").order("estate_order")
      .then(({ data }) => { setRecords((data as Estate[]) || []); setLoading(false); });
  }, [orgId]);

  function resetForm() {
    setSelected(null);
    setForm({ estate_sec_cd: 47, kind: "", qty: 1, content: "", amt: 0, remark: "" });
  }

  function selectRecord(r: Estate) {
    setSelected(r);
    setForm({ estate_sec_cd: r.estate_sec_cd, kind: r.kind, qty: r.qty, content: r.content, amt: r.amt, remark: r.remark });
  }

  async function handleSave() {
    if (!orgId || !form.kind || !form.content) {
      alert("종류, 내용을 입력하세요.");
      return;
    }
    const payload = { org_id: orgId, ...form };

    if (selected) {
      const { error } = await supabase.from("estate").update(payload).eq("estate_id", selected.estate_id);
      if (error) { alert(`수정 실패: ${error.message}`); return; }
    } else {
      const { error } = await supabase.from("estate").insert(payload);
      if (error) { alert(`등록 실패: ${error.message}`); return; }
    }
    resetForm();
    loadRecords();
  }

  async function handleDelete() {
    if (!selected) return;
    if (!confirm("선택한 재산내역을 삭제하시겠습니까?")) return;
    const { error } = await supabase.from("estate").delete().eq("estate_id", selected.estate_id);
    if (error) { alert(`삭제 실패: ${error.message}`); return; }
    resetForm();
    loadRecords();
  }

  const { sorted, sort, toggle } = useSort(records);

  const totalAmt = records.reduce((s, r) => s + r.amt, 0);
  const totalQty = records.reduce((s, r) => s + r.qty, 0);
  const fmt = (n: number) => n.toLocaleString("ko-KR");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">재산내역 관리</h2>
      </div>
      <PageGuide {...PAGE_GUIDES.estate} />
      <div className="hidden">{/* spacer */}
        <div className="text-sm">
          합계수량: <b>{totalQty}</b> | 합계금액: <b>{fmt(totalAmt)}원</b>
        </div>
      </div>

      <div className="bg-white rounded-lg border p-4">
        <div className="flex gap-2 mb-4">
          <Button variant="outline" size="sm" onClick={resetForm}>신규입력</Button>
          <Button size="sm" onClick={handleSave}>저장</Button>
          <Button variant="destructive" size="sm" onClick={handleDelete} disabled={!selected}>삭제</Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <HelpTooltip id="estate.type"><Label>재산구분</Label></HelpTooltip>
            <select className="w-full mt-1 border rounded px-3 py-2 text-sm" value={form.estate_sec_cd}
              onChange={(e) => setForm({ ...form, estate_sec_cd: Number(e.target.value) })}>
              {ESTATE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <Label>종류</Label>
            <Input value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} placeholder="예: 예금" />
          </div>
          <div>
            <Label>수량</Label>
            <Input type="number" value={form.qty} onChange={(e) => setForm({ ...form, qty: Number(e.target.value) })} />
          </div>
          <div className="md:col-span-2">
            <Label>내용</Label>
            <Input value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="예: 국민은행 527802-01-363256" />
          </div>
          <div>
            <HelpTooltip id="estate.amount"><Label>가액 (원)</Label></HelpTooltip>
            <Input type="number" value={form.amt || ""} onChange={(e) => setForm({ ...form, amt: Number(e.target.value) })} />
          </div>
          <div className="md:col-span-3">
            <Label>비고</Label>
            <Input value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-3 py-2 text-left">번호</th>
              <SortTh label="재산구분" sortKey="estate_sec_cd" current={sort} onToggle={toggle} className="text-left" />
              <SortTh label="종류" sortKey="kind" current={sort} onToggle={toggle} className="text-left" />
              <SortTh label="수량" sortKey="qty" current={sort} onToggle={toggle} className="text-right" />
              <SortTh label="내용" sortKey="content" current={sort} onToggle={toggle} className="text-left" />
              <SortTh label="가액" sortKey="amt" current={sort} onToggle={toggle} className="text-right" />
              <SortTh label="비고" sortKey="remark" current={sort} onToggle={toggle} className="text-left" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">로딩 중...</td></tr>
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-0">
                  <EmptyState
                    icon="🏦"
                    title="아직 재산 내역이 없습니다"
                    description="재산 내역을 등록하면 결산에 반영됩니다."
                    actions={[{ label: "등록하기", href: "/dashboard/estate" }]}
                  />
                </td>
              </tr>
            ) : sorted.map((r, i) => (
              <tr key={r.estate_id}
                className={`border-b cursor-pointer hover:bg-gray-50 ${selected?.estate_id === r.estate_id ? "bg-blue-50" : ""}`}
                onClick={() => selectRecord(r)}>
                <td className="px-3 py-2">{i + 1}</td>
                <td className="px-3 py-2">{ESTATE_TYPES.find((t) => t.value === r.estate_sec_cd)?.label}</td>
                <td className="px-3 py-2">{r.kind}</td>
                <td className="px-3 py-2 text-right">{r.qty}</td>
                <td className="px-3 py-2">{r.content}</td>
                <td className="px-3 py-2 text-right font-mono">{fmt(r.amt)}</td>
                <td className="px-3 py-2 text-gray-500">{r.remark}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
