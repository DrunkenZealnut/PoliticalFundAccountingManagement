"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useAuth } from "@/stores/auth";
import { useBeginnerMode, type WorkflowStep } from "@/stores/beginner-mode";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

const STEP_DESCRIPTIONS: Record<string, string> = {
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

export function WorkflowProgress() {
  const isEnabled = useBeginnerMode((s) => s.isEnabled);
  const workflowSteps = useBeginnerMode((s) => s.workflowSteps);
  const currentStepId = useBeginnerMode((s) => s.currentStepId);
  const setWorkflow = useBeginnerMode((s) => s.setWorkflow);
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

  if (!isEnabled || !workflowSteps || workflowSteps.length === 0) return null;

  const currentStep = workflowSteps.find((s) => s.id === currentStepId);
  const allCompleted = workflowSteps.every((s) => s.completed);

  return (
    <Card className="border" role="navigation" aria-label="회계 업무 진행 현황">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-gray-500">
          회계 업무 진행 현황
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Desktop stepper */}
        <div className="hidden sm:flex items-start justify-between gap-1 mb-4">
          {workflowSteps.map((step, i) => (
            <div key={step.id} className="flex items-center flex-1">
              <StepDot step={step} index={i} isCurrent={step.id === currentStepId} />
              {i < workflowSteps.length - 1 && (
                <div className={`flex-1 h-px mx-1 ${step.completed ? "bg-green-300" : "bg-gray-200"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Mobile list */}
        <div className="sm:hidden space-y-1.5 mb-3">
          {workflowSteps.map((step, i) => (
            <Link
              key={step.id}
              href={step.href}
              className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors
                ${step.id === currentStepId ? "bg-blue-50 font-medium" : "hover:bg-gray-50"}`}
            >
              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-medium shrink-0
                ${step.completed ? "bg-green-100 text-green-700" :
                  step.id === currentStepId ? "bg-[#1B3A5C] text-white" :
                  "bg-gray-100 text-gray-400"}`}
              >
                {step.completed ? "✓" : i + 1}
              </span>
              <span className={step.completed ? "text-gray-500" : "text-gray-900"}>
                {step.label}
              </span>
              {step.id === currentStepId && !step.completed && (
                <span className="text-[10px] text-[#1B3A5C] font-semibold ml-auto">현재</span>
              )}
            </Link>
          ))}
        </div>

        {/* 현재 단계 안내 */}
        {currentStep && !allCompleted && (
          <div className="bg-blue-50 rounded-lg p-3 text-sm">
            <p className="font-medium text-gray-900 mb-0.5">
              현재 단계: {currentStep.label}
            </p>
            <p className="text-gray-500 text-xs mb-2">
              {STEP_DESCRIPTIONS[currentStep.id] || ""}
            </p>
            <div className="flex gap-2 flex-wrap">
              {currentStep.wizardHref && (
                <Link
                  href={currentStep.wizardHref}
                  className={buttonVariants({ size: "sm" })}
                >
                  간편등록 마법사로 시작
                </Link>
              )}
              <Link
                href={currentStep.href}
                className={buttonVariants({ size: "sm", variant: "outline" })}
              >
                {currentStep.label}에서 직접 등록
              </Link>
            </div>
          </div>
        )}

        {allCompleted && (
          <div className="bg-green-50 rounded-lg p-3 text-sm text-green-800">
            모든 업무 단계를 완료했습니다. 자료 백업을 잊지 마세요!
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StepDot({ step, index, isCurrent }: {
  step: WorkflowStep; index: number; isCurrent: boolean;
}) {
  return (
    <Link
      href={step.href}
      className="flex flex-col items-center min-w-[52px] group"
      aria-current={isCurrent ? "step" : undefined}
      aria-label={`${step.completed ? "완료" : isCurrent ? "현재 단계" : "미완료"}: ${step.label}`}
    >
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors
        ${step.completed
          ? "bg-green-100 text-green-700"
          : isCurrent
            ? "bg-[#1B3A5C] text-white"
            : "bg-gray-100 text-gray-400"
        }`}
      >
        {step.completed ? "✓" : index + 1}
      </div>
      <span className="text-[10px] text-gray-500 mt-1 text-center leading-tight group-hover:text-gray-900 transition-colors whitespace-nowrap">
        {step.label}
      </span>
    </Link>
  );
}
