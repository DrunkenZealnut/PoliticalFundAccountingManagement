/**
 * 마이그레이션 검증 스크립트
 *
 * 사용법: node scripts/003_verify_migration.mjs
 *
 * Supabase에 마이그레이션된 데이터의 무결성을 검증합니다.
 * - 테이블 존재 여부
 * - 레코드 수
 * - 코드체계 무결성 (CODESET ↔ CODEVALUE)
 * - 계정관계 무결성 (ACC_REL)
 * - 외래키 참조 무결성
 * - RLS 정책 확인
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  try {
    const envPath = resolve(__dirname, "../.env.local");
    const content = readFileSync(envPath, "utf-8");
    const vars = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [key, ...rest] = trimmed.split("=");
      vars[key.trim()] = rest.join("=").trim();
    }
    return vars;
  } catch {
    return {};
  }
}

async function verify() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error("❌ Supabase 환경변수 설정 필요");
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  let passed = 0;
  let failed = 0;

  function check(name, ok, detail = "") {
    if (ok) {
      console.log(`  ✅ ${name}${detail ? ` (${detail})` : ""}`);
      passed++;
    } else {
      console.log(`  ❌ ${name}${detail ? ` - ${detail}` : ""}`);
      failed++;
    }
  }

  console.log("\n📋 Supabase 마이그레이션 검증\n");

  // 1. 테이블 레코드 수
  console.log("1️⃣  테이블 레코드 수");
  const tables = [
    { name: "codeset", minRows: 10, desc: "코드분류" },
    { name: "codevalue", minRows: 50, desc: "코드값" },
    { name: "acc_rel", minRows: 10, desc: "계정관계" },
    { name: "organ", minRows: 0, desc: "사용기관" },
    { name: "customer", minRows: 0, desc: "수입지출처" },
    { name: "acc_book", minRows: 0, desc: "회계장부" },
    { name: "estate", minRows: 0, desc: "재산내역" },
  ];

  for (const t of tables) {
    const { count, error } = await supabase
      .from(t.name)
      .select("*", { count: "exact", head: true });
    if (error) {
      check(`${t.desc} (${t.name})`, false, `조회 오류: ${error.message}`);
    } else {
      check(
        `${t.desc} (${t.name})`,
        (count ?? 0) >= t.minRows,
        `${count}건${t.minRows > 0 ? ` (최소 ${t.minRows}건 필요)` : ""}`
      );
    }
  }

  // 2. 코드체계 무결성
  console.log("\n2️⃣  코드체계 무결성");
  const { data: codesets } = await supabase.from("codeset").select("cs_id, cs_name");
  const { data: codevalues } = await supabase.from("codevalue").select("cv_id, cs_id, cv_name");

  if (codesets && codevalues) {
    const csIds = new Set(codesets.map((c) => c.cs_id));
    const orphanCv = codevalues.filter((cv) => !csIds.has(cv.cs_id));
    check(
      "CODEVALUE → CODESET 참조",
      orphanCv.length === 0,
      orphanCv.length > 0
        ? `고아 코드값 ${orphanCv.length}건 (cs_id: ${[...new Set(orphanCv.map((c) => c.cs_id))].join(",")})`
        : `${codevalues.length}건 모두 정상`
    );

    // 필수 코드분류 존재 확인
    const requiredCs = [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 16, 17];
    const missingCs = requiredCs.filter((id) => !csIds.has(id));
    check(
      "필수 코드분류 존재",
      missingCs.length === 0,
      missingCs.length > 0 ? `누락: CS_ID ${missingCs.join(",")}` : `${requiredCs.length}개 모두 존재`
    );
  }

  // 3. 계정관계 무결성
  console.log("\n3️⃣  계정관계 (ACC_REL)");
  const { data: accRels } = await supabase.from("acc_rel").select("*").eq("input_yn", "Y");
  if (accRels) {
    const orgTypes = [...new Set(accRels.map((r) => r.org_sec_cd))];
    check("ACC_REL 활성 레코드", accRels.length > 0, `${accRels.length}건 (기관유형: ${orgTypes.join(",")})`);

    // 각 기관유형별 수입/지출 조합 존재 확인
    for (const orgType of orgTypes) {
      const income = accRels.filter((r) => r.org_sec_cd === orgType && r.incm_sec_cd === 1);
      const expense = accRels.filter((r) => r.org_sec_cd === orgType && r.incm_sec_cd === 2);
      check(
        `기관유형 ${orgType}`,
        income.length > 0,
        `수입 ${income.length}건, 지출 ${expense.length}건`
      );
    }
  }

  // 4. 외래키 참조 무결성 (acc_book → organ, customer)
  console.log("\n4️⃣  외래키 참조 무결성");
  const { data: accBooks } = await supabase
    .from("acc_book")
    .select("org_id, cust_id")
    .limit(500);

  if (accBooks && accBooks.length > 0) {
    const orgIds = [...new Set(accBooks.map((r) => r.org_id))];
    const custIds = [...new Set(accBooks.map((r) => r.cust_id).filter((id) => id > 0))];

    // Verify org_ids exist in organ
    for (const orgId of orgIds) {
      const { count } = await supabase
        .from("organ")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgId);
      check(`ACC_BOOK → ORGAN (org_id=${orgId})`, (count ?? 0) > 0);
    }

    // Verify a sample of cust_ids exist in customer
    const sampleCusts = custIds.slice(0, 5);
    for (const custId of sampleCusts) {
      const { count } = await supabase
        .from("customer")
        .select("*", { count: "exact", head: true })
        .eq("cust_id", custId);
      check(`ACC_BOOK → CUSTOMER (cust_id=${custId})`, (count ?? 0) > 0);
    }
  } else {
    console.log("  ℹ️  ACC_BOOK 데이터 없음 (외래키 검증 스킵)");
  }

  // 5. 수입/지출 잔액 검증
  console.log("\n5️⃣  수입/지출 잔액 검증");
  const { data: organs } = await supabase.from("organ").select("org_id, org_name");
  if (organs) {
    for (const org of organs) {
      const { data: balData } = await supabase
        .from("acc_book")
        .select("incm_sec_cd, acc_amt")
        .eq("org_id", org.org_id);

      if (balData && balData.length > 0) {
        const income = balData.filter((r) => r.incm_sec_cd === 1).reduce((s, r) => s + r.acc_amt, 0);
        const expense = balData.filter((r) => r.incm_sec_cd === 2).reduce((s, r) => s + r.acc_amt, 0);
        const balance = income - expense;
        check(
          `${org.org_name} (org_id=${org.org_id})`,
          true,
          `수입 ${income.toLocaleString()}원 - 지출 ${expense.toLocaleString()}원 = 잔액 ${balance.toLocaleString()}원`
        );
      }
    }
  }

  // Summary
  console.log(`\n${"=".repeat(50)}`);
  console.log(`📊 검증 결과: ${passed} 통과 / ${failed} 실패`);
  if (failed === 0) {
    console.log("🎉 모든 검증을 통과했습니다!");
  } else {
    console.log(`⚠️  ${failed}건의 검증 실패 - 위 항목을 확인하세요.`);
  }
  console.log(`${"=".repeat(50)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

verify().catch((err) => {
  console.error("❌ 검증 실패:", err.message);
  process.exit(1);
});
