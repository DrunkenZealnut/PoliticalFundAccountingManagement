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
- All dates stored as `YYYYMMDD` strings (not DATE type). UI uses `YYYY-MM-DD`, convert on save/display.
- `customer.org_id` (added via `scripts/011`) scopes counterparties per organization — a same-name counterparty in two orgs is two rows. The anonymous customer (`name='익명'`) is shared with `org_id` NULL. Every customer read/write/match path must filter/set `org_id` (customers API, customer + customer-batch pages, acc-book batch matching, import/export-sqlite).
- Migrations live in `app/scripts/0NN_*.sql` and are applied **manually via the Supabase SQL editor** (DDL cannot run through the service-role REST client). Latest is `014` (`012` = `delete_org_data` RPC, `013` = `finalize_settlement` RPC, `014` = `acc_book`/`acc_book_bak`에 `acc_time CHAR(4)` 컬럼 추가 — 거래 시각 분 단위, NULL 허용).

### Source Layout (`app/src/`)

```
app/api/          → route groups: codes, customers, acc-book, organ, excel/{export,report}, system/{export-sqlite,import-sqlite,recompute-settlement,workflow-status}, address/search, evidence-file, reimbursement/claim-form/aggregate, hwpx/{generate,income-ledger}
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
lib/excel-template/ → Excel report generation with data-query
lib/hwpx/         → 선관위 제출서류 HWPX 생성: generate (토큰 치환 코어 + repackageSection 재패키징 헬퍼, JSZip·STORED mimetype), escape (XML escape + 날짜 포맷), form-fields (서식 정의 + 토큰 레지스트리 + dataFill 플래그, 템플릿은 public/hwpx-templates/*.hwpx). **회계장부 데이터 채움**(서식 7): income-ledger-builder (수입행→계정·과목 그룹·누계·잔액, 순수) + owpml-table (form-7-fill.hwpx 의 GROUP/ROW 마커 기반 표·행 동적 복제, 순수) → api/hwpx/income-ledger. 표는 문단(`<hp:p><hp:run>`) 안에 내장되므로 마커 경계·태그 균형 주의(특히 텍스트 셀 토큰화 시 `</hp:run>` 이중 닫힘). **회계보고서 데이터 채움**(서식 22-1·22-3·22-4, dataFill="accounting-report") → api/hwpx/accounting-report (formId 분기): 22-1 수입·지출보고서=report-summary-builder (자금원 구분별 수입/지출[선거비용·선거비용외] 집계, 순수) + 고정 셀 generateHwpx 치환(행 복제 없음); 22-4 수입·지출부=income-ledger-builder 재사용(비고 컬럼 1열 추가 → form-7=13/22-4=14컬럼) + renderIncomeLedgerSection; 22-3 재산명세서=estate-builder (estate→구분 그룹/소계/합계, 순수; ESTATE_TYPES SSOT는 lib/accounting/estate-types) + owpml-table.renderEstateSection (단일 표 내 명세행 복제·c0[구분명] rowSpan 동적·2번째+행 c0 제거·표 전체 rowAddr 재계산). 22-2(선거비용 집계표)는 미구현. 템플릿 제작 스크립트는 app/scripts/make-form-*-fill.py. 새 dataFill 서식 추가 시 next.config outputFileTracingIncludes 와 form-fields.test 의 dataFill 예외 처리 확인.
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

### Excel Export Patterns

Two distinct export systems:
1. **Individual exports** (`/api/excel/export`) — generates 수입부/지출부 (11-column official 선관위 format) from DB data
2. **Batch report output** (`reports/page.tsx` client-side) — generates multi-sheet workbook with covers, 정치자금 수입·지출부 (13-column combined income+expense format), grouped by account+subject combo

Excel generation uses ExcelJS directly (not templates) to match official election commission form layouts. Each account/subject combination produces one sheet with both income and expense records sorted by date.

### SQLite Export/Import (선관위 Fund_Data round-trip)

`/api/system/export-sqlite` (자료백업) builds a SQLite `.db` matching the official 선관위 Windows program's schema exactly (`Fund_Master`/`Fund_Data_1` 후보자 / `Fund_Data_2` 후원회), so users can load it into that program. `/api/system/import-sqlite` ingests the same format. The DDL in the export route **must mirror the official column types** — they are stricter than our Supabase schema and the Windows program rejects mismatches on load.

**Critical gotcha (caused a real bug)**: the official `ACC_BOOK.ACC_INS_TYPE` is `CHAR(2)`, but the app stores 3-char 지출방법 codes (PAY_METHODS: "118", "585", ...) in `acc_ins_type`. Exporting a 3-char value into `CHAR(2)` makes the program **silently drop the entire 지출(expense) ledger** while income loads fine. The official format instead carries the pay-method code in `EXP_TYPE_CD` (integer) with `ACC_INS_TYPE` empty. `normalizeOfficialExpenseRow` in the export route fixes this per-row before insert (moves the code to `EXP_TYPE_CD`, clears `ACC_INS_TYPE`). When adding fields to the SQLite export, watch for similar app↔official format divergences.

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
