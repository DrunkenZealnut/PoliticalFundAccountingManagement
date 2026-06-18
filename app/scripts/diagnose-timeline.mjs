#!/usr/bin/env node
/**
 * diagnose-timeline.mjs (READ-ONLY)
 * 84·85 거래를 시간순으로 덤프하고 자금원별·합산 running 잔액을 보여준다.
 * 입금(수입) 행을 강조해 누락·일자오류 점검. DB 쓰기 없음.
 * 사용법: node scripts/diagnose-timeline.mjs [--org-id 11] [--until 20260601]
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) { console.error(".env.local not found (run from app/)"); process.exit(1); }
  for (const line of readFileSync(p, "utf-8").split("\n")) {
    const t = line.trim(); if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i === -1) continue;
    const k = t.slice(0, i).trim(); if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
  }
}
loadEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(url, key, { db: { schema: "pfam" } });

const args = process.argv.slice(2);
const getArg = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const orgId = Number(getArg("--org-id", "11"));
const until = getArg("--until", "20260601");

const won = (n) => String(n).padStart(11);
const cmp = (a, b) => a.acc_date !== b.acc_date ? (a.acc_date < b.acc_date ? -1 : 1)
  : (a.acc_time ?? "") !== (b.acc_time ?? "") ? ((a.acc_time ?? "") < (b.acc_time ?? "") ? -1 : 1)
  : (a.acc_book_id ?? 0) - (b.acc_book_id ?? 0);

async function main() {
  // 서버측 acc_date<=until 필터 + 페이징 — limit 후 클라 필터 시 until 이전 거래 누락 방지
  const pageSize = 5000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("acc_book")
      .select("acc_book_id, incm_sec_cd, acc_sec_cd, item_sec_cd, acc_date, acc_time, acc_amt, content, cust_id, customer:cust_id(name)")
      .eq("org_id", orgId)
      .in("acc_sec_cd", [84, 85])
      .lte("acc_date", until)
      .order("acc_book_id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) { console.error(error.message); process.exit(1); }
    rows.push(...data);
    if (data.length < pageSize) break;
  }

  const tl = [...rows].sort(cmp);
  console.log(`org_id=${orgId}  84·85 거래 (≤ ${until})  ${tl.length}행`);
  console.log("날짜      시각  자금원 구분  " + "금액".padStart(11) + "  bal84".padStart(13) + "  bal85".padStart(13) + "  합산".padStart(13) + "  내역/거래처");
  let b84 = 0, b85 = 0;
  for (const r of tl) {
    const isInc = r.incm_sec_cd === 1;
    const delta = isInc ? r.acc_amt : -r.acc_amt;
    if (r.acc_sec_cd === 84) b84 += delta; else b85 += delta;
    const src = r.acc_sec_cd === 84 ? "자산84" : "후원85";
    const kind = isInc ? "입금" : "지출";
    const name = (Array.isArray(r.customer) ? r.customer[0]?.name : r.customer?.name) ?? "";
    const flagInc = isInc ? "★" : " ";
    const flagNeg = b85 < 0 || b84 < 0 || (b84 + b85) < 0 ? " ⚠" : "";
    console.log(
      `${r.acc_date} ${(r.acc_time ?? "----")}  ${src} ${kind}${flagInc} ` +
      `${won(r.acc_amt)}  ${won(b84)}  ${won(b85)}  ${won(b84 + b85)}${flagNeg}  ` +
      `${(r.content ?? "").slice(0, 22)} [${name}]`
    );
  }
  console.log(`\n※ ★=입금(수입), ⚠=그 행 직후 어느 잔액이든 음수`);
  // 입금만 따로
  console.log(`\n── 84·85 입금(수입) 목록 (≤ ${until}) ──`);
  tl.filter((r) => r.incm_sec_cd === 1).forEach((r) =>
    console.log(`  ${r.acc_date} ${r.acc_sec_cd === 84 ? "자산84" : "후원85"} ${won(r.acc_amt)}  ${(r.content ?? "").slice(0, 30)}`));
}
main().catch((e) => { console.error(e); process.exit(1); });
