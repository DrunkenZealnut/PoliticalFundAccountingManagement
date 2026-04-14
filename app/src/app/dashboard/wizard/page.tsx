"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/stores/auth";
import { useCodeValues } from "@/hooks/use-code-values";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CodeSelect } from "@/components/code-select";
import { CustomerSearchDialog } from "@/components/customer-search-dialog";
import { getExpTypeData, detectItemCategory, getReimbursementStatus, PAY_METHODS } from "@/lib/expense-types";
import {
  EXPENSE_WIZARD_TYPES,
  INCOME_WIZARD_TYPES,
  resolveCodeValues,
  searchWizardTypes,
  inferExpenseType,
  type WizardType,
} from "@/lib/wizard-mappings";
import { parseExpenseText, compareWithOcr, type OcrComparison } from "@/lib/text-parser";

const DEFAULT_CUST_SEC_CD = 63;
const DEFAULT_REG_NUM = "9999";
const NO_CUSTOMER_ID = -999;
const GUIDE_DISMISSED_KEY = "wizard-guide-dismissed";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type SaveResult =
  | { status: "success"; summary: string }
  | { status: "partial"; summary: string; warning: string; accBookId: number }
  | { status: "error"; message: string };

type ValidationErrors = {
  acc_sec_cd?: string;
  item_sec_cd?: string;
  acc_date?: string;
  acc_amt?: string;
  content?: string;
};

export default function WizardPage() {
  const router = useRouter();
  const { orgId, orgSecCd, orgType } = useAuth();
  const { loading: codesLoading, getName, getAccounts, getItems } = useCodeValues();

  const [mode, setMode] = useState<"expense" | "income">("expense");
  const [step, setStep] = useState(1);
  const [showStep1_5, setShowStep1_5] = useState(false);
  const [selectedType, setSelectedType] = useState<WizardType | null>(null);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [guideDismissed, setGuideDismissed] = useState(true);
  const [activeTab, setActiveTab] = useState<"card" | "quick">("card");

  // Quick register state
  const [inputText, setInputText] = useState("");
  const [quickFile, setQuickFile] = useState<{ name: string; type: string; base64: string } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [quickAnalysis, setQuickAnalysis] = useState<{
    parsed: ReturnType<typeof parseExpenseText>;
    inferred: ReturnType<typeof inferExpenseType>;
    ocrResult: { amount: number; date: string; provider: string; regNum: string; addr: string; content: string; payMethod: string } | null;
    ocrComparison: OcrComparison | null;
    customerMatch: { matched: boolean; custId: number; isNew: boolean; ocrData?: { regNum?: string; addr?: string } } | null;
  } | null>(null);

  useEffect(() => {
    setGuideDismissed(localStorage.getItem(GUIDE_DISMISSED_KEY) === "true");
  }, []);

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

  function dismissGuide() {
    setGuideDismissed(true);
    localStorage.setItem(GUIDE_DISMISSED_KEY, "true");
  }

  function resetWizard() {
    setStep(1);
    setShowStep1_5(false);
    setSelectedType(null);
    setSearchKeyword("");
    setEvidenceFile(null);
    setSaveResult(null);
    setValidationErrors({});
    setForm({
      acc_date: todayStr(), acc_amt: 0, content: "", cust_id: 0, customerName: "",
      rcp_yn: "Y", rcp_no: "", bigo: "", acc_ins_type: "118", exp_group2_cd: "", exp_group3_cd: "",
    });
    setAutoSet({ acc_sec_cd: 0, item_sec_cd: 0, exp_group1_cd: "" });
    setInputText("");
    setQuickFile(null);
    setQuickAnalysis(null);
  }

  /* ---- Step 1: 카드 선택 ---- */
  function handleCardSelect(type: WizardType) {
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

    // "기타" 카드 → Step 1.5 (지출유형 직접 선택)
    if ((type.id === "other-expense" || type.id === "other-income") && !type.expGroup1) {
      setShowStep1_5(true);
    } else {
      setShowStep1_5(false);
      setStep(2);
    }
  }

  /* ---- Step 1.5 → Step 2 전환 ---- */
  function handleStep1_5Next() {
    setShowStep1_5(false);
    setStep(2);
  }

  /* ---- Validation ---- */
  function validate(): boolean {
    const errors: ValidationErrors = {};
    if (!autoSet.acc_sec_cd) errors.acc_sec_cd = "계정을 선택하세요";
    if (!autoSet.item_sec_cd) errors.item_sec_cd = "과목을 선택하세요";
    if (!form.acc_date) errors.acc_date = "날짜를 입력하세요";
    if (form.acc_amt <= 0) errors.acc_amt = "금액을 입력하세요";
    if (!form.content.trim()) errors.content = "내역을 입력하세요";
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }

  /* ---- Step 3: 저장 ---- */
  async function handleSave() {
    if (!orgId) return;
    if (!validate()) return;

    setSaving(true);
    setSaveResult(null);

    // 거래처 자동 등록
    let custId = form.cust_id;
    let custWarning = "";
    if (!custId && form.customerName.trim()) {
      try {
        // OCR 데이터가 있으면 사업자번호/주소 포함하여 등록
        const ocrData = quickAnalysis?.ocrResult;
        const custData: Record<string, unknown> = {
          cust_sec_cd: DEFAULT_CUST_SEC_CD,
          name: form.customerName.trim(),
          reg_num: ocrData?.regNum || DEFAULT_REG_NUM,
          reg_date: todayStr().replace(/-/g, ""),
        };
        if (ocrData?.addr) custData.addr = ocrData.addr;

        const r = await fetch("/api/customers", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "insert", data: custData }),
        });
        if (r.ok) {
          const d = await r.json();
          custId = d.cust_id;
        } else {
          custWarning = "거래처 자동등록에 실패했습니다. 거래처 없이 저장됩니다.";
        }
      } catch {
        custWarning = "거래처 자동등록에 실패했습니다. 거래처 없이 저장됩니다.";
      }
    }

    // 증빙서번호 자동 채번
    let rcpNo = form.rcp_no;
    if (form.rcp_yn === "Y" && !rcpNo) {
      try {
        const r = await fetch(`/api/acc-book?orgId=${orgId}&incmSecCd=${incmSecCd}&maxRcpNo=1`);
        if (r.ok) {
          const d = await r.json();
          rcpNo = String((d.maxRcpNo ?? 0) + 1);
        }
      } catch {
        // 채번 실패 시 빈값으로 진행 (critical하지 않음)
      }
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
        const err = await res.json().catch(() => ({ error: "서버 오류" }));
        setSaving(false);
        setSaveResult({ status: "error", message: err.error || "등록에 실패했습니다" });
        return;
      }

      const accBook = await res.json();
      const summary = `${selectedType?.icon} ${selectedType?.label} · ${form.customerName || "-"} · ${fmt(form.acc_amt)}원 · ${form.acc_date} · ${form.content}`;

      // 증빙파일 업로드 (카드 모드: evidenceFile, 빠른 등록: quickFile)
      const fileToUpload = evidenceFile || quickFile;
      let evidenceWarning = "";
      if (fileToUpload && accBook.acc_book_id) {
        try {
          const evRes = await fetch("/api/evidence-file", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              accBookId: accBook.acc_book_id, orgId,
              fileName: fileToUpload.name, fileType: fileToUpload.type, fileData: fileToUpload.base64,
            }),
          });
          if (!evRes.ok) {
            const evErr = await evRes.json().catch(() => ({ error: "알 수 없는 오류" }));
            evidenceWarning = `증빙파일 저장 실패: ${evErr.error || "서버 오류"}. 내역관리에서 다시 첨부해주세요.`;
          }
        } catch (err) {
          evidenceWarning = `증빙파일 저장 실패: ${err instanceof Error ? err.message : "네트워크 오류"}. 내역관리에서 다시 첨부해주세요.`;
        }
      }

      setSaving(false);

      const warning = [custWarning, evidenceWarning].filter(Boolean).join(" ");
      if (warning) {
        setSaveResult({ status: "partial", summary, warning, accBookId: accBook.acc_book_id });
      } else {
        setSaveResult({ status: "success", summary });
      }
    } catch {
      setSaving(false);
      setSaveResult({ status: "error", message: "네트워크 오류가 발생했습니다. 인터넷 연결을 확인하세요." });
    }
  }

  /* ---- Quick Register: 분석 ---- */
  async function handleQuickAnalyze() {
    if (!inputText.trim()) return;
    setAnalyzing(true);
    setQuickAnalysis(null);
    setSaveResult(null);

    // 1. 텍스트 파싱
    const parsed = parseExpenseText(inputText);

    // 2. 지출유형 추론
    const inferred = inferExpenseType(parsed.keywords, EXPENSE_WIZARD_TYPES);

    // 3. 코드값 자동 매핑
    if (orgSecCd && inferred.wizardType) {
      const { accSecCd, itemSecCd } = resolveCodeValues(inferred.wizardType, orgSecCd, getAccounts, getItems);
      setAutoSet({ acc_sec_cd: accSecCd, item_sec_cd: itemSecCd, exp_group1_cd: inferred.expGroup1 });
    }

    // 4. 폼 필드 설정
    setForm((prev) => ({
      ...prev,
      acc_amt: parsed.amount || prev.acc_amt,
      acc_date: parsed.date || todayStr(),
      content: parsed.content || prev.content,
      customerName: parsed.customerName || prev.customerName,
      cust_id: 0,
      acc_ins_type: parsed.payMethod || "118",
      exp_group2_cd: inferred.expGroup2 || "",
      exp_group3_cd: inferred.expGroup3 || "",
    }));

    setSelectedType(inferred.wizardType);

    // 5. OCR (파일 있을 때)
    let ocrResult: { amount: number; date: string; provider: string; regNum: string; addr: string; content: string; payMethod: string } | null = null;
    if (quickFile) {
      try {
        const res = await fetch("/api/receipt-scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: quickFile.base64, mimeType: quickFile.type }),
        });
        if (res.ok) {
          const ocr = await res.json();
          ocrResult = ocr;
          // OCR 결과로 폼 보완 (텍스트에서 추출 못한 필드)
          if (!parsed.amount && ocr.amount) {
            setForm((prev) => ({ ...prev, acc_amt: ocr.amount }));
          }
          if (!parsed.date && ocr.date) {
            const d = ocr.date as string;
            const formatted = d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d;
            setForm((prev) => ({ ...prev, acc_date: formatted }));
          }
          if (!parsed.customerName && ocr.provider) {
            setForm((prev) => ({ ...prev, customerName: ocr.provider }));
          }
          if (ocr.content && !parsed.content) {
            setForm((prev) => ({ ...prev, content: ocr.content }));
          }
        }
      } catch { /* OCR 실패는 무시, 텍스트 파싱 결과만 사용 */ }
    }

    // 6. OCR 교차검증
    const ocrComparison = ocrResult ? compareWithOcr(parsed, ocrResult) : null;

    // 7. 거래처 검색 — API에서 이름 ILIKE 검색, 결과를 클라이언트에서 재검증
    const custName = parsed.customerName || ocrResult?.provider || "";
    let customerMatch: { matched: boolean; custId: number; isNew: boolean; ocrData?: { regNum?: string; addr?: string } } | null = null;
    if (custName) {
      try {
        const res = await fetch(`/api/customers?search=${encodeURIComponent(custName)}`);
        if (res.ok) {
          const data = await res.json();
          const customers = Array.isArray(data) ? data : data.data || [];
          // 클라이언트 재검증: 이름에 검색어가 포함되거나 검색어에 이름이 포함되는 결과만
          const nameLC = custName.toLowerCase();
          const verified = customers.filter((c: { name?: string }) =>
            c.name && (c.name.toLowerCase().includes(nameLC) || nameLC.includes(c.name.toLowerCase()))
          );
          if (verified.length > 0) {
            customerMatch = { matched: true, custId: verified[0].cust_id, isNew: false };
            setForm((prev) => ({ ...prev, cust_id: verified[0].cust_id, customerName: verified[0].name || custName }));
          } else {
            customerMatch = {
              matched: false, custId: 0, isNew: true,
              ocrData: ocrResult ? { regNum: ocrResult.regNum, addr: ocrResult.addr } : undefined,
            };
          }
        }
      } catch { /* 검색 실패는 무시 */ }
    }

    setQuickAnalysis({ parsed, inferred, ocrResult, ocrComparison, customerMatch });
    setAnalyzing(false);
    setStep(3); // 확인/저장 화면으로
  }

  /* ---- Render helpers ---- */
  const accountOptions = orgSecCd ? getAccounts(orgSecCd, incmSecCd) : [];
  const itemOptions = orgSecCd && autoSet.acc_sec_cd ? getItems(orgSecCd, incmSecCd, autoSet.acc_sec_cd) : [];
  const itemName = autoSet.item_sec_cd ? getName(autoSet.item_sec_cd) : "";
  const allExpTypes = isExpense && orgType !== "supporter"
    ? (() => {
        const elec = getExpTypeData("선거비용");
        const nonElec = getExpTypeData("선거비용외");
        // 깊은 복사하여 원본 데이터 보호
        const merged = elec.map((t) => ({ ...t, level2: [...t.level2] }));
        for (const t of nonElec) {
          const existing = merged.find((m) => m.label === t.label);
          if (existing) {
            // 동명 항목(선거사무소 등)은 level2를 합침
            const newL2 = t.level2.filter((l2) => !existing.level2.some((e) => e.label === l2.label));
            if (newL2.length > 0) existing.level2 = [...existing.level2, ...newL2];
          } else {
            merged.push({ ...t, level2: [...t.level2] });
          }
        }
        return merged;
      })()
    : [];
  const currentCategoryTypes = getExpTypeData(itemName);
  // 현재 과목에 맞는 데이터가 있으면 그것을 우선 사용, 없으면 병합본(allExpTypes) 사용
  const level2Items = (currentCategoryTypes.length > 0 ? currentCategoryTypes : allExpTypes)
    .find((t) => t.label === autoSet.exp_group1_cd)?.level2 || [];
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

      {/* Tab selector */}
      {!saveResult && step <= 1 && !showStep1_5 && (
        <div className="flex justify-center border-b">
          <button onClick={() => { setActiveTab("card"); setQuickAnalysis(null); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "card" ? "border-[#1B3A5C] text-[#1B3A5C]" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            카드 선택
          </button>
          <button onClick={() => { setActiveTab("quick"); setStep(1); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "quick" ? "border-[#1B3A5C] text-[#1B3A5C]" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            빠른 등록
          </button>
        </div>
      )}

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
              ${saveResult ? "bg-green-600 text-white" : step >= s ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-500"}`}>
              {saveResult ? "✓" : s}
            </div>
            <span className={`text-xs hidden sm:inline ${step >= s ? "text-blue-600" : "text-gray-400"}`}>
              {s === 1 ? "유형선택" : s === 2 ? "정보입력" : "확인/저장"}
            </span>
            {s < 3 && <div className={`w-12 h-0.5 ${step > s ? "bg-blue-600" : "bg-gray-200"}`} />}
          </div>
        ))}
      </div>

      {/* ============ Quick Register Tab ============ */}
      {activeTab === "quick" && step === 1 && !quickAnalysis && (
        <div className="bg-white rounded-lg border p-6 space-y-4">
          <div>
            <Label className="text-base font-semibold">지출 내용을 입력하세요</Label>
            <textarea
              className="w-full mt-2 border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-blue-500"
              rows={2}
              placeholder='예: "현수막 제작 30만원 OO간판점 4/10 카드"'
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">금액, 날짜, 결제수단, 거래처를 자동으로 추출합니다</p>
          </div>

          <div>
            <Label>첨부파일 (선택)</Label>
            <Input type="file" accept="image/*,application/pdf" className="mt-1"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) { setQuickFile(null); return; }
                const reader = new FileReader();
                reader.onload = () => {
                  setQuickFile({ name: file.name, type: file.type, base64: (reader.result as string).split(",")[1] });
                };
                reader.readAsDataURL(file);
              }} />
            {quickFile && <p className="text-xs text-green-600 mt-1">{quickFile.name} (OCR로 교차검증됩니다)</p>}
          </div>

          <Button onClick={handleQuickAnalyze} disabled={!inputText.trim() || analyzing}
            className="w-full bg-[#D4883A] hover:bg-[#E8A45C] text-white">
            {analyzing ? "분석 중..." : "자동 분석하기"}
          </Button>
        </div>
      )}

      {/* Quick analysis → OCR comparison (if available) */}
      {activeTab === "quick" && quickAnalysis && step === 3 && !saveResult && quickAnalysis.ocrComparison && (
        <div className="bg-white rounded-lg border p-4 space-y-2">
          <p className="text-sm font-semibold text-gray-700">OCR 교차검증</p>
          <div className="text-sm space-y-1">
            {quickAnalysis.ocrComparison.amount.ocr > 0 && (
              <div className="flex items-center gap-2">
                <span className={quickAnalysis.ocrComparison.amount.match ? "text-green-600" : "text-amber-600"}>
                  {quickAnalysis.ocrComparison.amount.match ? "✓" : "⚠"}
                </span>
                <span className="text-gray-500">금액:</span>
                <span>{fmt(quickAnalysis.ocrComparison.amount.ocr)}원</span>
                {!quickAnalysis.ocrComparison.amount.match && (
                  <button className="text-xs text-blue-600 underline"
                    onClick={() => setForm({ ...form, acc_amt: quickAnalysis.ocrComparison!.amount.ocr })}>
                    OCR 값 사용
                  </button>
                )}
              </div>
            )}
            {quickAnalysis.ocrComparison.customer.ocr && (
              <div className="flex items-center gap-2">
                <span className={quickAnalysis.ocrComparison.customer.match ? "text-green-600" : "text-amber-600"}>
                  {quickAnalysis.ocrComparison.customer.match ? "✓" : "⚠"}
                </span>
                <span className="text-gray-500">거래처:</span>
                <span>{quickAnalysis.ocrComparison.customer.ocr}</span>
                {quickAnalysis.ocrResult?.regNum && (
                  <span className="text-xs text-gray-400">(사업자번호: {quickAnalysis.ocrResult.regNum})</span>
                )}
              </div>
            )}
            {quickAnalysis.ocrComparison.date.ocr && (
              <div className="flex items-center gap-2">
                <span className={quickAnalysis.ocrComparison.date.match ? "text-green-600" : "text-amber-600"}>
                  {quickAnalysis.ocrComparison.date.match ? "✓" : "⚠"}
                </span>
                <span className="text-gray-500">날짜:</span>
                <span>{quickAnalysis.ocrComparison.date.ocr}</span>
                {!quickAnalysis.ocrComparison.date.match && (
                  <button className="text-xs text-blue-600 underline"
                    onClick={() => setForm({ ...form, acc_date: quickAnalysis.ocrComparison!.date.ocr })}>
                    OCR 날짜로 변경
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick analysis → Customer match status */}
      {activeTab === "quick" && quickAnalysis?.customerMatch && step === 3 && !saveResult && (
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm ${
          quickAnalysis.customerMatch.matched
            ? "bg-green-50 text-green-700"
            : "bg-blue-50 text-blue-700"
        }`}>
          {quickAnalysis.customerMatch.matched ? (
            <>
              <span>✓</span>
              <span>기존 거래처 매칭</span>
            </>
          ) : quickAnalysis.customerMatch.ocrData?.regNum ? (
            <>
              <span>ⓘ</span>
              <span>신규 거래처 — 등록 시 자동 생성 (사업자번호: {quickAnalysis.customerMatch.ocrData.regNum})</span>
            </>
          ) : (
            <>
              <span>ⓘ</span>
              <span>신규 거래처 — 이름으로 자동 생성</span>
            </>
          )}
        </div>
      )}

      {/* Quick analysis → confidence badge */}
      {activeTab === "quick" && quickAnalysis && step === 3 && !saveResult && (
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm ${
          quickAnalysis.inferred.confidence >= 0.7 ? "bg-green-50 text-green-700" :
          quickAnalysis.inferred.confidence >= 0.5 ? "bg-yellow-50 text-yellow-700" :
          "bg-red-50 text-red-700"
        }`}>
          <span className="font-semibold">매칭 신뢰도: {Math.round(quickAnalysis.inferred.confidence * 100)}%</span>
          {quickAnalysis.inferred.confidence < 0.5 && <span>— 지출유형을 확인해주세요</span>}
        </div>
      )}

      {/* Mode toggle */}
      {step === 1 && !showStep1_5 && activeTab === "card" && (
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
      {step === 1 && !showStep1_5 && activeTab === "card" && (
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-lg font-semibold">어떤 종류의 {isExpense ? "지출" : "수입"}인가요?</p>
          </div>

          {/* 첫 방문 안내 */}
          {!guideDismissed && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-gray-600 flex items-start gap-2">
              <span className="shrink-0">💡</span>
              <span>거래 종류를 선택하면 복잡한 계정·과목을 시스템이 자동으로 설정합니다. 카드를 골라보세요!</span>
              <button onClick={dismissGuide} className="shrink-0 text-gray-400 hover:text-gray-600 text-xs ml-auto">✕</button>
            </div>
          )}

          {/* 검색 */}
          <div className="max-w-sm mx-auto">
            <Input
              placeholder="키워드로 검색 (예: 현수막, 명함, 전기세)"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
            />
          </div>

          {/* 빈 검색 결과 메시지 */}
          {searchKeyword && matchedIds.size === 0 && (
            <p className="text-center text-sm text-gray-500">
              &apos;{searchKeyword}&apos;에 맞는 항목이 없습니다. &apos;기타&apos;를 선택하거나 다른 키워드를 시도하세요.
            </p>
          )}

          {/* 카드 그리드 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3" role="radiogroup" aria-label="거래 유형 선택">
            {types.map((type) => {
              const isMatch = matchedIds.has(type.id);
              return (
                <button
                  key={type.id}
                  role="radio"
                  aria-checked={selectedType?.id === type.id}
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

      {/* ============ Step 1.5: 기타 → 지출유형 직접 선택 ============ */}
      {step === 1 && showStep1_5 && selectedType && (
        <div className="bg-white rounded-lg border p-6 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">{selectedType.icon}</span>
            <div>
              <h3 className="font-bold text-lg">어떤 종류의 지출인지 선택해주세요</h3>
              <p className="text-sm text-gray-500">지출유형을 선택하면 과목이 자동으로 설정됩니다</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-sm">지출유형1</Label>
              <select className="w-full mt-1 border rounded px-3 py-2 text-sm" value={autoSet.exp_group1_cd}
                onChange={(e) => {
                  const newGroup1 = e.target.value;
                  const newAutoSet = { ...autoSet, exp_group1_cd: newGroup1 };
                  if (orgSecCd && newGroup1) {
                    const category = detectItemCategory(newGroup1);
                    if (category) {
                      const items = getItems(orgSecCd, 2, autoSet.acc_sec_cd);
                      const match = category === "선거비용외"
                        ? items.find((i) => i.cv_name.includes("선거비용외"))
                        : items.find((i) => i.cv_name.includes("선거비용") && !i.cv_name.includes("선거비용외"));
                      if (match) newAutoSet.item_sec_cd = match.cv_id;
                    }
                  }
                  setAutoSet(newAutoSet);
                  setForm({ ...form, exp_group2_cd: "", exp_group3_cd: "" });
                }}>
                <option value="">선택</option>
                {allExpTypes.map((t) => {
                  const cat = detectItemCategory(t.label);
                  const suffix = cat ? ` (${cat})` : "";
                  return <option key={t.label} value={t.label}>{t.label}{suffix}</option>;
                })}
              </select>
            </div>
            <div>
              <Label className="text-sm">지출유형2</Label>
              <select className="w-full mt-1 border rounded px-3 py-2 text-sm" value={form.exp_group2_cd}
                onChange={(e) => setForm({ ...form, exp_group2_cd: e.target.value, exp_group3_cd: "" })}
                disabled={!autoSet.exp_group1_cd}>
                <option value="">선택</option>
                {level2Items.map((t) => <option key={t.label} value={t.label}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-sm">지출유형3</Label>
              <select className="w-full mt-1 border rounded px-3 py-2 text-sm" value={form.exp_group3_cd}
                onChange={(e) => setForm({ ...form, exp_group3_cd: e.target.value })}
                disabled={!form.exp_group2_cd || level3Items.length === 0}>
                <option value="">{level3Items.length === 0 ? "-" : "선택"}</option>
                {level3Items.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>

          <p className="text-xs text-gray-500">💡 잘 모르겠다면 &quot;선거사무소 &gt; 기타&quot;를 선택하세요</p>

          <div className="flex justify-between pt-4 border-t">
            <Button variant="outline" onClick={() => { setShowStep1_5(false); setSelectedType(null); }}>
              ← 이전
            </Button>
            <Button onClick={handleStep1_5Next} disabled={!autoSet.exp_group1_cd}>
              다음 →
            </Button>
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
                onChange={(e) => {
                  setForm({ ...form, acc_amt: Number(e.target.value) });
                  if (validationErrors.acc_amt) setValidationErrors({ ...validationErrors, acc_amt: undefined });
                }}
                placeholder="금액 입력"
                inputMode="numeric"
                className={validationErrors.acc_amt ? "border-red-500" : ""} />
              {validationErrors.acc_amt && <p className="text-xs text-red-600 mt-1">{validationErrors.acc_amt}</p>}
              {!validationErrors.acc_amt && form.acc_amt > 0 && (
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
                onChange={(e) => {
                  setForm({ ...form, content: e.target.value });
                  if (validationErrors.content) setValidationErrors({ ...validationErrors, content: undefined });
                }}
                placeholder={`${isExpense ? "지출" : "수입"} 내역을 입력하세요`}
                className={validationErrors.content ? "border-red-500" : ""} />
              {validationErrors.content && <p className="text-xs text-red-600 mt-1">{validationErrors.content}</p>}
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
            <Button variant="outline" onClick={() => {
              if (selectedType?.id === "other-expense" || selectedType?.id === "other-income") {
                setStep(1);
                setShowStep1_5(true);
              } else {
                setStep(1);
                setSelectedType(null);
              }
            }}>
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
      {step === 3 && selectedType && !saveResult && (
        <div className="bg-white rounded-lg border p-6 space-y-4">
          <h3 className="font-bold text-lg">등록 내용을 확인하세요</h3>

          {/* 자동 설정값 (수정 가능) */}
          <div className="bg-blue-50 rounded-lg p-4 space-y-3">
            <p className="text-sm font-semibold text-blue-700">자동 설정 (수정 가능)</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <CodeSelect label="계정" value={autoSet.acc_sec_cd}
                  onChange={(v) => setAutoSet({ ...autoSet, acc_sec_cd: v, item_sec_cd: 0 })}
                  options={accountOptions} placeholder="계정" />
                {validationErrors.acc_sec_cd && <p className="text-xs text-red-600 mt-1">{validationErrors.acc_sec_cd}</p>}
              </div>
              <div>
                <CodeSelect label="과목" value={autoSet.item_sec_cd}
                  onChange={(v) => setAutoSet({ ...autoSet, item_sec_cd: v })}
                  options={itemOptions} placeholder="과목" disabled={!autoSet.acc_sec_cd} />
                {validationErrors.item_sec_cd && <p className="text-xs text-red-600 mt-1">{validationErrors.item_sec_cd}</p>}
              </div>
            </div>

            {/* 지출유형 (기타가 아닌 경우 Step 3에서 수정 가능) */}
            {isExpense && allExpTypes.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">지출유형1</Label>
                  <select className="w-full border rounded px-2 py-1.5 text-sm" value={autoSet.exp_group1_cd}
                    onChange={(e) => {
                      const newGroup1 = e.target.value;
                      const newAutoSet = { ...autoSet, exp_group1_cd: newGroup1 };
                      if (orgSecCd && newGroup1) {
                        const category = detectItemCategory(newGroup1);
                        if (category) {
                          const items = getItems(orgSecCd, 2, autoSet.acc_sec_cd);
                          const match = category === "선거비용외"
                            ? items.find((i) => i.cv_name.includes("선거비용외"))
                            : items.find((i) => i.cv_name.includes("선거비용") && !i.cv_name.includes("선거비용외"));
                          if (match) newAutoSet.item_sec_cd = match.cv_id;
                        }
                      }
                      setAutoSet(newAutoSet);
                      setForm({ ...form, exp_group2_cd: "", exp_group3_cd: "" });
                    }}>
                    <option value="">선택</option>
                    {allExpTypes.map((t) => {
                      const cat = detectItemCategory(t.label);
                      const suffix = cat ? ` (${cat})` : "";
                      return <option key={t.label} value={t.label}>{t.label}{suffix}</option>;
                    })}
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

            {/* 보전 여부 자동 판별 */}
            {isExpense && (() => {
              const reimbursement = getReimbursementStatus(itemName, autoSet.exp_group1_cd, form.exp_group2_cd);
              const colors = {
                "보전": "bg-green-50 border-green-200 text-green-700",
                "미보전": "bg-red-50 border-red-200 text-red-700",
                "선거비용외": "bg-gray-50 border-gray-200 text-gray-600",
                "판별불가": "bg-yellow-50 border-yellow-200 text-yellow-700",
              };
              const icons = { "보전": "✓", "미보전": "✕", "선거비용외": "—", "판별불가": "?" };
              return (
                <div className={`flex items-start gap-2 p-3 rounded-md border text-sm ${colors[reimbursement.status]}`}>
                  <span className="font-bold shrink-0">{icons[reimbursement.status]}</span>
                  <div>
                    <span className="font-semibold">보전 여부: {reimbursement.status}</span>
                    <p className="text-xs mt-0.5 opacity-80">{reimbursement.reason}</p>
                  </div>
                </div>
              );
            })()}
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
            <Button variant="outline" onClick={() => {
              if (activeTab === "quick") {
                setStep(1);
                setQuickAnalysis(null);
              } else {
                setStep(2);
              }
            }}>
              ← {activeTab === "quick" ? "다시 입력" : "이전"}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "저장 중..." : "등록하기"}
            </Button>
          </div>
        </div>
      )}

      {/* ============ Save Result Banners ============ */}
      {saveResult?.status === "success" && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 space-y-4" role="alert">
          <div className="flex items-center gap-2 text-green-700 font-semibold">
            <span className="text-xl">✓</span>
            <span>등록이 완료되었습니다!</span>
          </div>
          <div className="bg-white rounded border border-green-100 p-3 text-sm text-gray-700">
            {saveResult.summary}
          </div>
          <div className="flex gap-3">
            <Button onClick={resetWizard}>추가 등록하기</Button>
            <Button variant="outline" onClick={() => router.push(isExpense ? "/dashboard/expense" : "/dashboard/income")}>
              {isExpense ? "지출" : "수입"}내역 보기
            </Button>
          </div>
        </div>
      )}

      {saveResult?.status === "partial" && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 space-y-4" role="alert">
          <div className="flex items-center gap-2 text-amber-700 font-semibold">
            <span className="text-xl">⚠</span>
            <span>등록은 완료되었으나 일부 문제가 있습니다</span>
          </div>
          <div className="bg-white rounded border border-amber-100 p-3 text-sm text-gray-700">
            {saveResult.summary}
          </div>
          <p className="text-sm text-amber-700">{saveResult.warning}</p>
          <div className="flex gap-3">
            <Button onClick={resetWizard}>추가 등록하기</Button>
            <Button variant="outline" onClick={() => router.push(isExpense ? "/dashboard/expense" : "/dashboard/income")}>
              {isExpense ? "지출" : "수입"}내역 보기
            </Button>
          </div>
        </div>
      )}

      {saveResult?.status === "error" && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 space-y-4" role="alert">
          <div className="flex items-center gap-2 text-red-700 font-semibold">
            <span className="text-xl">✕</span>
            <span>저장에 실패했습니다</span>
          </div>
          <p className="text-sm text-red-600">{saveResult.message}</p>
          <div className="flex gap-3">
            <Button onClick={() => { setSaveResult(null); handleSave(); }}>다시 시도</Button>
            <Button variant="outline" onClick={() => setSaveResult(null)}>돌아가기</Button>
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
