-- 019_drop_acc_time.sql  (거래 시각 컬럼 제거)
--
-- acc_time(거래 시각 HHmm, scripts/014로 추가)은 더 이상 저장·출력하지 않는다.
--   - 입력 UI 제거(income/expense/document-register) → 신규 거래는 시각 미저장.
--   - 모든 Supabase select·`.order("acc_time")`·insert/update/backup 페이로드에서 acc_time 제거.
--   - export(.db)에는 원래도 들어가지 않음(app-only strip).
--   - 같은 날 정렬: compareAccDateTime(acc_date) + incm_sec_cd(수입 먼저) tie-break(앱) +
--     acc_sort_num 정규순서 재부여(export)가 담당하므로 acc_time 불필요.
--
-- 적용: Supabase SQL 에디터에서 수동 실행. **이 컬럼을 제거한 코드 배포 후** 적용할 것.
--   (select("*")·내부 TS 타입·form 로드는 컬럼 부재에 안전 — fmtTimeInput(undefined)=""·null 허용.)

ALTER TABLE pfam.acc_book     DROP COLUMN IF EXISTS acc_time;
ALTER TABLE pfam.acc_book_bak DROP COLUMN IF EXISTS acc_time;
