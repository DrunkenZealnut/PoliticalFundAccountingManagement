# TODOS

## P1 - Security

### Add auth token validation to acc-book API route
- **What:** Validate the caller's auth token and verify they have access to the requested orgId before processing any request.
- **Why:** The API uses `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS) and never checks who's calling. Any client can read/modify any org's financial data by passing any `orgId`. This is the most serious security gap in the codebase.
- **Context:** `app/src/app/api/acc-book/route.ts` lines 4-7. The service role key is needed for some operations (e.g., cross-table joins), but the route should extract and verify the user's auth token from the request, then confirm the user has a `user_organ` relationship to the requested `orgId`. Consider switching to the user's token for read operations and reserving service role for admin operations only.
- **Depends on:** Nothing. Can be done independently.
- **Added:** 2026-04-01 (eng review of feat/search-total-summary)

## P2 - Architecture

### Unify data access pattern (API route vs direct Supabase)
- **What:** Income page uses Next.js API route (`/api/acc-book`) with service role key. Expense page queries Supabase directly from the browser with anon key. These are contradictory security models for the same table.
- **Why:** Two different access patterns means auth, audit logging, rate limiting, and data validation must be implemented in two places. They will diverge as features grow. The expense page relies on RLS being correctly configured; the income page bypasses RLS entirely.
- **Context:** `app/src/app/dashboard/income/page.tsx` (uses fetch to `/api/acc-book`), `app/src/app/dashboard/expense/page.tsx` (uses `createSupabaseBrowser()` directly). Decision needed: move expense to API route (consistency, centralized auth) or move income to direct Supabase (simpler, relies on RLS).
- **Depends on:** P1 auth validation should be resolved first to inform the direction.
- **Added:** 2026-04-01 (eng review)

## P3 - Performance

### Optimize summary queries with Supabase RPC
- **What:** Replace the all-records fetch (used to compute org-wide income/expense totals) with a Postgres function that returns `SUM(acc_amt) GROUP BY incm_sec_cd`.
- **Why:** Currently every GET request to `/api/acc-book` and every expense page load fetches ALL records for the org just to compute header summary totals. With `.limit(100000)` this won't silently truncate, but loading thousands of rows to compute two numbers is wasteful. A Supabase RPC with `SELECT incm_sec_cd, SUM(acc_amt) FROM acc_book WHERE org_id=$1 GROUP BY incm_sec_cd` would return 2 rows instead of N.
- **Context:** `app/src/app/api/acc-book/route.ts` lines 47-54, `app/src/app/dashboard/expense/page.tsx` lines 120-125. Current dataset sizes are likely <5K records per org, so this is not urgent.
- **Depends on:** Nothing. Can be done independently.
- **Added:** 2026-04-01 (eng review)

## P3 - Quality

### Set up test framework (vitest + testing-library)
- **What:** Add vitest, @testing-library/react, and happy-dom to the project. Write initial tests for core components (tfoot summaries, auth flow, API route).
- **Why:** 0% test coverage across the entire project. 18 untested code paths identified in the search-total-summary feature alone. For a financial compliance system, test coverage is important for preventing regressions.
- **Context:** `app/package.json` has no test runner. No test directories exist. Start with unit tests for the API route (pure request/response, easy to test) and component tests for the tfoot summary rendering.
- **Depends on:** Nothing. Can be done independently.
- **Added:** 2026-04-01 (eng review)
