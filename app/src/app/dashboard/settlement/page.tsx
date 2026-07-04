"use client";

import { useState, useCallback } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { useCodeValues } from "@/hooks/use-code-values";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpTooltip } from "@/components/help-tooltip";
import { PageGuide } from "@/components/page-guide";
import { EmptyState } from "@/components/empty-state";
import { PAGE_GUIDES } from "@/lib/page-guides";
import {
  buildSettlementSummary,
  type SettlementAccountSummary,
} from "@/lib/accounting/settlement-summary";
import type { ReportSummaryRawRow } from "@/lib/accounting/income-expense-report-summary";
import type { Shortfall } from "@/lib/accounting/fund-realloc";
import { estateAmount, sumEstateAmount } from "@/lib/accounting/estate-types";
import { countOutOfPeriodRows } from "@/lib/accounting/acc-period";

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

interface SettlementResult {
  income: number;
  expense: number;
  balance: number;
  estateAmt: number;
  estateDebt: number;
  netEstate: number;
  accounts: SettlementAccountSummary[];
  shortfalls: Shortfall[];
}

export default function SettlementPage() {
  const supabase = createSupabaseBrowser();
  const { orgId } = useAuth();
  const { loading: codesLoading, getName } = useCodeValues();

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [result, setResult] = useState<SettlementResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [settled, setSettled] = useState(false);

  const handleSettle = useCallback(async () => {
    if (!orgId || !dateFrom || !dateTo) {
      alert("결산기간을 설정하세요.");
      return;
    }
    setLoading(true);

    const from = dateFrom.replace(/-/g, "");
    const to = dateTo.replace(/-/g, "");

    try {
    // Fetch all accounting data for the period.
    // 재배분(allocateCandidateLedgerRows)은 자금원의 시간순 잔액을 풀므로 acc_book_id·acc_date가 필요하다.
    const { data: accData, error: accErr } = await supabase
      .from("acc_book")
      .select("acc_book_id, incm_sec_cd, acc_sec_cd, item_sec_cd, acc_amt, acc_date")
      .eq("org_id", orgId)
      .gte("acc_date", from)
      .lte("acc_date", to)
      .limit(100000); // 기본 max-rows(≈1000) truncation 방지 — 결산 집계 누락 차단
    if (accErr) {
      alert(`수입지출 조회 실패: ${accErr.message}`);
      return;
    }

    // Fetch estate data (qty 포함 — 금액은 amt×qty SSOT)
    const { data: estateData, error: estateErr } = await supabase
      .from("estate")
      .select("estate_sec_cd, amt, qty")
      .eq("org_id", orgId);
    if (estateErr) {
      alert(`재산내역 조회 실패: ${estateErr.message}`);
      return;
    }

    const records = (accData || []) as unknown as ReportSummaryRawRow[];

    // 수입/지출/계정·과목별 집계는 22-1 보고서·수입·지출부·.db와 동일한 재배분 SSOT를 거친다.
    // (원본 직접 집계 시 자금원별로 현실에선 불가능한 음수 차액이 표시됐던 버그를 해소)
    const summary = buildSettlementSummary(records);
    const { income, expense, balance } = summary;

    // Estate: 현금및예금(47) and 차입금(49). 금액은 estateAmount(amt×qty) SSOT로 통일
    // (recompute-settlement·export-sqlite와 동일 — opinion.estate_amt 경로별 불일치 제거).
    const estates = estateData || [];
    const estateAmt = estates
      .filter((r) => r.estate_sec_cd === 47)
      .reduce((s, r) => s + estateAmount(r), 0);
    const estateDebt = estates
      .filter((r) => r.estate_sec_cd === 49)
      .reduce((s, r) => s + Math.abs(estateAmount(r)), 0);
    const netEstate = sumEstateAmount(estates);

    setResult({
      income,
      expense,
      balance,
      estateAmt,
      estateDebt,
      netEstate,
      accounts: summary.accounts,
      shortfalls: summary.shortfalls,
    });
    // 기존 결산확정 여부 반영 (opinion.settled_at, scripts/023). 확정된 org 는 "확정됨" 표시.
    const { data: op } = await supabase
      .from("opinion")
      .select("settled_at")
      .eq("org_id", orgId)
      .maybeSingle();
    setSettled(!!(op as { settled_at?: string | null } | null)?.settled_at);

    // FR-07: 결산 대상 거래 중 사용기관 회계기간 밖 거래 경고(차단 아님 — 오연도 혼입 확인 유도).
    const { data: orgPeriod } = await supabase
      .from("organ")
      .select("acc_from, acc_to, pre_acc_from")
      .eq("org_id", orgId)
      .maybeSingle();
    const oop = countOutOfPeriodRows(
      records as { acc_date?: string | null }[],
      (orgPeriod ?? {}) as { acc_from?: string | null; acc_to?: string | null; pre_acc_from?: string | null },
    );
    if (oop.count > 0) {
      const samples = oop.samples
        .map((s) => `${s.acc_date}(${s.reason === "before" ? "기간이전" : "기간이후"})`)
        .join(", ");
      alert(
        `⚠️ 주의: 결산 대상에 사용기관 회계기간(${oop.range?.lo} ~ ${oop.range?.hi}) 밖 거래가 ${oop.count}건 있습니다.\n` +
          `다른 연도(선거주기) 거래가 섞였는지 확인하세요.${samples ? `\n예시: ${samples}` : ""}`,
      );
    }

    // Balance vs estate mismatch warning
    if (balance !== estateAmt) {
      alert(
        `결산 경고:\n\n` +
          `수입지출 잔액: ${fmt(balance)}원\n` +
          `재산(현금및예금): ${fmt(estateAmt)}원\n\n` +
          `차이: ${fmt(Math.abs(balance - estateAmt))}원\n\n` +
          `수입지출내역 또는 재산내역을 수정 후 다시 결산하십시오.`
      );
    }
    } finally {
      setLoading(false);
    }
  }, [orgId, supabase, dateFrom, dateTo]);

  // 결산확정 - organ 테이블의 acc_from/acc_to 업데이트 및 opinion 잔액 저장
  async function handleFinalize() {
    if (!orgId || !result || !dateFrom || !dateTo) return;

    // 거래·재산 자료가 전혀 없는 빈 기간은 확정 불가(0원 결산 확정 방지)
    if (result.income === 0 && result.expense === 0 && result.estateAmt === 0) {
      alert("결산할 수입·지출·재산 자료가 없습니다. 해당 기간을 확정할 수 없습니다.");
      return;
    }

    if (result.balance !== result.estateAmt) {
      alert("수입지출 잔액과 재산(현금및예금)이 일치하지 않습니다.\n먼저 데이터를 수정한 후 결산확정하세요.");
      return;
    }

    if (!confirm(
      `결산을 확정합니다.\n\n` +
      `결산기간: ${dateFrom} ~ ${dateTo}\n` +
      `수입: ${fmt(result.income)}원\n` +
      `지출: ${fmt(result.expense)}원\n` +
      `잔액: ${fmt(result.balance)}원\n\n` +
      `확정 후에는 해당 기간의 수입지출 데이터 수정 시 주의가 필요합니다.\n계속하시겠습니까?`
    )) return;

    const from = dateFrom.replace(/-/g, "");
    const to = dateTo.replace(/-/g, "");

    // 회계기간(organ) + 결산요약(opinion)을 단일 트랜잭션으로 확정(scripts/013 RPC).
    // 두 쓰기를 따로 하던 기존 방식의 반쪽 저장 위험 제거.
    const { error } = await supabase.rpc("finalize_settlement", {
      p_org_id: orgId,
      p_from: from,
      p_to: to,
      p_estate_amt: result.netEstate,
      p_in_amt: result.income,
      p_cm_amt: result.expense,
      p_balance_amt: result.balance,
    });

    if (error) {
      alert(`결산확정 저장 실패: ${error.message}`);
    } else {
      setSettled(true);
      alert("결산이 확정되었습니다.\n\n보고관리 → 제출파일생성으로 이동하여 제출파일을 생성할 수 있습니다.");
    }
  }

  if (codesLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        코드 데이터 로딩 중...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageGuide {...PAGE_GUIDES.settlement} />
      <h2 className="text-2xl font-bold">결산작업</h2>

      <div className="bg-white rounded-lg border p-4 space-y-4">
        <div className="bg-blue-50 rounded p-3 text-sm text-blue-800">
          수입/지출 데이터를 마감 처리합니다. 전체 계정의 수입/지출/잔액을
          최종 확인하고, 재산내역의 현금및예금과 일치하는지 검증합니다.
        </div>

        <div className="flex gap-4 items-end flex-wrap">
          <div>
            <Label>결산기간 From</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div>
            <Label>To</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          <HelpTooltip id="report.settlement">
            <Button onClick={handleSettle} disabled={loading}>
              {loading ? "결산 중..." : "결산"}
            </Button>
          </HelpTooltip>
        </div>

        {!result && !loading && (
          <EmptyState
            icon="📊"
            title="결산 결과가 없습니다"
            description="결산기간을 설정하고 [결산] 버튼을 클릭하세요. 결산하려면 수입/지출 자료가 필요합니다."
            actions={[
              { label: "수입 등록", href: "/dashboard/income" },
              { label: "지출 등록", href: "/dashboard/expense", variant: "outline" },
            ]}
          />
        )}

        {result && (
          <div className="space-y-4">
            {/* 총괄 요약 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 rounded p-3">
                <p className="text-xs text-blue-500">수입 합계</p>
                <p className="text-lg font-bold">{fmt(result.income)}원</p>
              </div>
              <div className="bg-red-50 rounded p-3">
                <p className="text-xs text-red-500">지출 합계</p>
                <p className="text-lg font-bold">{fmt(result.expense)}원</p>
              </div>
              <div className="bg-green-50 rounded p-3">
                <p className="text-xs text-green-500">잔액 (수입-지출)</p>
                <p className="text-lg font-bold">{fmt(result.balance)}원</p>
              </div>
              <div
                className={`rounded p-3 ${
                  result.balance === result.estateAmt
                    ? "bg-green-50"
                    : "bg-yellow-50"
                }`}
              >
                <p className="text-xs text-gray-500">재산(현금및예금)</p>
                <p className="text-lg font-bold">{fmt(result.estateAmt)}원</p>
                {result.balance !== result.estateAmt && (
                  <p className="text-xs text-red-600 mt-1 font-semibold">
                    잔액과 불일치 (차이: {fmt(Math.abs(result.balance - result.estateAmt))}원)
                  </p>
                )}
                {result.balance === result.estateAmt && (
                  <p className="text-xs text-green-600 mt-1 font-semibold">
                    잔액과 일치
                  </p>
                )}
              </div>
            </div>

            {/* 통장(현금풀) 부족 = 실제 데이터 오류. 재배분으로도 메울 수 없는 과지출. */}
            {result.shortfalls.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">
                <p className="font-semibold mb-1">
                  ⚠️ 통장 잔액 부족(데이터 오류) {result.shortfalls.length}건
                </p>
                <p className="text-xs mb-2">
                  특정 시점에 받은 자금보다 더 많이 지출된 거래가 있습니다. 수입 누락 또는
                  거래일자 오류일 수 있으니 수입/지출 내역을 확인하세요.
                </p>
                <ul className="text-xs space-y-0.5">
                  {result.shortfalls.map((s, i) => (
                    <li key={i}>
                      {s.acc_date.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")} ·{" "}
                      {getName(s.accSecCd)} · 부족 {fmt(s.shortAmt)}원
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 계정/과목별 상세 */}
            {result.accounts.length > 0 && (
              <div>
                <h3 className="font-semibold text-sm mb-2">
                  계정/과목별 내역
                </h3>
                <div className="border rounded overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-3 py-2 text-left">계정</th>
                        <th className="px-3 py-2 text-left">과목</th>
                        <th className="px-3 py-2 text-right">수입(건수)</th>
                        <th className="px-3 py-2 text-right">수입액</th>
                        <th className="px-3 py-2 text-right">지출(건수)</th>
                        <th className="px-3 py-2 text-right">지출액</th>
                        <th className="px-3 py-2 text-right">차액</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.accounts.map((a) => (
                        <tr
                          key={`${a.acc_sec_cd}-${a.item_sec_cd}`}
                          className="border-b hover:bg-gray-50"
                        >
                          <td className="px-3 py-2">
                            {getName(a.acc_sec_cd)}
                          </td>
                          <td className="px-3 py-2">
                            {getName(a.item_sec_cd)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {a.incomeCount > 0 ? a.incomeCount : "-"}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-blue-600">
                            {a.income > 0 ? fmt(a.income) : "-"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {a.expenseCount > 0 ? a.expenseCount : "-"}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-red-600">
                            {a.expense > 0 ? fmt(a.expense) : "-"}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-semibold">
                            {fmt(a.income - a.expense)}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-gray-50 font-semibold">
                        <td className="px-3 py-2" colSpan={2}>
                          합계
                        </td>
                        <td className="px-3 py-2 text-right">
                          {result.accounts.reduce(
                            (s, a) => s + a.incomeCount,
                            0
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-blue-600">
                          {fmt(result.income)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {result.accounts.reduce(
                            (s, a) => s + a.expenseCount,
                            0
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-red-600">
                          {fmt(result.expense)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {fmt(result.balance)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 결산확정 */}
            <div className="flex items-center gap-4">
              <Button
                onClick={handleFinalize}
                disabled={result.balance !== result.estateAmt || settled}
                className={settled ? "bg-green-600 hover:bg-green-600" : ""}
              >
                {settled ? "✓ 결산 확정됨" : "결산확정"}
              </Button>
              {result.balance !== result.estateAmt && (
                <span className="text-sm text-red-600">잔액과 재산이 일치해야 결산확정이 가능합니다.</span>
              )}
              {settled && (
                <span className="text-sm text-green-600">결산이 확정되었습니다. 제출파일을 생성할 수 있습니다.</span>
              )}
            </div>

            {/* 재산 요약 */}
            {result.netEstate !== 0 && (
              <div className="bg-gray-50 rounded p-3 text-sm">
                <span className="mr-4">
                  재산 총계: <b>{fmt(result.netEstate)}원</b>
                </span>
                {result.estateDebt > 0 && (
                  <span className="text-red-600">
                    (차입금: {fmt(result.estateDebt)}원 포함)
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
