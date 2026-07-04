/**
 * [거래처 상세 보강] Fund_Data_*.db 의 거래처 상세를 ground truth 로,
 * Supabase org 의 "지출(acc_book incm_sec_cd=2)에 쓰인" 거래처 중 **비어있는 상세필드만** .db 값으로 채운다.
 *
 * 안전장치:
 *  - 기존 값은 절대 덮어쓰지 않음(빈 칸만 채움).
 *  - 식별자(name/reg_num/cust_id)·분류(cust_sec_cd) 불변.
 *  - 대상은 org 본인/공유(org_id NULL) 거래처만 — 타 org 거래처(예: #42)는 스킵.
 *  - 매칭: 사업자/주민번호(reg_num) 우선, 없으면 이름(name).
 *  - --confirm 시에만 적용. 적용 전 대상 거래처 원본을 backups/ 에 JSON 백업.
 *
 * 사용법 (app/ 에서):
 *   node scripts/fill-customer-detail-from-sqlite.mjs            # dry-run (기본·미적용)
 *   node scripts/fill-customer-detail-from-sqlite.mjs --confirm  # 실제 적용
 */
import initSqlJs from "sql.js";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "..");

const posArgs = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const DB_PATH = posArgs[0] || "/Users/zealnutkim/Downloads/Fund_Data_1 (2).db";
const ORG_ID = Number(process.env.ORG_ID || 11);
const CONFIRM = process.argv.includes("--confirm");
const STAMP = process.argv.includes("--stamp") ? process.argv[process.argv.indexOf("--stamp") + 1] : null;

// 보강 대상 상세필드(소문자 = supabase 컬럼). 식별자/분류 코드는 제외.
const FIELDS = ["job", "tel", "fax", "post", "addr", "addr_detail", "bigo"];

function loadEnv() {
  const content = readFileSync(resolve(APP_DIR, ".env.local"), "utf-8");
  const vars = {};
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const [k, ...r] = t.split("=");
    vars[k.trim()] = r.join("=").trim();
  }
  return vars;
}
const env = loadEnv();
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: "pfam" }, auth: { persistSession: false },
});

const SQL = await initSqlJs();
const db = new SQL.Database(readFileSync(DB_PATH));
function queryAll(sql) {
  const s = db.prepare(sql);
  const rows = [];
  while (s.step()) rows.push(s.getAsObject());
  s.free();
  return rows;
}
const dbCusts = queryAll("SELECT * FROM CUSTOMER");

const { data: org } = await sb.from("organ").select("org_id,org_name").eq("org_id", ORG_ID).single();
const { data: exp } = await sb.from("acc_book").select("cust_id").eq("org_id", ORG_ID).eq("incm_sec_cd", 2);
const usedIds = [...new Set((exp || []).map((r) => r.cust_id))];
const { data: sbCustsRaw } = await sb.from("customer").select("*").in("cust_id", usedIds);
// 안전: org 본인/공유만 — 타 org 거래처는 제외
const targetCusts = (sbCustsRaw || []).filter((c) => c.org_id === ORG_ID || c.org_id == null);
const skippedForeign = (sbCustsRaw || []).filter((c) => !(c.org_id === ORG_ID || c.org_id == null));

const isEmpty = (v) => v == null || String(v).trim() === "";
function matchDb(name, reg) {
  if (reg) {
    const m = dbCusts.find((c) => c.REG_NUM && c.REG_NUM === reg);
    if (m) return m;
  }
  return dbCusts.find((c) => c.NAME === name) || null;
}

const plan = []; // {cust, dbCust, changes}
const unmatched = [];
for (const c of targetCusts) {
  const d = matchDb(c.name, c.reg_num);
  if (!d) { unmatched.push(c); continue; }
  const changes = {};
  for (const f of FIELDS) {
    const dbVal = d[f.toUpperCase()];
    if (isEmpty(c[f]) && !isEmpty(dbVal)) changes[f] = dbVal;
  }
  if (Object.keys(changes).length) plan.push({ cust: c, dbCust: d, changes });
}

console.log(`\n${"=".repeat(72)}`);
console.log(`[거래처 상세 보강 ${CONFIRM ? "【실제 적용】" : "(dry-run · 미적용)"}] org ${ORG_ID} | ${org?.org_name ?? "?"}`);
console.log(`.db: ${DB_PATH}`);
console.log(`규칙: 빈 칸만 채움(기존값 불변) · 식별자/분류 불변 · org본인/공유만`);
console.log("=".repeat(72));
console.log(`· 지출에 쓰인 거래처: ${usedIds.length}개 (org본인/공유 ${targetCusts.length} / 타org·스킵 ${skippedForeign.length})`);
console.log(`· .db 매칭: ${targetCusts.length - unmatched.length} / 미매칭 ${unmatched.length}`);
console.log(`· 보강 대상: ${plan.length}개 거래처 / 총 ${plan.reduce((s, p) => s + Object.keys(p.changes).length, 0)}개 필드`);

if (plan.length) {
  console.log(`\n${"-".repeat(72)}`);
  console.log(`■ 보강 내역 (거래처 → 채울 필드=값)`);
  console.log("-".repeat(72));
  for (const p of plan) {
    const head = `${p.cust.name}${p.cust.reg_num ? ` (${p.cust.reg_num})` : ""} [#${p.cust.cust_id}]`;
    const body = Object.entries(p.changes).map(([k, v]) => `${k}="${String(v).slice(0, 40)}"`).join("  ");
    console.log(`  · ${head}\n      ${body}`);
  }
}
if (skippedForeign.length) {
  console.log(`\n■ 타 org 소속이라 스킵한 거래처 ${skippedForeign.length}개:`);
  for (const c of skippedForeign) console.log(`  · ${c.name} [#${c.cust_id}] (org_id=${c.org_id})`);
}
if (unmatched.length) {
  console.log(`\n■ .db 에서 못 찾아 보강 못 한 거래처 ${unmatched.length}개:`);
  for (const c of unmatched) console.log(`  · ${c.name}${c.reg_num ? ` (${c.reg_num})` : ""} [#${c.cust_id}]`);
}

if (!CONFIRM) {
  console.log(`\n${"-".repeat(72)}`);
  console.log(`[dry-run] 적용하려면 --confirm 추가. 아무것도 변경하지 않았습니다.`);
  console.log("=".repeat(72) + "\n");
  db.close();
  process.exit(0);
}

// ===== 실제 적용 =====
if (plan.length === 0) {
  console.log(`\n보강할 필드가 없어 종료합니다.\n`);
  db.close();
  process.exit(0);
}
const stamp = STAMP || new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = resolve(APP_DIR, "../backups");
mkdirSync(backupDir, { recursive: true });
const backupPath = resolve(backupDir, `customer_detail_fill_org${ORG_ID}_${stamp}.json`);
writeFileSync(backupPath, JSON.stringify({
  when: stamp, org_id: ORG_ID, org_name: org?.org_name,
  note: "거래처 상세 보강 전 백업. 복구: 각 cust_id 의 해당 필드를 before 값으로 되돌림.",
  before: plan.map((p) => ({ cust_id: p.cust.cust_id, name: p.cust.name, before: Object.fromEntries(Object.keys(p.changes).map((k) => [k, p.cust[k] ?? null])), after: p.changes })),
}, null, 2), "utf-8");
console.log(`\n💾 백업 저장: ${backupPath}`);

let ok = 0;
for (const p of plan) {
  const { error } = await sb.from("customer").update(p.changes).eq("cust_id", p.cust.cust_id);
  if (error) console.error(`  ❌ ${p.cust.name} [#${p.cust.cust_id}]: ${error.message}`);
  else { ok++; console.log(`  ✏️  ${p.cust.name} [#${p.cust.cust_id}] ← ${Object.keys(p.changes).join(", ")}`); }
}
console.log(`\n${"=".repeat(72)}`);
console.log(`✅ 완료 — ${ok}/${plan.length}개 거래처 보강. 백업: ${backupPath}`);
console.log("=".repeat(72) + "\n");
db.close();
