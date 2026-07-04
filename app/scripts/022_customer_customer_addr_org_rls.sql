-- 022_customer_customer_addr_org_rls.sql
-- customer / customer_addr 조직별 RLS 격리 (브라우저 직접쿼리 방어선 보강)
--
-- 배경: 006_move_to_pfam_schema.sql 에서 customer/customer_addr 의 RLS 가
--   `auth.uid() IS NOT NULL` 뿐이라, 로그인한 모든 사용자가 **전 기관**의 거래처·
--   주소이력을 조회/수정/삭제할 수 있었다(org 격리 전무). 011_customer_org_id.sql 이
--   customer.org_id 를 추가·백필(익명만 NULL 유지)했으므로, 이제 그 org_id 로 격리한다.
--   acc_book/estate/opinion 등 원장 테이블은 006 에서 이미 동일 패턴으로 격리돼 있다.
--
-- ── 범위와 한계 (중요) ────────────────────────────────────────────
--   * 이 RLS 는 **브라우저(anon/authenticated) 직접 쿼리에만** 적용된다. API 라우트는
--     SUPABASE_SERVICE_ROLE_KEY 로 RLS 를 우회하므로, 이 마이그레이션만으로는
--     API 계층의 IDOR(클라가 보낸 orgId 를 소속검증 없이 신뢰)는 닫히지 않는다.
--     API 격리는 organ 라우트(api/organ/route.ts)의 인증+user_organ 소속검증 패턴을
--     공통 헬퍼로 추출해 별도 적용해야 한다.
--   * 보장 범위는 **사용자 간 격리**다(A 사용자가 B 사용자의 org 데이터 접근 차단).
--     같은 사용자가 여러 org 에 속할 때 '현재 선택된 org' 만 보이게 하는 것은 여전히
--     앱의 `.eq('org_id', orgId)` 필터 책임이다(RLS 는 user 단위라 선택 org 를 모른다).
--   * 익명 고객(org_id IS NULL)은 전 org 공용으로 접근을 유지한다(정책의 `org_id IS NULL`).
--   * WITH CHECK 를 관대하게(NULL 허용) 두어, org_id 를 세팅하지 않는 기존 브라우저
--     insert(예: components/customer-search-dialog.tsx)가 깨지지 않게 한다. 다만 그렇게
--     들어간 행은 org_id=NULL 이라 '공용'으로 새므로, 격리를 온전히 하려면 그 insert 에
--     `org_id: orgId` 를 세팅하는 후속 수정이 필요하다(남의 org_id 지정은 CHECK 가 거부).
--
-- ── 적용 전 필수 검증 (수동 실행) ─────────────────────────────────
--   org_id IS NULL 이면서 익명이 아닌 '미귀속' 거래처가 있으면, 이 정책에서 그 행은
--   '공용(NULL)'으로 전 org 에 노출된다. 적용 전 반드시 0행인지 확인할 것:
--     SELECT cust_id, name, cust_sec_cd FROM pfam.customer
--       WHERE org_id IS NULL AND COALESCE(name, '') <> '익명';
--   0행이 아니면 011 §3 방식으로 org_id 를 먼저 귀속시킨 뒤 이 마이그레이션을 적용한다.
--
-- 적용: Supabase SQL editor 에서 수동 실행(DDL 은 service-role REST 로 실행 불가).

BEGIN;

-- ── customer: org 격리 + 익명(NULL) 공용 ──────────────────────────
DROP POLICY IF EXISTS "customer_access" ON pfam.customer;
DROP POLICY IF EXISTS "customer_org_isolation" ON pfam.customer;
CREATE POLICY "customer_org_isolation" ON pfam.customer
  FOR ALL
  USING (
    org_id IS NULL
    OR org_id IN (SELECT org_id FROM pfam.user_organ WHERE user_id = auth.uid())
  )
  WITH CHECK (
    org_id IS NULL
    OR org_id IN (SELECT org_id FROM pfam.user_organ WHERE user_id = auth.uid())
  );

-- ── customer_addr: org_id 컬럼이 없으므로 cust_id → customer 조인으로 격리 ──
DROP POLICY IF EXISTS "customer_addr_access" ON pfam.customer_addr;
DROP POLICY IF EXISTS "customer_addr_org_isolation" ON pfam.customer_addr;
CREATE POLICY "customer_addr_org_isolation" ON pfam.customer_addr
  FOR ALL
  USING (
    cust_id IN (
      SELECT cust_id FROM pfam.customer
      WHERE org_id IS NULL
         OR org_id IN (SELECT org_id FROM pfam.user_organ WHERE user_id = auth.uid())
    )
  )
  WITH CHECK (
    cust_id IN (
      SELECT cust_id FROM pfam.customer
      WHERE org_id IS NULL
         OR org_id IN (SELECT org_id FROM pfam.user_organ WHERE user_id = auth.uid())
    )
  );

COMMIT;

-- ── 적용 후 검증 (로그인한 브라우저 세션으로, 임의 org 로그인 상태에서) ──────
--   SELECT COUNT(*) FROM pfam.customer;
--     → 내 소속 org 거래처 + 익명(NULL)만 집계돼야 한다(전체 116 이 아니라 그 부분집합).
--   다른 org 만 쓰는 계정으로 로그인해 교차 확인하면 사용자 간 격리가 확인된다.
--
-- ── 롤백 (필요 시 수동 실행) ──────────────────────────────────────
--   BEGIN;
--   DROP POLICY IF EXISTS "customer_org_isolation" ON pfam.customer;
--   CREATE POLICY "customer_access" ON pfam.customer
--     FOR ALL USING (auth.uid() IS NOT NULL);
--   DROP POLICY IF EXISTS "customer_addr_org_isolation" ON pfam.customer_addr;
--   CREATE POLICY "customer_addr_access" ON pfam.customer_addr
--     FOR ALL USING (auth.uid() IS NOT NULL);
--   COMMIT;
