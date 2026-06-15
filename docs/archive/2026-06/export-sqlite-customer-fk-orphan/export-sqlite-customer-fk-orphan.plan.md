# Plan: 자료백업(.db) 거래처 FK 고아로 인한 수입·지출 누락 수정 (export-sqlite-customer-fk-orphan)

> 유형: 버그 수정 (선관위 PFund2 .db export 참조무결성) · 버전 목표: v0.14.3.0
> 작성일: 2026-06-15
> 근거: 공식 `Fund_Data_1(송파).db` 대조 + 우리 export 실생성·실측

## Executive Summary

| 관점 | 내용 |
|------|------|
| **Problem (문제)** | 우리 앱에서 자료백업으로 만든 `.db`를 **윈도우 선관위 회계프로그램(PFund2)** 에 불러오면 「정치자금 수입·지출부」의 **계정에 따라 수입(및 지출)이 0으로 누락**된다. 공식 프로그램이 만든 `.db`(송파)는 누락이 없다. |
| **Solution (해결)** | `data1`/`data2` export 모드가 CUSTOMER를 `org_id` 기준으로 필터해, **거래가 참조하는 거래처 중 org_id=NULL(공유)·타 org 거래처가 빠져 FK 고아 행**이 된다. 윈도우 프로그램이 수입지출부에서 거래처(수입제공자/지출받은자)를 join할 때 이 고아 행을 드롭한다. → export 시 **실제 거래(ACC_BOOK/ACC_BOOK_BAK)가 참조하는 모든 거래처를 포함**하도록 선정 기준을 바꿔 참조무결성을 보장한다. |
| **Function UX Effect (기능·UX 효과)** | 백업 .db를 선관위 프로그램에 올렸을 때 계정별 수입·지출이 모두 정상 표시된다. (현재 data1 모드에서 후보자등자산 수입 14,602,392원·지출 41건 등이 사라지던 문제 해소.) |
| **Core Value (핵심 가치)** | 선관위 제출용 백업 파일의 **데이터 무결성·신뢰성** 확보 — 회계 수치가 공식 프로그램에서 우리 화면과 일치. |

## 1. 증상 (사용자 보고)

- "정치자금수입지출부 작성 시 계정에 따라 수입이 누락된다. (공식) 윈도우 회계프로그램에서는 누락되지 않는데 우리 프로그램에서는 누락된다."
- 보강: "이 프로젝트에서 생성한 db파일을 **윈도우의 회계프로그램에서 불러와도** 정치자금수입지출부의 계정에 따른 내역에 수입이 0으로 나온다."
- 즉 우리 **앱 내부 생성기**(화면/엑셀/HWPX)가 아니라, **export한 .db를 공식 프로그램이 읽을 때** 발생.

## 2. 조사 결과 (구조 분석 + 실측)

### 2.1 데이터 구조는 공식과 정렬돼 있음 (오해 해소)
공식 `Fund_Data_1(송파).db`와 우리 Supabase 모두, 후보자(org_sec_cd=90) 수입(incm=1)·지출(incm=2)을 동일하게 **acc_sec_cd=자금원(84/85/82/83) × item_sec_cd=과목(86 선거비용/87 선거비용외정치자금)** 으로 코딩한다. 수입 행 인코딩(`EXP_SEC_CD=0/-1, EXP_TYPE_CD=-1, ACC_INS_TYPE=''`)도 공식과 동일. CODESET/CODEVALUE/ACC_REL(후보자 수입 8조합·지출 8조합)도 일치. → **수입지출부 자체 데이터·앱 내부 생성기는 정상**(income-ledger-builder·income-expense-book 페이지·22-4 HWPX·reports 등 점검 완료).

### 2.2 진짜 원인: export `.db`의 거래처 FK 고아 (data1/data2 모드)
`app/src/app/api/system/export-sqlite/route.ts:697-701`
```ts
const remappedCustomer = remapOrgId(customer, orgIdMap);
const exportCustomer =
  targetExportOrgId === null
    ? remappedCustomer
    : remappedCustomer.filter((c) => Number(c.org_id) === targetExportOrgId); // ← 문제
```
- `data1`(후보자)/`data2`(후원회) 모드는 CUSTOMER를 **org_id 일치**로만 필터한다.
- 그러나 ACC_BOOK의 `cust_id`는 org 경계와 무관하게 다음을 참조한다:
  - **org_id=NULL 거래처**(예: 양지기획·한전·문자파티 등 — 공유/스코프 누락분)
  - **타 org 거래처**(예: cust_id=42 "오준석" = org_id=9 소속을 org11이 참조)
- 이들이 CUSTOMER에서 빠지면 ACC_BOOK은 `ACC_BOOK_FK3 REFERENCES CUSTOMER`를 만족하지 못하는 **고아 행**이 된다. (sql.js는 FK 미강제라 export는 성공하나, 윈도우 프로그램이 수입지출부에서 거래처 join 시 고아 행을 누락.)

### 2.3 실측 (export 직접 생성 후 검증)
| 모드 | org11 수입 고아 | org11 지출 고아 | org9 수입 고아 |
|------|----------------|----------------|----------------|
| **data1** | 5건 / 14,602,392원 | 41건 / 21,196,389원 | 1건 |
| full | 0 | 0 | 0 |

- org11이 참조하는 거래처 org_id 분포: **NULL 13개 + org_id=9 1개** + org_id=11 15개.
- data1 export에서 **후보자등자산(84) 수입**: 거래처있음 7,500,187원 + **고아 14,602,392원(cust_id=42)** → 이 계정 수입만 누락. 후원회기부금(85)·보조금외(83)는 거래처가 살아 정상 → **"계정에 따라" 누락**의 정확한 정체.
- **full 모드는 고아 0** (org 필터 없이 전 거래처 export) → 모드별 차이가 결정적 증거.

## 3. 수정 방향

### 3.1 (주) export 참조무결성 — CUSTOMER 선정 기준 변경
org_id 필터 대신 **export 대상 거래(ACC_BOOK + ACC_BOOK_BAK)가 실제 참조하는 cust_id 집합**으로 CUSTOMER를 선정한다. (full 모드는 현행대로 전체.)
- `data1`/`data2`: `referencedCustIds = ∪ finalAccBook.cust_id ∪ finalAccBookBak.cust_id` → `exportCustomer = remappedCustomer.filter(c => referencedCustIds.has(c.cust_id))`.
- 표준 익명 거래처(`CUST_ID=-999`)는 `PFUND2_ENSURE_ANONYMOUS_CUSTOMER_SQL`로 계속 보장.
- `CUSTOMER_ADDR`·`exportCustIds`도 동일 집합 기준으로 정렬.
- 순서 주의: 참조 cust_id 집합은 `finalAccBook` 계산(현 740행) 결과가 필요하므로, **acc_book 필터·remap을 CUSTOMER insert보다 앞으로 이동**하거나 cust_id 집합만 선계산한다.
- 효과: org_id=NULL·타org 참조 거래처가 모두 포함 → 고아 0 → 윈도우 프로그램이 전 수입·지출 표시.

### 3.2 (부) 데이터 위생 점검 — customer.org_id 정합 (선택, 후속)
org11 참조 거래처 중 **org_id=NULL 13개**는 scripts/011 org 격리 이전/우회 경로로 스코프가 비어 있다. 다만 동일 거래처가 **복수 org에서 공유**될 수 있어 일괄 backfill은 위험. → export 수정(3.1)으로 증상은 완전 해소되므로, 데이터 backfill은 별도 audit 후 신중히(우선순위 낮음). 본 작업 범위에서는 **export 수정만 필수**.

## 4. 영향 범위
- `app/src/app/api/system/export-sqlite/route.ts` (CUSTOMER/CUSTOMER_ADDR 선정 — data1/data2 모드)
- 스키마 변경 없음. full/master 모드 동작 불변.
- 회귀 위험: data1/data2 CUSTOMER 행수 증가(참조분 포함) — 의도된 변화.

## 5. 검증 기준 (Acceptance)
1. org11/org9 `data1` export 재생성 시 **ACC_BOOK FK 고아 0건**(수입·지출 모두).
2. data1 export의 **계정별 수입 합계 == 앱 화면/Supabase 합계**(후보자등자산 수입 누락 복구).
3. full/master 모드 출력 불변(회귀 없음).
4. 익명 거래처(-999) 정상 보장, CUSTOMER_ADDR 참조 무결.
5. 단위 테스트(참조 cust_id 선정) + lint 0 + build 성공. (`node node_modules/vitest/vitest.mjs run`)

## 6. 메모
- 동일 고아가 **지출 41건**에도 있으므로 본 수정은 수입뿐 아니라 지출 누락도 함께 복구한다.
- 과거 export 지출누락 버그(ACC_INS_TYPE CHAR(2)→EXP_TYPE_CD)와 **같은 "앱↔공식 포맷 정합" 클래스**의 신규 원인(거래처 FK 고아).
