---
template: design
version: 1.2
feature: year-separation-p2
date: 2026-06-30
author: DrunkenZealnut
project: 정치자금 회계관리 시스템
version_project: 0.27.0.0
---

# year-separation-p2 Design Document

> **Summary**: 선거주기 판정 순수 헬퍼를 SSOT로, 사용기관 선택/전환 UI에 주기 배지·필터, 옛 주기 org 읽기전용 잠금(공통 훅, expense 포함), export·결산 주기 외 거래 경고를 더한다.
>
> **Project**: 정치자금 회계관리 시스템
> **Version**: 0.27.0.0
> **Author**: DrunkenZealnut
> **Date**: 2026-06-30
> **Status**: Draft
> **Planning Doc**: [year-separation-p2.plan.md](../../01-plan/features/year-separation-p2.plan.md)

---

## 1. Overview

### 1.1 Design Goals

- **주기 가시화**: 사용기관 선택/전환 목록에 `[2026]` 배지 + "현 주기만" 필터.
- **옛 주기 잠금**: 옛 주기(예: 2022) org는 입력/수정 불가(배너) — 입력 4페이지 + expense 직접쓰기.
- **산출물 경고**: export·결산·보고서에서 선택 org의 주기 외 거래 감지 시 배너.
- **SSOT**: 주기 판정은 `lib/accounting/acc-period.ts` 한 곳.
- **회귀 0**: 기존 입력·export·결산 무변경.

### 1.2 Design Principles

- 주기 파생/판정 순수함수 → UI는 그 위에 얇게.
- election_cycle 컬럼 우선, 없으면 `acc_from` 연도 fallback(마이그 021 선후 무관).
- 잠금은 **공통 훅 1개**로 — 페이지별 분기 금지(expense 누락 방지).

---

## 2. Architecture

### 2.1 데이터 흐름 (주기 판정·잠금)

```
[org 쿼리] user_organ → organ(org_id,org_sec_cd,org_name, election_cycle, acc_from, acc_to)
        │  (select-organ/page.tsx · dashboard/layout.tsx · page.tsx — election_cycle/acc_from 추가)
        ▼
[auth store] setOrgan에 electionCycle/accFrom/accTo 저장
        │
[acc-period] currentCycleOf(orgs) = max(cycle);  isOldCycle(orgCycle, currentCycle)
        ▼
FR-05 배지/필터 (선택 목록)   FR-06 useOrgCycleLock()→입력페이지 disable+배너   FR-07 export/결산 경고
```

### 2.2 Components

| Component | Layer | 책임 |
|-----------|-------|------|
| `lib/accounting/acc-period.ts` (확장) | Domain(순수) | `electionCycleOf`(기존) + `currentCycleOf`/`isOldCycle` |
| `hooks/use-org-cycle-lock.ts` (신규) | App | 현 org의 주기·잠금 여부(store + 사용자 orgs 기준) |
| `stores/auth.ts` (확장) | App | `electionCycle` 상태 + setOrgan에 반영 |
| `app/select-organ/page.tsx` | Presentation | 주기 배지 + 현 주기 필터 |
| `app/dashboard/layout.tsx` | Presentation | 헤더 org 전환에 배지(+옛주기 표식) |
| 입력 4페이지(income·expense·document-register·batch-import) | Presentation | useOrgCycleLock → 잠금 배너 + 저장 비활성 |
| export-sqlite/결산/reports 화면 | Presentation | 주기 외 거래 경고 배너 |

---

## 3. Data Model

### 3.1 주기 판정 순수 헬퍼 (acc-period.ts 확장)

```typescript
/** 사용자 orgs의 주기 목록에서 "현 주기"(최신) — 선거 종료 후 감사기간에도 현 주기 편집 가능. */
export function currentCycleOf(cycles: (string | null | undefined)[]): string | null; // max('2022','2026')→'2026'
/** org가 옛 주기인지 = orgCycle < currentCycle (둘 다 있을 때만 true). */
export function isOldCycle(orgCycle: string | null | undefined, currentCycle: string | null | undefined): boolean;
// electionCycleOf({acc_from})는 기존(P1) — election_cycle 컬럼 없을 때 fallback로 재사용
```

### 3.2 org 쿼리에 주기 필드 추가 (런타임 의존 회피)

현재 `user_organ.select("org_id,is_default,organ(org_id,org_sec_cd,org_name)")` 등은 `election_cycle`/`acc_from` 미포함 → store `accFrom`이 null이라 주기 파생 불가. **select에 `election_cycle, acc_from`을 추가**한다.
- **방어**: `election_cycle` 컬럼이 마이그 021 미적용이면 select 에러 → `election_cycle`은 빼고 `acc_from`만 select하거나, 코드에서 `acc_from` 연도 파생만 사용. **1차는 `acc_from`만 추가**(컬럼 의존 0), election_cycle은 적용 확인 후 도입.

### 3.3 auth store

```typescript
interface AuthState { ...; electionCycle: string | null; }
// setOrgan(organ: {...; acc_from?; election_cycle?}) → electionCycle = organ.election_cycle ?? electionCycleOf({acc_from}) ?? null
```

---

## 4. API / Hook Spec

### 4.1 useOrgCycleLock (신규 훅)

```typescript
// 현재 선택 org가 옛 주기인지. 사용자 orgs 전체를 1회 조회(또는 캐시)해 currentCycle 산출.
export function useOrgCycleLock(): {
  cycle: string | null;        // 현 org 주기
  currentCycle: string | null; // 사용자 orgs 최신 주기
  locked: boolean;             // isOldCycle(cycle, currentCycle)
  overrideUnlock: () => void;  // 명시 해제(감사 정정용) — 세션 한정
};
```
- 입력 4페이지: `const { locked } = useOrgCycleLock();` → locked면 저장 버튼 disable + 상단 배너("옛 선거주기(2022) 기관 — 읽기전용. 정정 필요 시 잠금해제"). **expense 저장 핸들러도 `if (locked && !unlocked) return;`** (직접쓰기 경로 가드).

### 4.2 FR-07 경고 (export/결산/보고서)

선택 org의 주기 외 거래 수를 조회(가벼운 count 또는 기존 스캔 로직 재사용 `isAccDateInOrgPeriod`) → >0이면 배너("이 기관에 회계기간 밖 거래 N건 — 연도 혼입 점검 필요"). 차단 아님(경고).

---

## 5. UI/UX

- **select-organ 목록 행**: `오준석후원회 [2026]` / `2022 오준석후보 [2022·종료]`(회색). 상단 토글 "현 주기만 보기"(기본 ON) → 옛 주기 접기.
- **dashboard 헤더 전환**: 현 org 옆 주기 배지. 옛 주기면 자물쇠 아이콘 + "읽기전용".
- **입력 페이지 배너**(옛 주기): 노랑 배너 + 저장/수정 비활성. "[잠금해제]"(명시 확인) 시 한시 편집.
- **export/결산 배너**(주기 외 거래): 주황 경고 + 점검 안내.

---

## 6. Error Handling

| 상황 | 처리 |
|------|------|
| election_cycle 컬럼 미존재(021 미적용) | select에서 제외, `acc_from` 연도 파생 fallback |
| org 주기 판정 불가(acc_from null) | 잠금 안 함(보수적 — 막지 않음), 배지 미표시 |
| 사용자 orgs 1개뿐 | currentCycle=그 org → 잠금 없음 |

---

## 7. Security

- [ ] 잠금은 UX 가드(편의). 데이터 무결성의 1차 방어는 P1 서버 검증(거래일↔회계기간)이 담당 — 잠금 해제해도 서버 가드는 유지.
- [ ] overrideUnlock은 세션 한정(persist 안 함).

---

## 8. Test Plan

| Type | Target | Tool |
|------|--------|------|
| Unit | `currentCycleOf`/`isOldCycle`/`electionCycleOf` | Vitest |
| Unit | useOrgCycleLock 로직(현 org vs orgs 최신) | Vitest(store mock) |
| 회귀 | 기존 입력·export·결산·auth store | Vitest |

**Key cases**: orgs=['2022','2026'] → current '2026', org '2022' locked / org '2026' unlocked; orgs 1개 → 잠금 없음; acc_from null → 잠금 안 함; election_cycle 미적용 → acc_from 파생.

---

## 9. Clean Architecture (Layer)

| Component | Layer | Location |
|-----------|-------|----------|
| currentCycleOf/isOldCycle/electionCycleOf | Domain(순수) | `lib/accounting/acc-period.ts` |
| useOrgCycleLock | App | `hooks/use-org-cycle-lock.ts` |
| 주기 상태 | App | `stores/auth.ts` |
| 배지·필터·잠금 배너·경고 | Presentation | select-organ·layout·입력4·export/결산 |

---

## 10. Coding Convention

- 주기 판정 SSOT = acc-period(P1과 동일 모듈). UI는 훅/store 경유.
- org 쿼리 변경 시 select-organ·page.tsx·layout·organ 페이지·use-hwpx-prefill 등 `setOrgan` 호출처 일관(필드 추가).
- election_cycle 런타임 의존 금지(미적용 환경 fallback). 릴리스 `app/VERSION` MINOR.

---

## 11. Implementation Guide

### 11.1 변경/신규 파일

```
app/src/lib/accounting/acc-period.ts            # currentCycleOf/isOldCycle
app/src/lib/accounting/acc-period.test.ts        # +케이스
app/src/hooks/use-org-cycle-lock.ts              # (신규)
app/src/stores/auth.ts                           # electionCycle 상태
app/src/app/select-organ/page.tsx                # 배지+필터 + 쿼리 acc_from 추가
app/src/app/dashboard/layout.tsx                 # 헤더 배지/잠금 표식
app/src/app/dashboard/{income,expense,document-register,batch-import}/page.tsx  # 잠금 배너+비활성
app/src/app/dashboard/{backup,settlement,reports}/...  # FR-07 경고(선택 org 주기외 거래)
```

### 11.2 Implementation Order

1. [ ] acc-period: `currentCycleOf`/`isOldCycle` + 테스트
2. [ ] org 쿼리에 `acc_from` 추가 + store `electionCycle`(파생) 반영
3. [ ] `useOrgCycleLock` + 테스트
4. [ ] FR-05 select-organ 배지/필터 (+ layout 헤더 표식)
5. [ ] FR-06 입력 4페이지 잠금(배너+비활성) — expense 저장 핸들러 포함
6. [ ] FR-07 export/결산 경고
7. [ ] 회귀+lint → `/ship`

### 11.3 Open Questions (Do 진입 전)

- "현 주기" = 최신 election_cycle(권장) 확정? acc_to 미종료 기준은 선거 종료 후 잠김 문제로 비권장.
- election_cycle 컬럼 도입 시점: 1차는 acc_from 파생만(컬럼 의존 0), 마이그 021 적용 확인 후 election_cycle 우선으로 전환.
- 잠금 해제(overrideUnlock) 제공 범위: 감사 정정 케이스만 — 기본 잠금 유지.

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-30 | Initial draft (select-organ·useOrgCycleLock·acc_from fallback 근거) | DrunkenZealnut |
