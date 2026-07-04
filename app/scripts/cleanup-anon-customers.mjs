/**
 * [익명 거래처 중복 정리] 공유 익명(name='익명' AND org_id IS NULL) 중복을 정본(min cust_id)으로
 * 통합한다. 중복 익명을 참조하는 acc_book·customer_addr 의 cust_id 를 정본으로 이관한 뒤 중복을 삭제.
 *
 * 안전장치:
 *  - **공유 익명(org_id IS NULL)만** 대상. org 전용 익명(org_id 있음, 예: org 10 의 183)은 절대 건드리지 않음.
 *  - 정본 = 공유 익명 중 min cust_id (api/acc-book/anonymous-customer.ts resolve 와 동일 규칙).
 *  - --confirm 시에만 적용. 적용 전 대상 customer·acc_book·customer_addr 원본을 backups/ 에 JSON 백업.
 *  - 이관(UPDATE) 후 참조 0 을 재확인한 뒤에만 삭제.
 *
 * 사용법 (app/ 에서):
 *   node scripts/cleanup-anon-customers.mjs            # dry-run (기본·미적용)
 *   node scripts/cleanup-anon-customers.mjs --confirm  # 실제 적용
 *
 * 정리 후: scripts/024_anon_customer_unique.sql (부분 유니크 인덱스)를 Supabase 에 적용해 재중복 차단.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "..");
const CONFIRM = process.argv.includes("--confirm");

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

async function refCount(custId) {
  const { count } = await supabase
    .from("acc_book")
    .select("acc_book_id", { count: "exact", head: true })
    .eq("cust_id", custId);
  return count ?? 0;
}

async function main() {
  const { data: shared, error } = await supabase
    .from("customer")
    .select("cust_id, org_id, name")
    .eq("name", "익명")
    .is("org_id", null)
    .order("cust_id", { ascending: true });
  if (error) throw error;

  if (shared.length <= 1) {
    console.log(`공유 익명이 ${shared.length}건 — 정리할 중복이 없습니다.`);
    return;
  }

  const canonical = shared[0].cust_id;
  const dupIds = shared.slice(1).map((c) => c.cust_id);
  console.log(`정본(canonical) = ${canonical}`);
  console.log(`중복(이관·삭제 대상) = ${dupIds.join(", ")}`);

  // 이관 대상 조회
  const { data: accRows } = await supabase
    .from("acc_book")
    .select("acc_book_id, org_id, cust_id, acc_date, acc_amt, content")
    .in("cust_id", dupIds);
  const { data: addrRows } = await supabase
    .from("customer_addr")
    .select("cust_id, cust_seq")
    .in("cust_id", dupIds);
  console.log(`이관 대상 acc_book ${accRows?.length ?? 0}건, customer_addr ${addrRows?.length ?? 0}건`);

  if (!CONFIRM) {
    console.log("\n[dry-run] 실제 적용하려면 --confirm 을 붙이세요. (적용 전 backups/ 에 백업)");
    return;
  }

  // 백업
  mkdirSync(resolve(APP_DIR, "backups"), { recursive: true });
  const backupPath = resolve(APP_DIR, `backups/anon-cleanup-${Date.now()}.json`);
  writeFileSync(
    backupPath,
    JSON.stringify({ shared, accRows: accRows ?? [], addrRows: addrRows ?? [] }, null, 2),
  );
  console.log(`백업 저장: ${backupPath}`);

  // 1) acc_book 참조 이관 (중복 → 정본)
  const up1 = await supabase.from("acc_book").update({ cust_id: canonical }).in("cust_id", dupIds);
  if (up1.error) throw new Error(`acc_book 이관 실패: ${up1.error.message}`);
  // 2) customer_addr 이관 (있으면)
  if (addrRows && addrRows.length > 0) {
    const up2 = await supabase.from("customer_addr").update({ cust_id: canonical }).in("cust_id", dupIds);
    if (up2.error) throw new Error(`customer_addr 이관 실패: ${up2.error.message}`);
  }

  // 3) 이관 후 참조 0 재확인 후 삭제
  for (const id of dupIds) {
    const remaining = await refCount(id);
    if (remaining > 0) {
      console.warn(`⚠️ cust_id ${id} 가 아직 ${remaining}건 참조됨 — 삭제 건너뜀(수동 확인 필요)`);
      continue;
    }
    const del = await supabase.from("customer").delete().eq("cust_id", id);
    if (del.error) console.warn(`cust_id ${id} 삭제 실패: ${del.error.message}`);
    else console.log(`cust_id ${id} 삭제 완료`);
  }

  console.log("\n완료. scripts/024_anon_customer_unique.sql 을 Supabase 에 적용해 재중복을 차단하세요.");
}

main().catch((e) => {
  console.error("정리 실패:", e.message);
  process.exit(1);
});
