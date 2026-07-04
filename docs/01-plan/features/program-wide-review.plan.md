# Plan — 전체 프로그램 기능수행과정 리뷰 + 코드효율화·기능개선·버그수정

- 기능: `program-wide-review`
- 단계: Plan
- 작성일: 2026-07-03
- 유형: 프로그램 전반 품질 사이클 (진단 → 우선순위 수정, 다중 트랙)
- 기준 버전: v0.31.0.0 (Pass0→L→1→2→3→4 재배분 SSOT 완성 직후)
- 관련 메모: [[api-routes-idor-no-org-membership-check]] · [[expense-page-bypasses-accbook-api]] · [[year-separation-p2-ui-lock]] · [[settlement-must-use-realloc-ssot]] · [[negative-income-grossup-not-realloc]]

## Executive Summary

| 관점 | 내용 |
|------|------|
| **Problem** | v0.31.0.0까지 기능(재배분 SSOT·연도분리·HWPX·백업)이 빠르게 쌓이며 알려진 부채가 누적됨 — ① **P1 보안**: 대부분 API 라우트가 service_role로 RLS를 우회하면서 인증·org 소속검증이 없어 IDOR 가능, ② 수입(API 경유) vs 지출(브라우저 직접쓰기) **이원화된 데이터 접근**으로 가드가 갈라짐, ③ 알려진 버그(FormInputPanel prefill race, org-metrics dead 조건, 익명 거래처 4중복), ④ 요약합계 전건 fetch 등 비효율, ⑤ FR-07(주기 외 거래 경고) 등 미구현 잔여 |
| **Solution** | 주요 사용자 플로우(로그인→기관선택→수입/지출 입력→재배분 뷰어→보고서→백업→결산) 기준 **전수 진단(Phase A)** 후, **보안(B) → 버그(C) → 효율화·아키텍처(D) → 기능개선(E)** 순 우선순위 수정. 각 Phase는 독립 PR로 나눠 additive·reversible 유지 |
| **Function/UX** | 사용자 데이터가 타 기관에서 접근 불가(IDOR 차단), 서식 입력 중 값 소실 없음, 익명 기부 집계 정상화, 대시보드 요약 로딩 개선, 주기 외 거래가 산출물에 섞이면 경고 표면화 |
| **Core Value** | "빨리 쌓은 기능"을 "믿고 제출할 수 있는 시스템"으로 — 보안 1차 방어선 완성 + 알려진 결함 0 + 산출물 정합성(화면==Excel==HWPX==.db) 유지 |

## 1. 배경 / 현재 상태

### 1.1 베이스라인 (2026-07-03, v0.31.0.0)
- 소스 175개 파일, 대시보드 페이지 29개, API 라우트 그룹 10개, 테스트 파일 77개 (vitest).
- **테스트 베이스라인 (2026-07-03)**: 77파일 / 900테스트 전부 통과 (7.6초) — 클린 상태에서 착수.
- 재배분 SSOT(`buildLedgerRows` Pass0→L→1→2→3→4)가 완성돼 화면·Excel·HWPX·.db parity가 회귀 테스트로 고정된 상태 — **이번 사이클은 이 SSOT를 건드리지 않는 것이 원칙** (건드릴 경우 parity 회귀 필수).
- 미머지 작업물: `funding-income-cap.plan.md`, `item-balance-pass3.plan.md`(P3는 v0.31.0.0에 구현 완료), 진단 스크립트 다수(`app/scripts/*.mjs`), `022_customer_customer_addr_org_rls.sql`(customer RLS 격리 — 적용 여부 확인 필요).

### 1.2 알려진 부채 인벤토리 (TODOS.md + 메모리 + CLAUDE.md 잔여 항목)

| # | 분류 | 항목 | 근거 |
|---|------|------|------|
| S1 | P1 보안 | `api/acc-book` 등 service_role 라우트 전반: 인증 토큰·`user_organ` 소속검증 부재 → 임의 orgId로 타 기관 재무데이터 읽기/쓰기(IDOR) | TODOS P1, [[api-routes-idor-no-org-membership-check]] |
| S2 | P1 보안 | `/api/hwpx/generate` 무인증 — 인터넷 임의 POST로 선관위 서식 생성(위조 보조·컴퓨트 남용) | TODOS P1 |
| S3 | P1 보안 | `scripts/022` customer/customer_addr RLS 격리 — SQL 작성됨, Supabase 적용 여부 확인 및 잔여 테이블(acc_book 등) RLS 점검 | git status untracked |
| A1 | P2 아키텍처 | 수입=API 경유 vs 지출=브라우저 직접쓰기 이원화 — 가드(연도분리·익명 resolve 등)를 두 곳에 중복 구현 중, 지속 드리프트 위험 | TODOS P2, [[expense-page-bypasses-accbook-api]] |
| A2 | P2 아키텍처 | 배분 경로 일원화 잔여: `excel-template/data-query.ts`(V2) 병렬 분류, `export-sqlite`의 로컬 `CANDIDATE_ACC_SEC_CDS`(V3) | TODOS P2 (v0.17.1.0 부분완료) |
| A3 | P2 아키텍처 | `funding-allocation.ts`(지출내역관리 자금원별 현황) 재배분 SSOT 미적용 — 재배분 후 산출물과 수치 불일치 가능 | CLAUDE.md Gotcha |
| B1 | P2 버그 | `FormInputPanel` prefill race — organ fetch 완료 시 입력 중 값 전체 소실(서식 44는 37필드) | TODOS P2 Quality |
| B2 | P3 버그 | `org-metrics.ts` 익명 기부 판정 `-999` 비교가 dead 조건(항상 false) → 익명 기부 집계 누락 | TODOS P3 |
| B3 | P3 데이터 | customer 익명 4중복(38/39/65/117) — acc_book 참조를 정본(39)으로 이관 후 정리 | TODOS P3 |
| P1 | P3 성능 | 요약합계용 전건 fetch(`/api/acc-book` GET, expense 페이지) → `SUM GROUP BY` RPC로 교체 | TODOS P3 |
| Q1 | P3 효율화 | `ChatBubble.tsx` 313줄·useState 8개 — FaqBrowser 분리 | TODOS P3 |
| Q2 | P3 효율화 | 진단 스크립트 8개(`app/scripts/*.mjs`) 미정리 — 용도 문서화 또는 통합 | git status |
| F1 | 기능개선 | FR-07: export·결산·보고서에서 주기 외 거래 경고 (year-separation-p2 잔여) | CLAUDE.md, [[year-separation-p2-ui-lock]] |
| F2 | 기능개선 | 서식 44 입력 품질 Phase 2 (숫자 검증·maxLen·합계 자동계산) | TODOS P3 |

### 1.3 왜 지금인가
- 재배분 파이프라인(v0.27~0.31)이 안정화돼 대형 기능 작업이 일단락 — 부채 상환의 적기.
- S1(IDOR)은 실 사용자 데이터(정치자금)가 쌓일수록 위험이 커지는 항목으로 더 미룰 수 없음.

## 2. 목표 / 비목표

### 2.1 목표 (Goals)
1. **전수 진단**: 주요 기능수행과정(§3.1 플로우 7개)을 코드 레벨로 리뷰해 위 인벤토리 외 **신규 결함을 발굴**하고, 전체를 심각도·비용으로 우선순위화한 진단 보고서 작성 (`docs/03-analysis/program-wide-review.analysis.md`).
2. **P1 보안 해소**: S1·S2·S3 — 표준 가드 패턴(`createSupabaseServer()` → `auth.getUser()` 401 → `user_organ` 소속검증 403, `/api/organ`·`/api/hwpx/income-ledger`에 기구현)을 전 service_role 라우트에 적용.
3. **알려진 버그 수정**: B1·B2·B3 + 진단에서 발견되는 P1/P2급 신규 버그.
4. **코드 효율화**: P1(요약 RPC)·A2(배분 경로 잔여 일원화)·A3(funding-allocation SSOT 경유) + 진단 발견 dead code 제거.
5. **기능 개선**: F1(FR-07 주기 외 거래 경고) — 연도분리의 데이터 무결성 마지막 조각.
6. 전 과정에서 **기존 테스트 77파일 green 유지** + 수정 항목마다 회귀 테스트 추가.

### 2.2 비목표 (Non-goals)
- 재배분 SSOT(Pass0~4) 로직 변경 — 이번 사이클은 소비처 정합만 다루고 코어는 불변.
- 새 대형 기능(신규 서식·신규 페이지) 추가.
- UI 리디자인 (DESIGN.md 위반 발견 시 진단 보고서에 기록만).
- DB 스키마 대개편 — 마이그레이션은 additive만 (RLS 정책 추가 등).
- A1(수입/지출 접근 패턴 통일)의 **완전한 구현** — 방향 결정과 설계까지만 이번 범위, 구현은 별도 feature로 분리(대형 리팩터이므로).
- F2(서식 44 Phase 2) — 진단 결과 여력 있으면 포함, 기본은 후속.

## 3. 리뷰 범위 및 방법 (Phase A — Check 선행형)

### 3.1 기능수행과정(사용자 플로우) 7개 — 전수 리뷰 대상

| 플로우 | 경로 | 중점 점검 |
|--------|------|-----------|
| ① 인증·기관선택 | login → select-organ → auth store | 세션 만료 처리, 옛 주기 잠금(useOrgCycleLock) 우회 여부 |
| ② 수입 입력 | dashboard/income + api/acc-book | OUT_OF_PERIOD 가드, 익명 resolve, 검증 누락 |
| ③ 지출 입력 | dashboard/expense (직접쓰기) + document-register | **클라측 인라인 가드가 API 가드와 동등한지** (연도분리·익명·필수값) |
| ④ 재배분·뷰어 | income-expense-book, ledger-allocation SSOT 소비처 | funding-allocation 미적용(A3), 영수증 채번 stale |
| ⑤ 보고서 산출 | reports Excel, hwpx/* (서식7·22-1~4), submission-forms | parity, 무인증 라우트(S2), FR-07 부재(F1) |
| ⑥ 백업·복원 | backup, export/import-sqlite | FK 고아, overwrite 전역삭제 위험 고지, org 검증 |
| ⑦ 결산·감사 | settlement, audit, aggregate | buildSettlementSummary SSOT 경유 여부, finalize 권한 |

### 3.2 횡단 점검 축 4개
1. **보안**: 전 API 라우트(10그룹) 인증·인가 매트릭스 작성 — 라우트 × (세션검증/소속검증/RLS의존) 표. S1의 실제 범위 확정.
2. **효율**: 전건 fetch·N+1·불필요 리렌더 스캔 (요약합계 외 추가 사례).
3. **정합성**: 재배분 SSOT 소비처 전수 확인 — 미경유 집계 화면 목록화 (A3 외 추가 여부).
4. **데드코드·중복**: 미사용 export, 중복 상수(CANDIDATE_ACC_SEC_CDS류), 임시 스크립트.

### 3.3 방법
- 코드 정적 리뷰(플로우별 병렬 조사) + 테스트 베이스라인(전체 vitest) + 빌드·린트 클린 확인.
- 산출물: `docs/03-analysis/program-wide-review.analysis.md` — 발견 항목마다 `심각도(P1~P3) / 수정비용(S/M/L) / 소속 Phase(B~E)` 태깅.

## 4. 실행 단계 (Phase B~E — 각각 독립 PR)

| Phase | 내용 | 항목 | 완료 기준 |
|-------|------|------|-----------|
| **B. 보안** | 표준 가드 전 라우트 적용 + RLS 확인 | S1, S2, S3 | 인가 매트릭스 전 라우트 ✅, 가드 회귀 테스트(401/403), 타 org 접근 시나리오 테스트 |
| **C. 버그** | 알려진 버그 + 진단 신규 P1/P2 | B1, B2, B3, 신규 | 각 버그 재현 테스트 → 수정 → green; B3는 데이터 이관 스크립트 + 검증 |
| **D. 효율화** | 성능·일원화·정리 | P1, A2, A3, Q1, Q2 | 요약 RPC 마이그레이션(additive) + 동일값 검증; A2/A3 SSOT 경유 후 parity 테스트; 진단 dead code 제거 |
| **E. 기능개선** | FR-07 주기 외 거래 경고 | F1 | export·결산·보고서 생성 시 기간 외 거래 감지 → 경고 표면화(차단 아님), 테스트 |

- 순서 원칙: B(보안)가 최우선. C·D는 진단 결과에 따라 병행 가능. E는 마지막.
- 각 Phase 완료 시 `/pdca analyze`로 갭 확인 후 다음 Phase 진행.
- A1(접근 패턴 통일)은 Phase B에서 **방향 결정 문서**(design)만 산출 — S1 가드 구현이 사실상 방향을 결정함(API 경유로 수렴 시 expense 이관 로드맵 포함).

## 5. 기능 요구사항 (FR)

- **FR-1 (진단 보고서)**: §3 범위 전수 리뷰 결과를 심각도·비용 태깅으로 문서화. 신규 발견 0건이어도 "점검 완료" 근거(라우트/플로우 매트릭스)를 남긴다.
- **FR-2 (인가 가드)**: 모든 service_role API 라우트가 세션 401 + `user_organ` 소속 403 가드를 통과해야 데이터 접근 가능. 예외(공개 라우트)는 명시 목록으로 관리.
- **FR-3 (버그 수정 불변식)**: 각 수정은 ① 재현 테스트 선행 ② 기존 77 테스트 파일 green ③ 산출물 parity 불변(재배분 소비처 접촉 시 parity 테스트 필수).
- **FR-4 (요약 RPC)**: 수입/지출 요약합계를 `SUM(acc_amt) GROUP BY incm_sec_cd` RPC로 교체하되, 전환 전후 동일값 검증 테스트를 남긴다. 마이그레이션은 additive(`scripts/023+`).
- **FR-5 (FR-07 경고)**: export-sqlite·결산·reports·HWPX 생성 시 `isAccDateInOrgPeriod` SSOT로 기간 외 거래를 감지, 산출물 생성은 막지 않고 경고를 표면화한다(은폐 금지 방침과 일관).
- **FR-6 (문서 동기화)**: 수정 완료 항목은 TODOS.md에서 Completed로 이동, CLAUDE.md gotcha 갱신, 버전은 Phase(PR)당 MINOR bump.

## 6. 테스트 계획

- **베이스라인**: 착수 시점 전체 vitest 결과 기록 (Phase A 산출물에 포함).
- **Phase B**: 라우트별 401/403/200 시나리오 테스트 (타 org orgId 접근 → 403). 기존 기능 무회귀 — 정상 소속 사용자 경로 green.
- **Phase C**: 버그별 재현 테스트 선행(TDD). B2는 익명 기부 포함 픽스처로 집계값 검증.
- **Phase D**: RPC 전환은 구현·신규 양쪽 동일값 비교 테스트; A2/A3는 `adjusted-ledger-parity.test.ts` 패턴의 정합 테스트 추가.
- **Phase E**: 기간 외 거래 픽스처로 경고 발생·산출물 비차단 검증.
- 전 Phase 공통: `next build` + eslint 클린.

## 7. 리스크

| 리스크 | 완화 |
|--------|------|
| 가드 추가로 정상 사용 경로가 막힘 (예: 익명 customer org_id NULL, 공유 데이터) | 인가 매트릭스에 공유 리소스 예외 명시; 로그인 실사용 QA |
| 지출 페이지 직접쓰기 경로는 API 가드가 안 닿음 — 가드를 API에만 넣으면 구멍 잔존 | RLS(022 적용) + 클라 가드 병행; A1 방향 결정으로 근본 해소 로드맵 |
| RPC 교체 시 기존 화면 합계와 미세 불일치 (필터 조건 차이) | 전환 전후 동일값 비교 테스트, 조건(org·기간·incm) 파라미터화 |
| 진단 범위 폭발 — 29페이지 전수는 과대 | 플로우 7개 + 횡단 축 4개로 한정, 발견 항목은 태깅만 하고 수정은 우선순위 컷 |
| 프로덕션 단일 Supabase — RLS/마이그레이션 실수 시 즉시 영향 | additive 정책만, SQL 에디터 수동 적용 전 검증 쿼리 동봉 |

## 8. 결정 / 미해결

### 방침 (이 플랜의 전제)
- **D-1**: 진단(Phase A) 먼저, 수정은 우선순위 순 — 발견 즉시 수정하지 않고 목록화 후 Phase 배정.
- **D-2**: 재배분 SSOT 코어는 불변, 소비처 정합만 수정.
- **D-3**: Phase당 독립 PR + MINOR bump (한 덩어리 대형 PR 금지).

### 미해결 (Design/진단에서 확정)
- **OQ-1**: A1 방향 — expense를 API 경유로 통일 vs income을 직접쿼리+RLS로 통일. S1 가드 구현 경험이 판단 근거.
- **OQ-2**: `scripts/022` 적용 여부 확인 결과에 따라 S3 범위 확정 (acc_book 등 타 테이블 RLS 포함 여부).
- **OQ-3**: B3 익명 중복 정리를 스크립트(일회성)로 할지 마이그레이션 SQL로 할지.
- **OQ-4**: F2(서식 44 Phase 2) 포함 여부 — Phase C/D 소요에 따라 컷.

## 9. 롤아웃

- Phase A 진단 보고서 → 사용자 승인 후 B부터 착수 (우선순위 컷 합의).
- 각 Phase: feature 브랜치 → 테스트 green → `/ship`(PR) → Vercel preview 확인 → 머지.
- 보안(B) 머지 후 실사용 계정으로 스모크 테스트 (타 org 접근 차단 + 정상 경로 무영향).
- 사이클 종료 시 `/pdca report` + TODOS.md·CLAUDE.md 동기화.
