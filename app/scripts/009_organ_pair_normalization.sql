-- 009_organ_pair_normalization.sql
-- 목적: organ 테이블 정합성 점검 — 후원회로 등록된 organ 행 중 org_name이
-- 후원회 정식명이 아닌 경우(후보자 이름 등) 식별. 수동 검토 후 UPDATE.
--
-- 배경: 선관위 .db 백업 호환성. 선관위 프로그램은 후원회 ORG_NAME이
--      "...후원회"로 끝나는 정식명을 기대.
--
-- 사용법:
--   1) 진단 쿼리 실행으로 문제 행 확인
--   2) 정식 후원회 이름 결정
--   3) UPDATE 문 수동 실행 (자동 일괄 변경 금지 — 사용자 검증 필요)

-- 진단 1: 후원회인데 이름에 "후원회"가 없는 행
SELECT
  org_id,
  org_sec_cd,
  org_name,
  acct_name,
  rep_name,
  CASE
    WHEN org_sec_cd = 91  THEN '대통령선거후보자후원회'
    WHEN org_sec_cd = 92  THEN '국회의원후원회'
    WHEN org_sec_cd = 107 THEN '대통령선거경선후보자후원회'
    WHEN org_sec_cd = 108 THEN '당대표경선후보자후원회'
    WHEN org_sec_cd = 109 THEN '(예비)후보자후원회'
    WHEN org_sec_cd = 587 THEN '중앙당후원회'
    WHEN org_sec_cd = 588 THEN '중앙당창당준비위원회후원회'
  END AS expected_type
FROM pfam.organ
WHERE org_sec_cd IN (91, 92, 107, 108, 109, 587, 588)
  AND org_name NOT LIKE '%후원회%';

-- 진단 2: 같은 acct_name (후보자 이름)을 공유하는 후보자/후원회 페어 확인
SELECT
  o1.org_id AS candidate_id,
  o1.org_name AS candidate_name,
  o1.org_sec_cd AS candidate_sec_cd,
  o2.org_id AS supporter_id,
  o2.org_name AS supporter_name,
  o2.org_sec_cd AS supporter_sec_cd
FROM pfam.organ o1
LEFT JOIN pfam.organ o2
  ON o2.org_sec_cd IN (91, 92, 107, 108, 109, 587, 588)
 AND (o2.acct_name = o1.org_name OR o2.rep_name = o1.org_name)
WHERE o1.org_sec_cd IN (54, 90, 106);

-- 수정 예시 (주석 처리됨 — 사용자가 정식 이름 결정 후 직접 실행):
--
-- UPDATE pfam.organ
--    SET org_name = '동대문구라선거구구의회의원후보자오준석후원회'
--  WHERE org_id = 11  -- 사용자별 org_id로 교체
--    AND org_sec_cd = 109;
--
-- 자체적으로 후보자 organ 행이 없는 경우 추가:
-- INSERT INTO pfam.organ (org_sec_cd, org_name, reg_num, reg_date, acct_name)
-- VALUES (90, '오준석', '19850228', '20220428', '오준석');
