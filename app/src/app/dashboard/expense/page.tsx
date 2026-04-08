"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { useCodeValues } from "@/hooks/use-code-values";
import { useUndo } from "@/hooks/use-undo";
import { useSort, SortTh } from "@/hooks/use-sort";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpTooltip } from "@/components/help-tooltip";
import { CodeSelect } from "@/components/code-select";
import { CustomerSearchDialog } from "@/components/customer-search-dialog";
import { AccBookSearch, applyFiltersToQuery, type SearchFilters } from "@/components/acc-book-search";

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
  acc_sort_num: number | null;
  acc_ins_type: string | null;
  bigo: string | null;
  exp_type_cd: number | null;
  exp_group1_cd: string | null;
  exp_group2_cd: string | null;
  exp_group3_cd: string | null;
  customer?: { name: string | null } | null;
}

/* ------------------------------------------------------------------ */
/*  3-level expense type data (지출유형 3단계)                          */
/* ------------------------------------------------------------------ */

interface ExpType2 {
  label: string;
  level3: string[];
}

interface ExpType1 {
  label: string;
  level2: ExpType2[];
}

// 선거비용 지출유형 (원본 프로그램 반영)
const ELECTION_EXP_TYPES: ExpType1[] = [
  {
    label: "인쇄물",
    level2: [
      { label: "선거벽보", level3: ["기획/도안료", "인쇄비", "운송비", "기타"] },
      { label: "선거공보", level3: ["기획/도안료", "인쇄비", "운송비", "기타"] },
      { label: "선거공약서", level3: ["기획/도안료", "인쇄비", "운송비", "기타"] },
      { label: "후보자사진", level3: ["촬영비", "기타"] },
      { label: "명함", level3: ["인쇄비", "기타"] },
      { label: "예비후보자홍보물", level3: ["기획/도안료", "인쇄비", "우편요금", "기타"] },
    ],
  },
  {
    label: "광고",
    level2: [
      { label: "신문광고", level3: ["광고료", "기획/도안료", "기타"] },
      { label: "TV광고", level3: ["광고료", "기획/도안료", "제작비", "기타"] },
      { label: "라디오방송광고", level3: ["광고료", "기획/도안료", "제작비", "기타"] },
      { label: "인터넷광고", level3: ["광고료", "기획/도안료", "동영상제작비", "배너/팝업제작비", "대행수수료", "기타"] },
    ],
  },
  {
    label: "방송연설",
    level2: [
      { label: "TV방송연설", level3: ["시설이용료", "제작비", "기획/도안료", "기타"] },
      { label: "라디오방송연설", level3: ["시설이용료", "제작비", "기획/도안료", "기타"] },
    ],
  },
  {
    label: "소품",
    level2: [
      { label: "어깨띠", level3: ["제작비", "기타"] },
      { label: "윗옷", level3: ["구입비", "기호등인쇄비", "기타"] },
      { label: "모자", level3: ["구입비", "기호등인쇄비", "기타"] },
      { label: "소품", level3: ["구입/임차비", "기타"] },
    ],
  },
  {
    label: "거리게시용현수막",
    level2: [
      { label: "거리게시용현수막", level3: ["제작비", "이동게시비", "장비임차료", "기타"] },
    ],
  },
  {
    label: "공개장소연설대담",
    level2: [
      { label: "차량", level3: ["임차비", "유류비", "기사인부임", "임차비(유류비/기사인부임포함)", "기타"] },
      { label: "무대연단", level3: ["설치/철거비", "홍보물설치관련", "기획/도안료", "기타"] },
      { label: "확성장치", level3: ["차량용임차비", "휴대용임차비", "기타"] },
      { label: "래핑비", level3: ["설치/철거비", "기타"] },
      { label: "발전기", level3: ["발전기임차비", "인버터임차비", "기타"] },
      { label: "녹화기", level3: ["LED전광판임차비", "녹화물제작비", "녹화물기획도안료", "기타"] },
      { label: "로고송", level3: ["제작비", "저작권료", "인격권료", "기타"] },
      { label: "수화통역자", level3: ["인건비", "기타"] },
      { label: "그밖의선거운동", level3: ["녹음기", "LED문자전광판/간판", "기타"] },
    ],
  },
  {
    label: "전화/전자우편/문자메시지",
    level2: [
      { label: "전화/인터넷포함", level3: ["설치비", "통화요금", "임차비", "기타"] },
      { label: "문자메시지", level3: ["발송비", "장비임차료", "기타"] },
      { label: "전자우편", level3: ["발송비", "SNS전송용동영상제작비", "기타"] },
    ],
  },
  {
    label: "선거사무관계자",
    level2: [
      { label: "선거사무관계자수당", level3: ["선거사무장", "선거연락소장", "회계책임자", "선거사무원", "활동보조인"] },
      { label: "동행자식대", level3: ["식대"] },
    ],
  },
  {
    label: "그밖의선거운동",
    level2: [
      { label: "그밖의선거운동", level3: ["홈페이지개설운영비", "인터넷홈페이지/문비발급", "기타"] },
    ],
  },
  {
    label: "선거사무소",
    level2: [
      { label: "간판", level3: ["제작비", "장비임차", "기타"] },
      { label: "현판", level3: ["제작비", "기타"] },
      { label: "현수막", level3: ["제작비", "장비임차", "로프이용료", "기타"] },
      { label: "유지비용", level3: ["수도요금", "전기요금", "기타"] },
      { label: "옥상구조물", level3: ["제작비", "기타"] },
    ],
  },
  {
    label: "기타",
    level2: [
      { label: "위법비용", level3: ["위법비용"] },
    ],
  },
];

// 선거비용외 지출유형 (원본 프로그램 반영)
const NON_ELECTION_EXP_TYPES: ExpType1[] = [
  {
    label: "선거사무소",
    level2: [
      { label: "임차보증금", level3: [] },
      { label: "사무집기류임차비", level3: [] },
      { label: "소모품구입비", level3: [] },
      { label: "내외부설치유지비", level3: [] },
      { label: "인건비", level3: [] },
      { label: "개소식관련", level3: ["다과비", "초대장발송비", "기타"] },
      { label: "기타", level3: [] },
      { label: "유지비용", level3: ["관리비"] },
    ],
  },
  {
    label: "납부금",
    level2: [
      { label: "기탁금", level3: [] },
      { label: "세대부명단교부비", level3: [] },
      { label: "기타", level3: [] },
    ],
  },
  {
    label: "예비후보자공약집",
    level2: [
      { label: "예비후보자공약집", level3: [] },
    ],
  },
  {
    label: "기타차량",
    level2: [
      { label: "선거벽보/공보/공약서부착차량", level3: ["임차비", "유류비", "기사인건비", "기타"] },
      { label: "후보자승용자동차", level3: ["임차비", "유류비", "기사인건비", "기타"] },
    ],
  },
  {
    label: "후보자등숙박비",
    level2: [
      { label: "숙박비", level3: [] },
    ],
  },
  {
    label: "선거운동준비비용",
    level2: [
      { label: "컨설팅비용", level3: [] },
      { label: "여론조사비용", level3: [] },
      { label: "기타", level3: [] },
    ],
  },
  {
    label: "기타",
    level2: [
      { label: "기타", level3: [] },
    ],
  },
];

/** 과목명으로 지출유형 데이터 반환 */
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
  { value: "121", label: "미지급" },
  { value: "122", label: "기타" },
];

export default function ExpensePage() {
  const supabase = createSupabaseBrowser();
  const { orgId, orgSecCd, orgType } = useAuth();
  const {
    loading: codesLoading,
    getName,
    getAccounts,
    getItems,
    getExpenseCategories,
  } = useCodeValues();

  const [records, setRecords] = useState<AccBook[]>([]);
  const [selected, setSelected] = useState<AccBook | null>(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState({ income: 0, expense: 0, balance: 0 });
  const [filteredTotal, setFilteredTotal] = useState({ amount: 0, count: 0 });
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [customerDialogMode, setCustomerDialogMode] = useState<"search" | "register">("search");
  const [selectedCustomerName, setSelectedCustomerName] = useState("");
  const [activeFilters, setActiveFilters] = useState<SearchFilters | null>(null);
  const [searchAccSecCd, setSearchAccSecCd] = useState(0);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [evidenceFile, setEvidenceFile] = useState<{ name: string; type: string; base64: string } | null>(null);

  // Search dropdown options
  const searchAccountOptions = orgSecCd ? getAccounts(orgSecCd, 2) : [];
  const searchItemOptions =
    orgSecCd && searchAccSecCd ? getItems(orgSecCd, 2, searchAccSecCd) : [];

  const [form, setForm] = useState({
    acc_sec_cd: 0,
    item_sec_cd: 0,
    exp_sec_cd: 0,
    acc_date: "",
    acc_amt: 0,
    cust_id: 0,
    content: "",
    rcp_yn: "Y",
    rcp_no: "",
    acc_ins_type: "118",
    bigo: "",
    exp_group1_cd: "",
    exp_group2_cd: "",
    exp_group3_cd: "",
  });

  // ACC_REL 기반 드롭다운 옵션
  const accountOptions = orgSecCd ? getAccounts(orgSecCd, 2) : [];
  const itemOptions =
    orgSecCd && form.acc_sec_cd ? getItems(orgSecCd, 2, form.acc_sec_cd) : [];
  const expCategoryOptions =
    orgSecCd && form.acc_sec_cd && form.item_sec_cd
      ? getExpenseCategories(orgSecCd, form.acc_sec_cd, form.item_sec_cd)
      : [];

  // 정당만 경비구분 표시
  const showExpCategory = orgType === "party" && expCategoryOptions.length > 0;

  async function loadRecords(filters?: SearchFilters | null) {
    if (!orgId) return;
    setLoading(true);
    const sb = createSupabaseBrowser();
    let query = sb.from("acc_book").select("*, customer:cust_id(name)")
      .eq("org_id", orgId).eq("incm_sec_cd", 2);
    if (filters) query = applyFiltersToQuery(query, filters);

    const { data } = await query.order("acc_date").order("acc_sort_num").limit(100000);
    const recs = data || [];
    setRecords(recs);
    setFilteredTotal({ amount: recs.reduce((s: number, r: AccBook) => s + r.acc_amt, 0), count: recs.length });

    const { data: allData } = await sb.from("acc_book").select("incm_sec_cd, acc_amt").eq("org_id", orgId).limit(100000);
    if (allData) {
      const inc = allData.filter((r) => r.incm_sec_cd === 1).reduce((s, r) => s + r.acc_amt, 0);
      const exp = allData.filter((r) => r.incm_sec_cd === 2).reduce((s, r) => s + r.acc_amt, 0);
      setSummary({ income: inc, expense: exp, balance: inc - exp });
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!orgId) return;
    const sb = createSupabaseBrowser();
    Promise.all([
      sb.from("acc_book").select("*, customer:cust_id(name)").eq("org_id", orgId).eq("incm_sec_cd", 2)
        .order("acc_date").order("acc_sort_num").limit(100000),
      sb.from("acc_book").select("incm_sec_cd, acc_amt").eq("org_id", orgId).limit(100000),
    ]).then(([recRes, sumRes]) => {
      const recs = recRes.data || [];
      setRecords(recs);
      setFilteredTotal({ amount: recs.reduce((s: number, r: { acc_amt: number }) => s + r.acc_amt, 0), count: recs.length });
      if (sumRes.data) {
        const inc = sumRes.data.filter((r) => r.incm_sec_cd === 1).reduce((s, r) => s + r.acc_amt, 0);
        const exp = sumRes.data.filter((r) => r.incm_sec_cd === 2).reduce((s, r) => s + r.acc_amt, 0);
        setSummary({ income: inc, expense: exp, balance: inc - exp });
      }
      setLoading(false);
    });
  }, [orgId]);

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
    window.open(`/api/excel/export?orgId=${orgId}&type=expense`, "_blank");
  }

  async function handleBatchReceiptGen() {
    if (!orgId) return;
    const { data: targets } = await supabase
      .from("acc_book")
      .select("acc_book_id")
      .eq("org_id", orgId)
      .eq("incm_sec_cd", 2)
      .eq("rcp_yn", "Y")
      .or("rcp_no.is.null,rcp_no.eq.")
      .order("acc_date")
      .order("acc_sort_num");

    if (!targets || targets.length === 0) {
      alert("영수증번호를 일괄 생성할 대상이 없습니다.");
      return;
    }

    const { data: maxRcp } = await supabase
      .from("acc_book")
      .select("rcp_no2")
      .eq("org_id", orgId)
      .eq("incm_sec_cd", 2)
      .not("rcp_no", "is", null)
      .not("rcp_no", "eq", "")
      .order("rcp_no2", { ascending: false })
      .limit(1);

    let startNum = 1;
    if (maxRcp && maxRcp.length > 0 && maxRcp[0].rcp_no2) {
      startNum = maxRcp[0].rcp_no2 + 1;
    }

    if (!confirm(`${targets.length}건에 영수증번호 ${startNum}부터 부여합니다.`)) return;

    for (let i = 0; i < targets.length; i++) {
      const num = startNum + i;
      await supabase
        .from("acc_book")
        .update({ rcp_no: String(num), rcp_no2: num })
        .eq("acc_book_id", targets[i].acc_book_id);
    }

    alert(`${targets.length}건에 영수증번호를 부여했습니다.`);
    loadRecords(activeFilters);
  }

  async function handleBatchReceiptDel() {
    if (!orgId) return;
    if (!confirm("모든 지출내역의 증빙서번호를 제거합니다.\n이 작업은 복구할 수 없습니다.\n\n계속하시겠습니까?")) return;

    const { error } = await supabase
      .from("acc_book")
      .update({ rcp_no: null, rcp_no2: 0 })
      .eq("org_id", orgId)
      .eq("incm_sec_cd", 2);

    if (error) { alert(`실패: ${error.message}`); return; }
    alert("모든 지출내역의 증빙서번호가 제거되었습니다.");
    loadRecords(activeFilters);
  }

  function resetForm() {
    setSelected(null);
    setSelectedCustomerName("");
    setEvidenceFile(null);
    setForm({
      acc_sec_cd: 0,
      item_sec_cd: 0,
      exp_sec_cd: 0,
      acc_date: "",
      acc_amt: 0,
      cust_id: 0,
      content: "",
      rcp_yn: "Y",
      rcp_no: "",
      acc_ins_type: "118",
      bigo: "",
      exp_group1_cd: "",
      exp_group2_cd: "",
      exp_group3_cd: "",
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
      exp_sec_cd: r.exp_sec_cd,
      acc_date:
        r.acc_date.length === 8
          ? `${r.acc_date.slice(0, 4)}-${r.acc_date.slice(4, 6)}-${r.acc_date.slice(6, 8)}`
          : r.acc_date,
      acc_amt: r.acc_amt,
      cust_id: r.cust_id,
      content: r.content,
      rcp_yn: r.rcp_yn,
      rcp_no: r.rcp_no || "",
      acc_ins_type: r.acc_ins_type || "118",
      bigo: r.bigo || "",
      exp_group1_cd: r.exp_group1_cd || "",
      exp_group2_cd: r.exp_group2_cd || "",
      exp_group3_cd: r.exp_group3_cd || "",
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
      alert("지출일자를 입력하세요.");
      return;
    }
    if (form.acc_amt === 0) {
      alert("지출금액을 입력하세요.");
      return;
    }
    if (!form.content.trim()) {
      alert("지출내역을 입력하세요.");
      return;
    }

    // (예비)후보자/국회의원은 지출유형 필수
    if (
      (orgType === "candidate" || orgType === "lawmaker") &&
      !form.exp_group1_cd
    ) {
      alert(
        "(예비)후보자/국회의원은 지출유형(대분류)을 필수로 입력해야 합니다."
      );
      return;
    }

    const payload = {
      org_id: orgId,
      incm_sec_cd: 2,
      acc_sec_cd: form.acc_sec_cd,
      item_sec_cd: form.item_sec_cd,
      exp_sec_cd: form.exp_sec_cd,
      cust_id: form.cust_id || -999,
      acc_date: form.acc_date.replace(/-/g, ""),
      content: form.content,
      acc_amt: form.acc_amt,
      rcp_yn: form.rcp_yn,
      rcp_no: form.rcp_no || null,
      acc_ins_type: form.acc_ins_type || null,
      bigo: form.bigo || null,
      exp_group1_cd: form.exp_group1_cd || null,
      exp_group2_cd: form.exp_group2_cd || null,
      exp_group3_cd: form.exp_group3_cd || null,
    };

    if (selected) {
      await supabase.from("acc_book_bak").insert({
        work_kind: 1,
        acc_book_id: selected.acc_book_id,
        org_id: selected.org_id,
        incm_sec_cd: selected.incm_sec_cd,
        acc_sec_cd: selected.acc_sec_cd,
        item_sec_cd: selected.item_sec_cd,
        exp_sec_cd: selected.exp_sec_cd,
        cust_id: selected.cust_id,
        acc_date: selected.acc_date,
        content: selected.content,
        acc_amt: selected.acc_amt,
        rcp_yn: selected.rcp_yn,
        rcp_no: selected.rcp_no,
      });
      const { error } = await supabase
        .from("acc_book")
        .update(payload)
        .eq("acc_book_id", selected.acc_book_id);
      if (error) {
        alert(`수정 실패: ${error.message}`);
        return;
      }
    } else {
      const { data: inserted, error } = await supabase.from("acc_book").insert(payload).select("acc_book_id").single();
      if (error) {
        alert(`등록 실패: ${error.message}`);
        return;
      }
      // 증빙파일 업로드
      if (evidenceFile && inserted?.acc_book_id) {
        await fetch("/api/evidence-file", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accBookId: inserted.acc_book_id,
            orgId,
            fileName: evidenceFile.name,
            fileType: evidenceFile.type,
            fileData: evidenceFile.base64,
          }),
        });
      }
    }
    resetForm();
    loadRecords(activeFilters);
  }

  async function handleDelete() {
    if (!selected) return;
    if (!confirm("선택한 지출내역을 삭제하시겠습니까?")) return;
    await supabase.from("acc_book_bak").insert({
      work_kind: 2,
      acc_book_id: selected.acc_book_id,
      org_id: selected.org_id,
      incm_sec_cd: selected.incm_sec_cd,
      acc_sec_cd: selected.acc_sec_cd,
      item_sec_cd: selected.item_sec_cd,
      exp_sec_cd: selected.exp_sec_cd,
      cust_id: selected.cust_id,
      acc_date: selected.acc_date,
      content: selected.content,
      acc_amt: selected.acc_amt,
      rcp_yn: selected.rcp_yn,
      rcp_no: selected.rcp_no,
    });
    const { error } = await supabase
      .from("acc_book")
      .delete()
      .eq("acc_book_id", selected.acc_book_id);
    if (error) {
      alert(`삭제 실패: ${error.message}`);
      return;
    }
    resetForm();
    loadRecords(activeFilters);
  }

  async function handleBatchDelete() {
    if (checkedIds.size === 0) return;
    if (!confirm(`선택한 ${checkedIds.size}건의 지출내역을 삭제하시겠습니까?`)) return;

    const toDelete = records.filter((r) => checkedIds.has(r.acc_book_id));
    for (const r of toDelete) {
      await supabase.from("acc_book_bak").insert({
        work_kind: 2, acc_book_id: r.acc_book_id, org_id: r.org_id,
        incm_sec_cd: r.incm_sec_cd, acc_sec_cd: r.acc_sec_cd,
        item_sec_cd: r.item_sec_cd, exp_sec_cd: r.exp_sec_cd,
        cust_id: r.cust_id, acc_date: r.acc_date, content: r.content,
        acc_amt: r.acc_amt, rcp_yn: r.rcp_yn, rcp_no: r.rcp_no,
      });
    }

    const { error } = await supabase
      .from("acc_book")
      .delete()
      .in("acc_book_id", [...checkedIds]);
    if (error) { alert(`삭제 실패: ${error.message}`); return; }

    setCheckedIds(new Set());
    resetForm();
    loadRecords(activeFilters);
  }

  function toggleCheck(id: number) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleCheckAll() {
    if (checkedIds.size === records.length) setCheckedIds(new Set());
    else setCheckedIds(new Set(records.map((r) => r.acc_book_id)));
  }

  const fmt = (n: number) => n.toLocaleString("ko-KR");
  const fmtDate = (d: string) =>
    d.length === 8
      ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
      : d;

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
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">지출내역 관리</h2>
        <div className="flex gap-4 text-sm">
          <span>
            수입액:{" "}
            <b className="text-blue-600">{fmt(summary.income)}원</b>
          </span>
          <span>
            지출액:{" "}
            <b className="text-red-600">{fmt(summary.expense)}원</b>
          </span>
          <span>
            잔액:{" "}
            <b className="text-green-600">{fmt(summary.balance)}원</b>
          </span>
        </div>
      </div>

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
          <HelpTooltip id="expense.receipt-gen">
            <Button variant="outline" size="sm" onClick={handleBatchReceiptGen}>
              영수증일괄생성
            </Button>
          </HelpTooltip>
          <HelpTooltip id="expense.receipt-del">
            <Button variant="outline" size="sm" onClick={handleBatchReceiptDel}>
              영수증일괄제거
            </Button>
          </HelpTooltip>
          <HelpTooltip id="expense.book-print">
            <Button variant="outline" size="sm" onClick={handleExcelExport}>
              지출부 엑셀
            </Button>
          </HelpTooltip>
        </div>

        {/* 1행: 계정 + 과목 + (경비구분) + 지출유형1 + 지출유형2 + 지출유형3 */}
        {(() => {
          const itemName = form.item_sec_cd ? getName(form.item_sec_cd) : "";
          const expTypes = orgType !== "supporter" ? getExpTypeData(itemName) : [];
          const level2Items = expTypes.find((t) => t.label === form.exp_group1_cd)?.level2 || [];
          const level3Items = level2Items.find((t) => t.label === form.exp_group2_cd)?.level3 || [];
          const showType = expTypes.length > 0;

          return (
            <div className="grid grid-cols-[1fr_1fr_1.5fr_2fr_1.5fr] gap-3 mb-4">
              <div>
                <HelpTooltip id="income.account">
                  <CodeSelect
                    label="계정"
                    value={form.acc_sec_cd}
                    onChange={(v) =>
                      setForm({ ...form, acc_sec_cd: v, item_sec_cd: 0, exp_sec_cd: 0 })
                    }
                    options={accountOptions}
                    placeholder="계정"
                  />
                </HelpTooltip>
              </div>
              <div>
                <HelpTooltip id="income.subject">
                  <CodeSelect
                    label="과목"
                    value={form.item_sec_cd}
                    onChange={(v) => setForm({ ...form, item_sec_cd: v, exp_sec_cd: 0, exp_group1_cd: "", exp_group2_cd: "", exp_group3_cd: "" })}
                    options={itemOptions}
                    placeholder="과목"
                    disabled={!form.acc_sec_cd}
                  />
                </HelpTooltip>
              </div>
              {showType ? (
                <>
                  <div>
                    <HelpTooltip id="expense.exp-type">
                      <Label>지출유형1</Label>
                    </HelpTooltip>
                    <select
                      className="w-full mt-1 border rounded px-2 py-2 text-sm"
                      value={form.exp_group1_cd}
                      onChange={(e) =>
                        setForm({ ...form, exp_group1_cd: e.target.value, exp_group2_cd: "", exp_group3_cd: "" })
                      }
                    >
                      <option value="">선택</option>
                      {expTypes.map((t) => (
                        <option key={t.label} value={t.label}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>지출유형2</Label>
                    <select
                      className="w-full mt-1 border rounded px-2 py-2 text-sm"
                      value={form.exp_group2_cd}
                      onChange={(e) =>
                        setForm({ ...form, exp_group2_cd: e.target.value, exp_group3_cd: "" })
                      }
                      disabled={!form.exp_group1_cd}
                    >
                      <option value="">선택</option>
                      {level2Items.map((t) => (
                        <option key={t.label} value={t.label}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>지출유형3</Label>
                    <select
                      className="w-full mt-1 border rounded px-2 py-2 text-sm"
                      value={form.exp_group3_cd}
                      onChange={(e) =>
                        setForm({ ...form, exp_group3_cd: e.target.value })
                      }
                      disabled={!form.exp_group2_cd || level3Items.length === 0}
                    >
                      <option value="">{level3Items.length === 0 ? "-" : "선택"}</option>
                      {level3Items.map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <div className="col-span-3" />
              )}
            </div>
          );
        })()}

        {showExpCategory && (
          <div className="mb-4 w-48">
            <CodeSelect
              label="경비구분"
              value={form.exp_sec_cd}
              onChange={(v) => setForm({ ...form, exp_sec_cd: v })}
              options={expCategoryOptions}
              placeholder="경비"
            />
          </div>
        )}

        {/* 2행~: 나머지 입력 필드 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <Label>지출일자</Label>
            <Input
              type="date"
              value={form.acc_date}
              onChange={(e) => setForm({ ...form, acc_date: e.target.value })}
            />
          </div>

          <div>
            <Label>지출금액</Label>
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
            <HelpTooltip id="expense.target">
              <Label>지출대상자</Label>
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
            <HelpTooltip id="expense.detail">
              <Label>지출상세내역</Label>
            </HelpTooltip>
            <Input
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
            />
          </div>

          <div>
            <HelpTooltip id="expense.pay-method">
              <Label>지출방법</Label>
            </HelpTooltip>
            <select
              className="w-full mt-1 border rounded px-3 py-2 text-sm"
              value={form.acc_ins_type}
              onChange={(e) =>
                setForm({ ...form, acc_ins_type: e.target.value })
              }
            >
              {PAY_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>증빙서첨부</Label>
              <select
                className="w-full mt-1 border rounded px-3 py-2 text-sm"
                value={form.rcp_yn}
                onChange={(e) => {
                  const val = e.target.value;
                  setForm({
                    ...form,
                    rcp_yn: val,
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
                <Label>증빙서번호</Label>
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

          {/* 증빙파일 첨부 */}
          <div>
            <Label>증빙파일</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="file"
                accept="image/*,application/pdf"
                className="flex-1"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) { setEvidenceFile(null); return; }
                  const reader = new FileReader();
                  reader.onload = () => {
                    const base64 = (reader.result as string).split(",")[1];
                    setEvidenceFile({ name: file.name, type: file.type, base64 });
                  };
                  reader.readAsDataURL(file);
                }}
              />
              {evidenceFile && (
                <span className="text-xs text-green-600 whitespace-nowrap">
                  {evidenceFile.name}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">영수증/계약서 이미지 (JPG, PNG, PDF)</p>
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
              <SortTh label="지출일자" sortKey="acc_date" current={sort} onToggle={toggle} className="text-left" />
              <SortTh label="계정" sortKey="acc_sec_cd" current={sort} onToggle={toggle} className="text-left" />
              <SortTh label="과목" sortKey="item_sec_cd" current={sort} onToggle={toggle} className="text-left" />
              <SortTh label="지출대상자" sortKey="cust_id" current={sort} onToggle={toggle} className="text-left" />
              <SortTh label="내역" sortKey="content" current={sort} onToggle={toggle} className="text-left" />
              <SortTh label="금액" sortKey="acc_amt" current={sort} onToggle={toggle} className="text-right" />
              <SortTh label="지출방법" sortKey="acc_ins_type" current={sort} onToggle={toggle} className="text-left" />
              {orgType !== "supporter" && (
                <SortTh label="지출유형" sortKey="exp_group1_cd" current={sort} onToggle={toggle} className="text-left" />
              )}
              <SortTh label="증빙" sortKey="rcp_yn" current={sort} onToggle={toggle} className="text-center" />
              <SortTh label="증빙서번호/미첨부사유" sortKey="rcp_no" current={sort} onToggle={toggle} className="text-left" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={orgType !== "supporter" ? 12 : 11}
                  className="px-3 py-8 text-center text-gray-400"
                >
                  로딩 중...
                </td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td
                  colSpan={orgType !== "supporter" ? 12 : 11}
                  className="px-3 py-8 text-center text-gray-400"
                >
                  지출내역이 없습니다.
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
                  <td className="px-3 py-2">{fmtDate(r.acc_date)}</td>
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
                    {fmt(r.acc_amt)}
                  </td>
                  <td className="px-3 py-2">
                    {PAY_METHODS.find((m) => m.value === r.acc_ins_type)
                      ?.label || r.acc_ins_type}
                  </td>
                  {orgType !== "supporter" && (
                    <td className="px-3 py-2 text-gray-500">
                      {[r.exp_group1_cd, r.exp_group2_cd, r.exp_group3_cd]
                        .filter(Boolean)
                        .join(" / ")}
                    </td>
                  )}
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
                    {fmt(records.filter((r) => checkedIds.has(r.acc_book_id)).reduce((s, r) => s + r.acc_amt, 0))}원
                  </td>
                  <td colSpan={orgType !== "supporter" ? 4 : 3} />
                </tr>
              )}
              <tr className="bg-red-50 border-t-2 border-red-200">
                <td colSpan={7} className="px-3 py-2 text-right font-semibold text-sm">
                  전체 합계 ({filteredTotal.count}건)
                </td>
                <td className="px-3 py-2 text-right font-mono font-bold text-red-700">
                  {fmt(filteredTotal.amount)}원
                </td>
                <td colSpan={orgType !== "supporter" ? 4 : 3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

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
