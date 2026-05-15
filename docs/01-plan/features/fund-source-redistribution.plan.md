# 자금출처 충당 재배분 알고리즘 (fund-source-redistribution) Planning Document

> **Summary**: 선관위 PFund2의 결산 시 지출을 자금출처별로 재배분하는 로직을 구현. 보조금 보전 인정 한도를 초과한 분과 후원회기부금 잔액을 자산 지출로 이동하여 결산 수치를 PFund2와 0원 차이로 맞춤
>
> **Project**: PoliticalFundAccountingManagement
> **Author**: Claude
> **Date**: 2026-05-15
> **Status**: Draft
> **Related**: `official-program-parity` (Archived, Match 96.5%) — 본 기능은 그 잔여 갭 중 가장 중요한 항목

---

## Executive Summary

| 항목 | 내용 |
|---|---|
| Feature | fund-source-redistribution |
| 시작일 | 2026-05-15 |
| 예상 기간 | 3~5일 (reverse-engineering 1~2일 + 구현 1~2일 + 검증 1일) |
| 영향 범위 | `lib/accounting/settlement-calc.ts` + `income-expense-report` + `submit` + `export-sqlite` (OPINION 동기화) + 신규 UI (보전 인정액 입력) |

### Value Delivered (4-Perspective)

| Perspective | 내용 |
|---|---|
| **Problem** | 우리 결산이 PFund2 대비 정확히 **1,870,675원 차이** (실측치, `settlement-report-correction.plan` §1.2). 원인: 선관위는 보조금 4,415,000원 중 보전 인정 2,548,335원만 보조금 지출로 인정하고, 비인정분 1,866,665원과 후원회기부금 잔액 4,010원을 모두 자산 지출로 재배분. 우리는 원시 데이터를 그대로 합산하므로 보전청구서·회계보고서 수치가 PFund2 결과와 불일치 → 결국 사용자는 PFund2로 한 번 더 검증해야 함. |
| **Solution** | (1) PFund2의 재배분 알고리즘을 실측 데이터 여러 케이스로 reverse-engineer, (2) `settlement-calc.ts`의 `applyFundSourceRedistribution` placeholder를 실제 구현으로 교체, (3) **선관위 보전 인정액**을 사용자가 입력할 수 있는 UI 추가 (자동 결정 불가), (4) OPINION 동기화와 export-sqlite에 재배분 결과 반영. |
| **Function/UX Effect** | 사용자가 결산 페이지에서 "보전 인정액" 입력 → 재배분 결과를 미리보기로 확인 → 확정 시 OPINION·보고서·`.db` export에 모두 반영. 결과적으로 우리 웹앱만으로 PFund2와 0원 차이 결산 보고서 완결 — PFund2 의존 종료. |
| **Core Value** | "**PFund2를 완전히 대체하는 결산 시스템**". `official-program-parity`가 호환성을 달성했다면 본 기능은 **PFund2 없이도 결산 완결 가능**한 마지막 퍼즐. 윈도우 PC 없는 사용자가 결산-보전청구-제출 전 과정을 클라우드 단독으로 끝낼 수 있게 됨. |

---

## 1. Overview

### 1.1 Purpose

`official-program-parity` 작업에서 settlement-calc의 `applyFundSourceRedistribution` 옵션은 placeholder noop으로 두었다(Iter 1 simplify로 corrections 노이즈도 제거됨). 본 기능은 그 placeholder를 실제 알고리즘으로 채우는 작업이다.

### 1.2 Background

#### 검증된 차이 (실측치)

`RAG/Fund_Data_1.db`의 실 데이터에서 우리 시스템과 PFund2의 차이를 비교:

**원시 데이터 (DB)**:
| 자금 출처 | 수입 | 지출 |
|---|---:|---:|
| 보조금 | 4,415,000 | 4,415,000 |
| 후원회기부금 | 4,010 | 4,010 |
| 자산 | 8,500,055 | 99,325 |

**PFund2 결산 결과** (재배분 후):
| 자금 출처 | 수입 | 선거비용 지출 |
|---|---:|---:|
| 보조금 | 4,415,000 | **2,548,335** (보전 인정분만) |
| 후원회기부금 | 4,010 | **0** (잔액 이동) |
| 자산 | 8,500,055 | **1,970,000** (= 99,325 + 1,866,665 + 4,010) |

**재배분 규모**: 1,870,675원 자산으로 이동

#### 제도적 배경

- 정치자금법 + 공직선거법: 보조금은 선관위가 보전 인정한 금액 한도까지만 보조금이 부담. 비인정분은 후보자 자체 자금(자산)이 부담.
- 후원회기부금 잔액 처리 규칙은 별도 (정확한 근거 규정은 reverse-engineering 단계에서 식별).

### 1.3 Related Documents

| 문서 | 관련성 |
|---|---|
| `docs/archive/2026-05/official-program-parity/` | 본 기능의 placeholder가 있던 상위 작업 (Match 96.5%) |
| `docs/01-plan/features/settlement-report-correction.plan.md` | §1.2 원인 2에서 정확한 수치 검증됨 |
| `RAG/Fund_Data_1.db` | 검증 기준 실 데이터 |
| `app/src/lib/accounting/settlement-calc.ts` | `applyFundSourceRedistribution` placeholder 위치 |

---

## 2. Scope

### 2.1 In Scope

- [ ] **PFund2 재배분 알고리즘 reverse-engineering** — 최소 3개 케이스 (보조금 단독, 후원회기부금 단독, 혼합)
- [ ] **`applyFundSourceRedistribution` 실제 구현** — settlement-calc 모듈
- [ ] **보전 인정액 입력 UI** — 결산 관련 페이지에 입력 폼 추가
- [ ] **재배분 미리보기** — 사용자가 확정 전 결과 확인 가능
- [ ] **OPINION 동기화** — 재배분 후 in_amt/cm_amt/balance_amt 갱신
- [ ] **`.db` export 반영** — export-sqlite가 재배분 후 수치 사용
- [ ] **회귀 테스트** — 마이너스 수입 보정과 함께 사용했을 때 결과 일관성

### 2.2 Out of Scope

- 선관위 보전 인정액 **자동 결정** — 정책적으로 불가능 (선관위 심사 결과에 의존). 사용자 수동 입력만 지원.
- 재배분 결과에 따른 `acc_book` 원본 데이터 수정 — 원본은 보존, 결산 시점에만 가상 변환.
- PFund2 외의 다른 결산 도구 호환성.

---

## 3. 핵심 도전 과제

### 3.1 알고리즘 reverse-engineering (가장 큰 리스크)

**현재 알고 있는 것** (검증된 1개 케이스):
- 보조금 4,415,000 → 보전 인정 2,548,335만 보조금 지출, 잔액 1,866,665는 자산으로
- 후원회기부금 4,010 → 전액 자산으로 이전

**모르는 것**:
- 보조금 종류별(경상 4, 선거 5, 여성 6, 장애인 104) 처리가 다른가?
- "보전 인정" 판단 기준이 항목별인가 합산인가?
- 후원회기부금 잔액 이전이 항상인가 조건부인가?
- 자산 이전 시 선거비용/선거비용외 어떻게 분류되나?
- 보전 비인정분이 자산을 초과하면? (자산이 부족한 경우)

**접근법**:
1. 사용자가 보유한 추가 PFund2 `.db` 파일 수집 (다양한 시나리오)
2. 각 파일에 대해 원시 데이터 vs PFund2 결산 결과 비교
3. 차이 패턴 추출하여 가설 검증
4. 정치자금법·공직선거관리규칙 관련 조항 교차 확인

### 3.2 사용자 입력 (보전 인정액)

선관위가 보전을 결정하기 전(선거 직후)에도 추정치를 입력해 미리 결산을 시뮬레이션할 수 있어야 함:

- **초안 모드**: 사용자가 추정 보전 인정액 입력 → 잠정 결산
- **확정 모드**: 선관위 보전 결정 후 실제 인정액 입력 → 최종 결산
- 두 모드의 결과는 OPINION 테이블에서 구분 (acc_title 또는 별도 컬럼)

### 3.3 기존 코드와의 호환성

- `computeBalances` 시그니처를 깨지 않고 옵션으로만 활성화
- `applyCorrections`(마이너스 수입) → `applyFundSourceRedistribution` 순서 보장
- export-sqlite의 OPINION sync 분기 추가

---

## 4. 구현 전략

### 4.1 Phase 1: Reverse-Engineering

```text
[1] 사용자에게 추가 .db 파일 요청 (최소 3개, 다양한 출처 조합)
       ↓
[2] tests/fixtures/redistribution-cases/ 에 픽스처 저장
       ↓
[3] 케이스별 (원시 → PFund2 결과) 비교표 작성 (docs/research/)
       ↓
[4] 가설 도출 + 정치자금법 조항 매칭
       ↓
[5] 알고리즘 의사코드 확정
```

### 4.2 Phase 2: 구현

**`lib/accounting/settlement-calc.ts` 보강**:

```ts
export interface ReimbursementCaps {
  /** 자금출처별 보전 인정 한도 (선관위 결정 또는 사용자 추정) */
  byAccount: Map<number, number>;  // acc_sec_cd → 인정액
  /** 후원회기부금 잔액 자산 이전 활성화 */
  redistributeSupporter: boolean;
}

export interface ComputeBalancesOptions {
  // ... 기존 옵션
  applyFundSourceRedistribution?: boolean;
  /** 재배분 활성화 시 필수 입력 */
  reimbursementCaps?: ReimbursementCaps;
}
```

**알고리즘 (가설 — Phase 1 결과로 확정)**:

```ts
function applyFundSourceRedistribution(
  rows: AccBookRow[],
  caps: ReimbursementCaps,
): { rows: AccBookRow[]; redistributions: Redistribution[] }
```

### 4.3 Phase 3: UI

**결산 관련 페이지** (`income-expense-report`, `submit`)에 추가:

```
┌────────────────────────────────────────────┐
│  💰 자금출처 재배분 설정                    │
├────────────────────────────────────────────┤
│  □ PFund2 호환 재배분 적용                 │
│                                            │
│  보전 인정액 (선관위 결정 또는 추정):     │
│   경상보조금:  [_______] 원               │
│   선거보조금:  [_______] 원               │
│   여성추천보조금: [____] 원               │
│   장애인추천보조금: [__] 원               │
│                                            │
│  □ 후원회기부금 잔액 자산 이전             │
│                                            │
│  [미리보기]  [결산 확정]                  │
├────────────────────────────────────────────┤
│  재배분 결과:                              │
│  - 보조금 → 자산: 1,866,665원              │
│  - 후원회기부금 → 자산: 4,010원            │
│  - 자산 선거비용 지출: 99,325 → 1,970,000│
└────────────────────────────────────────────┘
```

### 4.4 Phase 4: Export-sqlite + OPINION 동기화

- `applyFundSourceRedistribution`이 활성화된 결산값을 OPINION에 반영
- export-sqlite는 OPINION의 재배분 후 값을 그대로 export
- `acc_book` 원본은 수정하지 않음 (보존)

---

## 5. 영향받는 파일

| 파일 | 변경 종류 |
|---|---|
| `app/src/lib/accounting/settlement-calc.ts` | 보강 (placeholder → 실제 구현, ReimbursementCaps 타입 추가) |
| `app/src/lib/accounting/settlement-calc.test.ts` | 추가 (재배분 케이스 단위 테스트) |
| `app/src/app/dashboard/income-expense-report/page.tsx` | 보전 인정액 입력 폼 추가 |
| `app/src/app/dashboard/submit/page.tsx` | 결산 확정 시 재배분 옵션 사용 |
| `app/src/app/api/system/recompute-settlement/route.ts` | reimbursementCaps 파라미터 수용 |
| `app/src/app/api/system/export-sqlite/route.ts` | OPINION 재배분 결과 반영 (이미 동기화 로직 있음) |
| `tests/fixtures/redistribution-cases/` (신규) | reverse-engineering 픽스처 |
| `docs/research/pfund2-redistribution-analysis.md` (신규) | 알고리즘 분석 노트 |

---

## 6. 검증 방법

### 6.1 단위 테스트

```
- 기지 케이스 (settlement-report-correction §1.2):
  보조금 4,415,000 + 인정 2,548,335 → 자산 +1,866,665
  후원회기부금 4,010 → 자산 +4,010
  자산 선거비용 99,325 → 1,970,000

- 엣지 케이스:
  - 보조금 100% 보전 인정 (재배분 0)
  - 보조금 0원 보전 (전액 자산 이전)
  - 자산 부족 (음수 처리?)
  - 후원회기부금 없음
```

### 6.2 통합 테스트

- `RAG/Fund_Data_1.db` round-trip: 우리 결산 = PFund2 결산 (0원 차이)
- 신규 픽스처 (Phase 1에서 수집): 각각 0원 차이 검증

### 6.3 사용자 시나리오

1. 사용자가 평소처럼 수입/지출 입력
2. 선거 종료 후 결산 페이지 진입
3. 보전 인정액 입력 (추정 또는 선관위 결정)
4. "미리보기" 클릭 → 재배분 결과 확인
5. "결산 확정" → OPINION 갱신
6. `.db` export → PFund2 결과와 동일 수치

---

## 7. 리스크 & 가정

| 항목 | 리스크 | 완화 |
|---|---|---|
| 알고리즘 reverse-engineering 실패 | PFund2 결과를 1개 케이스만 본 상태 — 다른 시나리오에서 다를 수 있음 | 사용자에게 추가 `.db` 수집 요청. 최소 3개 케이스 확보 후 가설 검증. 부족하면 기존 케이스(현재 검증된 1개)만 보장하고 나머지는 단계적 보강 |
| 보전 인정액 사용자 입력 부담 | UI가 복잡해질 수 있음 | 1단계: 단순 4입력 폼. 추후 선관위 공시 데이터 자동 import 검토 |
| 정치자금법 해석 차이 | 우리 알고리즘이 법 해석과 다를 수 있음 | 분석 노트(`docs/research/`)에 조항·판례 인용. 회계 전문가 리뷰 받기 (필요 시) |
| 회귀 위험 | `applyFundSourceRedistribution=false`(기본)일 때 기존 결산이 깨지면 안 됨 | 기본 false 유지 + 회귀 테스트로 검증 |
| 사용 빈도 낮음 → 가성비 | 선거당 1회 사용, 구현 비용 vs 가치 비교 | PFund2 의존 종료라는 큰 가치. 한 번 만들면 모든 선거에서 활용 |

---

## 8. 완료 조건 (Definition of Done)

- [ ] PFund2 재배분 알고리즘이 최소 3개 케이스에서 0원 차이 일치
- [ ] `applyFundSourceRedistribution=true`일 때 corrections에 redistribution 내역 audit 누적
- [ ] 결산 페이지에서 보전 인정액 입력 + 미리보기 동작
- [ ] OPINION 테이블에 재배분 후 수치 자동 동기화
- [ ] `.db` export 결과가 PFund2 [자료 복구] 후 동일 수치로 표시
- [ ] 기본값(false) 모드에서 기존 결산 회귀 없음 (`official-program-parity`의 57개 테스트 모두 통과 유지)
- [ ] 분석 노트(`docs/research/pfund2-redistribution-analysis.md`) 작성

---

## 9. 후속 단계

1. **사용자 협조 필요**: PFund2 `.db` 추가 파일 2~3개 (다양한 출처 조합)
2. `/pdca design fund-source-redistribution` — 알고리즘 의사코드 + UI 와이어프레임 확정
3. Phase 1 (reverse-engineering) → Phase 2 (구현) → Phase 3 (UI) → Phase 4 (export 동기화) 순서로 진행
4. 가성비가 낮다고 판단되면 본 기능 보류하고 placeholder 유지 가능 (현재 96.5% 달성된 상태)

---

## 10. 의사결정 메모

이 기능은 `official-program-parity`에서 **의도적으로 placeholder로 두었던** 마지막 큰 갭. 진행 여부는 다음에 달림:

- ✅ **진행**: PFund2 의존을 완전히 끊고 싶을 때 (특히 선거 직전·직후 시점)
- ⏸️ **보류**: PFund2를 보조 도구로 계속 쓸 거라면 부분 호환(96.5%)으로 충분

사용자 결정 후 design 단계 진입 권장.
