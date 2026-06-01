# organ-deletion Design Document

> **Summary**: 사용기관(organ)을 연관 데이터·증빙 Storage 파일과 함께 원자적·권한검증 하에 영구 삭제하는 기능 설계
>
> **Project**: 정치자금 회계관리 시스템 (political-fund-accounting)
> **Version**: 0.1
> **Author**: DrunkenZealnut
> **Date**: 2026-06-01
> **Status**: Draft
> **Planning Doc**: [organ-deletion.plan.md](../../01-plan/features/organ-deletion.plan.md)

### Pipeline References (if applicable)

| Phase | Document | Status |
|-------|----------|--------|
| Phase 1 | `app/scripts/001_create_tables.sql` | ✅ (기존 스키마) |
| Phase 4 | `app/src/app/api/organ/route.ts` (본 설계) | ❌ (신규) |

---

## 1. Overview

### 1.1 Design Goals

- 사용기관과 그에 종속된 **모든 데이터를 단일 트랜잭션으로 원자적 삭제**(부분 삭제·고아 데이터 0)
- `org_id` FK의 `ON DELETE CASCADE` 부재를 **검증된 역-FK 삭제 순서**로 안전 처리
- Supabase Storage `evidence` 버킷의 **실제 파일 누수 방지**(DB cascade 밖 영역)
- service role 사용 시에도 **호출자 소속(user_organ) 서버 검증**으로 타 org 삭제 차단
- 현재 선택 기관 삭제 시 **클라이언트 상태(auth store) 정합성 유지**

### 1.2 Design Principles

- **트랜잭션 경계는 DB**: 다중 테이블 삭제는 Postgres RPC 안에서만(앱단 순차 삭제 금지)
- **Storage는 앱단**: Postgres가 못 지우는 Storage object는 RPC 호출 **전에** 앱(service role)이 제거
- **SSOT 준수**: 증빙 파일은 `evidence_file.storage_path`를 단일 원천으로 수집
- **방어적 권한**: RLS 우회(service role) 경로이므로 인증 사용자 + user_organ 멤버십을 명시 검증
- **검증 가능한 확인 게이트**: 검증 불가한 비밀번호 prompt 대신 **기관명 정확 입력 확인**(reset 페이지 패턴 개선)

---

## 2. Architecture

### 2.1 Component Diagram

```
┌──────────────────────┐   ① preview/delete   ┌────────────────────────┐
│  select-organ/page   │ ───────────────────▶ │  /api/organ/route.ts   │
│  (삭제 모달 UI)       │                       │  (service role)        │
│  dashboard/organ     │ ◀─────────────────── │                        │
└──────────────────────┘   counts / result     └───────────┬────────────┘
        │ 현재 org 삭제 시                                    │
        ▼ clearOrgan() + redirect                ② 인증 사용자(SSR cookie)
┌──────────────────────┐                         ③ user_organ 멤버십 검증
│  stores/auth.ts      │                         ④ evidence storage_path 수집
└──────────────────────┘                                    │
                                          ┌─────────────────┼──────────────────┐
                                          ▼ (앱단)           ▼ (DB 트랜잭션)
                              ┌──────────────────────┐  ┌──────────────────────────┐
                              │ Storage.remove(paths)│  │ rpc delete_org_data(orgId)│
                              │  evidence 버킷        │  │  자식→organ 원자 삭제      │
                              └──────────────────────┘  └──────────────────────────┘
```

### 2.2 Data Flow

```
[삭제 클릭]
  → POST /api/organ {action:"preview", orgId}
  → 영향 집계(수입/지출/증빙/자산) 반환 → 모달에 표시
[기관명 정확 입력 + 삭제 확정]
  → POST /api/organ {action:"delete", orgId}
     1) SSR 쿠키로 인증 user 확인 (없으면 401)
     2) user_organ(user_id, org_id) 멤버십 확인 (없으면 403)
     3) evidence_file.storage_path[] 수집 → storage.remove() (실패는 경고 로깅, 진행)
     4) rpc delete_org_data(org_id) 트랜잭션 삭제 → 삭제 건수 반환
  → 성공 응답
[현재 선택 org였다면] clearOrgan() → /select-organ (남은 0개면 /register-organ)
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| `/api/organ/route.ts` | `@supabase/supabase-js`(service role), `lib/supabase/server`(SSR auth), `lib/evidence/storage-path`(EVIDENCE_BUCKET) | 권한검증 + Storage 정리 + RPC 호출 |
| RPC `delete_org_data` | pfam 스키마 테이블 | 원자적 자식→organ 삭제 |
| `select-organ/page.tsx` | `stores/auth`(clearOrgan), API | 삭제 UI/모달, 현재 org 처리 |

---

## 3. Data Model

### 3.1 삭제 대상 테이블 & FK CASCADE 맵

> 출처: `app/scripts/001_create_tables.sql`, `007_evidence_file_table.sql`, `011_customer_org_id.sql`

| # | 테이블 | org 연결 컬럼 | ON DELETE CASCADE | 삭제 방식 |
|---|--------|---------------|:-----------------:|-----------|
| 1 | `evidence_file` | `org_id` + `acc_book_id`→acc_book(CASCADE) | acc_book 삭제 시 DB행 자동 | **DB행은 ②acc_book로 cascade**, 단 Storage 파일은 앱단 선삭제 |
| 2 | `acc_book_bak` | `org_id` (FK 없음) | ❌ | 명시 삭제 |
| 3 | `acc_book` | `org_id`→organ | ❌ | 명시 삭제 (→evidence_file cascade 트리거) |
| 4 | `estate` | `org_id`→organ | ❌ | 명시 삭제 |
| 5 | `opinion` | `org_id`(PK)→organ | ❌ | 명시 삭제 |
| 6 | `backup_history` | `org_id`→organ | ❌ | 명시 삭제 |
| 7 | `col_organ` | `org_id`(PK) | ❌ | 명시 삭제 (존재 시) |
| 8 | `sum_rept` | `org_id` | ❌ | 명시 삭제 (존재 시) |
| 9 | `alarm` | `org_id` | ❌ | 명시 삭제 (존재 시) |
| 10 | `customer` | `org_id`(011, nullable) | ❌ | **`org_id = p_org_id` 인 행만** (NULL=공용/익명 보존) |
| 11 | `customer_addr` | `cust_id`→customer | ❌ | customer 선삭제 전 cust_id 기준 삭제 |
| 12 | `user_organ` | `org_id`→organ | ❌ | 명시 삭제 (해당 org 매핑 전부) |
| 13 | `organ` | `org_id`(PK) | — | 최종 삭제 |

> **acc_book ↔ customer 상호참조 주의**: `acc_book.cust_id`→customer(FK). 따라서 **acc_book을 customer보다 먼저** 삭제해야 함. customer_addr는 customer보다 먼저.

### 3.2 확정 삭제 순서 (RPC 내부)

```
1. customer_addr   (cust_id ∈ 해당 org customer)
2. evidence_file   (org_id = p_org_id)         ← Storage 파일은 이미 앱단 제거됨
3. acc_book_bak    (org_id = p_org_id)
4. acc_book        (org_id = p_org_id)
5. estate          (org_id = p_org_id)
6. opinion         (org_id = p_org_id)
7. backup_history  (org_id = p_org_id)
8. col_organ       (org_id = p_org_id)   -- 테이블 존재 시
9. sum_rept        (org_id = p_org_id)   -- 테이블 존재 시
10. alarm          (org_id = p_org_id)   -- 테이블 존재 시
11. customer       (org_id = p_org_id)   -- NULL(공용/익명) 보존
12. user_organ     (org_id = p_org_id)
13. organ          (org_id = p_org_id)
```

> evidence_file은 acc_book cascade로도 지워지지만, `unlinked`(acc_book_id NULL) 증빙이 있을 수 있어 **org_id 기준 명시 삭제**로 누락 방지.

### 3.3 RPC 정의 (신규: `app/scripts/012_delete_org_data.sql`)

```sql
-- 012_delete_org_data.sql
-- 사용기관 원자적 삭제 RPC (organ-deletion design §3)
CREATE OR REPLACE FUNCTION pfam.delete_org_data(p_org_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  c_customer_addr INT; c_evidence INT; c_bak INT; c_acc INT;
  c_estate INT; c_opinion INT; c_backup INT; c_customer INT; c_user INT; c_organ INT;
BEGIN
  -- 1) customer_addr (해당 org customer의 주소)
  DELETE FROM pfam.customer_addr ca
   USING pfam.customer c
   WHERE ca.cust_id = c.cust_id AND c.org_id = p_org_id;
  GET DIAGNOSTICS c_customer_addr = ROW_COUNT;

  -- 2) evidence_file
  DELETE FROM pfam.evidence_file WHERE org_id = p_org_id;
  GET DIAGNOSTICS c_evidence = ROW_COUNT;

  -- 3) acc_book_bak
  DELETE FROM pfam.acc_book_bak WHERE org_id = p_org_id;
  GET DIAGNOSTICS c_bak = ROW_COUNT;

  -- 4) acc_book (→ 남은 evidence_file cascade)
  DELETE FROM pfam.acc_book WHERE org_id = p_org_id;
  GET DIAGNOSTICS c_acc = ROW_COUNT;

  -- 5) estate / 6) opinion / 7) backup_history
  DELETE FROM pfam.estate WHERE org_id = p_org_id;        GET DIAGNOSTICS c_estate = ROW_COUNT;
  DELETE FROM pfam.opinion WHERE org_id = p_org_id;       GET DIAGNOSTICS c_opinion = ROW_COUNT;
  DELETE FROM pfam.backup_history WHERE org_id = p_org_id;GET DIAGNOSTICS c_backup = ROW_COUNT;

  -- 8~10) col_organ/sum_rept/alarm — 존재할 때만 (to_regclass 가드)
  IF to_regclass('pfam.col_organ') IS NOT NULL THEN DELETE FROM pfam.col_organ WHERE org_id = p_org_id; END IF;
  IF to_regclass('pfam.sum_rept')  IS NOT NULL THEN DELETE FROM pfam.sum_rept  WHERE org_id = p_org_id; END IF;
  IF to_regclass('pfam.alarm')     IS NOT NULL THEN DELETE FROM pfam.alarm     WHERE org_id = p_org_id; END IF;

  -- 11) customer (공용/익명 NULL 보존)
  DELETE FROM pfam.customer WHERE org_id = p_org_id;      GET DIAGNOSTICS c_customer = ROW_COUNT;

  -- 12) user_organ
  DELETE FROM pfam.user_organ WHERE org_id = p_org_id;    GET DIAGNOSTICS c_user = ROW_COUNT;

  -- 13) organ
  DELETE FROM pfam.organ WHERE org_id = p_org_id;         GET DIAGNOSTICS c_organ = ROW_COUNT;

  RETURN jsonb_build_object(
    'org_id', p_org_id, 'organ_deleted', c_organ,
    'acc_book', c_acc, 'acc_book_bak', c_bak, 'evidence_file', c_evidence,
    'estate', c_estate, 'opinion', c_opinion, 'backup_history', c_backup,
    'customer', c_customer, 'customer_addr', c_customer_addr, 'user_organ', c_user
  );
END;
$$;

GRANT EXECUTE ON FUNCTION pfam.delete_org_data(BIGINT) TO service_role;
```

> 단일 함수 본문 = 단일 트랜잭션. 중간 에러 발생 시 전체 자동 롤백(부분 삭제 없음).

---

## 4. API Specification

### 4.1 Endpoint List

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/organ` (action=`preview`) | 삭제 영향 건수 집계 | 로그인 + org 멤버십 |
| POST | `/api/organ` (action=`delete`) | 사용기관 영구 삭제 | 로그인 + org 멤버십 |

> 프로젝트 action-dispatch 컨벤션 준수. 클라이언트는 service role을 직접 쓰지 않고 본 라우트 경유.

### 4.2 Detailed Specification

#### `POST /api/organ` — action: "preview"

**Request:**
```json
{ "action": "preview", "orgId": 10 }
```

**Response (200):**
```json
{
  "orgId": 10,
  "orgName": "2026 오준석 후원회",
  "counts": {
    "income": 55, "incomeAmt": 12000000,
    "expense": 30, "expenseAmt": 8000000,
    "evidence": 12, "estate": 2, "customer": 18, "backup": 1
  }
}
```

#### `POST /api/organ` — action: "delete"

**Request:**
```json
{ "action": "delete", "orgId": 10 }
```

**Response (200):**
```json
{
  "deleted": true,
  "orgName": "2026 오준석 후원회",
  "storageRemoved": 12,
  "storageFailed": 0,
  "result": { "organ_deleted": 1, "acc_book": 85, "evidence_file": 12, "customer": 18, "...": "..." }
}
```

**처리 순서 (서버):**
1. `createSupabaseServer()` → `auth.getUser()` → 없으면 401
2. service role로 `user_organ.select().eq(user_id).eq(org_id)` → 0건이면 403
3. `evidence_file.select(storage_path).eq(org_id)` → `storage.from("evidence").remove(paths)` (실패 path는 `storageFailed`로 집계, 차단하지 않음)
4. `rpc("delete_org_data", { p_org_id: orgId })` → 결과 반환
5. 실패 시 500 + 에러 메시지

### 4.3 Error Responses

| Code | 조건 | 클라이언트 처리 |
|------|------|----------------|
| 400 | `orgId`/`action` 누락·형식오류 | 입력 재확인 |
| 401 | 비로그인(세션 없음) | `/login` 이동 |
| 403 | 해당 org 비소속 | "권한 없음" 알림 |
| 404 | org 미존재(이미 삭제됨) | 목록 새로고침 |
| 500 | RPC/Storage 오류 | 에러 토스트 + 재시도 안내 |

**Error format:**
```json
{ "error": "사용자 친화 메시지" }
```

---

## 5. UI/UX Design

### 5.1 Screen Layout — select-organ 삭제 모달

```
┌──────────────────────────────────────────┐
│  사용기관 삭제                       [✕]   │
├──────────────────────────────────────────┤
│  ⚠ 삭제된 자료는 복구할 수 없습니다.        │
│                                          │
│  "2026 오준석 후원회"의 모든 데이터가      │
│   삭제됩니다:                             │
│   • 수입 55건 / 지출 30건                 │
│   • 증빙파일 12건, 자산 2건, 수입지출처 18건│
│                                          │
│  확인을 위해 기관명을 그대로 입력하세요:    │
│  ┌────────────────────────────────────┐  │
│  │ [                                ] │  │
│  └────────────────────────────────────┘  │
│                       [취소]  [영구 삭제] │  ← 입력 일치 시에만 활성
└──────────────────────────────────────────┘
```

### 5.2 User Flow

```
select-organ (기관 카드)
  └ [삭제] 아이콘 클릭
     → preview 호출 → 모달 오픈(영향 표시)
     → 기관명 입력 == organ.org_name 일치 시 [영구 삭제] 활성
     → delete 호출
        ├ 성공 → 토스트("'{기관명}' 삭제 완료") → 목록에서 제거
        │   └ 삭제한 org == 현재 orgId → clearOrgan() → 라우팅 재평가
        │        ├ 남은 org ≥ 1 → /select-organ 갱신
        │        └ 남은 org 0   → /register-organ
        └ 실패 → 에러 토스트, 모달 유지
```

### 5.3 Component List

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `select-organ/page.tsx` (수정) | `src/app/select-organ/` | 카드별 삭제 버튼 + 삭제 모달 상태/호출 |
| `OrganDeleteDialog` (신규, 인라인 또는 분리) | `src/app/select-organ/` 또는 `src/components/` | 미리보기·기관명 확인·삭제 실행 UI |
| `dashboard/organ/page.tsx` (수정) | `src/app/dashboard/organ/` | 현재 기관 삭제 진입점(선택) |
| `stores/auth.ts` (수정) | `src/stores/` | `clearOrgan()` 액션 추가(user 유지, org만 초기화) |

> **auth store 변경**: 기존 `clear()`는 user까지 비움 → 로그인 유지한 채 org만 비우는 `clearOrgan()` 신규 추가. `partialize` 대상(orgId 등) 초기화.

### 5.4 DESIGN.md 준수

- 파괴적 동작: `Button variant="destructive"`, 경고 배너는 reset 페이지의 `bg-red-50 border-red-200 text-red-800` 톤 재사용
- 모달은 기존 `components/ui/dialog` 사용(신규 디자인 토큰 도입 없음)

---

## 6. Error Handling

### 6.1 Error Code Definition

| Code | Message | Cause | Handling |
|------|---------|-------|----------|
| 400 | "orgId가 필요합니다" | 파라미터 누락 | 클라이언트 검증 |
| 401 | "로그인이 필요합니다" | 세션 만료 | 로그인 이동 |
| 403 | "해당 기관에 대한 권한이 없습니다" | user_organ 비소속 | 알림 후 목록 복귀 |
| 500 | "삭제 중 오류가 발생했습니다" | RPC/트랜잭션 실패 | 전체 롤백됨, 재시도 안내 |

### 6.2 부분 실패 정책

- **Storage 일부 실패**: 차단하지 않고 `storageFailed` 카운트로 응답에 노출 + 서버 로그(`console.error`). DB 삭제는 진행(기존 evidence-file DELETE의 "고아 가능" 경고 패턴과 일관).
- **RPC 실패**: 트랜잭션 자동 롤백 → DB 무변경. 단, 이 경우 이미 지워진 Storage 파일과 DB 불일치 가능 → **Storage 삭제를 RPC 성공 후로 미루는 대안**도 검토(§아래 트레이드오프).

> **트레이드오프 결정**: Storage 삭제를 RPC **이전**에 수행(현 설계). 사유: RPC 성공 후 Storage 삭제 시 앱이 죽으면 DB는 지워졌는데 파일이 남는 고아가 더 흔함. 반대로 RPC 실패는 드물고, 실패해도 evidence_file 행이 남아 재시도로 동일 path 재삭제 가능. → **Storage 먼저, RPC 나중**.

---

## 7. Security Considerations

- [x] **인증**: SSR 쿠키 기반 `auth.getUser()`로 실제 로그인 사용자 확인(클라이언트가 보낸 userId 신뢰 금지)
- [x] **인가**: service role은 RLS 우회 → `user_organ` 멤버십 명시 검증으로 타 org 삭제 차단
- [x] **입력 검증**: `orgId`는 정수 파싱, `action` 화이트리스트(`preview`/`delete`)
- [x] **확인 게이트**: 기관명 정확 일치 입력(검증 가능) — reset의 비검증 prompt 대비 강화
- [x] **최소 노출**: 클라이언트는 service role 키 미접근(전부 서버 라우트 경유)
- [ ] **Rate Limiting**: out of scope(기존 시스템 미적용과 일관), 단 삭제는 멤버십 게이트로 제한적

---

## 8. Test Plan

### 8.1 Test Scope

| Type | Target | Tool |
|------|--------|------|
| Unit | RPC 삭제 순서/카운트 로직, API 권한 분기 | Vitest |
| Unit | `clearOrgan()` 상태 초기화 | Vitest |
| Unit | 삭제 모달: 기관명 불일치 시 버튼 비활성 | Vitest + RTL |
| Integration(수동/실DB) | 실제 org 삭제 후 잔여 0 검증 | Supabase(개발) |

### 8.2 Test Cases (Key)

- [ ] Happy path: preview 집계 정확 → delete 성공 → 응답 counts 일치
- [ ] 권한: 타 org_id 삭제 시도 → 403, DB 무변경
- [ ] 비로그인: 세션 없음 → 401
- [ ] customer 보존: `org_id IS NULL`(공용/익명) customer는 삭제 후에도 잔존
- [ ] unlinked 증빙: acc_book_id NULL 증빙도 org_id 기준 삭제됨
- [ ] 현재 org 삭제: `clearOrgan()` 호출되고 orgId=null, user 유지
- [ ] 마지막 org 삭제: 라우팅 `/register-organ`
- [ ] Storage 일부 실패: `storageFailed>0`이어도 delete 성공 응답
- [ ] 기관명 불일치: [영구 삭제] 버튼 비활성

---

## 9. Clean Architecture

### 9.1 This Feature's Layer Assignment

| Component | Layer | Location |
|-----------|-------|----------|
| `OrganDeleteDialog`, select-organ 수정 | Presentation | `src/app/select-organ/` |
| `clearOrgan()` | Application(상태) | `src/stores/auth.ts` |
| `/api/organ/route.ts` | Infrastructure(서버) | `src/app/api/organ/` |
| `delete_org_data` RPC | Infrastructure(DB) | `app/scripts/012_delete_org_data.sql` |

### 9.2 Dependency Rule 준수

- Presentation(페이지) → fetch(`/api/organ`) 경유로만 DB 접근(직접 supabase 삭제 금지)
- 권한·트랜잭션 등 핵심 규칙은 Infrastructure(서버 라우트 + RPC)에 집중

---

## 10. Coding Convention Reference

### 10.1 This Feature's Conventions

| Item | Convention Applied |
|------|-------------------|
| API 라우트 | service role + anon 폴백 클라이언트, `db:{schema:"pfam"}`, action-dispatch |
| 컴포넌트 명명 | `OrganDeleteDialog` (PascalCase) |
| 파일/폴더 | route는 `api/organ/route.ts`, SQL은 `012_*.sql` 연번 |
| 에러 응답 | `{ error: string }` + 적절 status |
| Next.js 16 | 라우트 작성 전 `node_modules/next/dist/docs/` 확인(AGENTS.md) |

---

## 11. Implementation Guide

### 11.1 File Structure

```
app/
├── scripts/012_delete_org_data.sql           (신규 RPC)
├── src/app/api/organ/route.ts                (신규 API: preview/delete)
├── src/app/select-organ/page.tsx             (수정: 삭제 UI/모달)
├── src/app/dashboard/organ/page.tsx          (수정: 삭제 진입점 — 선택)
├── src/stores/auth.ts                        (수정: clearOrgan)
└── src/app/api/organ/route.test.ts (또는 인접 .test) (신규 테스트)
```

### 11.2 Implementation Order

1. [ ] `012_delete_org_data.sql` 작성 → 개발 DB 적용, 실 FK 관계(`information_schema`) 대조
2. [ ] `auth.ts`에 `clearOrgan()` 추가 + 단위 테스트
3. [ ] `/api/organ/route.ts` 구현(preview/delete, 인증·인가·Storage·RPC) + 단위 테스트
4. [ ] `select-organ/page.tsx` 삭제 버튼·모달·현재 org 처리 연동
5. [ ] (선택) `dashboard/organ/page.tsx` 진입점
6. [ ] lint/build/test 통과 → `/pdca analyze organ-deletion`

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-01 | 초안 — RPC 삭제순서, API 스키마, 모달 UX, 보안/테스트 설계 | DrunkenZealnut |
