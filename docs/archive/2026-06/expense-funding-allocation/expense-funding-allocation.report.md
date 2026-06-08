# 지출내역관리 — 수입원별 충당 현황 완료 보고서

> **Feature**: expense-funding-allocation
> **Project**: PoliticalFundAccountingManagement
> **Period**: 2026-06-08 (Plan→Report 단일 세션)
> **Final Match Rate**: 96%
> **Status**: ✅ Completed (미커밋 — 사용자 요청 시 ship)

---

## Executive Summary

### 1.1 개요

| 항목 | 내용 |
|------|------|
| Feature | 지출내역관리 — 수입원별(자금원별) 충당 현황 패널 |
| 대상 | 후보자(candidate) orgType 전용 |
| 기간 | 2026-06-08 (Plan→Design→Do→Check→Report) |
| Match Rate | 96% (1회 통과, iterate 불필요) |

### 1.2 결과 지표

| 지표 | 값 |
|------|----|
| Match Rate | **96%** (임계 90% 초과) |
| 신규 파일 | 3 (빌더 + 테스트 + 패널) |
| 수정 파일 | 2 (expense 페이지 + 도움말) |
| 신규 테스트 | 10개 (전체 548개 통과) |
| 빌드/Lint | build 성공 · ESLint 0 |
| 추가 DB 왕복 | 0 (기존 쿼리 select 컬럼만 확장) |

### 1.3 Value Delivered (4-Perspective)

| Perspective | 전달된 가치 (실제 결과) |
|-------------|------------------------|
| **Problem** | 지출이 비용계정으로만 기록돼 "어느 수입원에서 충당했는지" 입력 시점에 알 수 없던 문제 → 해결. 자금원별 잔여 여력을 화면에서 즉시 확인 가능 |
| **Solution** | `buildFundingAllocation` 순수 빌더 + `FundingAllocationPanel` — 자금원별 [수입 / 지출 / 가용잔액]을 org 전체 누적 기준으로 표시. 결산(`computeBalances`)과 총액 정합(T10 회귀 통과) |
| **Function/UX Effect** | 지출 페이지 상단에서 "보조금 −2,000,000원 ⚠ 초과충당, 후보자자산 12,000,000원 가용" 식으로 즉시 파악 → 메뉴 이동 없이 할당 판단 |
| **Core Value** | 자금원 용도제한·초과지출을 입력 단계에서 가늠하는 "할당 나침반" — 회계 정확성·법규 준수 사전 점검 |

---

## 2. PDCA 사이클 요약

```
[Plan] ✅ → [Design] ✅ → [Do] ✅ → [Check] ✅ 96% → [Report] ✅
```

| 단계 | 산출물 | 핵심 |
|------|--------|------|
| Plan | `docs/01-plan/features/expense-funding-allocation.plan.md` | 문제 정의 + 재사용 자산 식별 + Open Questions 5건 |
| Design | `docs/02-design/features/expense-funding-allocation.design.md` | Q1~Q5 확정(AskUserQuestion 2건 포함), 빌더 시그니처·UI·통합 설계 |
| Do | 코드 5파일 | 빌더 TDD → 패널 → 페이지 통합 → 도움말 |
| Check | `docs/03-analysis/expense-funding-allocation.analysis.md` | gap-detector, Match Rate 96%, Gap 4건(전부 Low) |
| Report | 본 문서 | 완료 보고 |

---

## 3. 구현 상세

### 3.1 산출물

| 파일 | 유형 | 역할 |
|------|------|------|
| `app/src/lib/accounting/funding-allocation.ts` | 신규 | 순수 빌더 — `classifyFundingSource`·`applyCorrections` 재사용, 자금원별 수입/지출/가용잔액 |
| `app/src/lib/accounting/funding-allocation.test.ts` | 신규 | 단위 테스트 10개 (집계·초과충당·마이너스보정·정렬·결산정합) |
| `app/src/components/dashboard/FundingAllocationPanel.tsx` | 신규 | 자금원별 패널 + 합계 + 면책 캡션, 음수 경고톤(빨강+⚠) |
| `app/src/app/dashboard/expense/page.tsx` | 수정 | `allRows` 보존 + select 확장(2곳) + `orgType==="candidate"` 분기 |
| `app/src/lib/help-texts.ts` | 수정 | `expense.funding-allocation` 도움말 |

### 3.2 핵심 설계 판단

- **결산 SSOT 정합**: 새 회계규칙을 만들지 않고 `applyCorrections`(마이너스 수입 보정)·`classifyFundingSource`(자금원 4분류)를 재사용. T10 회귀로 `computeBalances`와 총수입/총지출/잔액 일치 보장.
- **데이터 사실 활용**: 후보자 지출의 `acc_sec_cd`가 곧 자금원(82·83·84·85)이라는 사실(`getAccounts(orgSecCd, 2)`)을 활용해 단순 집계로 정확도 확보.
- **추가 왕복 0**: 기존 summary 계산용 전체조회 쿼리의 select 컬럼만 확장.
- **범위 절제(YAGNI)**: 법정 우선순위 충당 재배분 추정·입력폼 연동·스키마 변경은 의도적으로 제외.

---

## 4. 품질 검증

| 검증 | 결과 |
|------|------|
| 단위 테스트 | 548/548 통과 (신규 10 포함) |
| 빌드(타입체크) | 성공 |
| ESLint | 0 경고/에러 |
| 설계-구현 Gap | 96% (Gap 4건 전부 Low, 동작 영향 없음) |

### 잔여 Gap (선택 개선)
- Gap-1: 합계행 `loading` 시 "…" 미적용 (헤더와 동일 패턴, 무해)
- Gap-2: 빌더는 선거비용/외 분리 보유, 패널은 합산 표시 (설계 의도대로)
- Gap-4: T5 테스트 `item_sec_cd` 주석 보강 여지
- (Gap-3은 재검증 결과 무효 — 왕복 증가 없음)

---

## 5. 학습 & 다음 단계

### 학습
- 후보자 지출 행이 자금원 `acc_sec_cd`를 보유한다는 도메인 사실이 설계 난이도를 크게 낮춤 — 결산 규칙2 코드(`r.incm_sec_cd===2 && r.acc_sec_cd===자금원`)가 그 증거였음.
- 페이지가 이미 보유한 데이터(summary용 전체조회)를 재활용해 성능 비용 없이 기능 추가.

### 다음 단계
- (선택) `/simplify` — Gap-1/4 미세 정리.
- `/pdca archive expense-funding-allocation` — 문서 아카이브.
- ship 요청 시 PR 생성 (현재 미커밋).
