-- 014_add_acc_time.sql : 거래 시각(분 단위) 컬럼 추가
-- ⚠️ SUPERSEDED by 019_drop_acc_time.sql (acc-time-removal v0.20.0.0) — 시분초 미사용. 신규 적용 금지.
-- acc-time-input feature. Supabase SQL 에디터에서 수동 적용 (DDL은 서비스롤 REST로 실행 불가).
-- additive · nullable · 기본 NULL → 기존 행/코드 무영향, 롤백 = DROP COLUMN.
-- acc_date(CHAR(8) YYYYMMDD)는 그대로 두어 선관위 PFund2/SQLite export(ACC_DATE CHAR(8)) 호환 유지.

ALTER TABLE pfam.acc_book     ADD COLUMN IF NOT EXISTS acc_time CHAR(4);
ALTER TABLE pfam.acc_book_bak ADD COLUMN IF NOT EXISTS acc_time CHAR(4);

COMMENT ON COLUMN pfam.acc_book.acc_time     IS '거래시각 HHmm (분 단위, NULL 허용)';
COMMENT ON COLUMN pfam.acc_book_bak.acc_time IS '거래시각 HHmm (수정 백업용, NULL 허용)';

-- HHmm 형식·범위(00:00~23:59) CHECK 제약 (idempotent). 앱 검증(lib/date-utils)에 더해 DB 레벨 방어.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'acc_book_acc_time_hhmm_chk' AND conrelid = 'pfam.acc_book'::regclass
  ) THEN
    ALTER TABLE pfam.acc_book
      ADD CONSTRAINT acc_book_acc_time_hhmm_chk
      CHECK (acc_time IS NULL OR acc_time ~ '^(?:[01][0-9]|2[0-3])[0-5][0-9]$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'acc_book_bak_acc_time_hhmm_chk' AND conrelid = 'pfam.acc_book_bak'::regclass
  ) THEN
    ALTER TABLE pfam.acc_book_bak
      ADD CONSTRAINT acc_book_bak_acc_time_hhmm_chk
      CHECK (acc_time IS NULL OR acc_time ~ '^(?:[01][0-9]|2[0-3])[0-5][0-9]$');
  END IF;
END $$;

-- 롤백:
-- ALTER TABLE pfam.acc_book     DROP CONSTRAINT IF EXISTS acc_book_acc_time_hhmm_chk;
-- ALTER TABLE pfam.acc_book_bak DROP CONSTRAINT IF EXISTS acc_book_bak_acc_time_hhmm_chk;
-- ALTER TABLE pfam.acc_book     DROP COLUMN IF EXISTS acc_time;
-- ALTER TABLE pfam.acc_book_bak DROP COLUMN IF EXISTS acc_time;
