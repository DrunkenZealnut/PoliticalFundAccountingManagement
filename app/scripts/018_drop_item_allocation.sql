-- 018_drop_item_allocation.sql  (선택 적용 — 스키마 정리)
--
-- 과목 배분을 "acc_book 영구화"에서 "보고 시점 분할(buildLedgerRows)"로 전환하면서,
-- scripts/016(추적 컬럼)·017(apply_item_allocation RPC)이 더 이상 쓰이지 않게 됐다.
--   - acc_book/acc_book_bak의 alloc_*/raw_* 컬럼: 어떤 코드도 DB에 기록하지 않음
--     (export의 분할은 메모리에서만 수행). 남아 있어도 무해(전부 NULL, export 시 strip).
--   - pfam.apply_item_allocation RPC: 호출하던 라우트(api/system/apply-item-allocation)가
--     제거되어 호출처 없음.
--
-- 이 스크립트는 그 미사용 스키마를 제거해 깔끔하게 정리한다. **선택 사항**이며 적용하지 않아도
-- 기능에 영향 없다. 적용 시 컬럼이 사라지므로 export(SELECT *)는 해당 키 없이 동작하나
-- planAllocationPersist가 NULL/undefined를 raw로 처리하므로 분할 결과는 동일하다.
--
-- 적용: Supabase SQL 에디터에서 수동 실행. (되돌리려면 scripts/016·017 재적용)

DROP FUNCTION IF EXISTS pfam.apply_item_allocation(integer, char, jsonb, jsonb);

ALTER TABLE pfam.acc_book     DROP COLUMN IF EXISTS alloc_src_id;
ALTER TABLE pfam.acc_book     DROP COLUMN IF EXISTS alloc_seq;
ALTER TABLE pfam.acc_book     DROP COLUMN IF EXISTS raw_incm_sec_cd;
ALTER TABLE pfam.acc_book     DROP COLUMN IF EXISTS raw_acc_sec_cd;
ALTER TABLE pfam.acc_book     DROP COLUMN IF EXISTS raw_item_sec_cd;
ALTER TABLE pfam.acc_book     DROP COLUMN IF EXISTS raw_acc_amt;
ALTER TABLE pfam.acc_book     DROP COLUMN IF EXISTS alloc_gen;

ALTER TABLE pfam.acc_book_bak DROP COLUMN IF EXISTS alloc_src_id;
ALTER TABLE pfam.acc_book_bak DROP COLUMN IF EXISTS alloc_seq;
ALTER TABLE pfam.acc_book_bak DROP COLUMN IF EXISTS raw_incm_sec_cd;
ALTER TABLE pfam.acc_book_bak DROP COLUMN IF EXISTS raw_acc_sec_cd;
ALTER TABLE pfam.acc_book_bak DROP COLUMN IF EXISTS raw_item_sec_cd;
ALTER TABLE pfam.acc_book_bak DROP COLUMN IF EXISTS raw_acc_amt;
ALTER TABLE pfam.acc_book_bak DROP COLUMN IF EXISTS alloc_gen;
