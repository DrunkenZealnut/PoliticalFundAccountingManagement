# 완료 보고서 — 수입지출보고서 페이지 SSOT 일원화 (V1)

> **Feature**: income-expense-report-ssot · **Date**: 2026-06-20 · **Phase**: ✅ Completed · **Match Rate**: 97%
> **PDCA**: [Plan] 감사 → [Design] 주의사항 문서·결정 → [Do] TDD → [Check] 적대적 갭분석 → [Report]

---

## 1. Executive Summary

### 1.1 개요

| 항목 | 내용 |
|---|---|
| 기능 | `dashboard/income-expense-report` 페이지(「정치자금 수입지출보고서」)를 정규 배분 SSOT로 일원화 |
| 발단 | "수입·지출부 생성 주의사항" 문서 기준 코드 감사에서 정규 배분을 우회하는 경로 3건(V1~V3) 발견 |
| 범위 | **V1만**(페이지). Rule2 재배분 토글 **제거**(사용자 결정) |
| 기간 | 2026-06-20 (단일 세션, Plan→Report) |

### 1.2 결과 지표

| 지표 | 값 |
|---|---|
| Match Rate | **97%** (Check, 적대적 검증) |
| SSOT 위반 잔존 | **0건** (하드코딩·exp_sec_cd·name.includes·Rule2) |
| 발견·수정 갭 | G3(보정배너 정합) 1건 발견 → 즉시 수정 |
| 테스트 | **775 passed** (신규 SSOT 6건 추가, 회귀 0) |
| 코드 변화 | 페이지 **−181줄**(56 ins / 237 del), 신규 SSOT 1파일 |
| 실데이터 검증 | org11(오준석) 73건 → 5개 (계정×과목) 전부 누계잔액 ≥ 0, 현금 132,500 보존 |

### 1.3 Value Delivered (4-perspective)

| 관점 | 내용 |
|---|---|
| **Problem** | 「수입지출보고서」 페이지가 자체 집계(과목 `86‖19` 하드코딩, 자금원 `name.includes` 병렬분류, 폐기된 Rule2 토글, buildLedgerRows 미통과)로 동작 → 같은 데이터로 공식 HWPX 22-1과 **자금원별 선거비용/외 수치 불일치** 가능. 비후보자+음수수입에선 보정 배너가 **거짓 약속**. |
| **Solution** | 신규 순수 SSOT `buildCandidateReportSummary`(=`adjustNegativeIncome` 보편 + 후보자 `buildLedgerRows` + `buildReportSummaryModel`)로 일원화. 페이지의 자체 집계·Rule2 토글 제거. `acc_amt`(NUMERIC→문자열) `Number()` 정규화로 문자열 연결 방어. |
| **Function/UX Effect** | 페이지 총괄이 HWPX 22-1과 **동일 로직** → 같은 데이터면 수치 일치. 화면이 공식 양식과 같은 자금원 4분류 고정행. 보정 배너가 집계와 정합(후보자·비후보자 모두). |
| **Core Value** | 제출 수치 일관성(여러 화면·서식 동일), 회귀 테스트로 고정, "선거비용=과목" SSOT 위반 0. 미래 동일 버그 재발 방지(주의사항 문서 §12에 V1~V3 기록). |

---

## 2. PDCA 사이클 요약

| 단계 | 한 일 | 산출물 |
|---|---|---|
| **Plan(발견)** | 주의사항 문서를 감사 기준으로, 완전성 스윕 에이전트 + 정밀 grep으로 정규 배분 우회 경로 탐색 | 감사 결과(대화), V1~V3 식별 |
| **Design** | "수입·지출부 생성 주의사항" 문서(불변식 I1~I4·분류 SSOT·라운드트립). 결정: V1만, Rule2 토글 제거 | `docs/05-reference/정치자금_수입지출부_생성_주의사항.md` |
| **Do** | TDD(RED→GREEN): `buildCandidateReportSummary` + 6 테스트, 페이지 재배선·토글 제거 | `income-expense-report-summary.ts`, `page.tsx` |
| **Check** | 적대적 검증 에이전트 + 직접 대조. G3(배너 정합) 발견 → TDD 수정. Match Rate 97% | `docs/03-analysis/income-expense-report-ssot.analysis.md` |
| **Report** | 본 문서 | `docs/04-report/income-expense-report-ssot.report.md` |

---

## 3. 구현 상세

### 3.1 신규 SSOT — `lib/accounting/income-expense-report-summary.ts`

`buildCandidateReportSummary(rawRows, getName): ReportSummaryModel`
- `acc_amt` 숫자화 → `adjustNegativeIncome`(Pass0, **보편**) → 후보자(자금원 82~85 존재)면 `buildLedgerRows`(Pass1·Pass2), 아니면 raw → `buildReportSummaryModel`.
- HWPX 22-1(`api/hwpx/accounting-report`)과 동일 로직 공유.
- 후보자 게이트는 `FUNDING_SOURCE_BY_ACC_SEC_CD`(SSOT) 재사용 → 새 상수 중복 없음.

### 3.2 페이지 — `dashboard/income-expense-report/page.tsx`

- 제거: 과목 `86‖19` 하드코딩, 자금원 `name.includes` 분류, Rule2 토글(state·UI·배너·`computeBalances` 호출).
- 화면/엑셀 모두 `model.rows`(자금원 4분류)·`model.total`로 통일. 보정 배너 유지.

### 3.3 테스트 (6건, `income-expense-report-summary.test.ts`)

보조금/보조금외 분리 · 선거비용 과목명 분류(cv 86·19) · Pass1 이동 시 과목 불변(I4) · 합 보존 · 비후보자 raw · **음수수입 보편 전환(배너 정합)**.

---

## 4. Check 결과 / 잔여 갭

| # | 항목 | 상태 |
|---|---|---|
| G1 | 잔존 위반 | **0건** ✅ |
| G2 | 22-1 동등성 | 파이프라인 동등 ✅ |
| G3 | 보정 배너 정합 | 발견 → **수정**(Pass0 보편) ✅ |
| G4 | acc_amt 문자열 | 페이지 안전(Number 정규화). ⚠️ route 비후보자 경로 잠재버그 |
| G5/G6 | 표시·행수 | 수치 동일·공식 양식 일치(의도) ℹ️ |
| G7 | 게이트 중복 | V3(연기) |

### Follow-up (V1 범위 외, 권장)
1. **route 공유**: `api/hwpx/accounting-report`가 `buildCandidateReportSummary`를 쓰면 22-1 동등성 **구조적 보장** + G4(acc_amt)·G7(게이트 중복) 동시 해소.
2. **V2** `data-query.ts`/`/api/excel/report`, **V3** 게이트 상수 통합 — 주의사항 문서 §12.

---

## 5. 실데이터 검증 (보너스)

같은 SSOT로 org11(2026 오준석) 라이브 73건의 (계정×과목) 수입·지출부를 생성 → 5개 조합 전부 누계잔액 ≥ 0, 현금 132,500 보존. 공식 13컬럼 .xlsx도 생성·역검증.
- `data/오준석_수입지출부_계정과목별_2026.md`, `data/오준석_정치자금수입지출부_계정과목별_2026.xlsx`

---

## 6. 산출물 색인

| 유형 | 경로 |
|---|---|
| 설계(주의사항) | `docs/05-reference/정치자금_수입지출부_생성_주의사항.md` |
| 분석(Check) | `docs/03-analysis/income-expense-report-ssot.analysis.md` |
| 보고(본 문서) | `docs/04-report/income-expense-report-ssot.report.md` |
| 코드 | `app/src/lib/accounting/income-expense-report-summary.ts` (+test), `app/src/app/dashboard/income-expense-report/page.tsx` |

*작성 2026-06-20. PDCA income-expense-report-ssot 완료(Match Rate 97%).*
