/**
 * 특정 org 의 "지출(acc_book incm_sec_cd=2)"을 SQLite(.db) 자체분 데이터로 제자리 교체.
 *
 * - 대상 org_id 는 보존(삭제/재생성 안 함). 전역 코드(codeset/codevalue/acc_rel) 미변경.
 * - 수입(incm_sec_cd=1)·재산·거래처 목록은 건드리지 않음. 지출 행만 삭제 후 .db 지출로 재삽입.
 * - 거래처(cust_id)는 (사업자번호 우선, 없으면 이름)으로 org 거래처 + 공유(org_id NULL)에서 매칭,
 *   없으면 org 에 신규 생성.
 * - 실행 전 org 의 acc_book 전체 + 관련 evidence_file 을 backups/ 에 JSON 백업.
 *
 * 사용법 (app/ 에서):
 *   node scripts/replace-org-expense-from-sqlite.mjs --db "<경로.db>" [--org 11]            # dry-run (기본)
 *   node scripts/replace-org-expense-from-sqlite.mjs --db "<경로.db>" --org 11 --confirm     # 실제 적용
 *
 * 환경변수(.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import initSqlJs from "sql.js";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "..");

// ---- args ----
const args = process.argv.slice(2);
function arg(name, def = undefined) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
}
const DB_PATH = arg("--db");
const ORG_ID = Number(arg("--org", "11"));
const CONFIRM = args.includes("--confirm");
const STAMP = arg("--stamp"); // 결정적 백업 파일명(테스트용). 없으면 호출자가 외부에서 넘김.

if (!DB_PATH) {
  console.error("❌ --db <경로.db> 필요");
  process.exit(1);
}

// ---- env ----
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
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 .env.local 에 필요(서비스 키 필수)");
  process.exit(1);
}
const sb = createClient(URL, KEY, { db: { schema: "pfam" }, auth: { persistSession: false } });

// ---- helpers ----
const INT_COLS = new Set([
  "sido", "cust_order", "org_order", "estate_order", "acc_sort_num",
  "rcp_no2", "exp_type_cd", "cv_order", "cs_id", "qty", "incm_sec_cd",
  "acc_sec_cd", "item_sec_cd", "exp_sec_cd", "org_id", "cust_id", "cust_sec_cd",
]);
function openDb(path) {
  return initSqlJs().then((SQL) => new SQL.Database(readFileSync(path)));
}
function queryAll(db, sql) {
  const s = db.prepare(sql);
  const rows = [];
  while (s.step()) rows.push(s.getAsObject());
  s.free();
  return rows;
}
// SQLite row(대문자 키) → pg row(소문자) + 빈문자 정리, 허용 컬럼만
function toPgRow(row, allowedCols) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const col = k.toLowerCase();
    if (!allowedCols.has(col)) continue;
    if (INT_COLS.has(col) && (v === "" || v === undefined)) out[col] = null;
    else if (v === "" && !["name", "content", "reg_num", "kind", "remark"].includes(col)) out[col] = null;
    else out[col] = v;
  }
  return out;
}

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`지출 교체 ${CONFIRM ? "【실제 적용】" : "(dry-run · 미적용)"} — org_id=${ORG_ID}`);
  console.log(`.db: ${DB_PATH}`);
  console.log("=".repeat(60));

  // 0) 대상 org 확인
  const { data: org, error: orgErr } = await sb.from("organ").select("org_id,org_name").eq("org_id", ORG_ID).single();
  if (orgErr || !org) { console.error(`❌ org_id=${ORG_ID} 없음`); process.exit(1); }
  console.log(`대상: org_id=${org.org_id} | ${org.org_name}`);

  // acc_book 실제 컬럼(인트로스펙션)
  const { data: sampleRows } = await sb.from("acc_book").select("*").limit(1);
  const accCols = new Set(Object.keys(sampleRows?.[0] || {}));
  accCols.delete("acc_book_id"); // identity

  // 1) .db 지출 읽기
  const db = await openDb(resolve(DB_PATH));
  const dbExp = queryAll(db, "SELECT * FROM ACC_BOOK WHERE INCM_SEC_CD=2 ORDER BY ACC_DATE, ACC_SORT_NUM, ACC_BOOK_ID");
  const dbExpSum = dbExp.reduce((s, r) => s + Number(r.ACC_AMT), 0);
  console.log(`\n.db 지출: ${dbExp.length}건 / 합계 ${dbExpSum.toLocaleString()}원`);

  // 2) 현재 Supabase org 지출
  const { data: curExp } = await sb.from("acc_book").select("acc_book_id,acc_amt").eq("org_id", ORG_ID).eq("incm_sec_cd", 2);
  const curSum = (curExp || []).reduce((s, r) => s + Number(r.acc_amt), 0);
  console.log(`현재 Supabase 지출: ${curExp.length}건 / 합계 ${curSum.toLocaleString()}원`);
  console.log(`→ 교체 후 예상: ${dbExp.length}건 / ${dbExpSum.toLocaleString()}원`);

  // 3) 거래처 매핑 (.db cust_id → supabase cust_id)
  const { data: cOrg } = await sb.from("customer").select("*").eq("org_id", ORG_ID);
  const { data: cNull } = await sb.from("customer").select("*").is("org_id", null);
  const pool = [...(cOrg || []), ...(cNull || [])];
  const custCols = new Set(Object.keys(pool[0] || {}));
  custCols.delete("cust_id");
  const matchCust = (name, reg) => {
    if (reg) { const m = pool.find((p) => p.reg_num && p.reg_num === reg); if (m) return m; }
    return pool.find((p) => p.name === name);
  };
  const dbCustIds = [...new Set(dbExp.map((r) => r.CUST_ID))];
  const custMap = new Map(); // db cust_id → supabase cust_id
  const toCreate = []; // {dbCust}
  for (const cid of dbCustIds) {
    const c = queryAll(db, `SELECT * FROM CUSTOMER WHERE CUST_ID=${cid}`)[0];
    if (!c) { console.warn(`  ⚠️ .db CUSTOMER 누락: cust_id=${cid} (해당 지출은 cust_id 그대로 시도)`); continue; }
    const m = matchCust(c.NAME, c.REG_NUM);
    if (m) custMap.set(cid, m.cust_id);
    else toCreate.push(c);
  }
  console.log(`\n거래처: 참조 ${dbCustIds.length}개 / 기존매칭 ${custMap.size} / 신규생성 ${toCreate.length}`);
  toCreate.forEach((c) => console.log(`  신규생성 예정: ${c.NAME} (${c.REG_NUM || "-"})`));

  if (!CONFIRM) {
    console.log(`\n${"-".repeat(60)}`);
    console.log(`[dry-run] 삭제 예정 ${curExp.length}건 → 삽입 예정 ${dbExp.length}건`);
    console.log(`실제 적용하려면 --confirm 추가.`);
    db.close();
    return;
  }

  // ===== 실제 적용 =====
  // 4) 백업 (org 의 acc_book 전체 + 지출 evidence_file)
  const expIds = (curExp || []).map((r) => r.acc_book_id);
  const { data: fullBook } = await sb.from("acc_book").select("*").eq("org_id", ORG_ID);
  let evidence = [];
  if (expIds.length) {
    const { data: ev } = await sb.from("evidence_file").select("*").in("acc_book_id", expIds);
    evidence = ev || [];
  }
  const stamp = STAMP || new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = resolve(APP_DIR, "../backups");
  mkdirSync(backupDir, { recursive: true });
  const backupPath = resolve(backupDir, `acc_book_org${ORG_ID}_expense-replace_${stamp}.json`);
  writeFileSync(backupPath, JSON.stringify({
    when: stamp, org_id: ORG_ID, org_name: org.org_name,
    note: "지출 교체 전 백업. 복구: acc_book(incm_sec_cd=2) 삭제 후 acc_book_expense 재삽입 + evidence_file 재연결",
    acc_book_all: fullBook, acc_book_expense: (fullBook || []).filter((r) => r.incm_sec_cd === 2),
    evidence_file_expense: evidence,
  }, null, 2), "utf-8");
  console.log(`\n💾 백업 저장: ${backupPath}`);
  if (evidence.length) console.log(`   ⚠️ 삭제될 지출에 첨부서류(evidence_file) ${evidence.length}건 연결됨 — acc_book 삭제 시 CASCADE 로 함께 삭제(Storage 객체는 별도). 백업에 포함.`);

  // 5) 신규 거래처 생성
  for (const c of toCreate) {
    const row = toPgRow(c, custCols);
    row.org_id = ORG_ID;
    const { data, error } = await sb.from("customer").insert(row).select("cust_id").single();
    if (error) { console.error(`  ❌ 거래처 생성 실패 ${c.NAME}: ${error.message}`); process.exit(1); }
    custMap.set(c.CUST_ID, data.cust_id);
    console.log(`  + 거래처 생성: ${c.NAME} → cust_id=${data.cust_id}`);
  }

  // 6) 기존 지출 삭제
  const { error: delErr, count: delCnt } = await sb
    .from("acc_book").delete({ count: "exact" }).eq("org_id", ORG_ID).eq("incm_sec_cd", 2);
  if (delErr) { console.error(`❌ 지출 삭제 실패: ${delErr.message}`); process.exit(1); }
  console.log(`\n🗑️  기존 지출 삭제: ${delCnt}건`);

  // 7) .db 지출 삽입
  const rows = dbExp.map((r) => {
    const row = toPgRow(r, accCols);
    row.org_id = ORG_ID;
    row.incm_sec_cd = 2;
    const mapped = custMap.get(r.CUST_ID);
    if (mapped !== undefined) row.cust_id = mapped;
    return row;
  });
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error } = await sb.from("acc_book").insert(batch);
    if (error) {
      // 행 단위 재시도(원인 표시)
      for (const row of batch) {
        const { error: e2 } = await sb.from("acc_book").insert(row);
        if (e2) console.error(`  ❌ 삽입 실패 [${row.acc_date} ${row.content} ${row.acc_amt}]: ${e2.message}`);
        else inserted++;
      }
    } else inserted += batch.length;
  }
  console.log(`➕ .db 지출 삽입: ${inserted}/${rows.length}건`);

  // 8) 검증
  const { data: after } = await sb.from("acc_book").select("acc_amt").eq("org_id", ORG_ID).eq("incm_sec_cd", 2);
  const afterSum = (after || []).reduce((s, r) => s + Number(r.acc_amt), 0);
  const { count: incCnt } = await sb.from("acc_book").select("*", { count: "exact", head: true }).eq("org_id", ORG_ID).eq("incm_sec_cd", 1);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`✅ 완료 — org${ORG_ID} 지출: ${after.length}건 / ${afterSum.toLocaleString()}원 (목표 ${dbExp.length}건 / ${dbExpSum.toLocaleString()})`);
  console.log(`   수입(미변경): ${incCnt}건`);
  console.log(`   백업: ${backupPath}`);
  if (after.length !== dbExp.length || afterSum !== dbExpSum)
    console.error(`   ⚠️ 검증 불일치! 백업으로 복구 검토.`);
  console.log("=".repeat(60));
  db.close();
}
main().catch((e) => { console.error("❌ 실패:", e); process.exit(1); });
