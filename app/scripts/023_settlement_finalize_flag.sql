-- 023_settlement_finalize_flag.sql
-- 결산확정 상태 플래그 + finalize RPC 갱신 (program-wide-review BX7/BX8)
--
-- BX8: 기존 finalize_settlement(013) 는 organ.acc_from/acc_to(회계기간·선거주기 판정 SSOT)를
--      결산기간으로 덮어써 isAccDateInOrgPeriod 입력가드·현 주기 판정을 왜곡했다.
--      → organ 갱신을 제거하고 결산기간은 opinion 에만 저장한다(이미 저장 중이던 값).
--      권한/존재 확인은 organ SELECT(RLS 적용 — 소속 org 만 보임)로 대체한다.
-- BX7: 확정 여부를 DB(opinion.settled_at)로 영속화해, acc-book 입력가드가 "확정된 결산기간
--      내 거래 추가·수정"을 SETTLED_PERIOD 경고로 표면화할 수 있게 한다.
--      (차단이 아니라 경고 — 실무 오류 수정 여지를 남기는 은폐 금지 방침. 재결산하면 갱신.)
--
-- additive/reversible: settled_at 컬럼 추가 + RPC 본문 교체.
--   롤백: ALTER TABLE pfam.opinion DROP COLUMN settled_at; 후 013 재적용.
-- ※ opinion 에 컬럼을 추가하면 export-sqlite 의 APP_ONLY_OPINION_COLUMNS 에도 등록해야
--   공식 .db export 가 "table OPINION has no column named settled_at"로 실패하지 않는다(코드 반영됨).

ALTER TABLE pfam.opinion ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION pfam.finalize_settlement(
  p_org_id      BIGINT,
  p_from        TEXT,
  p_to          TEXT,
  p_estate_amt  NUMERIC,
  p_in_amt      NUMERIC,
  p_cm_amt      NUMERIC,
  p_balance_amt NUMERIC
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pfam, pg_catalog
AS $$
BEGIN
  -- 권한/존재 확인: organ 을 RLS 하에 SELECT(소속 org 만 보임).
  -- (013 은 organ UPDATE 로 이 확인을 겸했으나, 회계기간 SSOT 오염[BX8] 때문에 UPDATE 를 제거)
  PERFORM 1 FROM pfam.organ WHERE org_id = p_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '기관을 찾을 수 없거나 권한이 없습니다 (org_id=%)', p_org_id;
  END IF;

  -- 결산 요약 + 확정 시각 저장(org_id PK upsert). 회계기간(organ)은 건드리지 않는다.
  INSERT INTO pfam.opinion (org_id, acc_from, acc_to, estate_amt, in_amt, cm_amt, balance_amt, settled_at)
  VALUES (p_org_id, p_from, p_to, p_estate_amt, p_in_amt, p_cm_amt, p_balance_amt, now())
  ON CONFLICT (org_id) DO UPDATE
     SET acc_from    = excluded.acc_from,
         acc_to      = excluded.acc_to,
         estate_amt  = excluded.estate_amt,
         in_amt      = excluded.in_amt,
         cm_amt      = excluded.cm_amt,
         balance_amt = excluded.balance_amt,
         settled_at  = excluded.settled_at;
END;
$$;

-- 결산확정은 로그인 사용자 전용 동작이므로 authenticated에만 부여(최소 권한 원칙).
GRANT EXECUTE ON FUNCTION pfam.finalize_settlement(BIGINT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC)
  TO authenticated;
