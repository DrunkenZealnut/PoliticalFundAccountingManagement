/**
 * 거래일 ↔ 사용기관 회계기간 검증 (연도/선거주기 분리 가드).
 *
 * 배경: 분리가 org 단위 암묵적(이름·날짜)이라 거래일 검증이 없어 오연도 거래가
 * 혼입됐다(2022 org에 2026 거래 1건). 본 모듈은 거래일이 org 유효기간 밖인지
 * 판정하는 순수 함수다. acc-book API(insert/update/batch_insert)가 입력 시점에 호출한다.
 *
 * 날짜는 프로젝트 SSOT대로 YYYYMMDD 문자열(사전식 비교).
 */

export interface OrgPeriod {
  acc_from?: string | null;
  acc_to?: string | null;
  /** 이전 회계기간 시작 — 이월거래 허용 위해 하한으로 사용 */
  pre_acc_from?: string | null;
}

export interface PeriodCheck {
  ok: boolean;
  reason?: "before" | "after" | "no_period" | "bad_date";
  lo?: string;
  hi?: string;
}

const ymd = (s: string | null | undefined): string => (s ?? "").toString().trim();
const isYmd = (s: string): boolean => /^\d{8}$/.test(s);

/**
 * org 유효 거래기간 [lo, hi].
 * lo = pre_acc_from(있으면, 이월 허용) ?? acc_from, hi = acc_to.
 * 둘 중 하나라도 없으면 null(검증 불가 → skip).
 */
export function orgValidRange(p: OrgPeriod): { lo: string; hi: string } | null {
  const lo = ymd(p.pre_acc_from) || ymd(p.acc_from);
  const hi = ymd(p.acc_to);
  if (!isYmd(lo) || !isYmd(hi)) return null;
  return { lo, hi };
}

/**
 * 거래일이 org 유효기간 내인지.
 * - 기간 정보 없음/거래일 형식 이상 → ok:true(검증 skip, 다른 검증에 위임).
 * - lo..hi(양끝 포함) 밖 → ok:false (reason before/after).
 */
export function isAccDateInOrgPeriod(accDate: string, p: OrgPeriod): PeriodCheck {
  const range = orgValidRange(p);
  if (!range) return { ok: true, reason: "no_period" };
  const d = ymd(accDate);
  if (!isYmd(d)) return { ok: true, reason: "bad_date" };
  if (d < range.lo) return { ok: false, reason: "before", lo: range.lo, hi: range.hi };
  if (d > range.hi) return { ok: false, reason: "after", lo: range.lo, hi: range.hi };
  return { ok: true, lo: range.lo, hi: range.hi };
}

export interface OutOfPeriodSummary {
  /** org 유효기간 밖(before/after) 거래 건수 */
  count: number;
  /** 검증에 쓴 [lo, hi] — 기간 정보 없으면 null(검증 skip) */
  range: { lo: string; hi: string } | null;
  /** 표면화용 샘플(최대 sampleLimit개) */
  samples: { acc_date: string; reason: "before" | "after" }[];
}

/**
 * 산출물(결산·export·보고서) 생성 시점에 org 회계기간 밖 거래 건수를 센다(FR-07, 경고 표면화용).
 * 생성 자체는 막지 않는다 — 오연도 혼입 등을 사용자에게 알리는 용도(은폐 금지 방침).
 * 기간 정보가 없으면 count 0(검증 skip). 형식 이상 거래일은 세지 않는다(isAccDateInOrgPeriod와 동일).
 */
export function countOutOfPeriodRows(
  rows: { acc_date?: string | null }[],
  p: OrgPeriod,
  sampleLimit = 5,
): OutOfPeriodSummary {
  const range = orgValidRange(p);
  if (!range) return { count: 0, range: null, samples: [] };
  let count = 0;
  const samples: { acc_date: string; reason: "before" | "after" }[] = [];
  for (const r of rows) {
    const chk = isAccDateInOrgPeriod(String(r.acc_date ?? ""), p);
    if (!chk.ok && (chk.reason === "before" || chk.reason === "after")) {
      count++;
      if (samples.length < sampleLimit) {
        samples.push({ acc_date: String(r.acc_date ?? ""), reason: chk.reason });
      }
    }
  }
  return { count, range, samples };
}

/** acc_from 연도로 선거주기(연도) 파생 — election_cycle 컬럼 fallback. */
export function electionCycleOf(p: OrgPeriod): string | null {
  const f = ymd(p.acc_from);
  return /^\d{4}/.test(f) ? f.slice(0, 4) : null;
}

/**
 * 사용자 사용기관들의 주기 목록에서 "현 주기"(최신) — 선거 종료 후 감사기간에도 현 주기는 편집 가능.
 * null/빈 문자열은 무시. 모두 없으면 null.
 */
export function currentCycleOf(cycles: (string | null | undefined)[]): string | null {
  const valid = cycles.map((c) => (c ?? "").toString().trim()).filter((c) => c.length > 0);
  if (valid.length === 0) return null;
  return valid.reduce((max, c) => (c > max ? c : max));
}

/**
 * org가 옛 주기인지 = orgCycle < currentCycle. 둘 중 하나라도 없으면 false(보수적 — 잠그지 않음).
 */
export function isOldCycle(
  orgCycle: string | null | undefined,
  currentCycle: string | null | undefined,
): boolean {
  const o = (orgCycle ?? "").toString().trim();
  const c = (currentCycle ?? "").toString().trim();
  if (!o || !c) return false;
  return o < c;
}
