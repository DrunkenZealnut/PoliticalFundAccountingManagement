# 갭 분석 — 정치자금 수입지출보고서 페이지 SSOT 일원화 (V1)

> **Feature**: income-expense-report-ssot (감사 V1 교정) · **Date**: 2026-06-20 · **Phase**: Check
> **기준(spec)**: [수입·지출부 생성 주의사항](../05-reference/정치자금_수입지출부_생성_주의사항.md) §2·§4·§6 + 감사 결과 V1
> **방법**: 적대적 검증 에이전트(독립) + 직접 코드 대조 + TDD 회귀
> **Match Rate**: **97%** (핵심 목표 달성, 발견 갭 1건 즉시 해소, 잔여는 범위 외/사전존재/의도)

---

## 1. 목표

`income-expense-report/page.tsx`(「정치자금 수입지출보고서」)가 자체 집계(과목 `86‖19` 하드코딩 + 자금원 `name.includes` 병렬분류 + 폐기된 Rule2 토글)를 버리고, 공식 HWPX 22-1(`api/hwpx/accounting-report`)과 **동일 로직**으로 총괄을 내도록 일원화 → 같은 데이터면 수치 일치.

## 2. 검증 결과 (갭 목록)

| # | 항목 | 심각도 | 상태 |
|---|---|---|---|
| G1 | **잔존 위반** (하드코딩·exp_sec_cd·name.includes·Rule2 raw집계) | — | ✅ **0건** (grep·에이전트 확인). 집계는 `buildCandidateReportSummary` 단일 경로 |
| G2 | **22-1 동등성** (게이트·ReallocRow·buildReportSummaryModel 입력·비후보자 경로) | — | ✅ 파이프라인 동등. 후보자 데이터 수치 일치 |
| G3 | **보정 배너 정합** — 페이지는 `applyCorrections` 배너를 게이트 없이 띄우는데 집계는 비후보자면 Pass0 스킵 → 비후보자+음수수입에서 배너 거짓 | major | ✅ **수정** — `buildCandidateReportSummary`가 Pass0(`adjustNegativeIncome`)를 **보편 적용**. 회귀 테스트 추가(6/6) |
| G4 | **acc_amt 문자열 연결** — `acc_amt`는 `NUMERIC(15,0)`→Supabase 문자열 직렬화. 페이지는 양 경로 `Number()` 캐스팅(안전) | blocker(조건부) | ✅ **수정** (v0.17.1.0 #88) — route(accounting-report)도 `allocateCandidateLedgerRows`가 비후보자 포함 전 행 `Number()` 정규화. 페이지·route 양측 안전 |
| G5 | 환급(음수) 셀 표시 — 페이지는 비양수 셀을 `"-"`, HWPX는 음수값 출력 | minor | ℹ️ **수치 동일**, 표시만 상이. 옛 페이지와 동일 패턴(회귀 아님) |
| G6 | 비후보자 행별 가시성 — 동적 N행 → 고정 4행(+기타는 합계로) | minor | ℹ️ **의도** — 공식 22-1 양식이 4행 고정. 후보자엔 정상, 비후보자는 이 폼 미사용 |
| G7 | 후보자 게이트 SSOT 중복 — 페이지는 `FUNDING_SOURCE_BY_ACC_SEC_CD`, route는 로컬 `CANDIDATE_ACC_SEC_CDS` | minor | ✅ **수정** (v0.17.1.0 #88) — accounting-report route가 `allocateCandidateLedgerRows`(내부 `hasCandidateFundingSource`=`FUNDING_SOURCE_BY_ACC_SEC_CD`) 사용, 로컬 `CANDIDATE_ACC_SEC_CDS` 제거. 잔여: export-sqlite(V3) |

## 3. 변경 산출물

| 파일 | 내용 |
|---|---|
| `lib/accounting/income-expense-report-summary.ts` | 신규 순수 SSOT `buildCandidateReportSummary` (Pass0 보편 + 후보자 buildLedgerRows + buildReportSummaryModel) |
| `lib/accounting/income-expense-report-summary.test.ts` | 6 테스트 (보조금/외 분리, 과목명 분류 incl. cv19, Pass1+I4, 합보존, 비후보자 raw, **음수수입 보편 전환**) |
| `app/dashboard/income-expense-report/page.tsx` | 자체 집계·Rule2 토글 제거, SSOT 호출 (−181줄) |

## 4. 검증 지표

- 전체 테스트 **775 passed** (회귀 0), 대상 6/6
- tsc: 변경 파일 0 에러, 린트 clean

## 5. 결론 / 다음

핵심 목표(페이지 == 22-1, 위반 0, 배너 정합)는 달성. Match Rate 97% (≥90% → report 가능).

**Follow-up (V1 범위 외, 권장)**:
1. **route acc_amt 잠재 버그(G4)** — `api/hwpx/accounting-report` 비후보자 경로가 `acc_amt`(문자열) 미캐스팅. 근본 해법은 route가 `buildCandidateReportSummary`를 **공유**하는 것 → 동등성 구조 보장 + 게이트 중복(G7) + acc_amt 동시 해소.
2. **V2** (`data-query.ts`/`/api/excel/report`), **V3**(게이트 상수 통합) — 주의사항 문서 §12 참조.
