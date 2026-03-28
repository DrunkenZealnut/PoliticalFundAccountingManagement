-- ============================================================
-- 정치자금 회계관리 시스템 - Supabase PostgreSQL 스키마
-- SQLite → PostgreSQL 변환
-- ============================================================

-- 0. Supabase Auth 사용자 ↔ 사용기관 매핑
CREATE TABLE user_organ (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id BIGINT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, org_id)
);

-- 1. 코드분류 (CODESET)
CREATE TABLE codeset (
  cs_id INTEGER PRIMARY KEY,
  cs_name VARCHAR(30),
  cs_activeflag VARCHAR(5),
  cs_comment VARCHAR(255)
);

-- 2. 코드값 (CODEVALUE)
CREATE TABLE codevalue (
  cv_id INTEGER PRIMARY KEY,
  cs_id INTEGER NOT NULL REFERENCES codeset(cs_id),
  cv_name VARCHAR(30) NOT NULL,
  cv_order INTEGER NOT NULL,
  cv_comment VARCHAR(255),
  cv_etc VARCHAR(50),
  cv_etc2 VARCHAR(50),
  cv_etc3 VARCHAR(50),
  cv_etc4 VARCHAR(50),
  cv_etc5 VARCHAR(50),
  cv_etc6 VARCHAR(50),
  cv_etc7 VARCHAR(50),
  cv_etc8 VARCHAR(50),
  cv_etc9 VARCHAR(50),
  cv_etc10 VARCHAR(50)
);

-- 3. 사용기관 (ORGAN)
CREATE TABLE organ (
  org_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_sec_cd INTEGER NOT NULL REFERENCES codevalue(cv_id),
  org_name VARCHAR(100) NOT NULL,
  reg_num VARCHAR(13) NOT NULL,
  reg_date CHAR(8),
  post VARCHAR(6),
  addr VARCHAR(100),
  addr_detail VARCHAR(100),
  tel VARCHAR(20),
  fax VARCHAR(20),
  rep_name VARCHAR(50),
  acct_name VARCHAR(50),
  comm VARCHAR(50),
  userid VARCHAR(20),
  passwd VARCHAR(100),  -- Supabase Auth로 대체, 레거시 호환용
  hint1 VARCHAR(50),
  hint2 VARCHAR(50),
  org_order INTEGER,
  pre_acc_from CHAR(8),
  pre_acc_to CHAR(8),
  acc_from CHAR(8),
  acc_to CHAR(8),
  code_date CHAR(8)
);

-- user_organ FK 추가
ALTER TABLE user_organ
  ADD CONSTRAINT user_organ_fk_org FOREIGN KEY (org_id) REFERENCES organ(org_id);

-- 4. 수입지출처 (CUSTOMER)
CREATE TABLE customer (
  cust_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cust_sec_cd INTEGER NOT NULL REFERENCES codevalue(cv_id),
  reg_num VARCHAR(15),
  name VARCHAR(50),
  job VARCHAR(30),
  tel VARCHAR(20),
  sido INTEGER,
  post VARCHAR(7),
  addr VARCHAR(100),
  addr_detail VARCHAR(100),
  fax VARCHAR(20),
  bigo VARCHAR(50),
  reg_date VARCHAR(8),
  cust_order INTEGER
);

-- 5. 수입지출처 주소이력 (CUSTOMER_ADDR)
CREATE TABLE customer_addr (
  cust_id BIGINT NOT NULL REFERENCES customer(cust_id),
  cust_seq INTEGER NOT NULL,
  reg_date VARCHAR(8),
  tel VARCHAR(20),
  post VARCHAR(7),
  addr VARCHAR(100),
  addr_detail VARCHAR(100),
  PRIMARY KEY (cust_id, cust_seq)
);

-- 6. 계정관계 (ACC_REL)
CREATE TABLE acc_rel (
  acc_rel_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_sec_cd INTEGER NOT NULL REFERENCES codevalue(cv_id),
  incm_sec_cd INTEGER NOT NULL,
  acc_sec_cd INTEGER NOT NULL,
  item_sec_cd INTEGER NOT NULL,
  exp_sec_cd INTEGER NOT NULL,
  input_yn CHAR(1) NOT NULL,
  acc_order INTEGER NOT NULL,
  UNIQUE (org_sec_cd, incm_sec_cd, acc_sec_cd, item_sec_cd, exp_sec_cd)
);

-- 7. 계정관계2 (ACC_REL2) - 확장용
CREATE TABLE acc_rel2 (
  acc_rel_id BIGINT NOT NULL PRIMARY KEY,
  org_sec_cd INTEGER NOT NULL REFERENCES codevalue(cv_id),
  incm_sec_cd INTEGER NOT NULL,
  acc_sec_cd INTEGER NOT NULL,
  item_sec_cd INTEGER NOT NULL,
  exp_sec_cd INTEGER NOT NULL,
  input_yn CHAR(1) NOT NULL,
  acc_order INTEGER NOT NULL
);

-- 8. 수입지출 회계장부 (ACC_BOOK) - 핵심 테이블
CREATE TABLE acc_book (
  acc_book_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL REFERENCES organ(org_id),
  incm_sec_cd INTEGER NOT NULL,      -- 1=수입, 2=지출
  acc_sec_cd INTEGER NOT NULL,        -- 계정구분
  item_sec_cd INTEGER NOT NULL,       -- 계정과목
  exp_sec_cd INTEGER NOT NULL,        -- 경비구분
  cust_id BIGINT NOT NULL REFERENCES customer(cust_id),
  acc_date CHAR(8) NOT NULL,          -- 거래일자 YYYYMMDD
  content VARCHAR(100) NOT NULL,      -- 내역
  acc_amt NUMERIC(15,0) NOT NULL,     -- 금액
  rcp_yn CHAR(1) NOT NULL,            -- 영수증 첨부 여부
  rcp_no VARCHAR(30),                 -- 증빙서번호
  rcp_no2 INTEGER DEFAULT 0,
  tel VARCHAR(20),
  post VARCHAR(7),
  addr VARCHAR(100),
  addr_detail VARCHAR(100),
  acc_sort_num INTEGER,               -- 정렬순서
  reg_date CHAR(8),
  acc_ins_type CHAR(2),               -- 지출방법 (계좌입금,카드,현금 등)
  acc_print_ok CHAR(1) DEFAULT 'N',
  bigo VARCHAR(100),
  bigo2 VARCHAR(100),
  return_yn CHAR(1) DEFAULT 'N',      -- 반환여부
  exp_type_cd INTEGER DEFAULT -1,     -- 지출유형
  exp_group1_cd VARCHAR(40),          -- 지출유형 대분류
  exp_group2_cd VARCHAR(40),          -- 지출유형 중분류
  exp_group3_cd VARCHAR(40)           -- 지출유형 소분류
);

-- 인덱스
CREATE INDEX idx_acc_book_org ON acc_book(org_id);
CREATE INDEX idx_acc_book_date ON acc_book(acc_date);
CREATE INDEX idx_acc_book_incm ON acc_book(incm_sec_cd);
CREATE INDEX idx_acc_book_org_date ON acc_book(org_id, acc_date);

-- 9. 회계장부 백업 (ACC_BOOK_BAK) - 복구(Undo)용
CREATE TABLE acc_book_bak (
  bak_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  work_kind INTEGER NOT NULL,         -- 작업종류 (수정/삭제)
  acc_book_id BIGINT NOT NULL,
  org_id BIGINT NOT NULL,
  incm_sec_cd INTEGER NOT NULL,
  acc_sec_cd INTEGER NOT NULL,
  item_sec_cd INTEGER NOT NULL,
  exp_sec_cd INTEGER NOT NULL,
  cust_id BIGINT NOT NULL,
  acc_date CHAR(8) NOT NULL,
  content VARCHAR(100) NOT NULL,
  acc_amt NUMERIC(15,0) NOT NULL,
  rcp_yn CHAR(1) NOT NULL,
  rcp_no VARCHAR(30),
  rcp_no2 INTEGER DEFAULT 0,
  tel VARCHAR(20),
  post VARCHAR(7),
  addr VARCHAR(100),
  addr_detail VARCHAR(100),
  acc_sort_num INTEGER,
  reg_date CHAR(8),
  acc_ins_type CHAR(2),
  acc_print_ok CHAR(1),
  bigo VARCHAR(100),
  bigo2 VARCHAR(100),
  return_yn CHAR(1),
  exp_type_cd INTEGER DEFAULT -1,
  exp_group1_cd VARCHAR(40),
  exp_group2_cd VARCHAR(40),
  exp_group3_cd VARCHAR(40)
);

-- 10. 전송이력 (ACCBOOKSEND)
CREATE TABLE accbooksend (
  acc_book_id BIGINT NOT NULL,
  send_date CHAR(8)
);

-- 11. 재산내역 (ESTATE)
CREATE TABLE estate (
  estate_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL REFERENCES organ(org_id),
  estate_sec_cd INTEGER NOT NULL REFERENCES codevalue(cv_id),
  kind VARCHAR(50) NOT NULL,
  qty INTEGER NOT NULL,
  content VARCHAR(100) NOT NULL,
  amt NUMERIC(15,0) NOT NULL,
  remark VARCHAR(100) NOT NULL,
  reg_date VARCHAR(8),
  estate_order INTEGER DEFAULT 0
);

-- 12. 감사의견서 (OPINION)
CREATE TABLE opinion (
  org_id BIGINT PRIMARY KEY REFERENCES organ(org_id),
  acc_from CHAR(8),
  acc_to CHAR(8),
  audit_from CHAR(8),
  audit_to CHAR(8),
  opinion VARCHAR(100),
  print_01 CHAR(8),
  position VARCHAR(50),
  addr VARCHAR(50),
  name VARCHAR(50),
  judge_from CHAR(8),
  judge_to CHAR(8),
  incm_from CHAR(8),
  incm_to CHAR(8),
  estate_amt NUMERIC(15,0),
  in_amt NUMERIC(15,0),
  cm_amt NUMERIC(15,0),
  balance_amt NUMERIC(15,0),
  print_02 CHAR(8),
  comm_desc VARCHAR(50),
  comm_name01 VARCHAR(50),
  comm_name02 VARCHAR(50),
  comm_name03 VARCHAR(50),
  comm_name04 VARCHAR(50),
  comm_name05 VARCHAR(50),
  acc_title VARCHAR(50),
  acc_docy CHAR(4),
  acc_docnum CHAR(4),
  acc_fdate CHAR(8),
  acc_comm VARCHAR(20),
  acc_torgnm VARCHAR(50),
  acc_borgnm VARCHAR(50),
  acc_repnm VARCHAR(20)
);

-- 13. 취합기관 (COL_ORGAN)
CREATE TABLE col_organ (
  org_id BIGINT PRIMARY KEY,
  org_sec_cd INTEGER NOT NULL REFERENCES codevalue(cv_id),
  org_name VARCHAR(50) NOT NULL
);

-- 14. 총괄보고서 (SUM_REPT)
CREATE TABLE sum_rept (
  sum_rept_id BIGINT PRIMARY KEY,
  org_id BIGINT,
  acc_sec_cd INTEGER REFERENCES codevalue(cv_id),
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

-- 15. 알림 (ALARM)
CREATE TABLE alarm (
  year CHAR(4),
  org_id BIGINT,
  type INTEGER,
  chk_yn CHAR(1),
  PRIMARY KEY (year, org_id, chk_yn)
);

-- 16. 백업 이력 (신규 - Supabase 환경용)
CREATE TABLE backup_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL REFERENCES organ(org_id),
  org_name VARCHAR(100),
  backup_type VARCHAR(20) NOT NULL,  -- 'manual', 'auto_logout', 'auto_exit'
  file_path TEXT NOT NULL,            -- Supabase Storage 경로
  file_size BIGINT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- ============================================================
-- RLS 정책 (Row Level Security)
-- ============================================================

ALTER TABLE acc_book ENABLE ROW LEVEL SECURITY;
ALTER TABLE acc_book_bak ENABLE ROW LEVEL SECURITY;
ALTER TABLE estate ENABLE ROW LEVEL SECURITY;
ALTER TABLE opinion ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_history ENABLE ROW LEVEL SECURITY;

-- acc_book: 사용자가 속한 기관의 데이터만 접근
CREATE POLICY "acc_book_org_access" ON acc_book FOR ALL USING (
  org_id IN (SELECT org_id FROM user_organ WHERE user_id = auth.uid())
);

CREATE POLICY "acc_book_bak_org_access" ON acc_book_bak FOR ALL USING (
  org_id IN (SELECT org_id FROM user_organ WHERE user_id = auth.uid())
);

CREATE POLICY "estate_org_access" ON estate FOR ALL USING (
  org_id IN (SELECT org_id FROM user_organ WHERE user_id = auth.uid())
);

CREATE POLICY "opinion_org_access" ON opinion FOR ALL USING (
  org_id IN (SELECT org_id FROM user_organ WHERE user_id = auth.uid())
);

CREATE POLICY "backup_history_access" ON backup_history FOR ALL USING (
  org_id IN (SELECT org_id FROM user_organ WHERE user_id = auth.uid())
);

-- codeset, codevalue, acc_rel: 모든 인증 사용자 읽기 가능
ALTER TABLE codeset ENABLE ROW LEVEL SECURITY;
ALTER TABLE codevalue ENABLE ROW LEVEL SECURITY;
ALTER TABLE acc_rel ENABLE ROW LEVEL SECURITY;

CREATE POLICY "codeset_read" ON codeset FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "codevalue_read" ON codevalue FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "acc_rel_read" ON acc_rel FOR SELECT USING (auth.uid() IS NOT NULL);

-- organ: 자신이 속한 기관만 수정, 전체 목록은 조회 가능
ALTER TABLE organ ENABLE ROW LEVEL SECURITY;
CREATE POLICY "organ_read" ON organ FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "organ_write" ON organ FOR UPDATE USING (
  org_id IN (SELECT org_id FROM user_organ WHERE user_id = auth.uid())
);

-- customer: 모든 인증 사용자 접근 가능 (공유 자원)
ALTER TABLE customer ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customer_access" ON customer FOR ALL USING (auth.uid() IS NOT NULL);

-- ============================================================
-- 유용한 PostgreSQL Functions (Supabase RPC)
-- ============================================================

-- 수입/지출 잔액 계산 함수
CREATE OR REPLACE FUNCTION calculate_balance(
  p_org_id BIGINT,
  p_acc_sec_cd INTEGER DEFAULT NULL,
  p_date_from CHAR(8) DEFAULT NULL,
  p_date_to CHAR(8) DEFAULT NULL
)
RETURNS TABLE(income_total NUMERIC, expense_total NUMERIC, balance NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN incm_sec_cd = 1 THEN acc_amt ELSE 0 END), 0) AS income_total,
    COALESCE(SUM(CASE WHEN incm_sec_cd = 2 THEN acc_amt ELSE 0 END), 0) AS expense_total,
    COALESCE(SUM(CASE WHEN incm_sec_cd = 1 THEN acc_amt ELSE -acc_amt END), 0) AS balance
  FROM acc_book
  WHERE org_id = p_org_id
    AND (p_acc_sec_cd IS NULL OR acc_sec_cd = p_acc_sec_cd)
    AND (p_date_from IS NULL OR acc_date >= p_date_from)
    AND (p_date_to IS NULL OR acc_date <= p_date_to);
END;
$$;

-- 백업 데이터 Export 함수
CREATE OR REPLACE FUNCTION export_org_data(p_org_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'organ', (SELECT to_jsonb(o) FROM organ o WHERE org_id = p_org_id),
    'acc_book', (SELECT jsonb_agg(to_jsonb(a)) FROM acc_book a WHERE org_id = p_org_id),
    'estate', (SELECT jsonb_agg(to_jsonb(e)) FROM estate e WHERE org_id = p_org_id),
    'opinion', (SELECT to_jsonb(op) FROM opinion op WHERE org_id = p_org_id),
    'exported_at', now()
  ) INTO result;
  RETURN result;
END;
$$;
