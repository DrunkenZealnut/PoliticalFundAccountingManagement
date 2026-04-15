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

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

interface AccountSummary {
  acc_sec_cd: number;
  item_sec_cd: number;
  income: number;
  expense: number;
  incomeCount: number;
  expenseCount: number;
}

interface SettlementResult {
  income: number;
  expense: number;
  balance: number;
  estateAmt: number;
  estateDebt: number;
  netEstate: number;
  accounts: AccountSummary[];
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

    // Fetch all accounting data for the period
    const { data: accData } = await supabase
      .from("acc_book")
      .select("incm_sec_cd, acc_sec_cd, item_sec_cd, acc_amt")
      .eq("org_id", orgId)
      .gte("acc_date", from)
      .lte("acc_date", to);

    // Fetch estate data
    const { data: estateData } = await supabase
      .from("estate")
      .select("estate_sec_cd, amt")
      .eq("org_id", orgId);

    const records = accData || [];

    // Total income/expense
    const income = records
      .filter((r) => r.incm_sec_cd === 1)
      .reduce((s, r) => s + r.acc_amt, 0);
    const expense = records
      .filter((r) => r.incm_sec_cd === 2)
      .reduce((s, r) => s + r.acc_amt, 0);
    const balance = income - expense;

    // Estate: 현금및예금(47) and 차입금(49)
    const estates = estateData || [];
    const estateAmt = estates
      .filter((r) => r.estate_sec_cd === 47)
      .reduce((s, r) => s + r.amt, 0);
    const estateDebt = estates
      .filter((r) => r.estate_sec_cd === 49)
      .reduce((s, r) => s + Math.abs(r.amt), 0);
    const netEstate = estates.reduce((s, r) => s + r.amt, 0);

    // Account-by-account breakdown
    const accountMap = new Map<string, AccountSummary>();
    for (const r of records) {
      const key = `${r.acc_sec_cd}-${r.item_sec_cd}`;
      const existing = accountMap.get(key);
      if (existing) {
        if (r.incm_sec_cd === 1) {
          existing.income += r.acc_amt;
          existing.incomeCount += 1;
        } else {
          existing.expense += r.acc_amt;
          existing.expenseCount += 1;
        }
      } else {
        accountMap.set(key, {
          acc_sec_cd: r.acc_sec_cd,
          item_sec_cd: r.item_sec_cd,
          income: r.incm_sec_cd === 1 ? r.acc_amt : 0,
          expense: r.incm_sec_cd === 2 ? r.acc_amt : 0,
          incomeCount: r.incm_sec_cd === 1 ? 1 : 0,
          expenseCount: r.incm_sec_cd === 2 ? 1 : 0,
        });
      }
    }

    const accounts = Array.from(accountMap.values()).sort(
      (a, b) => a.acc_sec_cd - b.acc_sec_cd || a.item_sec_cd - b.item_sec_cd
    );

    setResult({ income, expense, balance, estateAmt, estateDebt, netEstate, accounts });
    setSettled(false);

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

    setLoading(false);
  }, [orgId, supabase, dateFrom, dateTo]);

  // 결산확정 - organ 테이블의 acc_from/acc_to 업데이트 및 opinion 잔액 저장
  async function handleFinalize() {
    if (!orgId || !result || !dateFrom || !dateTo) return;

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

    // Update organ's accounting period
    const { error: organErr } = await supabase
      .from("organ")
      .update({ acc_from: from, acc_to: to })
      .eq("org_id", orgId);

    // Upsert opinion with financial summary
    const { error: opinionErr } = await supabase
      .from("opinion")
      .upsert({
        org_id: orgId,
        acc_from: from,
        acc_to: to,
        estate_amt: result.netEstate,
        in_amt: result.income,
        cm_amt: result.expense,
        balance_amt: result.balance,
      }, { onConflict: "org_id" });

    if (organErr || opinionErr) {
      alert(`결산확정 저장 실패: ${organErr?.message || opinionErr?.message}`);
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
