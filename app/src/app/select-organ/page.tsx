"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { electionCycleOf, currentCycleOf, isOldCycle } from "@/lib/accounting/acc-period";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DeletePreview {
  income: number;
  incomeAmt: number;
  expense: number;
  expenseAmt: number;
  evidence: number;
  estate: number;
  customer: number;
  backup: number;
}

const ORG_TYPE_LABELS: Record<number, string> = {
  50: "중앙당",
  51: "정책연구소",
  52: "시도당",
  53: "정당선거사무소",
  54: "국회의원",
  90: "(예비)후보자",
  106: "경선후보자",
  91: "대통령선거후보자후원회",
  92: "국회의원후원회",
  107: "대통령선거경선후보자후원회",
  108: "당대표경선후보자후원회",
  109: "(예비)후보자후원회",
  587: "중앙당후원회",
  588: "중앙당창당준비위원회후원회",
};

interface UserOrganRow {
  org_id: number;
  is_default: boolean | null;
  organ: {
    org_id: number;
    org_sec_cd: number;
    org_name: string;
    acc_from: string | null;
    acc_to: string | null;
    acct_name: string | null;
  };
}

function fmtPeriod(from: string | null, to: string | null): string {
  if (!from || !to) return "-";
  const f =
    from.length === 8
      ? `${from.slice(0, 4)}.${from.slice(4, 6)}.${from.slice(6, 8)}`
      : from;
  const t =
    to.length === 8
      ? `${to.slice(0, 4)}.${to.slice(4, 6)}.${to.slice(6, 8)}`
      : to;
  return `${f} ~ ${t}`;
}

export default function SelectOrganPage() {
  const router = useRouter();
  const { user, orgId, setOrgan, clearOrgan } = useAuth();
  const [organs, setOrgans] = useState<UserOrganRow[]>([]);
  const [loading, setLoading] = useState(true);
  // 옛 주기 사용기관 표시 여부 (year-separation-p2 FR-05) — 기본은 현 주기만.
  const [showOldCycle, setShowOldCycle] = useState(false);

  // 삭제 모달 상태
  const [deleteTarget, setDeleteTarget] = useState<UserOrganRow | null>(null);
  const [preview, setPreview] = useState<DeletePreview | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // 최신 미리보기 요청 식별 — 지연 도착한 이전 기관 응답이 현재 모달을 덮어쓰지 않게 한다.
  const previewReqRef = useRef<number | null>(null);

  useEffect(() => {
    async function load() {
      if (!user) {
        router.push("/login");
        return;
      }
      const supabase = createSupabaseBrowser();
      const { data } = await supabase
        .from("user_organ")
        .select(
          "org_id, is_default, organ(org_id, org_sec_cd, org_name, acc_from, acc_to, acct_name)"
        )
        .eq("user_id", user.id);
      setOrgans((data || []) as unknown as UserOrganRow[]);
      setLoading(false);
    }
    load();
  }, [user, router]);

  function handleSelect(org: {
    org_id: number;
    org_sec_cd: number;
    org_name: string;
    acct_name?: string | null;
    acc_from?: string | null;
    acc_to?: string | null;
  }) {
    setOrgan(org);
    router.push("/dashboard");
  }

  function handleRegisterNew() {
    router.push("/register-organ");
  }

  async function openDeleteDialog(item: UserOrganRow) {
    const reqId = item.organ.org_id;
    previewReqRef.current = reqId;
    setDeleteTarget(item);
    setPreview(null);
    setConfirmText("");
    setDeleteError(null);
    try {
      const res = await fetch("/api/organ", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", orgId: reqId }),
      });
      const json = await res.json();
      // 응답 도착 시점에 더 이상 이 기관의 모달이 아니면 폐기(레이스 방지)
      if (previewReqRef.current !== reqId) return;
      if (!res.ok) {
        setDeleteError(json.error || "미리보기를 불러오지 못했습니다.");
        return;
      }
      setPreview(json.counts as DeletePreview);
    } catch {
      if (previewReqRef.current !== reqId) return;
      setDeleteError("미리보기를 불러오지 못했습니다.");
    }
  }

  function closeDeleteDialog() {
    if (deleting) return;
    previewReqRef.current = null;
    setDeleteTarget(null);
    setPreview(null);
    setConfirmText("");
    setDeleteError(null);
  }

  async function handleConfirmDelete() {
    // 되돌릴 수 없는 작업 — 미리보기 성공 + 기관명 일치 + 비진행 상태에서만 실행(중복 클릭 차단)
    if (!deleteTarget || deleting || !canDelete) return;
    const targetId = deleteTarget.organ.org_id;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/organ", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", orgId: targetId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setDeleteError(json.error || "삭제 중 오류가 발생했습니다.");
        setDeleting(false);
        return;
      }

      // 현재 선택된 기관을 삭제한 경우 store 정리
      const wasCurrent = orgId === targetId;
      if (wasCurrent) clearOrgan();

      // 목록 갱신
      const remaining = organs.filter((o) => o.organ.org_id !== targetId);
      setOrgans(remaining);
      setDeleting(false);
      setDeleteTarget(null);
      setPreview(null);
      setConfirmText("");
      alert(`'${json.orgName ?? deleteTarget.organ.org_name}' 사용기관이 삭제되었습니다.`);

      if (remaining.length === 0) {
        router.push("/register-organ");
      }
    } catch {
      setDeleteError("삭제 중 오류가 발생했습니다.");
      setDeleting(false);
    }
  }

  const confirmMatches =
    !!deleteTarget && confirmText.trim() === deleteTarget.organ.org_name.trim();
  // 삭제 가능 조건: 미리보기 성공(preview 존재 + 에러 없음) + 기관명 일치 + 비진행
  const canDelete = confirmMatches && !!preview && !deleteError && !deleting;

  // 선거주기 파생 + 현 주기 계산 (year-separation-p2 FR-05).
  // 각 org의 주기는 acc_from 연도(electionCycleOf), 현 주기는 그중 최신.
  const cycleOf = (o: UserOrganRow): string | null =>
    electionCycleOf({ acc_from: o.organ.acc_from });
  const currentCycle = useMemo(
    () => currentCycleOf(organs.map(cycleOf)),
    [organs],
  );
  const oldCycleCount = useMemo(
    () => organs.filter((o) => isOldCycle(cycleOf(o), currentCycle)).length,
    [organs, currentCycle],
  );
  const visibleOrgans = showOldCycle
    ? organs
    : organs.filter((o) => !isOldCycle(cycleOf(o), currentCycle));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        사용기관 목록을 불러오는 중...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">사용기관 선택</CardTitle>
          <p className="text-sm text-gray-500 mt-1">
            사용할 기관을 선택하세요. 선택 후 대시보드로 이동합니다.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {organs.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-gray-500 mb-4">
                등록된 사용기관이 없습니다.
              </p>
              <Button onClick={handleRegisterNew}>사용기관 신규등록</Button>
            </div>
          ) : (
            <>
              {visibleOrgans.length === 0 && (
                <div className="text-center py-4 text-sm text-gray-500">
                  현 주기({currentCycle}년) 사용기관이 없습니다. 아래에서 옛 주기를 표시할 수 있습니다.
                </div>
              )}
              {visibleOrgans.map((item) => (
                <div
                  key={item.org_id}
                  className="flex items-stretch rounded-lg border hover:border-blue-300 transition-colors overflow-hidden"
                >
                  <button
                    onClick={() => handleSelect(item.organ)}
                    className="flex-1 text-left p-4 hover:bg-blue-50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-lg">
                            {item.organ.org_name}
                          </p>
                          {cycleOf(item) && (
                            <span
                              className={
                                isOldCycle(cycleOf(item), currentCycle)
                                  ? "text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full whitespace-nowrap"
                                  : "text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full whitespace-nowrap"
                              }
                            >
                              {cycleOf(item)}년 주기
                              {isOldCycle(cycleOf(item), currentCycle) ? " · 옛" : ""}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {ORG_TYPE_LABELS[item.organ.org_sec_cd] ||
                            `코드: ${item.organ.org_sec_cd}`}
                        </p>
                      </div>
                      {item.is_default && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                          기본
                        </span>
                      )}
                    </div>
                    <div className="mt-2 text-xs text-gray-400 flex gap-4">
                      <span>
                        회계기간:{" "}
                        {fmtPeriod(item.organ.acc_from, item.organ.acc_to)}
                      </span>
                      {item.organ.acct_name && (
                        <span>회계책임자: {item.organ.acct_name}</span>
                      )}
                    </div>
                  </button>
                  <button
                    onClick={() => openDeleteDialog(item)}
                    aria-label={`${item.organ.org_name} 삭제`}
                    title="사용기관 삭제"
                    className="px-3 border-l text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                  >
                    삭제
                  </button>
                </div>
              ))}
              {oldCycleCount > 0 && (
                <div className="text-center">
                  <button
                    onClick={() => setShowOldCycle((v) => !v)}
                    className="text-xs text-gray-500 hover:text-gray-700 underline underline-offset-2"
                  >
                    {showOldCycle
                      ? "옛 주기 사용기관 숨기기"
                      : `옛 주기 사용기관 ${oldCycleCount}곳 보기`}
                  </button>
                </div>
              )}
              <div className="pt-4 border-t text-center">
                <Button variant="outline" onClick={handleRegisterNew}>
                  사용기관 신규등록
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) closeDeleteDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>사용기관 삭제</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
              <p className="font-semibold">경고: 삭제된 자료는 복구할 수 없습니다.</p>
              <p>해당 기관의 모든 회계자료·증빙파일·자산이 영구히 삭제됩니다.</p>
            </div>

            <p className="text-sm">
              <b>&ldquo;{deleteTarget?.organ.org_name}&rdquo;</b>의 다음 데이터가
              삭제됩니다:
            </p>

            {deleteError ? (
              <p className="text-sm text-red-600">{deleteError}</p>
            ) : preview ? (
              <div className="bg-gray-50 rounded p-3 text-sm space-y-1">
                <p>
                  수입 <b>{preview.income.toLocaleString("ko-KR")}건</b> ·
                  지출 <b>{preview.expense.toLocaleString("ko-KR")}건</b>
                </p>
                <p>
                  증빙파일 {preview.evidence.toLocaleString("ko-KR")}건 · 자산{" "}
                  {preview.estate.toLocaleString("ko-KR")}건 · 수입지출처{" "}
                  {preview.customer.toLocaleString("ko-KR")}건
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-400">영향 자료를 확인하는 중...</p>
            )}

            <div className="space-y-1">
              <p className="text-sm text-gray-600">
                확인을 위해 기관명을 그대로 입력하세요:
              </p>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={deleteTarget?.organ.org_name}
                aria-label="삭제 확인용 기관명 입력"
                disabled={deleting}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDeleteDialog} disabled={deleting}>
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={!canDelete}
            >
              {deleting ? "삭제 중..." : "영구 삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
