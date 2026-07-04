"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpTooltip } from "@/components/help-tooltip";

export default function ResetPage() {
  const supabase = createSupabaseBrowser();
  const { orgId } = useAuth();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [counts, setCounts] = useState<{ income: number; expense: number; incomeAmt: number; expenseAmt: number } | null>(null);
  const fmt = (n: number) => n.toLocaleString("ko-KR");

  async function handlePreview() {
    if (!orgId || !dateFrom || !dateTo) { alert("기간을 설정하세요."); return; }
    const from = dateFrom.replace(/-/g, ""); const to = dateTo.replace(/-/g, "");
    const { data } = await supabase.from("acc_book").select("incm_sec_cd, acc_amt").eq("org_id", orgId).gte("acc_date", from).lte("acc_date", to);
    if (data) {
      const inc = (data as { incm_sec_cd: number; acc_amt: number }[]).filter((r) => r.incm_sec_cd === 1);
      const exp = (data as { incm_sec_cd: number; acc_amt: number }[]).filter((r) => r.incm_sec_cd === 2);
      setCounts({ income: inc.length, expense: exp.length, incomeAmt: inc.reduce((s, r) => s + r.acc_amt, 0), expenseAmt: exp.reduce((s, r) => s + r.acc_amt, 0) });
    }
  }

  async function handleDelete() {
    if (!counts || (counts.income === 0 && counts.expense === 0)) { alert("삭제할 자료가 없습니다."); return; }
    const pw = prompt("삭제된 자료는 복구될 수 없습니다.\n로그인 비밀번호를 입력하세요.");
    if (!pw) return;
    // 비밀번호를 실제로 검증(가짜 게이트 방지) — 현재 로그인 사용자의 비밀번호로 재인증.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) { alert("로그인 정보를 확인할 수 없습니다. 다시 로그인하세요."); return; }
    const { error: authError } = await supabase.auth.signInWithPassword({ email: user.email, password: pw });
    if (authError) { alert("비밀번호가 일치하지 않습니다."); return; }
    const from = dateFrom.replace(/-/g, ""); const to = dateTo.replace(/-/g, "");
    const { error } = await supabase.from("acc_book").delete().eq("org_id", orgId!).gte("acc_date", from).lte("acc_date", to);
    if (error) { alert(`삭제 실패: ${error.message}`); return; }
    alert("자료초기화가 완료되었습니다."); setCounts(null);
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">자료초기화</h2>
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
        <p className="font-semibold">경고: 삭제된 자료는 복구될 수 없습니다.</p>
        <p>수입/지출내역 관리의 복구(Undo) 기능으로도 되돌릴 수 없습니다.</p>
      </div>
      <div className="bg-white rounded-lg border p-4 space-y-4">
        <div className="flex gap-4 items-end">
          <div><HelpTooltip id="system.reset"><Label>삭제 기간 From</Label></HelpTooltip><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
          <div><Label>To</Label><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
          <Button variant="outline" onClick={handlePreview}>조회</Button>
        </div>
        {counts && (
          <div className="bg-gray-50 rounded p-4 text-sm">
            <p>수입내역: <b>{counts.income}건</b> / {fmt(counts.incomeAmt)}원</p>
            <p>지출내역: <b>{counts.expense}건</b> / {fmt(counts.expenseAmt)}원</p>
            <p className="text-red-600 font-semibold mt-2">총 {counts.income + counts.expense}건이 삭제됩니다.</p>
          </div>
        )}
        <Button variant="destructive" onClick={handleDelete} disabled={!counts}>일괄삭제</Button>
      </div>
    </div>
  );
}
