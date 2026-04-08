-- ============================================================
-- 006: public → pfam 스키마 이동
-- 모든 테이블을 pfam 스키마로 이전하고
-- RLS 정책, 함수, 권한을 업데이트
-- ============================================================
-- 실행 전: Supabase Dashboard에서 백업 권장
-- 실행 후: Dashboard → Settings → API → Schema에 pfam 추가 필요
-- ============================================================

BEGIN;

-- ============================================================
-- 1. pfam 스키마 생성 및 권한 부여
-- ============================================================
CREATE SCHEMA IF NOT EXISTS pfam;

GRANT USAGE ON SCHEMA pfam TO anon, authenticated, service_role;
GRANT ALL ON SCHEMA pfam TO supabase_admin;

-- 향후 생성되는 테이블/시퀀스에도 권한 자동 부여
ALTER DEFAULT PRIVILEGES IN SCHEMA pfam
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA pfam
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA pfam
  GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

-- ============================================================
-- 2. 테이블 이동 (public → pfam)
-- ALTER TABLE SET SCHEMA는 인덱스, FK, RLS 정책도 함께 이동
-- ============================================================
ALTER TABLE public.codeset SET SCHEMA pfam;
ALTER TABLE public.codevalue SET SCHEMA pfam;
ALTER TABLE public.organ SET SCHEMA pfam;
ALTER TABLE public.user_organ SET SCHEMA pfam;
ALTER TABLE public.customer SET SCHEMA pfam;
ALTER TABLE public.customer_addr SET SCHEMA pfam;
ALTER TABLE public.acc_rel SET SCHEMA pfam;
ALTER TABLE public.acc_rel2 SET SCHEMA pfam;
ALTER TABLE public.acc_book SET SCHEMA pfam;
ALTER TABLE public.acc_book_bak SET SCHEMA pfam;
ALTER TABLE public.accbooksend SET SCHEMA pfam;
ALTER TABLE public.estate SET SCHEMA pfam;
ALTER TABLE public.opinion SET SCHEMA pfam;
ALTER TABLE public.col_organ SET SCHEMA pfam;
ALTER TABLE public.sum_rept SET SCHEMA pfam;
ALTER TABLE public.alarm SET SCHEMA pfam;
ALTER TABLE public.backup_history SET SCHEMA pfam;

-- RAG 테이블도 이동 (존재하는 경우)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rag_documents') THEN
    ALTER TABLE public.rag_documents SET SCHEMA pfam;
  END IF;
END $$;

-- ============================================================
-- 3. 역할 search_path에 pfam 추가
-- RLS 정책의 비정규화 테이블 참조가 정상 동작하도록
-- ============================================================
ALTER ROLE authenticated SET search_path TO pfam, public, extensions;
ALTER ROLE anon SET search_path TO pfam, public, extensions;
ALTER ROLE service_role SET search_path TO pfam, public, extensions;

-- ============================================================
-- 4. PostgREST에 pfam 스키마 노출
-- ============================================================
-- Supabase Dashboard에서 수동 설정 필요:
-- Dashboard → Settings → API → "Exposed schemas"에 pfam 추가
-- 또는 Dashboard → Database → Extensions → Extra schemas에 pfam 추가
NOTIFY pgrst, 'reload config';

-- ============================================================
-- 5. RLS 정책 재생성 (pfam.user_organ 명시적 참조)
-- 기존 정책은 테이블과 함께 이동되었으나, 내부 참조를 명시화
-- ============================================================

-- acc_book
DROP POLICY IF EXISTS "acc_book_org_access" ON pfam.acc_book;
CREATE POLICY "acc_book_org_access" ON pfam.acc_book FOR ALL USING (
  org_id IN (SELECT org_id FROM pfam.user_organ WHERE user_id = auth.uid())
);

-- acc_book_bak
DROP POLICY IF EXISTS "acc_book_bak_org_access" ON pfam.acc_book_bak;
CREATE POLICY "acc_book_bak_org_access" ON pfam.acc_book_bak FOR ALL USING (
  org_id IN (SELECT org_id FROM pfam.user_organ WHERE user_id = auth.uid())
);

-- estate
DROP POLICY IF EXISTS "estate_org_access" ON pfam.estate;
CREATE POLICY "estate_org_access" ON pfam.estate FOR ALL USING (
  org_id IN (SELECT org_id FROM pfam.user_organ WHERE user_id = auth.uid())
);

-- opinion
DROP POLICY IF EXISTS "opinion_org_access" ON pfam.opinion;
CREATE POLICY "opinion_org_access" ON pfam.opinion FOR ALL USING (
  org_id IN (SELECT org_id FROM pfam.user_organ WHERE user_id = auth.uid())
);

-- backup_history
DROP POLICY IF EXISTS "backup_history_access" ON pfam.backup_history;
CREATE POLICY "backup_history_access" ON pfam.backup_history FOR ALL USING (
  org_id IN (SELECT org_id FROM pfam.user_organ WHERE user_id = auth.uid())
);

-- organ (SELECT + UPDATE)
DROP POLICY IF EXISTS "organ_read" ON pfam.organ;
DROP POLICY IF EXISTS "organ_write" ON pfam.organ;
DROP POLICY IF EXISTS "organ_insert" ON pfam.organ;
CREATE POLICY "organ_read" ON pfam.organ FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "organ_write" ON pfam.organ FOR UPDATE USING (
  org_id IN (SELECT org_id FROM pfam.user_organ WHERE user_id = auth.uid())
);
CREATE POLICY "organ_insert" ON pfam.organ FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- user_organ
DROP POLICY IF EXISTS "user_organ_own" ON pfam.user_organ;
DROP POLICY IF EXISTS "user_organ_insert" ON pfam.user_organ;
CREATE POLICY "user_organ_own" ON pfam.user_organ FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "user_organ_insert" ON pfam.user_organ FOR INSERT WITH CHECK (user_id = auth.uid());

-- col_organ
DROP POLICY IF EXISTS "col_organ_access" ON pfam.col_organ;
CREATE POLICY "col_organ_access" ON pfam.col_organ FOR ALL USING (
  org_id IN (SELECT org_id FROM pfam.user_organ WHERE user_id = auth.uid())
);

-- sum_rept
DROP POLICY IF EXISTS "sum_rept_access" ON pfam.sum_rept;
CREATE POLICY "sum_rept_access" ON pfam.sum_rept FOR ALL USING (
  org_id IN (SELECT org_id FROM pfam.user_organ WHERE user_id = auth.uid())
);

-- codeset (read + write)
DROP POLICY IF EXISTS "codeset_read" ON pfam.codeset;
DROP POLICY IF EXISTS "codeset_write" ON pfam.codeset;
DROP POLICY IF EXISTS "codeset_update" ON pfam.codeset;
CREATE POLICY "codeset_read" ON pfam.codeset FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "codeset_write" ON pfam.codeset FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "codeset_update" ON pfam.codeset FOR UPDATE USING (auth.uid() IS NOT NULL);

-- codevalue (read + write)
DROP POLICY IF EXISTS "codevalue_read" ON pfam.codevalue;
DROP POLICY IF EXISTS "codevalue_write" ON pfam.codevalue;
DROP POLICY IF EXISTS "codevalue_update" ON pfam.codevalue;
CREATE POLICY "codevalue_read" ON pfam.codevalue FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "codevalue_write" ON pfam.codevalue FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "codevalue_update" ON pfam.codevalue FOR UPDATE USING (auth.uid() IS NOT NULL);

-- acc_rel (read)
DROP POLICY IF EXISTS "acc_rel_read" ON pfam.acc_rel;
CREATE POLICY "acc_rel_read" ON pfam.acc_rel FOR SELECT USING (auth.uid() IS NOT NULL);

-- acc_rel2 (read)
DROP POLICY IF EXISTS "acc_rel2_read" ON pfam.acc_rel2;
CREATE POLICY "acc_rel2_read" ON pfam.acc_rel2 FOR SELECT USING (auth.uid() IS NOT NULL);

-- customer (all)
DROP POLICY IF EXISTS "customer_access" ON pfam.customer;
CREATE POLICY "customer_access" ON pfam.customer FOR ALL USING (auth.uid() IS NOT NULL);

-- customer_addr (all)
DROP POLICY IF EXISTS "customer_addr_access" ON pfam.customer_addr;
CREATE POLICY "customer_addr_access" ON pfam.customer_addr FOR ALL USING (auth.uid() IS NOT NULL);

-- accbooksend (all)
DROP POLICY IF EXISTS "accbooksend_access" ON pfam.accbooksend;
CREATE POLICY "accbooksend_access" ON pfam.accbooksend FOR ALL USING (auth.uid() IS NOT NULL);

-- alarm (all)
DROP POLICY IF EXISTS "alarm_access" ON pfam.alarm;
CREATE POLICY "alarm_access" ON pfam.alarm FOR ALL USING (auth.uid() IS NOT NULL);

-- ============================================================
-- 6. 함수 재생성 (pfam 스키마 명시적 참조)
-- ============================================================

-- 수입/지출 잔액 계산
CREATE OR REPLACE FUNCTION pfam.calculate_balance(
  p_org_id BIGINT,
  p_acc_sec_cd INTEGER DEFAULT NULL,
  p_date_from CHAR(8) DEFAULT NULL,
  p_date_to CHAR(8) DEFAULT NULL
)
RETURNS TABLE(income_total NUMERIC, expense_total NUMERIC, balance NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pfam, public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN incm_sec_cd = 1 THEN acc_amt ELSE 0 END), 0) AS income_total,
    COALESCE(SUM(CASE WHEN incm_sec_cd = 2 THEN acc_amt ELSE 0 END), 0) AS expense_total,
    COALESCE(SUM(CASE WHEN incm_sec_cd = 1 THEN acc_amt ELSE -acc_amt END), 0) AS balance
  FROM pfam.acc_book
  WHERE org_id = p_org_id
    AND (p_acc_sec_cd IS NULL OR acc_sec_cd = p_acc_sec_cd)
    AND (p_date_from IS NULL OR acc_date >= p_date_from)
    AND (p_date_to IS NULL OR acc_date <= p_date_to);
END;
$$;

-- 백업 데이터 Export
CREATE OR REPLACE FUNCTION pfam.export_org_data(p_org_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pfam, public
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'organ', (SELECT to_jsonb(o) FROM pfam.organ o WHERE org_id = p_org_id),
    'acc_book', (SELECT jsonb_agg(to_jsonb(a)) FROM pfam.acc_book a WHERE org_id = p_org_id),
    'estate', (SELECT jsonb_agg(to_jsonb(e)) FROM pfam.estate e WHERE org_id = p_org_id),
    'opinion', (SELECT to_jsonb(op) FROM pfam.opinion op WHERE org_id = p_org_id),
    'exported_at', now()
  ) INTO result;
  RETURN result;
END;
$$;

-- 벡터 유사도 검색 (rag_documents가 존재하는 경우)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'pfam' AND table_name = 'rag_documents') THEN
    EXECUTE $func$
      CREATE OR REPLACE FUNCTION pfam.match_documents(
        query_embedding VECTOR(1536),
        match_count INT DEFAULT 8,
        filter JSONB DEFAULT '{}'
      )
      RETURNS TABLE (
        id BIGINT,
        content TEXT,
        metadata JSONB,
        similarity FLOAT
      )
      LANGUAGE plpgsql
      SET search_path = pfam, public
      AS $inner$
      BEGIN
        RETURN QUERY
        SELECT
          rd.id,
          rd.content,
          rd.metadata,
          1 - (rd.embedding <=> query_embedding) AS similarity
        FROM pfam.rag_documents rd
        WHERE (filter = '{}' OR rd.metadata @> filter)
        ORDER BY rd.embedding <=> query_embedding
        LIMIT match_count;
      END;
      $inner$;
    $func$;
  END IF;
END $$;

-- 기존 public 스키마의 함수 제거
DROP FUNCTION IF EXISTS public.calculate_balance(BIGINT, INTEGER, CHAR, CHAR);
DROP FUNCTION IF EXISTS public.export_org_data(BIGINT);
DROP FUNCTION IF EXISTS public.match_documents(VECTOR, INT, JSONB);

-- ============================================================
-- 7. 기존 테이블/시퀀스 권한 부여 (이동된 객체에 대해)
-- ============================================================
GRANT ALL ON ALL TABLES IN SCHEMA pfam TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA pfam TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pfam TO anon, authenticated, service_role;

COMMIT;

-- ============================================================
-- 확인 쿼리
-- ============================================================
-- SELECT table_schema, table_name FROM information_schema.tables
-- WHERE table_schema = 'pfam' ORDER BY table_name;
--
-- SELECT schemaname, policyname, tablename
-- FROM pg_policies WHERE schemaname = 'pfam';
