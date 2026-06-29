---
template: design
version: 1.2
feature: single-org-restore-export
date: 2026-06-29
author: DrunkenZealnut
project: 정치자금 회계관리 시스템
version_project: 0.25.1.0
---

# single-org-restore-export Design Document

> **Summary**: 사용자의 실제 `Fund_Master.db`에서 기관의 진짜 ORG_ID를 읽어, 그 ID로 단일기관 보관자료(.db) 스냅샷을 생성해 [자료 복구]로 적재하는 export 모드.
>
> **Project**: 정치자금 회계관리 시스템
> **Version**: 0.25.1.0
> **Author**: DrunkenZealnut
> **Date**: 2026-06-29
> **Status**: Draft
> **Planning Doc**: [single-org-restore-export.plan.md](../../01-plan/features/single-org-restore-export.plan.md)

---

## 1. Overview

### 1.1 Design Goals

- 선관위 윈도우 프로그램 [자료 복구]가 충돌 없이 받아들이는 **단일기관 .db** 생성
- **ORG_ID 충돌(`UNIQUE constraint failed: ORGAN.ORG_ID`) 원천 차단** — 우리가 1/2로 고정하지 않고, 사용자 master에서 읽은 **실제 ORG_ID** 사용
- 후원회 export 시 **가짜 후보자 페어 미생성**(사용자는 후보자를 별도 기관으로 운영)
- 기존 `full`/`master`/`data1`/`data2` 모드·파이프라인 **무변경 재사용**

### 1.2 Design Principles

- **master.db = ORG_ID의 SSOT** — 추측/고정 금지, 사용자 실제 파일에서 read
- 기존 `export-sqlite` 파이프라인(`targetExportOrgId`/`orgIdMap`/`remapOrgId`/`filterByExportOrgId`) 재사용 — 신규 분기 최소화
- 단일 기관 스냅샷 = 프로그램 네이티브 `보관자료_*.db`와 동형(20테이블)
- 클라이언트에서 master 파싱(sql.js) — master 원본을 서버에 업로드하지 않음(개인정보·단순성)

---

## 2. Architecture

### 2.1 Component Flow

```
[backup 페이지]                         [export-sqlite route]
 ① 기관 선택(현재 org)
 ② master.db 업로드 ──(sql.js, 브라우저)─▶ ORGAN 읽기
       │                                   USERID/REG_NUM/NAME로 현재 org 매칭
       │                                   → restoreOrgId (예: 후원회=3)
       ▼
 ③ GET /api/system/export-sqlite?mode=restore&orgId={supabase}&restoreOrgId={N}
                                              │
                                   buildOrganExport(org, {singleOrgId:N})
                                     → ORGAN 1행(ORG_ID=N, 페어 없음)
                                     → orgIdMap: supabase org_id → N
                                   targetExportOrgId = N
                                   (ACC_BOOK/ESTATE/OPINION/SUM_REPT/COL_ORGAN/ALARM
                                    전부 remap+filter → ORG_ID=N)
                                   reference 풀세트 + CUSTOMER(참조 cust_id)
                                              │
                                   Content-Disposition: 정치자금【{org}】보관자료_{ts}.db
       ▼
 ④ 다운로드 → 프로그램 Backup 폴더 → [자료 복구](해당 기관 로그인) → 충돌 없음
```

### 2.2 Data Flow (ORG_ID 결정)

```
master.db ORGAN ─▶ match(현재 org)         매칭 우선순위
  rows[]            ├ USERID 일치 (1순위, 가장 신뢰)
                    ├ REG_NUM 일치 (2순위)
                    └ ORG_NAME 정규화 일치 (3순위)
  결과: 1건 → restoreOrgId 확정
        0건 → 에러(수동 입력 fallback 또는 안내)
        2건+ → 사용자 선택(AskUser/드롭다운)
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| backup/page.tsx | sql.js, import-helpers | master.db 파싱·ORGAN 매칭 |
| export-sqlite/route.ts | organ-pair.buildOrganExport | 단일기관 ORGAN/remap |
| organ-pair.ts | (없음, 순수) | singleOrgId 옵션 |
| pfund2-constants.ts | (없음) | mode 'restore', 파일명 헬퍼 |

---

## 3. Data Model

### 3.1 buildOrganExport 옵션 확장

```typescript
// organ-pair.ts
export interface BuildOrganExportOptions {
  maskPasswd?: boolean;
  candidateCredentials?: CandidateCredentials;
  // 신규: 단일기관 모드 — 지정 ORG_ID로 단일 ORGAN 행만 생성(페어 생성 안 함)
  singleOrgId?: number;
}
```

동작:
- `singleOrgId`가 주어지면 **SUPPORTER/CANDIDATE 분기를 타지 않고** `makeOrganRow(supabaseOrgan, { ORG_ID: singleOrgId, PASSWD, ORG_ORDER: singleOrgId })` 1행만 반환.
- `orgIdMap.set(supabaseOrgan.org_id, singleOrgId)`.
- 가짜 후보자/후원회 페어 행 **미생성**.

### 3.2 ORG_ID 매칭 (master 파싱)

```typescript
// 신규 순수 함수 (lib/accounting/organ-match.ts 또는 import-helpers 확장)
interface MasterOrganRow { ORG_ID: number; ORG_SEC_CD: number; ORG_NAME: string;
  REG_NUM: string; USERID: string | null; }
interface OrgMatchResult { orgId: number | null; reason: "userid"|"reg_num"|"name"|"none"|"ambiguous";
  candidates?: MasterOrganRow[]; }

function matchProgramOrgId(
  masterOrgans: MasterOrganRow[],
  target: { userid?: string|null; reg_num?: string|null; org_name?: string|null },
): OrgMatchResult
```

### 3.3 산출 .db (네이티브 보관자료와 동형)

20테이블: ORGAN(1행 @restoreOrgId) + ACC_BOOK/ACC_BOOK_BAK(그 org, remap N) + reference 4종 풀세트(CODESET/CODEVALUE/ACC_REL/ACC_REL2) + CUSTOMER(참조 cust_id) + CUSTOMER_ADDR + ESTATE/OPINION/SUM_REPT/COL_ORGAN/ALARM(remap N) + ACCBOOKSEND + TEMP/TEST/info.

---

## 4. API Specification

### 4.1 export-sqlite 확장

| Param | 기존/신규 | 설명 |
|-------|-----------|------|
| `mode` | 확장 | `full`\|`master`\|`data1`\|`data2`\|**`restore`** |
| `orgId` | 기존 | Supabase 대상 org |
| `restoreOrgId` | **신규** | `mode=restore` 필수. 프로그램 실제 ORG_ID(1~N). 미지정/비정수 → 400 |
| `year` | 기존 | 거래 연도 필터(선택) |

`mode=restore` 처리:
1. `restoreOrgId` 검증(양의 정수). 없으면 `400 { code: "RESTORE_ORG_ID_REQUIRED" }`.
2. `buildOrganExport(supabaseOrgan, { maskPasswd:false, singleOrgId: restoreOrgId })`.
3. `targetExportOrgId = restoreOrgId` (기존 `filterByExportOrgId`·OPINION fallback 그대로 동작).
4. 거래/종속표 전부 기존 remap 경로 통과(=restoreOrgId로 매핑·필터).
5. 파일명: `pfund2RestoreFilename(org_name, timestamp)`.

> **재사용 포인트**: `targetExportOrgId`는 현재 `data1=1/data2=2/그외 null`만. `restore`는 이를 `restoreOrgId`(임의 N)로 일반화. 하위 로직(ACC_BOOK·CUSTOMER 참조선정·ESTATE·OPINION·SUM_REPT·COL_ORGAN·ALARM 필터)은 **수정 없이** N에 대해 동작.

### 4.2 파일명 헬퍼

```typescript
// pfund2-constants.ts
export function pfund2RestoreFilename(orgName: string, ts: { y:number;mo:number;d:number;h:number;mi:number;s:number }): string {
  const p = (n:number,l=2)=>String(n).padStart(l,"0");
  return `정치자금【 ${orgName} 】보관자료_${ts.y}-${p(ts.mo)}-${p(ts.d)} ${p(ts.h)}시${p(ts.mi)}분${p(ts.s)}초.db`;
}
```
- 대괄호 안 **공백** 포함(네이티브 형식 모사). Content-Disposition `filename*=UTF-8''` 인코딩으로 한글·괄호 보존.
- 타임스탬프는 클라이언트(브라우저 로컬시간)에서 생성해 쿼리/헤더로 전달(서버 결정 비순수성 회피) 또는 서버 `new Date()`.

---

## 5. UI/UX Design

### 5.1 backup 페이지 추가

```
┌─ 자료 백업 ────────────────────────────────┐
│ 내보내기 형식:                              │
│  ( ) 통합본(전체)  ( ) 후보자  ( ) 후원회   │
│  (•) 윈도우 [자료 복구]용 (단일기관) ◀ 신규 │
│                                            │
│  [자료 복구]용 선택 시:                     │
│   1) 프로그램 Fund_Master.db 업로드 ─┐      │
│      → 이 기관 번호 자동확인: ORG_ID=3 ✓   │
│      (못 찾으면: 번호 직접 입력 [   ])      │
│   2) [다운로드]                             │
│                                            │
│  ⚠ Data 폴더에 직접 붙여넣기 금지.          │
│     프로그램 [자료 복구] 메뉴로 불러오세요. │
│     해당 기관으로 로그인한 상태에서 복구.   │
└────────────────────────────────────────────┘
```

### 5.2 User Flow

```
후원회 기관 선택 → master.db 업로드 → ORG_ID=3 확인 → 다운로드(보관자료 형식)
  → Backup 폴더 → 후원회 로그인 → [자료 복구] → 완료
후보자도 동일(기관 전환 후 같은 master 업로드 → ORG_ID 자동매칭 → 복구)
```

### 5.3 Component List

| Component | Location | 책임 |
|-----------|----------|------|
| 백업 형식 라디오 + master 업로더 | `app/dashboard/backup/page.tsx` | mode=restore UI, master 파싱 트리거 |
| matchProgramOrgId | `lib/accounting/organ-match.ts` | ORGAN 매칭(순수, 테스트 대상) |

---

## 6. Error Handling

| Code | 상황 | 처리 |
|------|------|------|
| `RESTORE_ORG_ID_REQUIRED` (400) | mode=restore인데 restoreOrgId 없음 | UI에서 매칭/입력 강제 |
| `ORG_NOT_FOUND_IN_MASTER` | master에서 현재 기관 매칭 0건 | "번호 직접 입력" fallback 안내 |
| `AMBIGUOUS_ORG_MATCH` | 매칭 2건+ | 후보 목록 제시(사용자 선택) |
| `INVALID_MASTER_DB` | 업로드 파일이 SQLite/ORGAN 없음 | 파싱 에러 안내(헤더 검증) |

---

## 7. Security Considerations

- [ ] master.db는 **브라우저에서만 파싱**(서버 미전송) — 비밀번호·인적사항 노출 최소화
- [ ] export PASSWD 처리: 기존 정책 유지(`maskPasswd:false`는 export-sqlite 한정, 운영 .db 호환 목적)
- [ ] restoreOrgId 정수 검증(인젝션·범위)
- [ ] 기존 service-role 경로 변경 없음

---

## 8. Test Plan

### 8.1 Scope

| Type | Target | Tool |
|------|--------|------|
| Unit | buildOrganExport(singleOrgId), matchProgramOrgId, pfund2RestoreFilename | Vitest |
| Integration | export-sqlite mode=restore (단일기관·remap·FK 0 orphan) | Vitest (sql.js 인메모리) |
| Manual | 윈도우 [자료 복구] 일치ID 적재 | 사용자 실기 |

### 8.2 Test Cases (Key)

- [ ] singleOrgId=3 → ORGAN 1행 ORG_ID=3, 페어 미생성, orgIdMap(org)→3
- [ ] 후원회(596) singleOrg → 가짜 후보자 행 없음(회귀: 페어 자동생성 우회)
- [ ] matchProgramOrgId: USERID 일치 우선 / reg_num·name fallback / 0건·다중건 분기
- [ ] mode=restore 산출 .db: ORGAN 1행, ACC_BOOK 전부 ORG_ID=restoreOrgId, FK orphan 0
- [ ] restoreOrgId 누락 → 400
- [ ] 파일명 포맷(공백·`HH시MM분SS초`) + Content-Disposition UTF-8 인코딩
- [ ] 기존 full/master/data1/data2 회귀 0 (export-sqlite 스위트)

---

## 9. Clean Architecture (Layer 배치)

| Component | Layer | Location |
|-----------|-------|----------|
| matchProgramOrgId, pfund2RestoreFilename, buildOrganExport | Domain(순수) | `lib/accounting/` |
| export-sqlite route | Infrastructure/API | `app/api/system/export-sqlite/route.ts` |
| backup 페이지 UI·master 업로더 | Presentation | `app/dashboard/backup/page.tsx` |

순수 함수(매칭·파일명·ORGAN 빌드)는 단위테스트로 고정, route/UI는 그 위에 얇게.

---

## 10. Coding Convention Reference

- 기존 export-sqlite 컨벤션 준수: 컬럼 매핑 `COL_MAP`, `_`prefix strip, `stripAppOnlyAccBookColumns`(denylist) — restore도 동일 적용(신규 컬럼 누출 방지).
- 코드값/약어는 SSOT 재사용(`organ-pair`, `pfund2-constants`). 신규 상수 중복정의 금지(메모리: SUPPORTER_SEC_CDS 중복 드리프트 교훈).
- 릴리스: `app/VERSION` MINOR bump(신규 export 모드 = feature).

---

## 11. Implementation Guide

### 11.1 변경 파일

```
app/src/lib/accounting/organ-pair.ts        # singleOrgId 옵션
app/src/lib/accounting/organ-match.ts        # (신규) matchProgramOrgId
app/src/lib/accounting/pfund2-constants.ts   # mode 'restore' + pfund2RestoreFilename
app/src/app/api/system/export-sqlite/route.ts# mode=restore + restoreOrgId 분기
app/src/app/dashboard/backup/page.tsx        # UI + master 업로드/파싱
+ *.test.ts (organ-pair, organ-match, pfund2-constants, export-sqlite)
```

### 11.2 Implementation Order

1. [ ] `buildOrganExport` singleOrgId 옵션 + 단위테스트
2. [ ] `matchProgramOrgId` 순수함수 + 단위테스트
3. [ ] `pfund2RestoreFilename` + 단위테스트
4. [ ] export-sqlite `mode=restore` 분기(restoreOrgId 일반화) + 통합테스트(FK 0 orphan)
5. [ ] backup 페이지 UI(라디오 + master 업로더 + 경고 안내)
6. [ ] 기존 회귀 스위트 통과 + lint
7. [ ] 사용자 윈도우 [자료 복구] 실기 검증

### 11.3 Open Questions (Do 단계 진입 전 확인) — 구현 후 정리

- ~~ORGAN.ORG_ORDER 값~~ → **해결**: 네이티브 백업에서 `ORG_ORDER == ORG_ID`(=3) 확인. 구현은 `ORG_ORDER: singleOrgId`로 일치.
- ~~타임스탬프 출처~~ → **결정**: 클라이언트 로컬시간을 `ts=YYYY-MM-DD-HH-mm-ss`로 전달, 서버는 `parseRestoreTs`로 받고 미전달/형식불일치 시 서버시간 fallback.
- FR-11 B안(Fund_Data만 교체)은 1차 범위서 제외, A안(복구)만 구현 — **유지(의도적)**.
- **FR-09 매칭 정합 노트**: UI는 `import-sqlite` dryRun이 USERID를 반환하지 않아 `matchProgramOrgId`에 **org_name만** 넘겨 이름 기준으로 자동선택한다. USERID/REG_NUM 우선순위는 함수 차원에 구현·테스트돼 있으나 현재 호출부는 미사용. 자동매칭 실패/모호 시 드롭다운 수동 선택으로 보완(기능 결함 아님). 추후 dryRun이 USERID를 포함하도록 확장하면 1순위 매칭 활성화 가능.

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-29 | Initial draft (master 기반 ORG_ID 매칭 설계) | DrunkenZealnut |
