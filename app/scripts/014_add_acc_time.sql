-- 014_add_acc_time.sql : 거래 시각(분 단위) 컬럼 추가
-- acc-time-input feature. Supabase SQL 에디터에서 수동 적용 (DDL은 서비스롤 REST로 실행 불가).
-- additive · nullable · 기본 NULL → 기존 행/코드 무영향, 롤백 = DROP COLUMN.
-- acc_date(CHAR(8) YYYYMMDD)는 그대로 두어 선관위 PFund2/SQLite export(ACC_DATE CHAR(8)) 호환 유지.

ALTER TABLE pfam.acc_book     ADD COLUMN IF NOT EXISTS acc_time CHAR(4);
ALTER TABLE pfam.acc_book_bak ADD COLUMN IF NOT EXISTS acc_time CHAR(4);

COMMENT ON COLUMN pfam.acc_book.acc_time     IS '거래시각 HHmm (분 단위, NULL 허용)';
COMMENT ON COLUMN pfam.acc_book_bak.acc_time IS '거래시각 HHmm (수정 백업용, NULL 허용)';

-- 롤백:
-- ALTER TABLE pfam.acc_book     DROP COLUMN IF EXISTS acc_time;
-- ALTER TABLE pfam.acc_book_bak DROP COLUMN IF EXISTS acc_time;
