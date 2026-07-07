"use client";

/**
 * 대시보드 배너 — 제출 서류 마법사 진입점(submission-wizard 설계 OQ-5: 배너만).
 * 보전신청서 버튼은 후보자 org 전용, 옛 선거주기 org 는 비활성+안내(OQ-4).
 */
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { useOrgCycleLock } from "@/hooks/use-org-cycle-lock";
import { isOldCycle } from "@/lib/accounting/acc-period";

interface Props {
  orgType: string | null;
}

export function SubmissionWizardBanner({ orgType }: Props) {
  const cycleLock = useOrgCycleLock();
  const blocked = isOldCycle(cycleLock.cycle, cycleLock.currentCycle);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold">📄 제출 서류를 만들 준비가 되셨나요?</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          마법사가 데이터 점검 → 숫자 확인 → 서식 일괄 생성(zip)까지 한 번에 안내합니다.
        </p>
        {blocked && (
          <p className="mt-1 text-xs text-amber-700">
            🔒 옛 선거주기 기관은 제출물 생성이 제한됩니다(조회 전용).
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {blocked ? (
          <>
            <Button size="sm" disabled>
              수입·지출보고서 만들기
            </Button>
            {orgType === "candidate" && (
              <Button size="sm" variant="outline" disabled>
                선거비용 보전신청서 만들기
              </Button>
            )}
          </>
        ) : (
          <>
            <Link href="/dashboard/submission-wizard" className={buttonVariants({ size: "sm" })}>
              수입·지출보고서 만들기
            </Link>
            {orgType === "candidate" && (
              <Link
                href="/dashboard/submission-wizard"
                className={buttonVariants({ size: "sm", variant: "outline" })}
              >
                선거비용 보전신청서 만들기
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}
