# 지출내역관리 — 수입원별 충당 현황 Gap Analysis

> **Phase**: Check (PDCA)
> **Feature**: expense-funding-allocation
> **Date**: 2026-06-08
> **Match Rate**: **96%** (임계 90% 초과 → Report 진행 가능)
> **Design**: `docs/02-design/features/expense-funding-allocation.design.md`

---

## 1. 종합 점수

| 항목 | 점수 | 상태 |
|------|:----:|:----:|
| §0 설계결정(Q1~Q5) 반영 | 100% | ✅ |
| §3.1 빌더 시그니처·알고리즘 | 100% | ✅ |
| §3.2 패널 UI | 95% | ✅ |
| §3.3 페이지 통합 | 100% | ✅ |
| §5 엣지케이스 | 90% | 🟡 |
| §6 테스트 계획 | 95% | ✅ |
| **전체 Match Rate** | **96%** | **✅** |

누락(Missing) 0건 · 추가(Added) 0건 · 변경/편차(Changed) 4건 — **전부 Low**, 동작 정확성 영향 없음.

## 2. 검증된 일치 항목

- **설계결정 Q1~Q5 전부 반영**: 데이터 재활용·패널만·전체 누적·음수 경고톤(빨강+⚠, 차단 없음)·`acc_sec_cd` 단순 집계.
- **빌더(§3.1)**: `FundingAllocationRow` 7개 필드, `FUNDING_ORDER` 순서, 0자금원 제외, `applyCorrections`·`classifyFundingSource` 재사용, `applyNegativeIncomeRule` 기본 true — 알고리즘 6단계 전부 구현.
- **페이지 통합(§3.3)**: `allRows` state, select 컬럼 확장(`acc_sec_cd/item_sec_cd`) **2곳 모두**(`loadRecords` + 초기 effect), `orgType==="candidate"` 분기, `LedgerSummaryHeader` 아래 배치, `useMemo` 계산.
- **테스트(§6)**: T1~T10 전 항목 커버, 결산 정합 회귀(T10)는 `incomeTotal/expenseTotal/balance` 3중 검증. **548개 전체 통과 · build 성공 · lint 0**.

## 3. 발견된 편차 (Changed, 전부 Low)

| # | 항목 | 설계 | 구현 | 심각도 | 조치 |
|---|------|------|------|:------:|------|
| Gap-1 | 패널 `loading` prop | Props에 `loading?` | 합계행은 `loading` 무시하고 실값 표시(데이터 행만 "…"). 헤더 잔액도 무조건 표시라 일관성 자체는 무해 | Low | 선택: 합계행도 "…" 처리 |
| Gap-2 | 선거/선거비용외 분리 표시 | 빌더는 `electionExpense/nonElectionExpense` 분리 보유 | 패널은 합산 `expense`만 노출 | Low | 설계 의도대로 "데이터 보유, 표시는 합산". 후속 분리 컬럼 가능 |
| Gap-3 | "추가 DB 왕복 0"(Q1) | 행 배열 state 보존만 | **재검증 결과 사실 무관**: 기존 summary 계산용 전체조회 쿼리의 select 컬럼만 확장(`incm_sec_cd,acc_amt` → `+acc_sec_cd,item_sec_cd`). **쿼리 왕복 수 증가 없음** → 설계 "왕복 0" 정확. gap-detector가 "별도 쿼리"로 오판 | Low(무효) | 조치 불요 |
| Gap-4 | T5 마이너스수입 테스트 시맨틱 | "환입 → 지출 전환" | 입력 행에 무의미한 `item_sec_cd:87` 부여. 결과(`expense=3000`)는 정확하나 오해 소지 | Low | 선택: 주석 보강 |

## 4. 결론

- **Match Rate 96% — PDCA Check 통과 기준(90%) 충족.**
- Gap 4건 모두 Low이며 Gap-3은 재검증 결과 무효(왕복 증가 없음 확인).
- 코드 수정 없이 Report 단계 진행 가능. 선택 개선(Gap-1/2/4)은 후속 또는 `/simplify` 시 반영 가능.

## 5. 권장 다음 단계

- `/pdca report expense-funding-allocation` — 완료 보고서 생성.
- (선택) `/simplify` — Gap-1/4 미세 정리.
