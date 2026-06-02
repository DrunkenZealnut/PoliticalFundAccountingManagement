import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { COMMON_ACTIONS, ORG_SPECIFIC_ACTIONS } from "./QuickActions";

// Regression: ISSUE-001~004 — QuickActions가 존재하지 않는 라우트로 연결되어 404 발생
// (export-db / aggregation / donor-search / party-fee-receipt). /qa 2026-06-02 발견.
// Report: app/.gstack/qa-reports/qa-report-localhost-3001-2026-06-02.md
//
// 대시보드 퀵액션에 하드코딩된 모든 /dashboard/* href가 실제 App Router 라우트
// (src/app/<href>/page.tsx)와 매칭되는지 검증해 깨진 링크 회귀를 막는다.

const APP_DIR = path.join(process.cwd(), "src", "app");

function routeExists(href: string): boolean {
  // href: "/dashboard/submit" -> src/app/dashboard/submit/(page.tsx|page.ts)
  const rel = href.replace(/^\//, "");
  return (
    existsSync(path.join(APP_DIR, rel, "page.tsx")) ||
    existsSync(path.join(APP_DIR, rel, "page.ts"))
  );
}

const allActions = [
  ...COMMON_ACTIONS,
  ...Object.values(ORG_SPECIFIC_ACTIONS).flat(),
];

describe("QuickActions 라우트 무결성", () => {
  it.each(allActions.map((a) => [a.label, a.href] as const))(
    "퀵액션 '%s' (%s) 는 실제 라우트와 매칭된다",
    (_label, href) => {
      if (href.startsWith("/dashboard/")) {
        expect(routeExists(href), `${href} 페이지가 존재하지 않음`).toBe(true);
      }
    },
  );

  it("점검 대상 퀵액션이 최소 1개 이상 존재한다", () => {
    expect(allActions.length).toBeGreaterThan(0);
  });
});
