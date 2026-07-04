/**
 * [익명 거래처 중복 진단 — READ ONLY]
 * name='익명' customer 행을 전부 조회하고, 각각을 참조하는 acc_book 건수를 집계한다.
 * 공유 익명(org_id IS NULL)의 중복 여부와 정본(정책상 min cust_id)을 표시한다.
 *
 * 데이터를 변경하지 않는다. 실제 정리는 cleanup-anon-customers.mjs(--confirm).
 *
 * 사용법 (app/ 에서):
 *   node scripts/diagnose-anon-customers.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "..");

function loadEnv() {
  const content = readFileSync(resolve(APP_DIR, ".env.local"), "utf-8");
  const vars = {};
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const [k, ...r] = t.split("=");
    vars[k] = r.join("=");
  }
  return vars;
}

const env = loadEnv();
const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { db: { schema: "pfam" } },
);

async function main() {
  const { data: anon, error } = await supabase
    .from("customer")
    .select("cust_id, org_id, name, reg_num, cust_sec_cd")
    .eq("name", "익명")
    .order("cust_id", { ascending: true });
  if (error) throw error;

  console.log(`\n=== name='익명' customer 행: ${anon.length}건 ===`);
  const refCounts = {};
  for (const c of anon) {
    const { count } = await supabase
      .from("acc_book")
      .select("acc_book_id", { count: "exact", head: true })
      .eq("cust_id", c.cust_id);
    refCounts[c.cust_id] = count ?? 0;
    console.log(
      `  cust_id=${c.cust_id}  org_id=${c.org_id ?? "NULL(공유)"}  reg_num=${c.reg_num}  → acc_book 참조 ${refCounts[c.cust_id]}건`,
    );
  }

  const shared = anon.filter((c) => c.org_id == null);
  const scoped = anon.filter((c) => c.org_id != null);
  console.log(`\n=== 공유 익명(org_id IS NULL): ${shared.length}건 ===`);
  if (shared.length > 0) {
    const canonical = shared[0]; // min cust_id = resolveAnonymousCustId 정본
    const dups = shared.slice(1);
    console.log(`  정본(canonical, resolve 대상) = cust_id ${canonical.cust_id}`);
    console.log(
      `  중복(이관·삭제 후보) = ${dups.map((d) => `${d.cust_id}(참조 ${refCounts[d.cust_id]}건)`).join(", ") || "없음"}`,
    );
    const migrateRefs = dups.reduce((s, d) => s + refCounts[d.cust_id], 0);
    console.log(`  → 정본으로 이관할 acc_book 참조 합계: ${migrateRefs}건`);
  }
  console.log(`\n=== org 전용 익명(org_id 있음, 유지 대상): ${scoped.length}건 ===`);
  for (const c of scoped) {
    console.log(`  cust_id=${c.cust_id} org_id=${c.org_id} 참조 ${refCounts[c.cust_id]}건 (org 전용 — 정리 제외)`);
  }
  console.log("");
}

main().catch((e) => {
  console.error("진단 실패:", e.message);
  process.exit(1);
});
