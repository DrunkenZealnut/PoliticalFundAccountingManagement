-- 019_drop_acc_time.sql  (거래 시각 컬럼 제거)
--
-- acc_time(거래 시각 HHmm, scripts/014로 추가)은 쓰지 않는다(시분초 미사용 결정).
-- 코드에서 acc_time을 전면 제거한 feature: **acc-time-removal (v0.20.0.0)**. 이 마이그레이션은
-- 그 코드 배포 후 남는 DB 정리 단계다(코드 제거는 이미 완료).
--   - 입력 UI(income/expense/document-register)의 거래 시각 폼 제거 완료(저장 안 되던 죽은 상태였음).
--   - 모든 명시 Supabase select·`.order("acc_time")`·payload에서 acc_time 제거 완료
--     (HWPX 라우트 정렬은 acc_date → acc_sort_num → acc_book_id로 대체).
--   - 같은 날 정렬: compareAccDateTime(acc_date) + incm_sec_cd(수입 먼저) → acc_book_id tie-break(앱) +
--     acc_sort_num 정규순서 재부여(export)가 담당하므로 acc_time 불필요.
--   - export(.db) strip(stripAppOnlyAccBookColumns)의 acc_time 항목은 이 DROP 적용 전까지 유지해야
--     한다(컬럼이 살아있으면 SELECT * 가 실어 .db INSERT abort). 적용 후엔 no-op → 후속 PR에서 정리.
--
-- 적용: Supabase SQL 에디터에서 수동 실행. **acc-time-removal 코드 배포·정상 확인 후** 적용할 것.
--   (코드는 컬럼 부재에 안전 — 명시 select 0건, select("*")는 strip이 방어, 내부 TS 타입에 acc_time 없음.)

ALTER TABLE pfam.acc_book     DROP COLUMN IF EXISTS acc_time;
ALTER TABLE pfam.acc_book_bak DROP COLUMN IF EXISTS acc_time;
