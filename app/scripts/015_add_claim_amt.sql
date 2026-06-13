-- 015_add_claim_amt.sql
-- 보전청구액(claim_amt) 컬럼 추가.
--   보전비용 중 일부 항목(예: 거리현수막 40일 중 13일 사용)은 일할계산한 금액으로만
--   보전 신청한다. 실지출액(acc_amt)과 별개로 보전 신청액을 보관한다.
--   NULL = 미수정 → 보전 출력에서 acc_amt 를 사용(읽기 측 fallback, claim_amt ?? acc_amt).
--   지출(incm_sec_cd=2) 전용 개념. 단위 원, 음수 없음 → BIGINT.
--
-- 적용: Supabase SQL 에디터에서 수동 실행 (DDL 은 service-role REST 로 불가).
--       코드 배포 전에 적용할 것.
-- 주의: claim_amt 는 선관위 공식 PFund2 DDL 에 없는 app-only 컬럼이다.
--       export-sqlite 라우트의 stripAppOnlyAccBookColumns 가 이 컬럼을 제거하므로
--       (acc_time 과 동일 처리) PFund2 백업/호환에는 영향 없다.

ALTER TABLE pfam.acc_book     ADD COLUMN IF NOT EXISTS claim_amt BIGINT;
ALTER TABLE pfam.acc_book_bak ADD COLUMN IF NOT EXISTS claim_amt BIGINT;

COMMENT ON COLUMN pfam.acc_book.claim_amt     IS '보전청구액 (NULL이면 acc_amt 사용, 지출 전용)';
COMMENT ON COLUMN pfam.acc_book_bak.claim_amt IS '보전청구액 (NULL이면 acc_amt 사용, 지출 전용)';

-- (선택) 음수 방지
-- ALTER TABLE pfam.acc_book     ADD CONSTRAINT chk_acc_book_claim_amt_nonneg     CHECK (claim_amt IS NULL OR claim_amt >= 0);
-- ALTER TABLE pfam.acc_book_bak ADD CONSTRAINT chk_acc_book_bak_claim_amt_nonneg CHECK (claim_amt IS NULL OR claim_amt >= 0);
