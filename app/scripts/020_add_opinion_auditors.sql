-- 020_add_opinion_auditors.sql  (감사의견서 복수 감사자 지원)
--
-- 감사의견서(opinion)의 감사자는 기존에 position/addr/name 단일 세트뿐이라 1명만
-- 기재할 수 있었다. 그러나 정당·후원회는 정관·당규에 따라 감사를 2명 이상 두는 경우가
-- 많고, 공식 감사의견서 양식도 "양식에 제한이 없"어 감사자 전원을 서명란에 기재할 수 있다.
--   → 기존 position/addr/name = 1번 감사자. 2~5번 감사자용 컬럼을 추가한다
--     (심사의결서 운영위원 comm_name01~05 패턴과 동일하게 최대 5명).
--
-- 적용: Supabase SQL 에디터에서 수동 실행 (DDL 은 service-role REST 로 불가). 코드 배포 전 적용.
-- 주의: position02~05 / addr02~05 / name02~05 는 선관위 공식 PFund2 OPINION DDL 에 없는
--       app-only 확장 컬럼이다. export-sqlite 라우트의 stripAppOnlyOpinionColumns 가 이 컬럼을
--       제거하므로(claim_amt·acc_time 과 동일 처리) PFund2 백업/호환 .db 에는 1번 감사자
--       (POSITION/ADDR/NAME)만 나간다 — 공식 포맷 무결성 유지.

ALTER TABLE pfam.opinion ADD COLUMN IF NOT EXISTS position02 VARCHAR(50);
ALTER TABLE pfam.opinion ADD COLUMN IF NOT EXISTS addr02     VARCHAR(50);
ALTER TABLE pfam.opinion ADD COLUMN IF NOT EXISTS name02     VARCHAR(50);
ALTER TABLE pfam.opinion ADD COLUMN IF NOT EXISTS position03 VARCHAR(50);
ALTER TABLE pfam.opinion ADD COLUMN IF NOT EXISTS addr03     VARCHAR(50);
ALTER TABLE pfam.opinion ADD COLUMN IF NOT EXISTS name03     VARCHAR(50);
ALTER TABLE pfam.opinion ADD COLUMN IF NOT EXISTS position04 VARCHAR(50);
ALTER TABLE pfam.opinion ADD COLUMN IF NOT EXISTS addr04     VARCHAR(50);
ALTER TABLE pfam.opinion ADD COLUMN IF NOT EXISTS name04     VARCHAR(50);
ALTER TABLE pfam.opinion ADD COLUMN IF NOT EXISTS position05 VARCHAR(50);
ALTER TABLE pfam.opinion ADD COLUMN IF NOT EXISTS addr05     VARCHAR(50);
ALTER TABLE pfam.opinion ADD COLUMN IF NOT EXISTS name05     VARCHAR(50);

COMMENT ON COLUMN pfam.opinion.position IS '감사자1 직위 (export 시 공식 OPINION.POSITION)';
COMMENT ON COLUMN pfam.opinion.addr     IS '감사자1 주소 (export 시 공식 OPINION.ADDR)';
COMMENT ON COLUMN pfam.opinion.name     IS '감사자1 성명 (export 시 공식 OPINION.NAME)';
COMMENT ON COLUMN pfam.opinion.position02 IS '감사자2 직위 (app-only, PFund2 export 시 제거)';
COMMENT ON COLUMN pfam.opinion.name05     IS '감사자5 성명 (app-only, PFund2 export 시 제거)';
