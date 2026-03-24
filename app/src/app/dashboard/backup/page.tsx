"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { useSort, SortTh } from "@/hooks/use-sort";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpTooltip } from "@/components/help-tooltip";

interface BackupItem {
  id: number;
  org_name: string | null;
  backup_type: string;
  file_path: string;
  file_size: number | null;
  created_at: string | null;
}

export default function BackupPage() {
  const supabase = createSupabaseBrowser();
  const { orgId, orgName } = useAuth();
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [sqliteFile, setSqliteFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  function loadBackups() {
    if (!orgId) return;
    supabase.from("backup_history").select("*").eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .then(({ data }) => { setBackups((data as BackupItem[]) || []); });
  }

  useEffect(() => {
    if (!orgId) return;
    supabase.from("backup_history").select("*").eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .then(({ data }) => { setBackups((data as BackupItem[]) || []); });
  }, [orgId, supabase]);

  async function handleBackup() {
    if (!orgId || !orgName) return;
    setLoading(true);

    try {
      // Export all org data
      const [organRes, custRes, accRes, estRes, opRes, addrRes] =
        await Promise.all([
          supabase.from("organ").select("*").eq("org_id", orgId),
          supabase.from("customer").select("*"),
          supabase.from("acc_book").select("*").eq("org_id", orgId),
          supabase.from("estate").select("*").eq("org_id", orgId),
          supabase.from("opinion").select("*").eq("org_id", orgId),
          supabase.from("customer_addr").select("*"),
        ]);

      const exportData = {
        version: "1.0",
        backup_date: new Date().toISOString(),
        org_id: orgId,
        org_name: orgName,
        tables: {
          organ: organRes.data || [],
          customer: custRes.data || [],
          customer_addr: addrRes.data || [],
          acc_book: accRes.data || [],
          estate: estRes.data || [],
          opinion: opRes.data || [],
        },
        stats: {
          customer_count: (custRes.data || []).length,
          acc_book_count: (accRes.data || []).length,
          estate_count: (estRes.data || []).length,
        },
      };

      const jsonStr = JSON.stringify(exportData, null, 2);
      const fileSize = new Blob([jsonStr]).size;

      // Download JSON file
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const timestamp = new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[T:]/g, "-");
      const fileName = `정치자금【${orgName}】보관자료_${timestamp}.json`;
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);

      // Save backup history
      await supabase.from("backup_history").insert({
        org_id: orgId,
        org_name: orgName,
        backup_type: "manual",
        file_path: fileName,
        file_size: fileSize,
      });

      alert(
        `백업이 완료되었습니다.\n\n` +
          `파일: ${fileName}\n` +
          `크기: ${(fileSize / 1024).toFixed(1)} KB\n` +
          `수입지출처: ${exportData.stats.customer_count}건\n` +
          `수입/지출내역: ${exportData.stats.acc_book_count}건\n` +
          `재산내역: ${exportData.stats.estate_count}건`
      );
      loadBackups();
    } catch (err) {
      alert(`백업 실패: ${err instanceof Error ? err.message : "오류"}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleRestore() {
    if (!restoreFile || !orgId) {
      alert("복구할 JSON 파일을 선택하세요.");
      return;
    }

    const pw = prompt(
      "자료 복구 시 운영DB의 모든 자료는 선택한 복구DB의 자료로 모두 변경됩니다.\n" +
        "복구를 진행하시려면 로그인 비밀번호를 입력하시기 바랍니다."
    );
    if (!pw) return;

    setLoading(true);
    try {
      const text = await restoreFile.text();
      const backupData = JSON.parse(text);

      if (!backupData.tables || !backupData.org_name) {
        alert("유효하지 않은 백업 파일입니다.");
        setLoading(false);
        return;
      }

      if (
        !confirm(
          `"${backupData.org_name}" (${backupData.backup_date})의 백업을 복구합니다.\n\n` +
            `현재 운영DB의 모든 자료가 삭제되고 백업 자료로 대체됩니다.\n\n` +
            `계속하시겠습니까?`
        )
      ) {
        setLoading(false);
        return;
      }

      // Delete existing data
      await supabase.from("acc_book").delete().eq("org_id", orgId);
      await supabase.from("estate").delete().eq("org_id", orgId);
      await supabase.from("opinion").delete().eq("org_id", orgId);

      // Restore data (insert without identity columns)
      const { acc_book, estate, opinion } = backupData.tables;

      if (acc_book && acc_book.length > 0) {
        // Remove auto-generated fields before insert
        const cleanedBooks = acc_book.map(
          (r: Record<string, unknown>) => {
            const rest: Record<string, unknown> = { ...r, org_id: orgId };
            delete rest.acc_book_id;
            return rest;
          }
        );
        // Batch insert in chunks of 100
        for (let i = 0; i < cleanedBooks.length; i += 100) {
          await supabase
            .from("acc_book")
            .insert(cleanedBooks.slice(i, i + 100));
        }
      }

      if (estate && estate.length > 0) {
        const cleanedEstates = estate.map(
          (r: Record<string, unknown>) => {
            const rest: Record<string, unknown> = { ...r, org_id: orgId };
            delete rest.estate_id;
            return rest;
          }
        );
        await supabase.from("estate").insert(cleanedEstates);
      }

      if (opinion && opinion.length > 0) {
        await supabase.from("opinion").upsert(opinion, { onConflict: "org_id" });
      }

      // Record restore in history
      await supabase.from("backup_history").insert({
        org_id: orgId,
        org_name: orgName,
        backup_type: "restore",
        file_path: restoreFile.name,
        file_size: restoreFile.size,
      });

      alert(
        `복구가 완료되었습니다.\n\n` +
          `복구 원본: ${backupData.org_name} (${backupData.backup_date})\n` +
          `수입/지출내역: ${acc_book?.length || 0}건\n` +
          `재산내역: ${estate?.length || 0}건`
      );

      setRestoreFile(null);
      loadBackups();
    } catch (err) {
      alert(`복구 실패: ${err instanceof Error ? err.message : "오류"}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleImportSqlite() {
    if (!sqliteFile || !orgId) {
      alert("가져올 .db 파일을 선택하세요.");
      return;
    }

    if (!confirm(
      "SQLite .db 파일을 가져옵니다.\n\n" +
      "기존 데이터와 병합(merge)됩니다. 중복 키는 덮어씁니다.\n\n" +
      "계속하시겠습니까?"
    )) return;

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", sqliteFile);
      formData.append("orgId", String(orgId));
      formData.append("mode", "merge");

      const res = await fetch("/api/system/import-sqlite", { method: "POST", body: formData });
      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "가져오기 실패");
      }

      const reportLines = Object.entries(result.report as Record<string, { imported: number; skipped: number; error?: string }>)
        .filter(([, v]) => v.imported > 0 || v.skipped > 0 || v.error)
        .map(([table, v]) => `  ${table}: ${v.imported}건 가져옴${v.skipped > 0 ? `, ${v.skipped}건 실패` : ""}${v.error ? ` (${v.error})` : ""}`);

      alert(`SQLite .db 가져오기 완료\n\n총 ${result.totalImported}건 가져옴\n\n${reportLines.join("\n")}`);

      await supabase.from("backup_history").insert({
        org_id: orgId,
        org_name: orgName,
        backup_type: "sqlite_import",
        file_path: sqliteFile.name,
        file_size: sqliteFile.size,
      });

      setSqliteFile(null);
      loadBackups();
    } catch (err) {
      alert(`가져오기 실패: ${err instanceof Error ? err.message : "오류"}`);
    } finally {
      setImporting(false);
    }
  }

  const { sorted: sortedBackups, sort, toggle } = useSort(backups);

  function fmtSize(bytes: number | null) {
    if (!bytes) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">자료 백업 및 복구</h2>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
        <p className="font-semibold">주의사항</p>
        <ul className="list-disc pl-5 mt-1 space-y-1">
          <li>
            백업 파일은 JSON 형식으로 다운로드됩니다. 안전한 장소에
            보관하세요.
          </li>
          <li>
            복구 시 운영DB의 수입/지출/재산 내역이 모두 삭제되고 백업
            자료로 대체됩니다.
          </li>
          <li>
            다른 사용기관의 백업 파일을 복구하지 않도록 주의하세요.
          </li>
        </ul>
      </div>

      {/* 백업 */}
      <div className="bg-white rounded-lg border p-4 space-y-3">
        <h3 className="font-semibold">백업</h3>
        <HelpTooltip id="system.backup">
          <Button onClick={handleBackup} disabled={loading}>
            {loading ? "처리 중..." : "백업 (JSON 다운로드)"}
          </Button>
        </HelpTooltip>
      </div>

      {/* 복구 */}
      <div className="bg-white rounded-lg border p-4 space-y-3">
        <h3 className="font-semibold">복구</h3>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Label>백업 파일 선택 (JSON)</Label>
            <Input
              type="file"
              accept=".json"
              onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
            />
          </div>
          <HelpTooltip id="system.restore">
            <Button
              variant="outline"
              onClick={handleRestore}
              disabled={!restoreFile || loading}
            >
              복구
            </Button>
          </HelpTooltip>
        </div>
      </div>

      {/* SQLite 가져오기 */}
      <div className="bg-white rounded-lg border p-4 space-y-3">
        <h3 className="font-semibold">SQLite .db 가져오기</h3>
        <p className="text-sm text-gray-500">
          기존 정치자금 회계관리 프로그램의 .db 파일(Fund_Data_1.db 등)을 가져옵니다.
        </p>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Label>SQLite 파일 선택 (.db)</Label>
            <Input
              type="file"
              accept=".db"
              onChange={(e) => setSqliteFile(e.target.files?.[0] || null)}
            />
          </div>
          <Button
            variant="outline"
            onClick={handleImportSqlite}
            disabled={!sqliteFile || importing}
          >
            {importing ? "가져오는 중..." : "가져오기"}
          </Button>
        </div>
      </div>

      {/* 백업 이력 */}
      <div className="bg-white rounded-lg border">
        <div className="px-4 py-3 border-b font-semibold text-sm">
          백업/복구 이력
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-3 py-2 text-left">번호</th>
              <SortTh label="일시" sortKey="created_at" current={sort} onToggle={toggle} className="text-left" />
              <SortTh label="유형" sortKey="backup_type" current={sort} onToggle={toggle} className="text-left" />
              <SortTh label="파일명" sortKey="file_path" current={sort} onToggle={toggle} className="text-left" />
              <SortTh label="크기" sortKey="file_size" current={sort} onToggle={toggle} className="text-right" />
            </tr>
          </thead>
          <tbody>
            {backups.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-8 text-center text-gray-400"
                >
                  백업/복구 이력이 없습니다.
                </td>
              </tr>
            ) : (
              sortedBackups.map((b, i) => (
                <tr key={b.id} className="border-b hover:bg-gray-50">
                  <td className="px-3 py-2">{i + 1}</td>
                  <td className="px-3 py-2">
                    {b.created_at
                      ?.slice(0, 19)
                      .replace("T", " ")}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        b.backup_type === "restore"
                          ? "text-orange-600 font-semibold"
                          : "text-blue-600"
                      }
                    >
                      {b.backup_type === "manual"
                        ? "백업"
                        : b.backup_type === "restore"
                          ? "복구"
                          : b.backup_type === "sqlite_import"
                            ? "DB가져오기"
                            : b.backup_type}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-500 text-xs max-w-xs truncate">
                    {b.file_path}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-500">
                    {fmtSize(b.file_size)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
