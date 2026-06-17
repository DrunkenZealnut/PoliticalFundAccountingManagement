# 수입계정별 잔액 가드 완료 리포트

> **Feature**: income-account-balance-guard
> **Project**: PoliticalFundAccountingManagement
> **Date**: 2026-06-17
> **Phase**: Completed (Match Rate ~98%)
> **Plan(v0.2)**: [01-plan](../01-plan/features/income-account-balance-guard.plan.md) · **Design**: [02-design](../02-design/features/income-account-balance-guard.design.md) · **Check**: [03-analysis](../03-analysis/income-account-balance-guard.analysis.md)
> **Related**: [[negative-balance-reallocation]] (사후 교정 짝 — 본 기능은 입력 시점 예방)

---

## Executive Summary

### 프로젝트 개요

| 항목 | 내용 |
|------|------|
| Feature | income-account-balance-guard |
| 기간 | 2026-06-16 (Plan) ~ 2026-06-17 (Design→Do→Check→Report) |
| Match Rate | **~98%** (gap-detector 96% + Check 중 FR-09 보강) |
| 산출물 | 신규 `funding-balance-asof.ts`(+테스트 12) · `FundingDraftPreview.tsx` · `help-texts.ts` 항목 · `expense`/`document-register` 2페이지 연결 |
| 적용 대상 | 후보자(candidate) 전용 / non-blocking |

### 1.3 Value Delivered (4-Perspective)

| Perspective | 내용 (실측 메트릭) |
|-------------|------|
| **Problem** | 지출 입력 시 자금원별 잔여 한도를 모른 채 계정을 골라, 수입지출부·결산에서 자금원 **잔액 음수**가 발생. 기존 패널은 org 전체 **총합**만 보여 "입력 시점·이 금액"을 반영 못 함. |
| **Solution** | 입력 거래일 기준 **시간순(as-of-date) 가용잔액** + 입력 금액 반영 **저장 후 예상 잔액** + 음수 시 **non-blocking 경고**(태깅 불일치→사후 재배분 필요, 여유 자금원 추천). 순수 함수 `funding-balance-asof.ts` + 공유 UI `FundingDraftPreview`, `acc-book-sort`/`funding-source` SSOT 재사용, 신규 API 0. |
| **Function/UX Effect** | /verify(org 11 실데이터): 2026-05-22 후원회기부금 **−78,960 → 저장 후 −343,960** 표시 + "여유 있는 보조금외(3,000,000) 권장" 경고가 정확히 렌더. happy path(보조금외 비음수)·무거래 자금원(보조금 0) probe 통과. 단위 테스트 12케이스·전체 729 통과. |
| **Core Value** | 자금원 무결성을 **입력 시점에 예방** — 사후 재배분(negative-balance-reallocation)과 **동일 시간순 계산 기반** 공유. "사후 보정"에서 "사전 가이드"로. |

---

## 2. PDCA 사이클 요약

```
[Plan v0.2] ✅ → [Design] ✅ → [Do] ✅ → [Check 98%] ✅ → [Report] ✅
```

- **Plan(v0.2)**: 후보자 지출 입력에 자금원별 가용·예상잔액·경고. negative-balance-reallocation 통찰 반영 — 단일 통합계좌(태깅 아티팩트)·as-of-date 시간순·SSOT 재사용·경고 프레이밍(FR-10).
- **Design**: 순수함수 `availableAsOf`/`previewDraft` + `FundingDraftPreview` UI + 두 페이지 연결, 테스트 A1~P5.
- **Do**: 구현 + 테스트 12케이스. expense(allRows 쿼리 acc_date/acc_time/acc_book_id 확장·수정 시 자기 제외)·document-register(org rows API 로드). lint 0·tsc 0·전체 729 통과.
- **Check(gap-detector)**: Match 96%, 차단 Gap 0. FR-09(도움말) Check 중 보강(help-texts `expense.balance-guard`) → ~98%. `atOrBefore`가 `compareAccDateTime` 직접호출 대신 쓰인 것은 §8 "그 날짜 전체 포함" 의도 부합(직접 호출 시 가용 과소계상 버그)으로 확인.
- **Verify(런타임)**: 인증 게이트로 실제 페이지 직접 구동 불가 → publicPaths 임시 하니스 + 실데이터(org 11)로 컴포넌트·로직 런타임 확인. 페이지 폼→props 배선은 정적(tsc/lint) 검증.

---

## 3. 산출 파일

| 파일 | 비고 |
|------|------|
| `app/src/lib/accounting/funding-balance-asof.ts` | 순수: availableAsOf(as-of 시간순)·previewDraft |
| `app/src/lib/accounting/funding-balance-asof.test.ts` | 12케이스(A1~A5·P1~P5 + 보강 2) |
| `app/src/components/dashboard/FundingDraftPreview.tsx` | 공유 UI(미니패널·미리보기·non-blocking 경고) |
| `app/src/lib/help-texts.ts` | `expense.balance-guard` 도움말(FR-09) |
| `app/src/app/dashboard/expense/page.tsx` | 연결 + allRows 쿼리 확장 + 수정 시 자기 제외 |
| `app/src/app/dashboard/document-register/page.tsx` | 후보자 지출 탭 연결 + org rows 로드 |

---

## 4. 잔여 / 후속

- 🔵 **FR-02**: 드롭다운 인라인 잔액 병기 미채택(미니패널로 대체 — 설계 optional). design.md에 확정 기록 권장.
- ⚪ **cross-entry 한계**: document-register 다중 entry 동시 입력 시 미저장 sibling entry 누적 미반영(entry별 독립 preview). design.md §8에 한계 명시 권장.
- ⚪ **end-to-end**: 인증 게이트 페이지 실폼 구동은 미수행(자격증명 필요). 로그인 세션에서 지출관리 화면 실폼으로 동일 입력 재확인 권장.
- **미커밋**: 본 기능은 커밋되지 않음 → 배포는 `/ship` 필요(신규 3파일 + help-texts + 2페이지 연결).
- 다음: `/pdca archive income-account-balance-guard` 또는 `/ship`.

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-06-17 | Claude | 완료 리포트 (Match ~98%, /verify 실데이터 런타임 확인, 예방-교정 짝) |
