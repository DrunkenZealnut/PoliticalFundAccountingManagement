-- 011_customer_org_id.sql
-- 수입지출처(customer) 조직별 격리 — org_id 컬럼 추가 + 백필
-- 설계: docs/02-design/customer-org-isolation.design.md
--
-- 배경: PFund2는 거래처를 org별 .db 파일(Fund_Data_1=후보자, Fund_Data_2=후원회)로
--       격리하나, 본 시스템은 단일 Supabase로 합치며 격리를 잃음. org_id로 재현.
--
-- ⚠️ 운영 적용 전 반드시 백업. 백필 매핑은 적용 시점 데이터로 검증할 것.

BEGIN;

-- 1) org_id 컬럼 추가 (nullable — 익명/공용은 NULL 허용)
ALTER TABLE pfam.customer ADD COLUMN IF NOT EXISTS org_id INTEGER;

-- 2) 거래(acc_book)에 쓰인 거래처 → 해당 거래의 org로 귀속
--    (운영 데이터상 거래처는 조직 간 공유 0 → MIN은 단일 org)
UPDATE pfam.customer c
SET org_id = sub.org_id
FROM (
  SELECT cust_id, MIN(org_id) AS org_id
  FROM pfam.acc_book
  WHERE cust_id IS NOT NULL
  GROUP BY cust_id
) sub
WHERE c.cust_id = sub.cust_id
  AND c.org_id IS NULL;

-- 3) 미사용 거래처 귀속 (사용자 확정 매핑, 2026-05-31)
--    3-1) 개인(cust_sec_cd=63, 익명 제외) → 2026 오준석 후원회 (org_id=10)
UPDATE pfam.customer
SET org_id = 10
WHERE org_id IS NULL
  AND cust_sec_cd = 63
  AND COALESCE(name, '') <> '익명';

--    3-2) 사업자(cust_sec_cd=62) → 2022 오준석후보 (org_id=9)
UPDATE pfam.customer
SET org_id = 9
WHERE org_id IS NULL
  AND cust_sec_cd = 62;

--    3-3) 익명(name='익명') → org_id NULL 유지 (공용). 의도적으로 미귀속.
--         향후 익명 입력은 PFund2 표준 -999로 통일 (코드에서 처리).

-- 4) 인덱스
CREATE INDEX IF NOT EXISTS idx_customer_org_id ON pfam.customer(org_id);

-- 참고: FK(customer.org_id → organ.org_id)는 익명 NULL 허용을 위해 보류.
--       필요 시 후속 마이그레이션에서 NOT VALID FK + VALIDATE.

COMMIT;

-- ── 적용 후 검증 쿼리 (수동 실행) ────────────────────────────────
-- SELECT org_id, COUNT(*) FROM pfam.customer GROUP BY org_id ORDER BY org_id NULLS LAST;
-- 기대(2026-05-31 스냅샷): org_id=9 → 25, org_id=10 → 75, org_id=11 → 14, NULL → 2(익명)
-- 합계 116.
--
-- 미귀속(NULL, 익명 외) 잔존 확인:
-- SELECT cust_id, name, cust_sec_cd FROM pfam.customer
--   WHERE org_id IS NULL AND COALESCE(name,'') <> '익명';
-- 기대: 0행
