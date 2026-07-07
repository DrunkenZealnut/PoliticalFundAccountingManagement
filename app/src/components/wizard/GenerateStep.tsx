"use client";

/**
 * 마법사 스텝 3 — 일괄 생성·zip 다운로드(FR-4, OQ-3=zip).
 * HWPX 는 기존 api/hwpx/* 라우트(generate-form 헬퍼), Excel 은 reports 페이지와
 * 공유하는 build-report-workbook 빌더로 생성한다(생성 로직 신규 0).
 * 실패 서식은 zip 에서 제외하고 경고 목록으로 표면화한다(부분 성공 허용, 은폐 금지).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useHwpxPrefill } from "@/hooks/use-hwpx-prefill";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import type { HwpxFormDef } from "@/lib/hwpx/form-fields";
import { generateFormBlob, downloadBlob } from "@/lib/submission/generate-form";
import { reportFormsFor, reimburseFormsFor } from "@/lib/submission/wizard-forms";
import { buildReportLedgerRecords } from "@/lib/accounting/report-ledger";
import { orgValidRange, ymdToDash } from "@/lib/accounting/acc-period";
import { buildReportCombos } from "@/lib/excel-template/report-combos";
import {
  buildReportWorkbook,
  buildStandardCombos,
  buildDataCombos,
  type AccRecord,
  type Customer,
  type Estate,
} from "@/lib/excel-template/build-report-workbook";
import type { WizardData, WizardTrack } from "./wizard-types";

interface Props {
  track: WizardTrack;
  data: WizardData;
  orgId: number | null;
  orgName: string | null;
  orgSecCd: number | null;
  orgType: string | null;
  acctName: string | null;
  getName: (cvId: number) => string;
  getAccounts: (orgSecCd: number, incmSecCd: number) => { cv_id: number }[];
  getItems: (orgSecCd: number, incmSecCd: number, accSecCd: number) => { cv_id: number }[];
  /** 옛 선거주기 org — 제출물 생성 차단(OQ-4=불가, 잠금해제와 무관) */
  generationBlocked: boolean;
}

const EXCEL_KEY = "excel-report";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

interface GenItem {
  key: string;
  label: string;
  note: string;
  /** 데이터 자동 채움 여부(Badge 표시용) — note 문구 파싱 대신 명시 플래그 */
  autoFill: boolean;
  def?: HwpxFormDef; // 없으면 Excel 항목
}

const todayYmd = () => new Date().toISOString().slice(0, 10).replace(/-/g, "");
const dash = ymdToDash;

export default function GenerateStep({
  track, data, orgId, orgName, orgSecCd, orgType, acctName,
  getName, getAccounts, getItems, generationBlocked,
}: Props) {
  const items = useMemo<GenItem[]>(() => {
    if (track === "reimburse") {
      return reimburseFormsFor(orgType).map((def) => ({
        key: def.id,
        label: `서식 ${def.id} · ${def.label}`,
        note: "데이터 자동 채움",
        autoFill: true,
        def,
      }));
    }
    const forms = reportFormsFor(orgType).map((def) => ({
      key: def.id,
      label: `서식 ${def.id} · ${def.label}`,
      note: def.dataFill ? "데이터 자동 채움" : "빈 양식(수동 작성)",
      autoFill: !!def.dataFill,
      def,
    }));
    return [
      ...forms,
      {
        key: EXCEL_KEY,
        label: "정치자금 수입·지출부 Excel(계정·과목별)",
        note: "데이터 자동 채움",
        autoFill: true,
      },
    ];
  }, [track, orgType]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => setSelected(new Set(items.map((i) => i.key))), [items]);

  // generationBlocked 최신값 추적 — handleGenerate 내부는 호출 시점 클로저라 prop 값이
  // 갱신돼도 루프 안에서 재확인해봤자 같은 값만 본다(CodeRabbit 지적). ref로 최신값 참조.
  const generationBlockedRef = useRef(generationBlocked);
  useEffect(() => {
    generationBlockedRef.current = generationBlocked;
  }, [generationBlocked]);

  // 서식43 수동 필드(선거구명·수령계좌 등) — organ prefill + 사용자 수정 보존
  const form43 = track === "reimburse" ? items.find((i) => i.def?.id === "43")?.def : undefined;
  const { prefill } = useHwpxPrefill();
  const [values, setValues] = useState<Record<string, string>>({});
  const dirtyRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!form43) return;
    const fresh = prefill(form43);
    setValues((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(fresh)) {
        if (!dirtyRef.current.has(k)) next[k] = v;
      }
      return next;
    });
  }, [form43, prefill]);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failures, setFailures] = useState<{ label: string; message: string }[]>([]);
  const [doneNames, setDoneNames] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const missingRequired = useMemo(() => {
    if (!form43 || !selected.has("43")) return [];
    return form43.fields
      .filter((f) => f.required && !String(values[f.token] ?? "").trim())
      .map((f) => f.label);
  }, [form43, selected, values]);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  /**
   * 보고서 트랙 Excel — reports 페이지 handleBatchExcel 과 동일 경로(빌더·재조정 SSOT 공유).
   * acc_book·estate 는 여기서 **생성 시점에 새로 조회**한다(data.records/data.estates 재사용 안 함) —
   * 같은 zip 의 HWPX dataFill 서식(api/hwpx/*)이 서버에서 생성 시점에 새로 조회하는 것과
   * 동일 시점 기준으로 맞춰, 준비→미리보기→생성 사이 거래 변경 시 zip 내부 수치가
   * 어긋나는 것을 방지한다(adversarial review 지적: 스텝1 스냅샷 vs 생성시점 재조회 불일치).
   */
  async function buildExcelEntry(): Promise<{ filename: string; blob: Blob }> {
    const [custRes, accRes, estateRes] = await Promise.all([
      fetch(`/api/customers?orgId=${orgId}`),
      fetch(`/api/acc-book?orgId=${orgId}`),
      createSupabaseBrowser()
        .from("estate")
        .select("*")
        .eq("org_id", orgId)
        .order("estate_sec_cd")
        .order("estate_order"),
    ]);
    if (!custRes.ok) throw new Error("수입지출처 데이터를 불러오지 못했습니다.");
    if (!accRes.ok) throw new Error("회계 데이터를 불러오지 못했습니다.");
    if (estateRes.error) throw new Error("재산 데이터를 불러오지 못했습니다.");
    const custArr: Customer[] = await custRes.json();
    const custMap = new Map<number, Customer>();
    for (const c of custArr) custMap.set(c.cust_id, c);
    const freshRecords = ((await accRes.json()).records ?? []) as Record<string, unknown>[];
    const estates = (estateRes.data ?? []) as Estate[];

    const reportRecords = buildReportLedgerRecords(
      freshRecords,
      getName,
      orgType === "candidate",
    ) as unknown as AccRecord[];

    const std = buildStandardCombos(orgSecCd, getAccounts, getItems);
    const real = buildDataCombos(reportRecords);
    const union = [...std, ...real];
    const combos = buildReportCombos(std, real, {
      selectedAccounts: new Set(union.map((c) => c.accSecCd)),
      selectedIncomeItems: new Set(union.map((c) => c.itemSecCd)),
      selectedExpenseItems: new Set(union.map((c) => c.itemSecCd)),
    });

    const range = orgValidRange(data.period);
    const { buffer } = await buildReportWorkbook({
      records: reportRecords,
      custMap,
      estates,
      combos,
      covers: { accountCover: true, subjectCover: true },
      orgName: orgName || "",
      orgSecCd,
      acctName,
      electionName: "",
      districtName: "",
      dateFrom: range ? dash(range.lo) : "",
      dateTo: range ? dash(range.hi) : "",
      getName,
    });
    return {
      filename: `정치자금수입지출부_${orgName || "기관"}_${todayYmd()}.xlsx`,
      blob: new Blob([buffer], { type: XLSX_MIME }),
    };
  }

  async function handleGenerate() {
    setError(null);
    setFailures([]);
    setDoneNames([]);
    if (generationBlocked) return;
    if (!orgId) {
      setError("사용기관을 먼저 선택하세요.");
      return;
    }
    const targets = items.filter((i) => selected.has(i.key));
    if (targets.length === 0) {
      setError("만들 서류를 하나 이상 선택하세요.");
      return;
    }
    if (missingRequired.length > 0) {
      setError(`보전청구서(서식43) 필수 항목을 입력하세요: ${missingRequired.join(", ")}`);
      return;
    }

    setBusy(true);
    setProgress({ done: 0, total: targets.length });
    const fails: { label: string; message: string }[] = [];
    const okNames: string[] = [];
    const usedFilenames = new Set<string>();
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      for (const item of targets) {
        // 생성이 오래 걸리는 다건 요청 중 옛 주기 잠금 상태가 될 가능성에 대비한 방어적 재확인.
        // ref 참조라 handleGenerate 실행 중에도 최신 잠금 상태를 반영한다.
        if (generationBlockedRef.current) break;
        try {
          const entry = item.def
            ? await generateFormBlob(item.def, {
                orgId,
                values: item.def.id === "43" ? values : undefined,
              })
            : await buildExcelEntry();
          // 서식 라벨이 우연히 같아 파일명이 겹쳐도 zip 내 무음 덮어쓰기가 나지 않도록 방어.
          let filename = entry.filename;
          if (usedFilenames.has(filename)) {
            const dot = filename.lastIndexOf(".");
            filename =
              dot === -1
                ? `${filename}_${item.key}`
                : `${filename.slice(0, dot)}_${item.key}${filename.slice(dot)}`;
          }
          usedFilenames.add(filename);
          zip.file(filename, entry.blob);
          okNames.push(filename);
        } catch (e) {
          fails.push({
            label: item.label,
            message: e instanceof Error ? e.message : "생성 중 오류가 발생했습니다.",
          });
        }
        setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
      }

      if (okNames.length === 0) {
        setError("모든 서류 생성에 실패했습니다. 아래 오류를 확인하세요.");
      } else {
        const zipBlob = await zip.generateAsync({ type: "blob" });
        const zipName =
          track === "report"
            ? `정치자금수입지출보고서_${orgName || "기관"}_${todayYmd()}.zip`
            : `선거비용보전신청서_${orgName || "기관"}_${todayYmd()}.zip`;
        downloadBlob(zipBlob, zipName);
      }
      setDoneNames(okNames);
      setFailures(fails);
    } catch (e) {
      setError(e instanceof Error ? e.message : "생성 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {generationBlocked && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          🔒 이 기관은 옛 선거주기(조회 전용)라 제출물 생성이 제한됩니다. 현재 주기 기관에서
          이용하세요.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">만들 서류 선택</p>
        {items.map((item) => (
          <label
            key={item.key}
            className="flex cursor-pointer items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm"
          >
            <input
              type="checkbox"
              checked={selected.has(item.key)}
              onChange={() => toggle(item.key)}
            />
            <span className="min-w-0 flex-1">{item.label}</span>
            <Badge variant={item.autoFill ? "secondary" : "outline"} className="shrink-0 text-[10px]">
              {item.note}
            </Badge>
          </label>
        ))}
      </div>

      {form43 && selected.has("43") && (
        <div className="flex flex-col gap-3 rounded-md border bg-white p-4">
          <p className="text-sm font-semibold">보전청구서(서식43) 입력 항목</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {form43.fields.map((f) => (
              <div key={f.token} className="flex flex-col gap-1.5">
                <Label htmlFor={`wz-${f.token}`} className="text-sm">
                  {f.label}
                  {f.required && <span className="text-destructive"> *</span>}
                </Label>
                <Input
                  id={`wz-${f.token}`}
                  value={values[f.token] ?? ""}
                  onChange={(e) => {
                    dirtyRef.current.add(f.token);
                    setValues((prev) => ({ ...prev, [f.token]: e.target.value }));
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {failures.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <p className="font-semibold">⚠️ 일부 서류를 만들지 못했습니다(zip 에서 제외):</p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {failures.map((f) => (
              <li key={f.label}>
                {f.label} — {f.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {doneNames.length > 0 && (
        <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          <p className="font-semibold">✅ zip 파일에 담긴 서류 {doneNames.length}건</p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {doneNames.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs">한글(HWPX)·Excel 파일을 열어 내용 확인·날인 후 제출하세요.</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={handleGenerate} disabled={busy || generationBlocked || !orgId}>
          {busy && progress
            ? `생성 중… (${progress.done}/${progress.total})`
            : "선택한 서류 한 번에 만들기 (zip)"}
        </Button>
        <span className="text-xs text-muted-foreground">
          선택한 서류를 모두 생성해 zip 파일 하나로 내려받습니다.
        </span>
      </div>
    </div>
  );
}
