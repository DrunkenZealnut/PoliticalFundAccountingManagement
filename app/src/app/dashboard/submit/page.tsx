"use client";

import { useState, useCallback, useReducer, useRef } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { Button } from "@/components/ui/button";

const ORGAN_CRED_SESSION_KEY = "organ-credentials-candidate";

type ConflictPolicy = "overwrite" | "skip" | "merge";

interface ImportDryRunSummary {
  rowCounts: Record<string, number>;
  organCandidates: Array<{
    source: string;
    exportOrgId: number;
    org_sec_cd: number;
    org_name: string;
    reg_num: string;
  }>;
  conflictPolicy: ConflictPolicy;
}

type ImportOutcome =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "preview"; summary: ImportDryRunSummary }
  | { kind: "result"; totalImported: number; warnings: string[] }
  | { kind: "error"; message: string };

interface ImportState {
  open: boolean;
  file: File | null;
  policy: ConflictPolicy;
  outcome: ImportOutcome;
}

type ImportAction =
  | { type: "open" }
  | { type: "close" }
  | { type: "setFile"; file: File | null }
  | { type: "setPolicy"; policy: ConflictPolicy }
  | { type: "setOutcome"; outcome: ImportOutcome };

function importReducer(state: ImportState, action: ImportAction): ImportState {
  switch (action.type) {
    case "open":
      return { ...state, open: true };
    case "close":
      return { open: false, file: null, policy: "overwrite", outcome: { kind: "idle" } };
    case "setFile":
      return { ...state, file: action.file, outcome: { kind: "idle" } };
    case "setPolicy":
      return { ...state, policy: action.policy };
    case "setOutcome":
      return { ...state, outcome: action.outcome };
  }
}

const INITIAL_IMPORT_STATE: ImportState = {
  open: false,
  file: null,
  policy: "overwrite",
  outcome: { kind: "idle" },
};

export default function SubmitPage() {
  const supabase = createSupabaseBrowser();
  const router = useRouter();
  const { orgId, orgType, orgName, orgSecCd, accFrom } = useAuth();
  const [generating, setGenerating] = useState(false);
  const [stats, setStats] = useState<{
    income: number;
    expense: number;
    customers: number;        // 거래(acc_book)에 등장한 cust_id 수
    customersTotal: number;   // 전체 customer 마스터 수 (export .db에 들어가는 실제 수)
    estates: number;
  } | null>(null);

  // 회계연도 — 기본값은 organ.acc_from의 앞 4자리, 없으면 현재 연도
  const defaultYear = (accFrom && accFrom.length >= 4)
    ? accFrom.slice(0, 4)
    : String(new Date().getFullYear());
  const [exportYear, setExportYear] = useState<string>(defaultYear);
  const [exportYearMode, setExportYearMode] = useState<"all" | "year">("year");

  const [imp, dispatch] = useReducer(importReducer, INITIAL_IMPORT_STATE);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function runImport(dryRun: boolean) {
    if (!imp.file || !orgId) return;
    if (!dryRun && !confirm(`충돌 정책 '${imp.policy}'로 가져오기를 실행합니다. 계속하시겠습니까?`)) return;

    dispatch({ type: "setOutcome", outcome: { kind: "loading" } });
    try {
      const fd = new FormData();
      fd.append("file", imp.file);
      fd.append("orgId", String(orgId));
      fd.append("conflictPolicy", imp.policy);
      if (dryRun) fd.append("dryRun", "true");
      const data = await fetch("/api/system/import-sqlite", { method: "POST", body: fd })
        .then((r) => r.json());

      if (!data?.ok) {
        const msg = data?.error?.message ?? data?.error ?? (dryRun ? "미리보기 실패" : "가져오기 실패");
        const code = data?.error?.code ? ` [${data.error.code}]` : "";
        dispatch({ type: "setOutcome", outcome: { kind: "error", message: msg + code } });
      } else if (dryRun) {
        dispatch({ type: "setOutcome", outcome: { kind: "preview", summary: data.summary as ImportDryRunSummary } });
      } else {
        dispatch({
          type: "setOutcome",
          outcome: {
            kind: "result",
            totalImported: data.summary?.totalImported ?? 0,
            warnings: data.warnings ?? [],
          },
        });
      }
    } catch (e) {
      dispatch({
        type: "setOutcome",
        outcome: { kind: "error", message: e instanceof Error ? e.message : "네트워크 오류" },
      });
    }
  }

  function closeImportModal() {
    dispatch({ type: "close" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const handlePreview = useCallback(async () => {
    if (!orgId) return;

    const [incRes, expRes, custRes, custTotalRes, estRes] = await Promise.all([
      supabase
        .from("acc_book")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("incm_sec_cd", 1),
      supabase
        .from("acc_book")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("incm_sec_cd", 2),
      supabase
        .from("acc_book")
        .select("cust_id")
        .eq("org_id", orgId)
        .then(async (res) => {
          const custIds = [...new Set((res.data || []).map((r: { cust_id: number }) => r.cust_id).filter(Boolean))];
          return { count: custIds.length };
        }),
      // 전체 customer 마스터 (export .db에 실제로 들어가는 수)
      supabase
        .from("customer")
        .select("*", { count: "exact", head: true }),
      supabase
        .from("estate")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgId),
    ]);

    setStats({
      income: incRes.count || 0,
      expense: expRes.count || 0,
      customers: custRes.count || 0,
      customersTotal: custTotalRes.count || 0,
      estates: estRes.count || 0,
    });
  }, [orgId, supabase]);

  // 정당: .txt 텍스트 파일 생성
  async function handleGenerateTxt() {
    if (!orgId || !orgName) return;
    setGenerating(true);

    try {
      // Fetch data
      const [organRes, accRes, estRes] = await Promise.all([
        supabase.from("organ").select("*").eq("org_id", orgId).single(),
        supabase
          .from("acc_book")
          .select("*, customer:cust_id(name, reg_num, addr, job, tel)")
          .eq("org_id", orgId)
          .order("incm_sec_cd")
          .order("acc_sec_cd")
          .order("item_sec_cd")
          .order("acc_date"),
        supabase.from("estate").select("*").eq("org_id", orgId),
      ]);

      const organ = organRes.data;
      const records = (accRes.data || []) as Array<Record<string, unknown>>;
      const estates = (estRes.data || []) as Array<Record<string, unknown>>;

      const lines: string[] = [];
      // Header section
      lines.push(`[기관정보]`);
      lines.push(`기관명=${organ?.org_name || orgName}`);
      lines.push(`대표자=${organ?.rep_name || ""}`);
      lines.push(`회계책임자=${organ?.acct_name || ""}`);
      lines.push(`회계기간=${organ?.acc_from || ""}~${organ?.acc_to || ""}`);
      lines.push(`관할선관위=${organ?.comm || ""}`);
      lines.push(``);

      // Income/Expense records
      lines.push(`[수입지출내역]`);
      lines.push(
        `구분\t계정\t과목\t경비\t일자\t내역\t금액\t성명\t생년월일\t주소\t직업\t전화\t영수증번호`
      );

      for (const r of records) {
        const cust = r.customer as Record<string, string> | null;
        const incmType = (r.incm_sec_cd as number) === 1 ? "수입" : "지출";
        lines.push(
          [
            incmType,
            r.acc_sec_cd,
            r.item_sec_cd,
            r.exp_sec_cd,
            r.acc_date,
            r.content,
            r.acc_amt,
            cust?.name || "",
            cust?.reg_num || "",
            cust?.addr || "",
            cust?.job || "",
            cust?.tel || "",
            r.rcp_no || "",
          ].join("\t")
        );
      }

      lines.push(``);
      lines.push(`[재산내역]`);
      lines.push(`구분\t종류\t수량\t내용\t금액\t비고`);
      for (const e of estates) {
        lines.push(
          [
            e.estate_sec_cd,
            e.kind,
            e.qty,
            e.content,
            e.amt,
            e.remark || "",
          ].join("\t")
        );
      }

      // Summary
      const totalIncome = records
        .filter((r) => (r.incm_sec_cd as number) === 1)
        .reduce((s, r) => s + (r.acc_amt as number), 0);
      const totalExpense = records
        .filter((r) => (r.incm_sec_cd as number) === 2)
        .reduce((s, r) => s + (r.acc_amt as number), 0);

      lines.push(``);
      lines.push(`[합계]`);
      lines.push(`총수입=${totalIncome}`);
      lines.push(`총지출=${totalExpense}`);
      lines.push(`잔액=${totalIncome - totalExpense}`);
      lines.push(`수입건수=${records.filter((r) => (r.incm_sec_cd as number) === 1).length}`);
      lines.push(`지출건수=${records.filter((r) => (r.incm_sec_cd as number) === 2).length}`);
      lines.push(`재산건수=${estates.length}`);

      const txtContent = lines.join("\r\n");
      const blob = new Blob([new TextEncoder().encode(txtContent)], {
        type: "text/plain;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${orgName}(자체분).txt`;
      a.click();
      URL.revokeObjectURL(url);

      alert(
        `제출파일이 생성되었습니다.\n\n파일: ${orgName}(자체분).txt\n수입: ${records.filter((r) => (r.incm_sec_cd as number) === 1).length}건\n지출: ${records.filter((r) => (r.incm_sec_cd as number) === 2).length}건\n재산: ${estates.length}건`
      );
    } catch {
      alert("제출파일 생성 중 오류가 발생했습니다.");
    } finally {
      setGenerating(false);
    }
  }

  // 후보자/후원회/국회의원: .db (SQLite) 파일 생성
  // mode="full"   → 거래 포함 통합본 (자체분(-YYYY).db)
  // mode="master" → PFund2 Fund_Master.db 호환 (거래 비움, ORGAN 페어+CODE+CUSTOMER)
  // mode="data1"  → PFund2 Fund_Data_1.db 호환 (후보자 ORGAN 단행 + 그 organ 거래)
  // mode="data2"  → PFund2 Fund_Data_2.db 호환 (후원회 ORGAN 단행 + 그 organ 거래)
  async function handleGenerateDb(
    mode: "full" | "master" | "data1" | "data2" = "full",
  ) {
    if (!orgId || !orgName) return;
    setGenerating(true);

    try {
      // 페어 자격증명 (후보자 별도 지정) — sessionStorage에서 읽기
      let candUserid: string | null = null;
      let candPasswd: string | null = null;
      if (typeof window !== "undefined") {
        try {
          const raw = sessionStorage.getItem(`${ORGAN_CRED_SESSION_KEY}-${orgId}`);
          if (raw) {
            const parsed = JSON.parse(raw) as { userid?: string; passwd?: string };
            candUserid = parsed.userid ?? null;
            candPasswd = parsed.passwd ?? null;
          }
        } catch {
          // sessionStorage 파싱 실패는 무시
        }
      }

      const params = new URLSearchParams({
        orgId: String(orgId),
        orgName,
      });
      if (candUserid && candPasswd) {
        params.set("candUserid", candUserid);
        params.set("candPasswd", candPasswd);
      }
      if (mode !== "full") {
        params.set("mode", mode);
      }
      // year 필터는 full/data1/data2에서만 의미 있음 (master는 거래 비움)
      if (mode !== "master" && exportYearMode === "year" && /^(19|20)\d{2}$/.test(exportYear)) {
        params.set("year", exportYear);
      }

      const res = await fetch(`/api/system/export-sqlite?${params.toString()}`);

      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as
          | { error?: { code?: string; message?: string; details?: Record<string, unknown> } | string }
          | null;
        // PARITY-007: 자격증명 누락 → 등록 페이지로 안내
        if (
          errBody?.error &&
          typeof errBody.error === "object" &&
          errBody.error.code === "PARITY-007"
        ) {
          const detailMsg =
            (errBody.error.details?.message_detail as string | undefined) ||
            errBody.error.message ||
            "선관위 프로그램 로그인 정보가 등록되지 않았습니다";
          const actionUrl =
            (errBody.error.details?.actionUrl as string | undefined) || "/dashboard/organ";
          if (confirm(`${detailMsg}\n\n사용기관관리 페이지로 이동하시겠습니까?`)) {
            router.push(actionUrl);
          }
          return;
        }
        const message =
          (typeof errBody?.error === "object"
            ? errBody.error.message
            : (errBody?.error as string)) || "서버 오류";
        throw new Error(message);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // mode별 다운로드 파일명 (PFund2 표준)
      const downloadName =
        mode === "master"
          ? "Fund_Master.db"
          : mode === "data1"
            ? "Fund_Data_1.db"
            : mode === "data2"
              ? "Fund_Data_2.db"
              : exportYearMode === "year" && /^(19|20)\d{2}$/.test(exportYear)
                ? `${orgName}(자체분-${exportYear}).db`
                : `${orgName}(자체분).db`;
      a.download = downloadName;
      a.click();
      URL.revokeObjectURL(url);

      const pfund2Tip = `\n\nPFund2 Data 폴더에 복사:\nC:\\Program Files (x86)\\중앙선거관리위원회_정치자금회계관리5\\Data\\${downloadName}`;
      alert(
        mode === "master"
          ? `Fund_Master.db 생성 완료.${pfund2Tip}`
          : mode === "data1"
            ? `Fund_Data_1.db 생성 완료 (후보자 데이터).${pfund2Tip}`
            : mode === "data2"
              ? `Fund_Data_2.db 생성 완료 (후원회 데이터).${pfund2Tip}`
              : `제출파일이 생성되었습니다.\n\n파일: ${downloadName}\n선관위 제출용 SQLite 형식`,
      );
    } catch (e) {
      alert(
        `제출파일 생성 중 오류가 발생했습니다.\n${e instanceof Error ? e.message : ""}`
      );
    } finally {
      setGenerating(false);
    }
  }

  function handleGenerate() {
    if (orgType === "party") {
      handleGenerateTxt();
    } else {
      handleGenerateDb();
    }
  }

  // 중앙당(50)은 제출파일 생성 불가 (취합만)
  const isCentralParty = orgSecCd === 50;
  const fileFormat =
    orgType === "party" ? "텍스트(.txt)" : "SQLite(.db) - 선관위 제출용";

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">제출파일 생성</h2>

      <div className="bg-white rounded-lg border p-4 space-y-4">
        <div className="bg-blue-50 rounded p-3 text-sm space-y-1">
          <p>
            사용기관: <b>{orgName}</b>
          </p>
          <p>파일형식: {fileFormat}</p>
        </div>

        {isCentralParty && (
          <div className="bg-yellow-50 rounded p-3 text-sm text-yellow-800">
            중앙당은 제출파일 생성 대상이 아닙니다. 취합작업만 수행합니다.
          </div>
        )}

        {orgType === "party" && !isCentralParty && (
          <div className="bg-yellow-50 rounded p-3 text-sm text-yellow-800 space-y-1">
            <p>정당은 결산작업을 먼저 수행해야 합니다.</p>
            {orgSecCd === 52 && (
              <p>
                시도당: 자체분 + 정당선거사무소 취합분 2개 파일 생성
              </p>
            )}
          </div>
        )}

        {orgType !== "party" && (
          <div className="bg-gray-50 rounded p-3 text-sm text-gray-600 space-y-1">
            <p>
              Supabase 데이터를 원본 프로그램 호환 SQLite(.db) 형식으로 변환하여
              다운로드합니다.
            </p>
            <p>
              테이블명과 컬럼명은 원본 대문자 형식(ACC_BOOK, CUSTOMER 등)으로
              복원됩니다.
            </p>
          </div>
        )}

        {orgType !== "party" && (
          <div className="rounded border p-3 text-sm space-y-2">
            <p className="font-semibold">회계기간 선택</p>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="exportYearMode"
                checked={exportYearMode === "year"}
                onChange={() => setExportYearMode("year")}
              />
              <span>회계연도</span>
              <input
                type="text"
                value={exportYear}
                onChange={(e) => setExportYear(e.target.value)}
                onFocus={() => setExportYearMode("year")}
                maxLength={4}
                className="w-20 px-2 py-1 border rounded"
                placeholder="YYYY"
                aria-label="회계연도"
              />
              <span className="text-xs text-gray-500">
                ACC_BOOK / ACC_BOOK_BAK이 해당 연도(YYYY-01-01 ~ YYYY-12-31)로만 필터됩니다
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="exportYearMode"
                checked={exportYearMode === "all"}
                onChange={() => setExportYearMode("all")}
              />
              <span>전체 기간 (모든 acc_book)</span>
            </label>
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={handlePreview}>
            미리보기 (데이터 통계)
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={generating || isCentralParty}
          >
            {generating
              ? "생성 중..."
              : `제출파일 생성 (${orgType === "party" ? ".txt" : ".db"})`}
          </Button>
          {orgType !== "party" && (
            <Button
              variant="secondary"
              onClick={() => handleGenerateDb("master")}
              disabled={generating || isCentralParty}
              title="PFund2 Data 폴더의 Fund_Master.db에 덮어쓸 마스터 (ORGAN 페어 + CODE + CUSTOMER)"
            >
              {generating ? "생성 중..." : "Fund_Master.db"}
            </Button>
          )}
          {orgType !== "party" && (
            <Button
              variant="secondary"
              onClick={() => handleGenerateDb("data1")}
              disabled={generating || isCentralParty}
              title="PFund2 Data 폴더의 Fund_Data_1.db (후보자 단독 + 그 organ 거래)"
            >
              {generating ? "..." : "Fund_Data_1.db"}
            </Button>
          )}
          {orgType !== "party" && (
            <Button
              variant="secondary"
              onClick={() => handleGenerateDb("data2")}
              disabled={generating || isCentralParty}
              title="PFund2 Data 폴더의 Fund_Data_2.db (후원회 단독 + 그 organ 거래)"
            >
              {generating ? "..." : "Fund_Data_2.db"}
            </Button>
          )}
          {orgType !== "party" && (
            <Button
              variant="outline"
              onClick={() => dispatch({ type: "open" })}
              disabled={isCentralParty}
            >
              PFund2 .db 가져오기
            </Button>
          )}
        </div>

        {imp.open && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-auto">
              <div className="px-5 py-4 border-b flex items-center justify-between">
                <h3 className="font-semibold text-lg">PFund2 .db 파일 가져오기</h3>
                <button
                  onClick={closeImportModal}
                  className="text-gray-400 hover:text-gray-700 text-xl leading-none"
                  aria-label="닫기"
                >
                  ✕
                </button>
              </div>
              <div className="p-5 space-y-4 text-sm">
                <div className="space-y-2">
                  <label className="block font-medium">.db 파일 선택</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".db"
                    onChange={(e) =>
                      dispatch({ type: "setFile", file: e.target.files?.[0] ?? null })
                    }
                    className="text-xs"
                  />
                  {imp.file && (
                    <p className="text-xs text-gray-500">
                      {imp.file.name} ({Math.round(imp.file.size / 1024)}KB)
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="block font-medium">충돌 처리 방식</label>
                  <div className="space-y-1">
                    {(
                      [
                        ["overwrite", "덮어쓰기 (overwrite)", "기존 데이터 모두 삭제 후 가져옴 (전통적 동작)"],
                        ["merge", "병합 (merge)", "기존 데이터 보존 + 새 데이터 추가/갱신"],
                        ["skip", "건너뛰기 (skip)", "기존 데이터 보존, 충돌 행은 무시"],
                      ] as const
                    ).map(([value, title, desc]) => (
                      <label key={value} className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="conflict-policy"
                          value={value}
                          checked={imp.policy === value}
                          onChange={() => dispatch({ type: "setPolicy", policy: value })}
                          className="mt-1"
                        />
                        <div>
                          <span className="font-medium">{title}</span>
                          <p className="text-xs text-gray-500">{desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {imp.outcome.kind === "error" && (
                  <div className="bg-red-50 border border-red-200 rounded p-3 text-red-800 text-xs whitespace-pre-wrap">
                    {imp.outcome.message}
                  </div>
                )}

                {imp.outcome.kind === "preview" && (
                  <div className="bg-blue-50 border border-blue-200 rounded p-3 space-y-2">
                    <h4 className="font-medium">미리보기 결과 (정책: {imp.outcome.summary.conflictPolicy})</h4>
                    <div className="text-xs grid grid-cols-2 gap-x-4 gap-y-1">
                      {Object.entries(imp.outcome.summary.rowCounts).map(([k, v]) => (
                        <div key={k}>
                          <span className="text-gray-600">{k}:</span> <b>{v}</b>건
                        </div>
                      ))}
                    </div>
                    {imp.outcome.summary.organCandidates.length > 0 && (
                      <div className="text-xs">
                        <p className="font-medium mt-2">ORGAN 후보:</p>
                        <ul className="ml-4 list-disc">
                          {imp.outcome.summary.organCandidates.map((c, i) => (
                            <li key={i}>
                              [{c.source}] ORG_ID={c.exportOrgId} (SEC={c.org_sec_cd}) — {c.org_name}
                              {c.reg_num && ` / ${c.reg_num}`}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {imp.outcome.kind === "result" && (
                  <div className="bg-green-50 border border-green-200 rounded p-3 space-y-1 text-xs">
                    <p className="font-medium text-green-800">
                      ✓ 가져오기 완료: 총 {imp.outcome.totalImported}건 import
                    </p>
                    {imp.outcome.warnings.length > 0 && (
                      <ul className="ml-4 list-disc text-amber-700">
                        {imp.outcome.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
              <div className="px-5 py-4 border-t flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={closeImportModal}
                  disabled={imp.outcome.kind === "loading"}
                >
                  닫기
                </Button>
                <Button
                  variant="outline"
                  onClick={() => runImport(true)}
                  disabled={!imp.file || imp.outcome.kind === "loading"}
                >
                  {imp.outcome.kind === "loading" ? "..." : "미리보기"}
                </Button>
                <Button
                  onClick={() => runImport(false)}
                  disabled={!imp.file || imp.outcome.kind === "loading"}
                >
                  {imp.outcome.kind === "loading" ? "..." : "가져오기 실행"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {stats && (
          <div className="bg-gray-50 rounded p-4 text-sm space-y-2">
            <h3 className="font-semibold mb-2">제출 데이터 통계</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded border p-3 text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {stats.income}
                </div>
                <div className="text-gray-500">수입내역</div>
              </div>
              <div className="bg-white rounded border p-3 text-center">
                <div className="text-2xl font-bold text-red-600">
                  {stats.expense}
                </div>
                <div className="text-gray-500">지출내역</div>
              </div>
              <div className="bg-white rounded border p-3 text-center">
                <div className="text-2xl font-bold text-gray-600">
                  {stats.customersTotal}
                </div>
                <div className="text-gray-500">수입지출처 (전체)</div>
                <div className="text-[11px] text-gray-400 mt-1">
                  거래 등장: {stats.customers}건
                </div>
              </div>
              <div className="bg-white rounded border p-3 text-center">
                <div className="text-2xl font-bold text-green-600">
                  {stats.estates}
                </div>
                <div className="text-gray-500">재산내역</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
