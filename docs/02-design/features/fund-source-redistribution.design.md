# fund-source-redistribution Design Document

> **Summary**: PFund2의 자금출처 충당 재배분 알고리즘 v1을 settlement-calc에 구현. 보조금 보전 비인정분과 후원회기부금 잔액을 자산 선거비용으로 이전하여 결산 수치를 PFund2와 일치시킴
>
> **Project**: PoliticalFundAccountingManagement
> **Version**: 0.1.0
> **Author**: Claude
> **Date**: 2026-05-15
> **Status**: Draft
> **Planning Doc**: [fund-source-redistribution.plan.md](../../01-plan/features/fund-source-redistribution.plan.md)
> **Research Note**: [pfund2-redistribution-analysis.md](../../research/pfund2-redistribution-analysis.md)

---

## 1. Overview

### 1.1 Design Goals

1. **PFund2 동등성**: Phase 1에서 검증된 Case A (Fund_Data_1)에서 PFund2 결산과 0원 차이 (보조금 비인정 1,866,665원 자산 이전 부분에 한함)
2. **SSOT 강화**: `settlement-calc.applyFundSourceRedistribution` placeholder를 실제 동작으로 교체. 다른 모듈은 의존성 변경 없음
3. **사용자 입력 최소화**: 보전 인정액 1개 숫자 입력 + 옵션 토글만으로 동작
4. **회귀 안전**: 기본값 `false` 유지, 기존 57개 테스트 모두 통과 유지
5. **점진적 보강**: 가설 v1로 시작 → 미스터리 4,010원 + 자산 부족 케이스는 후속 iteration

### 1.2 Design Principles

- **원본 불변**: `acc_book` 데이터 mutate 없음. 결산 시점에 가상 변환만.
- **순수 함수**: 새 로직도 React/Next 의존 없는 순수 함수로 (다른 SSOT 모듈과 동일)
- **명시적 입력**: 보전 인정액은 항상 사용자 입력 (자동 결정 시도 안 함)
- **Audit trail**: 모든 재배분을 `Correction` 객체로 누적, UI에 노출 가능

---

## 2. Architecture

### 2.1 Component Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                  결산 페이지 (Presentation)                      │
│  income-expense-report  /  submit  /  recompute-settlement     │
└────────────────────┬───────────────────────────────────────────┘
                     │ ReimbursementCaps 입력 + 토글
                     ▼
┌────────────────────────────────────────────────────────────────┐
│        Application: settlement-calc.ts (SSOT)                  │
│                                                                │
│  computeBalances(rows, options)                                │
│    ├── applyCorrections (Rule 1: 마이너스 수입)  ← 기존        │
│    ├── applyFundSourceRedistribution (Rule 2)  ← 신규 구현      │
│    │     ├── 5.1 보조금 비인정분 → 자산 선거비용                │
│    │     └── 5.2 후원회기부금 잔액 → 자산 선거비용              │
│    └── 합계/계정별/자금출처별 집계                              │
│                                                                │
└────────────────────┬───────────────────────────────────────────┘
                     │ corrections audit
                     ▼
┌────────────────────────────────────────────────────────────────┐
│   Infrastructure: OPINION 동기화 + .db Export                  │
│   recompute-settlement / export-sqlite                         │
└────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow

```
[acc_book] → applyCorrections (Rule 1)
          → applyFundSourceRedistribution (Rule 2, opt-in)
          → 집계 (byAccount, byFundSource)
          → SettlementResult { 합계, corrections[] }
          → OPINION upsert (in_amt/cm_amt/balance_amt)
          → export-sqlite 시 OPINION이 PFund2 결과와 일치
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|---|---|---|
| `applyFundSourceRedistribution` | `AccBookRow`, `Correction` types | 결산 보정 |
| `computeBalances` | Rule 1 + Rule 2 | 통합 결산 |
| 결산 페이지 | `ReimbursementCaps` 입력 | UX |
| OPINION sync | `settlement.byFundSource` | export 일치 |

---

## 3. Data Model

### 3.1 신규 타입

```typescript
// settlement-calc.ts에 추가

export interface ReimbursementCaps {
  /**
   * 자금출처(acc_sec_cd)별 보전 인정액 (원).
   * 키 없는 자금출처는 cap=0(전액 비인정).
   * 예: { 82: 2_548_335 } — 보조금 82의 인정액 254만원
   */
  byAccSecCd: Record<number, number>;

  /**
   * 후원회기부금 잔액의 자산 이전 활성화.
   * 기본 true. false면 5.2 규칙 비활성.
   */
  redistributeSupporterRemainder?: boolean;
}

export interface RedistributionDetail {
  /** 출발 자금출처 acc_sec_cd */
  fromAccSecCd: number;
  /** 도착 자금출처 acc_sec_cd (현재는 항상 84=자산) */
  toAccSecCd: number;
  /** 도착 항목 item_sec_cd (현재는 항상 86=선거비용) */
  toItemSecCd: number;
  /** 이전 금액 (양수) */
  amount: number;
}

// 기존 ComputeBalancesOptions 확장
export interface ComputeBalancesOptions {
  // ... 기존 필드
  applyFundSourceRedistribution?: boolean;
  /** 재배분 활성화 시 필수 */
  reimbursementCaps?: ReimbursementCaps;
}
```

### 3.2 코드 상수 (settlement-calc.ts 내부)

```typescript
/**
 * 후보자 계정구분 (CS_ID=10).
 * Phase 1 reverse-engineering으로 확정.
 */
const CANDIDATE_ACC_SEC = {
  보조금: 82,
  보조금외지원금: 83,
  자산: 84,
  후원회기부금: 85,
} as const;

const CANDIDATE_ITEM_SEC = {
  선거비용: 86,
  선거비용외: 87,
} as const;

const SUBSIDY_ACC_SEC_CDS: ReadonlySet<number> = new Set([
  CANDIDATE_ACC_SEC.보조금,
  CANDIDATE_ACC_SEC.보조금외지원금,
]);
```

### 3.3 OPINION 테이블 (변경 없음)

`recompute-settlement` API와 `export-sqlite` 라우트가 이미 OPINION을 동기화하는 구조 보유 (Phase B/C). 재배분 활성화 여부에 따라 `in_amt/cm_amt/balance_amt`만 다르게 계산됨.

---

## 4. Algorithm (가설 v1)

### 4.1 Pseudocode

```typescript
export function applyFundSourceRedistribution(
  rows: readonly AccBookRow[],
  caps: ReimbursementCaps,
): { rows: AccBookRow[]; corrections: Correction[]; details: RedistributionDetail[] } {
  const { byAccSecCd, redistributeSupporterRemainder = true } = caps;
  const corrections: Correction[] = [];
  const details: RedistributionDetail[] = [];

  // 5.1 보조금 비인정분 → 자산 선거비용
  for (const subsidyCd of SUBSIDY_ACC_SEC_CDS) {
    const subsidyExpense = sumExpense(rows, subsidyCd);
    const cap = byAccSecCd[subsidyCd] ?? 0;
    const nonReimbursable = Math.max(0, subsidyExpense - cap);
    if (nonReimbursable > 0) {
      details.push({
        fromAccSecCd: subsidyCd,
        toAccSecCd: CANDIDATE_ACC_SEC.자산,
        toItemSecCd: CANDIDATE_ITEM_SEC.선거비용,
        amount: nonReimbursable,
      });
      corrections.push({
        rule: "subsidy_overflow_to_asset",
        before: { incm_sec_cd: 2, acc_amt: subsidyExpense, acc_sec_cd: subsidyCd },
        after: { incm_sec_cd: 2, acc_amt: cap, acc_sec_cd: subsidyCd },
        reason: `보조금(${subsidyCd}) 보전 비인정분 ${nonReimbursable.toLocaleString()}원을 자산 선거비용으로 이전`,
      });
    }
  }

  // 5.2 후원회기부금 잔액 → 자산 선거비용
  if (redistributeSupporterRemainder) {
    const income = sumIncome(rows, CANDIDATE_ACC_SEC.후원회기부금);
    const expense = sumExpense(rows, CANDIDATE_ACC_SEC.후원회기부금);
    const remainder = income - expense;
    if (remainder > 0) {
      details.push({
        fromAccSecCd: CANDIDATE_ACC_SEC.후원회기부금,
        toAccSecCd: CANDIDATE_ACC_SEC.자산,
        toItemSecCd: CANDIDATE_ITEM_SEC.선거비용,
        amount: remainder,
      });
      corrections.push({
        rule: "supporter_remainder_to_asset",
        before: { incm_sec_cd: 1, acc_amt: income, acc_sec_cd: CANDIDATE_ACC_SEC.후원회기부금 },
        after: { incm_sec_cd: 2, acc_amt: expense, acc_sec_cd: CANDIDATE_ACC_SEC.후원회기부금 },
        reason: `후원회기부금 잔액 ${remainder.toLocaleString()}원을 자산 선거비용으로 이전`,
      });
    }
  }

  // 5.3 가상 변환 — 자산 선거비용 지출에 합산할 amount만 알면 되므로,
  // 실제 rows 자체를 변형하지 않고 details만 반환. byAccount 집계 단계에서 details를 적용.
  return { rows: [...rows], corrections, details };
}
```

### 4.2 computeBalances 통합

```typescript
export function computeBalances(rows, options): SettlementResult {
  // ... 기존 (날짜 필터 + Rule 1 적용)
  const filtered = rows.filter((r) => inDateRange(...));
  const { rows: afterRule1, corrections: corr1 } = applyCorrections(filtered, options);

  let afterRule2 = afterRule1;
  let corr2: Correction[] = [];
  let redistributionDetails: RedistributionDetail[] = [];
  if (options.applyFundSourceRedistribution && options.reimbursementCaps) {
    const r2 = applyFundSourceRedistribution(afterRule1, options.reimbursementCaps);
    afterRule2 = r2.rows;
    corr2 = r2.corrections;
    redistributionDetails = r2.details;
  }

  // 집계 시 details를 자산 선거비용에 합산
  // ... byAccount 빌드 후, redistributionDetails를 자산 측에 +amount / 출발 측에 -amount 반영
}
```

### 4.3 byAccount 집계 보정

```typescript
// byAccount 빌드 후 (효과는 출력 단계에만, rows는 안 건드림):
for (const d of redistributionDetails) {
  // 출발 자금출처: 선거비용 지출 -amount
  const from = accountMap.get(d.fromAccSecCd);
  if (from) from.electionExpense -= d.amount;
  // 도착 자금출처 (자산): 선거비용 지출 +amount
  const to = accountMap.get(d.toAccSecCd) ?? createBucket(d.toAccSecCd);
  to.electionExpense += d.amount;
  accountMap.set(d.toAccSecCd, to);
}
```

**중요**: 수입 합계/지출 합계는 **변하지 않음** (재배분은 같은 카테고리 내 이동). 잔액도 동일. byAccount의 분포만 변함.

---

## 5. UI Design

### 5.1 결산 페이지 (`income-expense-report/page.tsx`) 확장

새 섹션: **"자금출처 충당 재배분"** (옵션, 기본 닫힘)

```
┌─────────────────────────────────────────────────────────────┐
│ ▶ 자금출처 충당 재배분 설정 (PFund2 호환)                    │
└─────────────────────────────────────────────────────────────┘

[펼침 시]

┌─────────────────────────────────────────────────────────────┐
│ ☑ 보조금 비인정분 → 자산 선거비용 이전 활성화                │
│                                                              │
│ 보조금 보전 인정액 (선관위 결정 또는 추정):                  │
│   보조금 (CV 82):       [_______________] 원                │
│   보조금외 지원금 (83): [_______________] 원                │
│                                                              │
│ ☑ 후원회기부금 잔액 → 자산 선거비용 이전 활성화              │
│                                                              │
│ [미리보기 새로고침]                                          │
├─────────────────────────────────────────────────────────────┤
│ 재배분 결과:                                                 │
│ ▸ 보조금 비인정분: 1,866,665원 → 자산 선거비용              │
│ ▸ 후원회기부금 잔액: 0원 (잔액 없음)                         │
│                                                              │
│ 자산 선거비용 지출: 99,325 → 1,965,990원                    │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 신규 UI 컴포넌트 (단일 페이지 내, 추출 안 함)

상태 관리는 `useReducer` 패턴 활용 (submit 페이지처럼):

```typescript
interface RedistState {
  enabled: boolean;
  caps: Record<number, string>;  // 입력값은 string으로 (빈문자/포맷)
  redistributeSupporter: boolean;
}
```

### 5.3 사용자 흐름

```
1. 결산 페이지 접속 → 기존 동작 (Rule 1만 적용)
2. 사용자가 "자금출처 재배분 설정" 펼침
3. 보조금 인정액 입력 (선관위 결정 또는 추정치)
4. 조회 클릭 → settlement-calc 호출 시 옵션 전달
5. 화면에 재배분 결과 표시 + 자산 선거비용 변화 안내
6. (선택) Excel 다운로드: 재배분 후 수치로 출력
```

### 5.4 변경 안 함

- `submit/page.tsx` DB import 모달은 그대로
- `forms/page.tsx`는 변경 없음 (양식 출력 시점엔 OPINION 값 사용)

---

## 6. API Specification

### 6.1 `POST /api/system/recompute-settlement` (기존 보강)

**Request body 확장**:
```json
{
  "orgId": 11,
  "dryRun": false,
  "redistribution": {
    "enabled": true,
    "caps": { "82": 2548335, "83": 0 },
    "redistributeSupporterRemainder": true
  }
}
```

**Response**: 기존 + 재배분 상세
```json
{
  "ok": true,
  "orgId": 11,
  "income": 18199055,
  "expense": 15296125,
  "balance": 2902930,
  "estate": 2902930,
  "correctionsCount": 2,
  "redistributions": [
    { "fromAccSecCd": 82, "toAccSecCd": 84, "toItemSecCd": 86, "amount": 1866665 }
  ],
  "opinionUpdated": true
}
```

### 6.2 변경 없는 API

- `GET /api/system/export-sqlite` — OPINION이 이미 재배분 후 값을 가지고 있으면 그대로 export됨
- `POST /api/system/import-sqlite` — import 후 결산 자동 재계산은 재배분 옵션 없이 호출 (즉, 기본 비활성)

---

## 7. Error Handling

### 7.1 신규 에러 케이스 (parity-errors 활용)

| 코드 | 케이스 | HTTP | 처리 |
|---|---|---|---|
| `PARITY-003` (기존) | reimbursementCaps 미지정인데 applyFundSourceRedistribution=true | 400 | UI에서 사용자에게 인정액 입력 요구 |
| 신규 (런타임 에러) | 보전 인정액이 보조금 지출보다 큼 | warning만 (오류 아님) | 비인정분 = 0으로 처리 후 warning 응답 |

### 7.2 응답 포맷

기존 `ParityError`/`{ok, summary, warnings, errors}` 포맷 그대로 사용. 신규 클래스 추가 없음.

---

## 8. Security Considerations

- [x] 보전 인정액은 사용자 입력이므로 RLS 통해 본인 organ에만 적용 (이미 `recompute-settlement`에 적용됨)
- [x] OPINION upsert는 service role을 통하지만 org_id 필터로 격리
- [x] UI 입력 검증: 숫자만, 0 이상, 보조금 지출 총액 이하 (소프트 warning)
- [x] 재배분 알고리즘은 입력 데이터에 비례한 O(N) 처리, DoS 위험 없음

---

## 9. Test Plan

### 9.1 단위 테스트 (settlement-calc.test.ts 확장)

```typescript
describe("applyFundSourceRedistribution - Rule 5.1 보조금", () => {
  it("보전 비인정분만큼 자산 선거비용 증가", () => {
    // Fund_Data_1 케이스
    const rows = [/* 보조금 4,415,000 지출 */];
    const r = computeBalances(rows, {
      applyFundSourceRedistribution: true,
      reimbursementCaps: { byAccSecCd: { 82: 2_548_335 } },
    });
    const asset = r.byAccount.find(a => a.acc_sec_cd === 84);
    expect(asset.electionExpense).toBe(99325 + 1_866_665);  // 1,965,990
  });

  it("cap=0이면 전액 자산 이전", () => { /* ... */ });
  it("cap≥지출이면 재배분 없음", () => { /* ... */ });
});

describe("applyFundSourceRedistribution - Rule 5.2 후원회기부금", () => {
  it("후원회기부금 잔액이 양수면 자산으로 이전", () => { /* ... */ });
  it("후원회기부금 잔액 0이면 재배분 없음 (Fund_Data_1 케이스)", () => { /* ... */ });
  it("redistributeSupporterRemainder=false면 잔액 있어도 이전 안 함", () => { /* ... */ });
});

describe("computeBalances 통합", () => {
  it("재배분 후에도 수입/지출/잔액 합계 불변", () => { /* ... */ });
  it("corrections에 두 규칙 모두 누적", () => { /* ... */ });
  it("기본 옵션 (재배분 off)에서 기존 결과와 동일", () => { /* ... */ });
});
```

### 9.2 통합 테스트 (Fund_Data_1 fixture)

```typescript
test("[Case A] Fund_Data_1 PFund2 재배분 결과와 일치", () => {
  const dbPath = "data/Fund_Data_1.db"; // 또는 중앙선거관리위원회_정치자금회계관리2/Data/
  // (1) ACC_BOOK 41건 load
  // (2) computeBalances with caps={82: 2548335}
  // (3) 검증:
  //     - income = 18,199,055
  //     - expense = 15,296,125
  //     - balance = 2,902,930
  //     - 자산 선거비용 지출 = 1,965,990 (가설 v1)
  //     - ⚠️ plan §1.2 적힌 1,970,000과 4,010 차이는 알려진 미스터리
});
```

### 9.3 회귀 테스트

기존 57건(official-program-parity)에 추가 단위 테스트만 늘림. 기본 옵션 false이므로 기존 동작 보장.

---

## 10. Implementation Guide

### 10.1 File Structure

```
app/src/
├── lib/accounting/
│   ├── settlement-calc.ts            (수정: applyFundSourceRedistribution 추가)
│   └── settlement-calc.test.ts       (확장: 새 시나리오 ~10개)
├── app/
│   ├── dashboard/income-expense-report/
│   │   └── page.tsx                  (수정: 재배분 UI 섹션 추가)
│   └── api/system/recompute-settlement/
│       └── route.ts                  (수정: redistribution body 수용)
data/
└── Fund_Data_1.db                    (이미 존재 / 픽스처 활용)
```

### 10.2 Implementation Order

1. [ ] Types: `ReimbursementCaps`, `RedistributionDetail` 추가
2. [ ] `applyFundSourceRedistribution()` 함수 작성 (placeholder 교체)
3. [ ] `computeBalances` 통합: details 적용
4. [ ] 단위 테스트 10건 작성 (Rule 5.1 / 5.2 / 통합)
5. [ ] Fund_Data_1 fixture로 Case A 통합 테스트 1건
6. [ ] `recompute-settlement` API redistribution body 처리
7. [ ] `income-expense-report/page.tsx` UI 섹션 + reducer
8. [ ] 회귀 검증: 기존 57건 + 신규 ~12건 = 69+건 통과

### 10.3 알려진 미해결 항목 (TODO 표기)

```typescript
// TODO(fund-source-redistribution): plan §1.2의 +4,010원 후원회기부금 자산 이전을
// 가설 v1으로는 재현 불가. 추가 PFund2 케이스 수집 후 보강 예정.
// 현재 동작: supporterIncome === supporterExpense이면 재배분 0.

// TODO(자산 부족): 비인정분이 자산 잔액을 초과하는 케이스의 PFund2 거동 미확인.
// 현재 동작: 자산 선거비용 지출이 자산 수입을 초과해도 그대로 누적.
```

---

## 11. Clean Architecture

### 11.1 Layer

| Component | Layer | 위치 |
|---|---|---|
| `applyFundSourceRedistribution` | Application | `lib/accounting/settlement-calc.ts` |
| `ReimbursementCaps`, `RedistributionDetail` | Domain (타입) | 같은 파일 |
| `recompute-settlement` route | Infrastructure | `api/system/recompute-settlement/route.ts` |
| 결산 UI 섹션 | Presentation | `dashboard/income-expense-report/page.tsx` |

### 11.2 의존성 규칙

- settlement-calc 추가 코드는 외부 의존성 0 (순수 함수)
- 다른 SSOT 모듈 (organ-pair, code-mapping, submission-forms, parity-errors) 변경 없음
- 추가될 UI는 settlement-calc를 fetch로만 호출 (직접 import 없음 → 클라이언트 번들 사이즈 영향 0)

---

## 12. Open Questions (Phase 1에서 도출)

| # | 질문 | 우선순위 | 처리 |
|---|---|:---:|---|
| 1 | 후원회기부금 +4,010원 출처 | Medium | TODO 마크, 추가 .db 수집 후 보강 |
| 2 | 보조금 종류별(82/83/4/5/6/104) 처리 | Low | 현 데이터는 82만, 가설로 통일 처리 |
| 3 | 자산 부족 시 PFund2 거동 | Low | 자산 -금액 허용. UI에 warning만 |
| 4 | 보전 인정액 자동 산출 | Out | 정책상 불가, 사용자 입력만 |

---

## 13. Version History

| Version | Date | Changes | Author |
|---|---|---|---|
| 0.1 | 2026-05-15 | Phase 1 결과 기반 가설 v1 초안 | Claude |
