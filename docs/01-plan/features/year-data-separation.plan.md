---
template: plan
version: 1.2
feature: year-data-separation
date: 2026-06-30
author: DrunkenZealnut
project: 정치자금 회계관리 시스템
version_project: 0.26.0.0
---

# year-data-separation Planning Document

> **Summary**: 2022/2026 등 선거주기(연도) 데이터를 org 단위 암묵 분리에서 → 명시적 주기 차원 + 입력 가드로 격리해 연도 혼입을 원천 차단한다.
>
> **Project**: 정치자금 회계관리 시스템
> **Version**: 0.26.0.0
> **Author**: DrunkenZealnut
> **Date**: 2026-06-30
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 연도/선거주기 분리가 `org_id` 단위로 **암묵적**(org 이름 접두사·회계기간 날짜)일 뿐이고, 거래일↔회계기간 검증·명시 주기 컬럼·교차주기 가드가 없어 이미 혼입이 발생했다(2022 org 9에 2026 거래 1건 혼입 — 정리 완료). 같은 인물의 2022/2026 org가 공존해 export·결산·윈도우 적재에서 혼동을 유발했다. |
| **Solution** | (P0) 혼입 데이터 정리·스캔 도구, (P1) `acc_book` 거래일↔회계기간 검증 + `organ.election_cycle` 명시 컬럼 + candidate 페어 주기 일치, (P2) UI 주기 배지/필터 + 옛 주기 읽기전용 잠금 + export/결산 주기 경고. |
| **Function/UX Effect** | 오연도 거래 입력 차단·경고, 주기별 명확한 구분/필터, 옛 주기 실수 입력 방지 → 결산·보고서·.db export가 항상 단일 주기로 정합. |
| **Core Value** | 선거주기별 회계 데이터의 **무결성·격리 보장**(혼입 0). 선관위 제출·윈도우 적재 시 주기 오염으로 인한 사고 재발 방지. |

---

## 1. Overview

### 1.1 Purpose

선거주기(연도) 단위 회계 데이터를 **명시적으로 격리**하고, 오연도 거래 입력·교차주기 메타데이터 연결을 코드로 차단한다.

### 1.2 Background (실데이터 진단, 2026-06-30)

- **현재 org 구성**: org 9 = "2022 오준석후보"(2022, 41건), org 10 = 후원회(2026, 83건), org 11 = 후보자(2026, 76건).
- **분리 방식**: 연도 명시 컬럼 없음. org 이름 접두사("2022"/"2026")와 `organ.acc_from/acc_to`(회계기간 날짜)로만 암묵 구분.
- **발견·정리된 혼입(P0 완료)**: org 9(2022)에 2026 후원금 1건(40만원, id=177)이 혼입 → 검증 부재로 입력됨. org 11에 정본(id=183) 존재 확인 후 **삭제 완료**. 현재 전 org 연도-혼입 0건.
- **교차주기 메타데이터 버그(별건 교정 완료)**: 2026 후원회의 `candidate_*`가 2022 후보자(ohjunsuk)를 가리켜 master export 오염 → ojs2026로 교정([[candidate-dual-identity-master-pairing]]).
- **구조적 약점**: `acc_book` insert에 거래일↔회계기간 검증 없음 / candidate 페어가 free-form `candidate_*`(org FK 아님) / org 전환·목록에 주기 표식·필터 없음.
- **강점(살릴 것)**: 데이터는 이미 `org_id` 격리(customer org-스코프 `scripts/011`, acc_book·결산 org별). → **전면 재설계 불요, "주기 차원 명시 + 가드 추가"로 충분**.

### 1.3 Related Documents

- 메모리: [[candidate-dual-identity-master-pairing]], [[windows-load-needs-master-trio]], [[windows-restore-inserts-by-org-id]]
- 코드: `app/src/app/api/acc-book/route.ts`(거래 insert), `app/src/types/database.ts`(organ), `app/src/lib/accounting/organ-pair.ts`(candidate 페어), `app/src/stores/auth.ts`(org 선택), `app/scripts/0NN_*.sql`(마이그레이션, 최신 019)

---

## 2. Scope

### 2.1 In Scope

- [x] **(P0 완료)** 혼입 거래(org 9 id=177) 삭제 + 전 org 연도-혼입 스캔
- [ ] (P0) 연도-혼입 스캔을 **정식 스크립트**로 추가(정기 점검)
- [ ] (P1) `acc_book` insert/update/batch_insert에 **거래일 ↔ org 회계기간 검증**(기간 밖 경고/차단)
- [ ] (P1) `organ`에 **`election_cycle`(또는 acc_year) 컬럼** 추가(마이그레이션 020) — 이름 파싱 제거
- [ ] (P1) candidate↔후보자 페어 **주기 일치 보장**(`candidate_org_id` FK 또는 export 시 cycle 검증)
- [ ] (P2) org 목록/전환 UI **주기 배지 + 현 주기 필터**
- [ ] (P2) 옛 주기 org **읽기전용 잠금(아카이브 플래그)**
- [ ] (P2) export·결산·보고서에 **주기 외 거래 경고**

### 2.2 Out of Scope

- org 단위 격리 모델 자체의 재설계(이미 org_id 격리 — 유지)
- 다선거(국회/대선 등) 전면 주기 관리 체계(이번은 지방선거 2022/2026 분리에 집중, 확장 가능하게 설계)
- 과거 데이터 일괄 재분류(현재 혼입 0이라 불요; 스캔으로 상시 감시)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-00 | 혼입 거래(org 9 id=177) 삭제 + 전 org 스캔(혼입 0 확인) | P0 | **Done** |
| FR-01 | `acc_book` insert/update/batch_insert에서 거래일이 org 유효기간(pre_acc_from~acc_to) 밖이면 경고/차단 | P1 | Pending |
| FR-02 | `organ.election_cycle` 컬럼 추가(마이그레이션 021) + 기존 9/10/11 백필 | P1 | Pending |
| FR-03 | candidate 페어 주기 일치 — `candidate_org_id` FK 도입(같은 cycle만) 또는 export 시 cycle 불일치 차단 | P1 | Pending |
| FR-04 | 연도-혼입 스캔 정식 스크립트(`scripts/scan-year-contamination.mjs`) | P0/P1 | Pending |
| FR-05 | org 목록/전환 UI에 주기 배지 + 현 주기 필터(옛 주기 접기) | P2 | Pending |
| FR-06 | 옛 주기 org 읽기전용 잠금(`organ.locked` 또는 cycle 기준) | P2 | Pending |
| FR-07 | export(`export-sqlite`)·결산·보고서에서 선택 org의 주기 외 거래 감지 시 경고 | P2 | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement |
|----------|----------|-------------|
| 무결성 | 전 org 연도-혼입 상시 0 | 스캔 스크립트 정기 실행 |
| 안전성 | 마이그레이션은 additive/reversible(단일 Supabase, 무중단) | DDL 리뷰 |
| 호환성 | 기존 export/결산/import 회귀 0 | vitest 기존 스위트 |
| 가역성 | 거래일 검증은 경고 우선(정당한 기간경계 거래 차단 안 함) 또는 override 제공 | 설계서 결정 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] FR-01~04 구현(P1 + 스캔), FR-05~07은 후속 가능
- [ ] 마이그레이션 020 적용 + organ 9/10/11 election_cycle 백필
- [ ] 거래일 검증 단위 테스트(기간 내/밖, 경계, batch)
- [ ] 기존 export/결산/import 회귀 0, eslint 0
- [ ] 스캔 스크립트로 혼입 0 재확인

### 4.2 Quality Criteria

- [ ] 신규 코드 경로 테스트 커버리지 확보
- [ ] DDL 리뷰(롤백 SQL 포함)

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 거래일 검증이 정당한 기간경계 거래(이월·정정)를 차단 | Med | Med | 1차는 경고+override, 차단은 옵션. pre_acc_from~acc_to 넓은 창 사용 |
| 마이그레이션이 운영 DB(단일 Supabase) 직접 영향 | High | Low | additive 컬럼(default null)·롤백 SQL·수동 적용 절차 준수(CLAUDE.md) |
| candidate_org_id FK 전환이 export/페어 로직 광범위 변경 | Med | Med | 1차는 export 시 cycle 검증만(데이터/경고), FK 전환은 별도 단계 |
| election_cycle 백필 오류로 기존 org 오분류 | Med | Low | acc_from 연도 기준 자동 백필 + 수동 확인(9=2022,10/11=2026) |

---

## 6. Architecture Considerations

### 6.1 Project Level

Dynamic(기존). 신규 인프라 없음 — `acc-book` API 검증 + organ 컬럼 + 스캔 스크립트 + (후속) UI.

### 6.2 Key Decisions (설계 단계 확정)

| Decision | Options | Lean | Rationale |
|----------|---------|------|-----------|
| 주기 표현 | acc_from 연도 파생 / **`election_cycle` 컬럼** | election_cycle 컬럼 | 명시·필터·집계 용이, 이름 파싱 제거 |
| 거래일 검증 강도 | 경고 / 차단 / 차단+override | 경고+override(설계서) | 정당한 경계거래 보호 + 철저 분리 균형 |
| candidate 페어 | free-form candidate_* 유지 / **candidate_org_id FK** | 1차 export cycle 검증, 2차 FK | 점진 — 회귀 최소화 |
| 잠금 방식 | organ.locked 플래그 / cycle 기준 read-only | locked 플래그 | 명시·단순 |

### 6.3 마이그레이션

- `app/scripts/021_organ_election_cycle.sql`(최신=020 감사의견서 → 021): `ALTER TABLE pfam.organ ADD COLUMN election_cycle TEXT;` + 백필 UPDATE(9→'2022', 10/11→'2026') + 롤백 주석. 수동 적용(서비스롤 REST는 DDL 불가 — Supabase SQL editor).

---

## 7. Convention Prerequisites

- [x] 마이그레이션은 `scripts/0NN_*.sql` 수동 적용(최신 019 → 020) — CLAUDE.md 준수
- [x] 날짜는 YYYYMMDD 문자열(검증도 문자열 비교)
- [x] acc-book은 action 기반 dispatch(insert/update/batch_insert) — 검증을 공용 지점에 1회
- 신규 env 불필요

---

## 8. Next Steps

1. [ ] 설계 문서 (`/pdca design year-data-separation`) — 검증 위치·election_cycle 형태·candidate cycle 검증·잠금 방식 확정
2. [ ] 마이그레이션 021 작성·적용
3. [ ] FR-01(거래일 검증) + FR-04(스캔 스크립트) 우선 구현 → `/ship`
4. [ ] FR-05~07(UI/잠금/경고) 후속

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-30 | Initial draft (실데이터 진단·P0 완료 반영) | DrunkenZealnut |
