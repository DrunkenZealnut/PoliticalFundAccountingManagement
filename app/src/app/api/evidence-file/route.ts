import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { db: { schema: "pfam" } }
);

const BUCKET = "evidence";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const maxDuration = 60;

/** 버킷 존재 확인 및 자동 생성 */
async function ensureBucket() {
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (!data) {
    await supabase.storage.createBucket(BUCKET, { public: false });
  }
}

/**
 * GET /api/evidence-file?accBookId=123
 * 특정 acc_book 항목의 증빙파일 목록 조회
 */
export async function GET(request: NextRequest) {
  const accBookId = request.nextUrl.searchParams.get("accBookId");
  const orgId = request.nextUrl.searchParams.get("orgId");

  if (!accBookId && !orgId) {
    return NextResponse.json({ error: "accBookId or orgId required" }, { status: 400 });
  }

  let query = supabase.from("evidence_file").select("*");
  if (accBookId) query = query.eq("acc_book_id", Number(accBookId));
  if (orgId) query = query.eq("org_id", Number(orgId));

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data || []);
}

/**
 * POST /api/evidence-file
 * 증빙파일 업로드 (base64) → Supabase Storage → 메타데이터 저장
 *
 * Body: { accBookId, orgId, fileName, fileType, fileData (base64) }
 */
export async function POST(request: NextRequest) {
  try {
    const { accBookId, orgId, fileName, fileType, fileData } = await request.json();

    if (!orgId || !fileName || !fileType || !fileData) {
      return NextResponse.json({ error: "필수 필드 누락" }, { status: 400 });
    }

    // base64 → Buffer
    const buffer = Buffer.from(fileData, "base64");

    if (buffer.length > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `파일 크기 초과: ${(buffer.length / 1024 / 1024).toFixed(1)}MB (최대 10MB)` },
        { status: 400 }
      );
    }

    // 파일 확장자 추출 후 안전한 storage key 생성 (한글/공백 등 제거)
    const ext = fileName.includes(".") ? fileName.substring(fileName.lastIndexOf(".")) : "";
    const safeName = fileName
      .replace(/\.[^.]+$/, "")           // 확장자 제거
      .replace(/[^a-zA-Z0-9_-]/g, "_")   // 영문/숫자/밑줄/대시만 허용
      .replace(/_+/g, "_")               // 연속 밑줄 축약
      .substring(0, 100);                // 길이 제한
    const storagePath = `${orgId}/${Date.now()}_${safeName}${ext}`;

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
