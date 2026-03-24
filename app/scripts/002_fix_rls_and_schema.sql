-- ============================================================
-- 002: RLS 보완 및 스키마 수정
-- 001_create_tables.sql 실행 후 적용
-- ============================================================

-- ========== 스키마 수정 ==========

-- col_organ: PK를 org_id에서 자동증가 id로 변경 (1:N 관계 지원)
-- 기존 테이블이 있으면 삭제 후 재생성
DROP TABLE IF EXISTS col_organ CASCADE;
CREATE TABLE col_organ (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL REFERENCES organ(org_id),
  org_sec_cd INTEGER NOT NULL,
  org_name VARCHAR(50) NOT NULL
);
CREATE INDEX idx_col_organ_org ON col_organ(org_id);

-- sum_rept: PK를 자동증가로 변경
DROP TABLE IF EXISTS sum_rept CASCADE;
CREATE TABLE sum_rept (
  sum_rept_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT REFERENCES organ(org_id),
  acc_sec_cd INTEGER,
  org_sec_cd INTEGER,
  org_name VARCHAR(50),
  col_01 NUMERIC(15,0), col_02 NUMERIC(15,0), col_03 NUMERIC(15,0),
  col_04 NUMERIC(15,0), col_05 NUMERIC(15,0), col_06 NUMERIC(15,0),
  col_07 NUMERIC(15,0), col_08 NUMERIC(15,0), col_09 NUMERIC(15,0),
  col_10 NUMERIC(15,0), col_11 NUMERIC(15,0), col_12 NUMERIC(15,0),
  col_13 NUMERIC(15,0), col_14 NUMERIC(15,0), col_15 NUMERIC(15,0),
  col_16 NUMERIC(15,0), col_17 NUMERIC(15,0), col_18 NUMERIC(15,0),
  col_19 NUMERIC(15,0), col_20 NUMERIC(15,0), col_21 NUMERIC(15,0),
  col_22 NUMERIC(15,0), col_23 NUMERIC(15,0), col_24 NUMERIC(15,0),
  col_25 NUMERIC(15,0), col_26 NUMERIC(15,0), col_27 NUMERIC(15,0),
  col_28 NUMERIC(15,0), col_29 NUMERIC(15,0), col_30 NUMERIC(15,0),
  col_31 NUMERIC(15,0), col_32 NUMERIC(15,0), col_33 NUMERIC(15,0),
  status VARCHAR(1)
);

-- ========== 누락된 RLS 정책 추가 ==========

-- user_organ: 자신의 매핑만 접근
ALTER TABLE user_organ ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_organ_own" ON user_organ FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "user_organ_insert" ON user_organ FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- customer_addr: 인증 사용자 접근 가능 (customer와 동일)
ALTER TABLE customer_addr ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customer_addr_access" ON customer_addr FOR ALL
  USING (auth.uid() IS NOT NULL);

-- col_organ: 사용기관별 접근
ALTER TABLE col_organ ENABLE ROW LEVEL SECURITY;
CREATE POLICY "col_organ_access" ON col_organ FOR ALL
  USING (org_id IN (SELECT org_id FROM user_organ WHERE user_id = auth.uid()));

-- sum_rept: 사용기관별 접근
ALTER TABLE sum_rept ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sum_rept_access" ON sum_rept FOR ALL
  USING (org_id IN (SELECT org_id FROM user_organ WHERE user_id = auth.uid()));

-- accbooksend: 인증 사용자 접근
ALTER TABLE accbooksend ENABLE ROW LEVEL SECURITY;
CREATE POLICY "accbooksend_access" ON accbooksend FOR ALL
  USING (auth.uid() IS NOT NULL);

-- alarm: 인증 사용자 접근
ALTER TABLE alarm ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alarm_access" ON alarm FOR ALL
  USING (auth.uid() IS NOT NULL);

-- acc_rel2: 인증 사용자 읽기
ALTER TABLE acc_rel2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acc_rel2_read" ON acc_rel2 FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ========== organ INSERT 정책 (신규 등록용) ==========
-- 001에서는 SELECT/UPDATE만 정의됨
CREATE POLICY "organ_insert" ON organ FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ========== codevalue WRITE 정책 (코드관리용) ==========
CREATE POLICY "codevalue_write" ON codevalue FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "codevalue_update" ON codevalue FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- codeset도 동일
CREATE POLICY "codeset_write" ON codeset FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "codeset_update" ON codeset FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- ========== 인덱스 보완 ==========
CREATE INDEX IF NOT EXISTS idx_acc_book_cust ON acc_book(cust_id);
CREATE INDEX IF NOT EXISTS idx_customer_name ON customer(name);
CREATE INDEX IF NOT EXISTS idx_user_organ_user ON user_organ(user_id);
CREATE INDEX IF NOT EXISTS idx_backup_history_org ON backup_history(org_id);
CREATE INDEX IF NOT EXISTS idx_estate_org ON estate(org_id);
