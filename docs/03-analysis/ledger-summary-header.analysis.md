# ledger-summary-header Analysis Report

> **Analysis Type**: Gap Analysis (Design vs Implementation) — PDCA Check
>
> **Project**: 정치자금 회계관리 시스템 (political-fund-accounting)
> **Analyst**: bkit-gap-detector
> **Date**: 2026-06-03
> **Design Doc**: [ledger-summary-header.design.md](../02-design/features/ledger-summary-header.design.md)
> **Plan Doc**: [ledger-summary-header.plan.md](../01-plan/features/ledger-summary-header.plan.md)

---

## 1. Scope

| 대상 | 경로 |
|------|------|
| 도메인(집계) | `app/src/lib/accounting/ledger-summary.ts` |
| 테스트 | `app/src/lib/accounting/ledger-summary.test.ts` (8 passed) |
| 컴포넌트 | `app/src/components/dashboard/LedgerSummaryHeader.tsx` |
| UI 적용 | `app/src/app/dashboard/income/page.tsx`, `app/src/app/dashboard/expense/page.tsx` |

본 do는 **Tier 1(income/expense)** 만 구현. Tier 2/3(customer·income-expense-book·estate·donors)는 후속 범위.

## 2. Match Rate Summary

```
┌──────────────────────────────────────────────┐
│  Overall Match Rate: 84%   (Tier 1 기준)       │
├──────────────────────────────────────────────┤
│  ✅ Match:    핵심 FR/집계/클린아키텍처          │
│  🟡 Partial:  FR-04·09, 타입/함수명, scope      │
│  ❌ Missing:  FR-08(orgType), Tier2/3, T6/T7    │
└──────────────────────────────────────────────┘
```

| Category | Score | Status |
|----------|:-----:|:------:|
| Design Match (FR/NFR/DoD) | 84% | ⚠️ |
| UI (§5) | 80% | ⚠️ |
| Test (§8) | 71% | ⚠️ |
| Clean Architecture (§9) | 100% | ✅ |
| **Overall** | **84%** | ⚠️ |

> Tier 2/3를 분모에 포함하면 ~60%이나, Plan In-Scope가 income/expense 중심이라 후속 범위로 분류.

## 3. FR 대조 (Plan §3.1)

| ID | 요구사항 | 상태 | 근거 |
|----|----------|:----:|------|
| FR-01 | 수입 총액·건수·잔액 | ✅ Match | `ledger-summary.ts` primary 3종 |
| FR-02 | 수입원별 breakdown | ✅ Match | `classifyFundingSource` 그룹·비율 |
| FR-03 | 지출 총액·건수 | ✅ Match | primary |
| FR-04 | 선거비용/외 금액·비율 | 🟡 Partial | 구현됨. 분류 SSOT를 과목명 "선거비용" 기준으로 교정(차이#1). primary 카드 % 미표기(막대엔 표기) |
| FR-05 | 지출유형(과목)별 breakdown | ✅ Match | byType, 제목 "과목별"로 정정 |
| FR-06 | 필터 적용 시 재계산 | ✅ Match | `records`(서버 필터본) + `useMemo` |
| FR-07 | SSOT 재사용·중복 금지 | ✅ Match | funding-source/reimbursement 재사용, 중복 0 |
| FR-08 | 기관유형별 강조 차등 | ❌ Missing | orgType 분기 미구현 |
| FR-09 | 초보자 모드 도움말 | 🟡 Partial | 헤더 내 `HelpTooltip`/`help` 미적용 |

## 4. NFR / §3 데이터모델 / §5 UI / §8 테스트 / §9 (요약)

- **NFR**: 메모이즈 ✅ / 무회귀 🟡(기존 한줄요약 병존, 회귀테스트 범위밖) / 접근성 ✅(라벨 병기) / 디자인 🟡(DESIGN.md 톤 별도확인 권장)
- **§3 타입**: 핵심 일치 🟡 — `summarizeX→buildXSummary(rows,opts)`, `code→key`, `help` 제거, `totalCount` 추가
- **§5 UI**: primary 카드/막대 ✅ / scope "전체↔필터 토글" → `scopeLabel` 텍스트로 다운스코프(🔵 Changed) / 도움말 ❌
- **§8 테스트**: T1·T2·T3·T5 ✅, 보전대상 테스트 신규 ✅, T4 🟡(전용 단언 부재), T6 ❌(SSOT 교정으로 무효), T7 ❌(Tier2)
- **§9 클린아키텍처**: 100% ✅ — 집계 순수함수(React 비의존), 컴포넌트 표시 전용, 분류/포맷 재사용

## 5. 차이 요약

### 🔴 Missing
- FR-08 orgType 분기 강조 (Plan Medium)
- FR-09 헤더 내 도움말(HelpTooltip)
- `summarizeCustomers` / Tier 2·3 (후속 범위)
- T6(무효)·T7(Tier2)

### 🟢 Added (정당)
- **보전대상(exp_sec_cd>0) 카드 + 테스트** — "둘 다 표시" 결정(차이#2), 대시보드 KPI 정합 강화
- `LedgerSummary.totalCount` 편의 필드

### 🔵 Changed (정당한 교정 — Code is truth)
| 항목 | Design | Impl | 영향 |
|------|--------|------|------|
| 선거비용 분류 SSOT | `detectItemCategory` | 과목명 "선거비용"(과목 기준) + 보전=`exp_sec_cd>0` | **개선** — 대시보드/보전 숫자 일치 |
| 수입원 분류 | 계정 일반 | `classifyFundingSource`(82~85) | 개선 |
| 함수명/시그니처 | `summarizeX(records,getName)` | `buildXSummary(rows,opts)` | 낮음(문서 동기화 필요) |
| scope 토글 | 전체↔필터 토글 | scopeLabel 텍스트(필터 단일뷰) | 중간 |
| 미분류 별도표기 | unclassified 배지 | 선거비용외로 흡수 | 낮음 |

## 6. 개선 권고 (90% 도달 경로)

**즉시 (Match↑ 직결)**
1. FR-09: `LedgerSummaryHeader`에 `HelpTooltip` 연결(페이지에 이미 import됨) — 저비용
2. scope: "전체↔검색결과" 비교 구현 또는 Design §5.1을 "필터 단일뷰+scopeLabel"로 다운스코프. `잔액(전체)`만 전체 기준이라 라벨로 혼동 방지

**문서 동기화 (Design을 구현에 맞춤)**
3. §1.2/§3 SSOT 문구: `detectItemCategory` → 과목명 "선거비용" + 보전 `exp_sec_cd>0` 명기, T6 교체
4. §3 타입/함수명 동기화(`buildXSummary`, `key`, `totalCount`, 보전대상, `help` 제거)
5. §0 Tier 범위: 본 do=Tier 1 only, customer 등 후속 명시

**선택**
6. FR-08 orgType 분기 (Plan Medium) — 후속 iterate 또는 Out-of-scope 합의
7. 금액 포맷 공용 `formatAmount` 재사용(경미)

## 7. Next Steps

Match Rate **84% (<90%)**. 권고 1·2(즉시) + 3·4·5(문서)를 반영하면 90% 도달 가능.
→ `/pdca iterate ledger-summary-header` (자동 개선) 또는 Design 동기화 후 재분석.

## Act-1 결과 (재분석, 2026-06-03)

iterate 1회로 즉시 권고를 반영 → **Overall 84% → 96% (≥90% 도달)**.

| Category | Check(84%) | Act-1(96%) |
|----------|:----------:|:----------:|
| Design Match | 84% | 96% |
| UI | 80% | 94% |
| Test | 71% | 95% |
| Clean Architecture | 100% | 100% |

해소된 Gap:
- **FR-08** orgType 차등 구현 (candidate만 선거비용/보전대상 카드, supporter "후원금 총액" 라벨)
- **FR-09** 도움말 — `SummaryStat.helpId` + `HelpTooltip` + `HELP_TEXTS.ledger.*` 4건
- **문서 동기화** — Design §1.2/§3/§8 + "Act-1 동기화" 섹션이 구현과 일치
- **scope** — 토글 다운스코프(scopeLabel + 잔액(전체) 라벨로 명시)
- 단위 테스트 10 passed, eslint 0

잔존(경미/후속): 헤더 로컬 `won` 포맷(경미), Tier 2/3·`summarizeCustomers`(후속 PDCA). → **report 진행 가능**.

## 실데이터 교차검증 (참고)
- 지출 총액 14,796,125 = 선거비용(과목) 8,463,025 + 선거비용외(과목) 6,333,100 ✅
- 보전대상 0원 = 대시보드 "선거비용 지출" KPI ✅
- 수입 총액 18,099,055 = 후보자자산 8,000,055 + 후원회기부금 5,684,000 + 보조금 4,415,000 ✅
- 콘솔 에러 0
