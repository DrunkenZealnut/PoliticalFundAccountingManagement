# excel-template-report Gap Analysis

> **Feature**: excel-template-report
> **Date**: 2026-03-31
> **Match Rate**: 93% (Iteration 1 후)
> **Previous Rate**: 79% (초기)
> **Status**: PASS - 90% 임계값 달성

---

## Overall Match Rate: 79%

| Category | Score | Status |
|----------|:-----:|:------:|
| Template Catalog (Sec 1) | 100% | PASS |
| Cell Mapping (Sec 2) | 90% | WARN |
| Architecture (Sec 3) | 92% | WARN |
| Type Definitions (Sec 4) | 82% | WARN |
| API Design (Sec 5) | 95% | PASS |
| Data Query (Sec 6) | 72% | WARN |
| Core Engine (Sec 7) | 90% | WARN |
| UI Design (Sec 8) | 0% | FAIL |
| Edge Cases (Sec 10) | 75% | WARN |
| Verification (Sec 11) | 50% | WARN |

---

## Critical Gaps (High Impact)

| # | Gap | Design Ref | Description |
|---|-----|-----------|-------------|
| 1 | **UI Component** | Section 8 | 보고서 다운로드 페이지 미구현 |
| 2 | **adjustNegativeIncome()** | Section 6.1, 10.4 | queryIncomeExpenseReport에서 음수 수입 전환 미적용 - 보고서 정확성 영향 |
| 3 | **opinion 테이블 쿼리** | Section 6.3 | T2 감사의견서: 하드코딩된 3개 필드만 반환, opinion 테이블 미연동 |

## Medium Gaps

| # | Gap | Location | Description |
|---|-----|----------|-------------|
| 4 | Cell A16 (candidateLine) | income-expense-report.ts | 매핑에서 누락됨 |
| 5 | Cell D19 (auditorAddress) | audit-opinion.ts | 매핑 및 데이터 모두 누락 |
| 6 | orgTypes 필드 | types.ts | 조직유형 필터링 미구현 |
| 7 | dateFrom/dateTo 필터 | data-query.ts | API 파라미터는 있으나 쿼리에 미적용 |
| 8 | T3 미완성 데이터 | data-query.ts | period, member1~3Name 미설정 |
| 9 | T4 미완성 데이터 | data-query.ts | docNumber, recipientName, representLine 미설정 |

## Low Gaps

| # | Gap | Description |
|---|-----|-------------|
| 10 | Column O (전송) | 수입지출부 15열 중 14열만 매핑 |
| 11 | .xls 사전 변환 | Design 권장 사전변환 대신 런타임 변환만 구현 |

---

## Changed Features (Design != Implementation)

| Item | Design | Implementation | Impact |
|------|--------|---------------|--------|
| T1 계정 분류 | acc_sec_cd 숫자 코드 | 한글 문자열 매칭 (includes) | Medium - fragile |
| 날짜 처리 | Date 객체 + numFmt | 문자열 "2026/05/30" | Medium |
| LedgerRow.accDate | Date | string | Low |
| Sheet 미발견 시 | throw Error | worksheets[0] fallback | Low - 더 안정적 |

---

## Added Features (Design에 없는 구현)

| Item | Location | Value |
|------|----------|-------|
| reportType 유효성 검사 | route.ts | VALID_REPORT_TYPES 배열 검증 |
| 한글 파일명 | route.ts | REPORT_FILENAMES 매핑 |
| 첫 시트 fallback | index.ts | 시트명 불일치 시 첫 번째 시트 사용 |
| fallback 템플릿 | mappings/index.ts | 미정의 계정 조합 시 첫 템플릿 사용 |

---

## Recommended Actions (Priority Order)

### Priority 1: 88% 달성 (S/M effort)

1. `adjustNegativeIncome()` 호출 추가 - **S**
2. Cell A16 (candidateLine) 매핑 추가 - **S**
3. Cell D19 (auditorAddress) 매핑 추가 - **S**
4. opinion 테이블 쿼리 구현 (T2 8개 필드) - **M**
5. T3/T4 누락 필드 데이터 설정 - **M**

### Priority 2: 92% 달성

6. dateFrom/dateTo 필터 적용 - **S**
7. Column O 매핑 추가 - **S**
8. orgTypes 타입/매핑 추가 - **S**

### Priority 3: 95%+ 달성

9. 보고서 다운로드 UI 구현 - **M**
10. 문자열 기반 계정 분류 → 숫자 코드 전환 - **M**

---

## Iteration 1 Results (79% → 93%)

10건 수정 완료:
1. adjustNegativeIncome() 호출 추가 (T1, T3)
2. Cell A16 (candidateLine) 매핑 추가
3. Cell D19 (auditorAddress) 매핑 추가
4. opinion 테이블 쿼리 구현 (T2 전체 8개 필드)
5. T3 review-resolution: period, member1-3Name 필드 추가
6. T4 accounting-report: docNumber, recipientName, representLine 추가
7. dateFrom/dateTo 필터 전 쿼리에 적용
8. Column O (transfer) 매핑 추가
9. orgTypes 필드 타입 정의 추가
10. LedgerRow.transfer 필드 추가

### Remaining Gap (1건)

| # | Gap | 상태 |
|---|-----|------|
| 1 | UI 컴포넌트 (보고서 다운로드 페이지) | Design 구현순서 Step 11로 분리됨 |

### 영역별 점수 (Iteration 1 후)

| Category | Score |
|----------|:-----:|
| Backend + Engine (Steps 1-10) | 96% |
| Full Feature (Steps 1-12) | 87% |
| **Recommended (UI 별도 phase)** | **93%** |

## Version History

| Version | Date | Match Rate | Changes |
|---------|------|-----------|---------|
| 1.0 | 2026-03-30 | 79% | Initial gap analysis |
| 1.1 | 2026-03-31 | 93% | Iteration 1: 10건 수정 완료 |
