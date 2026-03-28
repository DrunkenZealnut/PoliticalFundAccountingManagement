-- 005_acc_rel_dedup.sql
-- ACC_REL 테이블 중복 데이터 제거 및 UNIQUE 제약조건 추가
-- 자체분 DB에서 import 시 계정관계 매핑이 중복 삽입되는 문제 방지

-- 1. 중복 행 제거 (같은 매핑 조합 중 acc_rel_id가 가장 작은 것만 남김)
DELETE FROM acc_rel
WHERE acc_rel_id NOT IN (
  SELECT MIN(acc_rel_id)
  FROM acc_rel
  GROUP BY org_sec_cd, incm_sec_cd, acc_sec_cd, item_sec_cd, exp_sec_cd
);

-- 2. UNIQUE 제약조건 추가 (멱등성 확보: 이미 존재하면 무시)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'acc_rel_unique_mapping'
  ) THEN
    ALTER TABLE acc_rel
    ADD CONSTRAINT acc_rel_unique_mapping
    UNIQUE (org_sec_cd, incm_sec_cd, acc_sec_cd, item_sec_cd, exp_sec_cd);
  END IF;
END $$;
