# 영수증 일괄생성 수입 "생략" 표기 완료 보고서

> **기능**: `income-receipt-no-omitted`  
> **완료일**: 2026-06-26  
> **소유자**: Zealnut Kim  
> **최종 상태**: ✅ 완료 (Match Rate 100%, 0회 반복)

---

## Executive Summary

### 1.1 프로젝트 개요

| 항목 | 내용 |
|------|------|
| **기능명** | 영수증 일괄생성에서 수입은 "생략"으로 표기 |
| **기간** | 2026-06-26 (단일 세션 — Plan/Design 없이 사용자 요청 → Do → Check → Act) |
| **소요시간** | ~3시간 (분석·구현·검증·정리) |
| **변경 파일** | 15개 (소스 10 + 테스트 5) |

### 1.2 결과 요약

| 지표 | 값 |
|------|-----|
| **최종 Match Rate** | 100% (gap-detector 1차 88% → 2개 Gap 해소) |
| **테스트** | 826 passed (70 files) |
| **Lint** | Clean (ESLint v9) |
| **코드 변경** | +146 / -76 lines |
| **반복 횟수** | 0회 (Check 단계에서 직접 완전 해소) |

### 1.3 Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | 수입에도 영수증 일련번호가 부여돼 공식 양식(수입=영수증 생략)과 불일치. 윈도우 프로그램·인쇄 수입·지출부와 표기가 어긋남 |
| **Solution** | 영수증 채번 SSOT(`fillExportReceiptNumbers`)에서 수입 채번 제외·기존 번호 비움 + 6개 렌더 경로에서 수입 영수증칸을 "생략"으로 일관 표기 + 입력 차단(batch_receipt/수입 페이지 버튼) |
| **Function/UX 효과** | 수입·지출부 어디서나 수입은 "생략", 지출만 실제 번호(자(비)-N 등) 표시 — 공식 양식·.db ground truth와 1:1 정합. 선관위 2개 표본(Fund_Data_1.db + 인쇄 PDF)과 일치 검증 완료 |
| **Core Value** | 선관위 제출물 정합성 확보(수입 RCP_NO 빈값=.db, 인쇄물 "생략") + 채번 로직 단순화(지출 전용 스코프) + 잘못된 수입 번호 생성 경로 완전 제거 |

---

## PDCA Cycle 요약

### Plan (생략)
- **사유**: 사용자 요청이 명확 + 공식 선관위 ground truth 2개(Fund_Data_1.db, 인쇄 PDF) 기준 요구사항 직접 도출 → Plan 문서 불필요
- **수용기준**: gap-detector가 공식 양식 기준 AC-1~8 자동 추출

### Do (구현)
- **기간**: 2026-06-26 (단일 세션)
- **구현 범위**:
  1. **SSOT 강화** `lib/accounting/receipt-no.ts`
     - `RECEIPT_OMITTED_LABEL="생략"` 상수 추가
     - `displayReceiptNo(incmSecCd, rcpNo)` 순수 헬퍼 추가 (income → "생략" 결정)
     - `fillExportReceiptNumbers`: 수입(incm_sec_cd=1) 채번/보존 제외 + 기존 번호 비움(`rcp_no="", rcp_no2=0`)
  
  2. **표시 6경로** 수입에 "생략" 또는 데이터 빈값:
     - `app/dashboard/income-expense-book/page.tsx` — 수입·지출부 뷰어 (AC-1)
     - `app/lib/excel-template/income-expense-book.ts` — reports 과목별 수입지출부 Excel (AC-2)
     - `app/lib/hwpx/income-ledger-builder.ts` — HWPX 회계장부/서식22-4 (AC-3)
     - `app/src/api/excel/export/route.ts` — 개별 수입부 Excel (AC-4, rcp_yn 무관)
     - `app/src/dashboard/reports/page.tsx:649` — 과목별 수입지출부 인라인 루프 수정 (Gap G-1)
     - `app/src/dashboard/submit/page.tsx:237` — 제출 TSV 수입칸 데이터 정규화 (Gap G-2)
  
  3. **입력 차단**:
     - `app/src/api/acc-book/route.ts` — batch_receipt 수입 no-op
     - `app/src/dashboard/income/page.tsx` — 「영수증일괄입력」 버튼 제거
     - `app/src/lib/help-texts.ts` — 고아 항목 정리
  
  4. **테스트 5종** (+5 테스트 파일):
     - `receipt-no.test.ts` — TC-3/TC-9/TC-12 (수입 채번 제외, 지출 무변, 번호 비움)
     - `displayReceiptNo` 단위 테스트
     - `adjusted-ledger.test.ts` — reallocation 수입 영수증 미부여
     - `adjusted-ledger-parity.test.ts` — 뷰어==export 일관성
     - `income-expense-book.test.ts(T-16)`, `income-ledger-builder.test.ts`

### Check (갭 분석)
- **gap-detector 독립 검증** (2026-06-26)
- **1차 결과**: 88% (8개 AC 중 6개 완전 + 2개 Gap 발견)
  
  **발견한 Gap**:
  | # | 심각도 | 위치 | 내용 | 조치 |
  |---|:------:|------|------|------|
  | G-1 | P1 | `reports/page.tsx:649` | 과목별 수입지출부 Excel이 공유 빌더 미사용·인라인 루프 → 수입칸 빈칸(생략 미표기) | 즉시 수정: `isIncome ? RECEIPT_OMITTED_LABEL : (rcp_no\|\|"")` |
  | G-2 | P2 | `submit/page.tsx:237` | 제출 TSV raw records 수입 stale 번호 누출 | 즉시 정규화: 수입은 항상 빈값 |

- **2차 재검증** (Gap 2건 해소 후)
  - **최종 Match Rate: 100%** (P0=0, P1=0, P2=0)
  - 정확성 검증 완료 (TC-12, TC-3/9, splitOfficialReceiptNo)

### Act (정리·최적화)
- **코드 정리**:
  - `displayReceiptNo` 헬퍼 추출 → 렌더 3개 사이트 중복 제거 (||/?? 드리프트 제거)
  - export route 하드코딩 "생략" → `RECEIPT_OMITTED_LABEL` 상수로 통일
  - `fillExportReceiptNumbers` 불필요 `incomeIds` Set 제거 (map 인라인 판정)
  - tombstone/재진술 주석 제거
- **테스트 강화**: `displayReceiptNo` 단위 테스트 추가 + 회귀 고정 5종

---

## 완료 항목

### 핵심 기능
- ✅ SSOT 강화: `receipt-no.ts` 수입 채번 제외 + `RECEIPT_OMITTED_LABEL` 정의
- ✅ 표시 6경로: 수입·지출부 뷰어, 과목별 수입지출부 Excel(2경로), HWPX 회계장부/22-4, 개별 수입부 Excel, 제출 TSV
- ✅ 입력 차단: batch_receipt 수입 no-op + 수입 페이지 버튼 제거
- ✅ .db export: `splitOfficialReceiptNo` 수입 RCP_NO 빈값/RCP_NO2=0 → ground truth 정합

### 검증
- ✅ ground truth 정합 (Fund_Data_1.db, 인쇄 PDF)
- ✅ gap-detector 독립 검증: 최종 100% Match Rate
- ✅ 전체 테스트 826 passed, ESLint clean
- ✅ 회귀 고정: receipt-no·adjusted-ledger·parity·income-expense-book 테스트

### 정리·최적화
- ✅ 코드 정리: 상수화, 헬퍼 추출, 중복 제거, 주석 정리
- ✅ 테스트 강화: displayReceiptNo 단위 테스트

---

## 변경 파일 목록

### 소스 (10)
1. `app/src/lib/accounting/receipt-no.ts` — SSOT 강화 (RECEIPT_OMITTED_LABEL, displayReceiptNo, fillExportReceiptNumbers)
2. `app/src/dashboard/income-expense-book/page.tsx` — 수입·지출부 뷰어 표시
3. `app/src/lib/excel-template/income-expense-book.ts` — 과목별 수입지출부 Excel
4. `app/src/lib/hwpx/income-ledger-builder.ts` — HWPX 회계장부/22-4
5. `app/src/api/excel/export/route.ts` — 개별 수입부 Excel
6. `app/src/dashboard/reports/page.tsx` — 인라인 루프 Gap G-1 수정
7. `app/src/dashboard/submit/page.tsx` — TSV 정규화 Gap G-2 수정
8. `app/src/api/acc-book/route.ts` — batch_receipt 수입 no-op
9. `app/src/dashboard/income/page.tsx` — 버튼 제거
10. `app/src/lib/help-texts.ts` — 고아 항목 정리

### 테스트 (5)
1. `app/src/lib/accounting/receipt-no.test.ts` — TC-3/TC-9/TC-12 + displayReceiptNo
2. `app/src/lib/accounting/adjusted-ledger.test.ts` — reallocation 수입
3. `app/src/lib/accounting/adjusted-ledger-parity.test.ts` — 뷰어==export
4. `app/src/dashboard/income-expense-book/income-expense-book.test.ts` — T-16
5. `app/src/lib/hwpx/income-ledger-builder.test.ts` — ledger 수입 렌더

---

## 검증 결과

### 테스트
- **826 passed** (70 files) — 전체 suite 통과
- **회귀 고정**: receipt-no·adjusted-ledger·parity·income-expense-book·income-ledger-builder 테스트 유지
- **새 테스트**: displayReceiptNo 단위 테스트 + Gap 재검증 TC 추가

### Lint & Code Quality
- **ESLint**: clean (v9 flat config)
- **TypeScript**: type-safe (AC-1~8 수용기준 모두 타입 검증)
- **코드 정리**: 상수화, 헬퍼 추출, 중복 제거

### Ground Truth 정합
1. **Fund_Data_1.db (후보자 샘플)**
   - 수입 9건: `RCP_YN='N'`, `RCP_NO=''`, `RCP_NO2=0` ✅
   - 지출: `RCP_YN='Y'`, `RCP_NO='자(비)-N'`, `RCP_NO2=N` ✅

2. **공식 인쇄 PDF (정치자금 수입·지출부)**
   - 수입 행 영수증칸: 모두 "생략" ✅
   - 지출 행: 실제 번호(후(비)-1…) ✅

3. **App 렌더 산출물**
   - 수입·지출부 뷰어: "생략" ✅
   - 과목별 수입지출부 Excel: "생략" ✅
   - HWPX 회계장부: "생략" ✅
   - .db export: RCP_NO 빈값 ✅

---

## 학습 및 개선

### 잘된 점
1. **Ground truth 중심 설계** — 공식 선관위 샘플 DB + 인쇄 PDF로 명확한 요구사항 직접 도출 → 모호함 0
2. **SSOT 강화** — `receipt-no.ts`에 `displayReceiptNo` 순수 헬퍼 추가 → 6개 렌더 경로에서 재사용 가능 (||/?? 드리프트 방지)
3. **gap-detector 효율** — 1차 88% 결과에서 2개 Gap을 즉시 식별·우선순위 지정 → 최소 변경으로 100% 달성
4. **번호 비우기 전략** — `fillExportReceiptNumbers`에서 기존 번호까지 비움 → 재배분/이동분도 자동 정규화

### 개선 영역
1. **reports 과목별 수입지출부 렌더 경로 이원화** — 인라인 루프 vs 공유 빌더 → 차후 통합 권장 (altitude 부채)
2. **assignReceiptNumbers 스킴 C (후원회 수입 폴백)** — dead code화 기록용 유지 → 명확한 삭제 정책 필요
3. **수입 페이지 수동 증빙서번호 입력 필드** — 존치했으나 보고 산출물은 "생략" 표기 → 사용자 피드백 후 제거 여부 결정

### 다음 반복에 적용할 사항
1. **필드-렌더 이원화 감지** — 같은 데이터의 표시 경로가 2개 이상이면 공유 헬퍼 후보로 flagging
2. **생략 로직 SSOT화** — "생략" 같은 도메인-특화 상수는 early-define (스킴 선택 후)
3. **export+view parity 회귀** — 표시 경로 추가 시 `*-parity.test.ts` 자동 갱신 (누락 방지)

---

## 미해결 / 후속 과제 (비차단)

### 기록용 유지
- `assignReceiptNumbers` 스킴 C(후원회 수입 폴백 수(기)-N) — 호출처 없음, dead code 기록용 유지 (별도 정리 권장)

### 사용자 결정 대기
- 수입 페이지 수동 「증빙서번호」 입력 필드 — 원본 입력값 존치, 보고 산출물은 "생략" 표기 (사용자 피드백 후 제거 여부 결정)

### 기술 부채 (차후 refactor)
- 수입·지출부 렌더 경로 2개(reports 인라인 vs 공유 빌더) 통합 — altitude 수준의 정리

---

## 메트릭 요약

| 메트릭 | 값 |
|--------|-----|
| **최종 Match Rate** | 100% (gap-detector 1차 88% → 2개 Gap 해소) |
| **변경 파일** | 15개 (소스 10 + 테스트 5) |
| **코드 변경** | +146 / -76 lines |
| **테스트 통과** | 826/826 passed (70 files) |
| **반복 횟수** | 0회 |
| **소요 기간** | 단일 세션 (~3시간) |
| **Lint** | Clean (ESLint v9) |
| **Ground Truth 정합** | 2/2 (Fund_Data_1.db + 인쇄 PDF) ✅ |

---

## 결론

**영수증 일괄생성 수입 "생략" 표기 기능은 완전히 완료되었습니다.**

- **최종 Match Rate: 100%** (gap-detector 1차 88% → 2개 Gap 해소)
- **공식 양식 정합 완료**: 수입·지출부 어디서나 수입은 "생략", 지출만 실제 번호
- **선관위 ground truth 검증**: Fund_Data_1.db 및 인쇄 PDF와 1:1 일치
- **반복 0회**: Check 단계에서 직접 100% 달성 (차단 없음)
- **모든 테스트 통과**: 826 passed, ESLint clean

다음 버전 배포 시 **app/VERSION 0.24.1.0 → 0.25.0.0** 로 feature MINOR bump 예정 (아직 미커밋).
