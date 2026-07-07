"use client";

/**
 * 마법사 스텝 0 — 트랙 선택(FR-1). 큰 카드 2개: 수입·지출보고서 / 선거비용 보전신청서.
 * 보전 트랙은 후보자 전용(선거비용 보전은 후보자만 청구).
 */
import { Button } from "@/components/ui/button";
import type { WizardTrack } from "./wizard-types";

interface Props {
  orgType: string | null;
  onSelect: (track: WizardTrack) => void;
}

export default function TrackSelectStep({ orgType, onSelect }: Props) {
  const isCandidate = orgType === "candidate";
  const isSupporter = orgType === "supporter";

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-3 rounded-lg border bg-white p-6">
        <div className="text-3xl">📊</div>
        <h3 className="text-lg font-bold">정치자금 수입·지출보고서</h3>
        <p className="text-sm text-muted-foreground">
          선관위에 제출하는 회계보고서 묶음입니다. 선거(회계기간)가 끝난 뒤 정기 보고에 사용합니다.
        </p>
        <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
          {isSupporter ? (
            <>
              <li>후원회 회계보고서 서식(서식8·23-1~11·20) — 빈 양식</li>
              <li>정치자금 수입·지출부 Excel — 데이터 자동 채움</li>
            </>
          ) : (
            <>
              <li>회계장부(서식7)·회계보고서(22-1~22-4) — 데이터 자동 채움</li>
              <li>정치자금 수입·지출부 Excel — 데이터 자동 채움</li>
            </>
          )}
        </ul>
        <Button className="mt-auto" onClick={() => onSelect("report")}>
          수입·지출보고서 만들기
        </Button>
      </div>

      <div className={`flex flex-col gap-3 rounded-lg border bg-white p-6 ${isCandidate ? "" : "opacity-60"}`}>
        <div className="text-3xl">💰</div>
        <h3 className="text-lg font-bold">선거비용 보전신청서</h3>
        <p className="text-sm text-muted-foreground">
          보전 대상으로 체크한 선거비용을 자금원별로 집계해 보전청구서(서식43)와 첨부서류목록을
          만듭니다. 당선·유효득표 요건 충족 시 선거비용을 돌려받는 절차입니다.
        </p>
        <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
          <li>선거비용 보전청구서(서식43) — 자금원별 청구액 자동 집계</li>
          <li>보전 첨부서류목록 — 항목별 자동 분류</li>
        </ul>
        {isCandidate ? (
          <Button className="mt-auto" onClick={() => onSelect("reimburse")}>
            보전신청서 만들기
          </Button>
        ) : (
          <p className="mt-auto rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            선거비용 보전은 (예비)후보자 기관에서만 신청할 수 있습니다.
          </p>
        )}
      </div>
    </div>
  );
}
