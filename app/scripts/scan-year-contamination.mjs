/**
 * 연도/선거주기 혼입 스캔 — 거래일이 org 유효기간(pre_acc_from~acc_to) 밖인 거래 검출.
 *
 * 배경: 연도 분리가 org 단위라 거래일 검증이 없어 오연도 거래가 혼입될 수 있다
 * (2022 org에 2026 거래 등). 본 스크립트로 상시/정기 점검한다.
 *
 * 사용: cd app && node scripts/scan-year-contamination.mjs
 * 환경변수: .env.local 의 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * 종료코드: 혼입 0건=0, 1건 이상=1 (CI 게이트로 사용 가능)
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// 판정 로직 SSOT는 src/lib/accounting/acc-period.ts(isAccDateInOrgPeriod).
// node .mjs는 .ts를 직접 import 못 하므로 동일 규칙을 인라인한다(로직 변경 시 양쪽 동기화).
const ymd = (s) => (s ?? "").toString().trim();
const isYmd = (s) => /^\d{8}$/.test(s);
function inOrgPeriod(accDate, o) {
  const lo = ymd(o.pre_acc_from) || ymd(o.acc_from);
  const hi = ymd(o.acc_to);
  if (!isYmd(lo) || !isYmd(hi)) return true; // 기간 불완전 → skip
  const d = ymd(accDate);
  if (!isYmd(d)) return true;
  return d >= lo && d <= hi;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const line of readFileSync(resolve(__dirname, "../.env.local"), "utf-8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: "pfam" },
  auth: { persistSession: false },
});

const { data: cv } = await sb.from("codevalue").select("cv_id,cv_name");
const cvn = Object.fromEntries((cv ?? []).map((r) => [r.cv_id, r.cv_name]));
// election_cycle 컬럼은 마이그 021 적용 후 존재 → 의존하지 않고 acc_from 연도로 파생(적용 전후 모두 동작).
const { data: orgs } = await sb
  .from("organ")
  .select("org_id,org_name,pre_acc_from,acc_from,acc_to");

let total = 0;
for (const o of orgs ?? []) {
  const { data: rows } = await sb
    .from("acc_book")
    .select("acc_book_id,acc_date,acc_amt,content,acc_sec_cd,item_sec_cd,incm_sec_cd")
    .eq("org_id", o.org_id);
  const bad = (rows ?? []).filter((r) => !inOrgPeriod(String(r.acc_date), o));
  if (bad.length) {
    total += bad.length;
    console.log(
      `\n■ org ${o.org_id} (${o.org_name}) cycle=${ymd(o.acc_from).slice(0, 4) || "-"} 기간 ${o.pre_acc_from ?? o.acc_from}~${o.acc_to} — 기간밖 ${bad.length}건`,
    );
    for (const r of bad)
      console.log(
        `   id=${r.acc_book_id} ${r.acc_date} ${r.incm_sec_cd === 1 ? "수입" : "지출"} ${Number(r.acc_amt).toLocaleString()}원 ` +
          `[${cvn[r.acc_sec_cd] ?? r.acc_sec_cd}/${cvn[r.item_sec_cd] ?? r.item_sec_cd}] "${r.content}"`,
      );
  }
}
console.log(total === 0 ? "\n✅ 연도 혼입 0건" : `\n⚠️ 연도 혼입 ${total}건 — 위 거래를 올바른 주기 org로 이동/삭제하세요.`);
process.exit(total === 0 ? 0 : 1);
