/**
 * E2E Test: 정치자금 회계관리 시스템 전체 흐름
 * 실행: node e2e/full-flow.spec.mjs
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3010";
const EMAIL = "test@example.com";
const PASSWORD = "test1234";

let passed = 0;
let failed = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) { passed++; }
  else { failed++; failures.push({ name, detail }); }
  console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? ` (${detail})` : ""}`);
}

async function waitForContent(page, text, timeout = 8000) {
  try {
    await page.waitForFunction(
      (t) => document.body?.innerText?.includes(t),
      text,
      { timeout }
    );
    return true;
  } catch { return false; }
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  try {
    // ========== 1. 로그인 ==========
    console.log("\n1️⃣  로그인");
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 15000 });
    check("로그인 페이지 로드", await page.locator('input[type="email"]').count() > 0);

    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.locator('button[type="submit"]').click();

    // Wait for login to process
    await page.waitForTimeout(5000);
    let url = page.url();
    console.log(`    현재 URL: ${url}`);

    // Handle various redirect paths
    if (url.includes("/select-organ")) {
      const organBtn = page.locator("button").filter({ hasText: "오준석후보" }).first();
      if (await organBtn.count() > 0) {
        await organBtn.click();
        await page.waitForTimeout(3000);
      }
    }

    // Navigate to dashboard explicitly
    await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(4000);
    url = page.url();
    console.log(`    대시보드 URL: ${url}`);

    // If redirected to login, auth session might not have persisted
    if (url.includes("/login")) {
      console.log("    ⚠️  세션 유실 → 재로그인");
      await page.locator('input[type="email"]').fill(EMAIL);
      await page.locator('input[type="password"]').fill(PASSWORD);
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(5000);
      await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(3000);
      url = page.url();
      console.log(`    재시도 URL: ${url}`);
    }

    check("대시보드 접근", url.includes("/dashboard") || url === `${BASE}/`);

    // ========== 2. 대시보드 ==========
    console.log("\n2️⃣  대시보드");
    const hasDash = await waitForContent(page, "대시보드", 5000);
    check("대시보드 텍스트", hasDash);
    check("사용기관명", await waitForContent(page, "오준석후보", 3000));
    // Data might still be loading
    const hasIncome = await waitForContent(page, "17,699,055", 5000);
    check("수입액 합계", hasIncome, hasIncome ? "17,699,055원" : "로딩 중일 수 있음");

    // ========== 3. 수입내역관리 ==========
    console.log("\n3️⃣  수입내역관리");
    await page.goto(`${BASE}/dashboard/income`, { waitUntil: "domcontentloaded", timeout: 15000 });
    // Wait for code values to load first (shows "코드 데이터 로딩 중..." then renders)
    await waitForContent(page, "수입내역", 10000);
    // Then wait for actual data rows
    await page.waitForTimeout(3000);

    const incBody = await page.textContent("body");
    check("페이지 로드", incBody.includes("수입내역"));

    // Wait for table rows to appear
    await page.waitForSelector("tbody tr", { timeout: 8000 }).catch(() => {});
    const incRows = await page.locator("tbody tr").count();
    check("수입내역 행 존재", incRows > 1, `${incRows}행`);

    check("계정 코드명", incBody.includes("후보자등자산") || incBody.includes("후원회기부금") || incBody.includes("보조금"));
    check("신규입력 버튼", await page.locator("button:has-text('신규입력')").count() > 0);
    check("복구 버튼", await page.locator("button:has-text('복구')").count() > 0);
    check("영수증일괄입력", await page.locator("button:has-text('영수증일괄입력')").count() > 0);
    check("수입부 엑셀", await page.locator("button:has-text('수입부 엑셀')").count() > 0);
    check("검색 패널", await page.locator("text=검색 조건").count() > 0);

    // ========== 4. 지출내역관리 ==========
    console.log("\n4️⃣  지출내역관리");
    await page.goto(`${BASE}/dashboard/expense`, { waitUntil: "domcontentloaded", timeout: 15000 });
    await waitForContent(page, "지출내역", 10000);
    await page.waitForTimeout(3000);

    const expBody = await page.textContent("body");
    check("페이지 로드", expBody.includes("지출내역"));
    await page.waitForSelector("tbody tr", { timeout: 8000 }).catch(() => {});
    const expRows = await page.locator("tbody tr").count();
    check("지출내역 행", expRows > 1, `${expRows}행`);
    check("지출방법", expBody.includes("계좌입금") || expBody.includes("카드") || expBody.includes("현금") || expBody.includes("기타"));

    // ========== 5. 수입지출처 ==========
    console.log("\n5️⃣  수입지출처");
    await page.goto(`${BASE}/dashboard/customer`, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(3000);
    await page.waitForSelector("tbody tr", { timeout: 8000 }).catch(() => {});
    const custRows = await page.locator("tbody tr").count();
    check("수입지출처 행", custRows > 1, `${custRows}행`);
    check("주소검색 버튼", await page.locator("button:has-text('주소검색')").count() > 0);

    // ========== 6. 사용기관 ==========
    console.log("\n6️⃣  사용기관관리");
    await page.goto(`${BASE}/dashboard/organ`, { waitUntil: "domcontentloaded", timeout: 15000 });
    await waitForContent(page, "오준석후보", 8000);
    await page.waitForTimeout(2000); // Wait for full render after data load
    const orgBody = await page.textContent("body");
    check("기관명", orgBody.includes("오준석후보"));
    check("회계기간 섹션", orgBody.includes("회계기간") || orgBody.includes("당해") || orgBody.includes("기관 정보"));

    // ========== 7. 재산내역 ==========
    console.log("\n7️⃣  재산내역");
    await page.goto(`${BASE}/dashboard/estate`, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(3000);
    await page.waitForSelector("tbody tr", { timeout: 5000 }).catch(() => {});
    const estBody = await page.textContent("body");
    check("재산 데이터", estBody.includes("국민은행") || estBody.includes("2,902,930"));

    // ========== 8. 나머지 페이지 접근 ==========
    console.log("\n8️⃣  나머지 페이지 접근");
    const pages = [
      ["/dashboard/settlement", "결산"],
      ["/dashboard/codes", "코드관리"],
      ["/dashboard/reports", "보고서"],
      ["/dashboard/party-summary", "총괄표"],
      ["/dashboard/income-expense-report", "보고서"],
      ["/dashboard/income-expense-book", "수입지출부"],
      ["/dashboard/resolution", "결의서"],
      ["/dashboard/asset-report", "재산명세서"],
      ["/dashboard/backup", "백업"],
      ["/dashboard/donors", "기부자"],
      ["/dashboard/submit", "제출파일"],
      ["/dashboard/receipt", "영수증"],
      ["/dashboard/reimbursement", "보전비용"],
      ["/dashboard/batch-import", "일괄등록"],
      ["/dashboard/customer-batch", "일괄등록"],
      ["/dashboard/aggregate", "취합"],
      ["/dashboard/reset", "초기화"],
    ];

    for (const [path, keyword] of pages) {
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(2500);
      const bodyText = await page.textContent("body").catch(() => "");
      const ok = page.url().includes(path) && bodyText.includes(keyword);
      check(path.replace("/dashboard/", ""), ok);
    }

    // ========== 9. 콘솔 에러 ==========
    console.log("\n9️⃣  콘솔 에러");
    const critErrs = consoleErrors.filter(
      (e) => !e.includes("favicon") && !e.includes("Warning:") && !e.includes("%s")
        && !e.includes("hydrat") && !e.includes("mismatch") && !e.includes("Zustand")
        && !e.includes("persist") && !e.includes("Cannot update a component")
        && !e.includes("NEXT_") && !e.includes("text content does not match")
        && !e.includes("Failed to load resource") && !e.includes("500")
        && !e.includes("_next/static") && !e.startsWith("    at ")
        && !e.includes("localhost:3010")
    );
    if (critErrs.length > 0) {
      console.log("    에러 샘플:", critErrs.slice(0, 3).map(e => e.slice(0, 80)));
    }
    check("치명적 에러 없음", critErrs.length === 0,
      critErrs.length > 0 ? `${critErrs.length}건` : "0건");

  } catch (err) {
    console.error(`\n💥 오류: ${err.message}`);
    failed++;
  } finally {
    await browser.close();
  }

  // Summary
  console.log(`\n${"=".repeat(50)}`);
  console.log(`📊 E2E: ${passed} PASS / ${failed} FAIL (총 ${passed + failed}건)`);
  if (failed === 0) {
    console.log("🎉 모든 E2E 테스트 통과!");
  } else {
    console.log("실패 항목:");
    failures.forEach((f) => console.log(`  ❌ ${f.name}${f.detail ? ` - ${f.detail}` : ""}`));
  }
  console.log(`${"=".repeat(50)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
