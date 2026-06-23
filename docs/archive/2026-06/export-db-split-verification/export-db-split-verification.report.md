# .db 생성 시 수입·지출 분할 — 검증·문서 보강 (export-db-split-verification) 완료 보고서

> **Summary**: 「자료백업」 SQLite `.db` 생성 시 수입·지출을 분할(자금원 재배분)한 데이터로 구성하는 기능은 **이미 구현·동작**(v0.19~, `ACC_BOOK`에 `buildAdjustedAccBook` 적용)함을 조사로 확인했다. 신규 구현 대신 사용자 결정("이미 분할됨 — 검증/문서만 보강")에 따라 **비대칭 계약(ACC_BOOK=분할 / ACC_BOOK_BAK=원본)을 회귀 테스트와 문서로 못박았다**. 프로덕션 코드 변경 0.
>
> **Project**: PoliticalFundAccountingManagement
> **Version**: 0.20.x → ship 시 확정 (test+doc only)
> **Feature Duration**: 2026-06-23 (Plan 조사 + 의도확인(AskUserQuestion) + Do; Design 생략 — 사용자 결정)
> **Author**: Claude · **Status**: ✅ Completed (핵심 FR 100%, FR-04 의도적 보류)

---

## Executive Summary

### 1.3 Value Delivered

| Perspective | Content (with metrics) |
|---|---|
| **Problem** | ".db에 분할 데이터가 들어가는가"가 코드만으론 불확실하고 문서에 명시가 없어 **재확인 요청이 반복**(이번 요청이 그 사례). 또 "ACC_BOOK 분할 / ACC_BOOK_BAK 원본" 비대칭을 지키는 **가드 테스트 부재** → 향후 누가 BAK도 분할하거나 ACC_BOOK 분할을 떼어내도 회귀 미탐지. |
| **Solution** | 조사로 현황 확정(ACC_BOOK은 `route.ts:770` `allocateCandidateAccBookForExport`=`buildAdjustedAccBook`로 이미 분할, ACC_BOOK_BAK은 `WORK_KIND`·`BAK_ID` 변경이력 백업이라 원본 보존). production 파이프라인(`finalAccBook`/`finalAccBookBak`)을 그대로 재현하는 **회귀 테스트 신규**(`export-split-contract.test.ts`, 4 케이스) + CLAUDE.md·메모리에 계약 명시. **프로덕션 코드 0줄 변경.** |
| **Function/UX Effect** | 개발자가 ".db = 보고용 분할(ACC_BOOK) + 원본 이력 백업(ACC_BOOK_BAK)"을 테스트·문서로 즉시 확인. export 변경이 계약을 깨면 CI 실패로 사전 차단. 검증 결과: 신규 4/4 통과, **export-sqlite 도메인 29/29 통과**(회귀 0), ESLint clean. |
| **Core Value** | 암묵적·검증 불충분하던 "분할된 .db" 불변식을 **명시적·회귀보장**으로 승격 → 동일 질문 재발 + 미래 회귀 동시 방지. |

---

## 1. PDCA 사이클 요약

### 1.1 Plan (계획)
- **계획 문서**: `docs/01-plan/features/export-db-split-verification.plan.md`
- **요청**: "*.db 생성 시 수입,지출 분할한 데이터로 구성"
- **조사 발견(전환점)**: 요청 기능은 **이미 구현됨** — `route.ts:497` `allocateCandidateAccBookForExport = buildAdjustedAccBook`, `:770` ACC_BOOK에 적용. `adjusted-ledger-parity.test.ts`가 분할을 단언. ACC_BOOK_BAK(`:777`)은 분할 미적용(변경이력 백업).
- **의도 확인(AskUserQuestion)**: 코드 현실과 요청 전제가 충돌 → 사용자에게 확인 → **「이미 분할됨 — 검증/문서만 보강」** 선택.

### 1.2 Design (설계)
- **생략** — 사용자 결정(검증/문서, 범위 소형). Plan의 §2.3 결정사항(테스트 위치=신규 파일, 스모크 범위=행집합 단언)을 Do에서 직접 채택.

### 1.3 Do (구현)
- **신규 테스트** `src/app/api/system/export-sqlite/export-split-contract.test.ts` (4 케이스):
  - FR-01: ACC_BOOK 분할 — 지출 150,000이 `84(100,000)`+`85(50,000)`로 분할, 행수 3→4
  - FR-02: ACC_BOOK_BAK 원본 — 행수·자금원 유지(지출 1건 `84/150,000`)
  - 분할 전후 지출 총액 보존(150,000)
  - 비후보자는 ACC_BOOK도 분할 안 함
- **문서** `CLAUDE.md` SQLite 절: "ACC_BOOK=분할(buildAdjustedAccBook) / ACC_BOOK_BAK=원본 변경이력 백업" 계약 + 회귀 테스트 포인터 명시.
- **메모리** `export-db-accbook-split-bak-raw` (재질문 방지).
- **프로덕션 코드 변경 0.**

### 1.4 Check (검증)
| 항목 | 결과 |
|---|---|
| 신규 테스트 | 4/4 통과 |
| export-sqlite 도메인 회귀 | 29/29 통과 (4파일) |
| ESLint (신규 파일) | clean (exit 0) |
| 프로덕션 영향 | 없음 (test+doc only) |

---

## 2. Requirements 충족

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | ACC_BOOK 분할(이동분 생성) 회귀 단언 | High | ✅ 완료 |
| FR-02 | ACC_BOOK_BAK 원본(미분할) 단언 | High | ✅ 완료 |
| FR-03 | "ACC_BOOK=분할 / BAK=원본" 계약 문서화(CLAUDE.md) | High | ✅ 완료 |
| FR-04 | (선택) .db insert→SELECT sql.js 스모크 | Low | ⏸ 보류(행집합 단언이 동일 파이프라인 커버) |

**Match Rate**: 핵심 FR(01–03) 100%. FR-04는 Low·optional로 의도적 보류 → 실질 완료.

---

## 3. 산출물
- `docs/01-plan/features/export-db-split-verification.plan.md`
- `app/src/app/api/system/export-sqlite/export-split-contract.test.ts` (신규)
- `CLAUDE.md` (SQLite 절 계약 추가)
- 메모리 `export-db-accbook-split-bak-raw`

## 4. 교훈 (Lessons)
- **요청 전제가 코드 현실과 충돌하면 plan보다 조사·확인이 먼저** — AskUserQuestion으로 "이미 구현됨"을 확인해 중복 구현을 회피했다.
- 암묵적 불변식(비대칭 계약)은 **테스트로 강제 + 문서로 가시화**해야 재질문·회귀를 동시에 막는다.

## 5. Next
- 미커밋 2개 feature(`reports-receipt-no-realloc-parity` + 본 건)를 `/ship`으로 PR화(VERSION bump + CHANGELOG).
- 완료 후 `/pdca archive export-db-split-verification`.
