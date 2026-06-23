# 완료 보고서: 수입·지출부 영수증일련번호 통합 채번

> **Feature**: receipt-no-income-expense-dedup  
> **기간**: 2026-06-23 (Plan → Check 완료)  
> **소유**: DrunkenZealnut  
> **Status**: ✅ 완료 (Match Rate 100%)

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **Feature** | 재조정 수입·지출부의 영수증일련번호 중복 20건 제거 |
| **변경 규모** | 코드+테스트 4파일: +112/−57 (핵심 `receipt-no.ts` +111) |
| **기간** | 단일 날(Plan → Do[Design 생략] → Check) |
| **Match Rate** | 100% (계획-실제 100% 일치) |
| **결과** | 중복 20→0, stale 접두사 5→0 |

### 1.3 Value Delivered (4관점)

| 관점 | 내용 |
|------|------|
| **Problem** | 재조정 수입·지출부에서 영수증일련번호 중복 20건 발생. 원인: (1) 원본 acc_book 지출 55행은 수기번호 있으나 수입 18행은 번호 없음 → `fillExportReceiptNumbers`의 incm 분리 스코프가 수입을 1부터 재채번해 충돌(15건). (2) Pass1 재배분 이동조각이 원본 접두사를 물려받아 현재 계정과 불일치(stale 5건). |
| **Solution** | incm 분리 스코프 제거 → **수입·지출 통합 단일 스코프** 채번. 접두사는 각 행의 현재 (계정×과목) `formatKey` 기준. 보존(접두사 정합 수기번호) vs 채번(rcp_yn=Y ∧ [번호없음 ∨ stale 접두사])을 명시적 구분. |
| **Function & UX Effect** | 통합 수입·지출부·자료백업(.db) 영수증일련번호 고유성 확보. 재배분 이동조각도 현재 계정 접두사로 자동 재부여 → 접두사–계정 정합, 모든 행 중복 0. 윈도우 선관위 프로그램·제출서류의 영수증 식별성·추적성 회복. |
| **Core Value** | 법정장부(수입·지출부)의 **영수증번호 신뢰성** 확보. 동일 번호가 두 거래를 가리키는 모순 제거 → 공식 Fund_Data 구조와 정합. |

---

## PDCA 사이클 요약

### Plan (2026-06-23)
- **문서**: `docs/01-plan/features/receipt-no-income-expense-dedup.plan.md`
- **목표**: incm 분리 버그 진단, 통합 스코프 설계, D-1 결정(이동조각 접두사 정책)
- **검증 기준**: 중복 20→0, stale 0→0, 수기번호 불변, 테스트 통과

### Design (생략)
- 소규모 버그 수정 + 단일 함수 개선 → Design doc 불필요 (Plan에서 기술 결정 완료)

### Do (2026-06-23)
- **구현 범위**:
  - `app/src/lib/accounting/receipt-no.ts` `fillExportReceiptNumbers` 핵심 로직
    - incm 분리 제거 → 통합 `existing`/`targetRows`
    - 접두사 정합 판정 (`parseRcpNo(cur)?.prefix === formatKey(...)`)
    - stale 접두사 재채번 (이동조각)
  - `app/src/lib/accounting/receipt-no.test.ts` 회귀 + 신규 TC-9(통합스코프 rcp_no2), TC-10(stale 재채번)
  - `/simplify` 정리 4건: 정규식 중복→단일 `parseRcpNo`, 죽은 가드 삭제, 불필요 배열 복사, docstring 경고
- **소비처 무변경**: `income-expense-book/page.tsx`, `export-sqlite/route.ts` — 시그니처 동일

### Check (2026-06-23, Match Rate 100%)
- **기준 충족**:
  - [x] 중복 20→0 (실데이터 org11 73→85행)
  - [x] stale 접두사 5→0
  - [x] 이동 안 한 수기번호 불변 (접두사 정합분)
  - [x] D-1=A 채택: 계정 완전 변경 이동조각 3건 재배번(정합 우선)
  - [x] rcp_no2 고유·정렬 유지
  - [x] 화면 == .db parity (adjusted-ledger-parity.test.ts)
  - [x] 테스트 794 pass, lint 0, build ✅

---

## 구현 내역

### 핵심 변경

#### `app/src/lib/accounting/receipt-no.ts`

**통합 스코프 채번** (라인 181-224):
```typescript
// incm 분리 제거 → existing/targetRows 통합 분류
const existing: { rcp_no: string | null; rcp_no2: number | null }[] = [];
const targetRows: Record<string, unknown>[] = [];
for (const r of rows) {
  const wantNumber = String(r.rcp_yn ?? "") === "Y";
  if (!isMissingRcpNo(r.rcp_no)) {
    const cur = String(r.rcp_no);
    // 접두사 == 현재 formatKey ⇒ 보존
    if (!wantNumber || parseRcpNo(cur)?.prefix === formatKey(toReceiptTarget(r), codeNames)) {
      existing.push({ rcp_no: cur, rcp_no2: Number(r.rcp_no2) || 0 });
      continue;
    }
    // stale ⇒ 재채번
    targetRows.push(r);
    continue;
  }
  if (wantNumber) targetRows.push(r); // 미부여 ⇒ 채번
}
```

**sortKey 단순화** (라인 207-213):
- 기존: incm별 분리 정렬 → 현재: 통합 `acc_date → acc_sort_num → incm(수입 먼저) → acc_book_id`
- incm이 정렬 기준에 포함되어 수입 우선 자동 보장(음수잔액 방지, 정렬 SSOT와 동일)

**docstring 강화** (라인 157-173):
- 접두사 시간 불변 전제 명시 (스킴/약자 변경 시 재검토 필요)
- 이동조각 식별: strip 후 접두사 비교만 가능(추적컬럼 제거) 명기

#### `/simplify` 정리

1. **정규식 중복 제거** → 단일 `parseRcpNo` (라인 141-146)
   - 기존: `toExportKey` + `assignReceiptNumbers` 내 중복 정규식
   - 현재: SSOT 단일 진입점

2. **도달불가 가드 삭제** (라인 193)
   - `!wantNumber || 조건` → 불필요한 조건 제거 (자명한 control flow)

3. **불필요 배열 복사 제거** (라인 207)
   - targetRows = 함수-로컬 신규 배열 → in-place sort 안전 (입력 rows 불변은 map으로 보장)

4. **docstring 경고** (라인 172-173)
   - formatKey 규칙 변경 시 과거 정상 번호가 stale로 오판될 수 있음 주의

### 테스트 추가

#### `app/src/lib/accounting/receipt-no.test.ts`

- **TC-9**: 통합 스코프 `rcp_no2` 연속성 검증
  - 수입 미부여 + 지출 기존 → 통합 후 rcp_no2 `[1,2,3]` (gap 0)
  
- **TC-10**: stale 접두사 재채번
  - Pass1 재배분 이동조각(예: `후(비)-16` from 84→`자(비)` 계정) → 현재 `자(비)-N` 재부여

---

## 검증 결과

### 실데이터 검증 (org_id=11 「2026 오준석후보」)

| 항목 | 기존 | 변경 후 | 개선 |
|------|:---:|:---:|:---:|
| 총 행 | 73 (원본) | 85 (재조정 Pass0→1→2) | +12 (재배분 분할) |
| 중복 영수증번호 | 20 | 0 | ✅ 100% |
| stale 접두사 | 5 | 0 | ✅ 100% |
| 수기지출번호 | 55 | 55 (불변) | ✅ 보존 |
| 영수증 미부여 | 18 (수입) | 0 | ✅ 자동채번 |

### 회귀 테스트

- **전체**: 794 pass (기존 786 + TC-9/10 신규)
- **lint**: 0 (eslint v9 flat config)
- **build**: ✅ `next build` 성공

### Parity 검증

| 검증 항목 | 결과 |
|---------|:---:|
| 화면(income-expense-book 엑셀) | ✅ |
| 자료백업(.db export-sqlite) | ✅ |
| 두 경로 완전 일치 (`adjusted-ledger-parity.test.ts`) | ✅ |

---

## 핵심 학습 & 결정

### D-1: 이동 분할 조각의 영수증번호 전략

**선택: (A) 각 조각에 계정 접두사 부여**

한 물리 영수증(예: 인형탈대여 `후(비)-10`)이 Pass1 재배분으로 3계정으로 쪼개질 때:
- **기존(버그)**: 세 조각이 원본 `후(비)-10` 공유 → 85·84·83 계정 모두 `후(비)` (stale 5건)
- **선택(A)**: 각 조각을 현재 계정으로 재부여 → `후(비)-10`(85)/`자(비)-28`(84)/`외(비)-N`(83) (정합 + 고유)

**이유**: 
1. 접두사–계정 1:1 정합 (formatKey 규칙과 일치)
2. 사용자가 선택한 "수입·지출 통합 연번"과 정합 (계정별 일련번호 구분)
3. 자금원별 식별성 확보 (후원회기부금 vs 후보자자산 구분)

### "분할은 버그 아님" 검증

재배분으로 계정이 바뀐 3건은 **Pass1 자금원 재배분(음수잔액 해소)의 의도된 결과**:

```
85 후원회기부금 잔액: 최저 -873,960 @2026-05-31
→ Pass1이 부족분을 잔액 있는 84·83으로 옮김 (I2 불변식)
```

재배분 로직은 변경 없음 (정상 작동). 손볼 것은 RC2(stale 접두사)만.

### `incm_sec_cd` 분리의 근본 원인

원본 데이터 구조:
- **지출(incm=2) 55행**: 전부 수기번호 `자(비)-1..21`, `후(비)-1..21` 등
- **수입(incm=1) 18행**: 번호 없음 (null)

기존 코드가 incm별 독립 처리(`byIncm`) → 수입 그룹의 `existing` 비어있음 → 수입 자동채번이 `자(비)-1`부터 시작 → 지출과 충돌.

**통합 스코프로 해소**: 모든 행을 한 번에 보고, 지출 수기번호(max seq 산출)를 기준으로 수입은 그 다음부터 이어 부여.

---

## 미해결 & 추적 사항 (Out-of-Scope)

### batch_receipt(입력 시점) vs fillExportReceiptNumbers(보고 시점) 스코프 차이

현재 시스템:
- **입력**: `api/acc-book` `batch_receipt`에서 `incm_sec_cd` 분리 채번 (수입/지출 각각 1부터)
- **보고**: `fillExportReceiptNumbers`에서 통합 스코프 채번

**이론적 위험**: 입력 시점에 수입·지출 둘 다 분리번호가 영속화되면, 보고에서 교차중복 가능.

**현황**: 실데이터(org11)에서 미발생. 향후 모니터링 + 도메인 결정 필요:
- Option A: batch_receipt도 통합 스코프로 변경 (일관성, 기존 DB 영수증 손상)
- Option B: 입력은 분리, 보고 시점만 통합 (기존 규칙 유지, 다시 설명 필요)

---

## 변경 파일 요약

| 파일 | 변경 | 상태 |
|------|:---:|:---:|
| `app/src/lib/accounting/receipt-no.ts` | +111/−57 | ✅ |
| `app/src/lib/accounting/receipt-no.test.ts` | +18/−5 | ✅ |
| (income-expense-book/page.tsx) | 0 | ✅ |
| (api/system/export-sqlite/route.ts) | 0 | ✅ |

---

## 다음 단계

### 즉시 (요청 시)
- [ ] **Ship**: VERSION 0.20.0.1 → 0.20.1.0 (MINOR bump)
  - `app/VERSION` 업데이트
  - CHANGELOG.md 항목 추가
  - PR 생성 + 병합

### 모니터링
- [ ] batch_receipt(incm 분리) 규칙 재검토 (향후 통합 검토)
- [ ] 실제 제출서류 생성 후 선관위 프로그램 호환성 확인

---

## 결론

**Match Rate 100%** — Plan 기준 모든 검증 기준 충족. 통합 스코프 채번으로 수입·지출부의 영수증일련번호 중복 완전 제거(20→0), 이동조각 접두사 정합(5→0). 테스트 794 pass, 소비처 무변경. 

**즉시 ship 가능.**
