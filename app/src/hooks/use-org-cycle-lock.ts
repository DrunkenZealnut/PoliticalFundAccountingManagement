"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { electionCycleOf, currentCycleOf, isOldCycle } from "@/lib/accounting/acc-period";

/**
 * 현재 선택 사용기관이 "옛 선거주기"인지 판정(year-separation-p2 FR-06).
 *
 * 자기완결형: 로그인 사용자의 모든 사용기관(acc_from)을 조회해 최신 주기(currentCycle)를 구하고,
 * 현재 org의 주기와 비교한다. store.accFrom 의존 안 함(진입 경로 무관하게 동작).
 * 판정 로직 SSOT는 `lib/accounting/acc-period.ts`(electionCycleOf/currentCycleOf/isOldCycle).
 *
 * `locked` = 옛 주기 && 사용자가 잠금해제(unlock)하지 않음. 데이터 무결성 1차 방어는 P1 서버 검증이
 * 계속 담당하므로, 이 잠금은 UX 가드(실수 입력 예방)다.
 */
export interface OrgCycleLock {
  cycle: string | null;
  currentCycle: string | null;
  locked: boolean;
  unlock: () => void;
}

export function useOrgCycleLock(): OrgCycleLock {
  const user = useAuth((s) => s.user);
  const orgId = useAuth((s) => s.orgId);
  const [cycle, setCycle] = useState<string | null>(null);
  const [currentCycle, setCurrentCycle] = useState<string | null>(null);
  // 잠금해제를 org 단위로 기억 — org 전환 시 자동 무효(effect 리셋 불필요).
  const [unlockedFor, setUnlockedFor] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user || orgId == null) {
        if (!cancelled) {
          setCycle(null);
          setCurrentCycle(null);
        }
        return;
      }
      const sb = createSupabaseBrowser();
      const { data } = await sb
        .from("user_organ")
        .select("organ(org_id, acc_from)")
        .eq("user_id", user.id);
      if (cancelled) return;
      const orgs = ((data ?? []) as unknown as { organ: { org_id: number; acc_from: string | null } }[])
        .map((r) => r.organ)
        .filter(Boolean);
      const cur = currentCycleOf(orgs.map((o) => electionCycleOf({ acc_from: o.acc_from })));
      const me = orgs.find((o) => o.org_id === orgId);
      setCurrentCycle(cur);
      setCycle(electionCycleOf({ acc_from: me?.acc_from ?? null }));
    })();
    return () => {
      cancelled = true;
    };
  }, [user, orgId]);

  const unlocked = orgId != null && unlockedFor === orgId;

  return {
    cycle,
    currentCycle,
    locked: isOldCycle(cycle, currentCycle) && !unlocked,
    unlock: () => setUnlockedFor(orgId ?? null),
  };
}
