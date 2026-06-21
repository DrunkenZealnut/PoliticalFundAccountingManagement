# 수입·지출부 과목 배분 — 공식(Fund_Data_1.db)과 동일한 내부 데이터 구조 Planning Document

> ⚠️ **SUPERSEDED (2026-06-21)** — 본 플랜의 유효 결정은 [docs/05-reference/자금원배정방식.md](../../05-reference/자금원배정방식.md)로 통합됨. 과목 재태깅은 **Pass2 `item-allocation.ts`** 로 구현. 단, **acc_book 영구 write(scripts 016/017)** 방식은 **보고 시점 계산**으로 롤백됨(016/017 사장, 018 DROP 권고). 현재 진실은 권위 문서를 볼 것.

> **Summary**: 정치자금수입지출부를 (계정×과목)별로 출력할 때 잔액이 깨지는 근본 원인은 **수입 행의 과목(item_sec_cd) 기장이 실제 집행과 정합되지 않기 때문**이다. 공식 프로그램(Fund_Data_1.db)은 "수입을 충당 대상 과목으로 기장"해 모든 (계정×과목)이 잔액 0으로 균형이다. 본 작업은 **표시용 임시처방을 폐기**하고, 공식과 **동일한 내부 데이터 구조**(수입 행이 충당 과목으로 분할·태깅되어 acc_book에 영구 기록)를 만든다. ① 입력 단계 과목 힌트 + ② 마감 시 3-pass 자동배분을 acc_book에 영구 기록 + ③ 기존 데이터 일회성 마이그레이션.
>
> **Project**: PoliticalFundAccountingManagement
> **Version**: 0.1
> **Author**: Claude
> **Date**: 2026-06-19
> **Status**: Draft
> **Related**: `docs/superpowers/specs/2026-06-19-income-expense-balance-model-design.md`(표시용 모델 — 본 작업이 이를 데이터화로 대체), [[negative-balance-reallocation]], `fund-realloc.ts`(Pass1), `adjust-negative-income.ts`(Pass0), 메모 [[income-expense-book-funding-realloc]]

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 정치자금수입지출부를 (계정×과목)별로 뽑으면 잔액이 깨진다. 실데이터(2026 오준석) 검증: 계정85(후원회기부금)×과목87(선거비용외)은 지출 5,007,485원이 있는데 **수입이 0원 → 잔액 −5,007,485**. 후원회기부금 수입 7건이 전부 과목86(선거비용)으로 기장됐기 때문. 통장 전체 현금은 +132,500으로 정확하나 **(계정×과목) 슬라이싱에서만** 음수. 기존 스펙의 "표시용 배분"은 원본 데이터를 안 고쳐 임시처방에 머문다. |
| **Solution** | 공식 모델("수입을 충당 대상 과목으로 기장")을 **데이터 구조로 재현**한다. ① 후보자 수입 입력 시 (계정×과목) 균형을 돕는 **과목 힌트**, ② 결산 마감(또는 "과목배분 확정" 액션) 시 **Pass0(음수수입 정규화)→Pass1(자금원 재배분)→Pass2(과목 배분)** 결과를 acc_book에 **영구 기록**(수입행 분할·재태깅, 원본은 acc_book_bak 백업·가역), ③ 기존 데이터 **일회성 마이그레이션**. 결과 .db는 Fund_Data_1.db와 구조적으로 동일. |
| **Function/UX Effect** | 수입·지출부·HWPX 서식7/22-4·결산·SQLite export 어디서 뽑아도 모든 (계정×과목) 잔액 ≥ 0이며 충당된 만큼 균형. 윈도우 공식 프로그램으로 라운드트립해도 동일 수치. "사후 표시 보정"이 아니라 **저장된 회계장부 자체가 정확**. |
| **Core Value** | 정치자금 회계장부의 **데이터 무결성**을 공식 표준과 일치시킴 — 임시처방(표시용) 의존 제거, 단일 진실원(acc_book)이 공식 구조와 1:1. |

---

## 1. Overview

### 1.1 Purpose

후보자 회계에서 수입·지출부는 **계정(자금원: 82=보조금·83=보조금외지원금·84=후보자등자산·85=후원회기부금) × 과목(86=선거비용·87=선거비용외정치자금)** 조합별로 출력된다. 이 조합별 잔액이 음수가 되면 안 된다.

근본 진실: **선거비용/선거비용외는 본질적으로 "지출의 속성"이다.** 돈은 대체가능(fungible)하므로 수입 자체에는 86/87 구분이 내재하지 않는다. 공식 프로그램은 이를 **수입을 "그 돈으로 충당할 지출의 과목"으로 기장**하여 해결한다. 본 작업은 동일한 데이터 구조를 우리 시스템에서 만든다 — 임시 표시 보정이 아니라 acc_book에 영구 기록.

### 1.2 Background — 두 DB 정밀 분석 결과 (2026-06-19)

대상: `data/송파/Fund_Data_1.db`(송파 박지선, 공식 윈도우 프로그램 산출) vs `data/송파/2026 오준석후보(자체분-2026).db`(우리앱 산출).

**(1) 스키마는 바이트 단위 동일** — `ACC_BOOK` 28컬럼 전부 일치(타입·NULL·기본값 포함). 차이는 **데이터(수입 행의 ITEM_SEC_CD 기장 방식)**뿐.

**(2) 공식(Fund_Data_1) — 모든 (계정×과목) 완벽 균형 (잔액 0):**

| 계정 | 과목 | 수입 | 지출 | 잔액 |
|---|---|---|---|---|
| 82 보조금 | 86 선거비용 | 2,320,000 | 2,320,000 | **0** |
| 82 보조금 | 87 선거비용외 | 1,680,000 | 1,680,000 | **0** |
| 84 후보자자산 | 86 선거비용 | 1,379,500 | 1,379,500 | **0** |
| 84 후보자자산 | 87 선거비용외 | 420,000 | 420,000 | **0** |

비결(거래 추적): "후보자 자산" 수입 420,000을 **기탁금(선거비용외)을 충당할 돈이므로 과목 87**로 기장 → 같은 과목 87 지출 "기탁금" 420,000과 정확히 상쇄. "진보당 서울시당 지원금" 1,680,000도 기탁금 충당분이라 과목 87로 기장. **수입 과목 = 그 수입으로 집행한 지출의 과목.**

**(3) 우리앱(오준석) — 깨짐:**

| 계정 | 과목 | 수입 | 지출 | 잔액 |
|---|---|---|---|---|
| 83 보조금외지원금 | 86 | 3,000,000 | 3,000,000 | 0 |
| 84 후보자자산 | 86 | 15,602,392 | 15,571,352 | +31,040 |
| 84 후보자자산 | 87 | 6,500,187 | 6,531,227 | **−31,040** |
| 85 후원회기부금 | 86 | 9,430,000 | 4,290,015 | +5,139,985 |
| 85 후원회기부금 | 87 | **0** | 5,007,485 | **−5,007,485** |

계정85 수입 7건이 **전부 과목86으로 기장**(후원회 기부금 1,000,000/3,830,000/2,250,000/600,000/850,000 + 후원금 500,000/400,000). 정작 그 돈으로 선거비용외(87) 5,007,485원을 집행 → 87 슬라이스엔 수입이 없어 음수. 84도 86/87 수입 분포가 실제 집행과 미세 불일치(±31,040).

**(4) 현금은 맞다** — 오준석 통장 전체: 총수입 34,532,579 − 총지출 34,400,079 = 잔액 132,500(실통장 일치). 즉 **금액의 증발/창출이 아니라 과목 태깅 불일치**가 문제. 공식 샘플(20거래)이 우연히 균형인 건 데이터가 작고 큐레이션됐기 때문.

**(5) 공식엔 잔액 컬럼·집계 테이블이 없다** — `ACC_BOOK`에 잔액 컬럼 없음(렌더 시 계산), `SUM_REPT` 비어 있음. 즉 균형은 **원시 수입·지출 행의 과목 태깅 자체로** 성립.

### 1.3 기존 시도와 본 작업의 차별점

| 시도 | 위치 | 결과 | 한계 |
|---|---|---|---|
| v0.14.8.0 (현재 prod) | 표시(과목 단순 필터) | 87 슬라이스 음수(−5,038,525) | 수입이 86에 몰려 87에 모자람 |
| v0.15.0.0 (revert됨, #84) | 표시(수입=자금원 전체) | 부풀림(+22,993,867) | 무관 거액 수입 합산 |
| **표시용 3-pass 스펙** (2026-06-19) | 표시(buildLedgerRows) | 음수 0·합 보존 | **원본 acc_book 불변 → 임시처방. export·외부 라운드트립 시 원본은 여전히 깨짐** |
| **본 작업** | **데이터(acc_book 영구 기록)** | 음수 0·합 보존·**공식 구조 동일** | 분할 행 데이터모델·마감 트리거·마이그레이션 필요 |

> **방향 전환(사용자 결정, 2026-06-19)**: 기존 스펙은 "교정 위치 = 표시용, 원본 불변"으로 결정했으나, 본 작업은 이를 뒤집어 **데이터를 실제로 교정**한다. "임시처방이 아니라 Fund_Data_1.db와 동일한 내부 데이터 구조"를 만들라는 명시 요청.

### 1.4 결정 사항 (사용자 확인 완료, 2026-06-19)

- **배분 시점 = 입력 힌트 + 마감 보정 병행.** 입력 시 과목을 힌트로 받되, 결산 마감(또는 명시적 "과목배분 확정") 시 자동배분으로 (계정×과목) 균형을 강제·영구 기록.
- **기존 데이터 = 일회성 마이그레이션 포함.** acc_book_bak 백업 후 기존 수입행에 배분 결과 기록 → 백업 .db도 즉시 공식 구조와 동일.
- **잉여 수입**(자금원 수입 > 지출): 원래 과목 유지(공식과 동일).
- **적용 범위 = 후보자 기관(`orgType==="candidate"`)만.** 후원회/정당은 계정=수입/지출 직접 인코딩 구조라 과목 배분 개념이 다름 → 종전 동작 유지.

### 1.5 Related Documents / Files

- 설계 스펙(표시용, 대체 대상): `docs/superpowers/specs/2026-06-19-income-expense-balance-model-design.md`
- Pass0: `app/src/lib/accounting/adjust-negative-income.ts` (음수 수입 정규화 — 기구현)
- Pass1: `app/src/lib/accounting/fund-realloc.ts` (자금원 재배분 — 기구현, 191줄)
- Pass2: `app/src/lib/accounting/item-allocation.ts` (**신규**, 과목 배분)
- 조합 헬퍼: `app/src/lib/accounting/ledger-allocation.ts` (**신규**, Pass0→1→2)
- 정렬 SSOT: `app/src/lib/accounting/acc-book-sort.ts` (`compareAccDateTime`)
- 자금원 SSOT: `funding-source.ts`, `funding-allocation.ts`, `funding-balance-asof.ts`
- 수입 입력: `app/src/app/dashboard/income/page.tsx` (과목 선택 이미 존재 — L206 "과목을 선택하세요")
- 수입·지출부: `app/src/app/dashboard/income-expense-book/page.tsx`, `reports/page.tsx`, `lib/hwpx/income-ledger-builder.ts`(서식7/22-4)
- 결산/마감: `app/src/app/dashboard/settlement/page.tsx`, `app/scripts/013_finalize_settlement.sql`(`finalize_settlement` RPC)
- export: `app/src/app/api/system/export-sqlite/route.ts` (`stripAppOnlyAccBookColumns`)
- 도메인 메모: [[income-expense-book-funding-realloc]], [[negative-refund-rows-in-aggregation]], [[election-item-classification-ssot]]

---

## 2. Scope

### 2.1 In Scope (후보자 전용)

- [ ] **Pass2 과목 배분 순수 함수** (`item-allocation.ts`) — 한 자금원 집합 내 수입을 과목에 배분(시간순·최소이동·수입행 분할). Pass1과 대칭(fund-realloc=지출을 자금원 간 이동 / item-alloc=수입을 과목 간 이동).
- [ ] **조합 헬퍼** (`ledger-allocation.ts`) — `buildLedgerRows = adjustNegativeIncome(Pass0) → reallocateFundSources(Pass1) → allocateIncomeToItems(Pass2)`. 영구화/표시 양쪽이 동일 함수 사용.
- [ ] **영구화(persist) 경로** — 배분 결과를 acc_book에 기록. 수입행 분할(원행 → 86분 + 87분), 원본은 acc_book_bak로 백업. 멱등(재실행 시 raw에서 재생성). 서버 액션 또는 RPC.
- [ ] **마감 트리거** — `finalize_settlement`(또는 신규 "과목배분 확정" 액션)에서 후보자 org에 영구화 실행. 마감 전 미리보기.
- [ ] **일회성 마이그레이션 스크립트** — 기존 후보자 org(2026/2022 오준석 등)에 buildLedgerRows 적용·기록. 백업·롤백 포함. dry-run 카운트.
- [ ] **입력 과목 힌트** (`income/page.tsx`) — 후보자 수입 입력 시 선택 계정×과목의 현재 잔액·"균형에 필요한 과목" 힌트(비차단). `funding-balance-asof` 재사용.
- [ ] **수입·지출부/리포트/HWPX 정합** — 영구화 후엔 원본이 이미 정확하므로 표시 경로는 acc_book을 그대로 사용. (영구화 미적용 org는 표시용 buildLedgerRows 폴백 — 6.2 참조)
- [ ] **export-sqlite 정합** — 분할 행·신규 추적 컬럼이 공식 DDL과 충돌하지 않게 `stripAppOnlyAccBookColumns` 확장. FK-orphan/영수증번호 무회귀.
- [ ] **단위·통합 테스트** — item-allocation(시간순/분할/잉여-원과목/환급), buildLedgerRows 조합 불변식, Fund_Data_1 20거래 항등성, 오준석 org9·11 음수0·합보존.

### 2.2 Out of Scope

- **후원회/정당/국회의원** 과목 배분 (구조 상이 — 종전 동작 유지).
- **입력 단계 하드 차단** — 힌트는 비차단(잉여·정정·환급으로 일시 불일치 불가피).
- **수입지출보고서 총괄표(`buildSummarySheet`)** 모델 변경 — 별도 결정(현 raw 유지).
- **공식 .txt 취합 라운드트립**·국세청 추출 등 갭분석 별건(`공식프로그램_갭분석_2026-06-18.md` 영역).
- **과목을 입력 시점에 100% 사용자가 확정**하게 강제 — 마감 자동배분이 최종 정합을 책임지므로 입력은 힌트만.

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | 요구사항 | 우선순위 |
|----|----------|:--------:|
| FR-01 | `item-allocation.ts` 순수 함수: 한 자금원의 시간순 행을 받아, 과목별 수입 풀을 유지하며 지출 과목 부족분을 잉여 과목 수입에서 끌어와 재태깅(수입행 분할). 잉여는 원과목 유지. | High |
| FR-02 | `ledger-allocation.ts`: Pass0→Pass1→Pass2 조합. 입력=raw 행, 출력=`{sheetAccSecCd, effectiveItemSecCd, effectiveAmt, origin, splitFrom}` 보유 행. | High |
| FR-03 | **영구화**: buildLedgerRows 결과를 acc_book에 반영 — 분할된 수입행은 원행 삭제 후 2행(또는 N행) insert, 지출행은 과목 유지. 원시 행 전체를 acc_book_bak에 백업. | High |
| FR-04 | **멱등성**: 영구화는 항상 **raw(백업) 기준 재생성**. 재실행 시 이전 배분 결과를 폐기하고 raw에서 다시 산출 → 지출 변경 후 재마감해도 정확. | High |
| FR-05 | **마감 트리거**: 후보자 org 결산 마감 시 영구화 실행. 마감 전 (계정×과목) 균형 미리보기·배분 건수 표시. | High |
| FR-06 | **일회성 마이그레이션**: 지정 org에 영구화 1회 실행(백업→배분→기록), dry-run 카운트·롤백. 2026·2022 오준석 검증. | High |
| FR-07 | **입력 힌트**: 후보자 수입 입력 시 선택 (계정×과목)의 현재 잔액과 "이 수입을 어느 과목으로 태깅하면 균형이 맞는지" 안내(비차단). | Medium |
| FR-08 | **합 보존 불변식**: 배분 후 자금원별 수입합 = 원본 수입합, 지출합 = 원본 지출합. (분할만, 증발·증식 없음) | High |
| FR-09 | **무음수 불변식**: 영구화 후 모든 (계정×과목) 시간순 최저잔액 ≥ 0(부풀림 없음). | High |
| FR-10 | **환급(음수 지출)·정정 처리**: 음수 acc_amt 지출은 해당 과목 잔액 복원(`acc_amt !== 0`). 음수 수입은 Pass0로 양수 지출 전환. | High |
| FR-11 | **분할 행 메타 보존**: cust_id·content·date·rcp·evidence 링크 보존, acc_amt만 분할. 영수증번호 채번·첨부서류 무중복. | High |
| FR-12 | **export/표시 정합**: 영구화된 org는 표시·export가 acc_book 직접 사용. 미적용 org는 표시용 폴백. export DDL 충돌 없음. | Medium |

### 3.2 Non-Functional Requirements

| ID | 요구사항 |
|----|----------|
| NFR-01 | 배분 로직은 전부 순수 함수(테스트 가능), 영구화는 트랜잭션(부분 기록 금지) |
| NFR-02 | 영수증번호(`receipt-no.ts`)·첨부(`evidence_file`)·정렬(`compareAccDateTime`)·FK-orphan 방지 무회귀 |
| NFR-03 | 후보자 외 기관유형은 동작·스냅샷 완전 동일(회귀 0) |
| NFR-04 | export .db를 윈도우 공식 프로그램에 로드 시 수입·지출부 수치가 우리앱과 일치(라운드트립 검증) |
| NFR-05 | 멱등·가역 — 언제든 acc_book_bak(raw)로 복원 가능, 표시 폴백으로 즉시 우회 가능 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] `item-allocation.ts`·`ledger-allocation.ts` 단위 테스트 통과(시간순/분할/잉여/환급/조합 불변식)
- [ ] **Fund_Data_1.db 20거래 항등성**: 이미 균형인 데이터를 buildLedgerRows 통과 시 (계정×과목) 잔액 0 유지·분할 없음
- [ ] **오준석 org11(2026)**: 5개 (계정×과목) 전부 잔액 ≥ 0, 85×87 −5,007,485 → 0, 잉여 85×86, 환급 −108,583 정상, 총계 수입 34,532,579·지출 34,400,079·잔액 132,500 보존
- [ ] **오준석 org9(2022)**: 음수 0·shortfall 0·합 보존(Pass0로 −500,000 처리)
- [ ] 영구화 실행 후 acc_book이 위 균형을 만족하고 acc_book_bak에 raw 보존, 재실행 멱등
- [ ] 일회성 마이그레이션으로 기존 org 교정, export .db가 Fund_Data_1과 동일 구조(0 FK-orphan, (계정×과목) 균형)
- [ ] 수입 입력 힌트 노출(후보자), 비차단
- [ ] 비후보자·영수증·첨부·export 무회귀, lint/build 통과
- [ ] Gap analysis Match Rate ≥ 90%

### 4.2 Quality Criteria

- 배분/잔액 로직 중복 0 (Pass0/1/2 SSOT 재사용)
- 영구화·표시가 **동일 buildLedgerRows** 공유(이원화 금지)
- 윈도우 프로그램 라운드트립 수치 일치 스크린샷/PDF 대조

---

## 5. Risks and Mitigation

| 리스크 | 영향 | 완화 |
|--------|------|------|
| 분할 행 데이터모델(영수증·첨부·익명 cust_id) 부작용 | 채번 중복·FK 오류 | 분할 시 원행 메타 보존·rcp는 원행 1건만, evidence 링크 정책 Design 확정, 멱등 재생성 |
| 영구화 멱등성 깨짐(재마감 시 이중 분할) | 합 불일치·증식 | **항상 raw(bak) 기준 재생성** — 이전 배분 폐기 후 재산출(FR-04), 트랜잭션 |
| 마감 후 거래 추가/수정 | 균형 재붕괴 | 입력 후 "재배분 필요" 안내 + 재마감/재확정 시 자동 재생성 |
| export DDL 충돌(신규 추적 컬럼) | 백업 전체 실패 | app-only 컬럼은 `stripAppOnlyAccBookColumns` 확장, acc_time 선례 준수 |
| 마이그레이션 오작동→데이터 손상 | 영구 손실(단일 prod) | dry-run 필수, acc_book_bak 백업 선행, 롤백 스크립트, org 1개씩 |
| 표시용 스펙과 이원화 | 유지보수 혼선 | 표시용 buildLedgerRows를 영구화와 **공유**, 폴백 용도로만 잔존 |
| shortfall(통장 전체 부족=데이터 오류) | 음수 잔류 | Pass1에서 음수 잔류로 표면화(은폐 금지), 실데이터엔 미발생 확인 |
| 잉여 수입 원과목 유지 vs 사용자 기대 | 미세 차이 | 결정사항 명시·힌트로 안내, 공식과 동일 동작 |

---

## 6. Architecture Considerations

### 6.1 Project Level

- **Level**: Dynamic (Next.js 16 + Supabase). 신규 인프라 없음. 순수 함수 + 서버 액션/RPC + 마이그레이션 스크립트.

### 6.2 Key Architectural Decisions

- **단일 진실원 = acc_book(영구화 org)**: 영구화된 후보자 org는 표시·export·HWPX·결산 모두 acc_book 직접 사용. 표시용 buildLedgerRows는 **미영구화 org의 폴백**으로만 잔존(완전 제거 대신 점진 전환 — 롤백 안전).
- **영구화·표시 로직 단일화**: 동일 `buildLedgerRows`(Pass0→1→2)를 (a) 표시 시 in-memory, (b) 마감 시 acc_book write에 공유. 알고리즘 이원화 금지.
- **멱등·가역 모델**: raw 행을 acc_book_bak에 보존 → 영구화는 항상 raw에서 재생성. 재마감/데이터변경에도 결정적. 롤백 = bak 복원.
- **수입행 분할 = 정상 ACC_BOOK 행 N개**: 공식 구조와 동일(공식도 과목별 별도 행). 분할 추적 메타(`splitFrom`/origin)는 app-only 컬럼으로 두되 export 시 strip → 공식 .db는 순수 ACC_BOOK 행만.
- **트리거 = 마감 + 명시 액션**: 자동(결산 마감)과 수동("과목배분 확정") 둘 다 동일 영구화 호출. 입력은 힌트만(최종 정합은 마감이 책임).

### 6.3 컴포넌트/모듈 구조(안)

```
lib/accounting/
  adjust-negative-income.ts     # (기존) Pass0
  fund-realloc.ts               # (기존) Pass1
  item-allocation.ts            # (신규) Pass2 — allocateIncomeToItems(rows)
  ledger-allocation.ts          # (신규) buildLedgerRows = Pass0→1→2 (순수, 영구화·표시 공유)
  item-allocation.test.ts       # (신규)
  ledger-allocation.test.ts     # (신규) Fund_Data_1 항등 + org9/11 검증
api/system/recompute-settlement (또는 신규 acc-book action)  # 영구화: bak 백업→buildLedgerRows→write (트랜잭션)
scripts/0NN_item_allocation_migration.sql 또는 일회성 노드 스크립트  # 기존 org 마이그레이션(dry-run·롤백)
app/dashboard/settlement/page.tsx     # 마감 시 영구화 호출 + (계정×과목) 미리보기
app/dashboard/income/page.tsx         # 과목 힌트(후보자, 비차단)
app/dashboard/income-expense-book/, reports/, lib/hwpx/income-ledger-builder.ts  # 영구화 org는 acc_book 직접, 미적용은 폴백
api/system/export-sqlite/route.ts     # stripAppOnlyAccBookColumns 확장(splitFrom 등)
```

> 영구화의 정확한 저장 위치(신규 RPC vs 기존 액션 확장), 분할 추적 컬럼 vs bak-only, evidence 링크 정책은 Design에서 확정.

### 6.4 핵심 알고리즘 — Pass2 (과목 배분)

각 자금원 내부에서 시간순(`compareAccDateTime`, 동시각 수입 먼저):
1. 과목별 가용 수입 풀 유지. 수입 행 → 원래 과목 풀에 적립.
2. 지출(과목 M) → 과목 M 풀에서 차감. **부족하면** 잉여 있는 다른 과목 풀에서 부족분만큼 수입을 끌어와 과목 M으로 재태깅(수입행 분할).
3. 남은 잉여 수입 → 원과목 유지.

**조합 보장**: Pass1로 자금원 현금 항상 ≥0 → 과목 전체 합에서 수입이 지출을 항상 덮음 → Pass2에서 끌어올 잉여가 항상 존재 → 모든 (계정×과목) 잔액 ≥ 0이며 충당분만큼 균형(= 공식 구조).

---

## 7. Convention Prerequisites

### 7.1 Existing Conventions

- 정렬 SSOT `compareAccDateTime`(acc_date→acc_time, 동시각 수입우선) 1차 키 필수.
- 환급/정정 합산 `acc_amt !== 0`(메모 [[negative-refund-rows-in-aggregation]]).
- 선거비용 판별 — 수입행 과목은 `getName(item_sec_cd)` 과목명 기준, 지출유형명(`detectItemCategory`)과 혼용 금지([[election-item-classification-ssot]]).
- export app-only 컬럼은 insert 전 strip(`stripAppOnlyAccBookColumns`, acc_time 선례).
- 마이그레이션 SQL은 Supabase SQL editor 수동 적용(서비스롤 REST로 DDL 불가).

### 7.2 To Define/Verify (Design 단계)

- 분할 수입행 저장 형태: 신규 ACC_BOOK 행 N개 + 추적 컬럼 vs bak-only 재생성.
- 영수증번호: 분할 시 원행 1건만 채번(중복 금지) 규칙.
- evidence_file: 분할 행 중 어느 행에 링크(원행/대표행).
- 영구화 엔드포인트: `recompute-settlement` 확장 vs `/api/acc-book` 신규 action vs RPC.
- 미리보기 위치(결산 화면 / 수입·지출부 출력 직전).

### 7.3 Environment Variables

- 없음(기존 Supabase 환경변수로 충분).

---

## 8. Next Steps

1. `/pdca design income-expense-item-allocation` — Pass2 입출력 타입, 분할 행 데이터모델·저장 스키마, 영구화 트랜잭션 흐름, 마이그레이션 절차(dry-run/롤백), 입력 힌트 UI, 테스트 케이스 명세.
2. 구현 순서: ① `item-allocation.ts`+`ledger-allocation.ts`(순수·테스트, Fund_Data_1/org9/org11 검증) → ② 영구화 액션(bak 백업·트랜잭션·멱등) → ③ 마감 트리거+미리보기 → ④ 일회성 마이그레이션 → ⑤ 입력 힌트 → ⑥ export/표시 정합.
3. `/pdca analyze income-expense-item-allocation` — Gap 분석.
4. 실데이터 QA: 오준석 .db 영구화 후 export → 윈도우 공식 프로그램 로드 → 4개 PDF(보조금/후보자산/금후원/금보조금외지원) 수치 대조.

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-06-19 | Claude | 최초 Plan. Fund_Data_1 vs 오준석 정밀분석(스키마 동일·수입 과목 태깅 불일치가 근본원인) 반영. 표시용 스펙→데이터 영구화로 방향전환(사용자 결정). 입력 힌트+마감 영구화+일회성 마이그레이션. |
