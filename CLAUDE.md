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

### Source Layout (`app/src/`)

```
app/api/          → 8 API route groups (chat, codes, customers, acc-book, excel/*, system/*, address/search)
app/dashboard/    → 27 pages: income, expense, receipt, customer, reports, backup, settlement, etc.
app/login/        → Supabase email/password auth
components/chat/  → ChatBubble (FAQ browser + AI chat, well-tested)
components/ui/    → shadcn/ui primitives (Button, Card, Dialog, Table, etc.)
hooks/            → use-chat, use-code-values, use-donation-limit, use-sort, use-undo
lib/supabase/     → client.ts (browser), server.ts (SSR), middleware.ts (session)
lib/chat/         → FAQ data, election cost guide, sample accounting data
lib/accounting/   → Business logic (balance calculation, validation)
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

The chat API (`/api/chat`) streams responses via SSE using Gemini 2.5 Flash with context from the user's org data and keyword-extracted guide sections.

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
