/**
 * [읽기 전용 · 미리보기] Fund_Data_*.db 의 지출 거래처를 ground truth 로,
 * Supabase org 의 지출(acc_book incm_sec_cd=2) 행의 cust_id 를 어떻게 바로잡을지 분석해 출력.
 *
 * - 쓰기 없음(SELECT 만). 실제 적용은 하지 않는다.
 * - 매칭: .db 지출 ↔ supabase 지출을 (acc_date, acc_amt, content) 자연키로 1:1 대응.
 * - 목표 거래처: .db 행의 CUST_ID → CUSTOMER(NAME,REG_NUM) → supabase org/공유 거래처에서
 *   (사업자번호 우선, 없으면 이름) 매칭. supabase 에 없으면 "신규 생성 필요"로 표기.
 *
 * 사용법 (app/ 에서):  node scripts/preview-expense-customer-update.mjs
 */
import initSqlJs from "sql.js";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "..");

const DB_PATH = process.argv[2] || "/Users/zealnutkim/Downloads/Fund_Data_1 (2).db";
const ORG_ID = Number(process.argv[3] || 11);

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

const dbCustById = new Map(queryAll("SELECT * FROM CUSTOMER").map((c) => [c.CUST_ID, c]));
const dbExp = queryAll(
  "SELECT * FROM ACC_BOOK WHERE INCM_SEC_CD=2 ORDER BY ACC_DATE, ACC_SORT_NUM, ACC_BOOK_ID",
);

const { data: org } = await sb.from("organ").select("org_id,org_name").eq("org_id", ORG_ID).single();
const { data: sbExp } = await sb
  .from("acc_book")
  .select("acc_book_id,acc_date,content,acc_amt,cust_id,item_sec_cd,acc_sec_cd,tel,post,addr,addr_detail")
  .eq("org_id", ORG_ID)
  .eq("incm_sec_cd", 2);
const { data: sbCustOrg } = await sb.from("customer").select("*").eq("org_id", ORG_ID);
const { data: sbCustNull } = await sb.from("customer").select("*").is("org_id", null);
const sbPool = [...(sbCustOrg || []), ...(sbCustNull || [])];
const sbCustById = new Map(sbPool.map((c) => [c.cust_id, c]));

function matchSbCust(name, reg) {
  if (reg) {
    const m = sbPool.find((p) => p.reg_num && p.reg_num === reg);
    if (m) return m;
  }
  return sbPool.find((p) => p.name === name) || null;
}
const norm = (s) => (s == null ? "" : String(s)).replace(/\s+/g, " ").trim();
const keyOf = (d, a, c) => `${d}|${Number(a)}|${norm(c)}`;
const custLabel = (c) =>
  c ? `${c.name ?? c.NAME}${(c.reg_num ?? c.REG_NUM) ? ` (${c.reg_num ?? c.REG_NUM})` : ""} [#${c.cust_id ?? c.CUST_ID}]` : "∅";

function groupByKey(rows, get) {
  const m = new Map();
  for (const r of rows) {
    const k = keyOf(get.date(r), get.amt(r), get.content(r));
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}
const dbByKey = groupByKey(dbExp, { date: (r) => r.ACC_DATE, amt: (r) => r.ACC_AMT, content: (r) => r.CONTENT });
const sbByKey = groupByKey(sbExp || [], { date: (r) => r.acc_date, amt: (r) => r.acc_amt, content: (r) => r.content });

const updates = [];
const newCustNeeded = new Map();
const keyMissInSb = [];
const keyMissInDb = [];
const sizeMismatch = [];
let matchedPairs = 0;

for (const [k, dbRows] of dbByKey) {
  const sbRows = sbByKey.get(k) || [];
  if (sbRows.length === 0) {
    keyMissInSb.push({ k, n: dbRows.length, sample: dbRows[0] });
    continue;
  }
  if (sbRows.length !== dbRows.length) sizeMismatch.push({ k, db: dbRows.length, sb: sbRows.length });
  const n = Math.min(dbRows.length, sbRows.length);
  for (let i = 0; i < n; i++) {
    matchedPairs++;
    const dbRow = dbRows[i];
    const sbRow = sbRows[i];
    const dbCust = dbCustById.get(dbRow.CUST_ID) || null;
    const target = dbCust ? matchSbCust(dbCust.NAME, dbCust.REG_NUM) : null;
    const fromCust = sbCustById.get(sbRow.cust_id) || null;
    const toCustId = target ? target.cust_id : null;
    if (sbRow.cust_id !== toCustId) {
      updates.push({ sbRow, dbRow, dbCust, fromCust, target });
      if (!target && dbCust) newCustNeeded.set(dbRow.CUST_ID, dbCust);
    }
  }
}
for (const [k, sbRows] of sbByKey) {
  if (!dbByKey.has(k)) keyMissInDb.push({ k, n: sbRows.length, sample: sbRows[0] });
}

const won = (n) => Number(n).toLocaleString() + "원";
console.log(`\n${"=".repeat(72)}`);
console.log(`[미리보기] 지출 거래처(cust_id) 업데이트 분석 — 쓰기 없음`);
console.log(`대상 org: ${ORG_ID} | ${org?.org_name ?? "(이름 조회 실패)"}`);
console.log(`.db: ${DB_PATH}`);
console.log("=".repeat(72));
console.log(`\n· .db 지출:      ${dbExp.length}건`);
console.log(`· Supabase 지출: ${(sbExp || []).length}건`);
console.log(`· 자연키(날짜+금액+내용) 매칭 성공: ${matchedPairs}쌍`);
console.log(`· 업데이트 필요(현재 거래처 ≠ .db 거래처): ${updates.length}건`);
console.log(`· 신규 생성 필요 거래처: ${newCustNeeded.size}개`);
console.log(`· 키 불일치 — .db에만 있음: ${keyMissInSb.length} / Supabase에만 있음: ${keyMissInDb.length} / 건수다름: ${sizeMismatch.length}`);

if (updates.length) {
  console.log(`\n${"-".repeat(72)}`);
  console.log(`■ 업데이트 대상 ${updates.length}건  (날짜 | 금액 | 내용 → 현재거래처 ⇒ 목표거래처)`);
  console.log("-".repeat(72));
  for (const u of updates.slice().sort((a, b) => String(a.sbRow.acc_date).localeCompare(String(b.sbRow.acc_date)))) {
    const c = norm(u.sbRow.content).slice(0, 22);
    console.log(
      `${u.sbRow.acc_date} | ${won(u.sbRow.acc_amt).padStart(13)} | ${c.padEnd(22)} ` +
        `\n      현재: ${custLabel(u.fromCust)}\n      목표: ${u.target ? custLabel(u.target) : `★신규생성필요  ${u.dbCust?.NAME}${u.dbCust?.REG_NUM ? ` (${u.dbCust.REG_NUM})` : ""}`}  (acc_book_id=${u.sbRow.acc_book_id})`,
    );
  }
}
if (newCustNeeded.size) {
  console.log(`\n${"-".repeat(72)}`);
  console.log(`■ 신규 생성 필요 거래처 ${newCustNeeded.size}개 (Supabase org${ORG_ID}/공유에 없음)`);
  console.log("-".repeat(72));
  for (const c of newCustNeeded.values()) console.log(`  · ${c.NAME}  (사업자/주민 ${c.REG_NUM || "-"})`);
}
if (keyMissInSb.length) {
  console.log(`\n■ .db 에만 있고 Supabase 지출엔 없는 행 ${keyMissInSb.length}개 (매칭 불가 — 확인 필요)`);
  for (const m of keyMissInSb.slice(0, 30)) {
    const [d, a, c] = m.k.split("|");
    console.log(`  · ${d} | ${won(a)} | ${c.slice(0, 30)}${m.n > 1 ? `  (x${m.n})` : ""}`);
  }
}
if (keyMissInDb.length) {
  console.log(`\n■ Supabase 에만 있고 .db 지출엔 없는 행 ${keyMissInDb.length}개 (그대로 둠)`);
  for (const m of keyMissInDb.slice(0, 30)) {
    const [d, a, c] = m.k.split("|");
    console.log(`  · ${d} | ${won(a)} | ${c.slice(0, 30)}${m.n > 1 ? `  (x${m.n})` : ""}`);
  }
}
if (sizeMismatch.length) {
  console.log(`\n■ 같은 자연키에 건수가 다른 그룹 ${sizeMismatch.length}개 (순서대로 매칭 — 검토 권장)`);
  for (const m of sizeMismatch.slice(0, 30)) {
    const [d, a, c] = m.k.split("|");
    console.log(`  · ${d} | ${won(a)} | ${c.slice(0, 24)}  .db ${m.db}건 / sb ${m.sb}건`);
  }
}
console.log(`\n${"=".repeat(72)}`);
console.log(`요약: 지출 ${updates.length}건의 cust_id 변경 + 거래처 ${newCustNeeded.size}개 신규 생성이 필요합니다.`);
console.log(`이 스크립트는 아무것도 변경하지 않았습니다. 적용은 별도 확인 후 진행합니다.`);
console.log("=".repeat(72) + "\n");

// ===== 추가 진단 =====
const anon = sbPool.find((c) => c.name === "익명" && c.org_id == null) || sbPool.find((c) => c.name === "익명");
const anonId = anon?.cust_id;
console.log(`[진단] 익명 정본 cust_id = ${anonId ?? "?"}`);

const dist = new Map();
for (const r of sbExp || []) {
  const c = sbCustById.get(r.cust_id);
  const label = c ? `${c.name}${c.reg_num ? ` (${c.reg_num})` : ""}` : `(미상)`;
  const k = `${r.cust_id}\t${label}`;
  if (!dist.has(k)) dist.set(k, { cnt: 0, amt: 0 });
  const o = dist.get(k);
  o.cnt++;
  o.amt += Number(r.acc_amt);
}
console.log(`\n[진단] 현재 Supabase 지출 거래처 분포 (${(sbExp || []).length}건):`);
for (const [k, o] of [...dist.entries()].sort((a, b) => b[1].cnt - a[1].cnt)) {
  const [cid, label] = k.split("\t");
  const tag = Number(cid) === anonId ? "  ← 익명" : "";
  console.log(`  ${String(o.cnt).padStart(3)}건 ${won(o.amt).padStart(13)}  [#${cid}] ${label}${tag}`);
}

const dbByDC = new Map();
for (const r of dbExp) {
  const k = `${r.ACC_DATE}|${norm(r.CONTENT)}`;
  if (!dbByDC.has(k)) dbByDC.set(k, []);
  dbByDC.get(k).push(r);
}
console.log(`\n[진단] 매칭 안 된 Supabase 지출 ${keyMissInDb.length}건 — (날짜·내용) 같은 .db 분할행의 거래처:`);
for (const m of keyMissInDb) {
  const s = m.sample;
  const dbRows = dbByDC.get(`${s.acc_date}|${norm(s.content)}`) || [];
  const cur = sbCustById.get(s.cust_id);
  const dbCusts = [...new Set(dbRows.map((r) => {
    const c = dbCustById.get(r.CUST_ID);
    return c ? `${c.NAME}${c.REG_NUM ? ` (${c.REG_NUM})` : ""}` : "?";
  }))];
  console.log(`  · ${s.acc_date} | ${won(s.acc_amt).padStart(13)} | ${norm(s.content).slice(0, 22)}`);
  console.log(`      현재거래처: ${cur ? `${cur.name}${cur.reg_num ? ` (${cur.reg_num})` : ""}` : "(미상)"}${Number(s.cust_id) === anonId ? "  ← 익명" : ""}`);
  console.log(`      .db 분할 ${dbRows.length}건(합 ${won(dbRows.reduce((x, r) => x + Number(r.ACC_AMT), 0))}) 거래처: ${dbCusts.join(", ") || "(없음)"}`);
}
console.log("");

const fill = (arr, col) => (arr || []).filter((r) => { const v = r[col]; return v != null && String(v).trim() !== ""; }).length;
const co = sbCustOrg || [];
const se = sbExp || [];
console.log(`[진단] Supabase org${ORG_ID} 거래처 ${co.length}개 상세 채움: job ${fill(co, "job")} / tel ${fill(co, "tel")} / post ${fill(co, "post")} / addr ${fill(co, "addr")} / addr_detail ${fill(co, "addr_detail")}`);
console.log(`[진단] Supabase org${ORG_ID} 지출 ${se.length}건 행 상세 채움: tel ${fill(se, "tel")} / post ${fill(se, "post")} / addr ${fill(se, "addr")} / addr_detail ${fill(se, "addr_detail")}`);
const yj = sbCustById.get(160);
if (yj) console.log(`[진단] 예) 양지디자인 #160 supabase 상세: job=${yj.job || "∅"} tel=${yj.tel || "∅"} post=${yj.post || "∅"} addr=${yj.addr || "∅"} addr_detail=${yj.addr_detail || "∅"}`);
console.log("");

db.close();
