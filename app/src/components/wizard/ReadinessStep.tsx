"use client";

/**
 * 마법사 스텝 1 — 준비상태 점검 신호등(FR-2). 판정은 전부
 * lib/accounting/submission-readiness.ts(순수 SSOT 조합) — 여기는 표시만.
 */
import Link from "next/link";
import type { ReadinessCheck, ReadinessResult } from "@/lib/accounting/submission-readiness";

interface Props {
  result: ReadinessResult | null;
  loading: boolean;
}

const LEVEL_UI: Record<ReadinessCheck["level"], { icon: string; cls: string; text: string }> = {
  ok: { icon: "✅", cls: "border-green-200 bg-green-50", text: "통과" },
  warn: { icon: "⚠️", cls: "border-amber-200 bg-amber-50", text: "경고 (진행 가능)" },
  block: { icon: "❌", cls: "border-red-200 bg-red-50", text: "진행 불가" },
};

export default function ReadinessStep({ result, loading }: Props) {
  if (loading || !result) {
    return <div className="py-12 text-center text-sm text-muted-foreground">데이터를 점검하는 중…</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        제출 서류를 만들기 전에 데이터 상태를 점검했습니다. ❌ 항목은 해결해야 진행할 수 있고,
        ⚠️ 항목은 그대로 진행할 수 있지만 제출 전에 확인을 권장합니다.
      </p>

      {result.checks.map((c) => {
        const ui = LEVEL_UI[c.level];
        return (
          <div key={c.id} className={`flex items-start gap-3 rounded-md border px-4 py-3 ${ui.cls}`}>
            <span className="text-lg leading-6">{ui.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{c.label}</span>
                <span className="text-xs text-muted-foreground">{ui.text}</span>
              </div>
              {c.detail && <p className="mt-0.5 text-xs text-muted-foreground">{c.detail}</p>}
            </div>
            {c.fixHref && c.level !== "ok" && (
              <Link href={c.fixHref} className="shrink-0 text-xs font-medium text-blue-600 hover:underline">
                고치러 가기 →
              </Link>
            )}
          </div>
        );
      })}

      {!result.canProceed && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          ❌ 항목을 해결한 뒤 다시 시도하세요. 해결하면 자동으로 다시 점검됩니다.
        </p>
      )}
    </div>
  );
}
