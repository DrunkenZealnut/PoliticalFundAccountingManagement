---
template: design
version: 1.2
feature: year-data-separation
date: 2026-06-30
author: DrunkenZealnut
project: 정치자금 회계관리 시스템
version_project: 0.26.0.0
---

# year-data-separation Design Document

> **Summary**: 거래일↔회계기간 검증(입력 가드) + `organ.election_cycle` 명시 컬럼 + candidate 페어 주기 일치 + 상시 스캔으로 선거주기(연도) 데이터를 코드로 격리한다.
>
> **Project**: 정치자금 회계관리 시스템
> **Version**: 0.26.0.0
> **Author**: DrunkenZealnut
> **Date**: 2026-06-30
> **Status**: Draft
> **Planning Doc**: [year-data-separation.plan.md](../../01-plan/features/year-data-separation.plan.md)

---

## 1. Overview

### 1.1 Design Goals

- **오연도 거래 입력 원천 차단**: 거래일이 org 회계기간 밖이면 차단(override 가능) → 이번 혼입(2022 org에 2026 거래) 재발 방지.
- **주기 명시화**: `organ.election_cycle`로 연도/주기를 데이터로 표현(이름 파싱 제거) → 필터·집계·잠금 기반.
- **교차주기 연결 차단**: candidate 페어가 다른 주기 후보자를 가리키지 못하게.
- **상시 감시**: 혼입 스캔 스크립트 상설화.
- **회귀 0**: 기존 export/결산/import/입력 경로 무변경 동작.

### 1.2 Design Principles

- 검증은 **순수 함수 + API 단일 지점**(acc-book POST). 흩뿌리지 않는다.
- 마이그레이션은 **additive·reversible**(단일 Supabase, 무중단). 수동 적용(`scripts/0NN_*.sql`).
- 1차는 **가드+가시화**(검증·컬럼·스캔), candidate FK 전환·UI 잠금은 점진.
- 차단은 **override 제공**(정당한 경계거래 보호) — 철저함과 유연성 균형.

---

## 2. Architecture

### 2.1 Data Flow (거래 입력 검증)

```
[입력화면/위저드] acc-book POST {action, data|rows}
        │
[route] org_id → organ(acc_from,acc_to,pre_acc_from) 조회
        │
   isAccDateInOrgPeriod(acc_date, period)  (순수)
        ├─ 기간 내 → 통과 → insert/update
        └─ 기간 밖 + allowOutOfPeriod≠true → 400 OUT_OF_PERIOD(상세)
                 → 화면 confirm → allowOutOfPeriod:true 재요청 → 통과
```

### 2.2 Components / Dependencies

| Component | Layer | 책임 |
|-----------|-------|------|
| `lib/accounting/acc-period.ts` (신규) | Domain(순수) | `isAccDateInOrgPeriod`, `orgValidRange`, election_cycle 파생 |
| `api/acc-book/route.ts` | API | insert/update/batch_insert에 검증 삽입 + override 처리 |
| `scripts/021_organ_election_cycle.sql` (신규) | Infra | `election_cycle` 컬럼 + 백필 |
| `scripts/scan-year-contamination.mjs` (신규) | Tooling | 상시 혼입 스캔 |
| `lib/accounting/organ-pair.ts` | Domain | candidate 페어 cycle 일치(2차 candidate_org_id) |
| org 전환/목록 UI(P2) | Presentation | 주기 배지·필터·잠금 |

---

## 3. Data Model

### 3.1 organ.election_cycle (마이그레이션 021)

```sql
-- scripts/021_organ_election_cycle.sql  (Supabase SQL editor에서 수동 적용)
ALTER TABLE pfam.organ ADD COLUMN election_cycle TEXT;  -- 예: '2022', '2026'
-- 백필: 회계기간(acc_from) 연도 기준
UPDATE pfam.organ SET election_cycle = substr(acc_from, 1, 4) WHERE election_cycle IS NULL AND acc_from IS NOT NULL;
-- 현 데이터 명시 확인: org 9→'2022', org 10·11→'2026'
-- ROLLBACK: ALTER TABLE pfam.organ DROP COLUMN election_cycle;
```
- 신규 컬럼 nullable·default 없음 → 기존 코드 무영향(additive). `types/database.ts` organ Row/Insert에 `election_cycle: string | null` 추가.

### 3.2 candidate_org_id (2차, 마이그레이션 022 예정)

```sql
-- ALTER TABLE pfam.organ ADD COLUMN candidate_org_id INTEGER REFERENCES pfam.organ(org_id);
```
- 후원회 org이 **실제 후보자 org**를 참조(같은 election_cycle만 유효). export(master/data1)가 free-form `candidate_*` 대신 이 org을 우선 사용. 1차 범위에서는 **검증만**(아래 FR-03 1차안).

### 3.3 검증 순수 함수

```typescript
// lib/accounting/acc-period.ts
export interface OrgPeriod { acc_from?: string|null; acc_to?: string|null; pre_acc_from?: string|null }
export interface PeriodCheck { ok: boolean; reason?: "before"|"after"|"no_period"; lo?: string; hi?: string }

/** 거래일이 org 유효기간[pre_acc_from(or acc_from) ~ acc_to] 내인지. YYYYMMDD 문자열 비교. */
export function isAccDateInOrgPeriod(accDate: string, p: OrgPeriod): PeriodCheck;
export function electionCycleOf(p: OrgPeriod): string | null; // substr(acc_from,1,4) 파생(컬럼 없을 때 fallback)
```

---

## 4. API Specification

### 4.1 acc-book POST 검증 통합

공통: `org_id`로 organ 조회(acc_from/acc_to/pre_acc_from) → `isAccDateInOrgPeriod`.

| action | 검증 시점 | 동작 |
|--------|----------|------|
| `insert` | `data.acc_date` 존재 시 | 기간 밖 + `data._allowOutOfPeriod≠true` → 400 OUT_OF_PERIOD |
| `update` | `data.acc_date` 변경 시(없으면 기존 행 org_id 조회) | 동일 |
| `batch_insert` | 각 row(이미 organ 로드 중 — select에 acc_from/acc_to 추가) | 위반 row 목록 반환, 전체 차단 unless `payload.allowOutOfPeriod` |

**OUT_OF_PERIOD 응답(400)**:
```json
{ "error": { "code": "OUT_OF_PERIOD",
  "message": "거래일 20260602가 사용기관 회계기간(20210101~20220621) 밖입니다.",
  "org_id": 9, "acc_date": "20260602", "range": ["20210101","20220621"],
  "rows": [/* batch_insert: 위반 행 인덱스·날짜 */] } }
```
- 클라이언트(입력화면/위저드)는 이 코드를 잡아 "회계기간 밖 거래입니다. 그래도 저장?" confirm → `_allowOutOfPeriod:true`(또는 batch `allowOutOfPeriod:true`)로 재전송.
- override는 **명시적 사용자 확인 시에만** — 기본은 차단(이번 혼입 같은 무의식 입력 방지).

### 4.2 FR-03 candidate cycle 검증 (1차)

`export-sqlite`에서 후원회 export 시: `electionCycleOf(supporter)` 와 candidate_* 가 가리키는 후보자(있으면 candidate_org_id, 없으면 candidate_reg_num/userid로 매칭되는 org)의 cycle 비교. 불일치 시 **경고 로그 + 응답 헤더/필드 경고**(차단은 2차 candidate_org_id 도입 후).

---

## 5. UI/UX (P2 — 후속)

- org 전환 드롭다운/목록: **`[2026]` 주기 배지** + "현 주기만 보기" 필터(기본 현 주기, 옛 주기 접기).
- 옛 주기 org 진입 시 **읽기전용 배너**(입력/수정 비활성) — `election_cycle` ≠ 현 활성 주기 or `locked` 플래그.
- export·결산·보고서 화면: 선택 org에 주기 외 거래 감지 시 **경고 배너 + 스캔 결과 링크**.

---

## 6. Error Handling

| Code | 상황 | 처리 |
|------|------|------|
| `OUT_OF_PERIOD` (400) | 거래일이 org 회계기간 밖 | 화면 confirm → override 재전송 |
| `ORG_PERIOD_MISSING` | org에 acc_from/acc_to 없음 | 검증 skip(경고 로그) — 차단 안 함 |
| `CYCLE_MISMATCH` (경고) | candidate 페어 주기 불일치(export) | 경고 표기(1차), 차단(2차) |

---

## 7. Security Considerations

- [ ] 검증은 서버(acc-book route)에서 — 클라 우회 불가. override도 서버가 명시 플래그로만 허용.
- [ ] 마이그레이션 additive·롤백 SQL 포함. 단일 Supabase 운영 직접 영향 → 적용 전 백필 SELECT 확인.
- [ ] election_cycle/candidate_org_id 입력값 검증(인젝션·FK).

---

## 8. Test Plan

| Type | Target | Tool |
|------|--------|------|
| Unit | `isAccDateInOrgPeriod`(기간 내/밖/경계/period 없음), `electionCycleOf` | Vitest |
| Unit/Integration | acc-book insert/update/batch_insert 검증(차단·override·정상) | Vitest(supabase mock) |
| Tooling | scan-year-contamination: 혼입 픽스처 검출 | 수동/CI |
| 회귀 | 기존 acc-book·export·결산 스위트 | Vitest |

**Key cases**: 20260602 in org(2022기간) → OUT_OF_PERIOD; `_allowOutOfPeriod` → 통과; 경계일(=acc_to) → 통과; pre_acc 기간 내 이월거래 → 통과; period 없는 org → skip; batch 중 일부 위반 → 전체 차단+위반목록.

---

## 9. Clean Architecture (Layer)

| Component | Layer | Location |
|-----------|-------|----------|
| isAccDateInOrgPeriod, electionCycleOf | Domain(순수) | `lib/accounting/acc-period.ts` |
| acc-book 검증 통합 | API/Infra | `app/api/acc-book/route.ts` |
| 마이그레이션·스캔 | Infra/Tooling | `scripts/021_*.sql`, `scripts/scan-year-contamination.mjs` |
| 주기 배지·필터·잠금 | Presentation | org 전환/목록 컴포넌트, `stores/auth.ts` |

---

## 10. Coding Convention

- 날짜는 YYYYMMDD 문자열 비교(프로젝트 SSOT). 검증 순수함수도 문자열.
- 마이그레이션 수동 적용·번호 순차(최신 020 → **021**). CLAUDE.md "Latest is 019"는 stale → 020(감사의견서) 반영해 갱신.
- acc-book은 action dispatch — 검증은 insert/update/batch_insert 공통 지점에 1회, 헬퍼 재사용.
- 릴리스: `app/VERSION` MINOR bump(검증·컬럼 = feature).

---

## 11. Implementation Guide

### 11.1 변경/신규 파일

```
app/scripts/021_organ_election_cycle.sql        # (신규, 수동 적용)
app/scripts/scan-year-contamination.mjs          # (신규) 상시 스캔
app/src/lib/accounting/acc-period.ts             # (신규) 검증 순수함수
app/src/lib/accounting/acc-period.test.ts        # (신규)
app/src/app/api/acc-book/route.ts                # insert/update/batch_insert 검증 통합
app/src/types/database.ts                        # organ.election_cycle 타입
app/src/app/api/acc-book/*.test.ts               # 검증 통합 테스트
# (2차) organ-pair.ts candidate_org_id, export cycle 검증, UI 배지/필터/잠금
```

### 11.2 Implementation Order (1차)

1. [ ] `acc-period.ts` 순수함수 + 테스트
2. [ ] `scan-year-contamination.mjs` 정식화(혼입 0 재확인)
3. [ ] 마이그레이션 021 작성(적용은 사용자가 Supabase에서) + types 갱신
4. [ ] acc-book insert/update/batch_insert 검증 통합 + override + 테스트
5. [ ] 입력화면/위저드: OUT_OF_PERIOD confirm 처리
6. [ ] 회귀+lint → `/ship`
7. [ ] (2차) candidate cycle 검증/FK, UI 주기 배지·필터·잠금, export/결산 경고

### 11.3 Open Questions (Do 진입 전)

- 차단 vs 경고 기본값: 본 설계는 **차단+override**(철저 분리 우선). 사용자 워크플로상 과도하면 "경고만"으로 완화 가능.
- election_cycle 형식: `'2026'`(연도) vs `'제9회지방선거'`(주기명) — 연도 권장(단순·정렬).
- candidate cycle 검증 1차 범위: 경고만 vs candidate_org_id까지 — 1차는 경고, 2차 FK.

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-30 | Initial draft (acc-book 검증지점·021 마이그레이션 근거) | DrunkenZealnut |
