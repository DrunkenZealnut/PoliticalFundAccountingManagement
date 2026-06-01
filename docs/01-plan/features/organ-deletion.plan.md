# organ-deletion Planning Document

> **Summary**: 사용기관(organ)을 연관 데이터(회계자료·증빙파일·자산·의견 등)와 함께 안전하게 삭제하는 기능 추가
>
> **Project**: 정치자금 회계관리 시스템 (political-fund-accounting)
> **Version**: 0.1
> **Author**: DrunkenZealnut
> **Date**: 2026-06-01
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 사용기관 등록(register-organ)·선택(select-organ)은 가능하나 **삭제 기능이 전혀 없음**. 테스트/오등록 기관이 영구히 목록에 남고, `org_id` FK에 `ON DELETE CASCADE`가 없어 수동 삭제도 위험(고아 데이터·Storage 잔여 파일 발생) |
| **Solution** | 서버 API 라우트(`/api/organ` action=`delete`) + Postgres RPC(`delete_org_data`)로 **자식 테이블 → organ 순서의 원자적 삭제** + Supabase Storage evidence 파일 정리. select-organ/organ 페이지에 삭제 UI(2단계 확인·비밀번호 검증) 추가 |
| **Function/UX Effect** | 사용기관 카드에서 삭제 → 영향 건수 미리보기(수입/지출/증빙/자산) → 비밀번호 확인 → 전체 데이터 일괄 제거. 현재 선택된 기관 삭제 시 auth store 정리 후 재선택 화면으로 이동 |
| **Core Value** | 기관 생명주기(생성·선택·**삭제**) 완성. 고아 데이터/Storage 누수 없는 무결성 삭제로 다중 기관 환경의 데이터 위생 확보 |

---

## 1. Overview

### 1.1 Purpose

사용자가 더 이상 사용하지 않는 사용기관(테스트용, 오등록, 종료된 선거 기관 등)을 시스템에서 **연관 데이터와 함께 완전히 삭제**할 수 있게 한다. 삭제는 되돌릴 수 없으므로 회계자료 삭제(`reset` 페이지)와 동일 수준의 안전장치(미리보기 + 비밀번호 확인)를 적용한다.

### 1.2 Background

- **현황**: `register-organ`(생성), `select-organ`(선택)만 존재. 삭제 경로 부재로 목록이 계속 누적됨.
- **DB 제약 (핵심)**: `app/scripts/001_create_tables.sql` 기준 `org_id` 참조 FK 대부분 **`ON DELETE CASCADE` 미설정**. 따라서 `organ` 행을 바로 지우면 FK 위반으로 실패하거나, 자식 행이 고아로 남음.
  - **CASCADE 있음**: `evidence_file.acc_book_id → acc_book` (ON DELETE CASCADE), `user_organ.user_id → auth.users` (ON DELETE CASCADE)
  - **CASCADE 없음 (수동 선삭제 대상)**: `acc_book`, `acc_book_bak`, `estate`, `opinion`, `backup_history`, `col_organ`, `sum_rept`, `alarm`, `customer`(011에서 org_id 추가), `user_organ`(org FK)
- **Storage 누수**: `evidence_file`은 `acc_book` 삭제 시 DB 레코드만 cascade 삭제됨. **Supabase Storage `evidence` 버킷의 실제 파일은 별도로 지워야** 함 (`storage_path` SSOT).
- **격리 주의**: `customer`는 011 마이그레이션에서 `org_id`(nullable, 공용/익명은 NULL)로 조직 격리. 삭제 시 **해당 org_id의 customer만** 제거하고 공용/익명(NULL)·타 org 공유 레코드는 보존해야 함.

### 1.3 Related Documents

- 스키마: `app/scripts/001_create_tables.sql` (테이블·FK·RLS·RPC `export_org_data`)
- 격리: `app/scripts/011_customer_org_id.sql` (customer org_id 백필)
- 증빙: `app/scripts/007_evidence_file_table.sql` (storage_path)
- 삭제 순서 참고: `app/scripts/clear-supabase-data.mjs` (역 FK 순서 배열)
- 기존 삭제 UX 패턴: `app/src/app/dashboard/reset/page.tsx` (미리보기 + 비밀번호)
- 대상 UI: `app/src/app/select-organ/page.tsx`, `app/src/app/dashboard/organ/page.tsx`

---

## 2. Scope

### 2.1 In Scope

- [ ] **RPC `delete_org_data(p_org_id)`** — 단일 트랜잭션으로 자식 행(아래 순서) → `organ` 삭제. 권한 체크(호출자 `user_organ` 소속) 포함, 삭제 건수 요약 반환
  - 삭제 순서: `evidence_file`(org_id) → `acc_book_bak` → `acc_book` → `estate` → `opinion` → `backup_history` → `col_organ` → `sum_rept` → `alarm` → `customer`(org_id IS NOT NULL인 해당 org만) → `user_organ`(org_id) → `organ`
- [ ] **API 라우트 `/api/organ` (action=`delete`)** — service role로 ① 호출자 소속 검증 ② evidence storage_path 조회 후 Storage 파일 일괄 삭제 ③ RPC 호출 ④ 결과 반환
- [ ] **API 라우트 `/api/organ` (action=`preview`)** — 삭제 전 영향 건수 집계(수입/지출/증빙/자산/자료) 반환
- [ ] **삭제 UI** — `select-organ` 페이지 각 기관 카드에 삭제 버튼 + 확인 모달(영향 미리보기 → 비밀번호 입력 → 실행)
- [ ] **현재 선택 기관 삭제 처리** — 삭제 대상이 현재 `orgId`이면 auth store 정리 후 `/select-organ` 또는 `/register-organ`로 이동
- [ ] **organ 관리 페이지(`dashboard/organ`) 연동** — 본인 기관 삭제 진입점 추가(선택)
- [ ] 단위 테스트(삭제 순서·권한·storage 정리·현재 기관 처리), lint/build 통과

### 2.2 Out of Scope

- 소프트 삭제(휴지통)·복구(Undo) — 본 기능은 영구 삭제(`reset` 페이지와 동일 정책)
- 다중 기관 일괄 삭제, 관리자에 의한 타 사용자 기관 강제 삭제
- organ-pair(후원회+후보자) 동시 삭제 자동화 — v1에서는 단건 삭제, 페어는 개별 수행(§5 리스크 참고)
- `codeset`/`codevalue`/`acc_rel`(전역 참조코드) 삭제 — 기관 전용 데이터 아님

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | 삭제 미리보기: 대상 기관의 수입/지출 건수·금액, 증빙파일 수, 자산 수를 집계해 표시 | High | Pending |
| FR-02 | RPC `delete_org_data`: 자식 테이블 역-FK 순서 원자적 삭제 + `organ` 삭제(트랜잭션) | High | Pending |
| FR-03 | 권한 검증: 호출자가 `user_organ`로 해당 org에 소속된 경우에만 삭제 허용 | High | Pending |
| FR-04 | Storage 정리: evidence 버킷에서 해당 org의 `storage_path` 파일 일괄 삭제 | High | Pending |
| FR-05 | 안전장치: 영구 삭제 경고 + 로그인 비밀번호 재확인 후에만 실행 | High | Pending |
| FR-06 | 현재 선택 기관 삭제 시 auth store(localStorage) 정리 후 재선택/등록 화면 이동 | High | Pending |
| FR-07 | customer 삭제는 `org_id` 일치 레코드만(공용/익명 NULL·타 org 보존) | High | Pending |
| FR-08 | 삭제 결과 토스트/알림: 삭제된 기관명 + 제거 건수 요약 표시 | Medium | Pending |
| FR-09 | 마지막 1개 기관 삭제 시 `register-organ`로 유도(빈 목록 안내 재사용) | Medium | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Atomicity | 삭제 중 실패 시 부분 삭제 없이 전체 롤백 | RPC 내 단일 트랜잭션, 강제 실패 테스트 |
| Security | RLS 우회(service role) 시에도 호출자 소속 org만 삭제(서버 검증) | API 권한 테스트(타 org 삭제 거부) |
| Integrity | 삭제 후 org_id 참조 고아 행 0, Storage 고아 파일 0 | 삭제 후 잔여 조회 테스트 |
| Performance | 일반 규모(수백~수천 건) 삭제 5초 이내 | 실데이터(Fund_Data) 기준 측정 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] FR-01~FR-09 구현 완료
- [ ] 단위 테스트 작성·통과(삭제 순서, 권한 거부, storage 정리, 현재 기관 정리)
- [ ] `npm run lint` 0 error, `npm run build` 성공
- [ ] Gap 분석(/pdca analyze) Match Rate ≥ 90%

### 4.2 Quality Criteria

- [ ] 삭제 후 `organ`/`acc_book`/`evidence_file`/`estate`/`opinion`/`customer`(해당 org) 잔여 0 검증
- [ ] 타 사용자/타 org 데이터 영향 0 검증
- [ ] Zero lint errors / Build 성공

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| FK CASCADE 부재로 삭제 순서 오류 → FK 위반 실패 | High | High | RPC에서 `clear-supabase-data.mjs` 검증된 역-FK 순서 적용 + 트랜잭션 |
| Storage 파일 미삭제 → 고아 파일 누적 | Medium | High | RPC 전에 `storage_path` 목록 조회 → `storage.remove()` 일괄 삭제, 실패 로그 |
| customer 공유/익명 레코드 오삭제 | High | Medium | `org_id = p_org_id AND org_id IS NOT NULL` 조건만 삭제, NULL 보존 |
| organ-pair(후원회+후보자) 한쪽만 삭제 시 정합성 | Medium | Low | v1은 단건; UI에 페어 안내 메시지, 자동화는 out of scope |
| 현재 선택 기관 삭제 후 stale store로 오류 | Medium | Medium | 삭제 직후 `setOrgan(null)`/store 초기화 + 라우팅 |
| 권한 우회(service role) | High | Low | API에서 호출자 `user_organ` 소속 선검증 후에만 RPC 호출 |
| 비밀번호 확인 누락으로 오삭제 | High | Medium | `reset` 페이지 패턴 재사용(비밀번호 prompt + 경고 배너) |

---

## 6. Architecture Considerations

### 6.1 Project Level Selection

| Level | Characteristics | Recommended For | Selected |
|-------|-----------------|-----------------|:--------:|
| **Starter** | Simple structure | Static sites | ☐ |
| **Dynamic** | Feature modules, BaaS(Supabase) 연동 | Web apps with backend | ☑ |
| **Enterprise** | Strict layers, DI | High-traffic systems | ☐ |

> 기존 시스템과 동일한 Dynamic 레벨. 신규 아키텍처 도입 없음.

### 6.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| 삭제 실행 위치 | 브라우저 직접 / 서버 API+RPC | **서버 API + RPC** | 다중 테이블 원자성 + Storage 정리 + 권한 검증 필요. 브라우저 직접 삭제는 RLS·순서·원자성 보장 불가 |
| 트랜잭션 | 앱단 순차 / Postgres RPC | **Postgres RPC** | 단일 트랜잭션 롤백 보장(부분 삭제 방지) |
| Storage 삭제 위치 | RPC(불가) / API(JS) | **API(JS)** | Postgres에서 Storage object 삭제 불가 → service role JS에서 `storage.remove()` |
| 권한 모델 | RLS only / 서버 명시 검증 | **서버 명시 검증** | service role은 RLS 우회 → 호출자 `user_organ` 소속 명시 확인 |
| API 패턴 | 신규 route / 기존 확장 | **신규 `/api/organ`(action-based)** | 프로젝트 action-dispatch 컨벤션 준수(`preview`/`delete`) |

### 6.3 Clean Architecture Approach

```
Selected Level: Dynamic (기존 구조 유지)

영향 범위:
┌─────────────────────────────────────────────────────┐
│ app/src/app/api/organ/route.ts        (신규: preview/delete) │
│ app/scripts/012_delete_org_data.sql   (신규: RPC)            │
│ app/src/app/select-organ/page.tsx     (수정: 삭제 UI/모달)    │
│ app/src/app/dashboard/organ/page.tsx  (수정: 삭제 진입점)     │
│ app/src/stores/auth.ts                (활용: setOrgan 초기화) │
└─────────────────────────────────────────────────────┘
```

---

## 7. Convention Prerequisites

### 7.1 Existing Project Conventions

- [x] `CLAUDE.md` / `app/AGENTS.md` 컨벤션 존재 (Next.js 16 docs 우선 확인 규칙 포함)
- [x] `DESIGN.md` 디자인 시스템 존재 (UI 변경 시 준수)
- [x] ESLint v9 flat config, TypeScript, Vitest 구성됨
- [x] API action-based dispatch 패턴(`/api/acc-book`) 확립

### 7.2 Conventions to Define/Verify

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| API route 패턴 | 존재 | `/api/organ`도 action-dispatch + service role 폴백 적용 | High |
| 날짜 처리 | 존재(YYYYMMDD) | 본 기능 영향 미미(집계만) | Low |
| 삭제 UX | 존재(reset) | 비밀번호 확인 패턴 재사용 | High |
| SQL 스크립트 번호 | 011까지 | `012_delete_org_data.sql` | High |

### 7.3 Environment Variables Needed

| Variable | Purpose | Scope | To Be Created |
|----------|---------|-------|:-------------:|
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 삭제·Storage 정리(RLS 우회) | Server | 기존(재사용) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 엔드포인트 | Client/Server | 기존(재사용) |

> 신규 환경변수 없음.

### 7.4 Pipeline Integration

| Phase | Status | Document Location | Command |
|-------|:------:|-------------------|---------|
| Phase 1 (Schema) | ✅ 기존 | `app/scripts/001_create_tables.sql` | - |
| Phase 4 (API) | 🔜 | `app/src/app/api/organ/route.ts` | `/pdca design` 후 진행 |

---

## 8. Next Steps

1. [ ] 설계 문서 작성 (`/pdca design organ-deletion`) — RPC 삭제 순서/시그니처, API 요청·응답 스키마, 모달 UX flow, 테스트 케이스 명세
2. [ ] FK CASCADE 부재 테이블 최종 확인(실 DB `information_schema` 대조)
3. [ ] 구현 시작 (`/pdca do organ-deletion`)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-01 | 초안 작성 (코드베이스 분석 기반 scope·리스크 도출) | DrunkenZealnut |
