/**
 * 증빙파일 Storage 경로 체계 (multi-evidence-file design §2)
 *
 * 다건 거래 × 다건 파일 환경에서 첨부파일을 체계적으로 관리하기 위한 경로 규칙.
 * 다운로드는 항상 DB `storage_path`(=이 함수의 반환값)를 단일 진실 원천(SSOT)으로
 * signed URL을 생성한다. 따라서 향후 스킴이 바뀌어도 기존 파일 다운로드는 안전하다.
 */

/** 거래당 증빙파일 첨부 상한 (document-register 일괄등록 상한과 일관) */
export const EVIDENCE_MAX_FILES = 10;

/** 파일 1건 최대 크기 (10MB) */
export const EVIDENCE_MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Supabase Storage 버킷 이름 (private) */
export const EVIDENCE_BUCKET = "evidence";

/** 다운로드용 signed URL 만료 시간 (초, 1시간) */
export const EVIDENCE_SIGNED_URL_TTL = 3600;

/**
 * 파일명을 Storage key로 안전하게 정규화한다 (확장자 보존).
 * 영문/숫자/밑줄/대시만 허용, 연속 밑줄 축약, 100자 제한.
 */
export function sanitizeFileName(fileName: string): { safeName: string; ext: string } {
  // 확장자도 안전 문자만 남겨 Storage object key에 경로 구분자/임의 문자가 섞이지 않게 한다
  const rawExt = fileName.includes(".") ? fileName.substring(fileName.lastIndexOf(".") + 1) : "";
  const safeExt = rawExt.replace(/[^a-zA-Z0-9]/g, "").substring(0, 16);
  const ext = safeExt ? `.${safeExt}` : "";
  const safeName = fileName
    .replace(/\.[^.]+$/, "") // 확장자 제거
    .replace(/[^a-zA-Z0-9_-]/g, "_") // 안전 문자만
    .replace(/_+/g, "_") // 연속 밑줄 축약
    .substring(0, 100);
  return { safeName, ext };
}

/**
 * 증빙파일 Storage 경로 생성.
 * - 거래 연결:  `{orgId}/acc/{accBookId}/{ts}_{seq}_{safe}.ext`  (거래별 그룹화)
 * - 미연결:     `{orgId}/unlinked/{ts}_{safe}.ext`               (조직 레벨)
 *
 * `{orgId}` 최상위 prefix로 조직을 격리하고, `acc/{accBookId}`로 한 거래의 모든
 * 증빙을 같은 prefix 아래 모아 조회·일괄삭제·감사를 쉽게 한다.
 *
 * `timestamp`는 호출자가 주입한다(Date.now()를 분리해 순수 함수로 유지).
 */
export function buildEvidenceStoragePath(params: {
  orgId: number | string;
  accBookId?: number | string | null;
  fileName: string;
  seq?: number;
  timestamp: number;
}): string {
  const { orgId, accBookId, fileName, seq = 0, timestamp } = params;
  const { safeName, ext } = sanitizeFileName(fileName);
  if (accBookId) {
    return `${orgId}/acc/${accBookId}/${timestamp}_${seq}_${safeName}${ext}`;
  }
  return `${orgId}/unlinked/${timestamp}_${safeName}${ext}`;
}
