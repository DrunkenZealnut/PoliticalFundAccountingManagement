"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@/stores/auth";
import { useCodeValues } from "@/hooks/use-code-values";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CodeSelect } from "@/components/code-select";
import { CustomerSearchDialog } from "@/components/customer-search-dialog";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ScanResult {
  date: string;
  amount: number;
  content: string;
  provider: string;
  regNum: string;
  items: { name: string; quantity: number; unitPrice: number; amount: number }[];
}

interface ParsedEntry {
  id: number;
  fileName: string;
  preview: string; // data URL for thumbnail
  scanning: boolean;
  error: string | null;
  // Editable fields
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
}

const DEFAULT_CUST_SEC_CD = 63;   // 개인 거래처 유형
const DEFAULT_REG_NUM = "9999";   // 사업자번호 미확인 시 기본값
const NO_CUSTOMER_ID = -999;      // 거래처 미지정 sentinel

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function DocumentRegisterPage() {
  const { orgId, orgSecCd } = useAuth();
  const { loading: codesLoading, getAccounts, getItems } = useCodeValues();

  const [tab, setTab] = useState("expense");
  const [entries, setEntries] = useState<ParsedEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [activeEntryId, setActiveEntryId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);

  const isExpense = tab === "expense";
  const incmSecCd = isExpense ? 2 : 1;
  const typeLabel = isExpense ? "지출" : "수입";

  const accountOptions = orgSecCd ? getAccounts(orgSecCd, incmSecCd) : [];

  // Cleanup object URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      entries.forEach((e) => { if (e.preview) URL.revokeObjectURL(e.preview); });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup on unmount only
  }, []);

  function fmt(n: number) { return n.toLocaleString("ko-KR"); }

  /* ---- File to base64 ---- */
  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix (e.g., "data:image/jpeg;base64,")
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /* ---- Scan a single file ---- */
  async function scanFile(entry: ParsedEntry, file: File) {
    updateEntry(entry.id, { scanning: true, error: null });

    try {
      const base64 = await fileToBase64(file);
      const res = await fetch("/api/receipt-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mimeType: file.type }),
      });

      if (!res.ok) {
        const err = await res.json();
        updateEntry(entry.id, { scanning: false, error: err.error || "분석 실패" });
        return;
      }

      const data: ScanResult = await res.json();

      // Convert date format: YYYYMMDD → YYYY-MM-DD
      let dateStr = data.date || "";
      if (dateStr.length === 8 && !dateStr.includes("-")) {
        dateStr = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
      }

      updateEntry(entry.id, {
        scanning: false,
        acc_date: dateStr,
        acc_amt: data.amount || 0,
        content: data.content || "",
        customerName: data.provider || "",
        providerRegNum: data.regNum || "",
      });
    } catch {
      updateEntry(entry.id, { scanning: false, error: "AI 분석 중 오류가 발생했습니다." });
    }
  }

  /* ---- Handle file selection ---- */
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArr = Array.from(files).filter((f) =>
      f.type.startsWith("image/") || f.type === "application/pdf"
    );

    if (fileArr.length === 0) {
      alert("지원하는 파일 형식: JPG, PNG, PDF");
      return;
    }
    if (entries.length + fileArr.length > 10) {
      alert("최대 10건까지 업로드 가능합니다.");
      return;
    }

    const newEntries: ParsedEntry[] = [];
    for (const file of fileArr) {
      const id = nextId.current++;
      // Create preview thumbnail
      const preview = file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : "";

      const entry: ParsedEntry = {
        id,
        fileName: file.name,
        preview,
        scanning: false,
        error: null,
        acc_sec_cd: 0,
        item_sec_cd: 0,
        acc_date: "",
        content: "",
        acc_amt: 0,
        cust_id: 0,
        customerName: "",
        rcp_yn: "Y",
        rcp_no: "",
        bigo: "",
        providerRegNum: "",
      };
      newEntries.push(entry);
    }

    setEntries((prev) => [...prev, ...newEntries]);

    // Start scanning each file
    for (let i = 0; i < fileArr.length; i++) {
      scanFile(newEntries[i], fileArr[i]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.length]);

  /* ---- Update entry helper ---- */
  function updateEntry(id: number, patch: Partial<ParsedEntry>) {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...patch } : e))
    );
  }

  /* ---- Remove entry ---- */
  function removeEntry(id: number) {
    setEntries((prev) => {
      const target = prev.find((e) => e.id === id);
      if (target?.preview) URL.revokeObjectURL(target.preview);
      return prev.filter((e) => e.id !== id);
    });
  }

  /* ---- Drag & Drop ---- */
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  /* ---- Save all entries ---- */
  async function handleSave() {
    if (!orgId) return;

    const validEntries = entries.filter(
      (e) => !e.scanning && !e.error && e.acc_sec_cd && e.item_sec_cd && e.acc_date && e.acc_amt > 0
    );

    if (validEntries.length === 0) {
      alert("저장할 수 있는 항목이 없습니다.\n계정, 과목, 일자, 금액을 확인하세요.");
      return;
    }

    if (!confirm(`${validEntries.length}건을 ${typeLabel} 내역으로 등록하시겠습니까?`)) return;

    setSaving(true);
    let success = 0;
    let failed = 0;

    for (const e of validEntries) {
      // Auto-register customer if name provided but no cust_id
      let custId = e.cust_id;
      if (!custId && e.customerName.trim()) {
        try {
          const custRes = await fetch("/api/customers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "insert",
              data: {
                cust_sec_cd: DEFAULT_CUST_SEC_CD,
                name: e.customerName.trim(),
                reg_num: e.providerRegNum || DEFAULT_REG_NUM,
              },
            }),
          });
          if (custRes.ok) {
            const custData = await custRes.json();
            custId = custData.cust_id;
          }
        } catch { /* use default */ }
      }

      const payload = {
        org_id: orgId,
        incm_sec_cd: incmSecCd,
        acc_sec_cd: e.acc_sec_cd,
        item_sec_cd: e.item_sec_cd,
        exp_sec_cd: 0,
        cust_id: custId || NO_CUSTOMER_ID,
        acc_date: e.acc_date.replace(/-/g, ""),
        content: e.content,
        acc_amt: e.acc_amt,
        rcp_yn: e.rcp_yn,
        rcp_no: e.rcp_yn === "Y" ? (e.rcp_no || null) : null,
        bigo: e.rcp_yn === "N" ? (e.bigo || null) : null,
      };

      try {
        const res = await fetch("/api/acc-book", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "insert", data: payload }),
        });
        if (res.ok) success++;
        else failed++;
      } catch {
        failed++;
      }
    }

    setSaving(false);
    alert(`등록 완료: 성공 ${success}건${failed > 0 ? `, 실패 ${failed}건` : ""}`);
    if (success > 0) {
      setEntries((prev) =>
        prev.filter((e) => !validEntries.some((v) => v.id === e.id))
      );
    }
  }

  /* ---- Render ---- */
  if (codesLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        코드 데이터 로딩 중...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">영수증/계약서 자동등록</h2>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || entries.length === 0}
          >
            {saving ? "저장 중..." : `저장 (${entries.filter((e) => !e.scanning && !e.error && e.acc_sec_cd && e.item_sec_cd && e.acc_date && e.acc_amt > 0).length}건)`}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setEntries([]); if (fileRef.current) fileRef.current.value = ""; }}
          >
            초기화
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => { setTab(v); setEntries([]); }}>
        <TabsList>
          <TabsTrigger value="expense">지 출</TabsTrigger>
          <TabsTrigger value="income">수 입</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="space-y-4">
          {/* Upload area */}
          <div
            className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
            <p className="text-gray-500 text-lg mb-1">
              영수증 또는 계약서 이미지를 드래그하거나 클릭하여 업로드
            </p>
            <p className="text-gray-400 text-sm">
              JPG, PNG, PDF 지원 | 최대 10건 | AI가 자동으로 내용을 분석합니다
            </p>
          </div>

          {/* Entries */}
          {entries.length > 0 && (
            <div className="space-y-3">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className={`bg-white rounded-lg border p-4 ${
                    entry.error ? "border-red-300 bg-red-50" : ""
                  }`}
                >
                  <div className="flex gap-4">
                    {/* Thumbnail */}
                    <div className="shrink-0 w-24 h-24 bg-gray-100 rounded flex items-center justify-center overflow-hidden">
                      {entry.preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={entry.preview}
                          alt={entry.fileName}
                          className="max-w-full max-h-full object-contain"
                        />
                      ) : (
                        <span className="text-gray-400 text-xs">PDF</span>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-600">
                          {entry.fileName}
                        </span>
                        <div className="flex items-center gap-2">
                          {entry.scanning && (
                            <span className="text-sm text-blue-600 animate-pulse">
                              AI 분석 중...
                            </span>
                          )}
                          {entry.error && (
                            <span className="text-sm text-red-600">
                              {entry.error}
                            </span>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removeEntry(entry.id)}
                          >
                            삭제
                          </Button>
                        </div>
                      </div>

                      {!entry.scanning && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {/* 계정 */}
                          <CodeSelect
                            label="계정"
                            value={entry.acc_sec_cd}
                            onChange={(v) =>
                              updateEntry(entry.id, { acc_sec_cd: v, item_sec_cd: 0 })
                            }
                            options={accountOptions}
                            placeholder="계정 선택"
                          />

                          {/* 과목 */}
                          <CodeSelect
                            label="과목"
                            value={entry.item_sec_cd}
                            onChange={(v) =>
                              updateEntry(entry.id, { item_sec_cd: v })
                            }
                            options={
                              orgSecCd && entry.acc_sec_cd
                                ? getItems(orgSecCd, incmSecCd, entry.acc_sec_cd)
                                : []
                            }
                            placeholder="과목 선택"
                            disabled={!entry.acc_sec_cd}
                          />

                          {/* 일자 */}
                          <div>
                            <Label>{typeLabel}일자</Label>
                            <Input
                              type="date"
                              value={entry.acc_date}
                              onChange={(e) =>
                                updateEntry(entry.id, { acc_date: e.target.value })
                              }
                            />
                          </div>

                          {/* 금액 */}
                          <div>
                            <Label>금액</Label>
                            <Input
                              type="number"
                              value={entry.acc_amt || ""}
                              onChange={(e) =>
                                updateEntry(entry.id, {
                                  acc_amt: Number(e.target.value),
                                })
                              }
                              placeholder="금액"
                            />
                          </div>

                          {/* 거래처 */}
                          <div>
                            <Label>{typeLabel}대상자</Label>
                            <div className="flex gap-1">
                              <Input
                                value={entry.customerName}
                                onChange={(e) =>
                                  updateEntry(entry.id, {
                                    customerName: e.target.value,
                                  })
                                }
                                placeholder="거래처명"
                                className="flex-1"
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setActiveEntryId(entry.id);
                                  setCustomerDialogOpen(true);
                                }}
                                className="shrink-0"
                              >
                                검색
                              </Button>
                            </div>
                          </div>

                          {/* 내역 */}
                          <div className="md:col-span-2">
                            <Label>내역</Label>
                            <Input
                              value={entry.content}
                              onChange={(e) =>
                                updateEntry(entry.id, { content: e.target.value })
                              }
                              placeholder={`${typeLabel} 내역`}
                            />
                          </div>

                          {/* 증빙 */}
                          <div className="flex gap-2">
                            <div className="w-20">
                              <Label>증빙</Label>
                              <select
                                className="w-full border rounded px-2 py-2 text-sm"
                                value={entry.rcp_yn}
                                onChange={(e) =>
                                  updateEntry(entry.id, { rcp_yn: e.target.value })
                                }
                              >
                                <option value="Y">첨부</option>
                                <option value="N">미첨부</option>
                              </select>
                            </div>
                            <div className="flex-1">
                              <Label>
                                {entry.rcp_yn === "Y" ? "증빙서번호" : "미첨부사유"}
                              </Label>
                              <Input
                                value={entry.rcp_yn === "Y" ? entry.rcp_no : entry.bigo}
                                onChange={(e) =>
                                  updateEntry(entry.id, {
                                    ...(entry.rcp_yn === "Y"
                                      ? { rcp_no: e.target.value }
                                      : { bigo: e.target.value }),
                                  })
                                }
                                placeholder={
                                  entry.rcp_yn === "Y" ? "증빙서번호" : "사유 입력"
                                }
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Summary */}
              <div className="flex justify-between items-center bg-gray-50 rounded-lg p-3 text-sm">
                <span>
                  총 <b>{entries.length}</b>건 |
                  분석완료 <b className="text-blue-600">{entries.filter((e) => !e.scanning && !e.error).length}</b>건 |
                  오류 <b className="text-red-600">{entries.filter((e) => e.error).length}</b>건
                </span>
                <span>
                  합계 금액: <b className="text-blue-700">{fmt(entries.reduce((s, e) => s + e.acc_amt, 0))}원</b>
                </span>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Customer search dialog */}
      <CustomerSearchDialog
        open={customerDialogOpen}
        onClose={() => setCustomerDialogOpen(false)}
        initialMode="search"
        onSelect={(c) => {
          if (activeEntryId !== null) {
            updateEntry(activeEntryId, {
              cust_id: c.cust_id,
              customerName: c.name || "",
            });
          }
          setCustomerDialogOpen(false);
        }}
      />
    </div>
  );
}
