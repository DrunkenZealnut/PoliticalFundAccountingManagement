# 지출항목 수입계정(자금원) 배정 방식 점검 및 개선 Design Document

> **Summary**: 배정 규칙(`buildLedgerRows` Pass0/1/2)은 변경하지 않고, ① SSOT를 우회하는 **데드 경로(V2 `/api/excel/report`)를 제거**하고, ② export-sqlite의 로컬 자금원 게이트(V3)를 SSOT 상수로 통합하며, ③ 현재 버려지는 **Shortfall(통장 부족) 신호를 순수 진단 헬퍼로 표면화**하고, ④ 모든 소비처가 동일 배분을 내는 **교차검증 가드 테스트**를 추가하고, ⑤ 흩어진 결정을 **단일 권위 문서**로 정리한다.
>
> **Project**: PoliticalFundAccountingManagement
> **Version**: 0.17.1.0
> **Author**: Claude
> **Date**: 2026-06-20
> **Status**: Draft
> **Planning Doc**: [expense-funding-allocation-review.plan.md](./expense-funding-allocation-review.plan.md)

---

## 1. Overview

### 1.1 Design Goals

1. **단일 SSOT 깔때기 강제** — acc_book 행을 (계정×과목) 장부/집계로 바꾸는 모든 **살아있는** 경로가 `buildLedgerRows`/`allocateCandidateLedgerRows` 하나를 통과한다. 우회하는 데드 경로는 유지·수리가 아니라 삭제한다.
2. **숨기지 말고 드러내기** — 통장 전체 부족(데이터 오류) 시 Pass1이 산출하는 `Shortfall`을 0으로 묻지 말고 사용자에게 경고로 노출한다.
3. **표류 구조적 차단** — 신규 소비처가 SSOT를 빠뜨려도 회귀 테스트가 잡는다.
4. **배분 규칙 불변** — Pass0/1/2 알고리즘 자체는 옳다고 판단, 손대지 않는다(점검 결과 자금원 단위 견고).

### 1.2 Design Principles

- **죽은 우회는 수리하지 않고 제거한다** (오해 유발 방지 > 보존). git 히스토리가 복원 경로를 남긴다.
- **진단은 순수 함수로** — Shortfall 감지는 사이드이펙트 없는 재사용 가능한 헬퍼. 기존 행-반환 SSOT의 시그니처는 건드리지 않는다(blast radius 최소).
- **out-of-scope 엄수** — 비후보자 배정·영구화 재도입·새 규칙은 다루지 않는다.

### 점검으로 확정된 사실 (설계 근거)

| 항목 | 조사 결과 | 설계 결정 |
|------|-----------|-----------|
| `/api/excel/report` (V2) | UI에서 **호출 안 됨**. `generateReport`/`queryReportData`는 이 데드 라우트만 import. 살아있는 Excel은 `/api/excel/export`(11컬럼)와 `reports/page.tsx`(이미 `buildLedgerRows` 사용, line 13) | **제거** (교체 아님) |
| `export-sqlite` (V3) | `allocateCandidateAccBookForExport`가 `planAllocationPersist`→내부 `buildLedgerRows`(persist-allocation.ts:126) 호출 → **배분은 이미 SSOT**. 로컬 `CANDIDATE_ACC_SEC_CDS`(route.ts:497)만 게이트로 별도 정의 | const만 SSOT로 통합(minor) |
| Shortfall | `reallocateFundSources`는 `{rows, redistributions, shortfalls}` 반환(fund-realloc.ts:64-67, 190)하나 `buildLedgerRows`가 `.rows`만 취해 **shortfall 폐기**(ledger-allocation.ts:54) | 순수 진단 헬퍼 신설로 재노출 |
| `/api/excel/export` (11컬럼) | acc_sec_cd별 원시 거래 나열(재배분 미적용) | **정상**(별개 산출물). 단 HWPX 22-4와의 정합은 §6 Open Question으로 분리 |

---

## 2. Architecture

### 2.1 Component Diagram — 목표 상태

```
raw acc_book rows (자금원 82~85 포함)
        │
        ▼  allocateCandidateLedgerRows / buildLedgerRows   ← 단일 SSOT
   Pass0 adjustNegativeIncome → Pass1 reallocateFundSources → Pass2 allocateIncomeToItems
        │                          │ (shortfalls 산출)
        │                          └──▶ detectCandidateShortfalls()  ★신설 진단 헬퍼
        ▼
  ┌─────┬───────────┬──────────────────┬───────────────────┐
  ▼     ▼           ▼                  ▼                   ▼
 page  HWPX22-1/2   HWPX22-4/서식7    export-sqlite        reports/page.tsx
 총괄  accounting-  income-ledger     (planAllocation      (이미 SSOT)
       report                          Persist→buildLedger)
        ▲                                     ▲
   [경고 배너]                          [V3: const→SSOT]
   detectCandidateShortfalls

  ✂ 제거: /api/excel/report → generateReport → queryReportData
           → queryIncomeExpenseReport(병렬분류)·queryLedgerData (V2, 데드)
```

### 2.2 Data Flow — Shortfall 표면화

```
rawRows ─▶ detectCandidateShortfalls(rawRows)
             │  Number(acc_amt) → adjustNegativeIncome
             │  → hasCandidateFundingSource? reallocateFundSources(...).shortfalls : []
             ▼
        Shortfall[]  (비어있음 = 정상 / 1건+ = 통장 부족 데이터 오류)
             │
   ┌─────────┼──────────────┐
   ▼         ▼              ▼
 page 배너  HWPX route 경고  (테스트 단언)
 "통장 잔액 부족 — 데이터 점검 필요: {자금원}/{일자}/{금액}"
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| `detectCandidateShortfalls` (신설) | `adjust-negative-income`, `fund-realloc`, `funding-source` | Pass0+Pass1 재사용해 shortfalls만 추출(순수) |
| page 총괄/HWPX route | `detectCandidateShortfalls` | 경고 표면화 |
| export-sqlite | `funding-source.FUNDING_SOURCE_BY_ACC_SEC_CD` | 로컬 const 대체 |

---

## 3. Data Model

신규 엔티티 없음. 기존 타입 재사용:

```typescript
// fund-realloc.ts:57 (기존)
interface Shortfall {
  acc_book_id: number;
  acc_date: string;
  accSecCd: number;   // 부족이 잔류한 자금원
  shortAmt: number;   // 충당 못 한 금액 (통장 전체 부족 시에만 > 0)
}

// 신설 (income-expense-report-summary.ts)
// raw acc_book 행 → 통장 부족 진단. 정상 데이터면 빈 배열.
export function detectCandidateShortfalls<T extends ReportSummaryRawRow>(rawRows: T[]): Shortfall[]
```

`detectCandidateShortfalls`는 `allocateCandidateLedgerRows`와 **동일한 전처리**(Number 정규화 + Pass0)를 거친 뒤, 후보자 자금원이 있으면 `reallocateFundSources(input).shortfalls`를, 없으면 `[]`를 반환한다. 멱등·사이드이펙트 없음.

---

## 4. API Specification

신규/변경 엔드포인트 없음. **제거 1건**:

| Method | Path | 처리 | 사유 |
|--------|------|------|------|
| GET/POST | `/api/excel/report` | **삭제** | UI 미사용 데드 라우트. SSOT 우회 병렬분류(V2)의 유일한 진입점 |

제거 동반 정리(같은 데드 체인):
- `app/src/app/api/excel/report/route.ts` — 삭제
- `app/src/lib/excel-template/index.ts` — `generateReport` 및 report 전용 분기 삭제(다른 export 타입[burden-cost/reimbursement/income-expense-book]이 같은 파일을 공유하면 해당 부분만 보존)
- `app/src/lib/excel-template/data-query.ts` — `queryReportData`/`queryIncomeExpenseReport`/`queryLedgerData` 삭제(다른 importer 없음 확인 완료)
- 연관 `types.ts`의 `ReportType`/`ReportRequest`가 데드 체인 전용이면 함께 정리

> **제거 전 필수 재확인(Do 단계 1행)**: `grep -rn "generateReport\|queryReportData\|excel/report"` 로 잔여 importer 0 재확인. 공유 파일(`index.ts`)은 부분 삭제.

---

## 5. UI/UX Design

### 5.1 Shortfall 경고 (page 총괄)

수입·지출보고서 page에서 `detectCandidateShortfalls(rawRows).length > 0`이면 기존 보정 배너 패턴(applyCorrections 배너)과 동일 위치에 경고 추가:

```
┌────────────────────────────────────────────────────────┐
│ ⚠ 통장 잔액 부족 — 자금원 배정 불가 행이 있습니다.        │
│   데이터를 점검하세요: 보조금(82) 2026-03-15 1,200,000원 │
│   (보고서 금액이 실제와 다를 수 있습니다)                 │
└────────────────────────────────────────────────────────┘
```

정상 데이터(통장≥0)에서는 shortfalls가 빈 배열이라 경고 미표시(오탐 없음).

### 5.2 HWPX route 경고

`api/hwpx/accounting-report`·`income-ledger` route는 UI가 아니므로, shortfall 발생 시 **응답 헤더 또는 로그 경고**(예: `console.warn` + `X-Allocation-Shortfall` 헤더)로 표면화. 생성 자체는 막지 않음(은폐만 금지).

---

## 6. Error Handling

| 상황 | 현재 | 개선 후 |
|------|------|---------|
| 통장 전체 부족(데이터 오류) | Pass1이 원본 자금원에 음수 잔류 + shortfall 산출하나 **buildLedgerRows가 폐기 → 조용히 음수/0** | `detectCandidateShortfalls`로 감지 → page 배너 / route 경고. 데이터 점검 유도 |
| `/api/excel/report` 호출 | 데드 라우트가 잘못된 병렬분류로 응답(보조금외=0) | 라우트 제거 → 404(애초에 UI 미사용) |

### Open Question (§6, 범위 밖이지만 기록)

**Excel `/api/excel/export`(11컬럼 수입부/지출부)는 재배분 미적용**, HWPX 22-4(14컬럼)는 재배분 적용. 둘이 "수입·지출부"라는 이름을 공유하나 산출물 종류가 다르다(개별 vs 통합). 사용자에게 **두 Excel/HWPX 수입·지출부 수치가 의도적으로 다를 수 있음**을 확인 필요. 본 작업 범위 밖 — 별도 의사결정.

---

## 7. Security Considerations

- [x] 데드 라우트 `/api/excel/report` 제거 → 공격 표면 감소
- [x] export-sqlite 인가는 기존 유지(본 작업이 약화 안 함)
- [x] `detectCandidateShortfalls`는 순수 함수(외부 입력 신뢰경계 없음)
- [ ] HWPX route 경고 헤더에 민감정보(거래 상세) 과다 노출 주의 — 자금원/일자/금액 요약만

---

## 8. Test Plan

### 8.1 Test Scope

| Type | Target | Tool |
|------|--------|------|
| Unit | `detectCandidateShortfalls` (정상=빈, 통장부족=비어있지않음) | Vitest |
| Unit | export-sqlite 자금원 게이트(V3) 동작 불변 | Vitest |
| Cross-validation (FR-04) | 동일 픽스처 → page 총괄·allocateCandidateLedgerRows·export 경로의 (계정×과목) 집계 동일 | Vitest |
| Regression | 기존 780 vitest 전부 통과 | Vitest |

### 8.2 Test Cases (Key)

- [ ] **TC-1** 정상 후보자 데이터(통장≥0) → `detectCandidateShortfalls` == `[]`
- [ ] **TC-2** 통장 전체 부족 픽스처(총지출 > 총수입) → shortfalls 비어있지 않음 + shortAmt > 0
- [ ] **TC-3** 비후보자(82~85 없음) → `detectCandidateShortfalls` == `[]` (배분 미적용)
- [ ] **TC-4 (FR-04 가드)** 자금원 분할 발생 픽스처 → `allocateCandidateLedgerRows`의 (계정×과목)별 합 == `buildCandidateReportSummary` 모델의 해당 셀 == export 경로(`planAllocationPersist`) 결과. 세 경로 동일성 단언
- [ ] **TC-5** V3 게이트 교체 후: 후보자 .db는 분할, 후원회 .db는 무변경(기존 동작 보존)
- [ ] **TC-6** `/api/excel/report` 제거 후 잔여 importer 0 (grep 가드 또는 빌드 통과)

### 8.3 회귀 안전

`node node_modules/vitest/vitest.mjs run` 전체 통과 + `node node_modules/eslint/bin/eslint.js <변경파일>` clean + `tsc --noEmit` 변경 파일 에러 0.

---

## 9. Clean Architecture

| Component | Layer | Location |
|-----------|-------|----------|
| `detectCandidateShortfalls`, `allocateCandidateLedgerRows`, `buildLedgerRows`, Pass0/1/2 | Domain (순수 회계 로직) | `src/lib/accounting/` |
| export-sqlite route, hwpx routes | Infrastructure/API | `src/app/api/` |
| page 총괄 배너 | Presentation | `src/app/dashboard/income-expense-report/` |

의존 방향 준수: API/Presentation → Domain(`lib/accounting`). Domain은 외부 비의존(순수). `/api/excel/report` 제거는 Infra 계층 축소.

---

## 10. Coding Convention Reference

| Item | Convention Applied |
|------|-------------------|
| 함수 naming | camelCase (`detectCandidateShortfalls`) |
| 상수 | `FUNDING_SOURCE_BY_ACC_SEC_CD`(기존 SSOT) 사용, 로컬 `CANDIDATE_ACC_SEC_CDS` 금지 |
| 테스트 | `income-expense-report-summary.test.ts` 패턴 재사용(meta factory, 합 보존 단언) |
| 경고 표면화 | 기존 page 보정 배너 패턴 일치 |

---

## 11. Implementation Guide

### 11.1 변경 파일

```
신설:
  src/lib/accounting/income-expense-report-summary.ts  (+ detectCandidateShortfalls)
  src/lib/accounting/income-expense-report-summary.test.ts  (+ TC-1~4)

수정:
  src/app/api/system/export-sqlite/route.ts  (V3: const → FUNDING_SOURCE_BY_ACC_SEC_CD)
  src/app/dashboard/income-expense-report/page.tsx  (Shortfall 배너)
  src/app/api/hwpx/accounting-report/route.ts + income-ledger/route.ts  (Shortfall 경고 헤더/로그)

삭제(데드 V2 체인):
  src/app/api/excel/report/route.ts
  src/lib/excel-template/data-query.ts (queryReportData/queryIncomeExpenseReport/queryLedgerData)
  src/lib/excel-template/index.ts (generateReport 분기) — 공유 파일이면 부분 삭제

문서(FR-05):
  docs/05-reference/자금원배정방식.md (신설 권위 문서)
  선행 Draft plan 3종에 superseded 표기
```

### 11.2 Implementation Order

1. [x] **데드 코드 제거 재확인** — `grep -rn "generateReport\|queryReportData\|excel/report"` 잔여 importer 0 확인 ✅ (전체 의존성 추적: 데드 셋이 서로만 import, 외부 소비처 0)
2. [x] **FR-03** `detectCandidateShortfalls` + TC-1~3 (순수 헬퍼 먼저, TDD) ✅ (RED→GREEN, TC-1~3 + 경계/멱등 5 테스트, `toReallocInput` 공유 헬퍼 추출)
3. [x] **FR-04** 교차검증 가드 TC-4 (세 경로 동일성) ✅ (SSOT==export 셀 동일 + degenerate 가드 + 모델 정합; 일시 교란으로 표류 포착 검증 후 복원)
4. [x] **FR-01** `/api/excel/report` 데드 체인 삭제 + TC-6 ✅ (13개 파일 삭제 / 780 vitest 통과 / TC-6 grep 0 / eslint clean)
5. [x] **FR-02** export-sqlite V3 const 통합 + TC-5 ✅ (로컬 `CANDIDATE_ACC_SEC_CDS` 제거 → `FUNDING_SOURCE_BY_ACC_SEC_CD` 판정, `allocateCandidateAccBookForExport` export + 게이트 TC-5 3건; TDD RED→GREEN→REFACTOR로 동작 보존 검증)
6. [x] **Shortfall 표면화** page 배너(Error 팔레트) + HWPX route 경고(console.warn + `X-Allocation-Shortfall` 건수 헤더, 상세는 서버 로그만 — §7 보안) ✅ (accounting-report·income-ledger 2개 route + page)
7. [x] **FR-05** 권위 문서 작성 + 선행 plan superseded 표기 ✅ (docs/05-reference/자금원배정방식.md 신설 + 선행 Draft 3종 superseded 배너)
8. [ ] 전 테스트·lint·tsc → `/pdca analyze` ← **다음: 갭검증**

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-20 | 초안 — 점검 결과(V2 데드/V3 minor/Shortfall 폐기) 기반 설계. 제거 1·통합 1·진단 헬퍼 1·가드 테스트·문서통합 | Claude |
