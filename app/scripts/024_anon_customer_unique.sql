-- 024_anon_customer_unique.sql
-- 공유 익명 거래처(name='익명' AND org_id IS NULL) 재중복 차단 (program-wide-review B3)
--
-- 배경: api/acc-book/anonymous-customer.ts 의 find-or-create 에 DB 유니크 제약이 없어
--   익명 0행 상태에서 동시 요청 시 공유 익명이 재중복 생성될 수 있었다(65/117/244 사례).
--   부분 유니크 인덱스로 공유 익명을 1행으로 강제한다.
--
-- ⚠️ 적용 순서: 반드시 cleanup-anon-customers.mjs --confirm 으로 **중복을 먼저 제거한 뒤** 적용.
--   중복이 남아 있으면 인덱스 생성이 실패한다.
-- ※ org 전용 익명(org_id 있음)은 대상 아님 — org 별로 각 1행 허용(WHERE org_id IS NULL 로 한정).
--
-- additive/reversible. 롤백: DROP INDEX pfam.customer_shared_anon_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS customer_shared_anon_uniq
  ON pfam.customer (name)
  WHERE org_id IS NULL AND name = '익명';
