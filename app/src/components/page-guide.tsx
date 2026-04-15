"use client";

import Link from "next/link";
import { useBeginnerMode } from "@/stores/beginner-mode";
import { buttonVariants } from "@/components/ui/button";

interface PageGuideProps {
  pageId: string;
  title: string;
  summary: string;
  steps: string[];
  tips?: string[];
  wizardLink?: string;
  refPage?: string;
}

export function PageGuide({
  pageId, title, summary, steps, tips, wizardLink, refPage,
}: PageGuideProps) {
  const isEnabled = useBeginnerMode((s) => s.isEnabled);
  const collapsedGuides = useBeginnerMode((s) => s.collapsedGuides);
  const setGuideCollapsed = useBeginnerMode((s) => s.setGuideCollapsed);

  if (!isEnabled) return null;

  const isCollapsed = collapsedGuides[pageId] ?? false;

  return (
    <div className="bg-blue-50 border border-gray-200 rounded-lg mb-4 overflow-hidden">
      <button
        onClick={() => setGuideCollapsed(pageId, !isCollapsed)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-blue-100/50 transition-colors"
        aria-expanded={!isCollapsed}
        aria-controls={`guide-${pageId}`}
      >
        <span className="text-sm font-medium text-gray-900">{title}</span>
        <span className="text-xs text-gray-500">
          {isCollapsed ? "자세히 보기 ▼" : "접기 ▲"}
        </span>
      </button>

      {!isCollapsed && (
        <div id={`guide-${pageId}`} className="px-4 pb-3 text-sm" role="complementary" aria-label={title}>
          <p className="text-gray-500 mb-2">{summary}</p>

          <div className="mb-2">
            <p className="text-xs font-semibold text-gray-700 mb-1">핵심 흐름:</p>
            <ol className="list-decimal list-inside text-xs text-gray-500 space-y-0.5">
              {steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>

          {tips && tips.length > 0 && (
            <div className="mb-2">
              {tips.map((tip, i) => (
                <p key={i} className="text-xs text-gray-500">
                  <span className="font-semibold text-gray-600">TIP:</span> {tip}
                </p>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 mt-2">
            {wizardLink && (
              <Link
                href={wizardLink}
                className={buttonVariants({ size: "sm", variant: "outline" }) + " text-xs h-7"}
              >
                간편등록 마법사로 이동
              </Link>
            )}
            {refPage && (
              <span className="text-[11px] text-gray-400">
                선관위 프로그램 대응: 도움말 {refPage}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
