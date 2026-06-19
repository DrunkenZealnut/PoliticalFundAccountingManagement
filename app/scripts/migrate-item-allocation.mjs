#!/usr/bin/env node
/**
 * migrate-item-allocation.mjs — 기존 후보자 org의 과목 배분 일회성 마이그레이션 러너.
 *
 * 로직 중복을 피하기 위해 SSOT인 API 라우트(/api/system/apply-item-allocation)를 HTTP로 호출한다
 * (.mjs는 .ts 직접 import 불가 → 전사 대신 라우트 재사용). 라우트가 buildLedgerRows·멱등·무음수
 * 게이트·RPC(단일 트랜잭션)를 모두 수행한다.
 *
 * 선행 필수:
 *   1) scripts/016_item_allocation_columns.sql, scripts/017_apply_item_allocation.sql 을 Supabase에 적용
 *   2) dev 서버 기동: node node_modules/next/dist/bin/next dev --port 3001
 *
 * 사용법(app/ 에서):
 *   node scripts/migrate-item-allocation.mjs --all                 # 후보자 전체 dry-run(기본)
 *   node scripts/migrate-item-allocation.mjs --org-id 11           # 특정 org dry-run
 *   node scripts/migrate-item-allocation.mjs --org-id 11 --commit  # 영구화(write)
 *   node scripts/migrate-item-allocation.mjs --org-id 11 --rollback --commit  # 배분 해제
 *
 * 안전: dry-run이 기본. --commit 없으면 write하지 않는다. 라우트가 무음수 위반 시 422로 막는다.
 *       acc_book_bak 백업은 선택(라우트는 멱등·가역 — 언제든 --rollback 가능).
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) { console.error(".env.local not found (run from app/)"); process.exit(1); }
  for (const l of readFileSync(p, "utf-8").split("\n")) {
    const t = l.trim(); if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i < 0) continue;
    const k = t.slice(0, i).trim(); if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
  }
}

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const getArg = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };

const CANDIDATE_SEC_CDS = new Set([54, 90, 106]); // organ-pair.ts SSOT와 동일
const baseUrl = getArg("--base-url", "http://localhost:3001");
const commit = has("--commit");
const rollback = has("--rollback");

async function discoverCandidateOrgs() {
  loadEnv();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { db: { schema: "pfam" } },
  );
  const { data, error } = await supabase.from("organ").select("org_id, org_sec_cd, org_name");
  if (error) { console.error("organ fetch failed:", error.message); process.exit(1); }
  return (data ?? []).filter((o) => CANDIDATE_SEC_CDS.has(Number(o.org_sec_cd)));
}

async function run(orgId, name) {
  const res = await fetch(`${baseUrl}/api/system/apply-item-allocation`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orgId, dryRun: !commit, rollback }),
  });
  const json = await res.json().catch(() => ({}));
  const tag = `org ${orgId}${name ? ` (${name})` : ""}`;
  if (!res.ok || json.ok === false) {
    console.error(`  ✗ ${tag}: ${res.status} ${json.error ?? ""}`);
    if (json.negativeAccounts) console.error("    음수:", JSON.stringify(json.negativeAccounts));
    return false;
  }
  const s = json.plan ?? {};
  const sum = json.summary ?? {};
  console.log(
    `  ${commit ? "✓ 적용" : "· dry-run"} ${tag}: raw ${s.rawRows} → 분할 ${s.sourcesSplit} (update ${s.updated}/insert ${s.inserted}/delMoved ${s.deletedMoved}) · 잔액 ${sum.cashBalance} · 음수 ${sum.hasNegative ? "있음⚠" : "없음"}`,
  );
  return true;
}

async function main() {
  let orgs;
  if (has("--all")) {
    orgs = (await discoverCandidateOrgs()).map((o) => ({ orgId: Number(o.org_id), name: o.org_name }));
    if (!orgs.length) { console.log("후보자 org 없음."); return; }
  } else {
    const id = Number(getArg("--org-id", "0"));
    if (!id) { console.error("--org-id <N> 또는 --all 필요"); process.exit(1); }
    orgs = [{ orgId: id, name: null }];
  }

  console.log(
    `과목배분 마이그레이션 — ${commit ? "COMMIT(write)" : "DRY-RUN"}${rollback ? " ROLLBACK" : ""} · ${baseUrl} · 대상 ${orgs.length}개`,
  );
  if (commit && !rollback) console.log("  (영구화 — acc_book이 변경됩니다. 무음수 위반 시 라우트가 422로 차단)");

  let ok = 0;
  for (const o of orgs) if (await run(o.orgId, o.name)) ok++;
  console.log(`완료: ${ok}/${orgs.length}${commit ? "" : "  (실제 적용은 --commit)"}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
