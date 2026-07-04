#!/usr/bin/env node
/**
 * scan-income-gross-up.mjs  (READ-ONLY 재발방지 점검)
 *
 * 음수수입(incm_sec_cd=1 ∧ acc_amt<0)을 감지한다. 선관위 정합상 Pass0
 * (adjustNegativeIncome)가 음수수입을 양수 지출로 전환하므로, "내부 계정이체를
 * 수입 +/−로 기재"한 행이 있으면 자금원의 gross 수입이 실제 외부유입(net)보다
 * 부풀려져 제출보고서에 실수입 초과로 찍힌다(2026 오준석후보 #370/#371/#455/#456
 * = ±108,583 사례). 이 스캔이 그 흔적을 조기 발견한다.
 *
 * 사용법:
 *   node scripts/scan-income-gross-up.mjs            # 후보자(org_sec_cd=90) 전체
 *   node scripts/scan-income-gross-up.mjs <org_id>   # 특정 org
 * exit 0 = clean, 1 = 음수수입 발견(점검 필요), 2 = 오류
 */
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const APP = "/Users/zealnutkim/DEV/PoliticalFundAccountingManagement/app";
for (const line of readFileSync(APP + "/.env.local", "utf-8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 0) continue;
  const k = t.slice(0, i).trim();
  if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
}
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { db: { schema: "pfam" } },
);
const SRC = { 82: "보조금", 83: "보조금외", 84: "후보자자산", 85: "후원회기부금" };
const won = (n) => Number(n).toLocaleString("ko-KR");

const argOrg = process.argv[2] ? Number(process.argv[2]) : null;
const { data: orgs, error: oe } = argOrg
  ? await sb.from("organ").select("org_id,org_name,org_sec_cd").eq("org_id", argOrg)
  : await sb.from("organ").select("org_id,org_name,org_sec_cd").eq("org_sec_cd", 90);
if (oe) { console.error("organ:", oe.message); process.exit(2); }

let flagged = 0;
for (const o of orgs ?? []) {
  const rows = [];
  for (let from = 0; ; from += 5000) {
    const { data, error } = await sb
      .from("acc_book")
      .select("acc_book_id,incm_sec_cd,acc_sec_cd,item_sec_cd,acc_amt,content")
      .eq("org_id", o.org_id).order("acc_book_id", { ascending: true }).range(from, from + 4999);
    if (error) { console.error("acc_book:", error.message); process.exit(2); }
    rows.push(...data);
    if (data.length < 5000) break;
  }
  const negInc = rows.filter((r) => Number(r.incm_sec_cd) === 1 && Number(r.acc_amt) < 0);
  if (negInc.length === 0) {
    console.log(`✓ org${o.org_id} ${o.org_name}: 음수수입 없음`);
    continue;
  }
  flagged++;
  console.log(`\n⚠ org${o.org_id} ${o.org_name}: 음수수입 ${negInc.length}건 (Pass0가 지출로 전환 → 자금원 gross 수입 부풀림)`);
  for (const r of negInc)
    console.log(`   #${r.acc_book_id} 계정${r.acc_sec_cd}${SRC[r.acc_sec_cd] ? `(${SRC[r.acc_sec_cd]})` : ""} ${won(r.acc_amt)} [${(r.content || "").slice(0, 30)}]`);
  for (const s of [82, 83, 84, 85]) {
    const inc = rows.filter((r) => Number(r.acc_sec_cd) === s && Number(r.incm_sec_cd) === 1);
    if (!inc.length) continue;
    const gross = inc.filter((r) => Number(r.acc_amt) > 0).reduce((a, r) => a + Number(r.acc_amt), 0);
    const net = inc.reduce((a, r) => a + Number(r.acc_amt), 0);
    if (gross !== net)
      console.log(`   → ${s} ${SRC[s]}: 실수입(net) ${won(net)} vs 보고표시(gross) ${won(gross)}  차이 ${won(gross - net)}`);
  }
}
console.log(`\n${flagged ? `⚠ ${flagged}개 org에서 음수수입 발견 — 내부이체를 수입 +/−로 기재했는지 점검` : "✓ 전체 clean (음수수입 없음)"}`);
process.exit(flagged ? 1 : 0);
