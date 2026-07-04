#!/usr/bin/env node
/**
 * diagnose-income-cap.mjs  (READ-ONLY)
 * Supabase(pfam) 기준, 후보자 자금원(82~85)별 수입/지출/잔액 + 통장 총잔액 부호 진단.
 * acc_time(DROP됨)은 select하지 않는다. DB에 쓰지 않는다.
 * 사용법: node scripts/diagnose-income-cap.mjs [name=오준석]
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) { console.error("Supabase URL/KEY 필요"); process.exit(1); }
const sb = createClient(url, key, { db: { schema: "pfam" } });

const SRC = { 82: "보조금", 83: "보조금외", 84: "후보자자산", 85: "후원회기부금" };
const won = (n) => Number(n).toLocaleString("ko-KR");
const nameQ = process.argv[2] || "오준석";

const { data: orgs, error: oe } = await sb
  .from("organ").select("org_id,org_name,org_sec_cd,acc_from,acc_to").ilike("org_name", `%${nameQ}%`);
if (oe) { console.error("organ:", oe.message); process.exit(1); }
console.log("=== org 후보 ===");
orgs.forEach((o) => console.log(`  org_id=${o.org_id} sec=${o.org_sec_cd} acc=${o.acc_from}~${o.acc_to} ${o.org_name}`));

const cands = orgs.filter((o) => o.org_sec_cd === 90);
if (!cands.length) { console.error("후보자(90) org 없음"); process.exit(1); }

for (const o of cands) {
  const rows = [];
  for (let from = 0; ; from += 5000) {
    const { data, error } = await sb
      .from("acc_book")
      .select("acc_book_id,incm_sec_cd,acc_sec_cd,item_sec_cd,acc_date,acc_amt,content")
      .eq("org_id", o.org_id).order("acc_book_id", { ascending: true }).range(from, from + 4999);
    if (error) { console.error("acc_book:", error.message); process.exit(1); }
    rows.push(...data);
    if (data.length < 5000) break;
  }
  const dmin = rows.reduce((m, r) => (r.acc_date < m ? r.acc_date : m), "99999999");
  const dmax = rows.reduce((m, r) => (r.acc_date > m ? r.acc_date : m), "00000000");
  console.log(`\n#### org_id=${o.org_id} ${o.org_name} — ${rows.length}행, 거래일 ${dmin}~${dmax} ####`);
  let ti = 0, te = 0;
  for (const src of [82, 83, 84, 85]) {
    const sr = rows.filter((r) => r.acc_sec_cd === src);
    if (!sr.length) continue;
    const inc = sr.filter((r) => r.incm_sec_cd === 1).reduce((s, r) => s + Number(r.acc_amt), 0);
    const exp = sr.filter((r) => r.incm_sec_cd === 2).reduce((s, r) => s + Number(r.acc_amt), 0);
    const refunds = sr.filter((r) => r.incm_sec_cd === 2 && Number(r.acc_amt) < 0).length;
    const bal = inc - exp;
    console.log(`  ${src} ${SRC[src]}: 수입 ${won(inc).padStart(12)}  지출 ${won(exp).padStart(12)}  잔액 ${won(bal).padStart(12)}  ${bal < 0 ? "⚠초과" : "✓"}  ${refunds ? `환급${refunds}건` : ""}`);
  }
  ti = rows.filter((r) => r.incm_sec_cd === 1).reduce((s, r) => s + Number(r.acc_amt), 0);
  te = rows.filter((r) => r.incm_sec_cd === 2).reduce((s, r) => s + Number(r.acc_amt), 0);
  const bank = ti - te;
  console.log(`  ── 통장 총잔액 = 수입 ${won(ti)} − 지출 ${won(te)} = ${won(bank)}  ${bank < 0 ? "⚠음수(진짜부족=가설A)" : "✓양수(균형→초과는 가설B)"}`);
}
