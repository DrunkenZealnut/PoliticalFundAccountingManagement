# .db 생성 시 수입·지출 분할 데이터 — 검증·문서 보강 (export-db-split-verification) Planning Document

> **Summary**: 「자료백업」 SQLite `.db` 생성 시 수입·지출을 **분할(자금원 재배분 Pass0→1→2)한 데이터로 구성**하는 기능은 **이미 구현·테스트되어 있다**. 조사 결과 `export-sqlite/route.ts:770`의 `finalAccBook`이 `allocateCandidateAccBookForExport`(= `buildAdjustedAccBook` = income-expense-book 뷰어·export 공유 SSOT)로 ACC_BOOK을 분할하며, `adjusted-ledger-parity.test.ts`가 "후보자 분할 픽스처"로 이를 단언한다. 한편 `ACC_BOOK_BAK`(`route.ts:777`)은 `WORK_KIND`·`BAK_ID`를 가진 **변경이력 백업**이라 의도적으로 원본(미분할)을 유지한다. 따라서 본 작업은 신규 구현이 아니라 이 **계약을 회귀로 못박고 문서화**하는 것: (1) export 파이프라인에서 ACC_BOOK은 분할·ACC_BOOK_BAK은 원본임을 함께 단언하는 회귀 테스트, (2) "ACC_BOOK=재배분(분할) / ACC_BOOK_BAK=원본 보존" 계약을 CLAUDE.md·docs·메모리에 명시. **프로덕션 코드 변경 없음(테스트+문서).**
>
> **Project**: PoliticalFundAccountingManagement
> **Version**: 0.20.x → (ship 시 확정; 테스트·문서 only)
> **Author**: Claude · **Date**: 2026-06-23 · **Status**: Draft
> **사용자 결정**: 「이미 분할됨 — 검증/문서만 보강」(AskUserQuestion, 2026-06-23)
> **Related**: 분할 SSOT `lib/accounting/adjusted-ledger.ts`(`buildAdjustedAccBook` Pass0→1→2). export `api/system/export-sqlite/route.ts:497,768~780`. 기존 테스트 `export-sqlite/adjusted-ledger-parity.test.ts`. [[adjusted-ledger-viewer]](v0.19 분할 롤아웃). 메모 [[official-fund-data-income-classification]] · [[export-sqlite-customer-fk-orphan]].

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | ".db에 분할 데이터가 들어가는가?"가 코드만 봐선 불확실하고 문서에도 명시가 없어 **재확인 요청이 반복**된다(이번 요청이 그 사례). 또 ACC_BOOK 분할·ACC_BOOK_BAK 원본이라는 **비대칭 계약을 지키는 가드 테스트가 없어**, 향후 누군가 BAK도 분할하거나 ACC_BOOK 분할을 떼어내도 회귀로 잡히지 않는다. |
| **Solution** | 이미 동작하는 "ACC_BOOK 분할 / ACC_BOOK_BAK 원본"을 **회귀 테스트로 못박고 문서화**한다. 두 산출 행집합(`finalAccBook`/`finalAccBookBak`)을 함께 검증하는 테스트 + CLAUDE.md·docs·메모리에 계약 명시. 프로덕션 코드는 그대로. |
| **Function/UX Effect** | 개발자가 ".db는 보고용 분할 데이터(ACC_BOOK) + 원본 이력 백업(ACC_BOOK_BAK)으로 구성된다"를 문서·테스트로 즉시 확인. 향후 export 변경이 분할 계약을 깨면 CI가 실패해 사전 차단. |
| **Core Value** | 암묵적·검증 불충분하던 "분할된 .db" 불변식을 **명시적·회귀보장**으로 승격 — 동일 질문 재발 방지 + 미래 회귀 방지. |

---

## 1. Overview

### 1.1 현황 (조사로 확정)
- **ACC_BOOK = 분할 적용** (`route.ts:768~774`):
  `fillExportReceiptNumbers( fillExportSortNumbers( allocateCandidateAccBookForExport(…).map(normalizeOfficialExpenseRow) ).map(stripAppOnlyAccBookColumns), codeNames )`.
  `allocateCandidateAccBookForExport = buildAdjustedAccBook`(`:497`) = 후보자(82~85) 시 Pass0→1→2(자금원 재배분 + 수입 과목 재분류, 이동분 신규 고유 id). 모든 mode(full/data1/data2)에서 `accBook`에 적용(master는 거래 0).
- **ACC_BOOK_BAK = 원본 유지** (`route.ts:775~780`): 분할 미적용. DDL에 `WORK_KIND`·`BAK_ID` → **변경이력 백업** 테이블이라 원본 보존이 정상.
- **기존 검증**: `adjusted-ledger-parity.test.ts` 가 ACC_BOOK 분할(뷰어==export 헬퍼 경로, 이동분 1행, `보(비)-2`/`자(비)-2` 채번)을 단언. `normalize.test.ts`·`candidate-gate.test.ts` 보조.

### 1.2 검증·문서 갭 (본 작업 대상)
1. **ACC_BOOK_BAK 미분할 가드 없음** — BAK가 원본임을 단언하는 테스트가 전무. 누가 BAK에 분할을 넣어도 회귀 미탐지.
2. **비대칭 동시 검증 없음** — `finalAccBook`(분할) vs `finalAccBookBak`(원본)을 **한 픽스처로 대조**하는 테스트 부재(현재는 ACC_BOOK 헬퍼만 격리 검증).
3. **계약 문서화 없음** — CLAUDE.md export-sqlite 절에 CHAR(2)/FK고아 gotcha는 있으나 "ACC_BOOK=분할 / ACC_BOOK_BAK=원본" 계약 명시 없음.

---

## 2. Scope

### 2.1 In Scope
- [ ] **회귀 테스트 (비대칭 계약)** — 후보자 분할 픽스처에서 export 파이프라인을 태워:
  - ACC_BOOK 산출: **분할 발생**(이동분 행 ≥1, 원본보다 행 수 증가 또는 자금원 다중화) 단언.
  - ACC_BOOK_BAK 산출: **원본과 행 수·금액 동일**(분할 미적용) 단언.
  - (선택) `normalize.test`의 sql.js 패턴 재사용해 실제 `.db` insert 후 SELECT로 ACC_BOOK 분할 행 존재 확인(.db 조립 수준 스모크).
- [ ] **문서화** — CLAUDE.md `SQLite Export/Import` 절에 "ACC_BOOK=재배분(분할) 보고용 / ACC_BOOK_BAK=원본 변경이력 백업(미분할)" 계약 1~2줄 추가. `docs/05-reference`(자금원배정방식 등) 해당 항목 보강.
- [ ] **메모리** — "export .db: ACC_BOOK 분할 / BAK 원본" 계약 메모(재질문 방지).

### 2.2 Out of Scope
- **ACC_BOOK_BAK 분할 적용** — 사용자 결정대로 제외(이력 백업 의미 보존). 향후 별도 결정 시 재논의.
- **분할 알고리즘(buildAdjustedAccBook/Pass0→1→2) 변경** — 정상, 불변.
- **프로덕션 export 로직 변경** — 동작 보존(테스트·문서만).

### 2.3 결정 필요 (Design)
1. 테스트 위치: 기존 `adjusted-ledger-parity.test.ts` 확장 vs 신규 `export-split-contract.test.ts`. (권장: 신규 — "비대칭 계약"이라는 의도가 파일명에 드러나게)
2. `.db` 조립 수준 스모크까지 갈지, 행집합(`finalAccBook*`) 단언으로 충분할지. (권장: 행집합 단언 + 가능하면 sql.js 스모크 1개)

---

## 3. Requirements

### 3.1 Functional Requirements
| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | 후보자 export에서 ACC_BOOK이 분할(이동분 생성)됨을 회귀로 단언 | High | Pending |
| FR-02 | 동일 픽스처에서 ACC_BOOK_BAK은 원본(미분할, 행수·금액 동일)임을 단언 | High | Pending |
| FR-03 | "ACC_BOOK=분할 / ACC_BOOK_BAK=원본" 계약을 CLAUDE.md·docs에 명시 | High | Pending |
| FR-04 | (선택) .db insert→SELECT 스모크로 ACC_BOOK 분할 행 존재 확인 | Low | Pending |

### 3.2 Non-Functional
- **프로덕션 무변경**: route.ts 동작 불변(테스트·문서만). 기존 292+ 테스트 회귀 0.
- **결정성**: 픽스처는 분할이 실제 일어나는 조건(자금원 소진→이동) 사용 [[parity-test-must-exercise-divergence-condition]].

---

## 4. Risks & Mitigations
| Risk | Mitigation |
|------|-----------|
| route.ts 헬퍼가 test에서 import 가능한가 | 이미 `allocateCandidateAccBookForExport`·`normalizeOfficialExpenseRow`·`stripAppOnlyAccBookColumns` export됨(기존 test가 import). BAK 경로는 동일 헬퍼 조합으로 재현 가능 |
| 문서만 늘고 강제력 없음 | 계약을 **테스트로** 못박아 CI 강제(FR-01/02). 문서는 보조 |
| 분할 알고리즘 변경 시 픽스처 취약 | 기대값을 "이동분 ≥1·BAK 원본 동일" 같은 구조 불변식으로(절대 금액 하드코딩 최소) |

---

## 5. Verification Plan
1. 신규 테스트 통과(FR-01~02, 선택 FR-04).
2. 기존 export-sqlite·accounting 테스트 전량 회귀 0.
3. CLAUDE.md·docs diff 리뷰로 계약 문구 확인.

---

## 6. Next
- `/pdca design export-db-split-verification` — 2.3 결정(테스트 위치·스모크 여부) 확정.
- 또는 범위가 작아 design 생략하고 곧장 테스트·문서 작성.
