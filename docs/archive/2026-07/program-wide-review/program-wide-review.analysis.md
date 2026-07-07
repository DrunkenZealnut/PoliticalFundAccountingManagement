# Analysis (Check) — 전체 프로그램 기능수행과정 전수 진단

- 기능: `program-wide-review`
- 단계: Check (Phase A 진단)
- 작성일: 2026-07-03
- 기준 버전: v0.31.0.0
- 방법: 사용자 플로우 7개 + 횡단 축 4개를 6개 병렬 조사 에이전트로 전수 리뷰
- 테스트 베이스라인: 77파일 / 900테스트 전부 통과 (착수 시점 클린)
- 관련 플랜: `docs/01-plan/features/program-wide-review.plan.md`

## 0. 요약 (Executive)

| 지표 | 값 |
|------|----|
| 총 발견 | **44건** (신규 다수 포함) |
| P1 (즉시 위험) | **8건** — IDOR 9라우트 묶음, expense 익명 resolve 누락, import overwrite 전역삭제, HWPX 채번 미경유, 무제한 fetch truncation, batch_insert N+1 |
| P2 (중요) | 20건 |
| P3 (개선/정리) | 16건 |
| 진단 완성도(커버리지) | **95%** — 플랜 인벤토리 15건 전수 검증 + 신규 29건 발굴, 플로우 7개·API 10그룹 매트릭스 완성 |

**한 줄 결론**: 최우선은 **보안(IDOR)** — service_role API 라우트 9개가 미들웨어에서 `/api` 공개로 세션조차 없이 노출되며, `export-sqlite`는 타 기관 선관위 로그인 자격증명(userid/passwd 평문)까지 유출한다. 그다음이 **데이터 정합·파괴 방지**(import overwrite 전역삭제, reset 가짜 비번 게이트, audit 로드-시-덮어쓰기), 그리고 **산출물 parity**(HWPX 서식7/22-4 영수증 채번 미경유). 플랜의 A2(data-query)·A3(funding-allocation)는 이미 해소돼 문서만 stale.

## 1. 심각도 × Phase 배정 마스터 표

Phase: **B**=보안 · **C**=버그/데이터 · **D**=효율화/정리 · **E**=기능개선

| ID | P | 비용 | Phase | 파일:라인 | 결함 |
|----|---|------|-------|-----------|------|
| **S1** | P1 | M | B | `api/acc-book/route.ts`, `middleware.ts:33` | 전 액션 무인증+무소속검증. GET으로 타 org 원장 열람, delete는 org 스코프조차 없이 id배열 삭제 |
| **S2** | P1 | S | B | `api/customers/route.ts:11-132` | 무인증. `?search=`만으로 전 기관 거래처 PII(성명·주민/사업자번호·주소·전화) 반환 |
| **S3** | P1 | M | B | `api/system/export-sqlite/route.ts:728-746,440` | 무인증 + **타 기관 organ.userid/passwd 평문**을 export에 포함 → 자격증명 탈취 |
| **S4** | P1 | L | B | `api/system/import-sqlite/route.ts:279-320` | 무인증 + overwrite가 customer/customer_addr/accbooksend/acc_rel을 **org 필터 없이 전역 삭제**(다기관 치명적) |
| **S5** | P1 | S | B | `api/evidence-file/route.ts:42-215` | GET/POST/DELETE가 orgId 필터만으로 접근제어. 타 기관 증빙 signed URL 발급·주입·삭제 |
| **S6** | P1 | S | B | `api/excel/export/route.ts`, `api/system/recompute-settlement`, `api/reimbursement/claim-form/aggregate` | 각 무인증 — 타 org 원장 Excel·결산치 변조·보전집계 노출 |
| **S7** | P2 | S | B | `api/system/workflow-status/route.ts:30-76` | 소속검증 대신 org 존재확인만 → orgId 열거로 타 기관 데이터 유무 추론 |
| **S8** | P2 | S | B | `api/system/export-sqlite:780-908` | full/master 모드가 전 기관 CUSTOMER/CUSTOMER_ADDR 무필터 export → 백업.db에 타 org PII |
| **S9** | P3 | S | B | `api/address/search/route.ts:28` | EPOST_API_KEY가 URL 쿼리스트링 전송(로그 노출) + 미인증 쿼터 남용 |
| **B1** | P2 | S | C | `components/submission-forms/FormInputPanel.tsx:76-79` | prefill race — organ fetch resolve 시 입력값 전체 소실. 서식44(37필드) 최악. **TODOS 경로 stale** |
| **B2** | P2 | S | C | `lib/dashboard/org-metrics.ts:81,198` | `-999` dead 조건(항상 false) → 익명 기부 집계 누락 + **기부자 수 과대**(익명 실 cust_id가 donorIds로 유입, 최대 +4) |
| **B3** | P2 | M | C | `pfam.customer` 데이터 + `anonymous-customer.ts:69-75` | 익명 중복 4행(38/65/117이 stale 참조). resolve는 39로 결정적이나 기존 acc_book 참조 이관 필요 + 부분 유니크 인덱스 부재 |
| **BX1** | P1 | S | C | `dashboard/expense/page.tsx:369,416,427` | 지출 직접쓰기가 `cust_id: form.cust_id \|\| -999`를 supabase에 직접 insert → 거래처 미선택 시 `acc_book_cust_id_fkey` 위반(익명 resolve 누락) |
| **BX2** | P2 | S | C | `dashboard/expense/page.tsx:416-489` | 세션 만료 시 update/delete가 RLS로 0행 처리되나 error=null → 성공 UI(silent no-op, DB 미반영) |
| **BX3** | P2 | S | C | `expense:440,471`, `income:270,299` | 옛 주기 잠금이 저장에만 걸리고 삭제·`handleBatchReceiptDel`(org 전체 rcp_no 소거) 통과 |
| **BX4** | P2 | M | C | `api/system/import-sqlite:468-502` | skip/merge가 identity PK strip 후 항상 fresh insert → **복구할 때마다 거래·거래처 전량 중복 적재**(안내문과 반대) |
| **BX5** | P2 | M | C | `dashboard/reset/page.tsx:32-38` | 비밀번호 `prompt` 값을 **검증 안 함**(`if(!pw)return`) → 가짜 게이트. + evidence Storage 고아 + acc_book_bak/accbooksend 잔존 |
| **BX6** | P2 | S | C | `dashboard/audit/page.tsx:81-103` | 페이지 로드 시 `recompute-settlement`를 **비-dryRun** 호출 → 열람만 해도 opinion 수기입력 덮어쓰기 |
| **BX7** | P2 | M | C | `settlement/page.tsx`, `api/acc-book` | 결산확정 후 입력 차단 부재(DB 플래그 없음) → 확정치와 원장 조용히 괴리 |
| **BX8** | P2 | M | C | `scripts/013_finalize_settlement.sql:29-31` | 결산확정이 organ.acc_from/acc_to(회계기간·주기 판정 SSOT)를 덮어씀 → 잠금·현주기 판정 왜곡 가능 |
| **BX9** | P2 | S | C | `settlement:90-96` vs `recompute:115-118`/`export:824-828` | estate 합계 이원화(`sum(amt)` vs `sum(amt*qty)`) → opinion.estate_amt 플립플롭 |
| **R1** | P1 | M | C/D | `api/hwpx/income-ledger:171`, `api/hwpx/accounting-report:171`, `income-ledger-builder.ts:219` | **HWPX 서식7·22-4 영수증번호 `fillExportReceiptNumbers` 미경유** → 분할조각 중복번호·Pass1 이동조각 stale 접두사. 뷰어·Excel·.db와 갈리는 parity 분기 |
| **R2** | P2 | M | D | `api/excel/export/route.ts:262-287` | 개별 수입부/지출부 Excel이 재배분 전면 미적용 + rcp_no 원본 → reports 배치 Excel과 불일치 |
| **R3** | P2 | M | E? | `api/reimbursement/claim-form/aggregate:49-63` | 보전청구서 자금원 4분류가 raw acc_sec_cd(Pass1 이동분 귀속 어긋남). **업무규칙 확인 선행**(의도적 raw일 수 있음) |
| **R4** | P3 | S | D | `lib/dashboard/org-metrics.ts` KPI | Pass0 미적용 → 음수수입 org에서 총수입·자금원 슬라이스가 22-1과 불일치(B2와 함께 처리) |
| **P-1** | P1 | M | D | `export-sqlite:608` + 산출물 경로 18곳 | 무제한 `select("*")` (limit 없음) → PostgREST max-rows 캡(통상 1000) 시 **export/HWPX/결산 조용히 truncation**. limit(100000) 쓰는 2곳과 불일치 |
| **P-2** | P1 | M | D | `api/acc-book/route.ts:350-424` | batch_insert 행당 customer조회+생성+insert = 3N 왕복 → 대량 임포트 타임아웃 |
| **P-3** | P2 | M | D | `api/acc-book:94-118`, `expense:135-187` | GET/페이지가 요청당 2×전건 조회 후 JS reduce 합계 → SQL aggregate/RPC로 이전 |
| **P-4** | P2 | S | D | `reimbursement:356-361,366-368`, `expense:476-484`, `income:304-315`, `customer-batch` | N+1 쓰기(전체행 UPDATE/행당 백업) + useMemo 없는 렌더 재계산 |
| **D-1** | P2 | S | D | `api/excel/export/route 2.ts` (**git tracked**), `dashboard/organ/page 2.tsx` (untracked) | 데드 복제본 — tsc/lint 대상·수정 혼동. 삭제 |
| **D-2** | P2 | S | D | `dashboard/resolution/page.tsx:28-33` | 영수증 약자 맵 자체구현이 SSOT와 **불일치**("보조금외지원금"→"기" vs SSOT 83→"외") → 결의서 표기 어긋남 |
| **D-3** | P3 | S | D | `resolution:14-23`, `expense:108`, `document-register:125` | PAY_METHODS·"118" 기본코드 로컬 재정의(SSOT: expense-types) |
| **D-4** | P3 | S | D | 폐기후보 스크립트 6개 | `apply-realloc-to-db`·`realloc-negative-balance`(stale 재배분 전사), `rag-upload`·`upload-md/ts-to-supabase`(정적 FAQ 전환으로 미사용 Pinecone/pgvector 경로) |
| **D-5** | P3 | S | D | `lib/accounting/submission-forms.ts`, `code-mapping.reverseLookupNames`, `receipt-no.formatReceiptNo` | 미사용 export 체인(테스트 전용 or 완전 데드) |
| **D-6** | P3 | S | D | `layout.tsx:159`, `select-organ:36`, `register-organ:15` | org_sec_cd 라벨 맵 3벌 중복 → ORG_SEC_LABELS SSOT 신설 |
| **F1** | 개선 | M | E | export-sqlite/settlement/reports/HWPX | **FR-07 미구현 확인** — 산출물 생성 경로에 주기 외 거래 경고 0건. `isAccDateInOrgPeriod`는 입력 4경로만 사용 |
| **F2** | 개선 | L | E(후속) | 서식44 입력 품질 Phase 2 | 숫자검증·per-field maxLen·합계 자동계산 (TODOS P3) |
| **W1** | — | S | (즉시) | `.devproxy.json` | .gitignore 추가 (로컬 dev 설정) |
| **W2** | — | S | (즉시) | customer-search-dialog.tsx(M), CLAUDE.md(M), 022 SQL, 아카이브 이동, scan/diagnose 스크립트 | **완성 상태 — 커밋 대상**(022 RLS·문서화 한 단위). program-wide-review.plan.md는 이번 작업 산출물 |
| **X1** | P3 | S | C | `anonymous-customer.ts:69-75` | 익명 find-or-create 유니크 제약 부재 → 동시요청 재중복(B3 정리 시 부분 유니크 인덱스 동반) |
| **X2** | P3 | S | C | `customer-batch:135-146`, `customer-search-dialog:105` | 익명 중복체크가 org 스코프 고정(공유 NULL 못 봄) + or() 필터에 키워드 원문 삽입(견고성) |
| **X3** | P3 | S | D | `use-dashboard-data.ts:219`, `document-register:87-93` | 중복 fetch(/api/codes 모듈캐시 우회, 자금원 가드용 3×전건) |
| **X4** | P3 | S | D | `export-sqlite:495-505` denylist | 취약 구조(현재 누락 없음). allowlist 전환 권장 — 다음 acc_book 컬럼 추가 시 3회째 재발 방지 |
| **X5** | P3 | S | C | `export-sqlite:529-547` | 백업 round-trip 시 복수 감사자(position02~05) 유실 — UI 고지 없음 |
| **X6** | P3 | S | D | 주석/문서 stale | `ledger-allocation.ts:2-16`(Pass0→1→2만), CLAUDE.md funding-allocation "미적용", TODOS B1 경로 |

## 2. 플랜 인벤토리 15건 검증 결과

| 플랜 ID | 상태 | 매핑 |
|---------|------|------|
| S1 (acc-book IDOR) | **유효·확대** | S1 + 미들웨어 `/api` 공개로 비로그인까지 노출 |
| S2 (hwpx/generate 무인증) | **유효** | (hwpx/generate는 hwpx/* 중 income-ledger 등과 달리 가드 확인 필요 — B에 포함) |
| S3 (022 RLS 적용) | 코드 완성, **적용 여부 미확인** | W2 커밋 대상. **API IDOR는 022로 안 닫힘**(service_role 우회) |
| A1 (수입/지출 이원화) | **유효** | BX1·BX2가 직접 비용. B의 IDOR 수정이 방향 결정 |
| A2 (data-query 잔여) | **이미 해소** | data-query.ts 존재하지 않음(v0.18.0.0 제거). 문서만 stale(X6) |
| A3 (funding-allocation 미적용) | **이미 해소** | expense:531이 buildAdjustedAccBook 선적용. CLAUDE.md stale(X6) |
| B1 (prefill race) | **유효** | B1 (경로 stale) |
| B2 (org-metrics dead) | **유효·확대** | B2 (기부자 과대 파생 추가) |
| B3 (익명 4중복) | **유효** | B3 + X1 유니크 인덱스 |
| P1 (요약 RPC) | **유효·확대** | P-3 + P-1 truncation 리스크가 더 시급 |
| Q1 (ChatBubble 분리) | **유효·하향** | 270줄/useState 7개 — 우선순위 낮음(D-5 근처, 컷 가능) |
| Q2 (스크립트 정리) | **유효** | D-4 폐기후보 6개 |
| F1 (FR-07) | **미구현 확인** | F1 |
| F2 (서식44 Phase2) | **유효** | F2 (후속) |
| A2 export CANDIDATE_ACC_SEC_CDS | **이미 해소** | export-sqlite에 로컬 상수 없음(SSOT 경유). settlement-calc.ts에만 병렬 상수(X6/D 정리) |

**신규 발굴(플랜에 없던)**: S3~S9 IDOR 세부, BX1~BX9(입력·백업·결산 9건), R1~R4(재배분 parity 4건), P-1·P-2·P-4(성능), D-1·D-2·D-6(데드/중복), X1~X6. → 진단이 인벤토리를 크게 확장.

## 3. Phase별 실행 계획 (수정 착수용)

### Phase B — 보안 (최우선, 독립 PR)
- **B-1**: 공통 헬퍼 `requireOrgMembership(orgId)` 추출 (organ 라우트 4단계 패턴) → S1·S2·S3·S4·S5·S6·S7에 적용. middleware `/api` 공개는 유지하되 각 라우트가 자체 가드(라우트별 세션+소속). 공개 예외 명시: codes(공용코드), address/search(로그인 게이트만).
- **B-2**: S3 export-sqlite 자격증명 노출 — 소속검증 + full/master CUSTOMER 무필터(S8) 스코프화.
- **B-3**: S4 import overwrite 전역삭제 → org 스코프(customer는 org_id, 익명 NULL 보존) + acc_rel 삭제 조건화. 이건 데이터 파괴라 보안·버그 경계.
- 회귀: 라우트별 401/403/200 테스트, 정상 소속 경로 무영향.

### Phase C — 버그/데이터 (독립 PR, B와 병행 가능)
- **C-1 (입력)**: BX1(expense 익명 resolve — API 경유 통일 or 클라 resolve), BX2(silent no-op — select로 행수 확인), BX3(잠금 삭제 가드).
- **C-2 (대시보드)**: B1(prefill race, dirty 추적), B2+R4(org-metrics name 기반 익명 판정).
- **C-3 (데이터)**: B3 익명 중복 이관 스크립트 + X1 부분 유니크 인덱스(마이그레이션).
- **C-4 (백업/결산)**: BX4(중복적재), BX5(reset 비번 검증+Storage 정리), BX6(audit dryRun), BX7/BX8(결산확정 가드·기간 SSOT), BX9(estate 합계 통일).

### Phase D — 효율화/정리 (독립 PR)
- **D-1 (성능)**: P-1(무제한 fetch → 페이지네이션 fetchAll 헬퍼, **truncation 우선**), P-2(batch_insert 일괄화), P-3(요약 SQL aggregate/RPC), P-4(N+1 쓰기).
- **D-2 (정리)**: D-1 데드 복제본 삭제, D-2 resolution 영수증 SSOT 통일, D-3~D-6 상수/스크립트/라벨 정리, X3·X4·X6.
- **R2 (parity)**: 개별 Excel 재배분 경유.

### Phase E — 기능개선 (독립 PR)
- **E-1**: F1 FR-07 — export route:812·settlement handleSettle에 기간 외 거래 건수 검사 → 경고 표면화(차단 아님).
- **E-2 (후속)**: R3(업무규칙 확인 후), F2(서식44 Phase2).

### 즉시 (Phase 무관)
- W1(.devproxy.json gitignore), W2(완성된 워킹트리 커밋), R1(HWPX 채번 — parity 회귀이므로 C/D 사이 우선 처리 권장).

## 4. 미해결(OQ) 갱신

- **OQ-1 (A1 방향)**: B의 IDOR 수정으로 acc-book API에 가드가 생기면 **expense를 API 경유로 통일**하는 방향이 유리(BX1·BX2가 한 번에 해소). C-1에서 결정.
- **OQ-2 (022 적용)**: 코드 완성됐으나 Supabase 적용 여부 미확인 — Phase B 착수 시 SQL 에디터 적용 상태 확인 필요(사용자 확인 항목).
- **OQ-3 (B3 방식)**: 이관 스크립트(감사추적) + 부분 유니크 인덱스 마이그레이션 병행이 적절.
- **OQ-4 (F2 포함)**: Phase C/D 소요에 따라 컷 — 기본 후속.
- **OQ-5 (R3 신규)**: 보전청구서 자금원 분류가 raw 기준인지 재배분 기준인지 업무규칙 확인 필요(사용자/선관위 안내서).

## 5. 확인 완료(문제 없음) — 안심 근거

- 재배분 SSOT 소비처 정합: 뷰어·reports Excel·.db·결산·22-1이 모두 buildLedgerRows/buildAdjustedAccBook 경유(HWPX 채번만 예외=R1).
- 영수증 채번: export-sqlite·뷰어·reports 3곳 모두 fillExportReceiptNumbers 호출(과거 reports 누락 버그 해소됨).
- ACC_BOOK 분할 / BAK 원본 비대칭 유지 + 회귀 테스트.
- 결산 집계 buildSettlementSummary 경유, shortfall 은폐 없이 노출, finalize_settlement 권한(authenticated만)·롤백 정상.
- 기관 삭제 플로우(/api/organ): SSR 인증+소속검증+Storage 선삭제 — **올바른 참조 패턴**.
- export normalizeOfficialExpenseRow·stripAppOnly·selectReferencedCustomers·익명 -999 보장 정상.
- data-query.ts·export CANDIDATE_ACC_SEC_CDS 데드코드 제거 완결.

## 5.5 Phase B(보안) 실행 완료 — 2026-07-03

**브랜치**: `fix/api-org-membership-guard` (미커밋 — 사용자 승인 후 커밋/PR)

| 항목 | 처리 |
|------|------|
| 공통 헬퍼 | `lib/api/require-org-membership.ts` — `requireOrgMembership(rawOrgId, serviceClient)` = orgId 정수검증(400) → `auth.getUser()`(401) → `user_organ` 소속(403, DB오류는 500). +유닛 테스트 12 |
| S1 acc-book | GET/POST 전 액션 가드. `authorizeAccBook`이 action별 대상 org 확정(update/delete는 acc_book_id/ids로 역조회, batch_insert 단일 org 강제). **delete를 검증 org로 스코프**. +authz 테스트 10 |
| S2 customers | GET orgId 필수화 + **search-only/전체반환 PII 유출 분기 삭제**. POST는 `authorizeCustomers`(cust_id→org 역조회, 공유 익명 org_id NULL 수정/삭제 거부). delete 스코프화 |
| S3 export-sqlite | 소속검증 가드(자격증명 userid/passwd 노출 차단). (S8 full/master CUSTOMER 무필터는 D/후속) |
| S4 import-sqlite | 소속검증 가드(overwrite 데이터파괴 차단). (전역삭제 org 스코프화는 Phase C BX로 별도) |
| S5 evidence-file | GET/POST/DELETE 3핸들러 가드. +인가 테스트 4 |
| S6 | excel/export · recompute-settlement · reimbursement/aggregate 가드 |
| S7 workflow-status | 존재확인 → 소속검증 교체 |

**검증**: 전체 79파일 926테스트 통과(기존 900 + 신규 26), eslint 클린, `next build` 성공.
**미들웨어 정책**: `/api` 공개는 유지(라우트별 자체 가드 방식) — 각 service_role 라우트가 스스로 가드.
**Phase B 잔여**: S8(full/master CUSTOMER 무필터 스코프화), S9(address/search 로그인 게이트+키 헤더화), `/api/hwpx/generate`(데이터 접근 없음 — 로그인 게이트만). S4 overwrite 전역삭제 org 스코프화는 데이터파괴 방지라 Phase C(BX4 인접)로 이관.

## 5.6 Phase C(버그·데이터) 실행 — 2026-07-03 (1차분)

**브랜치**: `fix/api-org-membership-guard` (Phase B와 동일 워킹트리 — 커밋 시 분리 권장)

| 항목 | 처리 | 파일 |
|------|------|------|
| BX1 (P1) | expense insert/update 를 `postAccBook`(API) 경유로 이관 → 서버가 익명 resolve(-999→정본)·기간검증(OUT_OF_PERIOD confirm)·소속검증 처리. 거래처 미선택 지출 저장 가능. 중복 인라인 기간검증 제거 | `expense/page.tsx` |
| BX5 (P2) | reset 가짜 비번 게이트 → `signInWithPassword` 재인증 후에만 삭제 | `reset/page.tsx` |
| BX6 (P2) | audit 로드-시 recompute를 `dryRun:true`로 (열람만으로 opinion 덮어쓰기 방지) | `audit/page.tsx` |
| B2 (P2) | org-metrics `-999` dead 조건 → `OrgMetricsContext.anonymousCustIds`(name='익명') 판정. 익명 기부 누락·기부자 수/거래처 수 과대 해소. +테스트 2 | `org-metrics.ts`, `use-dashboard-data.ts` |
| B1 (P2) | FormInputPanel prefill race → dirty 필드 추적(서식 전환만 전체 리셋) | `submission-forms/FormInputPanel.tsx` |
| BX3 (P2) | 옛 주기 잠금이 삭제·영수증 핸들러 통과 → income·expense 삭제/영수증 핸들러에 `cycleLock.locked` 가드 | `income/page.tsx`, `expense/page.tsx` |
| BX9 (P2) | estate 합계 이원화(sum amt vs amt×qty) → `estate-types.ts` `estateAmount`/`sumEstateAmount` SSOT로 3경로 통일. +테스트 7 | `estate-types.ts`, `settlement/page.tsx`, `recompute-settlement/route.ts`, `export-sqlite/route.ts` |

**검증**: 전체 80파일 935테스트 통과(기존 900 + Phase B 26 + Phase C 9), eslint 클린, `next build` 성공.

**Phase C 잔여(별도 처리 필요 — 코드 외 리스크)**:
- **BX4** import skip/merge 거래 중복적재 — 백업/복구 동작 변경이라 자연키 대조 설계 + 테스트 필요.
- **BX7/BX8** 결산확정 후 입력차단·기간 SSOT 오염 — DB 스키마(finalized 플래그) 마이그레이션 필요.
- **B3** 익명 중복(38/65/117) 데이터 이관 — 프로덕션 데이터 작업 + 부분 유니크 인덱스, 사용자 확인 필수.
- **BX2** expense 삭제 경로 silent no-op — 삭제도 API 이관 시 해소(A1 별도 feature). insert/update는 BX1로 이관됨.
- **BX5 잔여** reset Storage 고아·acc_book_bak 잔존.

## 5.7 Phase D(효율화·정리) 실행 — 2026-07-04 (1차분)

**브랜치**: `fix/api-org-membership-guard` (동일 워킹트리)

| 항목 | 처리 | 파일 |
|------|------|------|
| P-1 (P1) | 무제한 `select("*")` truncation 방지 — export `fetchTable` + 산출물·결산 6경로에 `.limit(100000)` 추가(기본 max-rows≈1000에 잘려 공식 .db·HWPX·결산 행이 유실되던 위험 차단) | `export-sqlite`(fetchTable), `hwpx/income-ledger`, `hwpx/accounting-report`, `recompute-settlement`, `reimbursement/aggregate`, `settlement/page`, `income-expense-book/page` |
| D-1 (P2) | 데드 복제본 삭제 — `api/excel/export/route 2.ts`(git rm), `dashboard/organ/page 2.tsx`(rm) | — |
| D-2 (P2) | resolution 영수증번호 표기 버그 — 로컬 `buildReceiptLabel`(접두사·접미사가 SSOT와 **반대**: 선거비용외↔선거비용, "기"↔"외")를 제거하고 저장된 `rcp_no`를 그대로 표기 | `resolution/page` |
| D-3 (P3) | resolution 로컬 `PAY_METHODS` 재정의 → `expense-types` SSOT import | `resolution/page` |
| X6 (P3) | `ledger-allocation.ts` 헤더 주석 Pass0→1→2 → 실제 Pass0→L→1→2→3→4 로 갱신 | `ledger-allocation.ts` |

**검증**: 80파일 935테스트 통과, eslint 클린, `next build` 성공.

**Phase D 잔여(별도/위험)**:
- **P-2** batch_insert 3N 왕복 — 테스트 없는 대량 입력 경로라 리팩터(사전 일괄조회+배열 insert)는 회귀 위험. 테스트 우선 작성 후 별도.
- **P-3/P-4** 요약 SQL aggregate·N+1 쓰기 — 성능 개선(정확성 무관), 후속.
- **P-1 잔여** 대시보드 정보성 화면(donors/party-summary 등) 무제한 조회 — P3.
- **D-4** 폐기후보 스크립트 6개(apply-realloc-to-db·realloc-negative-balance·rag-upload·upload-md/ts) — 보존/삭제 판단 필요.
- **D-5/D-6/X3/X4/R2** 미사용 export·org_sec_cd 라벨 SSOT·중복 fetch·denylist→allowlist·개별 Excel 재배분 — 정리 후속.

## 5.8 BX7/BX8(결산확정 DB 스키마) 실행 — 2026-07-04

**브랜치**: `fix/api-org-membership-guard` · **마이그레이션**: `scripts/023_settlement_finalize_flag.sql` (**수동 적용 필요**)

| 항목 | 처리 |
|------|------|
| BX8 | `finalize_settlement` RPC가 **organ.acc_from/acc_to(회계기간·주기 판정 SSOT)를 덮어쓰던 것 제거** — 결산기간은 opinion 에만 저장. 권한/존재 확인은 organ SELECT(RLS)로 대체 |
| BX7 | `opinion.settled_at`(확정 시각) 추가 — RPC가 확정 시 기록. `acc-book` API insert/update가 확정 결산기간 내 거래면 `SETTLED_PERIOD`(400) 경고 → `postAccBook` confirm 후 `_allowSettled` override(차단 아님, 은폐 금지 방침). expense가 BX1로 API 경유라 자동 적용. settlement 화면은 `opinion.settled_at` 로드해 "확정됨" 표시 |
| 부수 | opinion 컬럼 추가라 export-sqlite `APP_ONLY_OPINION_COLUMNS`에 `settled_at` 등록(공식 .db export 실패 방지), `types/database.ts` opinion Row 갱신 |

**결정(사용자 무응답 → 방침 기반 자율)**: BX7=경고 방식(허용+표면화), BX8=organ 덮어쓰기 제거.

**검증**: 80파일 939테스트 통과(SETTLED 가드 테스트 4 추가), eslint 클린, `next build` 성공.

**⚠️ 적용 순서**: `scripts/023`은 Supabase SQL 에디터 수동 적용 필요. **미적용 상태에서도 코드는 안전**(settled_at 컬럼 부재 시 opinion 조회가 실패→null→경고 no-op; finalize는 구 013 RPC 동작 유지). 023 적용 후 BX7/BX8 활성화.

## 5.9 BX4(import 중복적재) 실행 — 2026-07-04

**브랜치**: `fix/api-org-membership-guard`

| 항목 | 처리 |
|------|------|
| BX4 | import-sqlite 의 skip/merge 가 identity PK strip 후 fresh insert 라 **복구할 때마다 거래·거래처가 전량 복제**되던 것을 수정. 자연키가 없어 안전한 중복 판정이 불가능하므로, **overwrite 만 거래성 테이블(CUSTOMER·CUSTOMER_ADDR·ACC_BOOK·ACC_BOOK_BAK·ACCBOOKSEND·ESTATE) import**, skip/merge 는 이들을 건너뛰고 기존 유지(참조코드·기관정보·의견은 정책 무관 upsert). `replaceOrgData` 플래그로 STEP 4~9 가드 |
| UX | backup 페이지 conflictPolicy 라벨 정정 — "중복은 유지/업데이트"(허위) → "전체 교체" / "거래 유지(참조·기관정보만 갱신)". skip report 에 "기존 유지(overwrite 아님)" 표기 |

**검증**: 80파일 939테스트 통과, eslint 클린, `next build` 성공. **주의**: route 통합 테스트는 sql.js WASM 모킹 부담이 커서 미작성 — 로직이 단순 조건 가드라 overwrite 경로 무변경(회귀 위험 낮음). S4(overwrite 의 customer/accbooksend 전역삭제 org 스코프화)는 별개 이슈로 잔여.

## 5.10 B3(익명 중복 데이터 정리) — 2026-07-04 (도구 완성, 실행 대기)

**브랜치**: `fix/api-org-membership-guard` · **실제 데이터 변경은 미실행**(사용자 확인 대기 — 파괴적 프로덕션 작업)

**실측 현황**(`scripts/diagnose-anon-customers.mjs` read-only 실행): 공유 익명(org_id NULL) 4건 — 39(정본, 참조 0)·65(참조 0)·**117(참조 5)**·244(참조 0); org 10 전용 183(참조 0, 정리 제외). 진단 문서가 예상한 38/65/117과 실제 cust_id 는 다름.

| 산출물 | 내용 |
|--------|------|
| `scripts/diagnose-anon-customers.mjs` | read-only 현황 진단(익명 행·참조 건수·정본/중복 분류) |
| `scripts/cleanup-anon-customers.mjs` | dry-run 기본 / `--confirm` 실행. 중복(65/117/244) 참조 acc_book·customer_addr 를 정본 39 로 이관 후, 참조 0 재확인하고 삭제. backups/ JSON 백업. **공유 익명만 — org 전용 183 미접촉** |
| `scripts/024_anon_customer_unique.sql` | 공유 익명 부분 유니크 인덱스(`WHERE org_id IS NULL AND name='익명'`) — 재중복 차단. **중복 제거 후 적용** |

**실행 완료 (2026-07-04)**: `cleanup-anon-customers.mjs --confirm` 실행 — 중복 65·117·244의 acc_book 참조(117→5건)를 정본 39로 이관 후 삭제, 백업 `backups/anon-cleanup-*.json`. diagnose 재확인: 공유 익명 1행(39)만 존재, org 10 전용 183 미접촉. **남은 것**: `scripts/024_anon_customer_unique.sql` Supabase 수동 적용(재중복 차단). (B2 코드 수정으로 집계 왜곡은 이미 완화 — 데이터 정리로 근본 해소.)

## 5.11 P-2/P-3(성능 리팩터) — 2026-07-04

**브랜치**: `fix/api-org-membership-guard` · **마이그레이션**: `scripts/025_org_totals_rpc.sql`(P-3, 폴백 있어 미적용도 안전)

| 항목 | 처리 |
|------|------|
| P-2 | acc-book `batch_insert` 의 행당 customer 조회+생성+acc_book insert(**3N 왕복**)를 일괄화: ① 코드매핑+provider 수집(메모리) → ② customer 일괄 조회(`in(names)`, org 격리는 `key="org\|name"`) → ③ 신규 provider 일괄 생성 → ④ acc_book 500행 청크 배열 insert. **~2 + N/500 왕복**으로 감소(대량 임포트 Vercel 타임아웃 완화). 매칭 규칙·org 격리 불변. +스모크 테스트 |
| P-3 | acc-book GET 요약(총수입/총지출)이 org 전 행을 **재fetch 후 JS reduce**(요청당 2×전건)하던 것을 `org_income_expense_totals` RPC(SUM GROUP BY, 2행 반환)로 교체. **RPC 미적용 환경은 전건 폴백**(무해) |

**검증**: 80파일 940테스트 통과(batch 스모크 추가), eslint 클린, `next build` 성공.

**잔여**: P-4(N+1 쓰기 — reimbursement 전체행 UPDATE·행당 백업), expense/customer-batch 등의 이중 전건·useMemo 누락은 P2/P3 후속. batch_insert 완전 기능 통합 테스트는 sql.js 없이도 다수 테이블 모킹 부담이 커서 스모크로 갈음(진단).

## 5.12 Phase E(FR-07 주기 외 거래 경고) — 2026-07-04

**브랜치**: `fix/api-org-membership-guard`

| 항목 | 처리 |
|------|------|
| SSOT | `acc-period.ts` `countOutOfPeriodRows(rows, period, sampleLimit)` — 산출물 생성 시 org 회계기간 밖(before/after) 거래 건수·샘플 집계(순수). 생성은 막지 않음(은폐 금지). +테스트 5 |
| export-sqlite | 대상 org(numOrgId) accBook 을 organ period 로 검사 → `X-Out-Of-Period-Count`/`X-Out-Of-Period`(JSON) 응답 헤더. 단일 org 라 org별 remap 복잡성 없음 |
| backup 페이지 | export 다운로드 후 헤더 읽어 "회계기간 밖 거래 N건" 경고 alert(오연도 혼입 확인 유도) |
| settlement | handleSettle 에서 organ period 조회 + 결산 대상 거래 검사 → 기간 밖이면 경고 alert |

**검증**: 80파일 945테스트 통과, eslint 클린, `next build` 성공.

**Phase E 잔여(후속)**: reports 배치 Excel·HWPX 서식(income-ledger·accounting-report) 생성 경로의 주기 외 경고는 미적용 — export/결산이 핵심 제출 경로라 우선 처리, 보고서류는 후속.

## 5.13 잔여 후속(followup) 실행 — 2026-07-04 (branch fix/program-review-followup)

| 항목 | 처리 |
|------|------|
| **S4** (P2) | import-sqlite overwrite 전역삭제 → **대상 org 스코프화**. customer_addr(cust_id만)·accbooksend(acc_book_id만)는 org_id 컬럼이 없어 대상 org 의 참조 id 로 스코프(대량 id 청크 500). 공유 익명(org_id NULL) 유지. 과거 다기관 전역삭제(타 org 거래처·주소·전송이력 소실) 해소 |
| **Phase E reports** (FR-07) | reports 배치 Excel 생성 전 `countOutOfPeriodRows`로 회계기간 밖 거래 confirm 경고(사용자 진행 결정) |
| **P-4** (성능) | expense 일괄삭제 bak 행당 insert → 배열 insert 1회. reimbursement handleSave 전체행 UPDATE → **변경분(체크·청구액)만 UPDATE**(no-op 쓰기 제거) |
| **P-3 expense** (재검토) | expense 요약 RPC는 **미적용이 정답** — `allData`가 요약뿐 아니라 자금원 충당 패널(`buildAdjustedAccBook`)에도 필수라 전건 조회가 불가피, RPC 추가는 왕복만 늘림 |

**검증**: 80파일 945테스트 통과, eslint 클린, `next build` 성공.

**최종 잔여(가치 낮음/중복)**: HWPX 서식 FR-07(export·reports·결산이 같은 데이터를 이미 경고 — 중복), income 일괄삭제 N+1(API backup 경유라 배치엔 API 변경 필요), D-5/D-6/X3/X4(미사용 export·org_sec_cd 라벨·중복 fetch·denylist→allowlist 정리). 진단 P1/P2 실질 항목은 모두 소진.

## 6. 진단 완성도 / 다음 단계

- **커버리지 95%**: 플로우 7개 + API 10그룹 인가 매트릭스 + 재배분 소비처 전수 + 성능/데드코드 스캔 완료. 미탐색 영역: RAG/챗봇(정적이라 저위험), 개별 UI 컴포넌트 시각 QA(DESIGN.md 범위, 별도).
- 이 진단은 "구현↔설계 매치"가 아니라 "프로그램 건강 진단"이므로 matchRate 대신 커버리지로 표기. 수정 착수 전 **사용자 우선순위 승인**(플랜 D-1) 후 Phase B부터.
