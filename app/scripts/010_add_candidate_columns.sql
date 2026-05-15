-- 010_add_candidate_columns.sql
-- 목적: PFund2 호환을 위한 후보자(candidate) 전용 컬럼 14개 추가
--
-- 배경:
--   PFund2는 후보자(ORG_ID=1)와 후원회(ORG_ID=2)를 별도 .db 파일로 운영하며
--   (Fund_Data_1.db, Fund_Data_2.db, Fund_Master.db),
--   ORGAN 페어를 마스터에 보관함. 우리 supabase는 후원회 organ 1행만 보유하므로
--   export 시 후보자 데이터(REG_NUM=생년월일, ADDR=후보자 거주지, USERID/PASSWD 등)가
--   부정확. 후보자 전용 컬럼을 추가해 정확한 페어 ORGAN을 생성할 수 있게 한다.
--
-- 사용처:
--   - import-sqlite: PFund2 .db의 ORG_ID=1 행 → candidate_* 컬럼에 저장
--   - export-sqlite: candidate_* 값을 후보자 행(ORG_ID=1)에 우선 적용
--   - /dashboard/organ: 후원회 단위일 때 후보자 정보 입력 섹션 노출
--
-- 적용 방법:
--   Supabase Studio → SQL Editor에서 본 파일 내용 그대로 실행.
--   또는 마이그레이션 도구가 있다면 그쪽 사용.

ALTER TABLE pfam.organ
  ADD COLUMN IF NOT EXISTS candidate_org_name   VARCHAR(100),
  ADD COLUMN IF NOT EXISTS candidate_reg_num    VARCHAR(15),
  ADD COLUMN IF NOT EXISTS candidate_reg_date   CHAR(8),
  ADD COLUMN IF NOT EXISTS candidate_post       VARCHAR(7),
  ADD COLUMN IF NOT EXISTS candidate_addr       VARCHAR(100),
  ADD COLUMN IF NOT EXISTS candidate_addr_detail VARCHAR(100),
  ADD COLUMN IF NOT EXISTS candidate_tel        VARCHAR(20),
  ADD COLUMN IF NOT EXISTS candidate_fax        VARCHAR(20),
  ADD COLUMN IF NOT EXISTS candidate_rep_name   VARCHAR(50),
  ADD COLUMN IF NOT EXISTS candidate_acct_name  VARCHAR(50),
  ADD COLUMN IF NOT EXISTS candidate_userid     VARCHAR(20),
  ADD COLUMN IF NOT EXISTS candidate_passwd     VARCHAR(100),
  ADD COLUMN IF NOT EXISTS candidate_hint1      VARCHAR(50),
  ADD COLUMN IF NOT EXISTS candidate_hint2      VARCHAR(50);

COMMENT ON COLUMN pfam.organ.candidate_org_name IS 'PFund2 호환: 후보자 행 ORG_NAME (예: "오준석후보"). 후원회 단위일 때만 사용';
COMMENT ON COLUMN pfam.organ.candidate_reg_num IS 'PFund2 호환: 후보자 REG_NUM (생년월일 YYYYMMDD)';
COMMENT ON COLUMN pfam.organ.candidate_reg_date IS 'PFund2 호환: 후보자 등록일 YYYYMMDD';
COMMENT ON COLUMN pfam.organ.candidate_post IS 'PFund2 호환: 후보자 주소 우편번호';
COMMENT ON COLUMN pfam.organ.candidate_addr IS 'PFund2 호환: 후보자 주소(시도/시군구/도로명)';
COMMENT ON COLUMN pfam.organ.candidate_addr_detail IS 'PFund2 호환: 후보자 주소 상세';
COMMENT ON COLUMN pfam.organ.candidate_tel IS 'PFund2 호환: 후보자 연락처';
COMMENT ON COLUMN pfam.organ.candidate_fax IS 'PFund2 호환: 후보자 fax';
COMMENT ON COLUMN pfam.organ.candidate_rep_name IS 'PFund2 호환: 후보자 행 REP_NAME (예: 선거사무장)';
COMMENT ON COLUMN pfam.organ.candidate_acct_name IS 'PFund2 호환: 후보자 행 ACCT_NAME (보통 후보자 본인)';
COMMENT ON COLUMN pfam.organ.candidate_userid IS 'PFund2 호환: 후보자 로그인 ID (후원회 USERID와 별개)';
COMMENT ON COLUMN pfam.organ.candidate_passwd IS 'PFund2 호환: 후보자 로그인 비밀번호 (평문)';
COMMENT ON COLUMN pfam.organ.candidate_hint1 IS 'PFund2 호환: 후보자 비밀번호 힌트1';
COMMENT ON COLUMN pfam.organ.candidate_hint2 IS 'PFund2 호환: 후보자 비밀번호 힌트2';
