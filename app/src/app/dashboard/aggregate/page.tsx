"use client";

import { useState, useCallback } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ColOrgan {
  id?: number;
  org_id: number;
  org_sec_cd: number;
  org_name: string;
}

export default function AggregatePage() {
  const supabase = createSupabaseBrowser();
  const { orgId } = useAuth();

  const [targets, setTargets] = useState<ColOrgan[]>([]);
  const [newName, setNewName] = useState("");
  const [newOrgSecCd, setNewOrgSecCd] = useState(53); // default: 정당선거사무소
  const [loading, setLoading] = useState(false);
  const [aggregated, setAggregated] = useState(false);
  const [aggregateResult, setAggregateResult] = useState<{
    incomeTotal: number;
    expenseTotal: number;
    orgCount: number;
  } | null>(null);

  const orgSecCdOptions = [
    { value: 52, label: "시도당" },
    { value: 53, label: "정당선거사무소" },
    { value: 51, label: "정책연구소" },
  ];

  function handleAdd() {
    if (!newName.trim()) {
      alert("기관명을 입력하세요.");
      return;
    }
    if (!orgId) return;

    // 중복 체크
    if (targets.some((t) => t.org_name === newName.trim())) {
      alert("이미 등록된 기관입니다.");
      return;
    }

    setTargets([
      ...targets,
      { org_id: orgId, org_sec_cd: newOrgSecCd, org_name: newName.trim() },
    ]);
    setNewName("");
  }

  function handleRemove(idx: number) {
    setTargets(targets.filter((_, i) => i !== idx));
  }

  const handleAggregate = useCallback(async () => {
    if (!orgId || targets.length === 0) {
      alert("취합대상 기관을 1개 이상 등록하세요.");
      return;
    }
    setLoading(true);

    try {
      // Save COL_ORGAN records
      // First clear existing
      await supabase.from("col_organ").delete().eq("org_id", orgId);

      // Insert new targets
      const colOrgans = targets.map((t) => ({
        org_id: orgId,
        org_sec_cd: t.org_sec_cd,
        org_name: t.org_name,
      }));
      await supabase.from("col_organ").insert(colOrgans);

      // Aggregate: sum up income/expense from all target organs
      // In a real implementation, this would read the submitted .txt files
      // For now, simulate aggregation from acc_book for matching org names
      const { data: organs } = await supabase
        .from("organ")
        .select("org_id, org_name")
        .in(
          "org_name",
          targets.map((t) => t.org_name)
        );

      let incomeTotal = 0;
      let expenseTotal = 0;
      let orgCount = 0;

      if (organs) {
        for (const org of organs) {
          const { data: accData } = await supabase
            .from("acc_book")
            .select("incm_sec_cd, acc_amt")
            .eq("org_id", org.org_id);

          if (accData) {
            orgCount++;
            for (const r of accData) {
              if (r.incm_sec_cd === 1) incomeTotal += r.acc_amt;
              else expenseTotal += r.acc_amt;
            }
          }
        }
      }

      setAggregateResult({ incomeTotal, expenseTotal, orgCount });
      setAggregated(true);
    } catch (err) {
      alert(`취합 실패: ${err instanceof Error ? err.message : "오류"}`);
    } finally {
      setLoading(false);
    }
  }, [orgId, targets, supabase]);

  const fmt = (n: number) => n.toLocaleString("ko-KR");

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">취합작업</h2>

      <div className="bg-white rounded-lg border p-4 space-y-4">
        <div>
          <Label className="font-semibold">취합대상 기관 등록</Label>
          <p className="text-sm text-gray-500 mt-1">
            제출파일명의 사용기관명을 입력하세요. 시도당은 자체분 +
            정당선거사무소 취합분을 생성합니다.
          </p>
          <div className="flex gap-2 mt-2">
            <select
              className="border rounded px-3 py-2 text-sm"
              value={newOrgSecCd}
              onChange={(e) => setNewOrgSecCd(Number(e.target.value))}
            >
              {orgSecCdOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="기관명 입력"
              className="flex-1"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <Button onClick={handleAdd}>추가</Button>
          </div>
        </div>

        {targets.length > 0 && (
          <div className="border rounded">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-2 text-left w-10">번호</th>
                  <th className="px-3 py-2 text-left">기관 유형</th>
                  <th className="px-3 py-2 text-left">기관명</th>
                  <th className="px-3 py-2 w-16" />
                </tr>
              </thead>
              <tbody>
                {targets.map((t, i) => (
                  <tr key={i} className="border-b">
                    <td className="px-3 py-2">{i + 1}</td>
                    <td className="px-3 py-2">
                      {orgSecCdOptions.find((o) => o.value === t.org_sec_cd)
                        ?.label || t.org_sec_cd}
                    </td>
                    <td className="px-3 py-2 font-medium">{t.org_name}</td>
                    <td className="px-3 py-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRemove(i)}
                      >
                        삭제
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button onClick={handleAggregate} disabled={loading || targets.length === 0}>
            {loading ? "취합 중..." : `취합 실행 (${targets.length}개 기관)`}
          </Button>
        </div>

        {aggregated && aggregateResult && (
          <div className="bg-green-50 rounded p-4 space-y-2">
            <h3 className="font-semibold text-green-800">취합 결과</h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="bg-white rounded border p-3 text-center">
                <div className="text-xl font-bold text-gray-600">
                  {aggregateResult.orgCount}개
                </div>
                <div className="text-gray-500">매칭 기관</div>
              </div>
              <div className="bg-white rounded border p-3 text-center">
                <div className="text-xl font-bold text-blue-600">
                  {fmt(aggregateResult.incomeTotal)}원
                </div>
                <div className="text-gray-500">수입 합계</div>
              </div>
              <div className="bg-white rounded border p-3 text-center">
                <div className="text-xl font-bold text-red-600">
                  {fmt(aggregateResult.expenseTotal)}원
                </div>
                <div className="text-gray-500">지출 합계</div>
              </div>
            </div>
            {aggregateResult.orgCount < targets.length && (
              <p className="text-sm text-yellow-700 bg-yellow-50 p-2 rounded">
                {targets.length - aggregateResult.orgCount}개 기관의 데이터를
                찾을 수 없습니다. 해당 기관의 제출파일을 먼저 가져와야 합니다.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
