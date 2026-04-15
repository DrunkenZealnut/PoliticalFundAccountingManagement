"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/stores/auth";
import { useSort, SortTh } from "@/hooks/use-sort";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpTooltip } from "@/components/help-tooltip";
import { AddressSearchDialog } from "@/components/address-search-dialog";
import { AddressHistoryDialog } from "@/components/address-history-dialog";
import { PageGuide } from "@/components/page-guide";
import { EmptyState } from "@/components/empty-state";
import { PAGE_GUIDES } from "@/lib/page-guides";

interface Customer {
  cust_id: number;
  cust_sec_cd: number;
  reg_num: string | null;
  name: string | null;
  job: string | null;
  tel: string | null;
  sido: number | null;
  post: string | null;
  addr: string | null;
  addr_detail: string | null;
  fax: string | null;
  bigo: string | null;
  reg_date: string | null;
  cust_order: number | null;
}

export default function CustomerPage() {
  const { orgId } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [addrDialogOpen, setAddrDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);

  const [checked, setChecked] = useState<Set<number>>(new Set());

  const [form, setForm] = useState({
    cust_sec_cd: 63,
    name: "",
    reg_num: "",
    job: "",
    sido: -1,
    post: "",
    addr: "",
    addr_detail: "",
    tel: "",
    fax: "",
    bigo: "",
  });

  function loadCustomers() {
    setLoading(true);
    const url = orgId ? `/api/customers?orgId=${orgId}` : "/api/customers";
    fetch(url)
      .then((r) => r.json())
      .then((data) => { setCustomers(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
  useEffect(() => { loadCustomers(); }, [orgId]);

  function resetForm() {
    setSelected(null);
    setForm({
      cust_sec_cd: 63,
      name: "",
      reg_num: "",
      job: "",
      sido: -1,
      post: "",
      addr: "",
      addr_detail: "",
      tel: "",
      fax: "",
      bigo: "",
    });
  }

  function selectCustomer(c: Customer) {
    setSelected(c);
    setForm({
      cust_sec_cd: c.cust_sec_cd,
      name: c.name || "",
      reg_num: c.reg_num || "",
      job: c.job || "",
      sido: c.sido || -1,
      post: c.post || "",
      addr: c.addr || "",
      addr_detail: c.addr_detail || "",
      tel: c.tel || "",
      fax: c.fax || "",
      bigo: c.bigo || "",
    });
  }

  async function handleSave() {
    if (!form.name.trim()) {
      alert("성명(명칭)을 입력하세요.");
      return;
    }

    if (selected) {
      // 주소/전화번호 변경 시 이력 저장
      const addrChanged =
        form.tel !== (selected.tel || "") ||
        form.post !== (selected.post || "") ||
        form.addr !== (selected.addr || "") ||
        form.addr_detail !== (selected.addr_detail || "");

      if (addrChanged) {
        await fetch("/api/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "save_addr_history",
            cust_id: selected.cust_id,
            tel: selected.tel,
            post: selected.post,
            addr: selected.addr,
            addr_detail: selected.addr_detail,
          }),
        });
      }

      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", cust_id: selected.cust_id, data: form }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`수정 실패: ${err.error}`);
        return;
      }
    } else {
      // 중복 체크 — 기존 목록에서 확인
      const dup = customers.find(
        (c) => c.cust_sec_cd === form.cust_sec_cd && c.name === form.name && (c.reg_num || "") === form.reg_num
      );
      if (dup) {
        alert("같은 구분 + 성명 + 생년월일(사업자번호)의 수입지출처가 이미 존재합니다.");
        return;
      }

      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "insert", data: form }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`등록 실패: ${err.error}`);
        return;
      }
    }

    resetForm();
    loadCustomers();
  }

  async function handleDelete() {
    if (!selected) return;
    if (!confirm(`"${selected.name}" 수입지출처를 삭제하시겠습니까?`)) return;

    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", ids: [selected.cust_id] }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "삭제 실패");
      return;
    }

    resetForm();
    loadCustomers();
  }

  function toggleCheck(custId: number) {
    const next = new Set(checked);
    if (next.has(custId)) next.delete(custId);
    else next.add(custId);
    setChecked(next);
  }

  function toggleAll() {
    if (checked.size === customers.length) {
      setChecked(new Set());
    } else {
      setChecked(new Set(customers.map((c) => c.cust_id)));
    }
  }

  async function handleBulkDelete() {
    if (checked.size === 0) return;
    const ids = Array.from(checked);

    // 수입/지출 내역이 있는 수입지출처 확인
    const checkRes = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "check_used", ids }),
    });
    const { usedIds: usedArr } = await checkRes.json();
    const usedIds = new Set(usedArr as number[]);
    const deletable = ids.filter((id) => !usedIds.has(id));
    const blocked = ids.length - deletable.length;

    if (deletable.length === 0) {
      alert("선택된 수입지출처 모두 수입/지출내역이 등록되어 삭제할 수 없습니다.");
      return;
    }

    const msg = blocked > 0
      ? `${ids.length}건 중 ${blocked}건은 내역이 있어 삭제 불가.\n${deletable.length}건을 삭제하시겠습니까?`
      : `${deletable.length}건을 삭제하시겠습니까?`;

    if (!confirm(msg)) return;

    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", ids: deletable }),
    });

    if (!res.ok) {
      const err = await res.json();
      alert(`삭제 실패: ${err.error}`);
    } else {
      alert(`${deletable.length}건 삭제 완료`);
      setChecked(new Set());
      resetForm();
      loadCustomers();
    }
  }

  const { sorted, sort, toggle } = useSort(customers);

  const custTypes = [
    { value: 62, label: "사업자" },
    { value: 63, label: "개인" },
    { value: 89, label: "후원회" },
    { value: 88, label: "중앙당" },
    { value: 57, label: "시도당" },
    { value: 58, label: "정책연구소" },
    { value: 59, label: "정당선거사무소" },
    { value: 60, label: "국회의원" },
    { value: 61, label: "(예비)후보자" },
    { value: 103, label: "기타" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">수입지출처 관리</h2>
      </div>
      <PageGuide {...PAGE_GUIDES.customer} />
      <div className="hidden">{/* spacer for structure */}
        <div className="flex gap-2">
          <HelpTooltip id="btn.new">
            <Button variant="outline" onClick={resetForm}>신규입력</Button>
          </HelpTooltip>
          <HelpTooltip id="btn.save">
            <Button onClick={handleSave}>저장</Button>
          </HelpTooltip>
          <HelpTooltip id="btn.delete">
            <Button variant="destructive" onClick={handleDelete} disabled={!selected}>
              삭제
            </Button>
          </HelpTooltip>
          <Button variant="destructive" size="sm" onClick={handleBulkDelete} disabled={checked.size === 0}>
            선택삭제 ({checked.size})
          </Button>
          <HelpTooltip id="customer.history">
            <Button
              variant="outline"
              onClick={() => setHistoryDialogOpen(true)}
              disabled={!selected}
            >
              이력
            </Button>
          </HelpTooltip>
        </div>
      </div>

      {/* 입력 폼 */}
      <div className="bg-white rounded-lg border p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <HelpTooltip id="customer.type">
              <Label>구분</Label>
            </HelpTooltip>
            <select
              className="w-full mt-1 border rounded px-3 py-2 text-sm"
              value={form.cust_sec_cd}
              onChange={(e) =>
                setForm({ ...form, cust_sec_cd: Number(e.target.value) })
              }
            >
              {custTypes.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <HelpTooltip id="customer.name">
              <Label>성명(명칭) *</Label>
            </HelpTooltip>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="성명 또는 법인/단체명"
            />
          </div>
          <div>
            <HelpTooltip id="customer.reg-num">
              <Label>생년월일/사업자번호</Label>
            </HelpTooltip>
            <Input
              value={form.reg_num}
              onChange={(e) => setForm({ ...form, reg_num: e.target.value })}
              placeholder="YYYYMMDD 또는 사업자번호"
            />
          </div>
          <div>
            <Label>직업(업종)</Label>
            <Input
              value={form.job}
              onChange={(e) => setForm({ ...form, job: e.target.value })}
            />
          </div>
          <div>
            <Label>우편번호</Label>
            <div className="flex gap-1 mt-1">
              <Input
                value={form.post}
                onChange={(e) => setForm({ ...form, post: e.target.value })}
                placeholder="5자리"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAddrDialogOpen(true)}
                className="shrink-0 text-xs"
              >
                주소검색
              </Button>
            </div>
          </div>
          <div>
            <Label>전화번호</Label>
            <Input
              value={form.tel}
              onChange={(e) => setForm({ ...form, tel: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <HelpTooltip id="customer.addr-search">
              <Label>주소</Label>
            </HelpTooltip>
            <Input
              value={form.addr}
              onChange={(e) => setForm({ ...form, addr: e.target.value })}
              placeholder="주소검색 버튼으로 입력하거나 직접 입력"
            />
          </div>
          <div>
            <Label>상세주소</Label>
            <Input
              value={form.addr_detail}
              onChange={(e) => setForm({ ...form, addr_detail: e.target.value })}
              placeholder="상세주소 직접 입력"
            />
          </div>
          <div className="md:col-span-3">
            <Label>비고</Label>
            <Input
              value={form.bigo}
              onChange={(e) => setForm({ ...form, bigo: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* 목록 그리드 */}
      <div className="bg-white rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-2 py-2 text-center w-8">
                <input type="checkbox" checked={customers.length > 0 && checked.size === customers.length} onChange={toggleAll} />
              </th>
              <th className="px-3 py-2 text-left">번호</th>
              <SortTh label="구분" sortKey="cust_sec_cd" current={sort} onToggle={toggle} className="text-left" />
              <SortTh label="성명(명칭)" sortKey="name" current={sort} onToggle={toggle} className="text-left" />
              <SortTh label="생년월일/사업자번호" sortKey="reg_num" current={sort} onToggle={toggle} className="text-left" />
              <SortTh label="직업" sortKey="job" current={sort} onToggle={toggle} className="text-left" />
              <SortTh label="전화번호" sortKey="tel" current={sort} onToggle={toggle} className="text-left" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-gray-400">
                  로딩 중...
                </td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-0">
                  <EmptyState
                    icon="👥"
                    title="아직 수입지출처가 없습니다"
                    description="수입제공자·지출대상자를 등록하세요. 수입/지출 등록 시 거래처 검색이 빨라집니다."
                    actions={[
                      { label: "직접 등록하기", href: "/dashboard/customer" },
                      { label: "엑셀 일괄등록", href: "/dashboard/customer-batch", variant: "outline" },
                    ]}
                  />
                </td>
              </tr>
            ) : (
              sorted.map((c, i) => (
                <tr
                  key={c.cust_id}
                  className={`border-b cursor-pointer hover:bg-gray-50 ${
                    selected?.cust_id === c.cust_id ? "bg-blue-50" : ""
                  }`}
                  onClick={() => selectCustomer(c)}
                >
                  <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={checked.has(c.cust_id)} onChange={() => toggleCheck(c.cust_id)} />
                  </td>
                  <td className="px-3 py-2">{i + 1}</td>
                  <td className="px-3 py-2">
                    {custTypes.find((t) => t.value === c.cust_sec_cd)?.label || c.cust_sec_cd}
                  </td>
                  <td className="px-3 py-2 font-medium">{c.name}</td>
                  <td className="px-3 py-2">{c.reg_num}</td>
                  <td className="px-3 py-2">{c.job}</td>
                  <td className="px-3 py-2">{c.tel}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 우편번호 검색 팝업 */}
      <AddressSearchDialog
        open={addrDialogOpen}
        onClose={() => setAddrDialogOpen(false)}
        onSelect={({ post, addr }) => {
          setForm({ ...form, post, addr });
        }}
      />

      {/* 주소 변경 이력 팝업 */}
      {selected && (
        <AddressHistoryDialog
          open={historyDialogOpen}
          onClose={() => setHistoryDialogOpen(false)}
          custId={selected.cust_id}
          custName={selected.name || ""}
          onApply={(addr) => {
            setForm({
              ...form,
              tel: addr.tel,
              post: addr.post,
              addr: addr.addr,
              addr_detail: addr.addr_detail,
            });
            setHistoryDialogOpen(false);
          }}
        />
      )}
    </div>
  );
}
