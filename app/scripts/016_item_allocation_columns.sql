-- 016_item_allocation_columns.sql
-- 수입·지출부 과목 배분(income-expense-item-allocation) 추적/복원 컬럼 추가.
--
-- 후보자 acc_book을 공식 Fund_Data_1.db와 동일한 (계정×과목) 균형 구조로 영구화할 때,
-- 수입 행을 충당 과목으로 재태깅(필요 시 분할)한다. 그 결과를 가역·멱등으로 유지하기 위한
-- 앱 전용 추적 컬럼들이다(전부 nullable·additive). 미배분/미분할 행은 전부 NULL.
--
--   alloc_src_id     : 이동분(분할로 새로 INSERT된 행)의 출처 raw acc_book_id. raw/slice0 행은 NULL.
--   alloc_seq        : 분할 슬라이스 순번(0=slice0=원행, 1.. = 이동분).
--   raw_acc_sec_cd   : slice0(원행)을 in-place UPDATE 하기 전 원 계정(자금원). 미변경 행은 NULL.
--   raw_item_sec_cd  : slice0 원 과목. 미변경 행은 NULL.
--   raw_acc_amt      : slice0 원 금액. 미변경 행은 NULL.
--   alloc_gen        : 마지막 배분 실행 일자(YYYYMMDD, 감사용).
--
-- 멱등 재생성(영구화 RPC scripts/017):
--   1) DELETE WHERE alloc_src_id IS NOT NULL           (이전 이동분 제거)
--   2) raw_acc_amt IS NOT NULL 행을 raw_* 로 복원·raw_* clear  (slice0 원복)
--   → acc_book = 순수 raw. 이후 buildLedgerRows 재산출·재기록.
-- 롤백 = 위 1·2단계만 수행("배분 해제") → v0.14.8.0 raw 상태.
--
-- 적용: Supabase SQL 에디터에서 수동 실행 (DDL 은 service-role REST 로 불가). 코드 배포 전에 적용.
-- 주의: 이 컬럼들은 선관위 공식 PFund2 DDL 에 없는 app-only 컬럼이다.
--       export-sqlite 라우트의 stripAppOnlyAccBookColumns 가 제거하므로(acc_time/claim_amt 동일 처리)
--       PFund2 백업/호환·윈도우 프로그램 로드에는 영향 없다.
--       acc_book_bak 에도 동일 컬럼을 추가한다 — 행 삭제 백업(action='backup')이 alloc_* 키를 가진
--       행을 그대로 INSERT 하므로 컬럼이 없으면 백업이 실패한다.

ALTER TABLE pfam.acc_book     ADD COLUMN IF NOT EXISTS alloc_src_id    INTEGER;
ALTER TABLE pfam.acc_book     ADD COLUMN IF NOT EXISTS alloc_seq       SMALLINT;
ALTER TABLE pfam.acc_book     ADD COLUMN IF NOT EXISTS raw_acc_sec_cd  INTEGER;
ALTER TABLE pfam.acc_book     ADD COLUMN IF NOT EXISTS raw_item_sec_cd INTEGER;
ALTER TABLE pfam.acc_book     ADD COLUMN IF NOT EXISTS raw_acc_amt     NUMERIC(15,0);
ALTER TABLE pfam.acc_book     ADD COLUMN IF NOT EXISTS alloc_gen       CHAR(8);

ALTER TABLE pfam.acc_book_bak ADD COLUMN IF NOT EXISTS alloc_src_id    INTEGER;
ALTER TABLE pfam.acc_book_bak ADD COLUMN IF NOT EXISTS alloc_seq       SMALLINT;
ALTER TABLE pfam.acc_book_bak ADD COLUMN IF NOT EXISTS raw_acc_sec_cd  INTEGER;
ALTER TABLE pfam.acc_book_bak ADD COLUMN IF NOT EXISTS raw_item_sec_cd INTEGER;
ALTER TABLE pfam.acc_book_bak ADD COLUMN IF NOT EXISTS raw_acc_amt     NUMERIC(15,0);
ALTER TABLE pfam.acc_book_bak ADD COLUMN IF NOT EXISTS alloc_gen       CHAR(8);

COMMENT ON COLUMN pfam.acc_book.alloc_src_id    IS '과목배분 이동분의 출처 raw acc_book_id (NULL=raw/slice0)';
COMMENT ON COLUMN pfam.acc_book.alloc_seq       IS '과목배분 분할 순번 (0=slice0, 1..=이동분)';
COMMENT ON COLUMN pfam.acc_book.raw_acc_sec_cd  IS '과목배분 전 원 계정 (NULL=미변경)';
COMMENT ON COLUMN pfam.acc_book.raw_item_sec_cd IS '과목배분 전 원 과목 (NULL=미변경)';
COMMENT ON COLUMN pfam.acc_book.raw_acc_amt     IS '과목배분 전 원 금액 (NULL=미변경)';
COMMENT ON COLUMN pfam.acc_book.alloc_gen       IS '마지막 과목배분 실행일 YYYYMMDD';

-- (선택) 영구화 재생성 쿼리(이동분 DELETE / slice0 복원) 가속용 부분 인덱스.
CREATE INDEX IF NOT EXISTS idx_acc_book_alloc_moved   ON pfam.acc_book (org_id) WHERE alloc_src_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_acc_book_alloc_slice0  ON pfam.acc_book (org_id) WHERE raw_acc_amt   IS NOT NULL;
