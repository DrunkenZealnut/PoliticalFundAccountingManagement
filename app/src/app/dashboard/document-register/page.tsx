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
  addr: string;
  items: { name: string; quantity: number; unitPrice: number; amount: number }[];
  expenseCategory: string;  // "선거비용" | "선거비용외"
  expenseType1: string;     // 대분류
  expenseType2: string;     // 중분류
  expenseType3: string;     // 소분류
  payMethod: string;        // 결제수단
}

interface ParsedEntry {
  id: number;
  fileName: string;
  preview: string;
  scanning: boolean;
  error: string | null;
  // Common fields
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
  // Expense-only fields
  exp_group1_cd: string;
  exp_group2_cd: string;
  exp_group3_cd: string;
  acc_ins_type: string;
}

const DEFAULT_CUST_SEC_CD = 63;
const DEFAULT_REG_NUM = "9999";
const NO_CUSTOMER_ID = -999;

/* ------------------------------------------------------------------ */
/*  3-level expense type data (지출유형 3단계)                          */
/* ------------------------------------------------------------------ */

interface ExpType2 { label: string; level3: string[]; }
interface ExpType1 { label: string; level2: ExpType2[]; }

const ELECTION_EXP_TYPES: ExpType1[] = [
  { label: "인쇄물", level2: [
    { label: "선거벽보", level3: ["기획/도안료", "인쇄비", "운송비", "기타"] },
    { label: "선거공보", level3: ["기획/도안료", "인쇄비", "운송비", "기타"] },
    { label: "선거공약서", level3: ["기획/도안료", "인쇄비", "운송비", "기타"] },
    { label: "후보자사진", level3: ["촬영비", "기타"] },
    { label: "명함", level3: ["인쇄비", "기타"] },
    { label: "예비후보자홍보물", level3: ["기획/도안료", "인쇄비", "우편요금", "기타"] },
  ]},
  { label: "광고", level2: [
    { label: "신문광고", level3: ["광고료", "기획/도안료", "기타"] },
    { label: "TV광고", level3: ["광고료", "기획/도안료", "제작비", "기타"] },
    { label: "라디오방송광고", level3: ["광고료", "기획/도안료", "제작비", "기타"] },
    { label: "인터넷광고", level3: ["광고료", "기획/도안료", "동영상제작비", "배너/팝업제작비", "대행수수료", "기타"] },
  ]},
  { label: "방송연설", level2: [
    { label: "TV방송연설", level3: ["시설이용료", "제작비", "기획/도안료", "기타"] },
    { label: "라디오방송연설", level3: ["시설이용료", "제작비", "기획/도안료", "기타"] },
  ]},
  { label: "소품", level2: [
    { label: "어깨띠", level3: ["제작비", "기타"] },
    { label: "윗옷", level3: ["구입비", "기호등인쇄비", "기타"] },
    { label: "모자", level3: ["구입비", "기호등인쇄비", "기타"] },
    { label: "소품", level3: ["구입/임차비", "기타"] },
  ]},
  { label: "거리게시용현수막", level2: [
    { label: "거리게시용현수막", level3: ["제작비", "이동게시비", "장비임차료", "기타"] },
  ]},
  { label: "공개장소연설대담", level2: [
    { label: "차량", level3: ["임차비", "유류비", "기사인부임", "임차비(유류비/기사인부임포함)", "기타"] },
    { label: "무대연단", level3: ["설치/철거비", "홍보물설치관련", "기획/도안료", "기타"] },
    { label: "확성장치", level3: ["차량용임차비", "휴대용임차비", "기타"] },
    { label: "래핑비", level3: ["설치/철거비", "기타"] },
    { label: "발전기", level3: ["발전기임차비", "인버터임차비", "기타"] },
    { label: "녹화기", level3: ["LED전광판임차비", "녹화물제작비", "녹화물기획도안료", "기타"] },
    { label: "로고송", level3: ["제작비", "저작권료", "인격권료", "기타"] },
    { label: "수화통역자", level3: ["인건비", "기타"] },
    { label: "그밖의선거운동", level3: ["녹음기", "LED문자전광판/간판", "기타"] },
  ]},
  { label: "전화/전자우편/문자메시지", level2: [
    { label: "전화/인터넷포함", level3: ["설치비", "통화요금", "임차비", "기타"] },
    { label: "문자메시지", level3: ["발송비", "장비임차료", "기타"] },
    { label: "전자우편", level3: ["발송비", "SNS전송용동영상제작비", "기타"] },
  ]},
  { label: "선거사무관계자", level2: [
    { label: "선거사무관계자수당", level3: ["선거사무장", "선거연락소장", "회계책임자", "선거사무원", "활동보조인"] },
    { label: "동행자식대", level3: ["식대"] },
  ]},
  { label: "그밖의선거운동", level2: [
    { label: "그밖의선거운동", level3: ["홈페이지개설운영비", "인터넷홈페이지/문비발급", "기타"] },
  ]},
  { label: "선거사무소", level2: [
    { label: "간판", level3: ["제작비", "장비임차", "기타"] },
    { label: "현판", level3: ["제작비", "기타"] },
    { label: "현수막", level3: ["제작비", "장비임차", "로프이용료", "기타"] },
    { label: "유지비용", level3: ["수도요금", "전기요금", "기타"] },
    { label: "옥상구조물", level3: ["제작비", "기타"] },
  ]},
  { label: "기타", level2: [
    { label: "위법비용", level3: ["위법비용"] },
  ]},
];

const NON_ELECTION_EXP_TYPES: ExpType1[] = [
  { label: "선거사무소", level2: [
    { label: "임차보증금", level3: [] },
    { label: "사무집기류임차비", level3: [] },
    { label: "소모품구입비", level3: [] },
    { label: "내외부설치유지비", level3: [] },
    { label: "인건비", level3: [] },
    { label: "개소식관련", level3: ["다과비", "초대장발송비", "기타"] },
    { label: "기타", level3: [] },
    { label: "유지비용", level3: ["관리비"] },
  ]},
  { label: "납부금", level2: [
    { label: "기탁금", level3: [] },
    { label: "세대부명단교부비", level3: [] },
    { label: "기타", level3: [] },
  ]},
  { label: "예비후보자공약집", level2: [
    { label: "예비후보자공약집", level3: [] },
  ]},
  { label: "기타차량", level2: [
    { label: "선거벽보/공보/공약서부착차량", level3: ["임차비", "유류비", "기사인건비", "기타"] },
    { label: "후보자승용자동차", level3: ["임차비", "유류비", "기사인건비", "기타"] },
  ]},
  { label: "후보자등숙박비", level2: [
    { label: "숙박비", level3: [] },
  ]},
  { label: "선거운동준비비용", level2: [
    { label: "컨설팅비용", level3: [] },
    { label: "여론조사비용", level3: [] },
    { label: "기타", level3: [] },
  ]},
  { label: "기타", level2: [
    { label: "기타", level3: [] },
  ]},
];

function getExpTypeData(itemName: string): ExpType1[] {
  if (itemName.includes("선거비용외")) return NON_ELECTION_EXP_TYPES;
  if (itemName.includes("선거비용")) return ELECTION_EXP_TYPES;
  return [];
}

const PAY_METHODS = [
  { value: "118", label: "계좌입금" },
  { value: "119", label: "카드" },
  { value: "120", label: "현금" },
  { value: "583", label: "수표" },
  { value: "584", label: "신용카드" },
  { value: "585", label: "체크카드" },
];

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function DocumentRegisterPage() {
  const { orgId, orgSecCd, orgType } = useAuth();
  const { loading: codesLoading, getName, getAccounts, getItems } = useCodeValues();

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

  useEffect(() => {
    return () => {
      entries.forEach((e) => { if (e.preview) URL.revokeObjectURL(e.preview); });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function fmt(n: number) { return n.toLocaleString("ko-KR"); }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /** AI 응답의 expenseCategory로 과목(item_sec_cd) 자동 선택 */
  function autoSelectItem(accSecCd: number, expenseCategory: string): number {
    if (!orgSecCd || !accSecCd) return 0;
    const items = getItems(orgSecCd, incmSecCd, accSecCd);
    if (items.length === 0) return 0;
    // "선거비용외" 키워드가 있으면 "선거비용외" 과목 선택
    if (expenseCategory.includes("선거비용외") || expenseCategory.includes("비용외")) {
      const match = items.find((i) => i.cv_name.includes("선거비용외") || i.cv_name.includes("비용외"));
      if (match) return match.cv_id;
    }
    // "선거비용" 키워드가 있으면 "선거비용" 과목 (선거비용외 제외)
    if (expenseCategory.includes("선거비용")) {
      const match = items.find((i) => i.cv_name.includes("선거비용") && !i.cv_name.includes("선거비용외"));
      if (match) return match.cv_id;
    }
    return items[0].cv_id; // fallback: 첫 번째 과목
  }

  /** AI 응답의 payMethod 문자열 → acc_ins_type 코드 매핑 */
  function mapPayMethod(pm: string): string {
    if (!pm) return "118";
    if (pm.includes("신용카드")) return "584";
    if (pm.includes("체크카드")) return "585";
    if (pm.includes("카드")) return "119";
    if (pm.includes("현금")) return "120";
    if (pm.includes("수표")) return "583";
    return "118"; // 계좌입금
  }

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

      let dateStr = data.date || "";
      if (dateStr.length === 8 && !dateStr.includes("-")) {
        dateStr = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
      }

      // 1) 계정 자동 선택 (첫 번째 계정)
      const autoAcc = accountOptions.length > 0 ? accountOptions[0].cv_id : 0;

      // 2) 과목 자동 선택 (AI의 expenseCategory 기반)
      const autoItem = isExpense
        ? autoSelectItem(autoAcc, data.expenseCategory || "")
        : autoSelectItem(autoAcc, "");

      // 3) 결제수단
      const payCode = mapPayMethod(data.payMethod || "");

      // 4) 증빙서번호 자동 채번 (기존 max + 1)
      let autoRcpNo = "";
      if (orgId) {
        try {
          const rcpRes = await fetch(`/api/acc-book?orgId=${orgId}&incmSecCd=${incmSecCd}&maxRcpNo=1`);
          if (rcpRes.ok) {
            const rcpData = await rcpRes.json();
            const maxNo = rcpData.maxRcpNo ?? 0;
            autoRcpNo = String(maxNo + 1 + entries.filter((e) => e.id < entry.id && e.rcp_yn === "Y").length);
          }
        } catch { /* fallback: empty */ }
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
        acc_ins_type: payCode,
        exp_group1_cd: data.expenseType1 || "",
        exp_group2_cd: data.expenseType2 || "",
        exp_group3_cd: data.expenseType3 || "",
        rcp_yn: "Y",
        rcp_no: autoRcpNo,
      });
    } catch {
      updateEntry(entry.id, { scanning: false, error: "AI 분석 중 오류가 발생했습니다." });
    }
  }

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArr = Array.from(files).filter((f) =>
      f.type.startsWith("image/") || f.type === "application/pdf"
    );
    if (fileArr.length === 0) { alert("지원하는 파일 형식: JPG, PNG, PDF"); return; }
    if (entries.length + fileArr.length > 10) { alert("최대 10건까지 업로드 가능합니다."); return; }

    const newEntries: ParsedEntry[] = fileArr.map((file) => ({
      id: nextId.current++,
      fileName: file.name,
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : "",
      scanning: false, error: null,
      acc_sec_cd: 0, item_sec_cd: 0, acc_date: "", content: "", acc_amt: 0,
      cust_id: 0, customerName: "", rcp_yn: "Y", rcp_no: "", bigo: "", providerRegNum: "",
      exp_group1_cd: "", exp_group2_cd: "", exp_group3_cd: "", acc_ins_type: "118",
    }));

    setEntries((prev) => [...prev, ...newEntries]);
    for (let i = 0; i < fileArr.length; i++) scanFile(newEntries[i], fileArr[i]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.length]);

  function updateEntry(id: number, patch: Partial<ParsedEntry>) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function removeEntry(id: number) {
    setEntries((prev) => {
      const target = prev.find((e) => e.id === id);
      if (target?.preview) URL.revokeObjectURL(target.preview);
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
    let success = 0, failed = 0;

    for (const e of validEntries) {
      let custId = e.cust_id;
      if (!custId && e.customerName.trim()) {
        try {
          const custRes = await fetch("/api/customers", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "insert",
              data: { cust_sec_cd: DEFAULT_CUST_SEC_CD, name: e.customerName.trim(), reg_num: e.providerRegNum || DEFAULT_REG_NUM },
            }),
          });
          if (custRes.ok) { const d = await custRes.json(); custId = d.cust_id; }
        } catch { /* use default */ }
      }

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

      // 지출 전용 필드
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
        if (res.ok) success++; else failed++;
      } catch { failed++; }
    }

    setSaving(false);
    alert(`등록 완료: 성공 ${success}건${failed > 0 ? `, 실패 ${failed}건` : ""}`);
    if (success > 0) {
      setEntries((prev) => prev.filter((e) => !validEntries.some((v) => v.id === e.id)));
    }
  }

  /* ---- Entry form renderer ---- */
  function renderEntryForm(entry: ParsedEntry) {
    const itemName = entry.item_sec_cd ? getName(entry.item_sec_cd) : "";
    const expTypes = isExpense && orgType !== "supporter" ? getExpTypeData(itemName) : [];
    const level2Items = expTypes.find((t) => t.label === entry.exp_group1_cd)?.level2 || [];
    const level3Items = level2Items.find((t) => t.label === entry.exp_group2_cd)?.level3 || [];
    const showExpType = isExpense && expTypes.length > 0;

    return (
      <div className="space-y-3">
        {/* Row 1: 계정 + 과목 + (지출유형 3단계 or empty) */}
        <div className={`grid gap-3 ${showExpType ? "grid-cols-2 md:grid-cols-5" : "grid-cols-2 md:grid-cols-4"}`}>
          <CodeSelect
            label="계정"
            value={entry.acc_sec_cd}
            onChange={(v) => updateEntry(entry.id, { acc_sec_cd: v, item_sec_cd: 0, exp_group1_cd: "", exp_group2_cd: "", exp_group3_cd: "" })}
            options={accountOptions}
            placeholder="계정 선택"
          />
          <CodeSelect
            label="과목"
            value={entry.item_sec_cd}
            onChange={(v) => updateEntry(entry.id, { item_sec_cd: v, exp_group1_cd: "", exp_group2_cd: "", exp_group3_cd: "" })}
            options={orgSecCd && entry.acc_sec_cd ? getItems(orgSecCd, incmSecCd, entry.acc_sec_cd) : []}
            placeholder="과목 선택"
            disabled={!entry.acc_sec_cd}
          />
          {showExpType && (
            <>
              <div>
                <Label>지출유형1</Label>
                <select className="w-full mt-1 border rounded px-2 py-2 text-sm"
                  value={entry.exp_group1_cd}
                  onChange={(e) => updateEntry(entry.id, { exp_group1_cd: e.target.value, exp_group2_cd: "", exp_group3_cd: "" })}
                >
                  <option value="">선택</option>
                  {expTypes.map((t) => <option key={t.label} value={t.label}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <Label>지출유형2</Label>
                <select className="w-full mt-1 border rounded px-2 py-2 text-sm"
                  value={entry.exp_group2_cd}
                  onChange={(e) => updateEntry(entry.id, { exp_group2_cd: e.target.value, exp_group3_cd: "" })}
                  disabled={!entry.exp_group1_cd}
                >
                  <option value="">선택</option>
                  {level2Items.map((t) => <option key={t.label} value={t.label}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <Label>지출유형3</Label>
                <select className="w-full mt-1 border rounded px-2 py-2 text-sm"
                  value={entry.exp_group3_cd}
                  onChange={(e) => updateEntry(entry.id, { exp_group3_cd: e.target.value })}
                  disabled={!entry.exp_group2_cd || level3Items.length === 0}
                >
                  <option value="">{level3Items.length === 0 ? "-" : "선택"}</option>
                  {level3Items.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            </>
          )}
        </div>

        {/* Row 2: 일자 + 금액 + 거래처 + (지출방법) */}
        <div className={`grid gap-3 ${isExpense ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2 md:grid-cols-3"}`}>
          <div>
            <Label>{typeLabel}일자</Label>
            <Input type="date" value={entry.acc_date}
              onChange={(e) => updateEntry(entry.id, { acc_date: e.target.value })} />
          </div>
          <div>
            <Label>금액</Label>
            <Input type="number" value={entry.acc_amt || ""}
              onChange={(e) => updateEntry(entry.id, { acc_amt: Number(e.target.value) })}
              placeholder="금액" />
          </div>
          <div>
            <Label>{isExpense ? "지출대상자" : "수입제공자"}</Label>
            <div className="flex gap-1">
              <Input value={entry.customerName}
                onChange={(e) => updateEntry(entry.id, { customerName: e.target.value })}
                placeholder="거래처명" className="flex-1" />
              <Button variant="outline" size="sm" className="shrink-0"
                onClick={() => { setActiveEntryId(entry.id); setCustomerDialogOpen(true); }}>
                검색
              </Button>
            </div>
          </div>
          {isExpense && (
            <div>
              <Label>지출방법</Label>
              <select className="w-full mt-1 border rounded px-2 py-2 text-sm"
                value={entry.acc_ins_type}
                onChange={(e) => updateEntry(entry.id, { acc_ins_type: e.target.value })}
              >
                {PAY_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Row 3: 내역 + 증빙 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>내역</Label>
            <Input value={entry.content}
              onChange={(e) => updateEntry(entry.id, { content: e.target.value })}
              placeholder={`${typeLabel} 내역`} />
          </div>
          <div className="flex gap-2">
            <div className="w-20">
              <Label>증빙</Label>
              <select className="w-full border rounded px-2 py-2 text-sm"
                value={entry.rcp_yn}
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

  if (codesLoading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">코드 데이터 로딩 중...</div>;
  }

  const validCount = entries.filter((e) => !e.scanning && !e.error && e.acc_sec_cd && e.item_sec_cd && e.acc_date && e.acc_amt > 0).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">영수증/계약서 자동등록</h2>
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave} disabled={saving || entries.length === 0}>
            {saving ? "저장 중..." : `저장 (${validCount}건)`}
          </Button>
          <Button variant="outline" size="sm"
            onClick={() => { setEntries([]); if (fileRef.current) fileRef.current.value = ""; }}>
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
            onDrop={handleDrop} onDragOver={handleDragOver}
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden"
              onChange={(e) => e.target.files && handleFiles(e.target.files)} />
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
                <div key={entry.id}
                  className={`bg-white rounded-lg border p-4 ${entry.error ? "border-red-300 bg-red-50" : ""}`}>
                  <div className="flex gap-4">
                    {/* Thumbnail */}
                    <div className="shrink-0 w-24 h-24 bg-gray-100 rounded flex items-center justify-center overflow-hidden">
                      {entry.preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={entry.preview} alt={entry.fileName} className="max-w-full max-h-full object-contain" />
                      ) : (
                        <span className="text-gray-400 text-xs">PDF</span>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-600">{entry.fileName}</span>
                        <div className="flex items-center gap-2">
                          {entry.scanning && <span className="text-sm text-blue-600 animate-pulse">AI 분석 중...</span>}
                          {entry.error && <span className="text-sm text-red-600">{entry.error}</span>}
                          {!entry.scanning && entry.item_sec_cd > 0 && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                              AI 추천{entry.exp_group1_cd ? `: ${entry.exp_group1_cd}` : ""}
                            </span>
                          )}
                          <Button variant="outline" size="sm" onClick={() => removeEntry(entry.id)}>삭제</Button>
                        </div>
                      </div>
                      {!entry.scanning && renderEntryForm(entry)}
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

      <CustomerSearchDialog
        open={customerDialogOpen}
        onClose={() => setCustomerDialogOpen(false)}
        initialMode="search"
        onSelect={(c) => {
          if (activeEntryId !== null) {
            updateEntry(activeEntryId, { cust_id: c.cust_id, customerName: c.name || "" });
          }
          setCustomerDialogOpen(false);
        }}
      />
    </div>
  );
}
