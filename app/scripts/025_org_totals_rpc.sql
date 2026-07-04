-- 025_org_totals_rpc.sql
-- 사용기관 수입/지출 합계 RPC (program-wide-review P-3)
--
-- acc-book GET 은 헤더 요약(총수입/총지출)을 위해 org 전 행을 다시 fetch 한 뒤 JS 로 reduce 했다
-- (요청당 2×전건 왕복). 이 RPC 로 DB 에서 SUM GROUP BY 를 수행해 2행만 반환한다.
-- 코드에는 폴백이 있어 이 RPC 미적용 상태에서도 GET 은 기존 전건 방식으로 동작한다(무해).
--
-- SECURITY INVOKER: service-role 호출은 RLS 우회(GET 은 이미 requireOrgMembership 로 orgId 검증).
-- additive/reversible. 롤백: DROP FUNCTION pfam.org_income_expense_totals(BIGINT);

CREATE OR REPLACE FUNCTION pfam.org_income_expense_totals(p_org_id BIGINT)
RETURNS TABLE(incm_sec_cd INT, total NUMERIC)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pfam, pg_catalog
AS $$
  SELECT incm_sec_cd, COALESCE(SUM(acc_amt), 0)::NUMERIC
  FROM pfam.acc_book
  WHERE org_id = p_org_id
  GROUP BY incm_sec_cd;
$$;

GRANT EXECUTE ON FUNCTION pfam.org_income_expense_totals(BIGINT) TO authenticated;
