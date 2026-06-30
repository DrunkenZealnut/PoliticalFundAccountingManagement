---
template: plan
version: 1.2
feature: year-separation-p2
date: 2026-06-30
author: DrunkenZealnut
project: 정치자금 회계관리 시스템
version_project: 0.27.0.0
---

# year-separation-p2 Planning Document

> **Summary**: 연도(선거주기) 분리의 운영 단계(P2) — 사용기관 선택 UI에 주기 배지·필터, 옛 주기 읽기전용 잠금, export·결산에 주기 외 거래 경고를 추가해 실수 자체를 줄인다.
>
> **Project**: 정치자금 회계관리 시스템
> **Version**: 0.27.0.0
> **Author**: DrunkenZealnut
> **Date**: 2026-06-30
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | year-data-separation(v0.27.0.0)으로 입력 시점 거래일 가드는 생겼지만, 사용기관 선택 화면에 **주기 구분이 안 보이고** 옛 주기(2022) 기관도 자유롭게 열려 실수로 진입·입력할 여지가 남아있다. export·결산도 주기 혼입을 경고하지 않는다. |
| **Solution** | 사용기관 선택/전환 UI에 **선거주기 배지 + 현 주기 필터**, 옛 주기 기관 **읽기전용 잠금**, export·결산·보고서 화면에 **주기 외 거래 경고**(상시 스캔 로직 재사용). |
| **Function/UX Effect** | 현 주기 기관만 기본 노출·편집 가능, 옛 주기는 보기 전용으로 명확히 구분 → 잘못된 기관 진입·입력·산출이 화면 단계에서 차단·경고된다. |
| **Core Value** | 입력 가드(P1)에 더해 **운영·UI 차원의 주기 격리** 완성. 연도 혼입을 "막기 전에 안 하게" 만든다. |

---

## 1. Overview

### 1.1 Purpose

연도(선거주기) 격리를 입력 가드(P1)에서 **UI·운영 단계**로 확장 — 주기 가시화·옛 주기 잠금·산출물 경고.

### 1.2 Background

- 선행: [[year-data-separation]](v0.27.0.0) — `acc-period.ts` 거래일 검증, `acc-book` API/클라 가드, `organ.election_cycle`(`scripts/021`), 혼입 스캔. P0(혼입 정리)·P1(입력 가드) 완료.
- 잔여(원 플랜 P2): FR-05(주기 배지·필터)/FR-06(옛 주기 잠금)/FR-07(export·결산 경고).
- 현 데이터: org 9='2022', org 10·11='2026'. auth store(`stores/auth.ts`)는 이미 `accFrom`/`accTo` 보유 → 주기는 `accFrom` 연도로 파생 가능(`election_cycle` 컬럼 적용 전에도 동작).
- 관련 발견: 지출(expense) 페이지는 acc_book을 API 우회 직접쓰기([[expense-page-bypasses-accbook-api]]) — 잠금(FR-06)은 expense 직접쓰기 경로도 함께 막아야 함.

### 1.3 Related Documents

- 선행 플랜/설계: `docs/01-plan/features/year-data-separation.plan.md`, `docs/02-design/.../year-data-separation.design.md`
- 코드: `app/src/app/page.tsx`(사용기관 선택), `app/src/stores/auth.ts`(org 상태·accFrom/accTo), `lib/accounting/acc-period.ts`(`electionCycleOf`/`isAccDateInOrgPeriod`), 입력 4페이지(income·expense·document-register·batch-import), export-sqlite·결산·reports 화면

---

## 2. Scope

### 2.1 In Scope

- [ ] FR-05: 사용기관 선택/전환 UI에 **선거주기 배지**(예: `[2026]`) + **현 주기 필터**(기본 현 주기만, 옛 주기 접기/토글)
- [ ] FR-06: **옛 주기 기관 읽기전용 잠금** — 입력 4페이지에서 입력/수정 비활성 + 배너. expense 직접쓰기 경로 포함
- [ ] FR-07: export(자료백업)·결산·보고서 화면에서 선택 org에 **주기 외 거래 감지 시 경고**(`isAccDateInOrgPeriod` 재사용)
- [ ] "현 주기" 판정 규칙 확정(설계) — 후보: ① 사용자 orgs 중 최신 `election_cycle` ② 회계기간(acc_to) 미종료 ③ 수동 활성주기 설정

### 2.2 Out of Scope

- expense를 API 경유로 통일하는 리팩터(별도 PDCA — FR-06 잠금은 expense 경로에도 가드만 추가)
- 다선거(국회/대선) 일반 주기 관리 — 지방선거 2022/2026에 집중, 확장 가능 설계
- 거래 자동 재분류(P0에서 정리 완료, 혼입 0)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-05 | 사용기관 선택/전환 UI 주기 배지 + 현 주기 필터(옛 주기 접기) | High | Pending |
| FR-06 | 옛 주기 org 읽기전용 잠금(입력 4페이지 + expense 직접쓰기 경로) + 배너 | High | Pending |
| FR-07 | export·결산·보고서에 선택 org 주기 외 거래 경고 | Medium | Pending |
| FR-08 | "현 주기" 판정 헬퍼(순수) + 옛 주기 판정 — `lib/accounting/acc-period.ts` 확장 또는 신규 | High | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement |
|----------|----------|-------------|
| 일관성 | 주기 파생/판정은 단일 SSOT(acc-period) | 단위테스트 |
| 호환성 | election_cycle 컬럼 미적용 시 accFrom 연도 fallback 동작 | 테스트 |
| 안전성 | 잠금은 화면+직접쓰기 양쪽(특히 expense) | 검증 |
| 회귀 | 기존 입력·export·결산 무변경 | vitest |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] FR-05~08 구현, "현 주기" 규칙 확정
- [ ] 옛 주기 org에서 입력 4페이지 입력/수정 차단(배너) — expense 포함
- [ ] 주기 판정 순수함수 단위테스트
- [ ] 기존 스위트 회귀 0, eslint 0

### 4.2 Quality Criteria

- [ ] 주기 배지·필터·잠금이 election_cycle 미적용 환경에서도 동작(accFrom fallback)

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| "현 주기" 판정이 과·소 잠금(예: acc_to 종료로 현 주기도 잠김) | Med | Med | 설계서서 규칙 확정 — 최신 election_cycle 기준 권장(acc_to 종료 무관) |
| expense 직접쓰기 잠금 누락 | Med | Med | expense 저장 핸들러에 잠금 가드 명시(메모리 경고 반영) |
| 옛 주기 잠금이 정당한 정정(감사기간 수정)을 막음 | Med | Low | 잠금에 "해제 토글"(명시 확인) 제공 검토 |

---

## 6. Architecture Considerations

### 6.1 Project Level

Dynamic(기존). 신규 인프라 없음 — 주기 판정 순수함수 + UI(선택/입력 화면) + auth store.

### 6.2 Key Decisions (설계 단계)

| Decision | Options | Lean | Rationale |
|----------|---------|------|-----------|
| 현 주기 판정 | 최신 cycle / acc_to 미종료 / 수동설정 | 최신 election_cycle | 선거 종료 후 감사기간에도 현 주기 편집 가능 |
| 옛 주기 잠금 위치 | 입력 페이지별 / 공통 가드 훅 | 공통 훅(`useOrgCycleLock`) | DRY, expense 포함 |
| 주기 소스 | election_cycle 컬럼 / accFrom 파생 | accFrom 파생 + 컬럼 우선 | 마이그 선후 무관 |
| 배지/필터 위치 | app/page.tsx 선택목록 | 동일 | 사용기관 선택 SSOT |

---

## 7. Convention Prerequisites

- [x] 주기 SSOT = `lib/accounting/acc-period.ts`(`electionCycleOf` 등) 재사용
- [x] auth store가 accFrom/accTo 보유 — 주기 파생 가능
- [x] expense 직접쓰기 주의([[expense-page-bypasses-accbook-api]])
- 신규 마이그 불필요(election_cycle은 021에서 도입됨; 미적용 시 fallback)

---

## 8. Next Steps

1. [ ] 설계 문서 (`/pdca design year-separation-p2`) — 현 주기 규칙·잠금 훅·배지/필터·경고 위치 확정
2. [ ] FR-08(주기 판정 헬퍼) → FR-05(배지/필터) → FR-06(잠금) → FR-07(경고) 순 구현 → `/ship`
3. [ ] (별도) expense API 통일 리팩터 검토

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-30 | Initial draft (P2 운영/UI 단계) | DrunkenZealnut |
