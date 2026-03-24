/**
 * Supabase 데이터 초기화 (마이그레이션 재실행 전 사용)
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(resolve(__dirname, "../.env.local"), "utf-8");
const env = {};
envContent.split("\n").forEach((l) => {
  const t = l.trim();
  if (!t || t.startsWith("#")) return;
  const [k, ...r] = t.split("=");
  env[k.trim()] = r.join("=").trim();
});

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Delete in reverse FK order
const tables = [
  { name: "acc_book_bak", col: "bak_id", op: "gte", val: 0 },
  { name: "acc_book", col: "acc_book_id", op: "gte", val: 0 },
  { name: "customer_addr", col: "cust_id", op: "neq", val: -99999 },
  { name: "estate", col: "estate_id", op: "gte", val: 0 },
  { name: "alarm", col: "year", op: "neq", val: "ZZZZ" },
  { name: "customer", col: "cust_id", op: "neq", val: -99999 },
  { name: "organ", col: "org_id", op: "gte", val: 0 },
  { name: "acc_rel2", col: "acc_rel_id", op: "gte", val: 0 },
  { name: "acc_rel", col: "acc_rel_id", op: "gte", val: 0 },
  { name: "codevalue", col: "cv_id", op: "gte", val: -1 },
  { name: "codeset", col: "cs_id", op: "gte", val: -1 },
];

for (const t of tables) {
  const { error, count } = await sb.from(t.name).delete({ count: "exact" })[t.op](t.col, t.val);
  console.log(`${error ? "❌" : "✅"} ${t.name}: ${error ? error.message : `${count ?? "?"}건 삭제`}`);
}
console.log("\n완료. 이제 마이그레이션을 다시 실행하세요.");
