"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { useHelpMode } from "@/stores/help-mode";
import { HelpTooltip } from "@/components/help-tooltip";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/error-boundary";
import { ChatBubble } from "@/components/chat/ChatBubble";

const MENU_ITEMS = {
  party: [
    { group: "기본자료관리", items: [
      { href: "/dashboard/organ", label: "사용기관관리" },
      { href: "/dashboard/customer", label: "수입지출처관리" },
      { href: "/dashboard/customer-batch", label: "수입지출처 일괄등록" },
    ]},
    { group: "정치자금관리", items: [
      { href: "/dashboard/income", label: "수입내역관리" },
      { href: "/dashboard/expense", label: "지출내역관리" },
      { href: "/dashboard/batch-import", label: "수입지출내역 일괄등록" },
      { href: "/dashboard/document-register", label: "영수증/계약서 자동등록" },
      { href: "/dashboard/receipt", label: "당비영수증 출력" },
      { href: "/dashboard/resolution", label: "지출결의서 출력" },
    ]},
    { group: "보고관리", items: [
      { href: "/dashboard/settlement", label: "결산작업" },
      { href: "/dashboard/aggregate", label: "취합작업" },
      { href: "/dashboard/submit", label: "제출파일생성" },
      { href: "/dashboard/estate", label: "재산내역관리" },
      { href: "/dashboard/asset-report", label: "재산명세서" },
      { href: "/dashboard/party-summary", label: "정당 수입지출 총괄표" },
      { href: "/dashboard/support-detail", label: "지원금내역" },
      { href: "/dashboard/reports", label: "보고서 및 수입지출부 출력" },
      { href: "/dashboard/audit", label: "감사의견서 등 출력" },
      { href: "/dashboard/forms", label: "서식 템플릿 출력" },
    ]},
    { group: "시스템관리", items: [
      { href: "/dashboard/backup", label: "자료 백업 및 복구" },
      { href: "/dashboard/reset", label: "자료초기화" },
      { href: "/dashboard/codes", label: "코드관리" },
    ]},
  ],
  lawmaker: [
    { group: "기본자료관리", items: [
      { href: "/dashboard/organ", label: "사용기관관리" },
      { href: "/dashboard/customer", label: "수입지출처관리" },
      { href: "/dashboard/customer-batch", label: "수입지출처 일괄등록" },
    ]},
    { group: "정치자금관리", items: [
      { href: "/dashboard/income", label: "수입내역관리" },
      { href: "/dashboard/expense", label: "지출내역관리" },
      { href: "/dashboard/batch-import", label: "수입지출내역 일괄등록" },
      { href: "/dashboard/document-register", label: "영수증/계약서 자동등록" },
      { href: "/dashboard/resolution", label: "지출결의서 출력" },
    ]},
    { group: "보고관리", items: [
      { href: "/dashboard/settlement", label: "결산작업" },
      { href: "/dashboard/submit", label: "제출파일생성" },
      { href: "/dashboard/estate", label: "재산내역관리" },
      { href: "/dashboard/asset-report", label: "재산명세서" },
      { href: "/dashboard/income-expense-report", label: "정치자금 수입지출보고서" },
      { href: "/dashboard/income-expense-book", label: "정치자금 수입지출부" },
      { href: "/dashboard/reports", label: "보고서 및 수입지출부 출력" },
      { href: "/dashboard/audit", label: "감사의견서 등 출력" },
      { href: "/dashboard/forms", label: "서식 템플릿 출력" },
    ]},
    { group: "시스템관리", items: [
      { href: "/dashboard/backup", label: "자료 백업 및 복구" },
      { href: "/dashboard/reset", label: "자료초기화" },
      { href: "/dashboard/codes", label: "코드관리" },
    ]},
  ],
  candidate: [
    { group: "기본자료관리", items: [
      { href: "/dashboard/organ", label: "사용기관관리" },
      { href: "/dashboard/customer", label: "수입지출처관리" },
      { href: "/dashboard/customer-batch", label: "수입지출처 일괄등록" },
    ]},
    { group: "정치자금관리", items: [
      { href: "/dashboard/income", label: "수입내역관리" },
      { href: "/dashboard/expense", label: "지출내역관리" },
      { href: "/dashboard/batch-import", label: "수입지출내역 일괄등록" },
      { href: "/dashboard/document-register", label: "영수증/계약서 자동등록" },
      { href: "/dashboard/resolution", label: "지출결의서 출력" },
    ]},
    { group: "보고관리", items: [
      { href: "/dashboard/settlement", label: "결산작업" },
      { href: "/dashboard/submit", label: "제출파일생성" },
      { href: "/dashboard/estate", label: "재산내역관리" },
      { href: "/dashboard/asset-report", label: "재산명세서" },
      { href: "/dashboard/income-expense-report", label: "정치자금 수입지출보고서" },
      { href: "/dashboard/income-expense-book", label: "정치자금 수입지출부" },
      { href: "/dashboard/reimbursement", label: "정치자금 수입지출부 보전비용" },
      { href: "/dashboard/reports", label: "보고서 및 수입지출부 출력" },
      { href: "/dashboard/audit", label: "감사의견서 등 출력" },
      { href: "/dashboard/forms", label: "서식 템플릿 출력" },
    ]},
    { group: "시스템관리", items: [
      { href: "/dashboard/backup", label: "자료 백업 및 복구" },
      { href: "/dashboard/reset", label: "자료초기화" },
      { href: "/dashboard/codes", label: "코드관리" },
    ]},
  ],
  supporter: [
    { group: "기본자료관리", items: [
      { href: "/dashboard/organ", label: "사용기관관리" },
      { href: "/dashboard/customer", label: "수입지출처관리" },
      { href: "/dashboard/customer-batch", label: "수입지출처 일괄등록" },
    ]},
    { group: "정치자금관리", items: [
      { href: "/dashboard/income", label: "수입내역관리" },
      { href: "/dashboard/expense", label: "지출내역관리" },
      { href: "/dashboard/batch-import", label: "수입지출내역 일괄등록" },
      { href: "/dashboard/document-register", label: "영수증/계약서 자동등록" },
      { href: "/dashboard/resolution", label: "지출결의서 출력" },
    ]},
    { group: "보고관리", items: [
      { href: "/dashboard/settlement", label: "결산작업" },
      { href: "/dashboard/submit", label: "제출파일생성" },
      { href: "/dashboard/estate", label: "재산내역관리" },
      { href: "/dashboard/asset-report", label: "재산명세서" },
      { href: "/dashboard/supporter-summary", label: "후원회 수입지출 총괄표" },
      { href: "/dashboard/reports", label: "보고서 및 수입지출부 출력" },
      { href: "/dashboard/donors", label: "후원금 기부자 조회" },
      { href: "/dashboard/audit", label: "감사의견서 등 출력" },
      { href: "/dashboard/forms", label: "서식 템플릿 출력" },
    ]},
    { group: "시스템관리", items: [
      { href: "/dashboard/backup", label: "자료 백업 및 복구" },
      { href: "/dashboard/reset", label: "자료초기화" },
      { href: "/dashboard/codes", label: "코드관리" },
    ]},
  ],
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, orgName, orgType, orgId, orgSecCd, setUser } = useAuth();

  const ORG_TYPE_LABELS: Record<number, string> = {
    50: "중앙당", 51: "정책연구소", 52: "시도당", 53: "정당선거사무소",
    54: "국회의원", 90: "(예비)후보자", 106: "경선후보자",
    91: "대통령선거후보자후원회", 92: "국회의원후원회",
    107: "대통령선거경선후보자후원회", 108: "당대표경선후보자후원회",
    109: "(예비)후보자후원회", 587: "중앙당후원회", 588: "중앙당창당준비위원회후원회",
  };
  const { isEnabled, toggle } = useHelpMode();
  const [hydrated, setHydrated] = useState(false);

  // Wait for Zustand persist hydration (callback-only, no sync setState)
  useEffect(() => {
    const persist = useAuth.persist;
    if (!persist?.onFinishHydration) {
      // Fallback: no persist API (SSR) → use timeout
      const t = setTimeout(() => setHydrated(true), 50);
      return () => clearTimeout(t);
    }
    if (persist.hasHydrated?.()) {
      // Already hydrated → notify via microtask (avoids sync setState in effect)
      Promise.resolve().then(() => setHydrated(true));
      return;
    }
    return persist.onFinishHydration(() => setHydrated(true));
  }, []);

  // Recover Supabase session or redirect
  useEffect(() => {
    if (!hydrated) return;
    if (!orgId) {
      router.replace("/");
      return;
    }
    if (!user) {
      const supabase = createSupabaseBrowser();
      supabase.auth.getUser().then(({ data }) => {
        if (data.user) {
          setUser(data.user);
        } else {
          useAuth.getState().clear();
          router.push("/login");
        }
      });
    }
  }, [hydrated, user, orgId, setUser, router]);

  const menuGroups = orgType ? MENU_ITEMS[orgType] : [];

  // Show nothing while hydrating or redirecting
  if (!hydrated || !orgId) {
    return null;
  }

  async function handleLogout() {
    const supabase = createSupabaseBrowser();
    await supabase.auth.signOut();
    useAuth.getState().clear();
    router.push("/login");
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* 사이드바 */}
      <aside className="w-64 bg-white border-r overflow-y-auto flex-shrink-0">
        <div className="p-4 border-b">
          <Link href="/dashboard" className="font-bold text-lg hover:text-blue-700 transition-colors">정치자금 회계관리</Link>
          <p className="text-sm font-bold text-black truncate">{orgName || "기관 미선택"}</p>
          {orgSecCd && <p className="text-xs font-semibold text-blue-700">{ORG_TYPE_LABELS[orgSecCd] || ""}</p>}
          <Link href="/select-organ" className="text-xs text-blue-500 hover:underline mt-1 inline-block">
            사용기관 전환/추가
          </Link>
        </div>
        <nav className="p-2">
          {menuGroups.map((group) => (
            <div key={group.group} className="mb-3">
              <h3 className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase">
                {group.group}
              </h3>
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block px-3 py-2 text-sm rounded hover:bg-gray-100 transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      {/* 메인 콘텐츠 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 헤더 */}
        <header className="h-14 border-b bg-white flex items-center justify-between px-6 flex-shrink-0">
          <div />
          <div className="flex items-center gap-4">
            <HelpTooltip id="help.toggle">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">도움말</span>
                <Switch checked={isEnabled} onCheckedChange={toggle} />
              </div>
            </HelpTooltip>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              로그아웃
            </Button>
          </div>
        </header>

        {/* 페이지 콘텐츠 */}
        <main className="flex-1 overflow-y-auto p-6">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
      <ChatBubble />
    </div>
  );
}
