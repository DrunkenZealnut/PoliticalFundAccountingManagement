"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Plus, Minus, Users, BookOpen,
  FileText, Receipt, FolderSync, FileDown,
  Search, ClipboardList,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type OrgType = "party" | "lawmaker" | "candidate" | "supporter";

interface QuickAction {
  label: string;
  href: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
}

const COMMON_ACTIONS: QuickAction[] = [
  { label: "수입 등록", href: "/dashboard/income", icon: Plus, color: "text-blue-600", bgColor: "bg-blue-50 dark:bg-blue-950/30" },
  { label: "지출 등록", href: "/dashboard/expense", icon: Minus, color: "text-red-500", bgColor: "bg-red-50 dark:bg-red-950/30" },
  { label: "거래처 관리", href: "/dashboard/customer", icon: Users, color: "text-violet-600", bgColor: "bg-violet-50 dark:bg-violet-950/30" },
  { label: "장부 조회", href: "/dashboard/income-expense-book", icon: BookOpen, color: "text-emerald-600", bgColor: "bg-emerald-50 dark:bg-emerald-950/30" },
];

const ORG_SPECIFIC_ACTIONS: Record<OrgType, QuickAction[]> = {
  party: [
    { label: "결산작업", href: "/dashboard/settlement", icon: ClipboardList, color: "text-amber-600", bgColor: "bg-amber-50 dark:bg-amber-950/30" },
    { label: "당비영수증", href: "/dashboard/party-fee-receipt", icon: Receipt, color: "text-pink-600", bgColor: "bg-pink-50 dark:bg-pink-950/30" },
    { label: "취합작업", href: "/dashboard/aggregation", icon: FolderSync, color: "text-cyan-600", bgColor: "bg-cyan-50 dark:bg-cyan-950/30" },
  ],
  lawmaker: [
    { label: "수입지출 보고서", href: "/dashboard/income-expense-report", icon: FileText, color: "text-amber-600", bgColor: "bg-amber-50 dark:bg-amber-950/30" },
  ],
  candidate: [
    { label: "제출파일 생성", href: "/dashboard/export-db", icon: FileDown, color: "text-amber-600", bgColor: "bg-amber-50 dark:bg-amber-950/30" },
  ],
  supporter: [
    { label: "기부자 조회", href: "/dashboard/donor-search", icon: Search, color: "text-amber-600", bgColor: "bg-amber-50 dark:bg-amber-950/30" },
    { label: "수입지출 총괄표", href: "/dashboard/supporter-summary", icon: FileText, color: "text-pink-600", bgColor: "bg-pink-50 dark:bg-pink-950/30" },
  ],
};

interface QuickActionsProps {
  orgType: OrgType | null;
}

export function QuickActions({ orgType }: QuickActionsProps) {
  const specificActions = orgType ? ORG_SPECIFIC_ACTIONS[orgType] || [] : [];
  const actions = [...COMMON_ACTIONS, ...specificActions];

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">바로가기</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className="group flex flex-col items-center gap-2 rounded-xl border border-transparent px-3 py-4 transition-all hover:border-border hover:bg-muted/50 hover:shadow-sm"
              >
                <div className={`rounded-xl p-2.5 ${action.bgColor} transition-transform group-hover:scale-110`}>
                  <Icon className={`h-5 w-5 ${action.color}`} />
                </div>
                <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                  {action.label}
                </span>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
