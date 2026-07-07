"use client";

/**
 * 제출 산출물 마법사 — 트랙 선택 → 준비상태 점검(신호등) → 미리보기 → zip 일괄 생성.
 * 마법사는 오케스트레이션·검증·안내만 담당하고, 수치·생성은 전부 기존 SSOT
 * (submission-readiness · settlement-summary · reimbursement-aggregator ·
 *  api/hwpx/* · build-report-workbook)를 재사용한다(설계 §0.1 생성 로직 신규 0).
 * 옛 선거주기 org 는 생성 스텝을 차단한다(OQ-4, 조회·미리보기는 허용).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/stores/auth";
import { useCodeValues } from "@/hooks/use-code-values";
import { useOrgCycleLock } from "@/hooks/use-org-cycle-lock";
import { isOldCycle } from "@/lib/accounting/acc-period";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { PageGuide } from "@/components/page-guide";
import { PAGE_GUIDES } from "@/lib/page-guides";
import {
  buildReportReadiness,
  buildReimburseReadiness,
  type ReadinessResult,
} from "@/lib/accounting/submission-readiness";
import type { ReportSummaryRawRow } from "@/lib/accounting/income-expense-report-summary";
import type { AccBookRow } from "@/lib/accounting/reimbursement-aggregator";
import { sumEstateAmount, CASH_ESTATE_SEC_CD } from "@/lib/accounting/estate-types";
import TrackSelectStep from "@/components/wizard/TrackSelectStep";
import ReadinessStep from "@/components/wizard/ReadinessStep";
import PreviewStep from "@/components/wizard/PreviewStep";
import GenerateStep from "@/components/wizard/GenerateStep";
import type { WizardAccRow, WizardData, WizardTrack } from "@/components/wizard/wizard-types";

const STEPS = ["서류 선택", "준비 점검", "미리보기", "만들기"] as const;

const TRACK_TITLE: Record<WizardTrack, string> = {
  report: "정치자금 수입·지출보고서",
  reimburse: "선거비용 보전신청서",
};

export default function SubmissionWizardPage() {
  const { orgId, orgName, orgSecCd, orgType, acctName } = useAuth();
  const { getName, getAccounts, getItems, loading: codesLoading } = useCodeValues();
  const cycleLock = useOrgCycleLock();
  // OQ-4: 옛 주기면 생성 불가 — 읽기 잠금해제(unlock)와 무관하게 차단
  const generationBlocked = isOldCycle(cycleLock.cycle, cycleLock.currentCycle);

  const [track, setTrack] = useState<WizardTrack | null>(null);
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // in-flight 로드 무효화 토큰 — org 전환·재호출 시 이전 응답이 늦게 도착해도 폐기(G1 레이스 가드)
  const loadSeqRef = useRef(0);

  const loadData = useCallback(async () => {
    if (!orgId) return;
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const sb = createSupabaseBrowser();
      const [accRes, organRes, estateRes, codeRes] = await Promise.all([
        fetch(`/api/acc-book?orgId=${orgId}`),
        sb.from("organ").select("acc_from, acc_to, pre_acc_from").eq("org_id", orgId).maybeSingle(),
        sb.from("estate").select("*").eq("org_id", orgId).order("estate_sec_cd").order("estate_order"),
        sb.from("codevalue").select("cv_id, cv_name"),
      ]);
      if (!accRes.ok) throw new Error("회계 데이터를 불러오지 못했습니다.");
      if (organRes.error) throw new Error("회계기간 정보를 불러오지 못했습니다.");
      if (estateRes.error) throw new Error("재산 정보를 불러오지 못했습니다.");
      if (codeRes.error) throw new Error("코드값 정보를 불러오지 못했습니다.");
      const accJson = await accRes.json();
      const records: WizardAccRow[] = accJson.records || [];

      const estates = (estateRes.data ?? []) as WizardData["estates"];
      const cashRows = estates.filter((e) => e.estate_sec_cd === CASH_ESTATE_SEC_CD);

      const electionExpenseItemCds: number[] = [];
      const accSecCdNames: Record<number, string> = {};
      for (const cv of codeRes.data ?? []) {
        const id = cv.cv_id as number;
        const name = String(cv.cv_name ?? "");
        if (name === "선거비용") electionExpenseItemCds.push(id);
        accSecCdNames[id] = name;
      }

      if (seq !== loadSeqRef.current) return; // stale 응답 폐기
      setData({
        records,
        period: organRes.data ?? {},
        estates,
        estateCashAmount: sumEstateAmount(cashRows),
        estateCount: estates.length,
        electionExpenseItemCds,
        accSecCdNames,
      });
    } catch (e) {
      if (seq !== loadSeqRef.current) return;
      setLoadError(e instanceof Error ? e.message : "데이터를 불러오지 못했습니다.");
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [orgId]);

  // org 전환 시 마법사 초기화(다른 기관 데이터 잔존 방지) + in-flight 로드 무효화
  useEffect(() => {
    loadSeqRef.current++;
    setTrack(null);
    setStep(0);
    setData(null);
    setLoadError(null);
  }, [orgId]);

  const readiness: ReadinessResult | null = useMemo(() => {
    if (!track || !data) return null;
    if (track === "report") {
      return buildReportReadiness({
        rows: data.records as unknown as ReportSummaryRawRow[],
        estateCashAmount: data.estateCashAmount,
        estateCount: data.estateCount,
        period: data.period,
        isCandidate: orgType === "candidate",
      });
    }
    return buildReimburseReadiness({
      rows: data.records as unknown as (AccBookRow & { acc_date?: string | null })[],
      electionExpenseItemCds: data.electionExpenseItemCds,
      accSecCdNames: data.accSecCdNames,
      period: data.period,
    });
  }, [track, data, orgType]);

  function selectTrack(t: WizardTrack) {
    setTrack(t);
    setStep(1);
    loadData();
  }

  function reset() {
    setTrack(null);
    setStep(0);
    setData(null);
  }

  const canNext =
    step === 1 ? !!readiness?.canProceed && !loading : step === 2 ? true : false;

  if (!orgId) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        사용기관을 먼저 선택하세요.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageGuide {...PAGE_GUIDES.submissionWizard} />
      <div>
        <h2 className="text-2xl font-bold">제출 서류 마법사</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {track
            ? `${TRACK_TITLE[track]} — 점검부터 생성까지 한 번에 진행합니다.`
            : "만들 서류를 고르면, 데이터 점검 → 숫자 확인 → 일괄 생성 순서로 안내합니다."}
        </p>
      </div>

      {cycleLock.locked && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          🔒 이 기관은 옛 선거주기입니다(조회 전용). 점검·미리보기는 가능하지만 제출물 생성은
          제한됩니다.
        </p>
      )}

      {/* 진행바 */}
      {track && (
        <ol className="flex items-center gap-1 text-xs sm:gap-2 sm:text-sm">
          {STEPS.map((label, i) => (
            <li key={label} className="flex items-center gap-1 sm:gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                  i < step
                    ? "bg-green-600 text-white"
                    : i === step
                      ? "bg-blue-600 text-white"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {i < step ? "✓" : i + 1}
              </span>
              <span className={i === step ? "font-semibold" : "text-muted-foreground"}>{label}</span>
              {i < STEPS.length - 1 && <span className="text-muted-foreground">—</span>}
            </li>
          ))}
        </ol>
      )}

      {loadError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {loadError}{" "}
          <button className="underline" onClick={loadData}>
            다시 시도
          </button>
        </p>
      )}

      {/* 스텝 본문 */}
      {step === 0 && !codesLoading && <TrackSelectStep orgType={orgType} onSelect={selectTrack} />}
      {step === 1 && <ReadinessStep result={readiness} loading={loading} />}
      {step === 2 && data && track && (
        <PreviewStep track={track} data={data} orgType={orgType} getName={getName} />
      )}
      {step === 3 && data && track && (
        <GenerateStep
          track={track}
          data={data}
          orgId={orgId}
          orgName={orgName}
          orgSecCd={orgSecCd}
          orgType={orgType}
          acctName={acctName}
          getName={getName}
          getAccounts={getAccounts}
          getItems={getItems}
          generationBlocked={generationBlocked}
        />
      )}

      {/* 네비게이션 */}
      {track && (
        <div className="flex items-center justify-between border-t pt-4">
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => (step <= 1 ? reset() : setStep(step - 1))}>
              ← 뒤로
            </Button>
            {step >= 1 && (
              <Button variant="ghost" onClick={reset}>
                처음부터
              </Button>
            )}
          </div>
          {step < 3 && (
            <Button onClick={() => setStep(step + 1)} disabled={!canNext}>
              다음 →
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
