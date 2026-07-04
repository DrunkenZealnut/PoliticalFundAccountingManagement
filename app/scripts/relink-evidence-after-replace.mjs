/**
 * 지출 교체(replace-org-expense-from-sqlite) 후, CASCADE 로 삭제된 첨부서류(evidence_file)를
 * 백업 JSON 으로부터 새 acc_book 행에 재연결.
 *
 * 매핑: 옛 acc_book_id → 옛(acc_date, content) → 같은 (acc_date, content) 의 새 acc_book_id.
 *  - 분할 입력이 단일 행으로 병합된 경우도 (날짜,내역)이 같으므로 병합된 새 행에 연결.
 *  - storage_path/파일명/타입/크기는 그대로 유지(Storage 실제 객체는 삭제되지 않았음).
 *  - file_id(PK)는 새로 발급. (acc_book_id, storage_path) 중복은 건너뛰어 재실행 안전.
 *
 * 사용법 (app/ 에서):
 *   node scripts/relink-evidence-after-replace.mjs [--backup <경로.json>] [--org 11]          # dry-run
 *   node scripts/relink-evidence-after-replace.mjs --org 11 --confirm                          # 실제 적용
 *   (--backup 생략 시 backups/ 의 최신 acc_book_org<ORG>_expense-replace_*.json 사용)
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "..");
const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const ORG_ID = Number(arg("--org", "11"));
const CONFIRM = args.includes("--confirm");

const env = Object.fromEntries(
  readFileSync(resolve(APP_DIR, ".env.local"), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const [k, ...r] = l.split("="); return [k.trim(), r.join("=").trim()]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: "pfam" }, auth: { persistSession: false },
});

function latestBackup() {
  const dir = resolve(APP_DIR, "../backups");
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(`acc_book_org${ORG_ID}_expense-replace_`) && f.endsWith(".json"))
    .sort();
  if (!files.length) throw new Error("백업 파일을 찾을 수 없습니다. --backup 으로 지정하세요.");
  return resolve(dir, files[files.length - 1]);
}

async function main() {
  const backupPath = arg("--backup") ? resolve(arg("--backup")) : latestBackup();
  const bk = JSON.parse(readFileSync(backupPath, "utf8"));
  console.log(`\n${"=".repeat(60)}`);
  console.log(`첨부서류 재연결 ${CONFIRM ? "【실제 적용】" : "(dry-run · 미적용)"} — org_id=${ORG_ID}`);
  console.log(`백업: ${backupPath}`);
  console.log("=".repeat(60));

  const evidences = bk.evidence_file_expense || [];
  if (!evidences.length) { console.log("백업에 재연결할 evidence_file 없음."); return; }
  const oldById = new Map((bk.acc_book_expense || []).map((r) => [r.acc_book_id, r]));

  // 현재 새 지출 행
  const { data: cur } = await sb.from("acc_book")
    .select("acc_book_id,acc_date,content,acc_amt,cust_id")
    .eq("org_id", ORG_ID).eq("incm_sec_cd", 2);
  const norm = (s) => (s || "").trim();
  const byKey = new Map(); // "date|content" → rows[]
  for (const r of cur) {
    const k = `${r.acc_date}|${norm(r.content)}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(r);
  }

  // 중복 방지용 기존 evidence (org)
  const { data: existing } = await sb.from("evidence_file").select("acc_book_id,storage_path").eq("org_id", ORG_ID);
  const existKey = new Set((existing || []).map((e) => `${e.acc_book_id}|${e.storage_path}`));

  const plan = [], warnings = [];
  for (const ev of evidences) {
    const old = oldById.get(ev.acc_book_id);
    if (!old) { warnings.push(`옛 acc_book_id=${ev.acc_book_id} 정보 없음 → skip (${ev.file_name})`); continue; }
    const k = `${old.acc_date}|${norm(old.content)}`;
    let cands = byKey.get(k) || [];
    if (cands.length > 1) {
      const byCust = cands.filter((c) => c.cust_id === old.cust_id);
      if (byCust.length) cands = byCust;
    }
    if (!cands.length) { warnings.push(`매칭 새 행 없음 [${k}] → skip (${ev.file_name})`); continue; }
    const target = cands[0];
    const dupK = `${target.acc_book_id}|${ev.storage_path}`;
    if (existKey.has(dupK)) { warnings.push(`이미 연결됨 → skip (acc_book_id=${target.acc_book_id} ${ev.file_name})`); continue; }
    plan.push({
      acc_book_id: target.acc_book_id, org_id: ORG_ID,
      file_name: ev.file_name, file_type: ev.file_type,
      storage_path: ev.storage_path, file_size: ev.file_size,
      created_at: ev.created_at,
      _disp: `[${old.acc_date}|${norm(old.content)}] → acc_book_id=${target.acc_book_id} | ${ev.file_name}`,
    });
    existKey.add(dupK);
  }

  console.log(`\n재연결 대상 ${plan.length}건 / 백업 ${evidences.length}건`);
  plan.forEach((p) => console.log(`  ✓ ${p._disp}`));
  warnings.forEach((w) => console.log(`  ⚠️ ${w}`));

  if (!CONFIRM) { console.log(`\n[dry-run] 실제 적용하려면 --confirm 추가.`); return; }
  if (!plan.length) { console.log("\n적용할 항목 없음."); return; }

  let ok = 0;
  for (const p of plan) {
    const { _disp, ...row } = p;
    const { error } = await sb.from("evidence_file").insert(row);
    if (error) console.error(`  ❌ 실패 ${_disp}: ${error.message}`);
    else ok++;
  }
  const { count } = await sb.from("evidence_file").select("*", { count: "exact", head: true })
    .eq("org_id", ORG_ID)
    .in("acc_book_id", cur.map((r) => r.acc_book_id));
  console.log(`\n${"=".repeat(60)}`);
  console.log(`✅ 재연결 ${ok}/${plan.length}건 삽입 — 현재 org${ORG_ID} 지출 첨부 총 ${count}건`);
  console.log("=".repeat(60));
}
main().catch((e) => { console.error("❌ 실패:", e); process.exit(1); });
