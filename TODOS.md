# TODOS

## P1 - Security

### Add auth token validation to acc-book API route
- **What:** Validate the caller's auth token and verify they have access to the requested orgId before processing any request.
- **Why:** The API uses `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS) and never checks who's calling. Any client can read/modify any org's financial data by passing any `orgId`. This is the most serious security gap in the codebase.
- **Context:** `app/src/app/api/acc-book/route.ts` lines 4-7. The service role key is needed for some operations (e.g., cross-table joins), but the route should extract and verify the user's auth token from the request, then confirm the user has a `user_organ` relationship to the requested `orgId`. Consider switching to the user's token for read operations and reserving service role for admin operations only.
- **Reference pattern:** `/api/organ` and `/api/hwpx/income-ledger` (added v0.4.0.0) already implement the correct guard: `createSupabaseServer()` → `auth.getUser()` (401) → `user_organ` membership check on `(user_id, org_id)` (403) before any service-role query. Apply the same guard to `acc-book` and other service-role routes.
- **Depends on:** Nothing. Can be done independently.
- **Added:** 2026-04-01 (eng review of feat/search-total-summary); income-ledger guarded 2026-06-08 (CodeRabbit review of PR #58)

### Require auth on /api/hwpx/generate
- **What:** Add the standard session + `user_organ` guard to `/api/hwpx/generate` (and audit the other hwpx routes).
- **Why:** `lib/supabase/middleware.ts` exempts all of `/api`, and the route itself never checks a session — anyone on the internet can POST and generate official-looking 선관위 forms with arbitrary values (no DB access, so no data leak; compute abuse + 위조 보조 위험).
- **Context:** `app/src/app/api/hwpx/generate/route.ts`. Same class as the acc-book item above; lower severity (no data exposure).
- **Reference pattern:** `/api/hwpx/income-ledger` already implements the guard (`createSupabaseServer()` → `auth.getUser()` 401 → `user_organ` 403).
- **Added:** 2026-06-11 (adversarial review of feat/burden-cost-claim-hwpx)

## P2 - Architecture

### Unify data access pattern (API route vs direct Supabase)
- **What:** Income page uses Next.js API route (`/api/acc-book`) with service role key. Expense page queries Supabase directly from the browser with anon key. These are contradictory security models for the same table.
- **Why:** Two different access patterns means auth, audit logging, rate limiting, and data validation must be implemented in two places. They will diverge as features grow. The expense page relies on RLS being correctly configured; the income page bypasses RLS entirely.
- **Context:** `app/src/app/dashboard/income/page.tsx` (uses fetch to `/api/acc-book`), `app/src/app/dashboard/expense/page.tsx` (uses `createSupabaseBrowser()` directly). Decision needed: move expense to API route (consistency, centralized auth) or move income to direct Supabase (simpler, relies on RLS).
- **Depends on:** P1 auth validation should be resolved first to inform the direction.
- **Added:** 2026-04-01 (eng review)

### 수입지출보고서 정규 배분 경로 일원화 (route 공유 + V2/V3)
- **What:** `api/hwpx/accounting-report`(22-1)가 `buildCandidateReportSummary`를 공유하도록 리팩터, `excel-template/data-query.ts`(`/api/excel/report`)의 병렬 분류 교체/제거, `CANDIDATE_ACC_SEC_CDS` 로컬 중복을 `FUNDING_SOURCE_BY_ACC_SEC_CD` SSOT로 통합.
- **Why:** 페이지(V1)는 정규 SSOT로 일원화했으나 22-1 route는 동일 로직을 인라인 재구현(드리프트 위험 + 비후보자 경로 `acc_amt`(NUMERIC→문자열) 문자열연결 잠재버그). `data-query`는 선거비용/자금원 병렬분류·보조금외 항상 0. route가 SSOT를 공유하면 page==22-1 동등성이 구조적으로 보장되고 G4·G7이 동시 해소.
- **Context:** `docs/03-analysis/income-expense-report-ssot.analysis.md`(G4·G7·V2·V3), `docs/05-reference/정치자금_수입지출부_생성_주의사항.md` §12. SSOT는 이미 `app/src/lib/accounting/income-expense-report-summary.ts`에 존재 — route/data-query가 import만 하면 됨.
- **Progress:** 🔶 부분완료 v0.17.1.0 (#88) — `api/hwpx/accounting-report`(22-1/22-2/22-4)가 `allocateCandidateLedgerRows`(page `buildCandidateReportSummary`와 공유하는 신규 SSOT)로 위임. route 로컬 `CANDIDATE_ACC_SEC_CDS` 제거(**G7 route측 해소**)·비후보자 경로 `Number()`/Pass0 적용(**G4 route측 해소**). **잔여:** `excel-template/data-query.ts`(V2) 교체/제거, `export-sqlite`의 `CANDIDATE_ACC_SEC_CDS`(V3 export-sqlite측).
- **Depends on:** Nothing.
- **Added:** 2026-06-20 (감사 V1 후속, /pdca analyze)

## P3 - Performance

### Optimize summary queries with Supabase RPC
- **What:** Replace the all-records fetch (used to compute org-wide income/expense totals) with a Postgres function that returns `SUM(acc_amt) GROUP BY incm_sec_cd`.
- **Why:** Currently every GET request to `/api/acc-book` and every expense page load fetches ALL records for the org just to compute header summary totals. With `.limit(100000)` this won't silently truncate, but loading thousands of rows to compute two numbers is wasteful. A Supabase RPC with `SELECT incm_sec_cd, SUM(acc_amt) FROM acc_book WHERE org_id=$1 GROUP BY incm_sec_cd` would return 2 rows instead of N.
- **Context:** `app/src/app/api/acc-book/route.ts` lines 47-54, `app/src/app/dashboard/expense/page.tsx` lines 120-125. Current dataset sizes are likely <5K records per org, so this is not urgent.
- **Depends on:** Nothing. Can be done independently.
- **Added:** 2026-04-01 (eng review)

## P2 - Quality

### Fix FormInputPanel prefill race that wipes in-progress input
- **What:** Merge prefill values into empty fields only (or track dirty fields) instead of `setValues(prefill(def))` on every `[def, prefill]` change.
- **Why:** `prefill` is a `useCallback` depending on `[organ, orgName, acctName]`. If the organ fetch resolves (or auth store updates) while the user is typing, the effect re-runs and silently wipes ALL entered values. Worst on 서식 44 (37 manual fields — a full 청구금액 table can vanish).
- **Context:** `app/src/components/hwpx/FormInputPanel.tsx` (`useEffect(() => setValues(prefill(def)), [def, prefill])`). Pre-existing defect affecting every form; exposure maximized by form 44.
- **Added:** 2026-06-11 (adversarial review of feat/burden-cost-claim-hwpx)

## P3 - Quality

### 익명 거래처 판정·데이터 정리 (org-metrics dead 조건 + 익명 4중복)
- **What:** (1) `org-metrics.ts`의 익명 기부 판정 `ANONYMOUS_CUST_ID = -999` 비교를 실제 익명 cust_id(name='익명') 기반으로 교체 — DB에 -999가 존재하지 않아 현재 **항상 false**(익명 기부가 집계에 안 잡힘). (2) customer의 익명 중복 4행(38=org_id 10 묶임/39·65·117=NULL) 정리 — acc_book 참조를 39(정본)로 이관 후 중복 삭제.
- **Why:** acc_book FK 버그 조사(2026-06-11)에서 발견. 쓰기 경로는 `api/acc-book/anonymous-customer.ts` resolve로 수정됐으나 읽기 판정과 기존 데이터는 별개.
- **Context:** `app/src/lib/dashboard/org-metrics.ts:75-81`, `pfam.customer`. income-ledger-builder는 reg_num='9999' 폴백이 있어 동작 중.
- **Added:** 2026-06-11 (investigate: acc_book_cust_id_fkey)

### 서식 44 입력 품질 Phase 2 (숫자 검증·per-field maxLen·합계 자동계산)
- **What:** (1) 금액/수량 필드에 숫자 형식 검증(`/^[0-9,]*$/` + `inputMode="numeric"`), (2) `HwpxFormField.maxLen`으로 셀 폭에 맞는 필드별 길이 제한(금액류 ~20자 — 현행 type 기반 200자는 39.8mm 셀에 과대), (3) 총매수(C=A×B)·계 행/열 자동계산 또는 불일치 경고, 격자 입력 UI.
- **Why:** 현재 25개 금액 + 수량 7개가 자유 텍스트라 "C≠A×B", 계행≠열합, 한글 섞인 금액이 그대로 법정 청구서에 들어갈 수 있고, 장문 입력 시 1쪽 서식이 수쪽으로 변형된다.
- **Context:** `lib/hwpx/form-fields.ts`(서식 44 def), `api/hwpx/generate/route.ts`(MAX_LEN), `components/hwpx/FormInputPanel.tsx`. Plan 문서 Phase 2(docs/01-plan/features/burden-cost-claim-hwpx.plan.md)와 동일 묶음.
- **Added:** 2026-06-11 (adversarial review of feat/burden-cost-claim-hwpx)

### Extract FaqBrowser as a separate component from ChatBubble
- **What:** Split `ChatBubble.tsx` into `FaqBrowser` (FAQ navigation: 3 state vars, 4 handlers, ~100 lines JSX) and `ChatPanel` (chat messages, input, header).
- **Why:** ChatBubble is 313 lines with 8 `useState` hooks handling two distinct responsibilities (FAQ navigation + chat). Cross-model review agreement that this coupling creates unnecessary bug surface area (stale state interactions, combinatorial test explosion).
- **Context:** The only coupling point is `handleFaqItem` (FAQ → chat messages). `FaqBrowser` needs: a callback for item selection, and visibility into `messages` array for duplicate detection. The prop interface is clean.
- **Depends on:** Nothing (test framework now set up in v0.1.1.0). Having tests makes refactoring safe.
- **Added:** 2026-04-05 (eng review of feat/faq-back-navigation, cross-model consensus)

## Completed

### Set up test framework (vitest + testing-library)
- **What:** Add vitest, @testing-library/react, and happy-dom to the project. Write initial tests for core components (tfoot summaries, auth flow, API route).
- **Completed:** v0.1.1.0 (2026-04-05) — vitest + @testing-library/react + happy-dom installed. 19 tests for ChatBubble component. `npm run test` runs vitest.
