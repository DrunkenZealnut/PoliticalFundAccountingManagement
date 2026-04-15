-- ============================================================
-- 008: acc_ins_type 컬럼 확장 (CHAR(2) → VARCHAR(5))
-- PAY_METHODS 코드값이 3자리 (118, 119, 583 등)
-- ============================================================

ALTER TABLE pfam.acc_book ALTER COLUMN acc_ins_type TYPE VARCHAR(5);
ALTER TABLE pfam.acc_book_bak ALTER COLUMN acc_ins_type TYPE VARCHAR(5);
