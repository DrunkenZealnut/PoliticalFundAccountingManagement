# DB Export 시 선관위 프로그램 로그인 ID/비밀번호 누락 보정 (db-export-login-id)

> **Summary**: `/api/system/export-sqlite`로 만든 `.db` 파일을 윈도우 선관위 프로그램(PFund2)에서 [자료 복구] 한 뒤 재로그인할 때 사용할 `ORGAN.USERID` / `PASSWD` 값을 사용자가 등록할 수 있게 하고, 누락 시 export를 차단/경고한다.
>
> **Project**: 정치자금 회계관리 시스템
> **Version**: app/package.json 기준
> **Author**: 사용자 (kcsvictory@gmail.com)
> **Date**: 2026-05-15
> **Status**: Draft

---

## Executive Summary

| 항목 | 내용 |
|---|---|
| Feature | db-export-login-id |
| 시작일 | 2026-05-15 |
| 예상 기간 | 0.5~1일 (Starter 규모, UI 1개 + API 검증 1개) |
| 영향 범위 | `dashboard/organ` 신규 페이지, `/api/system/export-sqlite`, `organ-pair.ts`, Supabase `organ` 데이터 |

### Value Delivered (4-Perspective)

| Perspective | 내용 |
|---|---|
| **Problem** | 현재 `organ.userid`/`passwd`는 "Supabase Auth로 대체, 레거시 호환용"으로 표시되어 있고 입력 UI가 없어 NULL인 상태. `export-sqlite`는 이 값을 그대로 내보내므로 `.db`의 `ORGAN.USERID`/`PASSWD`가 NULL. 선관위 PFund2가 [자료 복구] 후 **복구된 DB 안의 사용자ID/비밀번호로 재로그인을 요구** (PROGRAM_DESIGN §TC-SYS-003)하는데, 빈 자격증명으로는 로그인할 수 없어 데이터에 접근 불가. 후원회 → 후보자 자동 페어 생성 시 후보자 행은 `organ-pair.ts:139`에서 USERID/PASSWD가 **강제로 null**이라 후보자 계정 로그인은 100% 불가. |
| **Solution** | (1) `dashboard/organ/page.tsx` 신규 작성 — 사용자가 PFund2 로그인용 ID(최대 20자) / 비밀번호(최대 20자) / 힌트1·힌트2를 Supabase `organ` 테이블에 직접 등록. (2) `export-sqlite` GET 핸들러에 사전 검증 — `organ.userid`가 비어 있으면 400 + 안내 메시지 반환. (3) `organ-pair.ts` `buildOrganExport` 후보자 페어 row에 별도 `candidate_userid`/`candidate_passwd` 사용자 입력값을 적용하도록 옵션 확장. (4) `001_create_tables.sql` 코멘트 정정 ("PFund2 호환용 자격증명, Supabase Auth와 별개"). |
| **Function/UX Effect** | (a) 기관 정보 페이지에서 "선관위 프로그램 로그인 정보" 섹션이 노출되어 ID/PW를 설정 가능. (b) `.db` 다운로드 시도 시 자격증명이 비어 있으면 사전 확인 다이얼로그가 뜨고 등록 페이지로 안내. (c) 다운로드된 `.db`를 윈도우 PFund2에서 [자료 복구] → 재로그인 화면에서 사용자가 등록한 ID/PW로 정상 로그인 가능. (d) 후원회 단위인 경우 별도 입력한 후보자 자격증명으로 후보자 계정도 로그인 가능. |
| **Core Value** | "**웹앱에서 만든 .db가 선관위 윈도우 프로그램에서 끝까지 사용 가능**" — 복구 + 재로그인까지 한 번에 통과해야 비로소 사용자가 PFund2 환경에서 데이터를 열어볼 수 있다. 이번 작업으로 `official-program-parity` checklist의 "저장: [자료 복구] 성공 + 모든 데이터 그대로 표시" 항목이 비로소 완결된다. |

---

## 1. Overview

### 1.1 Purpose

웹앱에서 export한 `.db`가 윈도우 선관위 정치자금회계관리5 프로그램(PFund2.exe)에서 [자료 복구] → 재로그인 → 데이터 열람까지 전 과정이 막힘없이 진행되도록 한다. 현재 막혀 있는 지점은 **재로그인 단계의 USERID/PASSWD가 빈 값**이라는 단 하나.

### 1.2 Background

- `PROGRAM_DESIGN.md` §TC-SYS-003: "복구 후 기존 사용기관과 사용자ID 표출, 기존 비밀번호 입력 후 사용 가능"
- 현재 코드 상태:
  - `app/scripts/001_create_tables.sql:58-59`: `userid VARCHAR(20)`, `passwd VARCHAR(100)` — 컬럼은 있으나 "Supabase Auth로 대체, 레거시 호환용" 주석
  - `app/src/app/dashboard/organ/`: 폴더만 존재하고 page.tsx 없음 — 입력 UI 부재
  - `app/src/lib/accounting/organ-pair.ts:139-140`: 후원회→후보자 페어 생성 시 후보자 행 USERID/PASSWD를 항상 `null`로 강제
  - `app/src/app/api/system/export-sqlite/route.ts:402`: `maskPasswd: false`라 DB 값을 그대로 내보냄 (코드는 OK, 그러나 DB값이 비어 있음)
- 직전 점검 세션 결론: organ에 ID/PW 입력 UI 추가 + export 사전 검증이 최단 경로

### 1.3 Related Documents

- 점검 분석: `docs/03-analysis/remove-ai-features.analysis.md`는 무관 (chat 정리 분석)
- 상위 컨텍스트: `docs/archive/2026-05/official-program-parity/` (Phase D Import/Export Parity)
- 선행 작업: `docs/01-plan/features/db-export-fix.plan.md` (스키마/페어 보강은 완료, 본 작업은 자격증명 부분만 남음)

---

## 2. Scope

### 2.1 In Scope

- [ ] `dashboard/organ` 신규 페이지: 현재 선택된 기관의 PFund2 로그인 ID/비밀번호/힌트1/힌트2 등록·수정 폼
- [ ] 후원회 기관일 때 "후보자 계정 자격증명" 별도 입력란 (페어 export용)
- [ ] `/api/system/export-sqlite` 사전 검증 — `organ.userid` 또는 `organ.passwd` 누락 시 400 응답 + 등록 페이지 링크 안내
- [ ] `organ-pair.ts.buildOrganExport` 옵션 확장 — `candidateCredentials?: { userid, passwd }` 추가
- [ ] `001_create_tables.sql` 코멘트 정정 (`passwd` 의미를 "PFund2 호환 자격증명"으로 명시) — 마이그레이션은 만들지 않고 주석만 수정 (값 보존)
- [ ] Vitest 회귀: 자격증명 누락 시 export 차단, 정상값일 때 ORGAN row의 USERID/PASSWD 보존, 후보자 페어의 자격증명 분리

### 2.2 Out of Scope

- PFund2 비밀번호 해싱/암호화 — PFund2 자체가 평문 저장이므로 평문 그대로 둠. 단 Supabase 측 RLS로 본인 organ만 접근 가능하도록 정책은 기존 그대로 유지
- Supabase Auth 비밀번호와의 동기화 — 별개 자격증명 (이 시스템 로그인 ≠ PFund2 로그인)
- 일괄 마이그레이션 — 기존 사용자는 organ 페이지에서 직접 입력
- E2E 자동화 (윈도우 PFund2 실행) — 수동 UAT만 수행

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | 요구사항 | Priority | Status |
|----|---------|----------|--------|
| FR-01 | `dashboard/organ` 페이지에서 현재 `auth.orgId`에 해당하는 `organ` 행의 `userid`, `passwd`, `hint1`, `hint2`를 조회·수정 가능 | High | Pending |
| FR-02 | `userid`는 최대 20자, 영문/숫자/언더스코어만 허용. `passwd`는 1~20자 (PFund2 ORGAN.PASSWD가 VARCHAR(20)) | High | Pending |
| FR-03 | 후원회 단위(`org_sec_cd ∈ {91, 92, 107, 108, 109, 587, 588}`)일 때 "후보자 계정용 ID/비밀번호" 별도 입력란 노출 | High | Pending |
| FR-04 | `/api/system/export-sqlite` 호출 시 `organ.userid` 또는 `organ.passwd`가 빈 값이면 HTTP 400 + `{ error: { code: "ORGAN_CREDENTIALS_MISSING", message, organId } }` 반환 | High | Pending |
| FR-05 | `organ-pair.ts.buildOrganExport`가 `candidateCredentials` 옵션을 받아 후보자 행 USERID/PASSWD에 적용 | High | Pending |
| FR-06 | 후보자 자격증명이 비어 있고 페어 export인 경우 후보자 행 USERID/PASSWD는 `organ.userid`/`passwd`와 동일하게 fallback (사용자가 분리 입력하지 않은 경우의 안전망) | Medium | Pending |
| FR-07 | `001_create_tables.sql` `passwd` 주석을 "PFund2 ORGAN.PASSWD 호환 — Supabase Auth와 무관"으로 정정 | Low | Pending |

### 3.2 Non-Functional Requirements

| 항목 | 기준 | 측정 방법 |
|------|------|----------|
| Security | RLS로 본인 `organ.org_id`만 select/update 가능 (기존 정책 유지) | Supabase Studio RLS 정책 확인 |
| Validation | 입력 검증은 클라이언트(react-hook-form 또는 native) + 서버(API 라우트) 양쪽에서 | Vitest로 양쪽 검증 |
| Compatibility | 빈 값 ↔ NULL ↔ 빈 문자열을 단일 표현(`null`)으로 통일 | export-sqlite/import-sqlite 양방향 round-trip 테스트 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] FR-01 ~ FR-07 모두 구현
- [ ] Vitest: `organ-pair.test.ts`에 `candidateCredentials` 케이스 3건 추가 (정상/fallback/후보자 단독)
- [ ] Vitest: `export-sqlite` 핸들러에 자격증명 누락 차단 케이스 1건 (mocking)
- [ ] `dashboard/organ/page.tsx`에 컴포넌트 렌더 + 저장 성공/실패 테스트 (RTL + happy-dom)
- [ ] `npm run lint` 통과, `npm run build` 통과
- [ ] 사용자가 수동 UAT — 등록 후 `.db` 다운로드 → PFund2 [자료 복구] → 등록한 ID/PW로 로그인 성공

### 4.2 Quality Criteria

- [ ] Test coverage: 추가된 코드 기준 80% 이상
- [ ] Match Rate (gap-detector) ≥ 90%
- [ ] CodeRabbit / 자체 리뷰에서 P0/P1 이슈 0건

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | 대응 |
|------|--------|------------|------|
| PFund2가 USERID/PASSWD 형식에 추가 제약(특수문자 금지 등)을 가지고 있을 가능성 | Medium | Medium | 1차로는 영문/숫자/언더스코어만 허용 → UAT 결과 보고 완화 |
| 평문 비밀번호 노출 우려 | Medium | High | 입력 폼에서 type="password" + 표시/숨김 토글. Supabase 컬럼은 평문 (PFund2 호환 필수). RLS로 본인 organ만 접근. 비밀번호 별칭 마스킹 표시("****") |
| 기존 후원회 organ에 후보자 자격증명 없이 export 시도 시 후보자 행이 NULL로 export | Low | Medium | FR-06 fallback (후원회 자격증명을 후보자 행에도 복제). 사용자 화면에서 분리 입력 옵션은 노출하되 비워두면 자동 fallback. |
| `passwd` 컬럼이 VARCHAR(100)인데 export 시 VARCHAR(20)로 잘릴 가능성 | Low | Low | FR-02 클라이언트 검증으로 20자 제한. 서버 측 검증 추가. |

---

## 6. Architecture Considerations

### 6.1 Project Level

| Level | 선택 |
|-------|:---:|
| **Starter** | ✅ |
| Dynamic | |
| Enterprise | |

→ Starter 유지 (단일 페이지 + API 검증 추가).

### 6.2 Key Architectural Decisions

| 항목 | 선택 | 이유 |
|------|------|------|
| Form 라이브러리 | native React state | 입력 항목 4~6개, 기존 organ 페이지 부재로 새로 시작. react-hook-form 도입은 과함 |
| 검증 위치 | 클라이언트 + 서버(API) 양쪽 | Defense in depth |
| 비밀번호 저장 | 평문 (Supabase) | PFund2 호환을 위해 필수. RLS로 격리. |
| 후보자 자격증명 저장 위치 | 동일 `organ` 행에 컬럼 추가 vs 별도 필드 | **별도 컬럼 추가 없이** organ-pair.ts 옵션으로 처리하되, UI에서는 별도 입력란 노출. DB에는 페어 export 시점에만 사용 (organ 테이블 컬럼 변경 회피) |

### 6.3 Folder Touch Points

```
app/src/app/dashboard/organ/page.tsx        ← 신규 작성
app/src/app/api/system/export-sqlite/route.ts ← GET 사전 검증 추가
app/src/lib/accounting/organ-pair.ts        ← candidateCredentials 옵션 추가
app/src/lib/accounting/organ-pair.test.ts   ← 테스트 케이스 3건 추가
app/scripts/001_create_tables.sql           ← 주석 정정 (행위 없음, 메타 수정만)
```

후보자 자격증명을 DB 컬럼으로 저장하지 않는 이유: organ 테이블 스키마 변경 = 마이그레이션 + RLS 정책 재점검 비용이 큼. 페어 export는 같은 organ 행에서 파생되므로, 사용자가 입력한 후보자 자격증명은 **export 시점에만** 클라이언트 상태 → 서버로 전달하거나, 또는 organ 테이블에 `userid` 하나만 두고 후보자 행은 동일 자격증명을 공유하도록 단순화하는 것을 1차 권장 (FR-06 fallback이 그 단순화).

---

## 7. Convention Prerequisites

### 7.1 Existing Project Conventions

- [x] `CLAUDE.md` 작성됨 (Next.js 16 경고, Supabase 패턴, code values system 등)
- [x] `AGENTS.md` (Next.js 16 경고)
- [x] ESLint v9 flat config 설정
- [x] TypeScript 5 + tsconfig.json
- [ ] organ 페이지 UX 컨벤션 — 신규 (다른 dashboard 페이지 스타일 따름: Card + Table + shadcn/ui)

### 7.2 Conventions to Define/Verify

| 항목 | 현 상태 | 정의/확인 | 우선순위 |
|-----|---------|-----------|---------|
| 입력 검증 | 분산 | organ 페이지에서는 클라이언트 + API 양쪽 | High |
| 비밀번호 UI | 미정 | type="password" + 토글, react `useState`로 plain | High |
| RLS 정책 | 기존 organ 정책 유지 | 추가 변경 없음 확인만 | Medium |

### 7.3 Environment Variables Needed

추가 환경 변수 없음. 기존 Supabase 변수만 사용.

---

## 8. Next Steps

1. [ ] `/pdca design db-export-login-id` — Design 문서 작성 (UI 와이어 + API 스펙 + 데이터 흐름)
2. [ ] Design 검토 후 `/pdca do db-export-login-id` 진행
3. [ ] 구현 → `/pdca analyze db-export-login-id`
4. [ ] Match Rate ≥ 90% → `/pdca report`
5. [ ] 사용자 수동 UAT (실 PFund2 환경) → checklist 항목 체크

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-05-15 | Initial draft — DB export 시 PFund2 재로그인 자격증명 누락 보정 계획 | Claude (사용자 지시) |
