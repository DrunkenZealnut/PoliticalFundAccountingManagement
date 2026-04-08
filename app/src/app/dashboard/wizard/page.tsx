"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/stores/auth";
import { useCodeValues } from "@/hooks/use-code-values";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CodeSelect } from "@/components/code-select";
import { CustomerSearchDialog } from "@/components/customer-search-dialog";
import { getExpTypeData, PAY_METHODS } from "@/lib/expense-types";
import {
  EXPENSE_WIZARD_TYPES,
  INCOME_WIZARD_TYPES,
  resolveCodeValues,
  searchWizardTypes,
  type WizardType,
} from "@/lib/wizard-mappings";

const DEFAULT_CUST_SEC_CD = 63;
const DEFAULT_REG_NUM = "9999";
const NO_CUSTOMER_ID = -999;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function WizardPage() {
  const router = useRouter();
  const { orgId, orgSecCd, orgType } = useAuth();
  const { loading: codesLoading, getName, getAccounts, getItems } = useCodeValues();

  const [mode, setMode] = useState<"expense" | "income">("expense");
  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState<WizardType | null>(null);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Step 2 form
  const [form, setForm] = useState({
    acc_date: todayStr(),
    acc_amt: 0,
    content: "",
    cust_id: 0,
    customerName: "",
    rcp_yn: "Y",
    rcp_no: "",
    bigo: "",
    acc_ins_type: "118",
    exp_group2_cd: "",
    exp_group3_cd: "",
  });

  // Step 3 auto-set (editable)
  const [autoSet, setAutoSet] = useState({
    acc_sec_cd: 0,
    item_sec_cd: 0,
    exp_group1_cd: "",
  });

  // Evidence file
  const [evidenceFile, setEvidenceFile] = useState<{ name: string; type: string; base64: string } | null>(null);

  const isExpense = mode === "expense";
  const incmSecCd = isExpense ? 2 : 1;
  const types = isExpense ? EXPENSE_WIZARD_TYPES : INCOME_WIZARD_TYPES;
  const matchedIds = searchWizardTypes(types, searchKeyword);

  function fmt(n: number) { return n.toLocaleString("ko-KR"); }

  /* ---- Step 1: 카드 선택 ---- */
  function handleCardSelect(type: WizardType) {
    // 영수증첨부 카드 → document-register로 이동
    if (type.route) {
      router.push(type.route);
      return;
    }

    setSelectedType(type);

    // 자동 코드 매핑
    if (orgSecCd) {
      const { accSecCd, itemSecCd } = resolveCodeValues(type, orgSecCd, getAccounts, getItems);
      setAutoSet({
        acc_sec_cd: accSecCd,
        item_sec_cd: itemSecCd,
        exp_group1_cd: type.expGroup1 || "",
      });
      setForm((prev) => ({
        ...prev,
        exp_group2_cd: type.expGroup2 || "",
        exp_group3_cd: "",
      }));
    }

    setStep(2);
  }

  /* ---- Step 3: 저장 ---- */
  async function handleSave() {
    if (!orgId) return;
    if (!autoSet.acc_sec_cd) { alert("계정을 선택하세요."); return; }
    if (!autoSet.item_sec_cd) { alert("과목을 선택하세요."); return; }
    if (!form.acc_date) { alert("날짜를 입력하세요."); return; }
    if (form.acc_amt <= 0) { alert("금액을 입력하세요."); return; }
    if (!form.content.trim()) { alert("내역을 입력하세요."); return; }

    setSaving(true);

    // 거래처 자동 등록
    let custId = form.cust_id;
    if (!custId && form.customerName.trim()) {
      try {
        const r = await fetch("/api/customers", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "insert", data: {
            cust_sec_cd: DEFAULT_CUST_SEC_CD,
            name: form.customerName.trim(),
            reg_num: DEFAULT_REG_NUM,
          }}),
        });
        if (r.ok) { const d = await r.json(); custId = d.cust_id; }
      } catch { /* fallback */ }
    }

    // 증빙서번호 자동 채번
    let rcpNo = form.rcp_no;
    if (form.rcp_yn === "Y" && !rcpNo) {
      try {
        const r = await fetch(`/api/acc-book?orgId=${orgId}&incmSecCd=${incmSecCd}&maxRcpNo=1`);
        if (r.ok) { const d = await r.json(); rcpNo = String((d.maxRcpNo ?? 0) + 1); }
      } catch { /* empty */ }
    }

    const payload: Record<string, unknown> = {
      org_id: orgId, incm_sec_cd: incmSecCd,
      acc_sec_cd: autoSet.acc_sec_cd, item_sec_cd: autoSet.item_sec_cd, exp_sec_cd: 0,
      cust_id: custId || NO_CUSTOMER_ID,
      acc_date: form.acc_date.replace(/-/g, ""),
      content: form.content, acc_amt: form.acc_amt,
      rcp_yn: form.rcp_yn,
      rcp_no: form.rcp_yn === "Y" ? (rcpNo || null) : null,
      bigo: form.rcp_yn === "N" ? (form.bigo || null) : null,
    };

    if (isExpense) {
      payload.acc_ins_type = form.acc_ins_type || null;
      payload.exp_group1_cd = autoSet.exp_group1_cd || null;
      payload.exp_group2_cd = form.exp_group2_cd || null;
      payload.exp_group3_cd = form.exp_group3_cd || null;
    }

    try {
      const res = await fetch("/api/acc-book", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "insert", data: payload }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(`등록 실패: ${err.error}`);
        setSaving(false);
        return;
      }

      const accBook = await res.json();

      // 증빙파일 업로드
      if (evidenceFile && accBook.acc_book_id) {
        await fetch("/api/evidence-file", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accBookId: accBook.acc_book_id, orgId,
            fileName: evidenceFile.name, fileType: evidenceFile.type, fileData: evidenceFile.base64,
          }),
        });
      }

      setSaving(false);

      if (confirm("등록 완료! 추가 등록하시겠습니까?")) {
        // 리셋
        setStep(1);
        setSelectedType(null);
        setSearchKeyword("");
        setEvidenceFile(null);
        setForm({
          acc_date: todayStr(), acc_amt: 0, content: "", cust_id: 0, customerName: "",
          rcp_yn: "Y", rcp_no: "", bigo: "", acc_ins_type: "118", exp_group2_cd: "", exp_group3_cd: "",
        });
      } else {
        router.push(isExpense ? "/dashboard/expense" : "/dashboard/income");
      }
    } catch {
      alert("등록 중 오류가 발생했습니다.");
      setSaving(false);
    }
  }

  /* ---- Render helpers ---- */
  const accountOptions = orgSecCd ? getAccounts(orgSecCd, incmSecCd) : [];
  const itemOptions = orgSecCd && autoSet.acc_sec_cd ? getItems(orgSecCd, incmSecCd, autoSet.acc_sec_cd) : [];
  const itemName = autoSet.item_sec_cd ? getName(autoSet.item_sec_cd) : "";
  const expTypes = isExpense && orgType !== "supporter" ? getExpTypeData(itemName) : [];
  const level2Items = expTypes.find((t) => t.label === autoSet.exp_group1_cd)?.level2 || [];
  const level3Items = level2Items.find((t) => t.label === form.exp_group2_cd)?.level3 || [];

  if (codesLoading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">로딩 중...</div>;
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold">간편등록 마법사</h2>
        <p className="text-gray-500 text-sm mt-1">3단계로 간편하게 회계자료를 등록하세요</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
              ${step >= s ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-500"}`}>
              {s}
            </div>
            <span className={`text-xs ${step >= s ? "text-blue-600" : "text-gray-400"}`}>
              {s === 1 ? "유형선택" : s === 2 ? "정보입력" : "확인/저장"}
            </span>
            {s < 3 && <div className={`w-12 h-0.5 ${step > s ? "bg-blue-600" : "bg-gray-200"}`} />}
          </div>
        ))}
      </div>

      {/* Mode toggle */}
      {step === 1 && (
        <div className="flex justify-center gap-2">
          <Button variant={mode === "expense" ? "default" : "outline"} size="sm"
            onClick={() => { setMode("expense"); setSearchKeyword(""); }}>
            지출
          </Button>
          <Button variant={mode === "income" ? "default" : "outline"} size="sm"
            onClick={() => { setMode("income"); setSearchKeyword(""); }}>
            수입
          </Button>
        </div>
      )}

      {/* ============ Step 1: 카드 선택 ============ */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-lg font-semibold">어떤 종류의 {isExpense ? "지출" : "수입"}인가요?</p>
          </div>

          {/* 검색 */}
          <div className="max-w-sm mx-auto">
            <Input
              placeholder="키워드로 검색 (예: 현수막, 명함, 전기세)"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
            />
          </div>

          {/* 카드 그리드 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {types.map((type) => {
              const isMatch = matchedIds.has(type.id);
              return (
                <button
                  key={type.id}
                  onClick={() => handleCardSelect(type)}
                  className={`p-4 rounded-lg border-2 text-center transition-all hover:shadow-md
                    ${isMatch ? "border-gray-200 hover:border-blue-400 bg-white" : "border-gray-100 bg-gray-50 opacity-40"}
                    ${type.route ? "border-dashed" : ""}`}
                >
                  <div className="text-3xl mb-2">{type.icon}</div>
                  <div className="font-semibold text-sm">{type.label}</div>
                  <div className="text-xs text-gray-500 mt-1">{type.description}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ============ Step 2: 세부 정보 ============ */}
      {step === 2 && selectedType && (
        <div className="bg-white rounded-lg border p-6 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">{selectedType.icon}</span>
            <div>
              <h3 className="font-bold text-lg">{selectedType.label}</h3>
              <p className="text-sm text-gray-500">{selectedType.description}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>{isExpense ? "지출대상자" : "수입제공자"}</Label>
              <div className="flex gap-1 mt-1">
                <Input value={form.customerName}
                  onChange={(e) => setForm({ ...form, customerName: e.target.value, cust_id: 0 })}
                  placeholder="거래처명" className="flex-1" />
                <Button variant="outline" size="sm"
                  onClick={() => setCustomerDialogOpen(true)}>검색</Button>
              </div>
            </div>

            <div>
              <Label>금액</Label>
              <Input type="number" value={form.acc_amt || ""}
                onChange={(e) => setForm({ ...form, acc_amt: Number(e.target.value) })}
                placeholder="금액 입력" />
              {form.acc_amt > 0 && (
                <p className="text-xs text-blue-600 mt-1">{fmt(form.acc_amt)}원</p>
              )}
            </div>

            <div>
              <Label>날짜</Label>
              <Input type="date" value={form.acc_date}
                onChange={(e) => setForm({ ...form, acc_date: e.target.value })} />
            </div>

            {isExpense && (
              <div>
                <Label>결제수단</Label>
                <select className="w-full mt-1 border rounded px-3 py-2 text-sm" value={form.acc_ins_type}
                  onChange={(e) => setForm({ ...form, acc_ins_type: e.target.value })}>
                  {PAY_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
            )}

            <div className="md:col-span-2">
              <Label>내역</Label>
              <Input value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder={`${isExpense ? "지출" : "수입"} 내역을 입력하세요`} />
            </div>

            {/* 증빙파일 */}
            <div className="md:col-span-2">
              <Label>증빙파일 (선택)</Label>
              <Input type="file" accept="image/*,application/pdf" className="mt-1"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) { setEvidenceFile(null); return; }
                  const reader = new FileReader();
                  reader.onload = () => {
                    setEvidenceFile({ name: file.name, type: file.type, base64: (reader.result as string).split(",")[1] });
                  };
                  reader.readAsDataURL(file);
                }} />
              {evidenceFile && <p className="text-xs text-green-600 mt-1">{evidenceFile.name}</p>}
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t">
            <Button variant="outline" onClick={() => { setStep(1); setSelectedType(null); }}>
              ← 이전
            </Button>
            <Button onClick={() => setStep(3)}
              disabled={!form.acc_amt || !form.content.trim()}>
              다음 →
            </Button>
          </div>
        </div>
      )}

      {/* ============ Step 3: 확인/저장 ============ */}
      {step === 3 && selectedType && (
        <div className="bg-white rounded-lg border p-6 space-y-4">
          <h3 className="font-bold text-lg">등록 내용을 확인하세요</h3>

          {/* 자동 설정값 (수정 가능) */}
          <div className="bg-blue-50 rounded-lg p-4 space-y-3">
            <p className="text-sm font-semibold text-blue-700">자동 설정 (수정 가능)</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <CodeSelect label="계정" value={autoSet.acc_sec_cd}
                onChange={(v) => setAutoSet({ ...autoSet, acc_sec_cd: v, item_sec_cd: 0 })}
                options={accountOptions} placeholder="계정" />
              <CodeSelect label="과목" value={autoSet.item_sec_cd}
                onChange={(v) => setAutoSet({ ...autoSet, item_sec_cd: v })}
                options={itemOptions} placeholder="과목" disabled={!autoSet.acc_sec_cd} />
            </div>

            {/* 지출유형 */}
            {isExpense && expTypes.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">지출유형1</Label>
                  <select className="w-full border rounded px-2 py-1.5 text-sm" value={autoSet.exp_group1_cd}
                    onChange={(e) => setAutoSet({ ...autoSet, exp_group1_cd: e.target.value })}>
                    <option value="">선택</option>
                    {expTypes.map((t) => <option key={t.label} value={t.label}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">지출유형2</Label>
                  <select className="w-full border rounded px-2 py-1.5 text-sm" value={form.exp_group2_cd}
                    onChange={(e) => setForm({ ...form, exp_group2_cd: e.target.value, exp_group3_cd: "" })}
                    disabled={!autoSet.exp_group1_cd}>
                    <option value="">선택</option>
                    {level2Items.map((t) => <option key={t.label} value={t.label}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">지출유형3</Label>
                  <select className="w-full border rounded px-2 py-1.5 text-sm" value={form.exp_group3_cd}
                    onChange={(e) => setForm({ ...form, exp_group3_cd: e.target.value })}
                    disabled={!form.exp_group2_cd || level3Items.length === 0}>
                    <option value="">{level3Items.length === 0 ? "-" : "선택"}</option>
                    {level3Items.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* 입력 내용 확인 */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-1 border-b">
              <span className="text-gray-500">{isExpense ? "지출대상자" : "수입제공자"}</span>
              <span className="font-medium">{form.customerName || "-"}</span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-gray-500">금액</span>
              <span className="font-medium text-blue-700">{fmt(form.acc_amt)}원</span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-gray-500">날짜</span>
              <span className="font-medium">{form.acc_date}</span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-gray-500">내역</span>
              <span className="font-medium">{form.content}</span>
            </div>
            {isExpense && (
              <div className="flex justify-between py-1 border-b">
                <span className="text-gray-500">결제수단</span>
                <span className="font-medium">{PAY_METHODS.find((m) => m.value === form.acc_ins_type)?.label}</span>
              </div>
            )}
            <div className="flex justify-between py-1 border-b">
              <span className="text-gray-500">증빙</span>
              <span className="font-medium">{form.rcp_yn === "Y" ? "첨부 (번호 자동 채번)" : "미첨부"}</span>
            </div>
            {evidenceFile && (
              <div className="flex justify-between py-1 border-b">
                <span className="text-gray-500">증빙파일</span>
                <span className="font-medium text-green-600">{evidenceFile.name}</span>
              </div>
            )}
          </div>

          <div className="flex justify-between pt-4 border-t">
            <Button variant="outline" onClick={() => setStep(2)}>
              ← 이전
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "저장 중..." : "등록하기"}
            </Button>
          </div>
        </div>
      )}

      {/* Customer dialog */}
      <CustomerSearchDialog
        open={customerDialogOpen}
        onClose={() => setCustomerDialogOpen(false)}
        initialMode="search"
        onSelect={(c) => {
          setForm({ ...form, cust_id: c.cust_id, customerName: c.name || "" });
          setCustomerDialogOpen(false);
        }}
      />
    </div>
  );
}
