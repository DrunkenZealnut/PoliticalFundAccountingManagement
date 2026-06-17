# 수입계정별 잔액 가드 (지출 입력 시 자금원 충당 안내) Planning Document

> **Summary**: 후보자 지출 입력 화면에서 수입계정(자금원 82~85)별 가용잔액을 **계정 선택 시점·입력 금액 반영 실시간**으로 보여주고, 초과충당(가용잔액 음수)을 강하게 경고해 "어느 자금원으로 지출을 충당할지" 선택을 돕는다. (저장은 차단하지 않음)
>
> **Project**: PoliticalFundAccountingManagement
> **Version**: 0.2.0
> **Author**: Claude
> **Date**: 2026-06-16 (작성) · 2026-06-17 (갱신)
> **Status**: Draft (refined)
> **Related**: [[negative-balance-reallocation]](사후 교정 — 본 기능은 입력 시점 예방인 짝 작업), `acc-book-sort.ts`(시간순 정렬 SSOT), `fund-realloc.ts`(시간순 캐스케이드)

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 정치자금수입지출부를 수입계정(자금원)별로 조회하면 그 자금원의 수입보다 지출이 커서 **잔액이 마이너스**가 되는 경우가 생긴다. 원인은 지출 입력 시 자금원별 잔여 한도를 모른 채 계정을 고르기 때문. 기존 `자금원별 충당 현황` 패널은 누적 결과를 ⚠로 표시할 뿐, **계정을 고르는 그 순간·입력 중인 금액**을 반영하지 못해 사전 예방이 안 된다. |
| **Solution** | 후보자 지출 입력(`expense`, `document-register`)에서 ① 계정 선택 UI에 각 자금원의 가용잔액을 **인라인 표시**, ② 입력 중인 금액을 반영한 **저장 후 잔액 미리보기**(현재 → 예상, 음수 전환 강조), ③ 음수 발생 시 **강한 경고 배너**를 띄운다. 저장은 허용(non-blocking)하되 사용자가 의식적으로 진행. 기존 `funding-allocation`/`funding-source` SSOT를 재사용·확장. |
| **Function/UX Effect** | 입력자가 "이 지출을 82(보조금)에 넣으면 잔액이 -30만원이 되고, 84(후보자자산)엔 여유가 있다"를 **입력 화면을 떠나지 않고** 즉시 보고 올바른 자금원을 선택 → 수입지출부의 계정별 음수 잔액을 발생 단계에서 차단. |
| **Core Value** | 정치자금 회계의 **자금원 무결성**을 입력 시점에 확보 — "사후 결산 보정"에서 "사전 가이드"로 전환. |

---

## 1. Overview

### 1.1 Purpose

후보자 회계에서 지출은 4개 자금원(`acc_sec_cd`: 82=보조금, 83=보조금외 지원금, 84=후보자등 자산, 85=후원회기부금) 중 하나로 충당된다. 정치자금수입지출부를 자금원별로 조회했을 때 **수입액 < 지출액 → 잔액 음수**는 회계상 발생하면 안 되는 상태다.

근본 원인은 **지출 입력 시점**에 입력자가 각 자금원의 잔여 가용액을 알지 못한 채 계정을 선택하는 데 있다. 본 기능은 입력 화면에서 자금원별 가용잔액을 **계정 선택 시점 + 입력 금액 반영 실시간**으로 시각화하여, 입력자가 음수가 나지 않는 자금원을 스스로 선택하도록 돕는다.

### 1.2 Background

- **이미 존재하는 자산**:
  - `lib/accounting/funding-source.ts` — `FUNDING_SOURCE_BY_ACC_SEC_CD`(82→보조금/83→보조금외/84→후보자자산/85→후원회기부금), `classifyFundingSource()` (SSOT).
  - `lib/accounting/funding-allocation.ts` — `buildFundingAllocation(rows)` → 자금원별 `{income, expense, available, incomeRatio, overspent}` + 합계. (순수 함수)
  - `components/dashboard/FundingAllocationPanel.tsx` — 후보자 전용 패널. **org 전체 누적** 기준 자금원별 수입/지출/가용잔액을 막대와 함께 표시. 음수는 `text-red-600 + ⚠` 경고 **표시만**, 입력 차단 없음.
  - `expense/page.tsx` — `orgType === "candidate"`일 때 위 패널을 `allRows`(org 전체) 기준으로 렌더.
- **갭(이번에 메우는 부분)**:
  1. 패널이 폼과 **분리**되어 있어, 계정 드롭다운에서 각 자금원의 잔액을 **선택과 동시에** 보지 못한다.
  2. **입력 중인 금액**을 반영한 미리보기가 없다 — "이 지출을 저장하면 잔액이 어떻게 바뀌는지" 알 수 없다.
  3. 음수가 되어도 **약한 경고(⚠)** 뿐이라 입력자가 인지하지 못하고 지나친다.
  4. `document-register`(수기/영수증 입력)에는 패널이 **아예 없다**.
- **결정 사항(사용자 확인 완료, 2026-06-16)**:
  - **초과충당 정책 = 경고 후 진행 허용(non-blocking)**. 입력 순서·정정·환급(음수 acc_amt 지출 행) 등으로 일시적 음수가 불가피하므로 저장은 막지 않되, 강하게 경고한다. (현재 시스템의 "입력 비차단" 철학과도 일치)
  - **적용 대상 = 후보자만**. 후원회(단일 지출계정 2)·정당·국회의원은 이번 범위 제외.

### 1.2.1 [[negative-balance-reallocation]]에서 얻은 통찰 (2026-06-17 갱신)

실데이터(오준석후보) 사후 교정 작업에서 이 가드 설계를 정교화할 사실을 확인:

1. **단일 통합계좌 현실** — 캠프는 자금원(82~85)을 **하나의 통장**으로 운영하며, 은행 잔액은 한 번도 음수가 아니었다. 즉 자금원별 "가용잔액"은 **별도 현금이 아니라 태깅 구성물**이고, 음수는 *현금 부족이 아니라 태깅 불일치*다. → 경고 프레이밍을 "통장이 비었다"가 아니라 **"이 자금원으로 태깅하면 수입지출부·결산에서 음수가 되어 사후 재배분이 필요하다"**로 조정한다. 하드 차단이 부적절하다는 기존 non-blocking 결정이 이 통찰로 재확인됨.
2. **시간순(입력일 기준) 잔액이 정확** — 음수는 특정 시점(예 5/22)에 발생했다가 이후 입금으로 회복된다. 기존 `funding-allocation`의 **총합**만으론 "중간 음수"를 못 잡는다. 가드는 **입력하려는 거래일 기준 시간순 가용액**(그 날짜까지 입금된 수입 − 그 날짜까지 지출)을 보여야 한다. → 신규 `acc-book-sort.ts`(`compareAccDateTime`)로 시간순 정렬, `fund-realloc.ts`의 running-balance 계산 로직을 재사용.
3. **신규 재사용 자산** — `acc-book-sort.ts`·`fund-realloc.ts`(시간순 가용액·캐스케이드)가 이번에 생겼다. 가드의 "예상 잔액"은 이들과 동일 로직을 써 **예방(입력)과 교정(사후 재배분)이 같은 계산 기반**을 공유하게 한다.
4. **83(정당지원금)도 후보 자금원** — 실데이터에 83이 등장(진보당 시당 지원금). 가드는 후보자에게 존재하는 전 자금원(82·83·84·85)을 다룬다.

### 1.3 Related Documents / Files

- 지출 페이지: `app/src/app/dashboard/expense/page.tsx` (Supabase 직접 insert/update, `FundingAllocationPanel` 렌더 L503–552)
- 수기 입력: `app/src/app/dashboard/document-register/page.tsx` (`/api/acc-book` action=insert 경유, 자금원 패널 **없음**)
- 자금원 SSOT: `app/src/lib/accounting/funding-source.ts`, `app/src/lib/accounting/funding-allocation.ts`
- 기존 패널: `app/src/components/dashboard/FundingAllocationPanel.tsx`
- 결산 집계: `app/src/lib/accounting/settlement-calc.ts` (`computeBalances` → `byAccount`/`byFundSource`)
- 코드 조회 훅: `app/src/hooks/use-code-values.ts` (`getAccounts`, `getItems`, `getName`)
- 참고 Plan: `docs/01-plan/features/ledger-summary-header.plan.md`, `docs/01-plan/features/fund-source-redistribution.plan.md`
- 도메인 메모: `negative-refund-rows-in-aggregation`(환급=음수 acc_amt 지출 행), `election-item-classification-ssot`

---

## 2. Scope

### 2.1 In Scope (후보자 전용)

- [ ] **자금원 가용잔액 조회 유틸 확장** — 입력 중인 금액/대상 자금원을 반영한 "저장 후 예상 잔액"을 계산하는 순수 함수 (`funding-allocation` 확장 또는 신규 셀렉터).
- [ ] **계정 선택 UI 인라인 잔액** — 지출 계정 드롭다운/옵션에 각 자금원의 현재 가용잔액을 병기(예: `보조금 (가용 1,250,000원)`), 음수/임박은 색상 강조.
- [ ] **실시간 잔액 미리보기** — 계정·금액 입력 시 "현재 가용 X → 저장 후 Y" 표시. Y가 음수면 강조(빨강 + 경고 문구).
- [ ] **강한 경고 배너(non-blocking)** — 선택한 자금원이 음수가 되면 폼 영역에 명확한 경고 표시. 저장 버튼 문구/색상으로 인지 강화하되 저장은 허용.
- [ ] **`document-register`에 자금원 충당 현황 적용** — 후보자 지출 탭에서 동일한 패널/미리보기 노출.
- [ ] **환급(음수 지출) 정상 처리** — 음수 acc_amt 지출 행은 가용잔액을 오히려 증가시키므로 `acc_amt !== 0` 기반 합산 유지(과대계상 방지).
- [ ] **단위 테스트** — 잔액 계산/미리보기 순수 함수(경계: 정확히 0, 음수 전환, 환급 행, 자금원 미매핑=기타).
- [ ] **초보자 도움말**(`HelpTooltip`) 문구 갱신 — "왜 자금원을 골라야 하는지".

### 2.2 Out of Scope

- **후원회/정당/국회의원** 적용 (후원회는 자금원 구조가 달라 별도 설계 필요).
- **저장 하드 차단(blocking)** — 사용자 결정에 따라 non-blocking 경고만.
- **결산·보고서 단계의 음수 자동 보정** — `settlement-calc`의 재배분(규칙2)은 기존대로 유지, 본 기능은 입력 단계 예방에 한정.
- **신규 API 엔드포인트** — 기존 `acc_book` 조회 데이터로 클라이언트 집계 (필요 시 `summary`만 확장).
- **자금원 자동 추천/자동 선택** — 추천은 "여유 있는 자금원 강조"까지만, 자동 변경은 하지 않음.

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | 요구사항 | 우선순위 |
|----|----------|:--------:|
| FR-01 | 후보자 지출 입력 시, 자금원(82~85)별 **입력 거래일 기준 시간순 가용잔액**(그 날짜까지 입금−지출, 환급 반영; `compareAccDateTime` 정렬)을 화면에 표시 | High |
| FR-02 | 계정 선택 드롭다운/옵션에 해당 자금원의 가용잔액을 **인라인 병기** | High |
| FR-03 | 계정+금액 입력 시 **저장 후 예상 잔액**(현재→예상) 실시간 표시, 음수 전환 시 강조 | High |
| FR-04 | 선택 자금원이 음수가 되면 **강한 경고 배너** 표시(문구 명확). 저장은 **허용**(non-blocking) | High |
| FR-05 | 수정(update) 시 기존 행의 금액/계정 변경분을 반영해 예상 잔액 계산(자기 자신 제외 후 재가산) | Medium |
| FR-06 | `document-register` 후보자 지출 탭에도 자금원 충당 현황/미리보기 적용 | Medium |
| FR-07 | 환급(음수 acc_amt 지출)·정정 행을 정확히 합산(`acc_amt !== 0`, `>0` 필터 금지) | High |
| FR-08 | 자금원 분류·정렬·잔액 계산은 기존 SSOT(`funding-source`/`funding-allocation`/`acc-book-sort`/`fund-realloc`) **재사용**(중복 정의 금지) | High |
| FR-09 | 초보자 모드 도움말로 "자금원별 충당" 의미·선택 가이드 제공 | Low |
| FR-10 | 음수 경고 문구는 "현금 부족"이 아니라 **"이 자금원 태깅 시 수입지출부·결산에서 음수 → 사후 재배분 필요"**로 표기(단일 통합계좌 현실 반영) | Medium |

### 3.2 Non-Functional Requirements

| ID | 요구사항 |
|----|----------|
| NFR-01 | 잔액 집계는 `useMemo`로 메모이즈, org 전체 행(`allRows`)은 기존 로드 재사용(추가 조회 최소화) |
| NFR-02 | 기존 입력폼·테이블·일괄작업·영수증번호 채번 등 회귀 없음 |
| NFR-03 | 접근성: 색상 외 텍스트(경고 문구) 병기, 음수 상태 스크린리더 인지 가능 |
| NFR-04 | 디자인: `DESIGN.md` 준수, 기존 `FundingAllocationPanel` 톤과 일관 |
| NFR-05 | 후보자 외 기관유형에서는 기존 동작 그대로(신규 UI 미노출) |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] 후보자 지출 입력 시 자금원별 가용잔액이 표시되고, 값이 결산/수입지출부의 자금원별 집계와 일치
- [ ] 계정·금액 입력에 따라 "저장 후 예상 잔액"이 정확히 갱신되고, 음수 전환이 시각적으로 명확
- [ ] 음수 충당 시 경고가 뜨지만 저장은 정상 동작(non-blocking)
- [ ] `expense`·`document-register` 두 화면 모두 동일 동작
- [ ] 환급 행 포함 시나리오에서 잔액이 과대/과소계상되지 않음(교차검증)
- [ ] 잔액/미리보기 순수 함수 단위 테스트 통과, 기존 테스트 무회귀
- [ ] Gap analysis Match Rate ≥ 90%

### 4.2 Quality Criteria

- 자금원 분류·잔액 계산 로직 중복 0 (SSOT 재사용)
- lint/build 통과, 콘솔 에러 0
- 모바일/데스크톱 레이아웃 깨짐 없음

---

## 5. Risks and Mitigation

| 리스크 | 영향 | 완화 |
|--------|------|------|
| 입력 화면 잔액 ≠ 수입지출부/결산 집계 | 신뢰도 저하 | `funding-allocation`(이미 결산과 동일 분류) 단일 사용, DoD에서 교차검증 |
| 환급(음수 지출) 행 누락/오집계 | 가용잔액 과대계상 | `acc_amt !== 0` 합산, 메모 `negative-refund-rows-in-aggregation` 준수, 전용 테스트 |
| `allRows`(org 전체)가 필터/페이지네이션 영향으로 부분만 로드 | 잔액 부정확 | 자금원 집계는 **항상 org 전체** 행 기준(필터와 독립)으로 로드 보장 |
| 수정 시 자기 행 이중계상 | 예상 잔액 오류 | update는 대상 행 제외 후 입력값 가산하는 셀렉터로 처리(FR-05) |
| 자금원 미매핑 코드(기타) 처리 | 합계 불일치 | `classifyFundingSource` "기타" 분기 유지, 미매핑은 별도 표기 |
| 경고가 과하면 입력 피로 | UX 저하 | 음수/임박(예: 가용 10% 미만)만 강조, 정상은 차분한 톤 |
| `document-register`는 `/api/acc-book` 경유(다른 저장 경로) | 동작 불일치 | 표시 로직은 공통 컴포넌트로 분리, 저장 경로는 각 페이지 기존 유지 |

---

## 6. Architecture Considerations

### 6.1 Project Level

- **Level**: Dynamic (Next.js 16 + Supabase 풀스택). 신규 인프라 없음. 기존 컴포넌트/순수 함수 확장.

### 6.2 Key Architectural Decisions

- **신규 API 미신설**: 기존 `acc_book` org 전체 행 + 클라이언트 집계.
- **시간순 가용액(as-of-date) 재사용**: 단순 총합(`buildFundingAllocation`)이 아니라, 입력 거래일 기준 시간순 running-balance를 `compareAccDateTime`(acc-book-sort) 정렬 + `fund-realloc.ts`의 누계 로직으로 계산하는 셀렉터를 추가. "입력 중 행 가산/대상 행(수정 시 자기) 제외"를 받아 예상 잔액 산출. **예방(입력 가드)과 교정(사후 재배분)이 동일 계산 기반 공유**.
- **표시 vs 계산 분리**: 순수 함수(잔액/미리보기) → 표시 컴포넌트. 테스트는 순수 함수에 집중.
- **공통 컴포넌트화**: `expense`·`document-register`가 공유하도록 자금원 현황/미리보기 UI를 컴포넌트로 분리(기존 `FundingAllocationPanel` 확장 또는 인접 컴포넌트 신설).
- **non-blocking 경고**: 저장 경로(두 페이지의 기존 insert/update)는 변경 최소화, 경고는 UI 레이어에서만.

### 6.3 컴포넌트/모듈 구조(안)

```
lib/accounting/
  funding-allocation.ts          # (확장) projectAllocation(rows, draft) — 입력 중 금액/대상 자금원/제외 행 반영 예상 잔액
  funding-allocation.test.ts     # (확장) 미리보기·환급·수정 케이스
components/dashboard/
  FundingAllocationPanel.tsx     # (확장) 선택 자금원 하이라이트 + 예상 잔액 행 + 경고
  FundingDraftPreview.tsx        # (신설 가능) 계정/금액 입력 → "현재 X → 예상 Y" 미리보기 (expense·document-register 공유)
app/dashboard/expense/page.tsx          # 폼 state(acc_sec_cd, acc_amt)를 미리보기에 연결, 경고 배너
app/dashboard/document-register/page.tsx# 후보자 지출 탭에 동일 패널/미리보기 삽입
```

> 컴포넌트 분리 vs 기존 패널 확장의 최종 형태는 Design 단계에서 확정.

---

## 7. Convention Prerequisites

### 7.1 Existing Conventions

- 금액 포맷(`toLocaleString("ko-KR")`/`won`), 색상(수입 파랑·지출 빨강·잔액 초록/음수 빨강), `useCodeValues.getName`, `HelpTooltip`, org 스코프 필수.
- 자금원 비즈니스 로직은 `funding-source`/`funding-allocation`에서만(페이지 중복 금지).
- 환급/정정 합산은 `acc_amt !== 0` (메모 `negative-refund-rows-in-aggregation`).

### 7.2 To Define/Verify (Design 단계)

- 계정 드롭다운 인라인 잔액의 표기 형식(옵션 라벨 병기 vs 옵션 옆 보조 영역).
- "임박" 경고 임계값(예: 가용잔액 10% 미만) 도입 여부.
- 미리보기 위치(폼 상단/계정 필드 하단/패널 내부).
- 후원회 등에서 패널 비노출 분기 재확인(`orgType === "candidate"` 게이트).

### 7.3 Environment Variables

- 없음(기존 Supabase 환경변수로 충분).

---

## 8. Next Steps

1. `/pdca design income-account-balance-guard` — 예상 잔액 셀렉터 입출력 타입, UI 레이아웃(인라인/미리보기/경고), 컴포넌트 props, 테스트 케이스 명세
2. 구현: `funding-allocation` 셀렉터 확장 → 공통 미리보기/패널 → `expense`·`document-register` 연결
3. `/pdca analyze income-account-balance-guard` — Gap 분석
4. 실데이터 QA(자금원별 잔액 vs 수입지출부/결산 교차검증, 환급 행 포함)

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-06-16 | Claude | 최초 Plan 작성 (정책: non-blocking 경고 / 대상: 후보자만 확정) |
| 0.2 | 2026-06-17 | Claude | negative-balance-reallocation 통찰 반영 — 단일 통합계좌(태깅 아티팩트)·시간순 as-of-date 잔액·신규 SSOT(acc-book-sort/fund-realloc) 재사용·경고 프레이밍(FR-10) 추가 |
