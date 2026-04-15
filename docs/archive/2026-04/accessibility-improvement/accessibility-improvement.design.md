# 접근성개선 — Design Document

> Plan 참조: `docs/01-plan/features/accessibility-improvement.plan.md`

---

## 1. 구현 순서 (Implementation Order)

| # | 작업 | 신규/수정 | 의존성 | 난이도 |
|---|------|---------|--------|-------|
| 1 | `stores/beginner-mode.ts` — 초보자 모드 스토어 | 신규 | 없음 | 낮음 |
| 2 | `/api/system/workflow-status/route.ts` — 업무 진행 API | 신규 | 없음 | 중간 |
| 3 | `components/workflow-progress.tsx` — 업무순서 진행 컴포넌트 | 신규 | 1, 2 | 중간 |
| 4 | `components/page-guide.tsx` — 페이지 인라인 가이드 | 신규 | 1 | 낮음 |
| 5 | `lib/page-guides.ts` — 페이지별 가이드 데이터 | 신규 | 없음 | 낮음 |
| 6 | `components/empty-state.tsx` — 빈 상태 컴포넌트 | 신규 | 없음 | 낮음 |
| 7 | `dashboard/layout.tsx` — 사이드바 초보자 모드 통합 | 수정 | 1, 2 | 중간 |
| 8 | `dashboard/page.tsx` — 대시보드에 WorkflowProgress 추가 | 수정 | 3 | 낮음 |
| 9 | P0 페이지 통합 (income, expense, customer, organ) | 수정 | 4, 5, 6 | 중간 |
| 10 | P1 페이지 통합 (settlement, estate, reports 등) | 수정 | 9 | 중간 |
| 11 | `lib/help-texts.ts` — 도움말 항목 보충 | 수정 | 없음 | 낮음 |
| 12 | ChatBubble 페이지 컨텍스트 강화 | 수정 | 없음 | 낮음 |

---

## 2. 파일별 상세 설계

### 2.1 `app/src/stores/beginner-mode.ts` (신규)

기존 `help-mode.ts`를 대체하여 초보자 모드 전체를 관리.

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface WorkflowStep {
  id: string;
  label: string;
  completed: boolean;
  count?: number;
  href: string;
  wizardHref?: string;
}

interface BeginnerModeState {
  isEnabled: boolean;
  toggle: () => void;
  workflowSteps: WorkflowStep[] | null;
  currentStepId: string | null;
  setWorkflow: (steps: WorkflowStep[], currentStep: string) => void;
  collapsedGuides: Record<string, boolean>; // pageId → collapsed
  setGuideCollapsed: (pageId: string, collapsed: boolean) => void;
}

export const useBeginnerMode = create<BeginnerModeState>()(
  persist(
    (set) => ({
      isEnabled: true,
      toggle: () => set((s) => ({ isEnabled: !s.isEnabled })),
      workflowSteps: null,
      currentStepId: null,
      setWorkflow: (steps, currentStep) =>
        set({ workflowSteps: steps, currentStepId: currentStep }),
      collapsedGuides: {},
      setGuideCollapsed: (pageId, collapsed) =>
        set((s) => ({
          collapsedGuides: { ...s.collapsedGuides, [pageId]: collapsed },
        })),
    }),
    {
      name: "beginner-mode",
      // help-mode 마이그레이션: 기존 help-mode 키에서 isEnabled 읽기
      migrate: (persistedState: unknown) => {
        const state = persistedState as BeginnerModeState;
        // 기존 help-mode localStorage 값이 있으면 읽어서 마이그레이션
        try {
          const oldHelpMode = localStorage.getItem("help-mode");
          if (oldHelpMode && !localStorage.getItem("beginner-mode")) {
            const parsed = JSON.parse(oldHelpMode);
            if (parsed?.state?.isEnabled !== undefined) {
              state.isEnabled = parsed.state.isEnabled;
            }
          }
        } catch { /* ignore */ }
        return state;
      },
      version: 1,
    }
  )
);
```

**기존 `help-mode.ts`와의 관계:**
- `help-tooltip.tsx`가 `useHelpMode`를 import하는 부분을 `useBeginnerMode`로 변경
- `help-mode.ts` 파일은 삭제하지 않고, re-export로 호환성 유지:

```typescript
// stores/help-mode.ts (수정 — re-export)
import { useBeginnerMode } from "./beginner-mode";
export const useHelpMode = () => {
  const { isEnabled, toggle } = useBeginnerMode();
  return { isEnabled, toggle };
};
```

### 2.2 `/api/system/workflow-status/route.ts` (신규)

```typescript
// app/src/app/api/system/workflow-status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 조직유형별 업무 흐름 정의
const WORKFLOW_DEFINITIONS: Record<string, string[]> = {
  party:     ["organ", "customer", "income", "expense", "estate", "settlement", "reports", "backup"],
  lawmaker:  ["organ", "customer", "income", "expense", "estate", "reports", "backup"],
  candidate: ["organ", "customer", "income", "expense", "estate", "reports", "backup"],
  supporter: ["organ", "customer", "income", "expense", "estate", "donors", "reports", "backup"],
};

const STEP_META: Record<string, { label: string; href: string; wizardHref?: string }> = {
  organ:      { label: "사용기관관리", href: "/dashboard/organ" },
  customer:   { label: "수입지출처 등록", href: "/dashboard/customer" },
  income:     { label: "수입 등록", href: "/dashboard/income", wizardHref: "/dashboard/wizard" },
  expense:    { label: "지출 등록", href: "/dashboard/expense", wizardHref: "/dashboard/wizard" },
  estate:     { label: "재산관리", href: "/dashboard/estate" },
  settlement: { label: "결산작업", href: "/dashboard/settlement" },
  donors:     { label: "기부자 조회", href: "/dashboard/donors" },
  reports:    { label: "보고서 출력", href: "/dashboard/reports" },
  backup:     { label: "자료 백업", href: "/dashboard/backup" },
};

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("orgId");
  const orgType = req.nextUrl.searchParams.get("orgType") || "candidate";

  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  const numOrgId = Number(orgId);
  const stepIds = WORKFLOW_DEFINITIONS[orgType] || WORKFLOW_DEFINITIONS.candidate;

  // 단일 쿼리로 모든 카운트 조회
  const [customerRes, incomeRes, expenseRes, estateRes] = await Promise.all([
    supabase.from("customer").select("cust_id", { count: "exact", head: true }).eq("org_id", numOrgId),
    supabase.from("acc_book").select("acc_book_id", { count: "exact", head: true }).eq("org_id", numOrgId).eq("incm_sec_cd", 1),
    supabase.from("acc_book").select("acc_book_id", { count: "exact", head: true }).eq("org_id", numOrgId).eq("incm_sec_cd", 2),
    supabase.from("estate").select("estate_id", { count: "exact", head: true }).eq("org_id", numOrgId),
  ]);

  const counts: Record<string, number> = {
    organ: 1,  // orgId가 있으므로 항상 완료
    customer: customerRes.count ?? 0,
    income: incomeRes.count ?? 0,
    expense: expenseRes.count ?? 0,
    estate: estateRes.count ?? 0,
    settlement: 0, // 결산은 별도 플래그 필요 (향후)
    donors: 0,
    reports: 0,
    backup: 0,
  };

  const steps = stepIds.map((id) => ({
    id,
    ...STEP_META[id],
    completed: counts[id] > 0,
    count: counts[id],
  }));

  // 현재 단계: 첫 번째 미완료 단계
  const currentStep = steps.find((s) => !s.completed)?.id || steps[steps.length - 1].id;

  return NextResponse.json({ steps, currentStep, orgType });
}
```

**성능:**
- `Promise.all`로 4개 count 쿼리 병렬 실행
- `head: true`로 데이터 전송 최소화 (카운트만)
- 대시보드 진입 시 1회 호출, `BeginnerModeStore`에 캐시

### 2.3 `components/workflow-progress.tsx` (신규)

```typescript
// app/src/components/workflow-progress.tsx
"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useAuth } from "@/stores/auth";
import { useBeginnerMode, type WorkflowStep } from "@/stores/beginner-mode";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function WorkflowProgress() {
  const { isEnabled, workflowSteps, currentStepId, setWorkflow } = useBeginnerMode();
  const { orgId, orgType } = useAuth();

  useEffect(() => {
    if (!isEnabled || !orgId || !orgType) return;
    fetch(`/api/system/workflow-status?orgId=${orgId}&orgType=${orgType}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.steps) setWorkflow(data.steps, data.currentStep);
      })
      .catch(() => {});
  }, [isEnabled, orgId, orgType, setWorkflow]);

  if (!isEnabled || !workflowSteps) return null;

  const currentStep = workflowSteps.find((s) => s.id === currentStepId);

  return (
    <Card className="border-border bg-surface">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-text-muted">
          회계 업무 진행 현황
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Stepper */}
        <div className="flex items-center gap-1 mb-4 overflow-x-auto">
          {workflowSteps.map((step, i) => (
            <StepDot key={step.id} step={step} index={i} isCurrent={step.id === currentStepId} />
          ))}
        </div>

        {/* 현재 단계 안내 */}
        {currentStep && !currentStep.completed && (
          <div className="bg-info-bg rounded-lg p-3 text-sm">
            <p className="text-text font-medium mb-1">
              현재 단계: {currentStep.label}
            </p>
            <p className="text-text-muted text-xs mb-2">
              {getStepDescription(currentStep.id)}
            </p>
            <div className="flex gap-2">
              {currentStep.wizardHref && (
                <Button size="sm" variant="default" asChild>
                  <Link href={currentStep.wizardHref}>간편등록 마법사로 시작</Link>
                </Button>
              )}
              <Button size="sm" variant="outline" asChild>
                <Link href={currentStep.href}>{currentStep.label}에서 직접 등록</Link>
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StepDot({ step, index, isCurrent }: {
  step: WorkflowStep; index: number; isCurrent: boolean;
}) {
  const dotClass = step.completed
    ? "bg-success text-white"
    : isCurrent
    ? "bg-primary text-white"
    : "bg-border text-text-muted";

  return (
    <Link href={step.href} className="flex flex-col items-center min-w-[60px] group">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${dotClass} transition-colors`}>
        {step.completed ? "✓" : index + 1}
      </div>
      <span className="text-[11px] text-text-muted mt-1 text-center leading-tight group-hover:text-text transition-colors">
        {step.label.replace(/ /g, "\n")}
      </span>
      {index < 7 && (
        <div className="hidden sm:block absolute" /> // 연결선은 CSS로 처리
      )}
    </Link>
  );
}

function getStepDescription(stepId: string): string {
  const descriptions: Record<string, string> = {
    organ: "사용기관 정보를 확인하고 회계기간을 설정하세요.",
    customer: "수입제공자·지출대상자를 먼저 등록하면 이후 입력이 빠릅니다.",
    income: "후원금, 보조금 등 수입 자료를 등록하세요.",
    expense: "인쇄물, 사무소 임대료 등 지출 자료를 등록하세요.",
    estate: "토지, 건물, 현금 및 예금 등 재산 내역을 등록하세요.",
    settlement: "수입·지출·재산 데이터를 바탕으로 결산을 수행하세요.",
    donors: "후원금 기부자의 한도 초과 여부를 확인하세요.",
    reports: "회계보고 자료를 일괄 출력하세요.",
    backup: "작업 완료 후 반드시 자료를 백업하세요.",
  };
  return descriptions[stepId] || "";
}
```

**레이아웃:**
```
Desktop (≥768px):
┌─────────────────────────────────────────────────────────────┐
│ 회계 업무 진행 현황                                          │
│                                                               │
│  ①✓  ────  ②✓  ────  ③●  ────  ④○  ────  ⑤○  ────  ⑥○    │
│ 사용기관  거래처등록  수입등록   지출등록   재산관리    결산     │
│                                                               │
│  ┌── 현재 단계: 수입 등록 ──────────────────────────────┐    │
│  │ 후원금, 보조금 등 수입 자료를 등록하세요.             │    │
│  │ [간편등록 마법사로 시작] [수입내역관리에서 직접 등록]  │    │
│  └──────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘

Mobile (<768px):
┌────────────────────────┐
│ 회계 업무 진행 현황     │
│                          │
│  ✓ 사용기관관리          │
│  ✓ 수입지출처 등록       │
│  ● 수입 등록  ← 현재    │
│  ○ 지출 등록            │
│  ○ 재산관리             │
│  ○ 결산/보고            │
│                          │
│  [마법사로 시작]         │
└────────────────────────┘
```

### 2.4 `components/page-guide.tsx` (신규)

```typescript
// app/src/components/page-guide.tsx
"use client";

import Link from "next/link";
import { useBeginnerMode } from "@/stores/beginner-mode";
import { Button } from "@/components/ui/button";

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
  const { isEnabled, collapsedGuides, setGuideCollapsed } = useBeginnerMode();

  if (!isEnabled) return null;

  const isCollapsed = collapsedGuides[pageId] ?? false;

  return (
    <div className="bg-info-bg border border-border rounded-lg mb-4 overflow-hidden transition-all duration-150">
      {/* 헤더 (항상 표시) */}
      <button
        onClick={() => setGuideCollapsed(pageId, !isCollapsed)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-info-bg/80 transition-colors"
        aria-expanded={!isCollapsed}
        aria-controls={`guide-${pageId}`}
      >
        <span className="text-sm font-medium text-text">
          {title}
        </span>
        <span className="text-xs text-text-muted">
          {isCollapsed ? "자세히 보기" : "접기"}
        </span>
      </button>

      {/* 콘텐츠 (접기 가능) */}
      {!isCollapsed && (
        <div id={`guide-${pageId}`} className="px-4 pb-3 text-sm" role="complementary" aria-label={title}>
          <p className="text-text-muted mb-2">{summary}</p>

          {/* 핵심 흐름 */}
          <div className="mb-2">
            <p className="text-xs font-semibold text-text mb-1">핵심 흐름:</p>
            <ol className="list-decimal list-inside text-xs text-text-muted space-y-0.5">
              {steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>

          {/* TIP */}
          {tips && tips.length > 0 && (
            <div className="mb-2">
              {tips.map((tip, i) => (
                <p key={i} className="text-xs text-text-muted">
                  <span className="font-semibold">TIP:</span> {tip}
                </p>
              ))}
            </div>
          )}

          {/* 마법사 링크 */}
          <div className="flex items-center gap-2 mt-2">
            {wizardLink && (
              <Button size="sm" variant="outline" asChild className="text-xs h-7">
                <Link href={wizardLink}>간편등록 마법사로 이동</Link>
              </Button>
            )}
            {refPage && (
              <span className="text-[11px] text-text-muted">
                선관위 프로그램 대응: 도움말 {refPage}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

### 2.5 `lib/page-guides.ts` (신규)

```typescript
// app/src/lib/page-guides.ts

export interface PageGuideData {
  pageId: string;
  title: string;
  summary: string;
  steps: string[];
  tips: string[];
  wizardLink?: string;
  refPage?: string;
}

export const PAGE_GUIDES: Record<string, PageGuideData> = {
  income: {
    pageId: "income",
    title: "수입내역관리 안내",
    summary: "후원금, 보조금 등 수입 자료를 등록·조회·수정하는 화면입니다.",
    steps: [
      "[신규입력] 클릭 → 계정·과목 선택 → 수입제공자·금액 입력 → [저장]",
      "목록에서 자료 클릭 → 상단에서 수정 → [저장]",
      "자료 선택 → [삭제] (로그인 중 복구 가능)",
    ],
    tips: [
      "계정·과목이 어렵다면 '간편등록 마법사'를 이용하세요.",
      "후원금 한도 초과 시 경고가 나타나지만 저장은 가능합니다.",
    ],
    wizardLink: "/dashboard/wizard",
    refPage: "p.23-30",
  },
  expense: {
    pageId: "expense",
    title: "지출내역관리 안내",
    summary: "인쇄물, 사무소 임대료 등 지출 자료를 등록·조회·수정하는 화면입니다.",
    steps: [
      "[신규입력] 클릭 → 계정·과목 선택 → 지출유형·지출방법 선택 → 지출대상자·금액 입력 → [저장]",
      "목록에서 자료 클릭 → 상단에서 수정 → [저장]",
      "증빙파일 첨부: 파일 선택 후 자동 업로드",
    ],
    tips: [
      "지출유형은 대분류 → 중분류 → 소분류 순서로 선택합니다.",
      "'간편등록 마법사'에서는 카드 선택만으로 지출유형이 자동 설정됩니다.",
    ],
    wizardLink: "/dashboard/wizard",
    refPage: "p.32-37",
  },
  customer: {
    pageId: "customer",
    title: "수입지출처관리 안내",
    summary: "수입제공자(후원자)와 지출대상자(거래처)를 등록·관리하는 화면입니다.",
    steps: [
      "[신규입력] 클릭 → 구분·성명·생년월일/사업자번호 입력 → [저장]",
      "주소는 [주소검색] 버튼으로 우체국 API 검색 가능",
      "수입/지출 내역이 있는 거래처는 삭제할 수 없습니다.",
    ],
    tips: [
      "거래처를 미리 등록해두면 수입/지출 입력 시 검색이 빠릅니다.",
      "엑셀 일괄등록도 가능합니다 (수입지출처 일괄등록 메뉴).",
    ],
    refPage: "p.20",
  },
  organ: {
    pageId: "organ",
    title: "사용기관관리 안내",
    summary: "회계를 관리할 사용기관의 정보를 설정하는 화면입니다. 최초 1회 설정합니다.",
    steps: [
      "사용기관 구분, 기관명, 사업자번호 확인",
      "당해 회계기간 설정 (수입/지출 일자 입력 가능 범위)",
      "수정 후 [저장] → 반영을 위해 로그아웃 후 재로그인",
    ],
    tips: ["회계기간은 수입/지출 일자의 입력 가능 범위를 결정합니다."],
    refPage: "p.19",
  },
  settlement: {
    pageId: "settlement",
    title: "결산작업 안내",
    summary: "회계기간의 수입·지출·재산 데이터를 종합하여 결산을 수행합니다.",
    steps: [
      "결산기간(시작일~종료일) 입력 → [결산] 클릭",
      "수입액, 지출액, 잔액, 재산 총액 확인",
      "잔액과 현금및예금 금액이 다르면 경고 표시",
    ],
    tips: ["결산 전에 수입/지출/재산 내역이 모두 등록되어 있어야 합니다."],
    refPage: "p.43-48",
  },
  estate: {
    pageId: "estate",
    title: "재산내역관리 안내",
    summary: "토지, 건물, 현금 및 예금 등 재산 내역을 등록·관리합니다.",
    steps: [
      "재산구분(토지/건물/비품/현금및예금 등) 선택",
      "종류, 수량, 내용, 금액 입력 → [저장]",
      "차입금은 양(+) 금액으로 입력하면 자동 음(-) 처리",
    ],
    tips: ["결산 시 재산 총액이 잔액과 일치해야 합니다."],
    refPage: "p.43",
  },
  reports: {
    pageId: "reports",
    title: "보고서 및 수입지출부 출력 안내",
    summary: "회계보고용 공식 서식을 일괄 또는 개별 출력합니다.",
    steps: [
      "출력할 보고서 종류 선택 (수입부, 지출부, 총괄표 등)",
      "[출력] 또는 [엑셀] 버튼으로 다운로드",
      "일괄출력: 모든 보고서를 한 번에 생성",
    ],
    tips: ["결산 완료 후 출력하는 것을 권장합니다."],
    refPage: "p.49-67",
  },
  "document-register": {
    pageId: "document-register",
    title: "영수증/계약서 자동등록 안내",
    summary: "영수증이나 계약서 이미지를 업로드하면 AI가 내용을 자동 인식하여 등록합니다.",
    steps: [
      "이미지 파일 선택 (영수증, 계약서, 카드전표 등)",
      "AI가 날짜·금액·거래처·내역 자동 인식",
      "인식 결과 확인 후 [등록] 클릭",
    ],
    tips: ["선명한 이미지일수록 인식률이 높습니다."],
  },
  "batch-import": {
    pageId: "batch-import",
    title: "수입지출내역 일괄등록 안내",
    summary: "엑셀 파일로 수입/지출 내역을 한 번에 대량 등록합니다.",
    steps: [
      "엑셀 양식 다운로드 → 양식에 맞춰 데이터 입력",
      "파일 업로드 → [저장 전 자료확인] 클릭으로 오류 검증",
      "오류 없으면 [저장] → 일괄 등록 완료",
    ],
    tips: [
      "양식의 유의사항을 삭제하지 마세요.",
      "오류가 있으면 오류 내용을 엑셀로 다운로드하여 수정할 수 있습니다.",
    ],
    refPage: "p.38-42",
  },
};
```

### 2.6 `components/empty-state.tsx` (신규)

```typescript
// app/src/components/empty-state.tsx
"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

interface EmptyStateAction {
  label: string;
  href: string;
  variant?: "default" | "outline";
}

interface EmptyStateProps {
  icon?: string;        // 이모지 아이콘
  title: string;        // "아직 수입 내역이 없습니다"
  description: string;  // 추가 안내 문구
  actions: EmptyStateAction[];
}

export function EmptyState({ icon = "📋", title, description, actions }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center" role="status">
      <span className="text-4xl mb-3" aria-hidden="true">{icon}</span>
      <h3 className="text-base font-semibold text-text mb-1">{title}</h3>
      <p className="text-sm text-text-muted mb-4 max-w-sm">{description}</p>
      <div className="flex gap-2">
        {actions.map((action) => (
          <Button
            key={action.href}
            size="sm"
            variant={action.variant || "default"}
            asChild
          >
            <Link href={action.href}>{action.label}</Link>
          </Button>
        ))}
      </div>
    </div>
  );
}
```

**DESIGN.md 준수 — Empty states 규칙:**
> "따뜻한 문구 + 주요 액션 버튼 + 맥락 설명 (절대 '데이터 없음'만 표시하지 않음)"

### 2.7 `dashboard/layout.tsx` (수정)

**변경 요약:**
1. `useHelpMode` → `useBeginnerMode`로 교체
2. "도움말" 스위치 → "초보자 모드" 스위치로 변경
3. 사이드바 메뉴에 업무순서 배지 추가
4. 비활성 메뉴 클릭 시 토스트 표시

**주요 변경 코드:**

```typescript
// import 변경
import { useBeginnerMode } from "@/stores/beginner-mode";
// import { useHelpMode } from "@/stores/help-mode";  ← 삭제

// 컴포넌트 내부
const { isEnabled, toggle, workflowSteps, currentStepId } = useBeginnerMode();

// 업무순서 → 메뉴 매핑
const STEP_TO_MENU: Record<string, string> = {
  organ: "/dashboard/organ",
  customer: "/dashboard/customer",
  income: "/dashboard/income",
  expense: "/dashboard/expense",
  estate: "/dashboard/estate",
  settlement: "/dashboard/settlement",
  donors: "/dashboard/donors",
  reports: "/dashboard/reports",
  backup: "/dashboard/backup",
};

function getStepForHref(href: string): WorkflowStep | undefined {
  if (!workflowSteps) return undefined;
  const stepId = Object.entries(STEP_TO_MENU).find(([, h]) => h === href)?.[0];
  return stepId ? workflowSteps.find((s) => s.id === stepId) : undefined;
}
```

**사이드바 메뉴 렌더링 변경 (초보자 모드 ON):**

```tsx
{group.items.map((item) => {
  const step = isEnabled ? getStepForHref(item.href) : undefined;
  const stepIndex = step ? workflowSteps!.indexOf(step) : -1;

  return (
    <Link
      key={item.href}
      href={item.href}
      className={`block px-3 py-2 text-sm rounded hover:bg-gray-100 transition-colors
        ${isEnabled && step && !step.completed && currentStepId !== step.id
          ? "opacity-50" : ""}`}
    >
      <span className="flex items-center gap-2">
        {/* 초보자 모드: 순서 배지 */}
        {isEnabled && step && (
          <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-medium
            ${step.completed ? "bg-green-100 text-green-700" :
              step.id === currentStepId ? "bg-primary text-white" :
              "bg-gray-100 text-gray-400"}`}
          >
            {step.completed ? "✓" : stepIndex + 1}
          </span>
        )}
        {item.label}
        {/* 마법사 추천 표시 */}
        {isEnabled && item.href === "/dashboard/wizard"
          && workflowSteps?.some(s => (s.id === "income" || s.id === "expense") && !s.completed) && (
          <span className="text-accent text-[10px] font-semibold">추천</span>
        )}
      </span>
    </Link>
  );
})}
```

**헤더 토글 변경:**

```tsx
<div className="flex items-center gap-2">
  <span className="text-sm text-gray-500">초보자 모드</span>
  <Switch checked={isEnabled} onCheckedChange={toggle} />
</div>
```

### 2.8 `dashboard/page.tsx` (수정)

**변경:** `WorkflowProgress` 컴포넌트를 `SummaryCards` 위에 추가.

```tsx
import { WorkflowProgress } from "@/components/workflow-progress";

// return 내부, SummaryCards 위에:
<WorkflowProgress />
<SummaryCards ... />
```

### 2.9 P0 페이지 통합 — `income/page.tsx` (수정 예시)

**PageGuide 추가 (return 최상단):**

```tsx
import { PageGuide } from "@/components/page-guide";
import { EmptyState } from "@/components/empty-state";
import { PAGE_GUIDES } from "@/lib/page-guides";

// return 내부:
const guide = PAGE_GUIDES.income;

return (
  <div className="space-y-4">
    <PageGuide {...guide} />

    {/* 기존 헤더, 폼, 검색 등 */}
    ...

    {/* 빈 상태: records.length === 0 && !loading일 때 */}
    {!loading && records.length === 0 && (
      <EmptyState
        icon="📥"
        title="아직 수입 내역이 없습니다"
        description="수입 자료를 등록하면 여기에 목록이 표시됩니다. 먼저 수입지출처를 등록해두면 입력이 빠릅니다."
        actions={[
          { label: "간편등록 마법사로 시작", href: "/dashboard/wizard" },
          { label: "직접 등록하기", href: "#", variant: "outline" },
        ]}
      />
    )}

    {/* 기존 테이블 (records.length > 0일 때만) */}
    {records.length > 0 && (
      <table>...</table>
    )}
  </div>
);
```

**동일 패턴으로 적용할 페이지와 EmptyState 내용:**

| 페이지 | icon | title | description | Primary CTA | Secondary CTA |
|--------|------|-------|-------------|-------------|---------------|
| income | 📥 | 아직 수입 내역이 없습니다 | 수입 자료를 등록하면 여기에 목록이 표시됩니다. | 간편등록 마법사로 시작 | 직접 등록하기 |
| expense | 📤 | 아직 지출 내역이 없습니다 | 지출 자료를 등록하면 여기에 목록이 표시됩니다. | 간편등록 마법사로 시작 | 직접 등록하기 |
| customer | 👥 | 아직 수입지출처가 없습니다 | 수입제공자·지출대상자를 등록하세요. | 직접 등록하기 | 엑셀 일괄등록 |
| estate | 🏦 | 아직 재산 내역이 없습니다 | 재산 내역을 등록하면 결산에 반영됩니다. | 등록하기 | - |
| settlement | 📊 | 결산 데이터가 없습니다 | 결산하려면 수입/지출 자료가 필요합니다. | 수입 등록 | 지출 등록 |

### 2.10 `lib/help-texts.ts` (수정 — 30개 항목 추가)

추가할 영역과 항목 수:

| 영역 | 추가 항목 수 | 예시 |
|------|-----------|------|
| 대시보드 | 5 | summary.income, summary.expense, summary.balance, workflow.progress, quick-actions |
| 마법사 | 5 | wizard.card-select, wizard.search, wizard.step-indicator, wizard.auto-settings, wizard.mode-toggle |
| 보고관리 | 8 | report.income-book, report.expense-book, report.total-summary, settlement.period, settlement.estate-check, audit.opinion, submit.file-gen, aggregate.method |
| 재산내역 | 4 | estate.kind, estate.qty, estate.content, estate.debt-note |
| 시스템 | 3 | reset.period, reset.warning, codes.version |
| 초보자 모드 | 3 | beginner.toggle, beginner.workflow, beginner.page-guide |
| 기타 | 2 | document-register.ocr, batch-import.template-note |
| **합계** | **30** | |

### 2.11 ChatBubble 페이지 컨텍스트 강화 (수정)

**현재:** `ChatBubble.tsx`가 `pathname`을 `useChat`에 전달하지만, `/api/chat`에서는 일반 RAG만 수행.

**변경:** `useChat` → `/api/chat` 호출 시 pathname에 대응하는 가이드 정보를 시스템 프롬프트에 추가.

```typescript
// hooks/use-chat.ts 변경
// sendMessage 호출 시 currentPage를 body에 포함 (이미 구현됨)

// app/api/chat/route.ts 변경
// 시스템 프롬프트에 추가:
const pageContext = PAGE_CONTEXT[pathname] || "";
const systemPrompt = `
${baseSystemPrompt}

현재 사용자가 보고 있는 화면: ${pathname}
${pageContext}

사용자가 "이 화면에서 어떻게 해야 하나요?" 같은 질문을 하면, 
위 화면 맥락을 우선 참조하여 답변하세요.
`;
```

---

## 3. 상태 흐름도

```
┌────────────────────────────────────────────────────────────────┐
│                        앱 진입                                  │
│                          │                                      │
│                    로그인 / 기관선택                             │
│                          │                                      │
│              ┌──── 대시보드 ────┐                               │
│              │                  │                                │
│    BeginnerMode ON?       BeginnerMode OFF?                     │
│         │                       │                                │
│    WorkflowProgress         일반 대시보드                        │
│    fetch workflow-status    (변경 없음)                          │
│         │                                                        │
│    setWorkflow(steps)                                            │
│         │                                                        │
│  ┌── 사이드바 ──┐                                               │
│  │ 배지 표시     │                                               │
│  │ 비활성 메뉴   │                                               │
│  └─────────────┘                                                │
│         │                                                        │
│    페이지 진입                                                   │
│         │                                                        │
│  ┌─ PageGuide ─┐    ┌─ EmptyState ─┐                           │
│  │ 접기/펼치기   │    │ CTA 버튼      │                           │
│  │ localStorage │    │ records===0   │                           │
│  └─────────────┘    └──────────────┘                            │
│                                                                  │
│              HelpTooltip (기존 유지, isEnabled 연동)              │
│              ChatBubble (pathname 맥락 강화)                      │
└────────────────────────────────────────────────────────────────┘
```

---

## 4. 디자인 토큰 매핑

모든 컴포넌트는 DESIGN.md의 CSS 변수를 사용:

| 컴포넌트 | 요소 | CSS 변수 | 값 |
|---------|------|---------|-----|
| WorkflowProgress | 카드 배경 | var(--surface) | #FFFFFF |
| WorkflowProgress | 완료 dot | var(--success) | #166534 |
| WorkflowProgress | 현재 dot | var(--primary) | #1B3A5C |
| WorkflowProgress | 미완료 dot | var(--border) | #E2E0DC |
| WorkflowProgress | 안내 배경 | var(--info-bg) | #EFF6FF |
| PageGuide | 배경 | var(--info-bg) | #EFF6FF |
| PageGuide | 보더 | var(--border) | #E2E0DC |
| PageGuide | 제목 텍스트 | var(--text) | #1A1A1A |
| PageGuide | 본문 텍스트 | var(--text-muted) | #6B7280 |
| EmptyState | 제목 | var(--text) | #1A1A1A |
| EmptyState | 설명 | var(--text-muted) | #6B7280 |
| EmptyState | Primary CTA | var(--primary) | #1B3A5C |
| EmptyState | 마법사 추천 CTA | var(--accent) | #D4883A |
| 사이드바 배지 완료 | bg | green-100/green-700 | - |
| 사이드바 배지 현재 | bg | var(--primary) | #1B3A5C |
| 사이드바 추천 | text | var(--accent) | #D4883A |
| 비활성 메뉴 | opacity | 0.5 | - |

---

## 5. 접근성 명세

### 5.1 ARIA 속성

| 컴포넌트 | ARIA | 설명 |
|---------|------|------|
| WorkflowProgress | `role="navigation"`, `aria-label="회계 업무 진행 현황"` | 업무 흐름 네비게이션 |
| StepDot (완료) | `aria-label="완료: 사용기관관리"` | 상태 전달 |
| StepDot (현재) | `aria-current="step"`, `aria-label="현재 단계: 수입 등록"` | 현재 위치 |
| PageGuide | `role="complementary"`, `aria-label="{제목}"` | 보충 정보 |
| PageGuide 접기 | `aria-expanded="true/false"`, `aria-controls="guide-{id}"` | 접기 상태 |
| EmptyState | `role="status"` | 상태 메시지 |
| 초보자 모드 Switch | `aria-label="초보자 모드 켜기/끄기"` | 토글 설명 |

### 5.2 키보드 동작

| 요소 | Tab | Enter/Space | Escape |
|------|-----|-------------|--------|
| WorkflowProgress 각 단계 | 포커스 이동 | 해당 페이지 이동 | - |
| PageGuide 접기 버튼 | 포커스 | 접기/펼치기 토글 | - |
| EmptyState CTA 버튼 | 포커스 이동 | 해당 페이지 이동 | - |
| 사이드바 메뉴 | 기존 동작 유지 | 페이지 이동 | - |

### 5.3 색상 대비 (WCAG)

모든 텍스트는 DESIGN.md 토큰 사용으로 AA 이상 보장:
- `--text`(#1A1A1A) on `--info-bg`(#EFF6FF): 대비율 14.3:1 (AAA)
- `--text-muted`(#6B7280) on `--info-bg`(#EFF6FF): 대비율 4.6:1 (AA)
- `--text-muted`(#6B7280) on `--surface`(#FFFFFF): 대비율 5.0:1 (AA)

---

## 6. 테스트 계획

### 6.1 유닛 테스트

| 파일 | 테스트 케이스 |
|------|------------|
| `stores/beginner-mode.test.ts` | toggle ON/OFF, persist, helpMode 마이그레이션, collapsedGuides 관리 |
| `lib/page-guides.test.ts` | 모든 pageId에 대해 필수 필드 존재 확인 |

### 6.2 컴포넌트 테스트

| 파일 | 테스트 케이스 |
|------|------------|
| `workflow-progress.test.tsx` | 초보자 모드 OFF → 미렌더링, 단계 표시, 완료/미완료 시각화, CTA 클릭 |
| `page-guide.test.tsx` | 초보자 모드 OFF → 미렌더링, 접기/펼치기 동작, 마법사 링크 표시 |
| `empty-state.test.tsx` | 아이콘·제목·설명 렌더링, 액션 버튼 클릭 |

### 6.3 API 테스트

| 엔드포인트 | 테스트 케이스 |
|-----------|------------|
| `GET /api/system/workflow-status` | orgId 미입력 → 400, 정상 응답 구조, 조직유형별 단계 차이, 카운트 정확성 |

### 6.4 통합 테스트 (수동)

| 시나리오 | 확인 사항 |
|---------|---------|
| 신규 사용자 첫 로그인 | 초보자 모드 기본 ON, WorkflowProgress 표시, 모든 단계 ○ |
| 수입 1건 등록 후 대시보드 | 수입 단계 ✅, 지출 단계 ● (현재) |
| 초보자 모드 OFF 전환 | 배지 숨김, PageGuide 숨김, 기존 UI 동일 |
| 빈 수입 페이지 진입 | EmptyState 표시, CTA 클릭 동작 |

---

## 7. 기존 코드 영향 분석

### 7.1 삭제 없음 — 하위 호환 보장

| 기존 코드 | 변경 방식 | 호환성 |
|---------|---------|-------|
| `stores/help-mode.ts` | re-export wrapper로 변경 | 기존 import 깨지지 않음 |
| `help-tooltip.tsx` | `useHelpMode` → 내부적으로 `useBeginnerMode` 사용 | 동작 동일 |
| `layout.tsx` MENU_ITEMS | 구조 변경 없음, 렌더링만 확장 | 메뉴 데이터 동일 |
| 각 page.tsx | 최상단에 PageGuide 추가, 테이블 앞에 EmptyState 조건 추가 | 기존 기능 영향 없음 |

### 7.2 신규 파일 목록

```
app/src/
├── stores/beginner-mode.ts          (신규)
├── components/workflow-progress.tsx  (신규)
├── components/page-guide.tsx         (신규)
├── components/empty-state.tsx        (신규)
├── lib/page-guides.ts               (신규)
└── app/api/system/workflow-status/route.ts  (신규)
```

### 7.3 수정 파일 목록

```
app/src/
├── stores/help-mode.ts              (re-export로 변경)
├── components/help-tooltip.tsx       (import 경로 변경)
├── app/dashboard/layout.tsx          (사이드바 + 헤더 변경)
├── app/dashboard/page.tsx            (WorkflowProgress 추가)
├── app/dashboard/income/page.tsx     (PageGuide + EmptyState)
├── app/dashboard/expense/page.tsx    (PageGuide + EmptyState)
├── app/dashboard/customer/page.tsx   (PageGuide + EmptyState)
├── app/dashboard/organ/page.tsx      (PageGuide)
├── app/dashboard/settlement/page.tsx (PageGuide + EmptyState)
├── app/dashboard/estate/page.tsx     (PageGuide + EmptyState)
├── app/dashboard/reports/page.tsx    (PageGuide)
├── app/dashboard/document-register/page.tsx (PageGuide)
├── app/dashboard/batch-import/page.tsx      (PageGuide)
├── lib/help-texts.ts                 (30개 항목 추가)
└── app/api/chat/route.ts             (페이지 컨텍스트 추가)
```
