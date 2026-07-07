"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/stores/auth";
import { useCodeValues } from "@/hooks/use-code-values";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageGuide } from "@/components/page-guide";
import { PAGE_GUIDES } from "@/lib/page-guides";
import { countOutOfPeriodRows, type OrgPeriod } from "@/lib/accounting/acc-period";
import { buildReportLedgerRecords } from "@/lib/accounting/report-ledger";
import { buildReportCombos } from "@/lib/excel-template/report-combos";
import {
  buildReportWorkbook,
  buildStandardCombos,
  buildDataCombos,
  type AccRecord,
  type Customer,
  type Estate,
} from "@/lib/excel-template/build-report-workbook";


/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function ReportsPage() {
  const { orgId, orgName, orgSecCd, orgType, acctName } = useAuth();
  const { getName, getAccounts, getItems, loading: codesLoading } = useCodeValues();

  const [covers, setCovers] = useState({
    accountCover: true,
    subjectCover: true,
  });
  const [electionName, setElectionName] = useState("");
  const [districtName, setDistrictName] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [generating, setGenerating] = useState(false);

  // 계정/과목 옵션 (ACC_REL 기반)
  const incomeAccounts = orgSecCd ? getAccounts(orgSecCd, 1) : [];
  const expenseAccounts = orgSecCd ? getAccounts(orgSecCd, 2) : [];
  const allAccountIds = [...new Set([...incomeAccounts, ...expenseAccounts].map((a) => a.cv_id))];

  // 선택 상태: 계정별, 수입 과목, 지출 과목
  const [selectedAccounts, setSelectedAccounts] = useState<Set<number>>(new Set());
  const [selectedIncomeItems, setSelectedIncomeItems] = useState<Set<number>>(new Set());
  const [selectedExpenseItems, setSelectedExpenseItems] = useState<Set<number>>(new Set());

  // 초기화: 모든 항목 선택
  useEffect(() => {
    if (allAccountIds.length === 0 || !orgSecCd) return;
    setSelectedAccounts(new Set(allAccountIds));
    const incItems = new Set<number>();
    const expItems = new Set<number>();
    for (const acc of incomeAccounts) {
      for (const item of getItems(orgSecCd, 1, acc.cv_id)) incItems.add(item.cv_id);
    }
    for (const acc of expenseAccounts) {
      for (const item of getItems(orgSecCd, 2, acc.cv_id)) expItems.add(item.cv_id);
    }
    setSelectedIncomeItems(incItems);
    setSelectedExpenseItems(expItems);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when account data loads
  }, [allAccountIds.length, orgSecCd]);

  // 수입/지출 과목 목록 (선택된 계정 기준)
  const incomeItemOptions = orgSecCd
    ? [...new Map(
        incomeAccounts
          .filter((a) => selectedAccounts.has(a.cv_id))
          .flatMap((a) => getItems(orgSecCd, 1, a.cv_id))
          .map((i) => [i.cv_id, i])
      ).values()]
    : [];
  const expenseItemOptions = orgSecCd
    ? [...new Map(
        expenseAccounts
          .filter((a) => selectedAccounts.has(a.cv_id))
          .flatMap((a) => getItems(orgSecCd, 2, a.cv_id))
          .map((i) => [i.cv_id, i])
      ).values()]
    : [];

  function toggleSet<T>(set: Set<T>, val: T): Set<T> {
    const next = new Set(set);
    if (next.has(val)) next.delete(val); else next.add(val);
    return next;
  }

  function toggleAll<T>(set: Set<T>, all: T[]): Set<T> {
    return set.size === all.length ? new Set() : new Set(all);
  }

  function handleCoverChange(key: keyof typeof covers) {
    setCovers((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  /* -------------------------------------------------------------- */
  /*  Main batch generation                                          */
  /* -------------------------------------------------------------- */
  async function handleBatchExcel() {
    if (!orgId || !dateFrom || !dateTo) {
      alert("기간을 설정하세요.");
      return;
    }
    setGenerating(true);

    try {
      const fromStr = dateFrom.replace(/-/g, "");
      const toStr = dateTo.replace(/-/g, "");

      // Fetch acc_book records via server API (bypasses RLS)
      const accRes = await fetch(
        `/api/acc-book?orgId=${orgId}&dateFrom=${fromStr}&dateTo=${toStr}`,
      );
      if (!accRes.ok) throw new Error("회계 데이터를 불러오지 못했습니다.");
      const accJson = await accRes.json();
      const records: AccRecord[] = accJson.records || [];

      if (records.length === 0) {
        alert("해당 기간에 회계 데이터가 없습니다.");
        setGenerating(false);
        return;
      }

      // FR-07: 보고 대상 거래 중 사용기관 회계기간 밖 거래(오연도 혼입 등) 경고.
      //   제출용 산출물이라 confirm 으로 표면화하고 사용자가 진행 여부를 결정한다(강제 차단 아님).
      {
        const { data: orgPeriod } = await createSupabaseBrowser()
          .from("organ")
          .select("acc_from, acc_to, pre_acc_from")
          .eq("org_id", orgId)
          .maybeSingle();
        const oop = countOutOfPeriodRows(
          records as { acc_date?: string | null }[],
          (orgPeriod ?? {}) as OrgPeriod,
        );
        if (oop.count > 0) {
          const samples = oop.samples
            .map((s) => `${s.acc_date}(${s.reason === "before" ? "기간이전" : "기간이후"})`)
            .join(", ");
          if (
            !window.confirm(
              `⚠️ 보고 대상에 사용기관 회계기간(${oop.range?.lo} ~ ${oop.range?.hi}) 밖 거래가 ${oop.count}건 있습니다.\n` +
                `다른 연도(선거주기) 거래가 섞였는지 확인하세요.${samples ? `\n예시: ${samples}` : ""}\n\n그래도 생성하시겠습니까?`,
            )
          ) {
            setGenerating(false);
            return;
          }
        }
      }

      // 후보자: 보고자료(총괄표·계정과목별 수입지출부)는 보고 시점에 (계정×과목) 분할 +
      //   영수증번호 재채번을 적용한다. income-expense-book 뷰어·api/system/export-sqlite 와
      //   동일 SSOT(buildAdjustedAccBook + fillExportReceiptNumbers) → 화면·Excel·.db 영수증번호 일치.
      //   분할/이동 조각은 신규 고유 acc_book_id 를 받아 자금원별로 올바르게 재채번된다(중복·접두사 stale 제거).
      //   acc_book(데이터)은 실거래 원본 그대로(메모리 전용 계산). 비후보자는 원본 그대로 집계.
      const reportRecords: AccRecord[] = buildReportLedgerRecords(
        records as unknown as Record<string, unknown>[],
        getName,
        orgType === "candidate",
      ) as unknown as AccRecord[];

      // Fetch this org's customers via server API (org_id 격리, bypasses RLS)
      const custRes = await fetch(`/api/customers?orgId=${orgId}`);
      if (!custRes.ok) throw new Error("수입지출처 데이터를 불러오지 못했습니다.");
      const custArr: Customer[] = await custRes.json();
      const custMap = new Map<number, Customer>();
      for (const c of custArr) custMap.set(c.cust_id, c);

      // Fetch estate via supabase browser client
      const supabase = createSupabaseBrowser();
      const { data: estateData } = await supabase
        .from("estate")
        .select("*")
        .eq("org_id", orgId)
        .order("estate_sec_cd")
        .order("estate_order");
      const estates: Estate[] = (estateData as Estate[]) || [];

      /* ---- Workbook 생성 (build-report-workbook 공용 빌더 — 마법사 GenerateStep 과 공유) ---- */
      const combos = buildReportCombos(
        buildStandardCombos(orgSecCd, getAccounts, getItems),
        buildDataCombos(reportRecords),
        { selectedAccounts, selectedIncomeItems, selectedExpenseItems },
      );

      const { buffer, sheetCount, comboCount } = await buildReportWorkbook({
        records: reportRecords,
        custMap,
        estates,
        combos,
        covers,
        orgName: orgName || "",
        orgSecCd,
        acctName,
        electionName,
        districtName,
        dateFrom,
        dateTo,
        getName,
      });

      // Download
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `보고서_${orgName}_${dateFrom}_${dateTo}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);

      alert(
        `보고서가 생성되었습니다.\n\n` +
          `총 시트 수: ${sheetCount}\n` +
          `- 총괄표 1개\n` +
          `- 재산명세서 2개\n` +
          `- 표지 1개\n` +
          (covers.accountCover
            ? `- 계정 표지 ${new Set(combos.map((c) => c.accSecCd)).size}개\n`
            : "") +
          (covers.subjectCover ? `- 과목 표지 ${comboCount}개\n` : "") +
          `- 계정/과목별 내역 ${comboCount}개 조합`,
      );
    } catch (err) {
      alert(
        `보고서 생성 실패: ${err instanceof Error ? err.message : "오류"}`,
      );
    } finally {
      setGenerating(false);
    }
  }

  function handleSingleExcel() {
    if (!orgId) return;
    window.open(`/api/excel/export?orgId=${orgId}&type=income`, "_blank");
  }

  if (codesLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        코드 데이터 로딩 중...
      </div>
    );
  }

  const chkCls = "flex items-center gap-1.5 text-sm cursor-pointer";
  const sectionCls = "bg-gray-50 rounded-lg p-3 space-y-2";
  const sectionTitleCls = "text-sm font-bold";

  return (
    <div className="space-y-6">
      <PageGuide {...PAGE_GUIDES.reports} />
      <h2 className="text-2xl font-bold">보고서 및 과목별 수입지출부 출력</h2>

      <div className="bg-white rounded-lg border p-4 space-y-5">
        {/* 기본정보 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>선거명</Label>
            <Input
              value={electionName}
              onChange={(e) => setElectionName(e.target.value)}
              placeholder="예: 제22대 국회의원선거"
            />
          </div>
          <div>
            <Label>선거구명</Label>
            <Input
              value={districtName}
              onChange={(e) => setDistrictName(e.target.value)}
              placeholder="예: 서울특별시 종로구"
            />
          </div>
        </div>

        {/* 기간 설정 */}
        <div className="flex items-center gap-2">
          <Label className="shrink-0">기간</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-44" />
          <span className="text-gray-400">~</span>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-44" />
        </div>

        {/* 3파트 선택 영역 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 파트1: 계정별 */}
          <div className={sectionCls}>
            <div className="flex items-center justify-between">
              <span className={sectionTitleCls}>계정별</span>
              <button
                className="text-xs text-blue-600 hover:underline"
                onClick={() => setSelectedAccounts(toggleAll(selectedAccounts, allAccountIds))}
              >
                {selectedAccounts.size === allAccountIds.length ? "전체해제" : "전체선택"}
              </button>
            </div>
            {[...new Map([...incomeAccounts, ...expenseAccounts].map((a) => [a.cv_id, a])).values()].map((acc) => (
              <label key={acc.cv_id} className={chkCls}>
                <input
                  type="checkbox"
                  checked={selectedAccounts.has(acc.cv_id)}
                  onChange={() => setSelectedAccounts(toggleSet(selectedAccounts, acc.cv_id))}
                />
                {acc.cv_name}
              </label>
            ))}
          </div>

          {/* 파트2: 수입 과목 */}
          <div className={sectionCls}>
            <div className="flex items-center justify-between">
              <span className={sectionTitleCls}>수입 (과목)</span>
              <button
                className="text-xs text-blue-600 hover:underline"
                onClick={() => setSelectedIncomeItems(toggleAll(selectedIncomeItems, incomeItemOptions.map((i) => i.cv_id)))}
              >
                {selectedIncomeItems.size === incomeItemOptions.length ? "전체해제" : "전체선택"}
              </button>
            </div>
            {incomeItemOptions.length === 0 ? (
              <p className="text-xs text-gray-400">계정을 먼저 선택하세요</p>
            ) : (
              incomeItemOptions.map((item) => (
                <label key={item.cv_id} className={chkCls}>
                  <input
                    type="checkbox"
                    checked={selectedIncomeItems.has(item.cv_id)}
                    onChange={() => setSelectedIncomeItems(toggleSet(selectedIncomeItems, item.cv_id))}
                  />
                  {item.cv_name}
                </label>
              ))
            )}
          </div>

          {/* 파트3: 지출 과목 */}
          <div className={sectionCls}>
            <div className="flex items-center justify-between">
              <span className={sectionTitleCls}>지출 (과목)</span>
              <button
                className="text-xs text-blue-600 hover:underline"
                onClick={() => setSelectedExpenseItems(toggleAll(selectedExpenseItems, expenseItemOptions.map((i) => i.cv_id)))}
              >
                {selectedExpenseItems.size === expenseItemOptions.length ? "전체해제" : "전체선택"}
              </button>
            </div>
            {expenseItemOptions.length === 0 ? (
              <p className="text-xs text-gray-400">계정을 먼저 선택하세요</p>
            ) : (
              expenseItemOptions.map((item) => (
                <label key={item.cv_id} className={chkCls}>
                  <input
                    type="checkbox"
                    checked={selectedExpenseItems.has(item.cv_id)}
                    onChange={() => setSelectedExpenseItems(toggleSet(selectedExpenseItems, item.cv_id))}
                  />
                  {item.cv_name}
                </label>
              ))
            )}
          </div>
        </div>

        {/* 표지 선택 */}
        <div>
          <Label className="text-sm font-semibold">표지 포함</Label>
          <div className="flex flex-wrap gap-6 mt-1">
            {[
              { key: "accountCover" as const, label: "계정표지" },
              { key: "subjectCover" as const, label: "과목표지" },
            ].map(({ key, label }) => (
              <label key={key} className={chkCls}>
                <input type="checkbox" checked={covers[key]} onChange={() => handleCoverChange(key)} />
                {label}
              </label>
            ))}
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex gap-2 pt-4 border-t">
          <Button onClick={handleBatchExcel} disabled={generating}>
            {generating ? "생성 중..." : "보고서 일괄출력 (엑셀)"}
          </Button>
          <Button variant="outline" onClick={handleSingleExcel}>
            수입부 개별출력
          </Button>
        </div>
      </div>

      {/* 안내 */}
      <div className="bg-blue-50 rounded-lg border border-blue-200 p-4 text-sm text-blue-700 space-y-1">
        <p>사용기관: <b>{orgName || "미선택"}</b></p>
        <p>계정별/수입/지출 파트를 선택하면 해당 조합의 수입지출부만 생성합니다.</p>
        <p>선택 항목: 계정 {selectedAccounts.size}개, 수입 과목 {selectedIncomeItems.size}개, 지출 과목 {selectedExpenseItems.size}개</p>
      </div>
    </div>
  );
}
