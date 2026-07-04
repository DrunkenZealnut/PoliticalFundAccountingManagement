# 선거주기(연도) UI 분리 (year-separation-p2) 완료 보고서

> **Summary**: 연도(선거주기) 분리의 운영·UI 단계. 입력 시점 서버 가드(P1, v0.27.0.0)에 더해, 사용기관 선택 화면에 **주기 배지·현 주기 필터**, 옛 주기 기관 **읽기전용 잠금**(공통 훅 + 배너, expense 직접쓰기 포함)을 추가해 잘못된 기관 진입·입력을 화면 단계에서 차단한다. 핵심은 **주기 판정 SSOT 확장**(`acc-period.ts`의 `currentCycleOf`/`isOldCycle`)과 **자기완결형 잠금 훅**(`useOrgCycleLock` — 진입 경로 무관 동작).
>
> **Project**: PoliticalFundAccountingManagement
> **Version**: 0.27.0.0 → 0.28.0.0
> **Feature Duration**: 2026-06-30 (Plan → Design → Do → Ship 동일 세션)
> **Author**: Claude · **Status**: ✅ Completed & Merged (PR #111, squash → main `eed92f8`)

---

## Executive Summary

### 1.3 Value Delivered

| Perspective | Content |
|---|---|
| **Problem** | P1(v0.27.0.0)으로 입력 시점 거래일 가드는 생겼지만, 사용기관 선택 화면에 **주기 구분이 안 보이고** 옛 주기(2022) 기관도 자유롭게 열려 실수로 진입·입력할 여지가 남았다. 한 사용자가 2022·2026 기관을 함께 쓰는 환경에서 "어느 주기 기관인지"가 화면에 없었다. |
| **Solution** | 주기 판정 순수함수를 SSOT(`acc-period.ts`)로 확장(`currentCycleOf`=사용자 기관 중 최신, `isOldCycle`=그보다 과거). 자기완결형 훅 `useOrgCycleLock`(user_organ.acc_from 직접 조회)로 옛 주기 org를 입력 4페이지에서 읽기전용 잠금 + 배너, `select-organ` 주기 배지·현 주기 필터, layout 사이드바 자물쇠. **데이터 무결성 1차 방어는 P1 서버검증이 유지**되고, 본 잠금은 그 위의 UX 가드다. |
| **Function/UX Effect** | 현 주기 기관만 기본 노출·편집 가능, 옛 주기는 보기 전용으로 명확히 구분 → 잘못된 기관 진입·입력이 화면 단계에서 차단·경고된다. 입력 4페이지(수입·지출·문서등록·일괄등록) 저장 핸들러가 잠금 시 차단([잠금 해제]로 감사 정정 가능). 검증: **874/874 테스트 통과**, ESLint 0, tsc 0, Vercel 프리뷰 빌드 PASS. |
| **Core Value** | 입력 가드(P1)에 더해 **운영·UI 차원의 주기 격리** 완성. 연도 혼입을 "막기 전에 안 하게" 만든다. election_cycle 컬럼 미적용 환경에서도 `acc_from` 파생으로 동작(마이그 선후 무관). |

---

## 1. PDCA 사이클 요약

### 1.1 Plan (계획)
- **계획 문서**: `docs/01-plan/features/year-separation-p2.plan.md`
- **목표**: 연도 격리를 입력 가드(P1)에서 UI·운영 단계로 확장 — 주기 가시화·옛 주기 잠금·산출물 경고.
- **In Scope**: FR-05(배지·필터) / FR-06(옛 주기 잠금, expense 포함) / FR-07(export·결산 경고) / FR-08(주기 판정 헬퍼).
- **현 데이터**: org 9='2022', org 10·11='2026'. auth store가 이미 `accFrom`/`accTo` 보유 → election_cycle 컬럼 적용 전에도 주기 파생 가능.

### 1.2 Design (설계)
- **설계 문서**: `docs/02-design/features/year-separation-p2.design.md`
- **핵심 설계 결정**:
  1. **현 주기 판정** = 사용자 기관 중 최신 주기(최신 election_cycle/acc_from 연도) — 선거 종료 후 감사기간에도 현 주기 편집 가능(acc_to 종료 무관).
  2. **잠금 위치** = 페이지별 분기 대신 **공통 훅 1개**(`useOrgCycleLock`) — DRY, expense 누락 방지.
  3. **주기 소스** = `acc_from` 파생 + 컬럼 우선(election_cycle) — 마이그 021 선후 무관.
  4. **배지/필터 위치** = `select-organ` 선택 목록(사용기관 선택 SSOT).

### 1.3 Do (구현)
- **신설 파일 2개**:
  - `src/hooks/use-org-cycle-lock.ts` — `useOrgCycleLock`(자기완결형: user_organ 조회 → 현 주기 산출 → 현 org 옛 주기 여부; 잠금해제는 `unlockedFor=orgId` 파생).
  - `src/components/dashboard/OrgCycleLockBanner.tsx` — locked 시 amber 배너 + [잠금 해제].
- **수정 파일(주요)**:
  - `src/lib/accounting/acc-period.ts` — `currentCycleOf`/`isOldCycle` 추가(순수, 4자리 연도 사전식).
  - `src/lib/accounting/acc-period.test.ts` — 신규 함수 7케이스 추가(총 20 통과).
  - `src/app/select-organ/page.tsx` — 주기 배지(옛 amber·현 emerald) + 현 주기 필터·토글.
  - `src/app/dashboard/layout.tsx` — 사이드바 옛 주기 자물쇠 표식.
  - `src/app/dashboard/{income,expense,document-register,batch-import}/page.tsx` — 저장 핸들러 잠금 가드 + 배너.
- **구현 중 이슈/해소**: 훅 초안이 effect 내 동기 `setState`로 React 19 규칙(`react-hooks/set-state-in-effect`) 2건 위반 → 첫 effect(잠금해제 리셋)를 `unlockedFor=orgId` 파생으로 제거, guard의 setState를 async 안으로 이동해 해소.

### 1.4 Check (검증)
- 본 사이클은 별도 `analyze`(gap-detector Match Rate) 대신 **/ship 파이프라인 검증**으로 대체:
  - Vitest **74 파일 / 874 테스트 전부 통과**(신규 순수함수는 acc-period.test.ts 7케이스로 직접 커버).
  - ESLint 0(touched files), `tsc --noEmit` 0(touched files).
  - Pre-landing 직접 정독 리뷰 + 적대적 자가 점검: 차단 이슈 0. 정보성 1건(아래 §4).
  - Vercel 프리뷰 빌드(게이트) PASS, GitGuardian PASS, CodeRabbit PASS.
- **자체 평가 Match Rate**: 구현 스코프(FR-05/06/08) **100% 달성**. 전체 플랜 대비 3/4(FR-07 의도적 보류).

### 1.5 Act (개선)
- 구현 스코프 내 갭 없음(반복 불필요). 잔여 FR-07은 별도 후속(p3)으로 분리 — §5 참조.

---

## 2. 완료된 항목

### 2.1 Functional Requirements (FR)

| ID | 요구사항 | 구현 | 근거 |
|----|----------|:----:|------|
| FR-05 | 사용기관 선택 UI 주기 배지 + 현 주기 필터(옛 주기 토글) | ✅ | `select-organ/page.tsx`(배지·`visibleOrgans`·토글), `layout.tsx`(사이드바 자물쇠) |
| FR-06 | 옛 주기 org 읽기전용 잠금(입력 4페이지 + expense 직접쓰기) + 배너 | ✅ | `useOrgCycleLock` + `OrgCycleLockBanner` + 4페이지 저장 가드 |
| FR-07 | export·결산·보고서 주기 외 거래 경고 | ⏸ 보류 | Medium 우선순위 — 후속(p3) P1 TODO |
| FR-08 | "현 주기"/옛 주기 판정 순수 헬퍼(acc-period 확장) | ✅ | `currentCycleOf`/`isOldCycle` + 7케이스 테스트 |

### 2.2 Non-Functional

| 항목 | 기준 | 결과 |
|------|------|------|
| 일관성 | 주기 판정 단일 SSOT(acc-period) | ✅ 화면·훅 모두 동일 함수 경유 |
| 호환성 | election_cycle 미적용 시 acc_from 파생 동작 | ✅ 컬럼 의존 0 |
| 안전성 | 잠금이 화면+직접쓰기 양쪽(특히 expense) | ✅ expense 저장 핸들러 가드 포함 |
| 회귀 | 기존 입력·export·결산 무변경 | ✅ 874/874 통과 |

---

## 3. 아키텍처·핵심 결정

- **주기 판정 SSOT**: `lib/accounting/acc-period.ts` — P1의 `electionCycleOf`/`isAccDateInOrgPeriod`와 같은 모듈에 `currentCycleOf`/`isOldCycle` 추가. UI/훅은 그 위에 얇게.
- **자기완결형 훅**: `useOrgCycleLock`이 store.electionCycle에 의존하지 않고 user_organ을 직접 조회 → `select-organ`이 acc_from을 안 넣는 진입 경로에서도 일관 동작(불일치 버그 회피). 비용은 페이지당 user_organ 1회 추가 조회(작은 테이블, 무시 가능).
- **방어 심층화**: 잠금은 UX 가드. 데이터 무결성 1차 방어는 P1 서버검증(`acc-book` API `OUT_OF_PERIOD`) + expense 인라인 `isAccDateInOrgPeriod`가 계속 담당. 잠금 해제해도 서버 가드는 유지.
- **React 19 준수**: effect 내 동기 setState 금지 규칙을 파생 상태(`unlockedFor=orgId`)로 회피.

---

## 4. 알려진 한계 / 정보성

- **[INFO] user_organ 중복 조회**: `useOrgCycleLock`이 layout과 입력 페이지에서 각각 조회(페이지당 2회). `user_organ`은 행 1~3개라 무시 가능 — 향후 context/캐시로 단일화 여지.
- **잠금은 클라이언트 UX 가드**: 우회 가능성은 P1 서버검증이 차단. 잠금 단독으로 무결성을 보장하지 않음(설계 의도).

---

## 5. 후속 작업 (Next)

1. **FR-07 (p3 후속)**: export(자료백업)·결산·보고서 화면에 선택 org **주기 외 거래 경고 배너**(`isAccDateInOrgPeriod` 재사용). Medium 우선순위 P1 TODO로 이월.
2. **마이그 `scripts/021`**: `organ.election_cycle` Supabase 수동 적용. 본 기능은 `acc_from` 파생만 쓰므로 미적용이어도 동작 — 적용 후 election_cycle 우선으로 전환은 선택.
3. **(별도)** expense를 API 경유로 통일하는 리팩터(잠금/가드 분기 제거) — 별도 PDCA.

---

## 6. 산출물

| 구분 | 경로 |
|------|------|
| Plan | `docs/01-plan/features/year-separation-p2.plan.md` |
| Design | `docs/02-design/features/year-separation-p2.design.md` |
| Report | `docs/04-report/year-separation-p2.report.md` (본 문서) |
| PR | [#111](https://github.com/DrunkenZealnut/PoliticalFundAccountingManagement/pull/111) (MERGED, v0.28.0.0) |
| 메모리 | `[[year-separation-p2-ui-lock]]`, `[[expense-page-bypasses-accbook-api]]` |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-06-30 | 완료 보고서 (FR-05/06/08 구현, FR-07 보류, PR #111 머지) | Claude |
