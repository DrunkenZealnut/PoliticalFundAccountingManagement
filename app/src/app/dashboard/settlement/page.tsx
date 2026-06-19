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

interface AllocAccountItem {
  accSecCd: number;
  itemSecCd: number;
  income: number;
  expense: number;
  balance: number;
  minBalance: number;
}
interface AllocResp {
  ok: boolean;
  status: number;
  error?: string;
  dryRun?: boolean;
  rollback?: boolean;
  plan?: { rawRows: number; sourcesSplit: number; updated: number; inserted: number; deletedMoved: number };
  summary?: { byAccountItem: AllocAccountItem[]; totalIncome: number; totalExpense: number; cashBalance: number; hasNegative: boolean };
  negativeAccounts?: AllocAccountItem[];
}

export default function SettlementPage() {
  const supabase = createSupabaseBrowser();
  const { orgId, orgType } = useAuth();
  const { loading: codesLoading, getName } = useCodeValues();

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [result, setResult] = useState<SettlementResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [settled, setSettled] = useState(false);

  // 과목 배분(후보자) — 수입을 충당 과목으로 재태깅해 (계정×과목) 균형 영구화
  const [allocBusy, setAllocBusy] = useState(false);
  const [alloc, setAlloc] = useState<AllocResp | null>(null);

  const runItemAllocation = useCallback(
    async (commit: boolean, rollback = false) => {
      if (!orgId) return;
      if (commit) {
        const msg = rollback
          ? "과목 배분을 해제하고 원본(raw) 상태로 되돌립니다. 진행할까요?"
          : "수입 과목을 (계정×과목) 균형에 맞게 acc_book에 영구 기록합니다.\n원본은 가역(언제든 배분 해제 가능)입니다. 진행할까요?";
        if (!confirm(msg)) return;
      }
      setAllocBusy(true);
      setAlloc(null);
      try {
        const res = await fetch("/api/system/apply-item-allocation", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ orgId, dryRun: !commit, rollback }),
        });
        const json = await res.json();
        setAlloc({ ok: res.ok && json.ok !== false, status: res.status, ...json });
      } catch (e) {
        setAlloc({ ok: false, status: 0, error: String(e) });
      } finally {
        setAllocBusy(false);
      }
    },
    [orgId],
  );

  const handleSettle = useCallback(async () => {
    if (!orgId || !dateFrom || !dateTo) {
      alert("결산기간을 설정하세요.");
      return;
    }
    setLoading(true);

    const from = dateFrom.replace(/-/g, "");
    const to = dateTo.replace(/-/g, "");

    try {
    // Fetch all accounting data for the period
    const { data: accData, error: accErr } = await supabase
      .from("acc_book")
      .select("incm_sec_cd, acc_sec_cd, item_sec_cd, acc_amt")
      .eq("org_id", orgId)
      .gte("acc_date", from)
      .lte("acc_date", to);
    if (accErr) {
      alert(`수입지출 조회 실패: ${accErr.message}`);
      return;
    }

    // Fetch estate data
    const { data: estateData, error: estateErr } = await supabase
      .from("estate")
      .select("estate_sec_cd, amt")
      .eq("org_id", orgId);
    if (estateErr) {
      alert(`재산내역 조회 실패: ${estateErr.message}`);
      return;
    }

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

            {/* 과목 배분 (후보자 전용) — 결산확정 전에 (계정×과목) 균형을 영구화 */}
            {orgType === "candidate" && (
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-sm flex items-center gap-1">
                    정치자금 수입·지출부 과목 배분
                    <HelpTooltip text="수입을 충당 과목(선거비용/선거비용외)으로 재태깅해 모든 (계정×과목) 잔액을 0 이상으로 맞춥니다. 지출 과목은 불변. 공식 프로그램과 동일한 데이터 구조이며 원본은 가역(배분 해제 가능)입니다." />
                  </h3>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => runItemAllocation(false)} disabled={allocBusy}>
                      균형 미리보기
                    </Button>
                    <Button size="sm" onClick={() => runItemAllocation(true)} disabled={allocBusy}>
                      과목배분 확정
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => runItemAllocation(true, true)} disabled={allocBusy}>
                      배분 해제
                    </Button>
                  </div>
                </div>
                {allocBusy && <p className="text-sm text-gray-500">처리 중…</p>}
                {alloc && !alloc.ok && (
                  <div className="text-sm text-red-600">
                    {alloc.error ?? "처리 실패"}
                    {alloc.negativeAccounts?.length ? (
                      <div className="mt-1">
                        음수 잔액:{" "}
                        {alloc.negativeAccounts
                          .map((n) => `${getName(n.accSecCd)}×${getName(n.itemSecCd)} ${fmt(n.minBalance)}`)
                          .join(", ")}
                      </div>
                    ) : null}
                  </div>
                )}
                {alloc && alloc.ok && alloc.summary && (
                  <div className="text-sm space-y-2">
                    <p className={alloc.dryRun ? "text-gray-600" : "text-green-600"}>
                      {alloc.rollback
                        ? "✓ 배분 해제됨(원본 복귀)"
                        : alloc.dryRun
                          ? "미리보기"
                          : "✓ 과목배분 영구화 완료"}{" "}
                      — 분할 {alloc.plan?.sourcesSplit ?? 0}건(이동분 {alloc.plan?.inserted ?? 0}) · 통장잔액{" "}
                      {fmt(alloc.summary.cashBalance)}원 · 음수 {alloc.summary.hasNegative ? "있음 ⚠" : "없음"}
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-500">
                            <th className="text-left py-1">계정(자금원)</th>
                            <th className="text-left">과목</th>
                            <th className="text-right">수입</th>
                            <th className="text-right">지출</th>
                            <th className="text-right">잔액</th>
                          </tr>
                        </thead>
                        <tbody>
                          {alloc.summary.byAccountItem.map((b, i) => (
                            <tr key={`${b.accSecCd}-${b.itemSecCd}-${i}`} className="border-t">
                              <td className="py-1">{getName(b.accSecCd)}</td>
                              <td>{getName(b.itemSecCd)}</td>
                              <td className="text-right font-mono">{fmt(b.income)}</td>
                              <td className="text-right font-mono">{fmt(b.expense)}</td>
                              <td className={`text-right font-mono ${b.balance < 0 ? "text-red-600" : ""}`}>
                                {fmt(b.balance)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                <p className="text-xs text-gray-400">
                  결산확정 전에 실행하면 (계정×과목)별 정치자금 수입·지출부가 음수 없이 출력됩니다. 거래를 추가·수정하면 다시
                  실행하세요(멱등). 미적용 시 음수가 남을 수 있습니다.
                </p>
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
