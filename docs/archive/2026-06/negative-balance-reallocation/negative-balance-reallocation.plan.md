# 자금원 음수잔액 해소 재배분 → 계정별 수입지출부 엑셀 Planning Document

> **Summary**: 2026년 오준석 후보 실데이터에서 후원회기부금(85) 자금원의 시간순 잔액이 중간에 음수가 되는 문제를, **입금일·잔액을 반영한 시간순 그리디 재배분**(85 초과분을 그 시점에 잔액이 있는 후보자자산 84로 이동, 필요 시 금액 분할)으로 해소하고, 결과를 **계정(자금원)별 정치자금 수입지출부 엑셀**로 산출한다. **acc_book 원본·앱 코드는 건드리지 않고(report-only)**, 1회용 스크립트로 생성한다.
>
> **Project**: PoliticalFundAccountingManagement
> **Version**: 0.1.0
> **Author**: Claude
> **Date**: 2026-06-16
> **Status**: Draft
> **Related**: [[fund-source-redistribution]](settlement/PFund2 재배분, 원본보존 선례), [[income-account-balance-guard]](입력 시점 음수 예방 — 본 작업은 사후 교정), `acc-book-sort.ts`(시간순 정렬 SSOT)

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 오준석 후보 수입지출부를 자금원별로 보면 **후원회기부금(85)의 잔액이 거래 중간에 음수**가 된다. 지출이 그 시점까지 입금된 85 자금을 초과해 충당됐기 때문. 정치자금 회계에서 자금원 잔액 음수는 발생하면 안 된다. |
| **Solution** | 84·85의 **입금일·금액을 시간순으로 추적**하며, 85에 달린 지출이 그 시점 85 가용액을 넘으면 **초과분을 후보자자산(84)으로 재배분**(84 잔액 한도 내, 필요 시 한 지출을 85/84로 **금액 분할**)한다. 84·85 모두로도 못 대는 진짜 부족 시점은 **음수 유지 + 경고**. 결과는 **계정별 수입지출부 엑셀**. acc_book·앱 코드 무변경(보고서 레벨 재배분, 1회용 스크립트). |
| **Function/UX Effect** | 오준석 후보의 자금원별 수입지출부에서 85·84 잔액이 어느 시점에도 음수가 되지 않는(또는 진짜 부족 지점이 명시된) 공식 양식 엑셀을 즉시 받는다. |
| **Core Value** | 실데이터의 자금원 무결성을 **사후 교정**으로 확보 — 입금일 기반의 현실적 충당 순서를 반영한, 검증 가능한 수입지출부. |

---

## 1. Overview

### 1.1 Purpose

오준석 후보(2026) acc_book에서 **후원회기부금(acc_sec_cd=85)** 자금원의 시간순 누적 잔액(수입누계−지출누계)이 중간에 음수가 된다. 원인은 85에 달린 지출이, 그 거래일까지 입금된 85 수입을 초과해 발생했기 때문이다.

본 작업은 **84(후보자자산)·85(후원회기부금) 두 자금원의 입금일과 잔액을 시간순으로 참조**하여, 85가 음수가 되는 지출의 초과분을 그 시점 잔액이 있는 84로 옮기고(필요하면 한 지출을 두 자금원으로 금액 분할), **계정별 정치자금 수입지출부 엑셀**을 만든다. acc_book 원본은 보존하고 재배분은 **보고서 레벨에서만** 적용한다.

### 1.2 Background

- **후보자 자금원**(acc_sec_cd): 82=보조금, 83=보조금외, 84=후보자자산, 85=후원회기부금. incm_sec_cd: 1=수입, 2=지출. 날짜 `acc_date`(YYYYMMDD)+시각 `acc_time`(HHmm).
- **시간순 잔액 로직이 코드에 없다**: `funding-allocation.ts`(buildFundingAllocation)·`settlement-calc.ts`는 **총합만** 집계하고 `overspent`(총합 음수) 플래그만 낸다. "어느 시점에 음수가 되는가"는 **신규 로직**이 필요. 시간순 정렬 SSOT는 `lib/accounting/acc-book-sort.ts`의 `compareAccDateTime`(직전 작업에서 신설)을 재사용.
- **기존 재배분(settlement-calc `computeRedistributions`, 규칙2)** 은 결산 표시용 **집계 이동**일 뿐 acc_book 행을 안 건드리고 항상 자산(84)·선거비용(86)으로만 이동하며, 보전 인정액(cap) 기반이다. **본 작업과 목적·방식이 다르다**(시간순 입금일 기반 음수 해소). 단, **"원본 acc_book 보존, 표시 시점 가상 변환"** 원칙은 [[fund-source-redistribution]] 선례를 따른다.
- **계정별 수입지출부 엑셀**: `lib/excel-template/income-expense-book.ts`만 자금원별 시트를 내지만 **보전(선거비용+claim_amt+acc_print_ok='Y') 전용**이라 일반 수입지출부엔 부적합. `income-expense-book/page.tsx`의 15컬럼 단일 시트 양식이 일반 수입지출부에 가깝다(이를 계정별 시트로 확장).
- **환급 행**: 음수 `acc_amt` 지출(메모 [[negative-refund-rows-in-aggregation]]). 재배분 합산은 `acc_amt !== 0` 기준, 환급은 해당 자금원 가용액을 되돌린다.
- **결정 사항(사용자 확인 완료, 2026-06-16)**:
  - **처리 범위 = 엑셀만(DB·앱 무변경, report-only)**.
  - **재배분 자금원 = 84 ↔ 85만**(82·83 미동원).
  - **진짜 부족 시점 = 음수 유지 + 경고**(입금일 제약을 풀거나 보조금을 끌어오지 않음).

### 1.3 Related Documents / Files

- 데이터: Supabase `pfam.acc_book` (오준석 후보 org_id — Do 단계에서 `organ.org_name` 매칭으로 확정)
- 자금원 SSOT: `app/src/lib/accounting/funding-source.ts`
- 시간순 정렬 SSOT: `app/src/lib/accounting/acc-book-sort.ts` (`compareAccDateTime`)
- 수입지출부 양식 참조: `app/src/app/dashboard/income-expense-book/page.tsx`(15컬럼 단일 시트), `app/src/lib/excel-template/income-expense-book.ts`(자금원별 시트·보전 전용)
- 프로덕션 조회 스크립트 패턴: `app/scripts/generate-and-compare.mjs`(`.env.local` 파싱 → `createClient` → `acc_book` 조회, `--org-id`)
- 참고 Plan: [[fund-source-redistribution]], [[income-account-balance-guard]]

---

## 2. Scope

### 2.1 In Scope

- [ ] **읽기 전용 진단**: 오준석 org_id 확정 → 84·85의 시간순 잔액 추이 계산 → **현재 음수가 발생하는 시점·금액 측정**(재배분 전 baseline).
- [ ] **시간순 가용잔액 추적기**(순수 함수): `compareAccDateTime`로 정렬된 84·85 거래를 훑으며 자금원별 running available 계산.
- [ ] **그리디 재배분 알고리즘**(순수 함수): 85 지출의 초과분을 그 시점 84 가용액 한도로 이동, 필요 시 한 지출을 85/84로 **금액 분할**. 84·85 모두 부족하면 85 음수 유지 + 부족분 기록.
- [ ] **계정별 수입지출부 엑셀 생성**(1회용 스크립트, ExcelJS): 자금원별 시트(82·83·84·85)에 수입+지출을 시간순 병합, 재배분 반영된 지출 행(분할 시 2행), 수입/지출 누계·잔액, 거래처·영수증번호·비고. 84·85 시트 잔액이 음수 없음(또는 진짜 부족 지점 명시).
- [ ] **재배분·경고 리포트**: 어떤 지출이 얼마만큼 85→84로(또는 분할로) 이동했는지, 진짜 부족 시점 목록.
- [ ] **단위 테스트**: 추적기·재배분 순수 함수(경계: 정확히 0, 분할, 환급 음수 행, 84·85 동시 부족, 동일 날짜·시각 tie-break).

### 2.2 Out of Scope

- **acc_book DB 수정**(acc_sec_cd 변경·분할 행 insert) — 결정상 제외(report-only). 영수증 재채번·증빙 FK·정렬 영향 회피.
- **앱 기능화**(화면/결산 옵션) — 이번은 1회용 산출. (재사용 필요 시 별도 feature, [[income-account-balance-guard]]와 통합 검토)
- **82·83(보조금/보조금외) 동원** — 84↔85만.
- **입금일 제약 완화** — 그 날짜까지 입금된 금액만 충당 가능(현실 현금흐름). 못 대면 음수 유지.
- **선거비용/선거비용외 재분류** — 재배분은 자금원(acc_sec_cd)만 바꾸고 과목(item_sec_cd·선거비용 구분)은 보존.
- **settlement-calc `computeRedistributions`(규칙2) 변경** — 결산/보전 파이프라인과 분리.

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | 요구사항 | 우선순위 |
|----|----------|:--------:|
| FR-01 | 오준석 org의 84·85 거래를 `compareAccDateTime` 시간순으로 정렬해 자금원별 **시간순 가용잔액**을 계산 | High |
| FR-02 | 85 지출이 그 시점 85 가용액을 초과하면 초과분을 **84로 재배분**(84 가용 한도 내) | High |
| FR-03 | 한 지출이 85 가용액을 일부만 초과하면 **금액 분할**(85: 가용분 / 84: 초과분) | High |
| FR-04 | 84·85 모두 부족한 시점은 85 **음수 유지 + 부족분·시점 경고 기록** | High |
| FR-05 | 환급(음수 acc_amt) 행은 원 자금원 가용액을 되돌리며 합산(`acc_amt !== 0`) | High |
| FR-06 | 결과를 **자금원별 시트**의 정치자금 수입지출부 엑셀로 출력(수입+지출 시간순, 누계·잔액, 거래처·영수증·비고) | High |
| FR-07 | 84·85 시트의 시간순 잔액이 음수가 없음(진짜 부족 지점만 예외로 표시) | High |
| FR-08 | 재배분 내역 리포트(이동 지출·금액·분할 여부, 진짜 부족 목록) 동반 | Medium |
| FR-09 | acc_book·앱 코드 무변경(원본 보존), 재배분은 산출물에만 반영 | High |

### 3.2 Non-Functional Requirements

| ID | 요구사항 |
|----|----------|
| NFR-01 | 재배분 결정성: 동일 입력 → 동일 출력(시간순 정렬 + 그리디, tie-break는 `compareAccDateTime` → acc_book_id) |
| NFR-02 | 총액 보존: 재배분 전후 84+85 **총 지출 합계 불변**(분포만 이동), 총 수입 불변 |
| NFR-03 | read-only: 프로덕션 DB에 쓰기 없음. 서비스롤 키는 `.env.local`에서만, 산출물에 자격증명 미포함 |
| NFR-04 | 추적기·재배분은 순수 함수로 분리해 단위 테스트 가능 |
| NFR-05 | 엑셀 양식은 선관위 정치자금 수입지출부 레이아웃 준수(기존 income-expense-book 페이지 양식 일관) |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] 재배분 전 baseline에서 85 음수 시점·금액이 측정·기록됨
- [ ] 재배분 후 84·85 시트의 시간순 잔액에 음수 없음(또는 진짜 부족 지점이 경고로 명시)
- [ ] 재배분 전후 84+85 총 지출·총 수입 합계 불변(검증)
- [ ] 금액 분할이 발생한 지출은 85/84 두 행 합이 원금액과 일치
- [ ] 환급(음수) 행 포함 시 가용잔액이 과대/과소계상되지 않음
- [ ] 계정별 수입지출부 엑셀(.xlsx) 산출, 자금원별 시트·누계·잔액 정확
- [ ] 추적기·재배분 순수 함수 단위 테스트 통과
- [ ] acc_book·앱 코드 변경 0 (git diff에 산출 스크립트/테스트 외 변경 없음)

### 4.2 Quality Criteria

- 자금원 분류·정렬은 기존 SSOT(`funding-source`, `acc-book-sort`) 재사용(중복 정의 0)
- 진짜 부족(자금 부족) 시점은 숨기지 않고 명시 — "음수를 강제로 0으로 만드는" 왜곡 금지

---

## 5. Risks and Mitigation

| 리스크 | 영향 | 완화 |
|--------|------|------|
| 재배분이 자금흐름을 왜곡(실제 지급원과 불일치) | 회계 신뢰성·법적 정합 | 입금일 기반의 **현실적 충당 순서**만 반영, acc_book 원본 보존(report-only), 진짜 부족은 음수 유지·경고로 사실 보존 |
| 진짜 자금 부족을 재배분으로 가림 | 입금 누락/일자 오류 은폐 | 84·85 모두 부족 시 음수 유지 + 부족분·시점 명시(FR-04), 별도 리포트 |
| 환급(음수) 행 오집계 | 가용잔액 과대 | `acc_amt !== 0`, 환급은 원 자금원 가용 복원, 전용 테스트([[negative-refund-rows-in-aggregation]]) |
| 84도 음수가 되는 케이스(84 자체 지출 과다) | 84↔85만으론 해소 불가 | 84 음수도 경고 대상으로 측정·표시(재배분은 85→84 단방향, 84 부족은 진짜 부족으로 분류) |
| 분할 시 영수증번호·증빙 의미 혼동 | 산출물 해석 혼선 | report-only라 DB 영수증번호 불변, 분할 행은 엑셀에서 "분할(원 영수증 X)" 주석. 증빙 FK 무영향 |
| 오준석 org_id 오식별 | 엉뚱한 데이터 산출 | org_name 매칭 후 org_sec_cd(후보=90)·거래 건수로 교차 확인, Do 첫 단계에서 사용자에게 org_id 확인 |
| 프로덕션 read 자격증명 노출 | 보안 | `.env.local`만 사용, 산출 .xlsx·로그에 키 미포함, 스크립트는 read만 |

---

## 6. Architecture Considerations

### 6.1 Project Level

- **Level**: Dynamic. **신규 인프라·앱 코드 변경 없음.** 1회용 분석 스크립트 + 순수 함수 모듈 + 단위 테스트.

### 6.2 Key Architectural Decisions

- **Report-only / 1회용 스크립트**: `app/scripts/realloc-negative-balance.mjs`(가칭)가 `.env.local`로 read-only 조회 → 순수 함수로 재배분 → ExcelJS로 계정별 .xlsx 생성. acc_book 무변경.
- **순수 함수 분리(테스트 가능)**: 시간순 추적·재배분 로직을 `lib/accounting/` 순수 모듈로(예: `fund-realloc.ts`) 두어 단위 테스트. 스크립트는 조회·엑셀 I/O만.
- **SSOT 재사용**: 자금원 분류 `funding-source.ts`, 시간순 정렬 `acc-book-sort.ts`.

### 6.3 알고리즘 (그리디, 시간순)

```text
정렬: 84·85 전 거래를 compareAccDateTime(acc_date→acc_time→acc_book_id)
상태: avail[84], avail[85] (running 가용액)
각 거래 t 순회:
  수입(incm=1, src∈{84,85}):  avail[src] += acc_amt
  지출(incm=2, src=85, 금액 A>0):
     use85 = min(A, max(0, avail[85]))
     deficit = A - use85
     if deficit > 0:
        move = min(deficit, max(0, avail[84]))   # 84로 이동(분할)
        shortfall = deficit - move                # 진짜 부족(둘 다 부족)
        avail[84] -= move
        → 출력행: 85에 use85, 84에 move (분할 시 2행), 부족분 shortfall은 85에 남겨 음수 + 경고
     else:
        avail[85] -= A
  지출(incm=2, src=84, 금액 A>0):  avail[84] -= A  (84 음수면 경고; 85→84 이동분도 합산)
  환급(acc_amt<0): 해당 src avail 복원(부호대로 가산)
```
- **단방향(85→84)**: 84는 음수가 안 되도록 이동 한도를 두되, 84 자체 지출로 음수가 나면 진짜 부족으로 분류.
- **총액 보존**: 이동은 분포만 바꿈 — 84+85 총지출·총수입 불변.

### 6.4 산출물

```text
app/scripts/realloc-negative-balance.mjs   # read-only 조회 + 재배분 호출 + ExcelJS 계정별 시트
app/src/lib/accounting/fund-realloc.ts      # 순수: 시간순 추적 + 그리디 재배분 (입력 rows → {시트별 행, 재배분내역, 부족경고})
app/src/lib/accounting/fund-realloc.test.ts # 단위 테스트
출력: 오준석_정치자금수입지출부_계정별_YYYYMMDD.xlsx (자금원별 시트 + 재배분 리포트 시트)
```

---

## 7. Convention Prerequisites

### 7.1 Existing Conventions

- 금액 포맷 `toLocaleString("ko-KR")`, 자금원 분류 `funding-source`, 시간순 정렬 `acc-book-sort`, 환급 `acc_amt !== 0`.
- 수입지출부 엑셀 레이아웃은 `income-expense-book/page.tsx`(15컬럼: 번호·년월일·내역·수입(금회/누계)·지출(금회/누계)·잔액·거래처 5열·영수증·비고) 참조.

### 7.2 To Define/Verify (Design 단계)

- 오준석 org_id 확정(org_name 매칭) 및 조회 기간(전체 vs 회계기간).
- 분할 행의 엑셀 표기(내역에 "(분할: 원 영수증 …)" 주석, 영수증번호 표시 방식).
- "진짜 부족" 경고의 엑셀 내 표기(셀 강조·별도 시트).
- 84 자체 음수(있다면) 처리·표기.
- 자금원별 시트 외 통합 시트 포함 여부.

### 7.3 Environment Variables

- 기존 `.env.local`(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)로 충분. 신규 없음.

---

## 8. Next Steps

1. `/pdca design negative-balance-reallocation` — `fund-realloc.ts` 입출력 타입, 재배분 알고리즘 의사코드 확정, 엑셀 시트 레이아웃·분할/경고 표기, 테스트 케이스 명세
2. **Do 첫 단계(읽기 전용 진단)**: 오준석 org_id 확정 → 84·85 시간순 잔액 추이·음수 시점/금액 측정(사용자에게 baseline 공유)
3. 구현: `fund-realloc.ts`(+테스트) → `realloc-negative-balance.mjs` → 엑셀 산출
4. 검증: 총액 보존·분할 합·환급·음수 해소 교차검증 후 .xlsx 사용자 확인

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-06-16 | Claude | 최초 Plan (정책: report-only / 84↔85 / 부족시 음수유지·경고 확정) |
