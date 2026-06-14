# Gap Analysis: claim-income-expense-book

> Check 단계 (gap-detector) · 2026-06-14
> 설계: `docs/02-design/features/claim-income-expense-book.design.md`

## 전체 Match Rate: **98%** ✅ (90% 통과 → Report 진행 가능)

| Category | Score | Status |
|----------|:-----:|:------:|
| Design Match | 98% | ✅ |
| Architecture Compliance | 100% | ✅ |
| Convention Compliance | 100% | ✅ |

## 검증 포인트별 결과

| # | 검증 포인트 | 결과 | 근거 |
|---|------------|:----:|------|
| 1 | 2계층 분리(순수 빌더 + ExcelJS 렌더) | ✅ | income-expense-book.ts buildIncomeExpenseBookModel / renderIncomeExpenseBook |
| 2 | 데이터 타입(Ieb*) 설계 §2 일치 | ✅ | :19-80 1:1 |
| 3 | 필터(incm=2·acc_amt≠0·선거비용·print=Y) + 기타 분리 | ✅ | :110-119 |
| 4 | claimAmount SSOT 재사용 | ✅ | claim-amount/funding-source import |
| 5 | 그룹핑/순서·누계·잔액·내역포맷·익명 | ✅ | SOURCE_ORDER, formatContent, isAnonymousCustomer |
| 6 | 14컬럼 레이아웃(제목/계정명/헤더 병합/데이터/합계) | ✅ | renderHeader + 데이터/합계행 |
| 7 | ClaimFormTab 통합(조회·코드·버튼·파일명·경고) | ✅ | page.tsx handleDownloadBook + 버튼 |
| 8 | 테스트 T-1~T-9 + 교차검증 | ✅ | test.ts 10건(빈입력 포함) |
| 9 | 정합성(계정별==byFundingSource, 총합) | ✅ | T-8 교차검증 + 실데이터 19,439,541 |

## Gap (전부 Trivial, 기능 무영향)
| 심각도 | 항목 | 상태 |
|:------:|------|------|
| 🟢 | dead `@param meta` JSDoc | ✅ **해소** (Check 직후 제거) |
| 🟢 | 파일명 orgName/"기관" 폴백 | 설계 초과(견고성↑) |
| 🟢 | accName 첫행 코드명 폴백 | 설계 의도 동일 |

## 설계 초과 구현 (긍정)
- 빈 입력 테스트, 파일명 폴백, 미체크 사전 안내 alert, 시트명 금지문자/31자 방어

## 실측 검증 (Gap 아님)
- 테스트 **664 통과**(빌더 10·aggregator 교차검증 T-8) · lint 0 · build 성공
- 실데이터(오준석후보): 후보자등자산 13,731,739 / 후원회기부금 2,707,802(환급 차감) / 보조금외지원금 3,000,000 = **19,439,541** (보전관리·청구서·첨부서류목록 일치)

## 결론
설계-구현 98% 일치, Trivial 1건 즉시 해소 → 문서-코드 정합. **Report 진행 가능.**
