# 결산보고서 선관위 형식 보정 Design Document

> **Summary**: 마이너스 수입을 지출로 전환하는 보정 유틸리티 함수를 생성하고, 결산/수입지출보고서 페이지에 적용
>
> **Project**: PoliticalFundAccountingManagement
> **Author**: Claude
> **Date**: 2026-03-29
> **Status**: Draft
> **Plan Reference**: `docs/01-plan/features/settlement-report-correction.plan.md`

---

## 1. Architecture Overview

### 1.1 변경 구조

```
app/src/lib/accounting/               ← 신규 디렉토리
  └── adjust-negative-income.ts        ← 신규: 보정 유틸리티

app/src/app/dashboard/
  ├── settlement/page.tsx              ← 수정: 보정 함수 적용
  └── income-expense-report/page.tsx   ← 수정: 보정 함수 적용
```

### 1.2 데이터 흐름

```
Supabase(acc_book) → fetch → adjustNegativeIncome() → 합산 로직 → UI 렌더링
                              ↑
                     마이너스 수입 → 양수 지출로 전환
```

---

## 2. Detailed Design

### 2.1 신규 파일: `app/src/lib/accounting/adjust-negative-income.ts`

#### 타입 정의

```typescript
/** acc_book 테이블에서 조회한 레코드 (select 필드 기준) */
interface AccRecord {
  incm_sec_cd: number;   // 1=수입, 2=지출
  acc_sec_cd: number;    // 계정코드 (82=보조금, 84=자산, 85=후원회기부금)
  item_sec_cd: number;   // 과목코드 (86=선거비용, 87=선거비용외)
  acc_amt: number;       // 금액 (양수 또는 음수)
}
```

#### 핵심 함수

```typescript
/**
 * 마이너스 수입 레코드를 양수 지출 레코드로 전환한다.
 *
 * 선관위 정치자금 회계관리 프로그램은 incm_sec_cd=1(수입)이면서
 * acc_amt < 0인 레코드를 지출(incm_sec_cd=2)로 분류한다.
 * 이 함수는 동일한 보정을 적용하여 선관위 보고서와의 정합성을 보장한다.
 *
 * 변환 규칙:
 *   - 조건: incm_sec_cd === 1 AND acc_amt < 0
 *   - 변환: incm_sec_cd → 2, acc_amt → Math.abs(acc_amt)
 *   - acc_sec_cd, item_sec_cd는 원본 유지
 *
 * @param records - acc_book에서 조회한 원본 레코드 배열
 * @returns 보정된 새 배열 (원본 불변)
 */
export function adjustNegativeIncome<T extends AccRecord>(records: T[]): T[] {
  return records.map((r) => {
    if (r.incm_sec_cd === 1 && r.acc_amt < 0) {
      return { ...r, incm_sec_cd: 2, acc_amt: Math.abs(r.acc_amt) };
    }
    return r;
  });
}
```

#### 설계 원칙

- **순수 함수**: 입력 배열을 변경하지 않고 새 배열 반환
- **제네릭 타입**: `T extends AccRecord`로 추가 필드가 있는 레코드에도 대응
- **단일 책임**: 마이너스 수입 전환만 담당, 합산 로직과 분리

### 2.2 수정: `settlement/page.tsx`

#### 변경 위치: `handleSettle()` 함수 (line 70)

```typescript
// Before (현재)
const records = accData || [];

// After (변경)
import { adjustNegativeIncome } from "@/lib/accounting/adjust-negative-income";
// ...
const records = adjustNegativeIncome(accData || []);
```

**변경 사항**: 1줄 수정 + 1줄 import 추가

**영향 범위**:
- `income` / `expense` 합산: 보정된 레코드 기준으로 정확한 합계
- `accountMap` 그루핑: 전환된 레코드가 지출 쪽에 합산됨
- `balance` 계산: 수입 증가 + 지출 증가 → 잔액 변동 없음
- `estateAmt` 비교: 잔액 불변이므로 기존 검증 로직 정상 동작

#### 보정 전후 결과 비교 (계정/과목별 내역)

| 계정 | 과목 | 보정 전 수입 | 보정 후 수입 | 보정 전 지출 | 보정 후 지출 |
|------|------|-------------|-------------|-------------|-------------|
| 후보자등 자산 | 선거비용외 | 5,000,055 | **5,500,055** | 4,997,800 | **5,497,800** |
| (기타 행) | | 변동 없음 | 변동 없음 | 변동 없음 | 변동 없음 |
| **합계** | | **17,699,055** | **18,199,055** | **14,796,125** | **15,296,125** |

### 2.3 수정: `income-expense-report/page.tsx`

#### 변경 위치: `handleQuery()` 함수 (line 54~58)

```typescript
// Before (현재)
if (!data) {
  setAccounts([]);
  setLoading(false);
  return;
}

// Aggregate by acc_sec_cd
const map = new Map<number, AccountRow>();
for (const r of data) {

// After (변경)
import { adjustNegativeIncome } from "@/lib/accounting/adjust-negative-income";
// ...
if (!data) {
  setAccounts([]);
  setLoading(false);
  return;
}

const adjusted = adjustNegativeIncome(data);

// Aggregate by acc_sec_cd
const map = new Map<number, AccountRow>();
for (const r of adjusted) {
```

**변경 사항**: 1줄 추가 (`const adjusted = ...`) + loop 변수 `data` → `adjusted` + 1줄 import

**영향 범위**:
- 전환된 마이너스 수입이 `isElectionExpense` / `isNonElectionExpense` 분류에 정상 반영
  - 원본 레코드 `item_sec_cd=87`이므로 `nonElectionExpense`로 분류됨 (정확)
- Excel 다운로드: `accounts` state 기반이므로 자동 반영됨

#### 보정 전후 결과 비교 (수입지출보고서)

| 구분 | 보정 전 수입 | 보정 후 수입 | 보정 전 선거비용외 | 보정 후 선거비용외 |
|------|-------------|-------------|-----------------|-----------------|
| 후보자등 자산 | 8,000,055 | **8,500,055** | 4,997,800 | **5,497,800** |
| **합계** | **17,699,055** | **18,199,055** | **6,333,100** | **6,833,100** |

---

## 3. Implementation Order

| 순서 | 작업 | 파일 | 유형 |
|------|------|------|------|
| 1 | 유틸리티 함수 생성 | `app/src/lib/accounting/adjust-negative-income.ts` | 신규 |
| 2 | 결산작업 페이지 보정 적용 | `app/src/app/dashboard/settlement/page.tsx` | 수정 |
| 3 | 수입지출보고서 보정 적용 | `app/src/app/dashboard/income-expense-report/page.tsx` | 수정 |

---

## 4. Verification Criteria

### 4.1 보정 후 목표 수치 (선관위 보고서 기준)

| 항목 | 보정 전 | 보정 후 (목표) | 선관위 일치 |
|------|---------|---------------|-----------|
| 수입 합계 | 17,699,055 | 18,199,055 | ✅ |
| 지출 합계 | 14,796,125 | 15,296,125 | ✅ |
| 잔액 | 2,902,930 | 2,902,930 | ✅ |
| 자산 수입 | 8,000,055 | 8,500,055 | ✅ |
| 자산 선거비용외 지출 | 4,997,800 | 5,497,800 | ✅ |

### 4.2 미해결 항목 (Out of Scope)

마이너스 수입 보정으로 **합계는 일치**하지만, 계정별 선거비용 배분은 선관위와 차이 유지:

| 항목 | 보정 후 | 선관위 | 차이 원인 |
|------|---------|--------|----------|
| 자산 선거비용 지출 | 99,325 | 1,970,000 | 자금출처별 충당 규칙 |
| 보조금 지출 | 4,415,000 | 2,548,335 | 보전 한도 적용 |
| 후원회기부금 선거비용 | 3,948,700 | 3,944,690 | 잔액 재배분 |

이 차이는 Plan 2.2에서 Out of Scope로 정의한 "자금출처별 충당 규칙"에 해당하며, 추후 별도 기능으로 검토 가능.

### 4.3 회귀 방지

- 마이너스 수입이 없는 데이터: `adjustNegativeIncome()`이 원본과 동일한 배열 반환 → 기존 동작 보존
- 잔액 = 재산(현금및예금) 검증: 잔액 불변이므로 기존 로직 정상 동작
- 결산확정 저장: `opinion` 테이블의 `in_amt`, `cm_amt`에 보정된 수치 저장됨

---

## 5. Edge Cases

| 케이스 | 처리 방법 |
|--------|----------|
| 마이너스 지출 (`incm_sec_cd=2, acc_amt<0`) | 변환 대상 아님 (수입만 대상) |
| 금액 0원 레코드 | 변환 대상 아님 (`acc_amt < 0` 조건 미충족) |
| 동일 계정/과목에 양수·음수 수입 혼재 | 양수는 수입 유지, 음수만 지출로 전환 → 정확한 합계 |
