# 보고서(과목별 수입·지출부) 영수증번호 재배분 정합 (reports-receipt-no-realloc-parity) Planning Document

> **Summary**: 「보고서 및 과목별 수입·지출부 출력」메뉴(`dashboard/reports`)가 만든 Excel을 감사한 결과, **수입·지출 배분(Pass0→1→2)은 정확**(모든 (자금원×과목) 시트 누계·잔액 ≥0, 총괄표 검산 일치)하나 **영수증 일련번호가 깨져** 있다. 후보자 보고서는 `allocateReportRecords`(=`buildLedgerRows`)로 지출을 여러 자금원으로 분할/이동하는데, `reports/page.tsx`가 **이동·분할 조각마다 원본 `rcp_no`를 그대로 출력**(`page.tsx:168` 원본 spread → `:676` 그대로 렌더)하고 **`fillExportReceiptNumbers`(이동조각 재홈잉+중복제거 SSOT)를 호출하지 않는다**. 결과: ① 한 영수증번호(예 `후(비)-10`)가 **3개 자금원 시트에 중복** 등장, ② 접두사가 시트의 자금원과 **불일치**(보조금외 시트에 `후(비)`/`외(비)`). 같은 SSOT를 쓰는 **income-expense-book 뷰어(`:118`)·export-sqlite는 이미 올바른데 reports만 누락**된 전형적 **화면/export parity 분기 버그**. 해법: reports의 분할 후 레코드에 `fillExportSortNumbers`→`fillExportReceiptNumbers`를 적용해 Excel·.db·뷰어가 **같은 영수증번호**를 갖게 한다.
>
> **Project**: PoliticalFundAccountingManagement
> **Version**: 0.20.x → (feature) 0.21.0.0 예정
> **Author**: Claude · **Date**: 2026-06-23 · **Status**: Draft (감사 발의)
> **Audit Input**: `보고서_2026 오준석후보_2026-02-19_2026-06-23 (3).xlsx` (24시트, 후보자, reports 산출물)
> **Related**: 채번 SSOT `lib/accounting/receipt-no.ts`(`fillExportReceiptNumbers`/`assignReceiptNumbers`/`formatKey`/`parseRcpNo`). 정렬 SSOT `lib/accounting/acc-book-sort.ts`(`fillExportSortNumbers`/`compareAccDateTime`). 배분 SSOT `lib/accounting/ledger-allocation.ts`(`buildLedgerRows` Pass0→1→2). 동일 패턴 선례 [[adjusted-ledger-viewer]](v0.19, 뷰어에 채번 적용). 메모 [[parity-test-must-exercise-divergence-condition]] · [[income-expense-book-funding-realloc]] · [[official-fund-data-income-classification]].

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 사용자가 선관위 제출용으로 출력·인쇄하는 **과목별 수입·지출부 Excel**의 영수증 일련번호가 틀렸다. 후보자 보고서는 지출을 여러 자금원으로 분할·이동(재배분)하는데, 그 조각들이 **원본 영수증번호를 그대로 물려받아** 같은 번호(예 `후(비)-10`)가 서로 다른 자금원 시트에 **중복** 출력되고, 접두사도 시트의 자금원과 **불일치**(보조금외 시트에 `후(비)`)한다. 같은 데이터의 SQLite 백업(.db→윈도우 프로그램)·재조정 뷰어는 올바른 번호라 **산출물끼리 서로 다르다**. |
| **Solution** | reports 경로에 export-sqlite·뷰어와 **동일한 SSOT**(`fillExportSortNumbers`→`fillExportReceiptNumbers`)를 적용해, 분할/이동 조각을 **이동 후 자금원 접두사로 재채번하고 중복을 제거**한다. 원본 acc_book은 불변(계산만). 결과적으로 Excel·HWPX·SQLite·뷰어의 영수증번호가 100% 일치. |
| **Function/UX Effect** | 제출용 수입·지출부 Excel의 영수증 일련번호가 **각 자금원 시트별로 고유·연속·접두사 정합**이 되어, 선관위 심사에서 "중복 일련번호/접두사 불일치"로 반려될 위험이 사라진다. 사용자가 어느 산출물을 봐도 같은 번호. |
| **Core Value** | 단일 채번 SSOT를 **모든 산출 경로에 강제** — "화면/Excel/HWPX/.db가 같은 번호"라는 불변식을 reports까지 확장해 제출물 신뢰성을 확보. |

---

## 1. Overview

### 1.1 감사 결과 — 정상 동작 (유지)

대상: 후보자 `2026 오준석후보`, 기간 2026-02-19~06-23, reports 산출 Excel(24시트 = 총괄표 + 재산명세 + 4자금원×2과목 수입·지출부 8장 + 표지류).

- **수입·지출 배분(Pass0→1→2) 정확**:
  - 모든 거래 시트의 **누계·잔액 검산 일치**, **잔액 항상 ≥ 0**(재배분이 자금원별 음수잔액을 정상 방지).
  - **총괄표 검산 일치**: 수입 합계 34,532,579 = 지출 소계 34,400,079 + 잔액 132,500. 자금원별 합도 일치(후보자등자산 22,102,579 균형, 후원회기부금 9,430,000 수입 中 132,500 잉여, 보조금외 3,000,000 균형, 보조금 0).
  - **수입 과목 재분류(Pass2) 동작**: 후원회기부금 수입 9,430,000이 선거비용(4,422,515)·선거비용외(5,007,485) 과목 시트로 분배.
  - **환급(음수 지출) 정상 반영**: 후원회기부금 선거비용 시트 `문자환급 -108,583`이 지출 누계에 차감 반영(잔액 132,500).
  - 거래 0 자금원(보조금)도 빈 양식 시트 정상 출력.
- 결론: **"수입과 지출 배분" 기능은 합격.**

### 1.2 감사 결과 — 결함 (영수증 일괄배정)

reports Excel의 **영수증 일련번호(M열)가 재배분 결과와 어긋남**. 증거(실제 출력값):

| 영수증번호 | 등장 시트 (자금원) | 금액 | 비고 |
|-----------|------------------|------|------|
| `후(비)-10` | 후보자등자산 / 후원회기부금 / **보조금외지원금** | 58 / 186,040 / 78,902 | **3개 시트 중복** (원 인형탈대여 265,000 분할), 접두사 `후`가 자산·보조금외 시트와 불일치 |
| `외(비)-1` | 후보자등자산 / **보조금외지원금** | 78,902 / 2,921,098 | **2개 시트 중복** (원 공식공보물 3,000,000 분할), 접두사 `외`가 시트 자금원과 불일치 |
| `자(비)-14` | 후보자등자산 / 후원회기부금 | 236,200 / 663,800 | **2개 시트 중복** (로고송제작비용 분할) |
| `자(비)-4` | 후보자등자산 / 후원회기부금 | 701,422 / 61,648 | **2개 시트 중복** (선거사무원수당 김수현 분할) |
| `자(비)-2` | 후원회기부금 선거비용 시트 | 8,870 | 접두사 `자`가 후원회 시트와 불일치(이동 조각) |

즉 ① **동일 영수증번호가 복수 자금원 시트에 중복**, ② **접두사가 시트의 자금원(계정)과 불일치**.

### 1.3 근본 원인 (코드)

- `reports/page.tsx` `allocateReportRecords`(`:151~170`): `buildLedgerRows`(Pass0→1→2)로 지출을 자금원·과목별로 분할/이동. 그러나 `:168`에서 각 조각을 **원본 레코드 `o`를 spread**(`{ ...o, acc_sec_cd: lr.accSecCd, ... }`)해 반환 → **모든 조각이 원본 `o.rcp_no`를 동일하게 물려받음**(`:161`의 `rcp_no:null`은 realloc 입력일 뿐 무의미).
- `buildLedgerSheet`(`:676`): `row.getCell(13).value = r.rcp_no || ""` — **물려받은 원본 번호를 그대로 출력**.
- **`fillExportReceiptNumbers` 미호출**: reports/page.tsx 어디에도 채번 SSOT 호출 없음(grep 확인). 반면
  - `dashboard/income-expense-book/page.tsx:118` → `fillExportReceiptNumbers(adjusted, codeNames)` 호출 ✅
  - `api/system/export-sqlite/route.ts:768~780` → `fillExportSortNumbers` 후 `fillExportReceiptNumbers` 호출 ✅
- → **reports만 채번 SSOT에서 누락된 "세 번째 소비처"**. v0.19([[adjusted-ledger-viewer]]) 채번 롤아웃 시 뷰어·export는 포함됐으나 reports 출력 경로가 빠짐.

`fillExportReceiptNumbers`는 정확히 이 문제를 해결하도록 설계됨(`receipt-no.ts:171~176`): `rcp_yn='Y'` ∧ (rcp_no 없음 ∨ **접두사가 현재 계정과 불일치(Pass1 재배분 이동조각이 stale)**)인 행을 **현재 (계정×과목) 접두사로 재채번**, 접두사 일치하는 수기 번호는 보존, 수입+지출 통합 단일 스코프로 중복 제거.

### 1.4 영향 범위
- **후보자 org 보고서 한정**(`:866~867` `orgType==="candidate"`일 때만 재배분 → stale 발생). 후원회/정당 등 비후보자는 재배분 없음 → 현재도 정상.
- 제출 산출물(인쇄 Excel)이 영향 대상 → **컴플라이언스/반려 리스크 = High**.

---

## 2. Scope

### 2.1 In Scope
- [ ] **reports 분할 레코드에 채번 SSOT 적용**: `allocateReportRecords` 결과(후보자) 전체에 `fillExportSortNumbers` → `fillExportReceiptNumbers`(통합 스코프, codeNames 주입)를 **시트 분할 전 1회** 적용. 이후 `buildLedgerSheet`는 재채번된 `rcp_no` 렌더.
- [ ] **원본 불변**: DB write 0 — 출력 시점 결정적 계산만(원본 `rcp_no`는 시드로 보존).
- [ ] **비후보자 무변경 보장**: 재배분 미적용 경로는 기존 동작 유지.
- [ ] **parity 회귀 테스트**: 동일 입력에 대해 **reports 영수증번호 == export-sqlite == income-expense-book 뷰어** 임을 검증하는 테스트. **재배분으로 분할/이동이 실제 발생하는 픽스처**로 작성([[parity-test-must-exercise-divergence-condition]] — 해피패스 금지).
  - 불변식: (a) 각 (자금원×과목) 시트 내 영수증번호 **시트 단위 고유**, (b) 접두사 == 시트 자금원 약자, (c) 전체 산출물 간 동일 acc 조각의 번호 일치.

### 2.2 Out of Scope
- **배분(Pass0→1→2) 로직 변경** — 감사 결과 정상, 불변.
- **원본 acc_book에 재채번 번호 persist** — (계산만) 유지([[adjusted-ledger-viewer]]의 가안과 동일).
- **재산명세서·총괄표 등 다른 시트** — 영수증번호 무관, 변경 없음.
- **채번 알고리즘(`receipt-no.ts`) 자체 수정** — 호출 누락 문제이지 SSOT 결함 아님.

### 2.3 결정 필요 (Design)
1. **채번 적용 위치**: `allocateReportRecords` 내부에서 바로 채번할지, vs `generateReports` 오케스트레이터에서 분할 직후 별도 단계로 채번할지. (권장: 오케스트레이터 단계 — `allocateReportRecords`는 순수 배분 유지, 채번은 명시적 후처리. export-sqlite 파이프라인과 동형.)
2. **공통 헬퍼 추출 여부**: export-sqlite·뷰어·reports가 `fillExportSortNumbers→fillExportReceiptNumbers`를 각자 호출 중 → 3자 공통 "재조정+채번" 헬퍼로 묶어 재발 방지할지(리팩터 범위 판단).
3. **acc_sort_num 준비**: reports 레코드의 `acc_sort_num` 존재 여부 확인(없으면 `fillExportSortNumbers`가 채움 — 의존 순서 확정).

---

## 3. Requirements

### 3.1 Functional Requirements
| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | 후보자 reports 출력 시 분할/이동 영수증 조각이 **이동 후 자금원 접두사로 재채번**된다(`fillExportReceiptNumbers`) | High | Pending |
| FR-02 | 한 (자금원×과목) 시트 내 영수증 일련번호가 **고유**(중복 0), 접두사가 시트 자금원과 정합 | High | Pending |
| FR-03 | reports 영수증번호 == export-sqlite(.db) == income-expense-book 뷰어 (동일 SSOT, 동일 결과) | High | Pending |
| FR-04 | 접두사 일치하는 기존 수기 번호는 **보존**(소급 재채번 금지) | Medium | Pending |
| FR-05 | 비후보자 보고서·원본 acc_book은 무변경(DB write 0) | High | Pending |

### 3.2 Non-Functional Requirements
- **결정성**: 동일 입력 → 동일 번호(정렬 SSOT 2차 키 `acc_sort_num`→`incm_sec_cd`(수입 먼저)→`acc_book_id` 고정).
- **성능**: 클라이언트 측 채번은 O(n log n) 1회 — 수천 행 규모에서 무시 가능.
- **회귀 안전**: 기존 reports 스냅샷(비후보자/단일자금원) 무변경.

---

## 4. Design Sketch (구현 방향)

```
generateReports(records, orgType=candidate)
  reportRecords = allocateReportRecords(records)        // 배분(현행, 순수)
  ───[추가]───────────────────────────────────────────
  sorted   = fillExportSortNumbers(reportRecords)        // acc_sort_num 부여(수입 먼저)
  numbered = fillExportReceiptNumbers(sorted, codeNames) // 이동조각 재홈잉+중복제거
  ────────────────────────────────────────────────────
  → buildSummarySheet / buildLedgerSheet(numbered ...)   // 재채번된 rcp_no 렌더
```

- `codeNames`: reports가 이미 보유한 `getName` 기반 `{acc, item}` 맵 재사용(export-sqlite의 `exportCodeNames`와 동형).
- `buildLedgerSheet`의 `r.rcp_no`는 자동으로 재채번 값이 됨(`:676` 무변경).
- 영수증 **첨부분/생략분 집계**(`:642~661`, `:713~`)는 번호가 아닌 `rcp_yn`·금액 기반이라 영향 없음(검증만).

---

## 5. Risks & Mitigations
| Risk | Mitigation |
|------|-----------|
| 채번이 첨부/생략 집계나 합계 행을 흔들 수 있음 | 집계는 `rcp_yn`/금액 기반 — 번호와 독립. 회귀 테스트로 합계 불변 확인 |
| `acc_sort_num` 미존재 시 정렬 불안정 | `fillExportReceiptNumbers` **전에** `fillExportSortNumbers` 필수(파이프라인 순서 고정, export와 동일) |
| `formatKey` 시간 불변 가정 위반 시 stale 오판([[acc-time-deprecated-not-in-prod]] 참고) | 스킴/약자 매핑 변경 없음(이번 작업은 호출 추가만) |
| 3자(뷰어/export/reports) 또 어긋남 | 공통 헬퍼 추출 검토(2.3-2) + parity 테스트로 3자 동시 고정 |

---

## 6. Verification Plan
1. **단위/통합 테스트**: 분할·이동이 실제 발생하는 후보자 픽스처로 `fillExportReceiptNumbers` 적용 전/후 reports 레코드의 (a) 시트별 중복 0, (b) 접두사 정합, (c) export-sqlite 결과와 동일 검증.
2. **수동 재검증**: 본 감사 파일과 동일 데이터로 reports 재출력 → `후(비)-10`·`외(비)-1`·`자(비)-14`·`자(비)-4` 중복이 자금원별 고유 번호로 분리되는지 확인.
3. **회귀**: 비후보자/단일 자금원 org의 reports 출력 무변경.

---

## 7. Next
- `/pdca design reports-receipt-no-realloc-parity` — 채번 적용 위치(2.3-1)·공통 헬퍼(2.3-2) 결정 후 설계 확정.
- 또는 범위가 단순(호출 추가 + 테스트)하므로 design 생략하고 곧장 구현 후 `/pdca analyze` 고려 가능.
