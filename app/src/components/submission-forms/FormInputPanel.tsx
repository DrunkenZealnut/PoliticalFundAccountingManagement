"use client";

/**
 * 선택한 HWPX 서식의 입력 폼. DB 자동 prefill + 수동 보완 → /api/hwpx/generate 호출 → 다운로드.
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { fmtKoreanDate } from "@/lib/hwpx/escape";
import { useAuth } from "@/stores/auth";
import type { HwpxFormDef, HwpxFormField } from "@/lib/hwpx/form-fields";

interface Props {
  def: HwpxFormDef;
  prefill: (def: HwpxFormDef) => Record<string, string>;
}

/** dataFill 서식 → 호출할 데이터 채움 API 경로. */
const DATA_FILL_ENDPOINT: Record<NonNullable<HwpxFormDef["dataFill"]>, string> = {
  "income-ledger": "/api/hwpx/income-ledger",
  "accounting-report": "/api/hwpx/accounting-report",
  "reimbursement": "/api/hwpx/reimbursement-claim",
  "reimbursement-doclist": "/api/hwpx/reimbursement-doclist",
};

/** dataFill 서식 → 안내문구·버튼 라벨. */
const DATA_FILL_TEXT: Record<NonNullable<HwpxFormDef["dataFill"]>, { desc: string; button: string }> = {
  "income-ledger": {
    desc: "수입내역관리에 입력된 데이터로 계정·과목별 회계장부를 자동 생성합니다.",
    button: "수입 데이터로 회계장부 생성",
  },
  "accounting-report": {
    desc: "입력된 수입·지출·재산 데이터로 회계보고서를 자동 생성합니다.",
    button: "데이터로 회계보고서 생성",
  },
  "reimbursement": {
    desc: "보전 체크(보전 대상)된 선거비용을 자금원별로 집계해 선거비용 보전청구서를 채웁니다. 선거구명·수령계좌 등은 아래에 입력하세요.",
    button: "보전청구서 채워 받기",
  },
  "reimbursement-doclist": {
    desc: "보전 체크된 선거비용 지출을 항목(공직선거법 조항)별로 분류해 첨부서류 점검목록표를 자동 생성합니다. 거래업체·보전청구액·첨부증빙 현황이 항목별로 집계됩니다.",
    button: "보전 첨부서류목록 생성",
  },
};

const isAuto = (f: HwpxFormField) => f.source.from === "organ" || f.source.from === "auth" || f.source.from === "const";

/** 필드 타입별 입력 길이 상한 (route.ts MAX_LEN 과 동기화). */
const MAX_LEN: Record<string, number> = { tel: 40, account: 40, date: 20, text: 200, textarea: 1000 };
const maxLenFor = (type: string) => MAX_LEN[type] ?? 200;

const safeFileName = (label: string) => `${label.replace(/[\\/:*?"<>|·\s]+/g, "_")}.hwpx`;

/** Blob 을 첨부 파일로 다운로드. */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function FormInputPanel({ def, prefill }: Props) {
  const { orgId } = useAuth();
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 서식 변경 또는 prefill 갱신 시 초기값 재설정
  useEffect(() => {
    setValues(prefill(def));
    setError(null);
  }, [def, prefill]);

  const missingRequired = useMemo(
    () => def.fields.filter((f) => f.required && !String(values[f.token] ?? "").trim()).map((f) => f.label),
    [def, values]
  );

  const setField = (token: string, v: string) =>
    setValues((prev) => ({ ...prev, [token]: v }));

  /** def.fields 값을 전송 payload 로 — 날짜 필드는 한글 표기로 변환. (두 생성 핸들러 공통) */
  const buildFieldValues = (): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const f of def.fields) {
      const raw = values[f.token] ?? "";
      out[f.token] = f.type === "date" && raw ? fmtKoreanDate(raw) : raw;
    }
    return out;
  };

  /** POST → 실패 시 메시지 throw → 성공 시 .hwpx 다운로드. (두 생성 핸들러 공통) */
  async function postAndDownload(endpoint: string, payload: unknown) {
    setBusy(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? `생성 실패 (${res.status})`);
      }
      downloadBlob(await res.blob(), safeFileName(def.label));
    } catch (e) {
      setError(e instanceof Error ? e.message : "생성 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerate() {
    setError(null);
    if (missingRequired.length > 0) {
      setError(`필수 항목을 입력하세요: ${missingRequired.join(", ")}`);
      return;
    }
    await postAndDownload("/api/hwpx/generate", { formId: def.id, values: buildFieldValues() });
  }

  /** dataFill 서식: DB 데이터로 표/행을 채워 생성. 하이브리드(서식 43)는 수동 텍스트도 전송. */
  async function handleGenerateLedger() {
    if (!def.dataFill) return;
    if (!orgId) {
      setError("사용기관을 먼저 선택하세요.");
      return;
    }
    // 하이브리드 서식(수동 입력 필드 보유): 필수 항목 검증
    if (def.fields.length > 0 && missingRequired.length > 0) {
      setError(`필수 항목을 입력하세요: ${missingRequired.join(", ")}`);
      return;
    }
    setError(null);
    // formId 는 accounting-report 가 서식 분기에 사용(income-ledger 는 무시)
    const payload: Record<string, unknown> = { orgId, formId: def.id };
    if (def.fields.length > 0) payload.values = buildFieldValues();
    await postAndDownload(DATA_FILL_ENDPOINT[def.dataFill], payload);
  }

  /** 입력 필드 1개 렌더 (일반 폼 + dataFill 하이브리드 공용). */
  const renderField = (f: HwpxFormField) => (
    <div key={f.token} className="flex flex-col gap-1.5">
      <Label htmlFor={f.token} className="flex items-center gap-1.5 text-sm">
        {f.label}
        {f.required && <span className="text-destructive">*</span>}
        {isAuto(f) ? (
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">자동</Badge>
        ) : (
          <Badge variant="outline" className="h-4 px-1.5 text-[10px]">수동</Badge>
        )}
      </Label>
      {f.type === "textarea" ? (
        <Textarea
          id={f.token}
          value={values[f.token] ?? ""}
          onChange={(e) => setField(f.token, e.target.value)}
          rows={2}
          maxLength={maxLenFor(f.type)}
        />
      ) : (
        <Input
          id={f.token}
          type={f.type === "date" ? "date" : "text"}
          inputMode={f.type === "tel" || f.type === "account" ? "numeric" : undefined}
          value={values[f.token] ?? ""}
          onChange={(e) => setField(f.token, e.target.value)}
          maxLength={maxLenFor(f.type)}
        />
      )}
    </div>
  );

  // dataFill 서식(회계장부 등): 토큰 입력 폼 대신 데이터 채움 액션을 노출
  if (def.dataFill) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{def.label}</h2>
          <span className="text-xs text-muted-foreground">서식 {def.id}</span>
        </div>
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          {DATA_FILL_TEXT[def.dataFill].desc}{" "}
          다운로드한 .hwpx 파일을 한글에서 열어 확인·인쇄·날인 후 제출하세요.
        </p>
        {def.fields.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{def.fields.map(renderField)}</div>
        )}
        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}
        <div className="flex items-center gap-3">
          <Button onClick={handleGenerateLedger} disabled={busy || !orgId}>
            {busy ? "생성 중…" : DATA_FILL_TEXT[def.dataFill].button}
          </Button>
          {!orgId && <span className="text-xs text-muted-foreground">사용기관을 먼저 선택하세요.</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{def.label}</h2>
        <span className="text-xs text-muted-foreground">서식 {def.id}</span>
      </div>

      {def.fields.length === 0 && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          이 서식은 빈 공식 양식입니다. 다운로드한 뒤 한글에서 직접 작성하세요.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{def.fields.map(renderField)}</div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={handleGenerate} disabled={busy}>
          {busy ? "생성 중…" : def.fields.length === 0 ? "빈 양식 다운로드" : "HWPX 생성 및 다운로드"}
        </Button>
        <span className="text-xs text-muted-foreground">
          다운로드한 .hwpx 파일을 한글에서 열어 확인·인쇄·날인 후 제출하세요.
        </span>
      </div>
    </div>
  );
}
