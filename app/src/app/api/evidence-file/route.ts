import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  requireOrgMembership,
  type MembershipQueryClient,
} from "@/lib/api/require-org-membership";
import {
  buildEvidenceStoragePath,
  EVIDENCE_MAX_FILES,
  EVIDENCE_MAX_FILE_SIZE,
  EVIDENCE_BUCKET,
  EVIDENCE_SIGNED_URL_TTL,
} from "@/lib/evidence/storage-path";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { db: { schema: "pfam" } }
);

const BUCKET = EVIDENCE_BUCKET;
const SIGNED_URL_TTL = EVIDENCE_SIGNED_URL_TTL;

export const maxDuration = 60;

/** 허용 증빙파일 MIME (UI accept="image/*,application/pdf"와 일치) */
function isAllowedEvidenceMime(fileType: string): boolean {
  return fileType.startsWith("image/") || fileType === "application/pdf";
}

/** 버킷 존재 확인 및 자동 생성 */
async function ensureBucket() {
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (!data) {
    await supabase.storage.createBucket(BUCKET, { public: false });
  }
}

/**
 * GET /api/evidence-file?accBookId=123&orgId=7  → 거래의 증빙파일 목록(+ signed_url)
 * GET /api/evidence-file?orgId=7                → 조직 전체 증빙파일 목록(메타만, 개수 배지용)
 *
 * signed_url은 특정 거래(accBookId) 조회 시에만 생성한다.
 * 조직 전체 조회 시 대량 signed URL 생성을 피하기 위함.
 */
export async function GET(request: NextRequest) {
  const accBookId = request.nextUrl.searchParams.get("accBookId");
  const orgId = request.nextUrl.searchParams.get("orgId");

  // 인가: 로그인 + 해당 org 소속 검증(IDOR 방어 — orgId 필터만으로는 신뢰 경계가 안 됨).
  const auth = await requireOrgMembership(orgId, supabase as unknown as MembershipQueryClient);
  if (!auth.ok) return auth.response;

  let query = supabase.from("evidence_file").select("*").eq("org_id", Number(orgId));
  if (accBookId) query = query.eq("acc_book_id", Number(accBookId));

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data || [];

  // 특정 거래 조회 시에만 다운로드용 signed URL 생성 (storage_path가 단일 원천)
  if (accBookId && rows.length > 0) {
    const paths = rows.map((r) => r.storage_path).filter(Boolean) as string[];
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL);
    const urlByPath = new Map<string, string>();
    for (const s of signed || []) {
      if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
    }
    return NextResponse.json(
      rows.map((r) => ({ ...r, signed_url: urlByPath.get(r.storage_path) ?? null }))
    );
  }

  return NextResponse.json(rows);
}

/**
 * POST /api/evidence-file
 * 증빙파일 업로드 (base64) → Supabase Storage → 메타데이터 저장
 *
 * Body: { accBookId, orgId, fileName, fileType, fileData (base64), index? }
 */
export async function POST(request: NextRequest) {
  try {
    const { accBookId, orgId, fileName, fileType, fileData, index } = await request.json();

    if (!orgId || !fileName || !fileType || !fileData) {
      return NextResponse.json({ error: "필수 필드 누락" }, { status: 400 });
    }

    // 인가: 로그인 + 해당 org 소속 검증(IDOR 방어 — 타 기관에 증빙 주입 차단).
    const auth = await requireOrgMembership(orgId, supabase as unknown as MembershipQueryClient);
    if (!auth.ok) return auth.response;

    if (!isAllowedEvidenceMime(fileType)) {
      return NextResponse.json(
        { error: "허용되지 않는 파일 형식입니다 (이미지·PDF만 가능)" },
        { status: 400 }
      );
    }

    // 거래당 첨부 한도 검증 (acc_book에 연결된 경우만)
    if (accBookId) {
      const { count } = await supabase
        .from("evidence_file")
        .select("file_id", { count: "exact", head: true })
        .eq("acc_book_id", Number(accBookId))
        .eq("org_id", Number(orgId));
      if ((count ?? 0) >= EVIDENCE_MAX_FILES) {
        return NextResponse.json(
          { error: `증빙파일은 거래당 최대 ${EVIDENCE_MAX_FILES}건까지 첨부할 수 있습니다.` },
          { status: 400 }
        );
      }
    }

    // base64 → Buffer
    const buffer = Buffer.from(fileData, "base64");

    if (buffer.length > EVIDENCE_MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `파일 크기 초과: ${(buffer.length / 1024 / 1024).toFixed(1)}MB (최대 10MB)` },
        { status: 400 }
      );
    }

    // 체계적 경로 생성: {orgId}/acc/{accBookId}/{ts}_{seq}_{safe}.ext
    const storagePath = buildEvidenceStoragePath({
      orgId,
      accBookId: accBookId || null,
      fileName,
      seq: typeof index === "number" ? index : 0,
      timestamp: Date.now(),
    });

    // 버킷 존재 확인 (없으면 자동 생성)
    await ensureBucket();

    // Supabase Storage에 업로드
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: fileType, upsert: false });

    if (uploadError) {
      return NextResponse.json({ error: `업로드 실패: ${uploadError.message}` }, { status: 500 });
    }

    // 메타데이터 저장
    const { data, error } = await supabase.from("evidence_file").insert({
      acc_book_id: accBookId || null,
      org_id: orgId,
      file_name: fileName,
      file_type: fileType,
      storage_path: storagePath,
      file_size: buffer.length,
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/evidence-file?fileId=55&orgId=7
 * 증빙파일 1건 삭제: Storage 객체 + 메타데이터.
 * org_id가 일치하는 행만 삭제 가능(타 조직 파일 접근 차단).
 * best-effort: Storage 삭제 실패해도 DB 행은 삭제(고아 객체는 로깅).
 */
export async function DELETE(request: NextRequest) {
  try {
    const fileIdParam = request.nextUrl.searchParams.get("fileId");
    const orgIdParam = request.nextUrl.searchParams.get("orgId");
    if (!fileIdParam || !orgIdParam) {
      return NextResponse.json({ error: "fileId and orgId required" }, { status: 400 });
    }
    const fileId = Number(fileIdParam);
    const orgId = Number(orgIdParam);
    if (Number.isNaN(fileId) || Number.isNaN(orgId)) {
      return NextResponse.json({ error: "fileId and orgId required" }, { status: 400 });
    }

    // 인가: 로그인 + 해당 org 소속 검증(IDOR 방어 — 타 기관 증빙 삭제 차단).
    const auth = await requireOrgMembership(orgId, supabase as unknown as MembershipQueryClient);
    if (!auth.ok) return auth.response;

    // org 검증 + storage_path 확보
    const { data: row, error: findError } = await supabase
      .from("evidence_file")
      .select("file_id, storage_path")
      .eq("file_id", fileId)
      .eq("org_id", orgId)
      .maybeSingle();

    if (findError) return NextResponse.json({ error: findError.message }, { status: 500 });
    if (!row) return NextResponse.json({ error: "파일을 찾을 수 없음" }, { status: 404 });

    // Storage 객체 삭제 (실패해도 진행)
    let storageRemoved = true;
    if (row.storage_path) {
      const { error: removeError } = await supabase.storage.from(BUCKET).remove([row.storage_path]);
      if (removeError) {
        storageRemoved = false;
        console.error(`[evidence-file] Storage 삭제 실패(고아 가능): ${row.storage_path}`, removeError.message);
      }
    }

    // 메타데이터 삭제
    const { error: deleteError } = await supabase
      .from("evidence_file")
      .delete()
      .eq("file_id", fileId)
      .eq("org_id", orgId);

    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

    return NextResponse.json({ deleted: true, storageRemoved });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
