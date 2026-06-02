-- 013_finalize_settlement.sql
-- 결산확정 원자 처리 RPC (settlement transaction follow-up)
--
-- 기존 settlement/page.tsx handleFinalize는 organ(회계기간) update와
-- opinion(결산요약) upsert를 별개 쿼리로 실행 → 하나만 성공하면 결산이 반쪽 저장됨.
-- 본 함수는 두 쓰기를 단일 트랜잭션(함수 본문)으로 처리하여 둘 다 성공 or 둘 다 롤백되게 한다.
--
-- 권한: SECURITY INVOKER(기본). 브라우저 클라이언트(authenticated)가 호출하므로
-- organ/opinion의 기존 RLS 정책(org_id IN (SELECT org_id FROM user_organ WHERE user_id = auth.uid()))이
-- 그대로 적용된다 → 사용자는 자신이 소속된 org만 확정 가능(별도 멤버십 체크 불필요).

CREATE OR REPLACE FUNCTION pfam.finalize_settlement(
  p_org_id      BIGINT,
  p_from        TEXT,
  p_to          TEXT,
  p_estate_amt  NUMERIC,
  p_in_amt      NUMERIC,
  p_cm_amt      NUMERIC,
  p_balance_amt NUMERIC
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pfam, pg_catalog
AS $$
DECLARE
  c_organ INT;
BEGIN
  -- 1) 회계기간 저장
  UPDATE pfam.organ
     SET acc_from = p_from, acc_to = p_to
   WHERE org_id = p_org_id;
  GET DIAGNOSTICS c_organ = ROW_COUNT;

  -- RLS로 0건이면 미존재 또는 권한 없음 → 전체 롤백되도록 예외
  IF c_organ = 0 THEN
    RAISE EXCEPTION '기관을 찾을 수 없거나 권한이 없습니다 (org_id=%)', p_org_id;
  END IF;

  -- 2) 결산 요약 저장(org_id PK 기준 upsert, 결산 관련 6개 필드만 갱신)
  INSERT INTO pfam.opinion (org_id, acc_from, acc_to, estate_amt, in_amt, cm_amt, balance_amt)
  VALUES (p_org_id, p_from, p_to, p_estate_amt, p_in_amt, p_cm_amt, p_balance_amt)
  ON CONFLICT (org_id) DO UPDATE
     SET acc_from    = excluded.acc_from,
         acc_to      = excluded.acc_to,
         estate_amt  = excluded.estate_amt,
         in_amt      = excluded.in_amt,
         cm_amt      = excluded.cm_amt,
         balance_amt = excluded.balance_amt;
END;
$$;

GRANT EXECUTE ON FUNCTION pfam.finalize_settlement(BIGINT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC)
  TO authenticated, anon;
