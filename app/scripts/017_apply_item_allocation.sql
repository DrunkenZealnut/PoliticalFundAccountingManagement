-- 017_apply_item_allocation.sql
-- 과목 배분 영구화 RPC — 계산은 TS(buildLedgerRows/planAllocationPersist), 쓰기는 한 트랜잭션.
--
-- 서버(api/system/apply-item-allocation)가 planAllocationPersist 결과(deleteMovedIds/updates/inserts)를
-- JSONB로 전달하면, 이 함수가 단일 트랜잭션으로:
--   1) 기존 이동분 삭제(alloc_src_id IS NOT NULL)
--   2) slice0 UPDATE (acc_book_id 재사용 — evidence_file FK·영수증 보존)
--   3) 이동분 INSERT (acc_book_id는 DB가 채번)
-- 중간 실패 시 전체 롤백(반쪽 장부 없음). delete_org_data/finalize_settlement 와 동일한 RPC 트랜잭션 패턴.
--
-- 멱등: 항상 raw 복원 후 재산출한 결과를 받으므로 재실행해도 결과 동일.
-- 롤백("배분 해제"): updates에 raw_* = null·원값을 담고 inserts=[] 로 호출하면 raw 상태 복귀.
--
-- 적용: Supabase SQL 에디터에서 수동 실행. scripts/016 선행 필수.
-- 보안: 서버 라우트가 service_role 로 호출. authenticated/service_role 에 EXECUTE 부여.
--
-- 파라미터:
--   p_org_id      대상 기관(후보자)
--   p_generation  배분 실행일 YYYYMMDD ('' 이면 alloc_gen=NULL = 롤백)
--   p_updates     slice0 행 배열(JSONB; acc_book_id 포함, 변경 컬럼 + raw_* 백업)
--   p_inserts     이동분 행 배열(JSONB; acc_book_id 없음, 전체 메타 + alloc_src_id/alloc_seq)

CREATE OR REPLACE FUNCTION pfam.apply_item_allocation(
  p_org_id     integer,
  p_generation char(8),
  p_updates    jsonb DEFAULT '[]'::jsonb,
  p_inserts    jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pfam, public
AS $$
DECLARE
  v_deleted integer := 0;
  v_updated integer := 0;
  v_inserted integer := 0;
BEGIN
  IF p_org_id IS NULL OR p_org_id <= 0 THEN
    RAISE EXCEPTION 'apply_item_allocation: invalid p_org_id %', p_org_id;
  END IF;

  -- 1) 기존 이동분 제거 (이번 org 범위)
  DELETE FROM pfam.acc_book
   WHERE org_id = p_org_id AND alloc_src_id IS NOT NULL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- 2) slice0 UPDATE (변경 컬럼 + 추적/백업만; 나머지 메타·증빙·FK는 원행 유지)
  --    추적컬럼은 payload(u)에서 그대로 — apply(slice0: alloc_seq=0, raw_* 백업)·
  --    rollback(alloc_seq/raw_*/alloc_gen=null) 균일 처리.
  UPDATE pfam.acc_book a SET
    incm_sec_cd     = u.incm_sec_cd,
    acc_sec_cd      = u.acc_sec_cd,
    item_sec_cd     = u.item_sec_cd,
    acc_amt         = u.acc_amt,
    alloc_src_id    = u.alloc_src_id,
    alloc_seq       = u.alloc_seq,
    alloc_gen       = u.alloc_gen,
    raw_incm_sec_cd = u.raw_incm_sec_cd,
    raw_acc_sec_cd  = u.raw_acc_sec_cd,
    raw_item_sec_cd = u.raw_item_sec_cd,
    raw_acc_amt     = u.raw_acc_amt
  FROM jsonb_array_elements(p_updates) e,
       LATERAL jsonb_populate_record(NULL::pfam.acc_book, e) u
  WHERE a.acc_book_id = u.acc_book_id
    AND a.org_id = p_org_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- 3) 이동분 INSERT (acc_book_id 제외 → DB 채번; 타입은 acc_book 레코드로 캐스팅)
  INSERT INTO pfam.acc_book (
    org_id, incm_sec_cd, acc_sec_cd, item_sec_cd, exp_sec_cd, cust_id,
    acc_date, content, acc_amt, rcp_yn, rcp_no, rcp_no2, tel, post, addr, addr_detail,
    acc_sort_num, reg_date, acc_ins_type, acc_print_ok, bigo, bigo2, return_yn,
    exp_type_cd, exp_group1_cd, exp_group2_cd, exp_group3_cd, acc_time, claim_amt,
    alloc_src_id, alloc_seq, alloc_gen
  )
  SELECT
    r.org_id, r.incm_sec_cd, r.acc_sec_cd, r.item_sec_cd, r.exp_sec_cd, r.cust_id,
    r.acc_date, r.content, r.acc_amt, r.rcp_yn, r.rcp_no, r.rcp_no2, r.tel, r.post, r.addr, r.addr_detail,
    r.acc_sort_num, r.reg_date, r.acc_ins_type, r.acc_print_ok, r.bigo, r.bigo2, r.return_yn,
    r.exp_type_cd, r.exp_group1_cd, r.exp_group2_cd, r.exp_group3_cd, r.acc_time, r.claim_amt,
    r.alloc_src_id, r.alloc_seq, r.alloc_gen
  FROM jsonb_array_elements(p_inserts) e,
       LATERAL jsonb_populate_record(NULL::pfam.acc_book, e) r
  WHERE p_org_id = r.org_id;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'org_id', p_org_id,
    'generation', NULLIF(p_generation, ''),
    'deletedMoved', v_deleted,
    'updated', v_updated,
    'inserted', v_inserted
  );
END;
$$;

-- ⚠️ 이 RPC는 "보고 시점 분할" 전환으로 더 이상 호출되지 않는다(호출하던 라우트 제거됨).
--    scripts/018_drop_item_allocation.sql 로 DROP할 것. 이미 적용된 환경은 즉시 018을 적용하거나
--    아래 REVOKE를 실행해 authenticated 직접 호출(타 기관 장부 변경 IDOR)을 차단할 것.
-- SECURITY DEFINER 함수는 service_role 전용으로만 EXECUTE를 부여한다(authenticated 금지).
REVOKE ALL ON FUNCTION pfam.apply_item_allocation(integer, char, jsonb, jsonb) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION pfam.apply_item_allocation(integer, char, jsonb, jsonb) TO service_role;
