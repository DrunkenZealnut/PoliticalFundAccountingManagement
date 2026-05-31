"use client";

import { useState } from "react";
import { useAuth } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpTooltip } from "@/components/help-tooltip";

type ExportMode = "full" | "master" | "data1" | "data2";
type ConflictPolicy = "overwrite" | "skip" | "merge";

interface OrganCandidate {
  source: string;
  exportOrgId: number;
  org_sec_cd: number;
  org_name: string;
  reg_num: string;
}

interface ImportSummary {
  dryRun?: boolean;
  conflictPolicy: ConflictPolicy;
  rowCounts?: Record<string, number>;
  organCandidates?: OrganCandidate[];
  totalImported?: number;
  report?: Record<string, { imported: number; skipped: number; error?: string }>;
}

const SELECT_CLS =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm";

export default function BackupPage() {
  const { orgId, orgName } = useAuth();

  // 백업(내보내기) 상태
  const [exportMode, setExportMode] = useState<ExportMode>("full");
  const [exportYear, setExportYear] = useState("");
  const [exporting, setExporting] = useState(false);

  // 복구(가져오기) 상태
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [conflictPolicy, setConflictPolicy] = useState<ConflictPolicy>("overwrite");
  const [preview, setPreview] = useState<ImportSummary | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const fmt = (n: number) => n.toLocaleString("ko-KR");

  async function handleExport() {
    if (!orgId) {
      alert("사용기관을 먼저 선택하세요.");
      return;
    }
    setExporting(true);
    try {
      const params = new URLSearchParams({
        orgId: String(orgId),
        orgName: orgName || "data",
        mode: exportMode,
      });
      if (exportYear.trim()) params.set("year", exportYear.trim());

      const res = await fetch(`/api/system/export-sqlite?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`백업 실패: ${err?.error?.message || err?.error || res.statusText}`);
        return;
      }

      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const m = cd.match(/filename="?([^"]+)"?/);
      const filename = m ? decodeURIComponent(m[1]) : `backup_${orgName || "data"}.db`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(`백업 중 오류: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  }

  async function postImport(dryRun: boolean): Promise<ImportSummary | null> {
    if (!orgId) {
      alert("사용기관을 먼저 선택하세요.");
      return null;
    }
    if (!restoreFile) {
      alert(".db 백업 파일을 선택하세요.");
      return null;
    }
    const fd = new FormData();
    fd.append("file", restoreFile);
    fd.append("orgId", String(orgId));
    fd.append("conflictPolicy", conflictPolicy);
    fd.append("dryRun", String(dryRun));

    const res = await fetch("/api/system/import-sqlite", { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.error) {
      alert(`복구 실패: ${json?.error?.message || json?.error || res.statusText}`);
      return null;
    }
    setWarnings(json.warnings || []);
    return json.summary as ImportSummary;
  }

  async function handlePreview() {
    setBusy(true);
    setResult(null);
    try {
      const summary = await postImport(true);
      if (summary) setPreview(summary);
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    const policyLabel = {
      overwrite: "덮어쓰기 (기존 자료 삭제 후 복구)",
      skip: "건너뛰기 (중복은 기존 자료 유지)",
      merge: "병합 (중복은 업데이트)",
    }[conflictPolicy];

    const warn =
      conflictPolicy === "overwrite"
        ? "⚠️ 현재 사용기관의 기존 자료가 모두 삭제되고 백업 파일로 대체됩니다.\n"
        : "";

    if (!confirm(`복구를 실행합니다.\n충돌 처리: ${policyLabel}\n\n${warn}계속하시겠습니까?`)) {
      return;
    }

    setBusy(true);
    try {
      const summary = await postImport(false);
      if (summary) {
        setResult(summary);
        setPreview(null);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">자료 백업 및 복구</h2>

      {/* ── 백업 (내보내기) ── */}
      <div className="bg-white rounded-lg border p-4 space-y-4">
        <HelpTooltip id="system.backup">
          <h3 className="font-semibold">자료 백업 (내보내기)</h3>
        </HelpTooltip>
        <p className="text-sm text-gray-600">
          현재 로그인한 사용기관(<b>{orgName || "-"}</b>)의 자료를 SQLite(.db) 파일로
          내려받습니다.
        </p>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <Label>백업 형식</Label>
            <select
              className={SELECT_CLS}
              value={exportMode}
              onChange={(e) => setExportMode(e.target.value as ExportMode)}
            >
              <option value="full">통합본 (전체 자료)</option>
              <option value="master">기준정보 (Fund_Master 호환)</option>
              <option value="data1">후보자 거래 (Fund_Data_1 호환)</option>
              <option value="data2">후원회 거래 (Fund_Data_2 호환)</option>
            </select>
          </div>
          <div>
            <Label>연도 (선택)</Label>
            <Input
              className="w-28"
              placeholder="예: 2026"
              value={exportYear}
              onChange={(e) => setExportYear(e.target.value)}
            />
          </div>
          <Button onClick={handleExport} disabled={exporting || !orgId}>
            {exporting ? "백업 중..." : "백업 파일 내려받기"}
          </Button>
        </div>
      </div>

      {/* ── 복구 (가져오기) ── */}
      <div className="bg-white rounded-lg border p-4 space-y-4">
        <HelpTooltip id="system.restore">
          <h3 className="font-semibold">자료 복구 (가져오기)</h3>
        </HelpTooltip>
        <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800">
          복구는 백업(.db) 파일의 자료를 현재 사용기관으로 가져옵니다. 실행 전 반드시{" "}
          <b>미리보기</b>로 내용을 확인하세요.
        </div>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <Label>백업 파일 (.db)</Label>
            <Input
              type="file"
              accept=".db"
              onChange={(e) => {
                setRestoreFile(e.target.files?.[0] || null);
                setPreview(null);
                setResult(null);
                setWarnings([]);
              }}
            />
          </div>
          <div>
            <Label>충돌 처리</Label>
            <select
              className={SELECT_CLS}
              value={conflictPolicy}
              onChange={(e) => setConflictPolicy(e.target.value as ConflictPolicy)}
            >
              <option value="overwrite">덮어쓰기 (기존 자료 삭제 후 복구)</option>
              <option value="skip">건너뛰기 (중복은 유지)</option>
              <option value="merge">병합 (중복은 업데이트)</option>
            </select>
          </div>
          <Button variant="outline" onClick={handlePreview} disabled={busy || !restoreFile}>
            {busy ? "처리 중..." : "미리보기"}
          </Button>
          <Button variant="destructive" onClick={handleRestore} disabled={busy || !restoreFile}>
            복구 실행
          </Button>
        </div>

        {warnings.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm text-yellow-800 space-y-1">
            {warnings.map((w, i) => (
              <p key={i}>⚠️ {w}</p>
            ))}
          </div>
        )}

        {preview && (
          <div className="bg-gray-50 rounded p-4 text-sm space-y-3">
            <p className="font-semibold">미리보기 (실제 반영되지 않음)</p>
            {preview.organCandidates && preview.organCandidates.length > 0 && (
              <div>
                <p className="text-gray-600">포함 기관:</p>
                <ul className="list-disc pl-5">
                  {preview.organCandidates.map((c, i) => (
                    <li key={i}>
                      {c.org_name} <span className="text-gray-500">({c.source})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {preview.rowCounts && (
              <table className="text-xs">
                <tbody>
                  {Object.entries(preview.rowCounts)
                    .filter(([, n]) => n > 0)
                    .map(([t, n]) => (
                      <tr key={t}>
                        <td className="pr-6 font-mono">{t}</td>
                        <td>{fmt(n)}건</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {result && (
          <div className="bg-green-50 border border-green-200 rounded p-4 text-sm space-y-2 text-green-900">
            <p className="font-semibold">복구 완료 — 총 {fmt(result.totalImported || 0)}건 반영</p>
            {result.report && (
              <table className="text-xs">
                <tbody>
                  {Object.entries(result.report).map(([t, r]) => (
                    <tr key={t}>
                      <td className="pr-6 font-mono">{t}</td>
                      <td>
                        반영 {fmt(r.imported)} / 건너뜀 {fmt(r.skipped)}
                        {r.error ? ` / 오류: ${r.error}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="text-xs text-green-700">
              변경 사항을 화면에 반영하려면 페이지를 새로고침하세요.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
