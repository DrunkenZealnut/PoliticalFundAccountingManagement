"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/stores/auth";
import { useCodeValues } from "@/hooks/use-code-values";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CodeSelect } from "@/components/code-select";
import { CustomerSearchDialog } from "@/components/customer-search-dialog";
import { getExpTypeData, PAY_METHODS } from "@/lib/expense-types";
import { PageGuide } from "@/components/page-guide";
import { PAGE_GUIDES } from "@/lib/page-guides";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ScanResult {
  date: string;
  amount: number;
  content: string;
  provider: string;
  regNum: string;
  addr: string;
  payMethod: string;
  items: { name: string; quantity: number; unitPrice: number; amount: number }[];
}

interface ParsedEntry {
  id: number;
  fileName: string;
  fileBase64: string;    // 원본 파일 base64 (저장용)
  fileType: string;      // MIME type
  preview: string;       // object URL (미리보기용)
  scanning: boolean;
  error: string | null;
  // 회계 필드
  acc_sec_cd: number;
  item_sec_cd: number;
  acc_date: string;
  content: string;
  acc_amt: number;
  cust_id: number;
  customerName: string;
  rcp_yn: string;
  rcp_no: string;
  bigo: string;
  providerRegNum: string;
  // 지출 전용
  exp_group1_cd: string;
  exp_group2_cd: string;
  exp_group3_cd: string;
  acc_ins_type: string;
}

const DEFAULT_CUST_SEC_CD = 63;
const DEFAULT_REG_NUM = "9999";
const NO_CUSTOMER_ID = -999;

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function DocumentRegisterPage() {
  const searchParams = useSearchParams();
  const { orgId, orgSecCd, orgType } = useAuth();
  const { loading: codesLoading, getName, getAccounts, getItems } = useCodeValues();

  const [tab, setTab] = useState(searchParams.get("tab") || "expense");
  const [entries, setEntries] = useState<ParsedEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [activeEntryId, setActiveEntryId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const rcpNoOffset = useRef(0);
  const entriesRef = useRef<ParsedEntry[]>([]);

  const isExpense = tab === "expense";
  const incmSecCd = isExpense ? 2 : 1;
  const typeLabel = isExpense ? "지출" : "수입";
  const accountOptions = orgSecCd ? getAccounts(orgSecCd, incmSecCd) : [];

  // entries ref 동기화 (unmount cleanup용)
  useEffect(() => { entriesRef.current = entries; }, [entries]);
  useEffect(() => {
    return () => { entriesRef.current.forEach((e) => { if (e.preview) URL.revokeObjectURL(e.preview); }); };
  }, []);

  function clearEntries() {
    setEntries((prev) => {
      prev.forEach((e) => { if (e.preview) URL.revokeObjectURL(e.preview); });
      return [];
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  function fmt(n: number) { return n.toLocaleString("ko-KR"); }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function mapPayMethod(pm: string): string {
    if (!pm) return "118";
    if (pm.includes("신용카드")) return "584";
    if (pm.includes("체크카드")) return "585";
    if (pm.includes("카드")) return "119";
    if (pm.includes("현금")) return "120";
    if (pm.includes("수표")) return "583";
    return "118";
  }

  function autoSelectItem(accSecCd: number, category: string): number {
    if (!orgSecCd || !accSecCd) return 0;
    const items = getItems(orgSecCd, incmSecCd, accSecCd);
    if (items.length === 0) return 0;
    if (isExpense) {
      if (category.includes("선거비용외") || category.includes("비용외")) {
        const m = items.find((i) => i.cv_name.includes("선거비용외"));
        if (m) return m.cv_id;
      }
      if (category.includes("선거비용")) {
        const m = items.find((i) => i.cv_name.includes("선거비용") && !i.cv_name.includes("선거비용외"));
        if (m) return m.cv_id;
      }
    }
    return items[0].cv_id;
  }

  /* ---- AI scan ---- */
  async function scanFile(entry: ParsedEntry) {
    updateEntry(entry.id, { scanning: true, error: null });
    try {
      const res = await fetch("/api/receipt-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: entry.fileBase64, mimeType: entry.fileType }),
      });
      if (!res.ok) {
        const err = await res.json();
        updateEntry(entry.id, { scanning: false, error: err.error || "분석 실패" });
        return;
      }
      const data: ScanResult = await res.json();

      let dateStr = data.date || "";
      if (dateStr.length === 8 && !dateStr.includes("-")) {
        dateStr = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
      }

      const autoAcc = accountOptions.length > 0 ? accountOptions[0].cv_id : 0;
      const autoItem = autoSelectItem(autoAcc, "");

      // 증빙서번호 자동 채번 (ref 기반으로 병렬 스캔 시에도 중복 방지)
      let autoRcpNo = "";
      if (orgId) {
        try {
          const rcpRes = await fetch(`/api/acc-book?orgId=${orgId}&incmSecCd=${incmSecCd}&maxRcpNo=1`);
          if (rcpRes.ok) {
            const rcpData = await rcpRes.json();
            const maxNo = rcpData.maxRcpNo ?? 0;
            rcpNoOffset.current++;
            autoRcpNo = String(maxNo + rcpNoOffset.current);
          }
        } catch { /* empty */ }
      }

      updateEntry(entry.id, {
        scanning: false,
        acc_sec_cd: autoAcc,
        item_sec_cd: autoItem,
        acc_date: dateStr,
        acc_amt: data.amount || 0,
        content: data.content || "",
        customerName: data.provider || "",
        providerRegNum: data.regNum || "",
        acc_ins_type: mapPayMethod(data.payMethod || ""),
        rcp_yn: "Y",
        rcp_no: autoRcpNo,
      });
    } catch {
      updateEntry(entry.id, { scanning: false, error: "AI 분석 중 오류가 발생했습니다." });
    }
  }

  /* ---- File handling ---- */
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArr = Array.from(files).filter((f) =>
      f.type.startsWith("image/") || f.type === "application/pdf"
    );
    if (fileArr.length === 0) { alert("지원 형식: JPG, PNG, PDF"); return; }
    if (entries.length + fileArr.length > 10) { alert("최대 10건까지 업로드 가능합니다."); return; }

    rcpNoOffset.current = 0; // 새 배치 시작 시 오프셋 리셋
    const newEntries: ParsedEntry[] = [];
    for (const file of fileArr) {
      const base64 = await fileToBase64(file);
      newEntries.push({
        id: nextId.current++,
        fileName: file.name,
        fileBase64: base64,
        fileType: file.type,
        preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : "",
        scanning: false, error: null,
        acc_sec_cd: 0, item_sec_cd: 0, acc_date: "", content: "", acc_amt: 0,
        cust_id: 0, customerName: "", rcp_yn: "Y", rcp_no: "", bigo: "", providerRegNum: "",
        exp_group1_cd: "", exp_group2_cd: "", exp_group3_cd: "", acc_ins_type: "118",
      });
    }

    setEntries((prev) => [...prev, ...newEntries]);
    for (const entry of newEntries) scanFile(entry);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.length, orgId, accountOptions.length]);

  function updateEntry(id: number, patch: Partial<ParsedEntry>) {
    setEntries((prev) => prev.map((e) => {
      if (e.id !== id) return e;
      // 사용자가 필드를 수정하면 error 플래그 해제
      const clearError = patch.acc_sec_cd !== undefined || patch.item_sec_cd !== undefined
        || patch.acc_date !== undefined || patch.acc_amt !== undefined || patch.content !== undefined;
      return { ...e, ...patch, ...(clearError && e.error ? { error: null } : {}) };
    }));
  }

  function removeEntry(id: number) {
    setEntries((prev) => {
      const t = prev.find((e) => e.id === id);
      if (t?.preview) URL.revokeObjectURL(t.preview);
      return prev.filter((e) => e.id !== id);
    });
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
  }, []);

  /* ---- Save ---- */
  async function handleSave() {
    if (!orgId) return;
    const valid = entries.filter(
      (e) => !e.scanning && e.acc_sec_cd && e.item_sec_cd && e.acc_date && e.acc_amt > 0
    );
    if (valid.length === 0) { alert("저장 가능한 항목이 없습니다.\n계정, 과목, 일자, 금액을 확인하세요."); return; }
    if (!confirm(`${valid.length}건을 ${typeLabel} 내역으로 등록하시겠습니까?`)) return;

    setSaving(true);
    let success = 0, failed = 0;
    const custCache = new Map<string, number>(); // 거래처 중복 생성 방지
    const succeededIds: number[] = [];

    for (const e of valid) {
      // 1) 거래처 자동 등록 (캐시 우선)
      let custId = e.cust_id;
      if (!custId && e.customerName.trim()) {
        const custKey = `${e.customerName.trim()}_${e.providerRegNum || DEFAULT_REG_NUM}`;
        if (custCache.has(custKey)) {
          custId = custCache.get(custKey)!;
        } else {
          try {
            const r = await fetch("/api/customers", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "insert", data: {
                cust_sec_cd: DEFAULT_CUST_SEC_CD, name: e.customerName.trim(),
                reg_num: e.providerRegNum || DEFAULT_REG_NUM,
              }}),
            });
            if (r.ok) { const d = await r.json(); custId = d.cust_id; custCache.set(custKey, custId); }
          } catch { /* fallback */ }
        }
      }

      // 2) acc_book 저장
      const payload: Record<string, unknown> = {
        org_id: orgId, incm_sec_cd: incmSecCd,
        acc_sec_cd: e.acc_sec_cd, item_sec_cd: e.item_sec_cd, exp_sec_cd: 0,
        cust_id: custId || NO_CUSTOMER_ID,
        acc_date: e.acc_date.replace(/-/g, ""),
        content: e.content, acc_amt: e.acc_amt,
        rcp_yn: e.rcp_yn,
        rcp_no: e.rcp_yn === "Y" ? (e.rcp_no || null) : null,
        bigo: e.rcp_yn === "N" ? (e.bigo || null) : null,
      };
      if (isExpense) {
        payload.acc_ins_type = e.acc_ins_type || null;
        payload.exp_group1_cd = e.exp_group1_cd || null;
        payload.exp_group2_cd = e.exp_group2_cd || null;
        payload.exp_group3_cd = e.exp_group3_cd || null;
      }

      try {
        const res = await fetch("/api/acc-book", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "insert", data: payload }),
        });
        if (!res.ok) { failed++; continue; }
        const accBook = await res.json();
        success++;
        succeededIds.push(e.id);

        // 3) 증빙파일 저장 (acc_book_id 연결)
        if (e.fileBase64) {
          await fetch("/api/evidence-file", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              accBookId: accBook.acc_book_id,
              orgId, fileName: e.fileName,
              fileType: e.fileType, fileData: e.fileBase64,
            }),
          });
        }
      } catch { failed++; }
    }

    setSaving(false);
    alert(`등록 완료: 성공 ${success}건${failed > 0 ? `, 실패 ${failed}건` : ""}`);
    if (succeededIds.length > 0) {
      setEntries((prev) => prev.filter((e) => !succeededIds.includes(e.id)));
    }
  }

  /* ---- Entry form ---- */
  function renderEntryForm(entry: ParsedEntry) {
    const itemName = entry.item_sec_cd ? getName(entry.item_sec_cd) : "";
    const expTypes = isExpense && orgType !== "supporter" ? getExpTypeData(itemName) : [];
    const level2Items = expTypes.find((t) => t.label === entry.exp_group1_cd)?.level2 || [];
    const level3Items = level2Items.find((t) => t.label === entry.exp_group2_cd)?.level3 || [];
    const showExpType = isExpense && expTypes.length > 0;

    return (
      <div className="space-y-3">
        {/* Row 1: 계정 + 과목 + 지출유형 */}
        <div className={`grid gap-3 ${showExpType ? "grid-cols-2 md:grid-cols-5" : "grid-cols-2 md:grid-cols-4"}`}>
          <CodeSelect label="계정" value={entry.acc_sec_cd}
            onChange={(v) => updateEntry(entry.id, { acc_sec_cd: v, item_sec_cd: 0, exp_group1_cd: "", exp_group2_cd: "", exp_group3_cd: "" })}
            options={accountOptions} placeholder="계정 선택" />
          <CodeSelect label="과목" value={entry.item_sec_cd}
            onChange={(v) => updateEntry(entry.id, { item_sec_cd: v, exp_group1_cd: "", exp_group2_cd: "", exp_group3_cd: "" })}
            options={orgSecCd && entry.acc_sec_cd ? getItems(orgSecCd, incmSecCd, entry.acc_sec_cd) : []}
            placeholder="과목 선택" disabled={!entry.acc_sec_cd} />
          {showExpType && (<>
            <div>
              <Label>지출유형1</Label>
              <select className="w-full mt-1 border rounded px-2 py-2 text-sm" value={entry.exp_group1_cd}
                onChange={(e) => updateEntry(entry.id, { exp_group1_cd: e.target.value, exp_group2_cd: "", exp_group3_cd: "" })}>
                <option value="">선택</option>
                {expTypes.map((t) => <option key={t.label} value={t.label}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <Label>지출유형2</Label>
              <select className="w-full mt-1 border rounded px-2 py-2 text-sm" value={entry.exp_group2_cd}
                onChange={(e) => updateEntry(entry.id, { exp_group2_cd: e.target.value, exp_group3_cd: "" })}
                disabled={!entry.exp_group1_cd}>
                <option value="">선택</option>
                {level2Items.map((t) => <option key={t.label} value={t.label}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <Label>지출유형3</Label>
              <select className="w-full mt-1 border rounded px-2 py-2 text-sm" value={entry.exp_group3_cd}
                onChange={(e) => updateEntry(entry.id, { exp_group3_cd: e.target.value })}
                disabled={!entry.exp_group2_cd || level3Items.length === 0}>
                <option value="">{level3Items.length === 0 ? "-" : "선택"}</option>
                {level3Items.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </>)}
        </div>

        {/* Row 2: 일자 + 금액 + 거래처 + 지출방법 */}
        <div className={`grid gap-3 ${isExpense ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2 md:grid-cols-3"}`}>
          <div>
            <Label>{typeLabel}일자</Label>
            <Input type="date" value={entry.acc_date}
              onChange={(e) => updateEntry(entry.id, { acc_date: e.target.value })} />
          </div>
          <div>
            <Label>금액</Label>
            <Input type="number" value={entry.acc_amt || ""}
              onChange={(e) => updateEntry(entry.id, { acc_amt: Number(e.target.value) })} placeholder="금액" />
          </div>
          <div>
            <Label>{isExpense ? "지출대상자" : "수입제공자"}</Label>
            <div className="flex gap-1">
              <Input value={entry.customerName}
                onChange={(e) => updateEntry(entry.id, { customerName: e.target.value, cust_id: 0 })}
                placeholder="거래처명" className="flex-1" />
              <Button variant="outline" size="sm" className="shrink-0"
                onClick={() => { setActiveEntryId(entry.id); setCustomerDialogOpen(true); }}>검색</Button>
            </div>
          </div>
          {isExpense && (
            <div>
              <Label>지출방법</Label>
              <select className="w-full mt-1 border rounded px-2 py-2 text-sm" value={entry.acc_ins_type}
                onChange={(e) => updateEntry(entry.id, { acc_ins_type: e.target.value })}>
                {PAY_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Row 3: 내역 + 증빙 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>내역</Label>
            <Input value={entry.content} onChange={(e) => updateEntry(entry.id, { content: e.target.value })}
              placeholder={`${typeLabel} 내역`} />
          </div>
          <div className="flex gap-2">
            <div className="w-20">
              <Label>증빙</Label>
              <select className="w-full border rounded px-2 py-2 text-sm" value={entry.rcp_yn}
                onChange={(e) => updateEntry(entry.id, { rcp_yn: e.target.value })}>
                <option value="Y">첨부</option>
                <option value="N">미첨부</option>
              </select>
            </div>
            <div className="flex-1">
              <Label>{entry.rcp_yn === "Y" ? "증빙서번호" : "미첨부사유"}</Label>
              <Input
                value={entry.rcp_yn === "Y" ? entry.rcp_no : entry.bigo}
                onChange={(e) => updateEntry(entry.id,
                  entry.rcp_yn === "Y" ? { rcp_no: e.target.value } : { bigo: e.target.value }
                )}
                placeholder={entry.rcp_yn === "Y" ? "증빙서번호" : "사유 입력"} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (codesLoading) return <div className="flex items-center justify-center h-64 text-gray-400">코드 데이터 로딩 중...</div>;

  const validCount = entries.filter((e) => !e.scanning && !e.error && e.acc_sec_cd && e.item_sec_cd && e.acc_date && e.acc_amt > 0).length;

  return (
    <div className="space-y-4">
      <PageGuide {...PAGE_GUIDES["document-register"]} />
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">영수증/계약서 자동등록</h2>
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave} disabled={saving || entries.length === 0}>
            {saving ? "저장 중..." : `저장 (${validCount}건)`}
          </Button>
          <Button variant="outline" size="sm"
            onClick={clearEntries}>
            초기화
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => { clearEntries(); setTab(v); }}>
        <TabsList>
          <TabsTrigger value="expense">지 출</TabsTrigger>
          <TabsTrigger value="income">수 입</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="space-y-4">
          {/* Upload */}
          <div className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
            onDrop={handleDrop} onDragOver={handleDragOver} onClick={() => fileRef.current?.click()}>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden"
              onChange={(e) => e.target.files && handleFiles(e.target.files)} />
            <p className="text-gray-500 text-lg mb-1">영수증 또는 계약서 이미지를 드래그하거나 클릭하여 업로드</p>
            <p className="text-gray-400 text-sm">JPG, PNG, PDF 지원 | 최대 10건 | AI가 일자·금액·거래처·내역을 자동 추출합니다</p>
          </div>

          {/* Entries */}
          {entries.length > 0 && (
            <div className="space-y-3">
              {entries.map((entry) => (
                <div key={entry.id} className={`bg-white rounded-lg border p-4 ${entry.error ? "border-red-300 bg-red-50" : ""}`}>
                  <div className="flex gap-4">
                    <div className="shrink-0 w-24 h-24 bg-gray-100 rounded flex items-center justify-center overflow-hidden">
                      {entry.preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={entry.preview} alt={entry.fileName} className="max-w-full max-h-full object-contain" />
                      ) : (
                        <span className="text-gray-400 text-xs">PDF</span>
                      )}
                    </div>
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-600">{entry.fileName}</span>
                        <div className="flex items-center gap-2">
                          {entry.scanning && <span className="text-sm text-blue-600 animate-pulse">AI 분석 중...</span>}
                          {entry.error && <span className="text-sm text-red-600">{entry.error}</span>}
                          <Button variant="outline" size="sm" onClick={() => removeEntry(entry.id)}>삭제</Button>
                        </div>
                      </div>
                      {!entry.scanning && renderEntryForm(entry)}
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex justify-between items-center bg-gray-50 rounded-lg p-3 text-sm">
                <span>총 <b>{entries.length}</b>건 | 분석완료 <b className="text-blue-600">{entries.filter((e) => !e.scanning && !e.error).length}</b>건 | 오류 <b className="text-red-600">{entries.filter((e) => e.error).length}</b>건</span>
                <span>합계: <b className="text-blue-700">{fmt(entries.reduce((s, e) => s + e.acc_amt, 0))}원</b></span>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <CustomerSearchDialog open={customerDialogOpen} onClose={() => setCustomerDialogOpen(false)}
        initialMode="search"
        onSelect={(c) => {
          if (activeEntryId !== null) updateEntry(activeEntryId, { cust_id: c.cust_id, customerName: c.name || "" });
          setCustomerDialogOpen(false);
        }} />
    </div>
  );
}
