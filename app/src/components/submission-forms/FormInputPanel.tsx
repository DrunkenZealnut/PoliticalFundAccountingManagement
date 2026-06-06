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
import type { HwpxFormDef, HwpxFormField } from "@/lib/hwpx/form-fields";

interface Props {
  def: HwpxFormDef;
  prefill: (def: HwpxFormDef) => Record<string, string>;
}

const isAuto = (f: HwpxFormField) => f.source.from === "organ" || f.source.from === "auth" || f.source.from === "const";

/** 필드 타입별 입력 길이 상한 (route.ts MAX_LEN 과 동기화). */
const MAX_LEN: Record<string, number> = { tel: 40, account: 40, date: 20, text: 200, textarea: 1000 };
const maxLenFor = (type: string) => MAX_LEN[type] ?? 200;

export default function FormInputPanel({ def, prefill }: Props) {
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

  async function handleGenerate() {
    setError(null);
    if (missingRequired.length > 0) {
      setError(`필수 항목을 입력하세요: ${missingRequired.join(", ")}`);
      return;
    }
    // 날짜 필드는 한글 표기로 변환하여 전송
    const payload: Record<string, string> = {};
    for (const f of def.fields) {
      const raw = values[f.token] ?? "";
      payload[f.token] = f.type === "date" && raw ? fmtKoreanDate(raw) : raw;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/hwpx/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formId: def.id, values: payload }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? `생성 실패 (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${def.label.replace(/[\\/:*?"<>|·\s]+/g, "_")}.hwpx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "생성 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{def.label}</h2>
        <span className="text-xs text-muted-foreground">서식 {def.id}</span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {def.fields.map((f) => (
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
        ))}
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={handleGenerate} disabled={busy}>
          {busy ? "생성 중…" : "HWPX 생성 및 다운로드"}
        </Button>
        <span className="text-xs text-muted-foreground">
          다운로드한 .hwpx 파일을 한글에서 열어 확인·인쇄·날인 후 제출하세요.
        </span>
      </div>
    </div>
  );
}
