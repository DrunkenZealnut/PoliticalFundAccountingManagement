# Gap 분석 — 영수증 일괄생성 수입 "생략" 표기

- 기능: `income-receipt-no-omitted` (영수증 일괄생성에서 수입은 생략으로 표기)
- 단계: Check (Gap Analysis)
- 분석일: 2026-06-26
- 검증 방식: 사용자 요구 + 공식 선관위 ground truth(`data/송파/Fund_Data_1.db`, 인쇄 PDF) 기준 수용기준(AC) 대조 + gap-detector 독립 검증

## Executive Summary

| 관점 | 내용 |
|------|------|
| **Problem** | 수입에도 영수증 일련번호가 부여돼 공식 양식(수입=영수증 생략)과 불일치. 윈도우 프로그램·인쇄 수입·지출부와 표기가 어긋남 |
| **Solution** | 영수증 채번 SSOT(`fillExportReceiptNumbers`)에서 수입(incm_sec_cd=1) 채번 제외·기존 번호 비움 + 모든 보고 산출물(뷰어·엑셀·HWPX·과목별 수입지출부·개별 수입부)에서 수입 영수증칸을 "생략"으로 표기. 입력 시점(batch_receipt·수입 페이지 버튼)도 차단 |
| **Function/UX 효과** | 수입·지출부 어디서나 수입은 "생략", 지출만 실제 번호(자(비)-N 등) — 공식 양식·.db ground truth와 1:1 정합. 잘못된 수입 번호 생성 경로 제거 |
| **Core Value** | 선관위 제출물 정합성 확보(수입 RCP_NO 빈값=.db, 인쇄물 "생략") + 채번 로직 단순화(지출 전용 스코프) |

## 수용기준(AC) 결과

| AC | 산출물 | 판정 | 근거 |
|----|--------|:----:|------|
| AC-1 | 수입·지출부 뷰어 | ✅ | `income-expense-book/page.tsx:379` |
| AC-2 | reports 엑셀 빌더 | ✅ | `excel-template/income-expense-book.ts:248` |
| AC-3 | HWPX 회계장부/22-4 | ✅ | `hwpx/income-ledger-builder.ts:219` |
| AC-4 | 개별 수입부 엑셀 | ✅ | `api/excel/export/route.ts:154` (rcp_yn 무관 생략) |
| AC-5 | .db export SSOT | ✅ | `receipt-no.ts:fillExportReceiptNumbers` 수입 제외·비움 / `splitOfficialReceiptNo` → RCP_NO 빈값·RCP_NO2=0 = ground truth |
| AC-6 | 입력 차단 | ✅ | `api/acc-book/route.ts` batch_receipt 수입 no-op + 수입 페이지 「영수증일괄입력」 버튼 제거 |
| AC-7 | 지출 채번 불변 | ✅ | 스킴 A/B·assignReceiptNumbers 무변경, 수입은 별도 분기 제외 |
| AC-8 | RECEIPT_OMITTED_LABEL SSOT | ✅ | `receipt-no.ts:37` 정의, 6개 렌더 사이트 공용 |

## 발견·해소한 Gap (gap-detector 독립 검증)

| # | 심각도 | 위치 | 내용 | 조치 |
|---|:------:|------|------|------|
| G-1 | P1 | `reports/page.tsx:649` | 「과목별 정치자금 수입지출부」 Excel이 공유 빌더가 아닌 **인라인 루프**로 렌더 → 수입칸 빈칸(생략 미표기). 비후보자(후원회)는 정규화도 안 거쳐 잔존 번호 노출 위험 | ✅ `isIncome ? RECEIPT_OMITTED_LABEL : (rcp_no||"")`로 수정(표기 단에서 보장, 데이터 무관) |
| G-2 | P2 | `submit/page.tsx:237` | 선관위 제출 TSV가 raw `records`의 수입 영수증번호를 그대로 출력 → stale 잔존번호 누출 여지 | ✅ 수입은 항상 빈값(데이터 export, .db ground truth 정합) |

## 정확성 검증 (결함 0)

- (a) 수입 기존번호 비움: `receipt-no.ts` `{...r, rcp_no:"", rcp_no2:0}` — 테스트 TC-12
- (b) 지출 순번 오염 없음: 수입 `continue`로 existing/target 양쪽 제외 — TC-3/TC-9
- (c) split→ground truth: `splitOfficialReceiptNo` 빈 수입 → RCP_NO 빈값/RCP_NO2=0

## 종합

- **최종 Match Rate: 100%** (gap-detector 1차 88% → P1/P2 갭 2건 해소 후 100%)
- P0=0, P1=0(해소), P2=0(해소)
- 전체 테스트 **823 passed**, ESLint clean
- 회귀 고정: `receipt-no.test.ts`(TC-3/9/12), `adjusted-ledger.test.ts`, `adjusted-ledger-parity.test.ts`(뷰어==export), `income-expense-book.test.ts`(T-16), `income-ledger-builder.test.ts`

## 변경 파일 (15)

핵심 로직: `receipt-no.ts` / 렌더: `income-expense-book/page.tsx`, `excel-template/income-expense-book.ts`, `hwpx/income-ledger-builder.ts`, `api/excel/export/route.ts`, `reports/page.tsx`, `submit/page.tsx` / 입력: `api/acc-book/route.ts`, `income/page.tsx`, `help-texts.ts` / 테스트 5종.

## 미해결·후속 (비차단)

- `assignReceiptNumbers` 스킴 C(후원회 수입 폴백 수(기)-N)는 호출처가 없어 dead code화 — 기록용 유지(제거는 별도 정리).
- 수입 페이지 수동 「증빙서번호」 입력 필드는 존치(원본 입력값; 보고 산출물엔 "생략" 표기) — 제거 여부는 사용자 결정 대기.
