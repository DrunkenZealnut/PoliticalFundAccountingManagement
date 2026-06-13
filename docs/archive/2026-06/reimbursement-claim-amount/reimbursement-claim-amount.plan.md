# reimbursement-claim-amount Planning Document

> **Summary**: 보전 대상 지출에 **보전청구액(`claim_amt`)** 개념을 도입한다. 일할계산 등으로 실지출액과 다른 보전 신청액을, 보전관리 화면에서 지출액 옆 컬럼으로 **인라인 수동 입력·수정**하고, **보전 출력(서식43·보전 첨부서류목록·Excel 보전청구서)에서는 지출액 대신 청구액**(`claim_amt ?? acc_amt`)이 들어가도록 한다. 회계장부·회계보고서·정산은 실지출액(`acc_amt`)을 그대로 유지한다.
>
> **Project**: 정치자금 회계관리 시스템 (political-fund-accounting-management)
> **Version**: 0.12.0.0 → 0.13.0.0(예정)
> **Author**: DrunkenZealnut
> **Date**: 2026-06-13
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 보전비용 중 일부 항목(예: 거리현수막 40일 중 13일만 사용)은 **일할계산한 금액**으로만 보전 신청해야 한다. 현재 시스템은 지출 1건당 실지출액(`acc_amt`)만 보관해, 보전청구서·보전 첨부서류목록 등 보전 출력이 항상 실지출 전액을 청구액으로 표기한다 → 일할 항목을 손으로 다시 계산·치환해야 하고, 과다청구·반려 리스크가 있다. |
| **Solution** | `acc_book`에 보전청구액 컬럼 `claim_amt`(정수, NULL=지출액 사용)를 신설하고, 보전관리 화면(dashboard/reimbursement)의 보전 항목 목록에서 **지출액 옆 청구액 컬럼을 인라인 수동 편집**한다. 보전 출력의 단일 진실원천인 `reimbursement-aggregator`·`reimbursement-doclist-builder`가 `acc_amt` 대신 신규 SSOT `claimAmount(row)=claim_amt ?? acc_amt`를 합산하도록 전환해, 서식43·보전 첨부서류목록·Excel 보전청구서·화면 합계가 일괄 청구액으로 출력된다. |
| **Function/UX Effect** | 보전관리 화면에서 보전 체크된 지출의 청구액을 일할금액 등으로 직접 수정(기본=실지출액). 보전 서류 출력 시 청구액이 자동 반영되어 손치환·검산 불필요. 회계장부·보고서·정산은 실지출 그대로라 회계 정합성 유지. |
| **Core Value** | "실제 지출"과 "보전 신청액"을 데이터로 분리해, 일할계산 보전 항목을 정확히 청구. 보전금 과다청구·반려 리스크를 제거하고, 직전 구현된 보전 출력 자동화(보전청구서·첨부서류목록)를 실무 청구 규칙에 맞게 완성한다. |

---

## 1. Overview

### 1.1 Purpose

보전 대상 지출의 **보전청구액**(`claim_amt`)을 실지출액(`acc_amt`)과 분리 보관·관리하여, 일할계산 등으로 실지출과 다른 금액을 보전 신청하는 항목을 정확히 처리한다. 청구액은 보전관리 화면에서 수동 입력하고, 보전 관련 출력에만 반영하며 회계 출력은 실지출을 유지한다.

### 1.2 Background

- **현 상태**: `acc_book`은 지출 1건당 `acc_amt`(실지출)만 보관. 보전 출력(서식43 보전청구서, 보전 첨부서류목록, Excel 보전청구서)은 모두 `acc_amt`를 청구액으로 사용한다.
- **실무 규칙(선관위 보전안내서)**: 일부 보전 항목은 실제 게시·사용 기간에 비례한 **일할계산 금액**으로만 보전 청구 가능(예: 거리게시용 현수막은 게시일수 기준, 샘플 문서의 "313,885원 / 총액 965,800원 (40일 중 13일 사용)").
- **선행 자산(직전 구현·재사용)**:
  - `lib/accounting/reimbursement-aggregator.ts` — 보전 체크 선거비용을 자금원별 합산하는 **보전 출력 SSOT**(서식43 HWPX + Excel 보전청구서 공유). `acc_amt` 합산 지점이 전환 대상.
  - `lib/hwpx/reimbursement-doclist-builder.ts` — 보전 첨부서류 점검목록표의 "보전청구액" 컬럼·소계. `acc_amt` 사용 지점이 전환 대상.
  - `lib/excel-template/reimbursement-claim-form.ts` — Excel 보전청구서(aggregator 결과 소비).
  - `dashboard/reimbursement/page.tsx` — 보전관리 화면(보전 체크 인라인 토글·합계). 청구액 인라인 편집 추가 지점.
  - `app/scripts/014_add_acc_time.sql` — acc_book 컬럼 추가 마이그레이션 패턴.
- **차이점(왜 신규 컬럼인가)**: 청구액은 지출액과 독립적으로 수정되어야 하며(일할 등), NULL이면 지출액을 그대로 청구하는 다수 케이스를 단순화해야 한다 → nullable 신규 컬럼 + 읽기 측 fallback이 최적.

### 1.3 Related Documents

- 직전 PDCA(보전 출력 자동화, 본 기능의 직접 선행): `docs/04-report/reimbursement-document-list.report.md`, `docs/02-design/features/reimbursement-document-list.design.md`
- 보전청구서(서식43): `docs/archive/2026-06/reimbursement-claim-hwpx/`
- 코드 SSOT: `app/src/lib/accounting/reimbursement-aggregator.ts`, `app/src/lib/hwpx/reimbursement-doclist-builder.ts`
- 스키마/export 주의: `app/scripts/014_add_acc_time.sql`, `app/src/app/api/system/export-sqlite/route.ts`(`stripAppOnlyAccBookColumns`)
- 근거 법령/안내: `RAG/(최종)제9회 전국동시지방선거 선거비용보전안내서(한글파일용).hwp`
- 메모리: `release-version-ssot`, `election-item-classification-ssot`

---

## 2. Scope

### 2.1 In Scope

- [ ] **마이그레이션 015** — `acc_book`·`acc_book_bak`에 `claim_amt BIGINT NULL`(보전청구액, NULL=지출액 사용) 추가. Supabase SQL 에디터 수동 적용.
- [ ] **types/database.ts** — `acc_book`·`acc_book_bak` Row 에 `claim_amt: number | null` 추가.
- [ ] **신규 SSOT** `lib/accounting/claim-amount.ts` — `claimAmount(row) = row.claim_amt ?? row.acc_amt`(순수, 보전 경로 전용) + 단위 테스트.
- [ ] **입력 UI** — `dashboard/reimbursement/page.tsx` 보전 항목 목록에 **지출액 옆 "청구액" 컬럼 + 인라인 편집**(보전 체크 항목 대상). 빈 값=NULL 저장(0과 구분). 저장은 acc-book `update`(또는 직접 supabase) 경로.
- [ ] **출력 전환(보전 전체)** — `reimbursement-aggregator`·`reimbursement-doclist-builder`의 금액 합산을 `claimAmount(r)`로 전환(타깃 게이트 `acc_amt>0`는 실지출 기준 유지). 관련 조회 select에 `claim_amt` 추가(서식43 route·doclist route·aggregate route). 보전관리 화면 합계도 `claimAmount`.
- [ ] **export-sqlite 회귀 방지** — `stripAppOnlyAccBookColumns`에 `claim_amt` 추가(PFund2 DDL 미보유 컬럼 누출로 백업 abort 방지).
- [ ] **테스트** — `claimAmount` 단위, aggregator/doclist 전환 검증(claim_amt 우선·NULL fallback), export-sqlite strip 검증, 회계 출력 불변(회귀) 확인.
- [ ] `app/VERSION` MINOR bump(0.12.0.0 → 0.13.0.0), 루트 `CHANGELOG.md`.

### 2.2 Out of Scope

- **자동 일할계산 보조**(게시일수/총일수 입력 → 자동 산정) — 사용자 합의로 MVP는 수동 입력만. 후속 feature.
- **지출 입력 화면(expense)·수기입력·일괄입력의 청구액 필드** — 입력은 보전관리 화면 인라인으로 한정(보전 대상에만 의미). 후속 확장 가능.
- **부담비용 지급청구서(서식44) 청구액 반영** — 단가×매수 산정이라 일할 개념과 1:1 대응이 아님. 본 범위 제외(필요 시 후속).
- **회계장부(서식7)·회계보고서(22-1/22-2/22-4)·수입·지출부·정산(settlement-calc)** — 실지출액(`acc_amt`) 유지(전환 금지). 서식22-2(선거비용 집계표)는 보전청구서가 아니라 실회계 보고이므로 청구액 미반영.

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | `acc_book`에 `claim_amt`(보전청구액, NULL 허용) 신규 컬럼. NULL이면 보전 출력에서 `acc_amt` 사용. | High | Pending |
| FR-02 | 보전관리 화면 보전 항목 목록에 지출액 옆 "청구액" 컬럼 + 인라인 수동 편집(보전 체크 항목). 빈 값=NULL 저장. | High | Pending |
| FR-03 | 보전 출력(서식43·보전 첨부서류목록·Excel 보전청구서·화면 합계)이 `claim_amt ?? acc_amt`를 사용. SSOT `claimAmount` 단일 경유. | High | Pending |
| FR-04 | 회계장부·회계보고서·수입지출부·정산은 `acc_amt` 그대로(불변). | High | Pending |
| FR-05 | 보전 대상 게이트(지출∧보전체크∧선거비용∧`acc_amt>0`)는 실지출 기준 유지 — 청구액 0/NULL이어도 누락·중복 없이 동작. | Medium | Pending |
| FR-06 | export-sqlite/백업이 `claim_amt`를 strip 해 PFund2 호환 유지(백업 정상). | High | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| 정합성 | 보전 출력 4경로(서식43·doclist·Excel·화면) 합계가 동일 청구액(SSOT 경유) | 교차검증 단위 테스트 |
| 무결성 | export-sqlite/백업이 claim_amt 추가 후에도 정상(컬럼 누출 0) | strip 단위 테스트 + 수동 백업 검증 |
| 회귀 안전 | 회계장부·보고서·정산 금액 불변 | 기존 빌더/정산 테스트 그린 |
| 데이터 | 빈 청구액=NULL(0과 구분), 음수 불가 | 입력 검증 + (선택) CHECK 제약 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] FR-01~FR-06 구현
- [ ] 마이그레이션 015 Supabase 적용 + types 재생성
- [ ] `claimAmount` SSOT·전환·strip·회귀 테스트 통과
- [ ] 보전 출력에 수정 청구액 반영, 회계 출력 불변 수동 확인
- [ ] design.md 작성 및 gap analysis ≥ 90%
- [ ] `app/VERSION`·`CHANGELOG.md` 갱신

### 4.2 Quality Criteria

- [ ] Lint 0 / Build 성공 / 기존 테스트 회귀 0
- [ ] 보전 SSOT(`claimAmount`)만 보전 경로에서 import(회계 경로 미오염)

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| export-sqlite에 claim_amt strip 누락 → 백업/PFund2 export 전체 abort | High | Medium | `stripAppOnlyAccBookColumns`에 추가(acc_time 선례) + strip 단위 테스트(FR-06) |
| 타깃 게이트를 `claim_amt`로 잘못 전환 → 청구 0원·실지출 양수 항목 누락 | High | Medium | 게이트는 `acc_amt>0` 유지 명문화(§2.1, FR-05), 전환은 합산 지점만 |
| 청구액 0 저장 → "청구액 0원" 오인(보전 누락) | Medium | Medium | 빈 값은 NULL 저장(0과 구분), 화면에 placeholder=지출액 표기 |
| 회계 출력에 청구액 누출(회계 정합 붕괴) | High | Low | `claimAmount`는 보전 경로만 import, 회계 빌더/정산 미변경 — 회귀 테스트로 보장 |
| 직전 doclist 미커밋 작업과 동일 파일(doclist-builder) 수정 중첩 | Low | Medium | 동일 브랜치에서 연속 작업(§8), doclist의 `amount` 토큰을 claimAmount로 전환하는 변경으로 자연 연결 |
| 화면 실지출 vs 청구액 혼동 | Low | Medium | 보전 탭에 "지출액/청구액" 2컬럼 동시 표기 |

---

## 6. Architecture Considerations

### 6.1 Project Level Selection

| Level | Selected |
|-------|:--------:|
| Dynamic (Next.js 16 + Supabase, 기능 모듈식) | ☑ |

### 6.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| 청구액 저장 | 신규 컬럼 / 별도 테이블 / 기존 필드 재활용 | **acc_book 신규 컬럼 `claim_amt`** | 지출 1:1, 단순 fallback, 마이그레이션 가벼움 |
| 기본값 규약 | DB default=acc_amt / 읽기 fallback | **읽기 fallback(`claim_amt ?? acc_amt`)** | NULL=미수정 다수 케이스 단순화, 지출액 변경 시 자동 추종 |
| 전환 SSOT | 각 출력 개별 / 공용 헬퍼 | **`lib/accounting/claim-amount.ts`** | aggregator·doclist·Excel·화면 단일 경유, 회계 경로와 import 분리 |
| 입력 위치 | 보전관리 인라인 / 지출 폼 / 둘 다 | **보전관리 화면 인라인**(사용자 선택) | 청구액은 보전 대상에만 의미, "보전비용관리" 맥락 |
| 일할계산 | 수동 / 자동 보조 | **수동 입력(MVP)**(사용자 선택) | 요구 일치, 범위 최소·안정 |

### 6.3 Clean Architecture Approach

```
신규/수정 (Dynamic)
─ app/scripts/015_add_claim_amt.sql            (신규, 수동 적용)
─ app/src/types/database.ts                    (수정: acc_book·bak Row claim_amt)
─ app/src/lib/accounting/
    claim-amount.ts                            (신규, 순수 SSOT)
    claim-amount.test.ts                       (신규)
    reimbursement-aggregator.ts                (수정: claimAmount 합산, AccBookRow.claim_amt)
─ app/src/lib/hwpx/reimbursement-doclist-builder.ts (수정: claimAmount, DoclistInputRow.claim_amt)
─ app/src/app/api/
    hwpx/reimbursement-claim/route.ts          (수정: select claim_amt)
    hwpx/reimbursement-doclist/route.ts        (수정: select claim_amt)
    reimbursement/claim-form/aggregate/route.ts(수정: select claim_amt)
    system/export-sqlite/route.ts              (수정: stripAppOnlyAccBookColumns += claim_amt)
─ app/src/app/dashboard/reimbursement/page.tsx (수정: 청구액 컬럼 + 인라인 편집 + 저장 + 합계)
─ app/VERSION, CHANGELOG.md
```

### 6.4 데이터 흐름

```
[입력] 보전관리 화면 인라인 → acc-book update(claim_amt, 빈값=NULL) → acc_book.claim_amt
[출력 보전] 조회(select +claim_amt) → claimAmount(r)=claim_amt??acc_amt
            → aggregator(서식43·Excel) / doclist-builder(첨부서류목록) / 화면 합계
[출력 회계] acc_amt 그대로 → income-ledger / report-summary / settlement (불변)
[백업] export-sqlite → stripAppOnlyAccBookColumns(claim_amt 제거) → PFund2 호환
```

---

## 7. Convention Prerequisites

- [x] 마이그레이션: `scripts/0NN_*.sql` 수동 적용(014 패턴), 추가는 가산·비파괴
- [x] acc_book 컬럼 추가 시 **export-sqlite 감사 필수**(CLAUDE.md 규약)
- [x] 보전 출력 SSOT(aggregator) 재사용, 회계 경로와 분리
- [x] `release-version-ssot`(app/VERSION) 준수, 매 feature MINOR bump
- [ ] 정의/검증할 것: `claimAmount` 위치(lib/accounting), 빈값=NULL 입력 규약, 보전 탭 2컬럼 표기

### 7.3 Environment Variables

| Variable | 변경 |
|----------|------|
| (기존 SUPABASE_* 재사용) | 없음 |

---

## 8. Next Steps

1. [ ] 설계 문서 작성 — `/pdca design reimbursement-claim-amount`
   - 보전관리 화면(보전 탭) 인라인 편집 구조 실측·저장 경로 확정, 청구액 컬럼/2컬럼 표기
   - `claimAmount` 시그니처·소비처 확정, 게이트 유지 규칙
   - export-sqlite strip·테스트 전략, 마이그레이션 SQL 확정
2. [ ] 구현 — 마이그레이션 → SSOT → 출력 전환 → 입력 UI → export strip → 테스트
3. [ ] Gap 분석(≥90%) → 보고서 → 아카이브

> **브랜치/커밋 노트**: 직전 `reimbursement-document-list`(보전 첨부서류목록) 작업이 현재 브랜치 `feature/reimbursement-document-list`에 미커밋 상태다. 본 기능은 그 doclist-builder를 직접 확장(청구액 반영)하므로 동일 브랜치 연속 작업이 자연스럽다. 커밋/PR 분리 여부는 do 단계에서 결정.

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-13 | 초안(코드베이스 2영역 조사 + 사용자 범위 확정 반영) | DrunkenZealnut |
