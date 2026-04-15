"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/stores/auth";
import { useCodeValues } from "@/hooks/use-code-values";
import { useUndo } from "@/hooks/use-undo";
import { useDonationLimit } from "@/hooks/use-donation-limit";
import { useSort, SortTh } from "@/hooks/use-sort";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpTooltip } from "@/components/help-tooltip";
import { CodeSelect } from "@/components/code-select";
import { CustomerSearchDialog } from "@/components/customer-search-dialog";
import { AccBookSearch, type SearchFilters } from "@/components/acc-book-search";
import { PageGuide } from "@/components/page-guide";
import { EmptyState } from "@/components/empty-state";
import { PAGE_GUIDES } from "@/lib/page-guides";

interface AccBook {
  acc_book_id: number;
  org_id: number;
  incm_sec_cd: number;
  acc_sec_cd: number;
  item_sec_cd: number;
  exp_sec_cd: number;
  cust_id: number;
  acc_date: string;
  content: string;
  acc_amt: number;
  rcp_yn: string;
  rcp_no: string | null;
  rcp_no2: number | null;
  acc_sort_num: number | null;
  bigo: string | null;
  return_yn: string | null;
  customer?: { name: string | null } | null;
}

export default function IncomePage() {
  const { orgId, orgSecCd, orgType } = useAuth();
  const { loading: codesLoading, getName, getAccounts, getItems } = useCodeValues();
  const { checkLimit } = useDonationLimit();

  const [records, setRecords] = useState<AccBook[]>([]);
  const [selected, setSelected] = useState<AccBook | null>(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState({ income: 0, expense: 0, balance: 0 });
  const [filteredSummary, setFilteredSummary] = useState({ income: 0, expense: 0, balance: 0, count: 0 });
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [customerDialogMode, setCustomerDialogMode] = useState<"search" | "register">("search");
  const [selectedCustomerName, setSelectedCustomerName] = useState("");
  const [activeFilters, setActiveFilters] = useState<SearchFilters | null>(null);
  const [searchAccSecCd, setSearchAccSecCd] = useState(0);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());

  // Search dropdown options
  const searchAccountOptions = orgSecCd ? getAccounts(orgSecCd, 1) : [];
  const searchItemOptions =
    orgSecCd && searchAccSecCd ? getItems(orgSecCd, 1, searchAccSecCd) : [];

  const [form, setForm] = useState({
    acc_sec_cd: 0,
    item_sec_cd: 0,
    acc_date: "",
    acc_amt: 0,
    cust_id: 0,
    content: "",
    rcp_yn: "N",
    rcp_no: "",
    bigo: "",
  });

  // 계정/과목 드롭다운 옵션 (ACC_REL 기반)
  const accountOptions = orgSecCd ? getAccounts(orgSecCd, 1) : [];
  const itemOptions =
    orgSecCd && form.acc_sec_cd ? getItems(orgSecCd, 1, form.acc_sec_cd) : [];

  async function loadRecords(filters?: SearchFilters | null) {
    if (!orgId) return;
    setLoading(true);

    const params = new URLSearchParams({ orgId: String(orgId), incmSecCd: "1" });
    if (filters) {
      if (filters.dateFrom) params.set("dateFrom", filters.dateFrom.replace(/-/g, ""));
      if (filters.dateTo) params.set("dateTo", filters.dateTo.replace(/-/g, ""));
      if (filters.accSecCd) params.set("accSecCd", String(filters.accSecCd));
      if (filters.itemSecCd) params.set("itemSecCd", String(filters.itemSecCd));
      if (filters.content) params.set("keyword", filters.content);
      if (filters.amountMin) params.set("amtMin", filters.amountMin);
      if (filters.amountMax) params.set("amtMax", filters.amountMax);
    }

    try {
      const res = await fetch(`/api/acc-book?${params}`);
      const json = await res.json();
      setRecords(json.records || []);
      if (json.summary) setSummary(json.summary);
      if (json.filteredSummary) setFilteredSummary(json.filteredSummary);
    } catch { /* ignore */ }
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
  useEffect(() => { if (orgId) loadRecords(); }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Undo hook
  const { performUndo, undoing, canUndo } = useUndo(orgId, () =>
    loadRecords(activeFilters)
  );

  // Ctrl+Z keyboard shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && canUndo && !undoing) {
        e.preventDefault();
        performUndo();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canUndo, undoing, performUndo]);

  function handleExcelExport() {
    if (!orgId) return;
    window.open(`/api/excel/export?orgId=${orgId}&type=income`, "_blank");
  }

  async function handleBatchReceiptNumbers() {
    if (!orgId) return;

    const res = await fetch("/api/acc-book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "batch_receipt", orgId, incmSecCd: 1 }),
    });
    const result = await res.json();

    if (result.count === 0) {
      alert("영수증번호를 일괄 부여할 대상이 없습니다.\n(증빙서첨부=Y이고 번호 미입력인 건)");
      return;
    }

    alert(`${result.count}건에 영수증번호 ${result.startNum}~${result.endNum}을 부여했습니다.`);
    loadRecords(activeFilters);
  }

  function resetForm() {
    setSelected(null);
    setSelectedCustomerName("");
    setForm({
      acc_sec_cd: 0,
      item_sec_cd: 0,
      acc_date: "",
      acc_amt: 0,
      cust_id: 0,
      content: "",
      rcp_yn: "N",
      rcp_no: "",
      bigo: "",
    });
  }

  function selectRecord(r: AccBook) {
    setSelected(r);
    const custName =
      r.customer && typeof r.customer === "object" && "name" in r.customer
        ? (r.customer as { name: string | null }).name || ""
        : "";
    setSelectedCustomerName(custName);
    setForm({
      acc_sec_cd: r.acc_sec_cd,
      item_sec_cd: r.item_sec_cd,
      acc_date:
        r.acc_date.length === 8
          ? `${r.acc_date.slice(0, 4)}-${r.acc_date.slice(4, 6)}-${r.acc_date.slice(6, 8)}`
          : r.acc_date,
      acc_amt: r.acc_amt,
      cust_id: r.cust_id,
      content: r.content,
      rcp_yn: r.rcp_yn,
      rcp_no: r.rcp_no || "",
      bigo: r.bigo || "",
    });
  }

  async function handleSave() {
    if (!orgId) return;
    if (!form.acc_sec_cd) {
      alert("계정을 선택하세요.");
      return;
    }
    if (!form.item_sec_cd) {
      alert("과목을 선택하세요.");
      return;
    }
    if (!form.acc_date) {
      alert("수입일자를 입력하세요.");
      return;
    }
    if (form.acc_amt === 0) {
      alert("수입금액을 입력하세요.");
      return;
    }
    if (!form.content.trim()) {
      alert("수입내역을 입력하세요.");
      return;
    }

    // 후원금 한도 체크
    const limitResult = await checkLimit({
      orgId,
      custId: form.cust_id,
      itemSecCd: form.item_sec_cd,
      amount: form.acc_amt,
      accDate: form.acc_date,
    });

    if (limitResult.isOverLimit) {
      const proceed = confirm(
        `후원금 한도 경고:\n\n${limitResult.warnings.join("\n\n")}\n\n계속 저장하시겠습니까?`
      );
      if (!proceed) return;
    }

    const payload = {
      org_id: orgId,
      incm_sec_cd: 1,
      acc_sec_cd: form.acc_sec_cd,
      item_sec_cd: form.item_sec_cd,
      exp_sec_cd: 0,
      cust_id: form.cust_id || -999,
      acc_date: form.acc_date.replace(/-/g, ""),
      content: form.content,
      acc_amt: form.acc_amt,
      rcp_yn: form.rcp_yn,
      rcp_no: form.rcp_no || null,
      bigo: form.bigo || null,
    };

    if (selected) {
      // 수정 전 백업 (복구용)
      await fetch("/api/acc-book", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "backup", data: {
          work_kind: 1, acc_book_id: selected.acc_book_id, org_id: selected.org_id,
          incm_sec_cd: selected.incm_sec_cd, acc_sec_cd: selected.acc_sec_cd,
          item_sec_cd: selected.item_sec_cd, exp_sec_cd: selected.exp_sec_cd,
          cust_id: selected.cust_id, acc_date: selected.acc_date, content: selected.content,
          acc_amt: selected.acc_amt, rcp_yn: selected.rcp_yn, rcp_no: selected.rcp_no,
        }}),
      });

      const res = await fetch("/api/acc-book", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", acc_book_id: selected.acc_book_id, data: payload }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`수정 실패: ${err.error}`);
        return;
      }
    } else {
      const res = await fetch("/api/acc-book", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "insert", data: payload }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`등록 실패: ${err.error}`);
        return;
      }
    }

    resetForm();
    loadRecords(activeFilters);
  }

  async function handleDelete() {
    if (!selected) return;
    if (!confirm("선택한 수입내역을 삭제하시겠습니까?")) return;

    await fetch("/api/acc-book", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "backup", data: {
        work_kind: 2, acc_book_id: selected.acc_book_id, org_id: selected.org_id,
        incm_sec_cd: selected.incm_sec_cd, acc_sec_cd: selected.acc_sec_cd,
        item_sec_cd: selected.item_sec_cd, exp_sec_cd: selected.exp_sec_cd,
        cust_id: selected.cust_id, acc_date: selected.acc_date, content: selected.content,
        acc_amt: selected.acc_amt, rcp_yn: selected.rcp_yn, rcp_no: selected.rcp_no,
      }}),
    });

    const res = await fetch("/api/acc-book", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", ids: [selected.acc_book_id] }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(`삭제 실패: ${err.error}`);
      return;
    }

    resetForm();
    loadRecords(activeFilters);
  }

  async function handleBatchDelete() {
    if (checkedIds.size === 0) return;
    if (!confirm(`선택한 ${checkedIds.size}건의 수입내역을 삭제하시겠습니까?`)) return;

    const toDelete = records.filter((r) => checkedIds.has(r.acc_book_id));
    for (const r of toDelete) {
      await fetch("/api/acc-book", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "backup", data: {
          work_kind: 2, acc_book_id: r.acc_book_id, org_id: r.org_id,
          incm_sec_cd: r.incm_sec_cd, acc_sec_cd: r.acc_sec_cd,
          item_sec_cd: r.item_sec_cd, exp_sec_cd: r.exp_sec_cd,
          cust_id: r.cust_id, acc_date: r.acc_date, content: r.content,
          acc_amt: r.acc_amt, rcp_yn: r.rcp_yn, rcp_no: r.rcp_no,
        }}),
      });
    }

    const res = await fetch("/api/acc-book", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", ids: [...checkedIds] }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(`삭제 실패: ${err.error}`);
      return;
    }

    setCheckedIds(new Set());
    resetForm();
    loadRecords(activeFilters);
  }

  function toggleCheck(id: number) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleCheckAll() {
    if (checkedIds.size === records.length) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(records.map((r) => r.acc_book_id)));
    }
  }

  // 당비/기명후원금/익명후원금 과목 선택 시 내역 자동 입력
  // 과목코드: 8=당비, 15=기명후원금, 16=익명후원금 (정당), 95=기명후원금, 96=익명후원금 (후원회)
  const AUTO_CONTENT_MAP: Record<number, string> = {
    8: "당비",
    15: "기명후원금",
    16: "익명후원금",
    95: "기명후원금",
    96: "익명후원금",
  };

  function handleItemChange(v: number) {
    const autoContent = AUTO_CONTENT_MAP[v];
    if (autoContent && !form.content) {
      setForm({ ...form, item_sec_cd: v, content: autoContent });
    } else {
      setForm({ ...form, item_sec_cd: v });
    }
  }

  function formatAmount(n: number) {
    return n.toLocaleString("ko-KR");
  }

  function formatDate(d: string) {
    if (d.length === 8)
      return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    return d;
  }

  const { sorted, sort, toggle } = useSort(records);

  if (codesLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        코드 데이터 로딩 중...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageGuide {...PAGE_GUIDES.income} />
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">수입내역 관리</h2>
        <HelpTooltip id="income.summary">
          <div className="flex gap-4 text-sm">
            <span>
              수입액:{" "}
              <b className="text-blue-600">{formatAmount(summary.income)}원</b>
            </span>
            <span>
              지출액:{" "}
              <b className="text-red-600">{formatAmount(summary.expense)}원</b>
            </span>
            <span>
              잔액:{" "}
              <b className="text-green-600">
                {formatAmount(summary.balance)}원
              </b>
            </span>
          </div>
        </HelpTooltip>
      </div>

      {/* 입력 폼 */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex gap-2 mb-4">
          <HelpTooltip id="btn.reset">
            <Button variant="outline" size="sm" onClick={resetForm}>
              화면초기화
            </Button>
          </HelpTooltip>
          <HelpTooltip id="btn.new">
            <Button variant="outline" size="sm" onClick={resetForm}>
              신규입력
            </Button>
          </HelpTooltip>
          <HelpTooltip id="btn.save">
            <Button size="sm" onClick={handleSave}>
              저장
            </Button>
          </HelpTooltip>
          <HelpTooltip id="btn.delete">
            <Button
              variant="destructive"
              size="sm"
              onClick={checkedIds.size > 0 ? handleBatchDelete : handleDelete}
              disabled={!selected && checkedIds.size === 0}
            >
              삭제{checkedIds.size > 0 ? ` (${checkedIds.size}건)` : ""}
            </Button>
          </HelpTooltip>
          <HelpTooltip id="btn.undo">
            <Button
              variant="outline"
              size="sm"
              onClick={performUndo}
              disabled={undoing || !canUndo}
            >
              {undoing ? "복구 중..." : "복구 (Ctrl+Z)"}
            </Button>
          </HelpTooltip>
          <div className="flex-1" />
          <HelpTooltip id="income.receipt-batch">
            <Button variant="outline" size="sm" onClick={handleBatchReceiptNumbers}>
              영수증일괄입력
            </Button>
          </HelpTooltip>
          <HelpTooltip id="income.book-print">
            <Button variant="outline" size="sm" onClick={handleExcelExport}>
              수입부 엑셀
            </Button>
          </HelpTooltip>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <HelpTooltip id="income.account">
            <CodeSelect
              label="계정"
              value={form.acc_sec_cd}
              onChange={(v) =>
                setForm({ ...form, acc_sec_cd: v, item_sec_cd: 0 })
              }
              options={accountOptions}
              placeholder={
                orgType === "supporter" ? "수입" : "계정 선택"
              }
            />
          </HelpTooltip>

          <HelpTooltip id="income.subject">
            <CodeSelect
              label="과목"
              value={form.item_sec_cd}
              onChange={handleItemChange}
              options={itemOptions}
              placeholder="과목 선택"
              disabled={!form.acc_sec_cd}
            />
          </HelpTooltip>

          <div>
            <HelpTooltip id="income.date">
              <Label>수입일자</Label>
            </HelpTooltip>
            <Input
              type="date"
              value={form.acc_date}
              onChange={(e) => setForm({ ...form, acc_date: e.target.value })}
            />
          </div>

          <div>
            <HelpTooltip id="income.amount">
              <Label>수입금액</Label>
            </HelpTooltip>
            <Input
              type="number"
              value={form.acc_amt || ""}
              onChange={(e) =>
                setForm({ ...form, acc_amt: Number(e.target.value) })
              }
              placeholder="금액"
            />
          </div>

          <div>
            <HelpTooltip id="income.provider">
              <Label>수입제공자</Label>
            </HelpTooltip>
            <div className="flex gap-1 mt-1">
              <Input
                value={selectedCustomerName}
                readOnly
                placeholder="검색 또는 등록"
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setCustomerDialogMode("search"); setCustomerDialogOpen(true); }}
                className="shrink-0"
              >
                검색
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setCustomerDialogMode("register"); setCustomerDialogOpen(true); }}
                className="shrink-0"
              >
                등록
              </Button>
            </div>
          </div>

          <div className="md:col-span-2">
            <HelpTooltip id="income.content">
              <Label>수입내역</Label>
            </HelpTooltip>
            <Input
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="수입내역"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <HelpTooltip id="income.receipt-yn">
                <Label>증빙서첨부</Label>
              </HelpTooltip>
              <select
                className="w-full mt-1 border rounded px-3 py-2 text-sm"
                value={form.rcp_yn}
                onChange={(e) => {
                  const val = e.target.value;
                  setForm({
                    ...form,
                    rcp_yn: val,
                    // 전환 시 반대쪽 필드 초기화
                    ...(val === "Y" ? { bigo: "" } : { rcp_no: "" }),
                  });
                }}
              >
                <option value="Y">첨부</option>
                <option value="N">미첨부</option>
              </select>
            </div>
            {form.rcp_yn === "Y" ? (
              <div>
                <HelpTooltip id="income.receipt-no">
                  <Label>증빙서번호</Label>
                </HelpTooltip>
                <Input
                  value={form.rcp_no}
                  onChange={(e) => setForm({ ...form, rcp_no: e.target.value })}
                  placeholder="증빙서번호"
                />
              </div>
            ) : (
              <div>
                <Label>미첨부사유</Label>
                <Input
                  value={form.bigo}
                  onChange={(e) => setForm({ ...form, bigo: e.target.value })}
                  placeholder="미첨부사유 입력"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 검색 패널 */}
      <AccBookSearch
        accountOptions={searchAccountOptions}
        itemOptions={searchItemOptions}
        onSearch={(f) => {
          setActiveFilters(f);
          setCheckedIds(new Set());
          loadRecords(f);
        }}
        onReset={() => {
          setActiveFilters(null);
          setCheckedIds(new Set());
          loadRecords(null);
        }}
        onItemOptionsChange={setSearchAccSecCd}
      />

      {/* 목록 그리드 */}
      <div className="bg-white rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-2 py-2 text-center w-8">
                <input
                  type="checkbox"
                  checked={records.length > 0 && checkedIds.size === records.length}
                  onChange={toggleCheckAll}
                />
              </th>
              <th className="px-3 py-2 text-left">번호</th>
              <SortTh label="수입일자" sortKey="acc_date" current={sort} onToggle={toggle} className="text-left" />
              <SortTh label="계정" sortKey="acc_sec_cd" current={sort} onToggle={toggle} className="text-left" />
              <SortTh label="과목" sortKey="item_sec_cd" current={sort} onToggle={toggle} className="text-left" />
              <SortTh label="수입제공자" sortKey="cust_id" current={sort} onToggle={toggle} className="text-left" />
              <SortTh label="내역" sortKey="content" current={sort} onToggle={toggle} className="text-left" />
              <SortTh label="금액" sortKey="acc_amt" current={sort} onToggle={toggle} className="text-right" />
              <SortTh label="증빙" sortKey="rcp_yn" current={sort} onToggle={toggle} className="text-center" />
              <SortTh label="증빙서번호/미첨부사유" sortKey="rcp_no" current={sort} onToggle={toggle} className="text-left" />
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
                <td colSpan={10} className="p-0">
                  <EmptyState
                    icon="📥"
                    title="아직 수입 내역이 없습니다"
                    description="수입 자료를 등록하면 여기에 목록이 표시됩니다. 먼저 수입지출처를 등록해두면 입력이 빠릅니다."
                    actions={[
                      { label: "간편등록 마법사로 시작", href: "/dashboard/wizard" },
                      { label: "직접 등록하기", href: "/dashboard/income", variant: "outline" },
                    ]}
                  />
                </td>
              </tr>
            ) : (
              sorted.map((r, i) => (
                <tr
                  key={r.acc_book_id}
                  className={`border-b cursor-pointer hover:bg-gray-50 ${
                    selected?.acc_book_id === r.acc_book_id ? "bg-blue-50" : ""
                  }`}
                  onClick={() => selectRecord(r)}
                >
                  <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={checkedIds.has(r.acc_book_id)}
                      onChange={() => toggleCheck(r.acc_book_id)}
                    />
                  </td>
                  <td className="px-3 py-2">{i + 1}</td>
                  <td className="px-3 py-2">{formatDate(r.acc_date)}</td>
                  <td className="px-3 py-2">{getName(r.acc_sec_cd)}</td>
                  <td className="px-3 py-2">{getName(r.item_sec_cd)}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {r.customer &&
                    typeof r.customer === "object" &&
                    "name" in r.customer
                      ? (r.customer as { name: string | null }).name
                      : "-"}
                  </td>
                  <td className="px-3 py-2">{r.content}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {formatAmount(r.acc_amt)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {r.rcp_yn === "Y" ? (
                      <span className="text-green-600">O</span>
                    ) : (
                      <span className="text-red-500">X</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {r.rcp_yn === "Y" ? (
                      r.rcp_no || ""
                    ) : (
                      <span className="text-orange-600">{r.bigo || ""}</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {records.length > 0 && (
            <tfoot>
              {checkedIds.size > 0 && (
                <tr className="bg-yellow-50 border-t border-yellow-300">
                  <td colSpan={7} className="px-3 py-2 text-right font-semibold text-sm text-yellow-800">
                    선택 합계 ({checkedIds.size}건)
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-yellow-700">
                    {formatAmount(records.filter((r) => checkedIds.has(r.acc_book_id)).reduce((s, r) => s + r.acc_amt, 0))}원
                  </td>
                  <td colSpan={2} />
                </tr>
              )}
              <tr className="bg-blue-50 border-t-2 border-blue-200">
                <td colSpan={7} className="px-3 py-2 text-right font-semibold text-sm">
                  전체 합계 ({filteredSummary.count}건)
                </td>
                <td className="px-3 py-2 text-right font-mono font-bold text-blue-700">
                  {formatAmount(filteredSummary.income)}원
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* 수입제공자 검색 팝업 */}
      <CustomerSearchDialog
        open={customerDialogOpen}
        onClose={() => setCustomerDialogOpen(false)}
        initialMode={customerDialogMode}
        onSelect={(c) => {
          setForm({ ...form, cust_id: c.cust_id });
          setSelectedCustomerName(c.name || "");
        }}
      />
    </div>
  );
}
