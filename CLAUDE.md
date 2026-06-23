# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

정치자금 회계관리 시스템 — a political fund accounting management web app for Korean election campaigns. Manages income/expense ledgers, customer records, donation limits, Excel/SQLite I/O, and provides a static FAQ browser based on official election commission materials.

## Commands

All commands run from the `app/` directory.

> **CRITICAL — `node_modules/.bin` is empty in this environment.** Both `npm run *`
> and `npx <tool>` fail with `command not found` (vitest/eslint/next are not on PATH).
> Invoke the binaries via their node entry points directly:

```bash
cd app
node node_modules/next/dist/bin/next dev --port 3001        # Dev server (port 3001)
node node_modules/next/dist/bin/next build                  # Production build
node node_modules/eslint/bin/eslint.js <paths>              # Lint (v9 flat config)
node node_modules/vitest/vitest.mjs run                     # Run all tests
node node_modules/vitest/vitest.mjs run src/stores/auth.test.ts   # Single test file
```

(The `package.json` scripts — `npm run dev|build|lint|test|test:watch` — encode the
intended commands but only work where `.bin` is populated.)

## Architecture

### Tech Stack
- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript 5
- **Database**: Supabase PostgreSQL with custom `pfam` schema and RLS
- **State**: Zustand (auth store persisted to localStorage)
- **UI**: shadcn/ui + Tailwind CSS v4 + Recharts
- **Data I/O**: ExcelJS (xlsx), sql.js (SQLite WASM)
- **Testing**: Vitest + React Testing Library (happy-dom)

### Next.js 16 Warning
This uses Next.js 16 which has breaking changes from training data. Always read `node_modules/next/dist/docs/` before writing Next.js-specific code. See `app/AGENTS.md`.

### DB Schema Gotcha
- `acc_ins_type` column is `VARCHAR(5)` (was CHAR(2), widened via `scripts/008`). PAY_METHODS codes are 3 chars ("118", "583").
- All dates stored as `YYYYMMDD` strings (not DATE type). UI uses `YYYY-MM-DD`, convert on save/display. **시분초(거래 시각 `acc_time`)는 쓰지 않는다** — `acc-time-input`(v0.7.0.0)으로 추가됐다가 `acc-time-removal`(v0.20.0.0)로 전면 제거했고 `scripts/019_drop_acc_time.sql`이 컬럼을 DROP한다. **명시적 Supabase select에 `acc_time`을 넣지 말 것**(컬럼 부재 → `column acc_book.acc_time does not exist`로 조회 실패; export의 `SELECT *`는 strip이 방어). **거래(장부/목록) 정렬 SSOT는 `lib/accounting/acc-book-sort.ts`의 `compareAccDateTime`(`acc_date`만)**, 같은 날 tie-break는 호출부가 `incm_sec_cd`(수입 우선 — 잔액 음수 방지) → `acc_book_id`로 잇는다. export는 `fillExportSortNumbers`가 `acc_date → 수입먼저 → acc_book_id`로 `acc_sort_num`을 재부여(Supabase 정렬은 `.order("acc_date").order("acc_sort_num",{nullsFirst:true}).order("acc_book_id")`). 영수증 채번(`receipt-no.ts`)·첨부서류 목록은 정렬 SSOT에서 의도적 제외.
- `customer.org_id` (added via `scripts/011`) scopes counterparties per organization — a same-name counterparty in two orgs is two rows. The anonymous customer (`name='익명'`) is shared with `org_id` NULL. Every customer read/write/match path must filter/set `org_id` (customers API, customer + customer-batch pages, acc-book batch matching, import/export-sqlite). **Anonymous `cust_id` gotcha**: clients send the PFund2-compat sentinel `cust_id=-999` for "no counterparty", but Supabase `customer` has no `-999` row (import-sqlite remaps cust_id), so inserting it raises `acc_book_cust_id_fkey`. `api/acc-book/anonymous-customer.ts` (`needsAnonymousResolve`/`resolveAnonymousCustId`) resolves `-999/0/null` to the shared 익명 정본's real cust_id server-side on insert/update/batch_insert. (Read-side `org-metrics.ts` still compares against `-999` — a dead condition tracked in TODOS.)
- Migrations live in `app/scripts/0NN_*.sql` and are applied **manually via the Supabase SQL editor** (DDL cannot run through the service-role REST client). Latest is `019` (`012` = `delete_org_data` RPC, `013` = `finalize_settlement` RPC, `014` = `acc_book`/`acc_book_bak`에 `acc_time CHAR(4)` 컬럼 추가 — **`019`로 폐기됨, 적용 금지**; `015` = `acc_book`에 `claim_amt` 컬럼 추가 — 보전 최종청구액; `016`/`017` = 과목 배분 추적 컬럼·영구화; `019` = `acc_book`/`acc_book_bak`에서 `acc_time` 컬럼 DROP — 시분초 미사용(`acc-time-removal`). **코드에서 acc_time 제거 배포 후 적용할 것**). When adding migrations that touch `acc_book`/`acc_book_bak`, audit the export-sqlite route (see SQLite gotchas below — app-only columns must be stripped).

### Source Layout (`app/src/`)

```
app/api/          → route groups: codes, customers, acc-book, organ, excel/export, system/{export-sqlite,import-sqlite,recompute-settlement,workflow-status}, address/search, evidence-file, reimbursement/claim-form/aggregate, hwpx/{generate,income-ledger}
app/dashboard/    → 27 pages: income, expense, document-register (manual entry), reports, submit, reset, backup (SQLite backup/restore), customer, customer-batch, organ, aggregate, audit, forms, settlement, estate, codes, submission-forms (선관위 제출서류 HWPX 생성), etc. Several are org-type-gated (party-summary, supporter-summary, support-detail, donors) — see Org-Type Differentiation below.
app/login/        → Supabase email/password auth
components/chat/  → ChatBubble (static FAQ browser, well-tested)
components/ui/    → shadcn/ui primitives (Button, Card, Dialog, Table, etc.)
hooks/            → use-code-values, use-donation-limit, use-sort, use-undo, use-hwpx-prefill
lib/supabase/     → client.ts (browser), server.ts (SSR), middleware.ts (session)
lib/chat/         → faq-data.ts (static FAQ items only)
lib/accounting/   → Business logic: settlement-calc (balances), funding-source, submission-forms, + PFund2 SQLite compat (organ-pair, pfund2-constants, parity-errors, import-helpers)
lib/expense-types.ts → Shared 3-level expense type data (선거비용/선거비용외) + PAY_METHODS
lib/wizard-mappings.ts → Wizard card definitions + code auto-mapping
lib/excel-template/ → Excel 산출물 빌더(ExcelJS 직접): burden-cost-form(부담비용), reimbursement-claim-form(보전청구서), income-expense-book(수입·지출부 13컬럼), report-combos(reports 페이지 계정×과목 조합). (구 선관위 템플릿 기반 경로 `/api/excel/report`+data-query/mappings/index 등은 v0.18.0.0에서 데드코드로 제거)
lib/hwpx/         → 선관위 제출서류 HWPX 생성: generate (토큰 치환 코어 + repackageSection 재패키징 헬퍼, JSZip·STORED mimetype), escape (XML escape + 날짜 포맷), form-fields (서식 정의 + 토큰 레지스트리 + dataFill 플래그, 템플릿은 public/hwpx-templates/*.hwpx). **회계장부 데이터 채움**(서식 7): income-ledger-builder (수입행→계정·과목 그룹·누계·잔액, 순수) + owpml-table (form-7-fill.hwpx 의 GROUP/ROW 마커 기반 표·행 동적 복제, 순수) → api/hwpx/income-ledger. 표는 문단(`<hp:p><hp:run>`) 안에 내장되므로 마커 경계·태그 균형 주의(특히 텍스트 셀 토큰화 시 `</hp:run>` 이중 닫힘). **회계보고서 데이터 채움**(서식 22-1·22-2·22-3·22-4, dataFill="accounting-report") → api/hwpx/accounting-report (formId 분기): 22-1 수입·지출보고서=report-summary-builder (자금원 구분별 수입/지출[선거비용·선거비용외] 집계, 순수) + 고정 셀 generateHwpx 치환(행 복제 없음); 22-2 선거비용 지출내역 집계표=election-expense-summary-builder (지출 중 선거비용만 자금원 4분류[후보자자산·후원회기부금·보조금·보조금외] 집계, 순수) + 고정 셀 generateHwpx 치환(15토큰: 합계/사무소/연락소계 × 5열). 22-1과 funding-source·classifyExpenseCategory SSOT 공유로 22-1 선거비용 합계 == 22-2 합계 보장(교차검증 테스트), 22-2엔 기타 열이 없어 미분류 자금원 선거비용은 보조금외에 흡수; 옵션 A(사무소 단일 집계)로 total=office·branch=0, 개별 연락소행은 수기용 빈 양식; 22-4 수입·지출부=income-ledger-builder 재사용(비고 컬럼 1열 추가 → form-7=13/22-4=14컬럼) + renderIncomeLedgerSection; 22-3 재산명세서=estate-builder (estate→구분 그룹/소계/합계, 순수; ESTATE_TYPES SSOT는 lib/accounting/estate-types) + owpml-table.renderEstateSection (단일 표 내 명세행 복제·c0[구분명] rowSpan 동적·2번째+행 c0 제거·표 전체 rowAddr 재계산). 템플릿 제작 스크립트는 app/scripts/make-form-*-fill.py. 새 dataFill 서식 추가 시 next.config outputFileTracingIncludes 와 form-fields.test 의 dataFill 예외 처리 확인.
stores/           → auth.ts (user + org state), help-mode.ts
types/database.ts → Supabase-generated types for pfam schema
```

### Database Schema (`pfam`)

Key tables: `organ` (organizations), `customer` (counterparties), `acc_book` (accounting ledger), `codeset`/`codevalue` (reference codes), `acc_rel` (code-org mapping), `estate` (assets), `opinion` (audit). RPC functions: `calculate_balance`, `export_org_data`, `delete_org_data` (atomic org cascade-delete, see below), `finalize_settlement` (`scripts/013`, transactional settlement lock — EXECUTE granted to `authenticated` only).

Organization types: party, lawmaker, candidate, supporter — determined by `orgSecCd` code.

### Org-Type Differentiation

The dashboard adapts to the selected org's `orgType`. `components/dashboard/QuickActions.tsx` defines `COMMON_ACTIONS` plus per-orgType `ORG_SPECIFIC_ACTIONS`; sidebar nav and some pages are org-type-specific (`party-summary`, `supporter-summary`, `support-detail`, `donors`). When adding an org-specific quick action, the `href` **must** match an existing `app/dashboard/<route>/page.tsx` — mismatches 404 (regression-guarded by `QuickActions.test.tsx`).

**FK cascade gotcha**: Most `org_id` foreign keys have **no `ON DELETE CASCADE`** (exceptions: `evidence_file.acc_book_id → acc_book`, `user_organ.user_id → auth.users`). Deleting an org therefore goes through the `delete_org_data(p_org_id)` RPC (`scripts/012`), which removes child rows in reverse-FK order inside one transaction. `customer.org_id` is nullable (added in `scripts/011` for org isolation) — shared/anonymous customers (`org_id IS NULL`) are preserved on delete. Evidence Storage files are removed by the API *before* the RPC (Postgres can't delete Storage objects).

### API Pattern

Server-side API routes use `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS, with fallback to anon key:
```typescript
createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
```

POST routes use **action-based dispatch** — a single route handles multiple operations:
```typescript
// POST /api/acc-book
{ action: "insert" | "update" | "delete" | "backup" | "batch_receipt" | "batch_insert", ...payload }
```
For batch operations, internal metadata fields are prefixed with `_` (e.g., `_provider`, `_addr`) — the API processes them (customer matching/creation) then strips all `_`-prefixed keys before DB insert.

### Code Values System

The `useCodeValues()` hook (via `useSyncExternalStore`) provides code lookups fetched once from `/api/codes`:
- `getName(cvId)` — resolve code ID to display name
- `getAccounts(orgSecCd, incmSecCd)` — valid accounts for org type + income/expense
- `getItems(orgSecCd, incmSecCd, accSecCd)` — valid subjects for a given account
- Hierarchical validation chain: `orgSecCd → incmSecCd → accSecCd → itemSecCd → expSecCd` (driven by `acc_rel` table)

### Account/Item Code Structure (acc_sec_cd / item_sec_cd)

`acc_book.acc_sec_cd` (계정) and `item_sec_cd` (과목) are both `codevalue.cv_id`. Their numeric ranges differ by org family and **encode meaning** — much business logic (funding-source, settlement, receipt numbering, donation limits) branches on these literal codes, so they are effectively constants:

- **후보자 계정** (`acc_sec_cd`, codeset `cs_id=10`): `82`=보조금, `83`=보조금외지원금, `84`=후보자등자산, `85`=후원회기부금 (these 4 are the funding sources — see `funding-source.ts FUNDING_SOURCE_BY_ACC_SEC_CD`). 후보자 **과목** (`cs_id=11`): `86`=선거비용, `87`=선거비용외정치자금.
- **후원회 계정** (`acc_sec_cd`, `cs_id=1`): `1`=수입, `2`=지출 — i.e. the 후원회 `acc_sec_cd` **directly encodes income(1) vs expense(2)**, unlike 후보자 where income/expense both use 82–85 and are distinguished by `incm_sec_cd`. 후원회 **과목** (`cs_id=12`): 수입 `94`=기명후원금/`95`=익명후원금/`96`=그밖의수입, 지출 `97`=기부금/`98`=후원금모금경비/`99`=인건비_기본경비/`100`=사무소설치운영비_기본경비/`101`=그밖의경비.
- Official donation 과목 codes: `94`=기명/`95`=익명/`96`=그밖의수입 (do NOT hardcode the inverse — a real bug had 95=기명 swapped; classify by 과목명 via `getName`, not cv_id).

### Receipt Number (영수증번호) Channel

`acc_book` carries two receipt fields: `rcp_no` (display string, e.g. `자(비)-1`) and `rcp_no2` (integer, for sort/dedup/maxRcpNo). The channel for both is the pure SSOT `lib/accounting/receipt-no.ts`, shared by **two consumers**: `api/acc-book` `batch_receipt` (「영수증 일괄생성」, via `assignReceiptNumbers`) and `api/system/export-sqlite` (via `fillExportReceiptNumbers`, fills missing `rcp_yn='Y'` rows at export so the Windows program doesn't fall back to a single bucket).

The display format branches **by `acc_sec_cd` alone** (no `incm_sec_cd` needed) in `formatKey`:
- 후보 자금원 (82–85): 선거비용 → `{계정약자}(비)-n` (자/후/보/외); 선거비용외 → `{계정약자}-n` (no parenthetical).
- 후원회 지출 (`acc_sec_cd===2`): `{과목약자}-n` (기/모/인/사/그 — `supporterExpenseAbbr`: 후원금모금경비→모, else first char).
- 후원회 수입 (`acc_sec_cd===1`)·기타: legacy fallback `{계정약자}({과목약자})-n`.

Combination sequence (`{prefix}-n`) continues from the existing max per prefix; existing `rcp_no` is preserved and historical values are **not** retroactively re-numbered. **The two consumers scope the sequence differently** (`receipt-no-income-expense-dedup`, v0.20.1.0):
- **`batch_receipt`** (`assignReceiptNumbers`, input-time): per-key, **per-`incm_sec_cd`** scope — income and expense numbered independently (matches the separate 수입/지출 일괄생성 pages).
- **`fillExportReceiptNumbers`** (report/export-time, used by export-sqlite AND the 재조정 데이터 viewer): **unified income+expense single scope**, keyed by each row's *current* (계정×과목) `formatKey`. Assigns to `rcp_yn='Y'` rows that are either missing a number **or** whose prefix no longer matches their account (Pass1 재배분 이동조각이 원본 접두사를 물려받아 stale). Prefix-matching manual numbers are preserved. This dedups income↔expense collisions (income rows often lack a source `rcp_no` → would otherwise restart each prefix at 1 and clash with manual expense numbers) and re-homes moved fragments to their new 자금원 prefix. Stale detection assumes `formatKey` is stable over time. (`parseRcpNo` is the shared prefix/seq parser.)

### Excel Export Patterns

Two distinct export systems:
1. **Individual exports** (`/api/excel/export`) — generates 수입부/지출부 (11-column official 선관위 format) from DB data
2. **Batch report output** (`reports/page.tsx` client-side) — generates multi-sheet workbook with covers, 정치자금 수입·지출부 (13-column combined income+expense format), grouped by account+subject combo

Excel generation uses ExcelJS directly (not templates) to match official election commission form layouts. Each account/subject combination produces one sheet with both income and expense records sorted by date.

### SQLite Export/Import (선관위 Fund_Data round-trip)

`/api/system/export-sqlite` (자료백업) builds a SQLite `.db` matching the official 선관위 Windows program's schema exactly (`Fund_Master`/`Fund_Data_1` 후보자 / `Fund_Data_2` 후원회), so users can load it into that program. `/api/system/import-sqlite` ingests the same format. The DDL in the export route **must mirror the official column types** — they are stricter than our Supabase schema and the Windows program rejects mismatches on load.

**Critical gotcha (caused a real bug)**: the official `ACC_BOOK.ACC_INS_TYPE` is `CHAR(2)`, but the app stores 3-char 지출방법 codes (PAY_METHODS: "118", "585", ...) in `acc_ins_type`. Exporting a 3-char value into `CHAR(2)` makes the program **silently drop the entire 지출(expense) ledger** while income loads fine. The official format instead carries the pay-method code in `EXP_TYPE_CD` (integer) with `ACC_INS_TYPE` empty. `normalizeOfficialExpenseRow` in the export route fixes this per-row before insert (moves the code to `EXP_TYPE_CD`, clears `ACC_INS_TYPE`). **Second gotcha (same class)**: the export's `fetchTable` does `SELECT *`, so any Supabase `acc_book` column *not* in the official PFund2 DDL leaks into `insertRows`, which auto-uppercases unknown keys (`toUpper` fallback) into a non-existent column → `table ACC_BOOK has no column named X` aborts the whole export. `acc_time` (added in `scripts/014`, app-only HHmm 거래 시각) hit exactly this — `stripAppOnlyAccBookColumns` removes it before insert. (시분초 미사용 결정으로 `019`에서 acc_time 컬럼 DROP 예정 — 그 후 SELECT \*에 안 새므로 strip의 acc_time 항목은 no-op이나 방어용으로 유지.) When adding migrations that touch `acc_book`/`acc_book_bak`, audit the export-sqlite route. When adding fields to the SQLite export, watch for similar app↔official format divergences. **Third gotcha (customer FK orphan, `data1`/`data2` modes)**: those split-file modes used to filter `CUSTOMER` by `org_id === targetExportOrgId`, but `acc_book.cust_id` references customers across org boundaries — `org_id IS NULL` (shared) and cross-org rows. Org-filtering dropped those referenced customers, leaving FK-orphan `ACC_BOOK` rows (sql.js doesn't enforce FK, so export succeeds). The Windows program then **drops orphan rows when joining customer for the 수입·지출부**, so income/expense vanish *per account* (whichever account's counterparty was orphaned). Fix: `selectReferencedCustomers(remappedCustomer, finalAccBook, finalAccBookBak)` selects customers by the cust_ids the exported transactions actually reference (full/master keep all). When changing CUSTOMER/ACC_BOOK export selection, always verify 0 FK orphans in the output `.db`.

### Evidence File Storage

Uploaded receipt/contract images are stored in Supabase Storage (`evidence` bucket) and linked to `acc_book` entries via the `evidence_file` table:
- `/api/evidence-file` — upload to Supabase Storage + metadata to `pfam.evidence_file`
- Receipt/contract content is entered manually by users (no OCR/AI extraction).
- Max file size: 10MB. Schema: `scripts/007_evidence_file_table.sql`

### PFund2 SQLite Compatibility (백업/복구 + 선관위 호환)

`/dashboard/backup` exports/imports an org's data as a SQLite `.db` matching the official 선관위 **PFund2** program file format. The DDL and conventions live in `lib/accounting/pfund2-constants.ts` and `organ-pair.ts`.

- **Export** (`GET /api/system/export-sqlite`) builds the `.db` in memory via sql.js. The `mode` param maps 1:1 to PFund2 files:
  - `full` (default) — combined (ORGAN pair + all transactions + reference)
  - `master` — Fund_Master.db (ORGAN pair + reference + CUSTOMER, 0 transactions)
  - `data1` — Fund_Data_1.db (candidate org + only its transactions/customers)
  - `data2` — Fund_Data_2.db (supporter org + only its transactions/customers)
- **Import** (`POST /api/system/import-sqlite`) restores a `.db` into the selected org. `conflictPolicy`: `overwrite|skip|merge`; `dryRun=true` returns a preview (row counts, organ candidates) with no writes. Write helpers (`bulkInsert`/`bulkUpsert`/`parseConflictPolicy`) are extracted to `import-helpers.ts` (client injected → unit-testable).
- **organ-pair.ts** maps Supabase `org_id` ↔ PFund2 export `ORG_ID` (1=candidate, 2=supporter) via candidate↔supporter pairing. `remapOrgId` rewrites org-dependent rows for export.
- **PFund2 CUSTOMER has no ORG_ID column** — so export strips `customer.org_id` and, for `data1`/`data2`, filters customers to the target org. The standard anonymous customer (`CUST_ID=-999`) is guaranteed by `PFUND2_ENSURE_ANONYMOUS_CUSTOMER_SQL`.
- **parity-errors.ts** defines structured PFund2-compat error codes (missing credentials, invalid SQLite header, conflict policy, etc.).

### Expense Type Architecture

3-level expense type hierarchy shared across expense page, document-register, and wizard:
- `lib/expense-types.ts` — single source of truth (ELECTION_EXP_TYPES, NON_ELECTION_EXP_TYPES)
- `detectItemCategory(expGroup1)` — determines 선거비용 vs 선거비용외 from expense type name
- Never duplicate this data in page files — always import from the shared module

### Auth Flow

Login → Supabase Auth → Select organization (multi-org via `user_organ` table) → Zustand `auth` store persists `{ user, orgId, orgSecCd, orgName, orgType, acctName }` to localStorage.

### Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL        # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY   # Public anon key
SUPABASE_SERVICE_ROLE_KEY       # Server-only, bypasses RLS (required for API routes)
EPOST_API_KEY                   # 우정사업본부 address search API
```

`.env.local` holds these (gitignored via `.env*.local`). Schema changes require running the migration SQL in Supabase manually before deploying code that depends on it.

### Deployment

Merging to `main` auto-deploys to **Vercel production** (`political-fund-accounting-managemen.vercel.app`). PR checks: Vercel preview build (gate), GitGuardian, CodeRabbit (advisory). There is a single Supabase project — no separate staging/test DB, so schema migrations touch production directly (design migrations to be additive/reversible).

### Reference Documents

- `PROGRAM_DESIGN.md` — Comprehensive 4700-line design doc (schema, ERD, business rules, implementation phases)
- `FORM_TEMPLATES.md` — Form layout specifications
- `RAG/` — 80+ markdown files extracted from election commission PDFs (선거비용보전안내서, 정치관계법 사례집, 회계관리 매뉴얼)
- `docs/` — PDCA documentation (plan → design → analysis) per feature

## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
