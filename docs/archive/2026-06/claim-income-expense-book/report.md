# 완료 보고서: 수입계정별 정치자금 수입·지출부(선거비용) 생성

> Feature: `claim-income-expense-book` · 버전 **v0.14.0.0** · PR **#73** (squash `7c96729`)
> 기간: 2026-06-14 (Plan→Design→Do→Check→Ship 단일 세션) · Match Rate **98%**

## Executive Summary

### 1.1 개요
| 항목 | 값 |
|------|-----|
| Feature | claim-income-expense-book |
| 버전 | v0.13.2.0 → **v0.14.0.0** (MINOR) |
| PR | #73 (main 머지, Vercel 프로덕션 배포) |
| Match Rate | 98% (gap-detector) |
| 테스트 | 666 통과 (빌더 11건 신규, aggregator 교차검증 포함) |
| 변경 | 신규 빌더 1 + 테스트 1 + ClaimFormTab 통합 + PDCA 문서 4 |

### 1.2 결과 요약
- 신규 `lib/excel-template/income-expense-book.ts` (순수 모델 빌더 + ExcelJS 렌더, 14컬럼 선관위 양식)
- ClaimFormTab "수입·지출부(선거비용) 다운로드" 버튼
- 실데이터(오준석후보) 계정별/총합 **19,439,541원** — 보전관리·보전청구서·첨부서류목록과 정합

### 1.3 Value Delivered (4-perspective)

| 관점 | 전달 가치 (실측) |
|------|------------------|
| **Problem** | 보전청구서 첨부용 「정치자금 수입·지출부(선거비용)」 수기 작성 + 최종청구액 기준 합계 맞추기의 번거로움·오류 → **버튼 1회 자동 생성**으로 제거 |
| **Solution** | 보전 체크 선거비용을 수입계정별 시트로, 지출액=`claimAmount`(일할·환급 반영) SSOT. 계정별/총 합계가 4개 보전 출력과 100% 일치(교차검증 테스트로 보장) |
| **Function UX Effect** | 계정명/과목명·거래처·영수증 일련번호(접두사+결제방법)·첨부/생략·합계·작성연월일·회계책임자까지 PDF 양식대로 자동 채움. 3개 계정 시트, 666 테스트·lint 0·build 성공 |
| **Core Value** | 보전 제출서류 자동화 완성 — 청구서·첨부서류목록·수입지출부·대시보드가 단일 SSOT로 금액 정합, 환급/일할 반영 누락 사고 예방 |

---

## 2. 산출물

### 2.1 신규 빌더 (`income-expense-book.ts`)
- `buildIncomeExpenseBookModel(rows, ctx)` — 순수. 필터(incm=2·acc_amt≠0·선거비용·보전체크) → 자금원 4분류 그룹 → 누계/잔액/내역/익명/영수증 첨부생략 집계. 자금원 "기타"는 합계 제외 + 경고.
- `renderIncomeExpenseBook(model, meta)` — ExcelJS. 계정별 시트, 14컬럼 양식(제목·계정명/과목명 2줄·헤더 4행 병합·데이터·합계·영수증 첨부/생략·푸터).
- SSOT 재사용: `claimAmount`, `classifyFundingSource`, `formatLedgerDate`/`isAnonymousCustomer`, `PAY_METHODS`.

### 2.2 통합 (`ClaimFormTab`)
- 거래/codevalue/organ 조회 → 모델 → 렌더 → blob 다운로드(클라이언트).
- 작성연월일=오늘, 회계책임자/선거구=organ 자동. 미분류 경고.

### 2.3 양식 (PDF `정치자금수입지출부(보전비용-후보자산).pdf` 반영)
계정명/과목명 2줄, `(금액단위 : 원)`, 헤더 괄호형, 합계행(거래처 `--`/`N건`), 영수증 첨부분/생략분, 영수증 일련번호(`자(비)-N`/결제방법), 작성연월일·회계책임자 푸터.

## 3. 검증
- 단위 테스트 **666 통과** — 빌더 11건(그룹/순서·claimAmount 일할·환급 차감·모집단·누계/잔액·내역·익명·**aggregator 교차검증**·기타·영수증 첨부생략·영수증 형식)
- lint 0 · `next build` 성공
- gap-detector **98%** (Trivial 3건, dead JSDoc 즉시 해소)
- 실데이터: 후보자등자산 13,731,739 / 후원회기부금 2,707,802 / 보조금외지원금 3,000,000 = **19,439,541**

## 4. 정합성 (SSOT)
계정별 합계 == `aggregator.byFundingSource[자금원]`, 총합 == 보전관리 금액. 보전청구서(서식43/1)·첨부서류목록·대시보드 보전 예상액과 동일 `claimAmount`(환급 차감) 정책 → 4개 보전 출력 전부 19,439,541 일치.

## 5. 교훈 (Learnings)
- **claimAmount/classifyFundingSource SSOT 재사용 + 교차검증 테스트**가 다중 출력(청구서·목록·지출부) 금액 정합의 핵심. 새 보전 출력 추가 시 동일 패턴.
- **ExcelJS 양식은 PDF 원본 대조가 필수** — 헤더 문구(괄호 vs "또는"), 영수증 일련번호 형식(접두사+결제방법) 등은 코드만으로 추정 불가, 실물 양식으로 확정.
- 음수(환급) 처리는 [[negative-refund-rows-in-aggregation]] 정책 일관 적용(acc_amt≠0).

## 6. 잔여 / 후속
- **영수증 접두사 추정**: 후보자자산(`자(비)`)·보조금외(`외(비)`) 확인, 후원회기부금(`후(비)`)·보조금(`보(비)`)은 추정 — 운영 데이터로 확인 필요.
- 양식 인쇄 설정(페이지 반복 헤더, 가로 방향)은 미적용 — 필요 시 후속.

## 7. PDCA 사이클
[Plan] ✅ → [Design] ✅ → [Do] ✅ → [Check] ✅ 98% → [Report] ✅ → 머지/배포 완료
