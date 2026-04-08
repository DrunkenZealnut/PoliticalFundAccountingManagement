-- ============================================================
-- 007: 증빙서류 파일 저장 테이블
-- acc_book 항목에 영수증/계약서 이미지를 연결
-- ============================================================

-- 1. Supabase Storage 버킷 생성 (Supabase Dashboard에서 실행)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('evidence', 'evidence', false);

-- 2. 증빙파일 메타데이터 테이블
CREATE TABLE IF NOT EXISTS pfam.evidence_file (
  file_id       SERIAL PRIMARY KEY,
  acc_book_id   INTEGER REFERENCES pfam.acc_book(acc_book_id) ON DELETE CASCADE,
  org_id        INTEGER NOT NULL,
  file_name     TEXT NOT NULL,
  file_type     TEXT NOT NULL,        -- image/jpeg, image/png, application/pdf
  storage_path  TEXT NOT NULL,        -- Supabase Storage 경로
  file_size     INTEGER DEFAULT 0,    -- bytes
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evidence_file_acc_book ON pfam.evidence_file(acc_book_id);
CREATE INDEX IF NOT EXISTS idx_evidence_file_org ON pfam.evidence_file(org_id);

-- 3. RLS 정책 (service_role은 모두 가능, anon은 읽기만)
ALTER TABLE pfam.evidence_file ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON pfam.evidence_file
  FOR ALL USING (true) WITH CHECK (true);
