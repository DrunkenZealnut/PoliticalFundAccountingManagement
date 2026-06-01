-- 012_delete_org_data.sql
-- 사용기관(organ) 원자적 삭제 RPC (organ-deletion design §3)
--
-- org_id FK 대부분은 ON DELETE CASCADE가 없으므로(001_create_tables.sql 참고),
-- 검증된 역-FK 순서로 자식 행 → organ 을 단일 트랜잭션(함수 본문)에서 삭제한다.
-- 중간 에러 시 전체 자동 롤백되어 부분 삭제가 발생하지 않는다.
--
-- 주의:
--  * acc_book.cust_id → customer(FK) 때문에 acc_book을 customer보다 먼저 삭제한다.
--  * customer는 011에서 추가된 org_id 기준으로만 삭제하여, org_id IS NULL(공용/익명) 레코드는 보존한다.
--  * evidence_file은 acc_book 삭제 시 cascade되지만, unlinked(acc_book_id NULL) 증빙 누락을 막기 위해
--    org_id 기준으로 먼저 명시 삭제한다. Storage의 실제 파일은 호출 측(API)에서 사전 제거한다.
--  * col_organ/sum_rept/alarm은 환경에 따라 부재할 수 있어 to_regclass 가드로 보호한다.
--
-- 권한: service_role 만 실행. 호출자 소속(user_organ) 검증은 API 계층에서 수행한다.

CREATE OR REPLACE FUNCTION pfam.delete_org_data(p_org_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  c_customer_addr INT := 0;
  c_evidence      INT := 0;
  c_bak           INT := 0;
  c_acc           INT := 0;
  c_estate        INT := 0;
  c_opinion       INT := 0;
  c_backup        INT := 0;
  c_customer      INT := 0;
  c_user          INT := 0;
  c_organ         INT := 0;
BEGIN
  -- 1) customer_addr (해당 org customer의 주소)
  DELETE FROM pfam.customer_addr ca
   USING pfam.customer c
   WHERE ca.cust_id = c.cust_id AND c.org_id = p_org_id;
  GET DIAGNOSTICS c_customer_addr = ROW_COUNT;

  -- 2) evidence_file (unlinked 포함, org_id 기준 명시 삭제)
  DELETE FROM pfam.evidence_file WHERE org_id = p_org_id;
  GET DIAGNOSTICS c_evidence = ROW_COUNT;

  -- 3) acc_book_bak
  DELETE FROM pfam.acc_book_bak WHERE org_id = p_org_id;
  GET DIAGNOSTICS c_bak = ROW_COUNT;

  -- 4) acc_book (남은 evidence_file은 acc_book_id cascade로 정리)
  DELETE FROM pfam.acc_book WHERE org_id = p_org_id;
  GET DIAGNOSTICS c_acc = ROW_COUNT;

  -- 5) estate
  DELETE FROM pfam.estate WHERE org_id = p_org_id;
  GET DIAGNOSTICS c_estate = ROW_COUNT;

  -- 6) opinion
  DELETE FROM pfam.opinion WHERE org_id = p_org_id;
  GET DIAGNOSTICS c_opinion = ROW_COUNT;

  -- 7) backup_history
  DELETE FROM pfam.backup_history WHERE org_id = p_org_id;
  GET DIAGNOSTICS c_backup = ROW_COUNT;

  -- 8~10) col_organ / sum_rept / alarm — 테이블 존재 시에만
  IF to_regclass('pfam.col_organ') IS NOT NULL THEN
    DELETE FROM pfam.col_organ WHERE org_id = p_org_id;
  END IF;
  IF to_regclass('pfam.sum_rept') IS NOT NULL THEN
    DELETE FROM pfam.sum_rept WHERE org_id = p_org_id;
  END IF;
  IF to_regclass('pfam.alarm') IS NOT NULL THEN
    DELETE FROM pfam.alarm WHERE org_id = p_org_id;
  END IF;

  -- 11) customer (org_id 일치만; NULL=공용/익명 보존)
  DELETE FROM pfam.customer WHERE org_id = p_org_id;
  GET DIAGNOSTICS c_customer = ROW_COUNT;

  -- 12) user_organ (해당 org 매핑 전부)
  DELETE FROM pfam.user_organ WHERE org_id = p_org_id;
  GET DIAGNOSTICS c_user = ROW_COUNT;

  -- 13) organ (최종)
  DELETE FROM pfam.organ WHERE org_id = p_org_id;
  GET DIAGNOSTICS c_organ = ROW_COUNT;

  RETURN jsonb_build_object(
    'org_id',         p_org_id,
    'organ_deleted',  c_organ,
    'acc_book',       c_acc,
    'acc_book_bak',   c_bak,
    'evidence_file',  c_evidence,
    'estate',         c_estate,
    'opinion',        c_opinion,
    'backup_history', c_backup,
    'customer',       c_customer,
    'customer_addr',  c_customer_addr,
    'user_organ',     c_user
  );
END;
$$;

GRANT EXECUTE ON FUNCTION pfam.delete_org_data(BIGINT) TO service_role;
