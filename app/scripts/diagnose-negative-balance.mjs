#!/usr/bin/env node
/**
 * diagnose-negative-balance.mjs  (READ-ONLY 진단)
 *
 * 오준석 후보 acc_book에서 자금원(82/83/84/85)별 시간순 잔액 추이를 계산하고,
 * 잔액이 음수가 되는 시점·금액(baseline)을 측정한다. DB에 쓰지 않는다.
 *
 * 사용법: node scripts/diagnose-negative-balance.mjs [--name 오준석] [--org-id N]
 * 환경변수(.env.local 자동 로드): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    console.error("Error: .env.local not found. Run from app/ directory.");
    process.exit(1);
  }
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) { console.error("Error: Supabase URL/KEY required"); process.exit(1); }
const supabase = createClient(url, key, { db: { schema: "pfam" } });

// args
const args = process.argv.slice(2);
const getArg = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const nameQuery = getArg("--name") || "오준석";
let orgId = getArg("--org-id") ? Number(getArg("--org-id")) : undefined;

const SOURCE_NAME = { 82: "보조금", 83: "보조금외", 84: "후보자자산", 85: "후원회기부금" };
const won = (n) => n.toLocaleString("ko-KR");

// compareAccDateTime: acc_date → acc_time(nulls first) → acc_book_id
function cmp(a, b) {
  if (a.acc_date !== b.acc_date) return a.acc_date < b.acc_date ? -1 : 1;
  const ta = a.acc_time ?? "", tb = b.acc_time ?? "";
  if (ta !== tb) return ta < tb ? -1 : 1;
  return (a.acc_book_id ?? 0) - (b.acc_book_id ?? 0);
}

async function main() {
  // 1) org 확정
  if (!orgId) {
    const { data: orgs, error } = await supabase
      .from("organ")
      .select("org_id, org_name, org_sec_cd")
      .ilike("org_name", `%${nameQuery}%`);
    if (error) { console.error("organ 조회 실패:", error.message); process.exit(1); }
    if (!orgs || orgs.length === 0) { console.error(`'${nameQuery}' 매칭 org 없음`); process.exit(1); }
    console.log("=== org 후보 ===");
    orgs.forEach((o) => console.log(`  org_id=${o.org_id}  org_sec_cd=${o.org_sec_cd}  ${o.org_name}`));
    // 후보(90) 우선
    const cand = orgs.find((o) => o.org_sec_cd === 90) || orgs[0];
    orgId = cand.org_id;
    console.log(`→ 선택: org_id=${orgId} (${cand.org_name}, org_sec_cd=${cand.org_sec_cd})\n`);
  }

  // 2) acc_book 조회 (read-only)
  const { data: rows, error } = await supabase
    .from("acc_book")
    .select("acc_book_id, incm_sec_cd, acc_sec_cd, item_sec_cd, acc_date, acc_time, acc_amt, content")
    .eq("org_id", orgId)
    .limit(100000);
  if (error) { console.error("acc_book 조회 실패:", error.message); process.exit(1); }
  console.log(`총 ${rows.length}행 (org_id=${orgId})`);

  // 3) 자금원별 시간순 잔액 추이
  for (const src of [82, 83, 84, 85]) {
    const srcRows = rows.filter((r) => r.acc_sec_cd === src).sort(cmp);
    if (srcRows.length === 0) continue;
    let bal = 0, minBal = 0, minAt = null;
    let inc = 0, exp = 0, refunds = 0;
    const negEvents = [];
    for (const r of srcRows) {
      if (r.incm_sec_cd === 1) { bal += r.acc_amt; inc += r.acc_amt; }
      else if (r.incm_sec_cd === 2) {
        bal -= r.acc_amt; exp += r.acc_amt;
        if (r.acc_amt < 0) refunds += 1;
      }
      if (bal < minBal) { minBal = bal; minAt = r; }
      if (bal < 0 && r.incm_sec_cd === 2 && r.acc_amt > 0) {
        negEvents.push({ r, bal });
      }
    }
    console.log(`\n──── ${src} ${SOURCE_NAME[src] ?? "?"} (${srcRows.length}행) ────`);
    console.log(`  수입합 ${won(inc)}  지출합 ${won(exp)}  최종잔액 ${won(bal)}  환급행 ${refunds}건`);
    if (minBal < 0) {
      console.log(`  ⚠ 최저잔액 ${won(minBal)}  (시점 ${minAt.acc_date}${minAt.acc_time ? " " + minAt.acc_time : ""}, #${minAt.acc_book_id})`);
      console.log(`  ⚠ 음수 진입 지출 ${negEvents.length}건. 첫 5건:`);
      negEvents.slice(0, 5).forEach(({ r, bal }) =>
        console.log(`     ${r.acc_date} #${r.acc_book_id} 지출 ${won(r.acc_amt)} → 잔액 ${won(bal)}  [${(r.content ?? "").slice(0, 20)}]`));
    } else {
      console.log(`  ✓ 음수 없음 (최저잔액 ${won(minBal)})`);
    }
  }

  // 4) 84+85 합산 관점(재배분 가능 풀)
  const pool = rows.filter((r) => r.acc_sec_cd === 84 || r.acc_sec_cd === 85).sort(cmp);
  let pb = 0, pmin = 0;
  for (const r of pool) { pb += r.incm_sec_cd === 1 ? r.acc_amt : -r.acc_amt; if (pb < pmin) pmin = pb; }
  console.log(`\n──── 84+85 합산 풀(재배분 가능 범위) ────`);
  console.log(`  최종 합산잔액 ${won(pb)}  최저 합산잔액 ${won(pmin)}`);
  console.log(pmin < 0
    ? `  ⚠ 합산도 음수 도달 → 84↔85 재배분만으론 그 시점 음수 해소 불가(진짜 부족 존재 가능)`
    : `  ✓ 합산은 항상 ≥ 0 → 84↔85 재배분으로 85 음수 해소 가능성 높음`);
}

main().catch((e) => { console.error(e); process.exit(1); });
