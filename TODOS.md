# TODOS

## P1 - Security

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

### ~~Optimize expense-page summary query (RPC)~~ — 해소(acc-book GET RPC 완료, expense는 N/A)
- **결론:** acc-book GET 요약은 `org_income_expense_totals` RPC로 이전 완료(P-3). expense 페이지는 **RPC 미적용이 정답** — `allData`가 요약뿐 아니라 자금원 충당 패널(buildAdjustedAccBook)에도 필수라 전건 조회가 불가피, RPC 추가는 왕복만 늘림(2026-07-04 재검토).

## P3 - Quality

### 익명 유니크 인덱스 적용 (scripts/024) — ⚠️ Supabase 수동 적용만 남음
- **상태:** 데이터 정리 **실행 완료**(2026-07-04). 공유 익명 중복 65·117·244를 정본 39로 이관·삭제(117 참조 5건→39). 이제 공유 익명 1행(39)만 존재. 남은 것은 **`app/scripts/024_anon_customer_unique.sql`을 Supabase SQL 에디터에 적용**(부분 유니크 인덱스로 재중복 차단)뿐.
- **B2(집계 왜곡)·B3(데이터)** 모두 해소됨 — 아래 Completed 참조.

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

### program-wide-review 후속(followup) — S4·reports FR-07·P-4 (2026-07-04)
- **S4:** import-sqlite overwrite 전역삭제 → 대상 org 스코프화(customer_addr·accbooksend는 참조 id 청크 삭제, 공유 익명 유지). 다기관 타 org 데이터 소실 해소.
- **reports FR-07:** 배치 Excel 생성 전 주기 외 거래 confirm 경고.
- **P-4:** expense 일괄삭제 bak 배열 insert, reimbursement handleSave 변경분만 UPDATE.
- **잔여(가치 낮음):** HWPX FR-07(중복), income 일괄삭제 N+1(API 경유), D-5/D-6/X3/X4 정리.

### program-wide-review B3 — 익명 중복 데이터 정리 실행 (2026-07-04, ⚠️ scripts/024 적용만 남음)
- **실행 완료:** `cleanup-anon-customers.mjs --confirm` — 공유 익명 중복 65·117·244의 acc_book 참조(117→5건)를 정본 39로 이관 후 삭제. 백업 `app/backups/anon-cleanup-*.json`. org 10 전용 익명 183 미접촉.
- **검증:** diagnose 재실행 → 공유 익명 1행(39, 참조 5건)만 존재.
- **남은 것:** `app/scripts/024_anon_customer_unique.sql` Supabase 적용(재중복 차단 인덱스).

### program-wide-review Phase E — FR-07 주기 외 거래 경고 (2026-07-04)
- **SSOT:** `acc-period.ts countOutOfPeriodRows` — 산출물 생성 시 org 회계기간 밖 거래 건수·샘플(순수). +테스트 5.
- **적용:** export-sqlite(응답 헤더 `X-Out-Of-Period`)·backup 페이지(다운로드 후 alert)·결산 handleSettle(alert). 차단 아닌 경고(은폐 금지).
- **잔여:** reports 배치 Excel·HWPX 서식(income-ledger/accounting-report) 생성 경로는 후속.

### program-wide-review P-2/P-3 — 성능 리팩터 (2026-07-04, P-3은 scripts/025 적용 시 활성)
- **P-2 batch_insert N+1:** 행당 customer 조회+생성+insert(3N 왕복) → customer 일괄 조회(`in`)+신규 일괄 생성+acc_book 500행 청크 배열 insert(~2+N/500). org 격리·매칭 규칙 불변. +스모크 테스트.
- **P-3 요약 RPC:** acc-book GET 이 요약합계용 전건 재fetch → `org_income_expense_totals` RPC(SUM GROUP BY). RPC 미적용 시 전건 폴백(무해). expense 페이지 요약은 잔여(위 P3).

### program-wide-review BX4 — import 중복적재 (2026-07-04)
- **문제:** import-sqlite skip/merge 가 identity PK strip 후 fresh insert 라 복구할 때마다 거래·거래처 전량 복제(안내문과 반대).
- **수정:** `replaceOrgData=(conflictPolicy==="overwrite")` 로 거래성 STEP 4~9(CUSTOMER/ACC_BOOK/ACC_BOOK_BAK/ACCBOOKSEND/ESTATE/CUSTOMER_ADDR) 가드 — overwrite 만 교체 import, skip/merge 는 건너뛰고 기존 유지. 참조·기관·의견은 자연 PK upsert 라 정책 무관.
- **UX:** backup 페이지 conflictPolicy 라벨 정정("거래 유지(참조·기관정보만 갱신)"), skip report 표기.
- **잔여:** S4(overwrite 의 customer/accbooksend 전역삭제 org 스코프화), route 통합 테스트(sql.js 모킹 부담).

### program-wide-review BX7/BX8 — 결산확정 스키마 (2026-07-04, ⚠️ scripts/023 수동 적용 필요)
- **BX8:** `finalize_settlement` RPC가 organ 회계기간(주기 판정 SSOT)을 덮어쓰던 것 제거 — 결산기간은 opinion 에만 저장.
- **BX7:** `opinion.settled_at` 확정 플래그 추가. acc-book insert/update가 확정 결산기간 내면 `SETTLED_PERIOD` 경고(postAccBook confirm→`_allowSettled`). expense는 BX1로 API 경유라 자동 적용.
- **부수:** export-sqlite `APP_ONLY_OPINION_COLUMNS`에 `settled_at` 등록, types opinion Row 갱신, settlement 화면 확정상태 로드. +테스트 4.
- **적용 안내:** `scripts/023` 미적용 시에도 코드 안전(경고 no-op), 적용 후 활성화.

### program-wide-review Phase D — 효율화·정리 1차분 (2026-07-04)
- **P-1 무제한 fetch truncation:** export `fetchTable` + 산출물·결산 6경로에 `.limit(100000)` — 기본 max-rows(≈1000)에 잘려 공식 .db·HWPX·결산 행이 유실되던 위험 차단.
- **D-1 데드 복제본 삭제:** `api/excel/export/route 2.ts`, `dashboard/organ/page 2.tsx`.
- **D-2 resolution 영수증 표기 버그:** 로컬 `buildReceiptLabel`(접두사·접미사가 SSOT와 반대)을 제거하고 저장된 `rcp_no` 직접 표기.
- **D-3 resolution PAY_METHODS 중복:** `expense-types` SSOT import로 교체.
- **X6 주석 stale:** `ledger-allocation.ts` 헤더를 실제 Pass0→L→1→2→3→4로 갱신.
- **잔여(별도):** P-2(batch_insert 3N 리팩터, 테스트 선행 필요), P-3(요약 RPC), D-4~D-6·X3·X4·R2(정리).

### program-wide-review Phase C — 버그·데이터 수정 (2026-07-03)
- **BX5 reset 가짜 비번 게이트:** `reset/page.tsx` — `prompt` 비밀번호를 검증하지 않던 것을 `supabase.auth.signInWithPassword`로 재인증 후에만 삭제. (Storage 고아·bak 잔존은 진단 BX5 잔여로 후속)
- **BX6 audit 로드-시-덮어쓰기:** `audit/page.tsx` — 열람만으로 opinion을 upsert하던 recompute 호출에 `dryRun:true` 추가(표시 전용, DB 미변경).
- **B2 org-metrics 익명 dead 조건:** `org-metrics.ts`/`use-dashboard-data.ts` — `cust_id===-999`(항상 false) 대신 `OrgMetricsContext.anonymousCustIds`(name='익명' 기반) 판정. 익명 기부 누락·기부자 수 과대·customerCount 과대 동시 해소. +테스트 2.
- **B1 FormInputPanel prefill race:** `components/submission-forms/FormInputPanel.tsx` — dirty 필드 추적으로 organ fetch resolve 시 입력값 소실 방지(서식 전환만 전체 리셋). (경로는 `components/hwpx/`→`submission-forms/`로 이동됨)
- **BX3 옛 주기 잠금 우회:** income·expense 삭제/영수증 핸들러에 `cycleLock.locked` 가드 추가.

### service_role API 라우트 IDOR 가드 (org 소속검증)
- **What:** service_role(RLS 우회) API 라우트에 `createSupabaseServer()` → `auth.getUser()`(401) → `user_organ` 소속검증(403) 표준 가드를 적용. 공통 헬퍼 `lib/api/require-org-membership.ts`(`requireOrgMembership`)로 추출.
- **적용 라우트(9):** `acc-book`(GET/POST 전 액션 + delete를 검증 org로 스코프), `customers`(GET orgId 필수화 + search-only/전체반환 PII 유출 분기 제거, POST는 cust_id→org 역조회 가드, 공유 익명 org_id NULL 수정/삭제 거부), `excel/export`, `system/export-sqlite`(자격증명 노출 차단), `system/import-sqlite`(overwrite 데이터파괴 차단), `system/recompute-settlement`, `reimbursement/claim-form/aggregate`, `evidence-file`(GET/POST/DELETE), `system/workflow-status`(존재확인→소속검증 교체).
- **테스트:** `require-org-membership.test.ts`(12), `acc-book/route.authz.test.ts`(10), `evidence-file/route.test.ts` 인가 케이스(4) 추가. 전체 926 통과·빌드 성공.
- **남은 것:** `/api/hwpx/generate`(아래 P1 — org 데이터 접근 없음, 로그인 게이트만 필요) · `/api/address/search`(EPOST 키, 로그인 게이트). 미들웨어 `/api` 공개 정책은 유지(라우트별 자체 가드 방식).
- **Completed:** 2026-07-03 (program-wide-review Phase B, branch fix/api-org-membership-guard)

### Set up test framework (vitest + testing-library)
- **What:** Add vitest, @testing-library/react, and happy-dom to the project. Write initial tests for core components (tfoot summaries, auth flow, API route).
- **Completed:** v0.1.1.0 (2026-04-05) — vitest + @testing-library/react + happy-dom installed. 19 tests for ChatBubble component. `npm run test` runs vitest.
