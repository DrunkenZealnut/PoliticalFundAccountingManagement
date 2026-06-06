"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EVIDENCE_MAX_FILES, EVIDENCE_MAX_FILE_SIZE } from "@/lib/evidence/storage-path";
import { fileToBase64 } from "@/lib/file-utils";
import { detectDeliveryFee, extractPdfText } from "@/lib/evidence/delivery-fee-detector";

/**
 * 증빙파일 관리 컴포넌트.
 * - 저장된 파일(accBookId 연결): 이 컴포넌트가 조회·다운로드·삭제를 담당
 * - 신규 대기 파일(pendingFiles): 표시·제거만 담당하고, 실제 업로드는 상위 페이지가
 *   거래 저장 후 수행한다(거래 저장 전에는 acc_book_id가 없기 때문).
 */

export interface PendingFile {
  name: string;
  type: string;
  base64: string;
}

interface EvidenceFile {
  file_id: number;
  acc_book_id: number | null;
  org_id: number;
  file_name: string;
  file_type: string;
  storage_path: string;
  file_size: number;
  created_at: string;
  signed_url: string | null;
}

interface Props {
  /** null이면 미저장 신규 거래 — 저장 후 상위에서 pendingFiles를 업로드 */
  accBookId: number | null;
  orgId: number;
  pendingFiles: PendingFile[];
  onPendingChange: (files: PendingFile[]) => void;
}

const fmtSize = (n: number) =>
  n < 1024 ? `${n}B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)}KB` : `${(n / 1024 / 1024).toFixed(1)}MB`;

const isImage = (type: string) => type.startsWith("image/");
const isPdf = (type: string) => type === "application/pdf";

interface PreviewTarget {
  name: string;
  url: string;
  type: string;
}

export function EvidenceFileManager({
  accBookId,
  orgId,
  pendingFiles,
  onPendingChange,
}: Props) {
  const [existing, setExisting] = useState<EvidenceFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [deliveryWarning, setDeliveryWarning] = useState(false);

  const fetchExisting = useCallback(async () => {
    if (!accBookId) {
      setExisting([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/evidence-file?accBookId=${accBookId}&orgId=${orgId}`);
      const data = await res.json();
      setExisting(Array.isArray(data) ? data : []);
    } catch {
      setExisting([]);
    }
    setLoading(false);
  }, [accBookId, orgId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 거래 선택 시 첨부 목록 조회
    fetchExisting();
  }, [fetchExisting]);

  // 거래 전환 시: 이전 거래에서 켜진 배송비 경고는 새 거래에 무의미하므로 초기화한다.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- accBookId 변경 시 경고 동기화
    setDeliveryWarning(false);
  }, [accBookId]);

  // 대기 파일이 모두 비워지면(저장 후 초기화·전체 제거) 경고를 해제한다.
  // 경고는 handleSelect의 PDF 배송비 감지에서만 켠다.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 대기 파일 상태에 경고 동기화
    if (pendingFiles.length === 0) setDeliveryWarning(false);
  }, [pendingFiles.length]);

  const totalCount = existing.length + pendingFiles.length;

  async function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (inputRef.current) inputRef.current.value = ""; // 같은 파일 재선택 허용
    if (files.length === 0) return;

    const room = EVIDENCE_MAX_FILES - totalCount;
    if (room <= 0) {
      alert(`증빙파일은 거래당 최대 ${EVIDENCE_MAX_FILES}건까지 첨부할 수 있습니다.`);
      return;
    }

    const next: PendingFile[] = [...pendingFiles];
    let oversized = 0;
    for (const file of files.slice(0, room)) {
      if (file.size > EVIDENCE_MAX_FILE_SIZE) {
        oversized++;
        continue;
      }
      next.push({ name: file.name, type: file.type, base64: await fileToBase64(file) });
    }
    onPendingChange(next);

    // 새로 추가된 PDF에서 배송비 항목을 감지하면 별도 등록 안내 배너를 켠다.
    for (const file of files.slice(0, room)) {
      if (file.type !== "application/pdf") continue;
      try {
        const base64 = await fileToBase64(file);
        const text = await extractPdfText(base64);
        if (detectDeliveryFee(text).matched) {
          setDeliveryWarning(true);
          break;
        }
      } catch {
        // 추출 실패(스캔/암호화 PDF 등)는 조용히 무시
      }
    }

    if (files.length > room) {
      alert(`최대 ${EVIDENCE_MAX_FILES}건까지만 첨부됩니다. ${files.length - room}건은 제외되었습니다.`);
    }
    if (oversized > 0) alert(`${oversized}건이 10MB를 초과하여 제외되었습니다.`);
  }

  function removePending(idx: number) {
    // 경고 해제는 pendingFiles 동기화 useEffect가 처리한다(전체 제거 시).
    onPendingChange(pendingFiles.filter((_, i) => i !== idx));
  }

  async function deleteExisting(fileId: number) {
    if (!confirm("이 증빙파일을 삭제하시겠습니까?")) return;
    const res = await fetch(`/api/evidence-file?fileId=${fileId}&orgId=${orgId}`, { method: "DELETE" });
    if (!res.ok) {
      alert("삭제에 실패했습니다.");
      return;
    }
    fetchExisting();
  }

  return (
    <div>
      <Label>
        증빙파일{" "}
        <span className="text-xs text-gray-400">
          ({totalCount}/{EVIDENCE_MAX_FILES})
        </span>
      </Label>
      {deliveryWarning && (
        <div
          role="alert"
          className="mt-1 flex items-start gap-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800"
        >
          <span className="flex-1">
            ⚠️ 이 증빙에 배송비(운송·발송·택배 등)가 포함된 것 같습니다. 배송비는 별도 항목으로 등록하세요.
          </span>
          <button
            type="button"
            onClick={() => setDeliveryWarning(false)}
            className="shrink-0 text-amber-600 hover:text-amber-900"
            aria-label="배송비 안내 닫기"
          >
            ✕
          </button>
        </div>
      )}

      {/* 기존 첨부 목록 */}
      {accBookId != null && (
        <div className="mt-1 space-y-1">
          {loading ? (
            <p className="text-xs text-gray-400">불러오는 중...</p>
          ) : existing.length === 0 ? (
            <p className="text-xs text-gray-400">첨부된 증빙파일 없음</p>
          ) : (
            existing.map((f) => {
              const canPreview = !!f.signed_url && (isImage(f.file_type) || isPdf(f.file_type));
              return (
                <div
                  key={f.file_id}
                  className="flex items-center gap-2 text-xs bg-gray-50 border rounded px-2 py-1"
                >
                  {/* 이미지 썸네일 (클릭 시 미리보기) */}
                  {isImage(f.file_type) && f.signed_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={f.signed_url}
                      alt={f.file_name}
                      className="h-8 w-8 object-cover rounded border cursor-pointer shrink-0"
                      onClick={() =>
                        setPreview({ name: f.file_name, url: f.signed_url!, type: f.file_type })
                      }
                    />
                  )}
                  {/* 파일명 — 미리보기 가능하면 버튼, 아니면 새 탭 다운로드 */}
                  {canPreview ? (
                    <button
                      type="button"
                      onClick={() =>
                        setPreview({ name: f.file_name, url: f.signed_url!, type: f.file_type })
                      }
                      className="text-blue-600 hover:underline truncate flex-1 text-left"
                      title={`${f.file_name} (미리보기)`}
                    >
                      📎 {f.file_name}
                    </button>
                  ) : f.signed_url ? (
                    <a
                      href={f.signed_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline truncate flex-1"
                      title={f.file_name}
                    >
                      📎 {f.file_name}
                    </a>
                  ) : (
                    <span className="truncate flex-1" title={f.file_name}>
                      📎 {f.file_name}
                    </span>
                  )}
                  {/* 새 탭 열기/다운로드 */}
                  {f.signed_url && (
                    <a
                      href={f.signed_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-gray-400 hover:text-gray-600 shrink-0"
                      title="새 탭에서 열기"
                      aria-label="새 탭에서 열기"
                    >
                      ↗
                    </a>
                  )}
                  <span className="text-gray-400 shrink-0">{fmtSize(f.file_size)}</span>
                  <button
                    type="button"
                    onClick={() => deleteExisting(f.file_id)}
                    className="text-red-500 hover:text-red-700 shrink-0"
                    aria-label="삭제"
                  >
                    ✕
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 신규 첨부 대기 목록 */}
      {pendingFiles.length > 0 && (
        <div className="mt-1 space-y-1">
          {pendingFiles.map((f, idx) => {
            const dataUrl = `data:${f.type};base64,${f.base64}`;
            const canPreview = isImage(f.type) || isPdf(f.type);
            return (
              <div
                key={`${f.name}-${idx}`}
                className="flex items-center gap-2 text-xs bg-green-50 border border-green-200 rounded px-2 py-1"
              >
                {isImage(f.type) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={dataUrl}
                    alt={f.name}
                    className="h-8 w-8 object-cover rounded border cursor-pointer shrink-0"
                    onClick={() => setPreview({ name: f.name, url: dataUrl, type: f.type })}
                  />
                )}
                {canPreview ? (
                  <button
                    type="button"
                    onClick={() => setPreview({ name: f.name, url: dataUrl, type: f.type })}
                    className="text-green-700 hover:underline truncate flex-1 text-left"
                    title={`${f.name} (미리보기)`}
                  >
                    ⬆ {f.name}
                  </button>
                ) : (
                  <span className="text-green-700 truncate flex-1" title={f.name}>
                    ⬆ {f.name}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removePending(idx)}
                  className="text-red-500 hover:text-red-700 shrink-0"
                  aria-label="제거"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* 파일 선택 (다중) */}
      <Input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,application/pdf"
        className="mt-1"
        onChange={handleSelect}
        disabled={totalCount >= EVIDENCE_MAX_FILES}
      />
      <p className="text-xs text-gray-400 mt-1">
        영수증/계약서/세금계산서 등 여러 건 첨부 가능 (JPG, PNG, PDF · 건당 10MB) · 클릭 시 미리보기
      </p>

      {/* 미리보기 모달 */}
      <Dialog open={preview != null} onOpenChange={(v) => { if (!v) setPreview(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="truncate pr-8">{preview?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {preview && isImage(preview.type) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.url} alt={preview.name} className="max-w-full h-auto mx-auto" />
            )}
            {preview && isPdf(preview.type) && (
              <iframe src={preview.url} title={preview.name} className="w-full h-[75vh]" />
            )}
          </div>
          {preview && (
            <a
              href={preview.url}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-blue-600 hover:underline shrink-0"
            >
              새 탭에서 열기 / 다운로드 ↗
            </a>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
