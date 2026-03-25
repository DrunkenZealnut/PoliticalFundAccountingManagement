"use client";

import { useState, useCallback } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { Button } from "@/components/ui/button";

export default function SubmitPage() {
  const supabase = createSupabaseBrowser();
  const { orgId, orgType, orgName, orgSecCd } = useAuth();
  const [generating, setGenerating] = useState(false);
  const [stats, setStats] = useState<{
    income: number;
    expense: number;
    customers: number;
    estates: number;
  } | null>(null);

  const handlePreview = useCallback(async () => {
    if (!orgId) return;

    const [incRes, expRes, custRes, estRes] = await Promise.all([
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
      supabase
        .from("estate")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgId),
    ]);

    setStats({
      income: incRes.count || 0,
      expense: expRes.count || 0,
      customers: custRes.count || 0,
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
  async function handleGenerateDb() {
    if (!orgId || !orgName) return;
    setGenerating(true);

    try {
      const res = await fetch(
        `/api/system/export-sqlite?orgId=${orgId}&orgName=${encodeURIComponent(orgName)}`
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "서버 오류");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${orgName}(자체분).db`;
      a.click();
      URL.revokeObjectURL(url);

      alert(
        `제출파일이 생성되었습니다.\n\n파일: ${orgName}(자체분).db\n선관위 제출용 SQLite 형식`
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

        <div className="flex gap-2">
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
        </div>

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
                  {stats.customers}
                </div>
                <div className="text-gray-500">수입지출처</div>
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
