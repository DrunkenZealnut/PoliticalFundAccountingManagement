-- 021_organ_election_cycle.sql
-- 선거주기(연도) 명시 컬럼. 연도/주기 데이터 격리(year-data-separation) 기반.
-- 적용: Supabase SQL editor에서 수동 실행 (DDL은 service-role REST로 불가).
-- 최신 마이그레이션 020(감사의견서) → 021.
--
-- additive·reversible: 신규 컬럼 nullable, default 없음 → 기존 코드 무영향.

ALTER TABLE pfam.organ ADD COLUMN IF NOT EXISTS election_cycle TEXT;

-- 백필: 회계기간 시작 연도(acc_from 앞 4자리) 기준.
--   현 데이터 확인: org 9 → '2022', org 10·11 → '2026'.
UPDATE pfam.organ
   SET election_cycle = substr(acc_from, 1, 4)
 WHERE election_cycle IS NULL
   AND acc_from IS NOT NULL
   AND acc_from ~ '^[0-9]{4}';

-- 적용 후 검증용 SELECT (참고):
--   SELECT org_id, org_name, acc_from, acc_to, election_cycle FROM pfam.organ ORDER BY org_id;

-- ROLLBACK:
--   ALTER TABLE pfam.organ DROP COLUMN IF EXISTS election_cycle;
