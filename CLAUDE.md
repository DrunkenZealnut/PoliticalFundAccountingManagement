# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

정치자금 회계관리 시스템 — a political fund accounting management web app for Korean election campaigns. Manages income/expense ledgers, customer records, donation limits, Excel/SQLite I/O, and provides an AI chatbot for election cost guidance.

## Commands

All commands run from the `app/` directory:

```bash
cd app
npm run dev          # Dev server on port 3001
npm run build        # Production build
npm run lint         # ESLint (v9 flat config)
npm run test         # Vitest run (all tests)
npm run test:watch   # Vitest watch mode
```

Run a single test file:
```bash
cd app && npx vitest run src/components/chat/ChatBubble.test.tsx
```

## Architecture

### Tech Stack
- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript 5
- **Database**: Supabase PostgreSQL with custom `pfam` schema and RLS
- **AI Chat**: Google Generative AI (Gemini 2.5 Flash) with keyword-based RAG
- **State**: Zustand (auth store persisted to localStorage)
- **UI**: shadcn/ui + Tailwind CSS v4 + Recharts
- **Data I/O**: ExcelJS (xlsx), sql.js (SQLite WASM)
- **Testing**: Vitest + React Testing Library (happy-dom)

### Next.js 16 Warning
This uses Next.js 16 which has breaking changes from training data. Always read `node_modules/next/dist/docs/` before writing Next.js-specific code. See `app/AGENTS.md`.

### DB Schema Gotcha
- `acc_ins_type` column is `VARCHAR(5)` (was CHAR(2), widened via `scripts/008`). PAY_METHODS codes are 3 chars ("118", "583").
- All dates stored as `YYYYMMDD` strings (not DATE type). UI uses `YYYY-MM-DD`, convert on save/display.

### Source Layout (`app/src/`)

```
app/api/          → 10 API route groups (chat, codes, customers, acc-book, excel/*, system/*, address/search, receipt-scan, evidence-file)
app/dashboard/    → 28 pages including wizard (beginner), document-register (OCR), income, expense, reports, etc.
app/login/        → Supabase email/password auth
components/chat/  → ChatBubble (FAQ browser + AI chat, well-tested)
components/ui/    → shadcn/ui primitives (Button, Card, Dialog, Table, etc.)
hooks/            → use-chat, use-code-values, use-donation-limit, use-sort, use-undo
lib/supabase/     → client.ts (browser), server.ts (SSR), middleware.ts (session)
lib/chat/         → FAQ data, election cost guide, sample accounting data
lib/accounting/   → Business logic (balance calculation, validation)
lib/expense-types.ts → Shared 3-level expense type data (선거비용/선거비용외) + PAY_METHODS
lib/wizard-mappings.ts → Wizard card definitions + code auto-mapping
lib/excel-template/ → Excel report generation with data-query
stores/           → auth.ts (user + org state), help-mode.ts
types/database.ts → Supabase-generated types for pfam schema
```

### Database Schema (`pfam`)

Key tables: `organ` (organizations), `customer` (counterparties), `acc_book` (accounting ledger), `codeset`/`codevalue` (reference codes), `acc_rel` (code-org mapping), `estate` (assets), `opinion` (audit). RPC functions: `calculate_balance`, `export_org_data`.

Organization types: party, lawmaker, candidate, supporter — determined by `orgSecCd` code.

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

The chat API (`/api/chat`) streams responses via SSE using Gemini 2.5 Flash with context from the user's org data and keyword-extracted guide sections.

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

### Evidence File Storage

Uploaded receipt/contract images are stored in Supabase Storage (`evidence` bucket) and linked to `acc_book` entries via the `evidence_file` table:
- `/api/receipt-scan` — Gemini 2.5 Flash Vision OCR (extracts date, amount, provider, content)
- `/api/evidence-file` — upload to Supabase Storage + metadata to `pfam.evidence_file`
- Max file size: 10MB. Schema: `scripts/007_evidence_file_table.sql`

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
GOOGLE_GENERATIVE_AI_API_KEY    # Gemini API (used in /api/chat)
```

### Reference Documents

- `PROGRAM_DESIGN.md` — Comprehensive 4700-line design doc (schema, ERD, business rules, implementation phases)
- `FORM_TEMPLATES.md` — Form layout specifications
- `RAG/` — 80+ markdown files extracted from election commission PDFs (선거비용보전안내서, 정치관계법 사례집, 회계관리 매뉴얼)
- `docs/` — PDCA documentation (plan → design → analysis) per feature

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
