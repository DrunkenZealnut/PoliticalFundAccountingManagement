"use client";

import type { OrgCycleLock } from "@/hooks/use-org-cycle-lock";

/**
 * 옛 선거주기 사용기관 읽기전용 배너 (year-separation-p2 FR-06).
 * 입력 페이지가 useOrgCycleLock() 결과를 그대로 넘겨 렌더. 잠금 아닐 땐 null.
 */
export function OrgCycleLockBanner(lock: OrgCycleLock) {
  if (!lock.locked) return null;
  return (
    <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-sm text-amber-900 flex items-center justify-between gap-3">
      <span>
        🔒 <b>{lock.cycle}년 선거주기</b> 사용기관입니다(현 주기: {lock.currentCycle}). 옛 주기 자료는
        실수 방지를 위해 <b>읽기전용</b>입니다.
      </span>
      <button
        onClick={lock.unlock}
        className="shrink-0 rounded-md border border-amber-400 px-2.5 py-1 text-amber-800 hover:bg-amber-100"
      >
        잠금 해제
      </button>
    </div>
  );
}
