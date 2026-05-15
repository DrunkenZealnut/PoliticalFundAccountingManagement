# DB Export 시 PFund2 로그인 ID/비밀번호 보정 — Design Document

> Plan: `docs/01-plan/features/db-export-login-id.plan.md`
> Project: 정치자금 회계관리 시스템
> Date: 2026-05-15
> Status: Draft

---

## 0. 설계 결정 요약 (Plan 의문점 해소)

| 의문점 | 결정 | 근거 |
|---|---|---|
| 후보자 자격증명을 DB 컬럼으로 둘지 | **컬럼 추가 안 함. FR-06 fallback 사용** | organ 스키마 변경 + RLS 정책 재검토 비용 대비 효용 작음. 페어 export 시 후원회 자격증명을 후보자 행에도 복제하는 단순화 채택. UI는 "별도 지정 시" 토글로 노출하되 미지정 = fallback. |
| `passwd` 보관 방식 | **평문** | PFund2 ORGAN.PASSWD가 평문 VARCHAR(20). 호환을 위해 동일하게 평문 저장. RLS로 본인 organ만 접근하도록 격리. |
| UI 진입점 | **`/dashboard/organ/page.tsx` 신규** | 폴더만 존재하고 page 없는 상태. 좌측 사이드바 메뉴에 "기관 정보" 링크 추가. |
| `/api/system/export-sqlite` 사전 검증 위치 | **GET 핸들러 시작부 (DDL 실행 전)** | 빠른 fail-fast. WASM/DDL 비용 회피. |
| 에러 코드 | **`PARITY-007: ORGAN_CREDENTIALS_MISSING` 신규 추가** | 기존 `parity-errors.ts` 패턴 따름. HTTP 400. |
| 입력 검증 라이브러리 | **native React state + 직접 validator 함수** | 입력 필드 4~6개. react-hook-form/zod 도입은 과함. 기존 customer page와 동일 스타일. |
| 비밀번호 표시 | **type="password" + 표시/숨김 토글** | 어깨너머 노출 차단 + 입력 검토 가능. |

---

## 1. Overview

### 1.1 Design Goals

1. 웹앱에서 만든 `.db`가 PFund2 [자료 복구] + 재로그인까지 막힘없이 통과되도록, 사용자가 PFund2 호환 자격증명을 입력할 수단 제공
2. 자격증명 누락 상태로 export되는 사고를 사전 차단
3. 후원회 단위에서도 후보자 계정 로그인이 가능하도록 페어 export 보강

### 1.2 Design Principles

- **Single source of truth**: `organ.userid` / `passwd` 한 곳에서만 관리 (Supabase Auth와 분리)
- **Fail-fast**: 자격증명 누락 시 export 라우트가 DDL 실행 전에 즉시 차단
- **Defense in depth**: 클라이언트 + 서버 양쪽에서 입력 검증
- **Minimal schema change**: organ 테이블 컬럼 추가 없이 기존 컬럼 활용

---

## 2. Architecture

### 2.1 Component Diagram

```text
┌────────────────────────────────────────────────────────────────┐
│ 1) 자격증명 등록 흐름                                          │
│                                                                │
│ ┌────────────────────┐    ┌────────────────────┐              │
│ │ /dashboard/organ   │ ─→ │ Supabase pfam.organ │              │
│ │  (OrganForm)       │    │  UPDATE WHERE       │              │
│ │  - userid          │    │   org_id = auth.uid │ (RLS)       │
│ │  - passwd          │    │                     │              │
│ │  - hint1/2         │    └────────────────────┘              │
│ │  - candidateCreds? │                                         │
│ └────────────────────┘                                         │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ 2) Export 흐름 (사전 검증 추가)                                │
│                                                                │
│ User clicks "DB 백업 다운로드"                                  │
│        │                                                       │
│        ▼                                                       │
│ GET /api/system/export-sqlite?orgId=...&orgName=...&            │
│      candUserid=...&candPasswd=...    ← optional 페어 정보      │
│        │                                                       │
│        ▼                                                       │
│ ┌────────────────────────────────────┐                         │
│ │ Step 0: 사전 검증 (NEW)            │                         │
│ │  - organ.userid 비어 있으면 → 400  │                         │
│ │  - PARITY-007 반환                  │                         │
│ └──────────────┬─────────────────────┘                         │
│                ▼                                               │
│ ┌────────────────────────────────────┐                         │
│ │ Step 1~N: 기존 DDL/Seed/Insert     │                         │
│ │  - buildOrganExport(org, {         │                         │
│ │      maskPasswd: false,            │                         │
│ │      candidateCredentials: {       │ ← NEW 옵션               │
│ │        userid: candUserid          │                         │
│ │        ?? organ.userid,            │ ← fallback (FR-06)       │
│ │        passwd: candPasswd          │                         │
│ │        ?? organ.passwd,            │                         │
│ │      },                            │                         │
│ │    })                              │                         │
│ └──────────────┬─────────────────────┘                         │
│                ▼                                               │
│         .db (binary)                                           │
│                ▼                                               │
│         사용자 다운로드 → PFund2 [자료 복구] → 등록한 ID/PW로 로그인 │
└────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow

```text
[클라이언트] OrganForm.handleSubmit
    ↓ supabase.from("organ").update({userid, passwd, hint1, hint2}).eq("org_id", orgId)
[Supabase RLS] org_id == auth.uid()의 user_organ 매핑 검증
    ↓
[저장 성공] → toast "선관위 프로그램 로그인 정보가 저장되었습니다"

──────────────────────────────────────────────────

[백업 페이지] handleDownload (또는 backup 페이지의 기존 핸들러)
    ↓ fetch GET /api/system/export-sqlite?orgId=...
[API 사전 검증]
    organ row 조회 → userid OR passwd 빈 값?
        Yes → throw ParityErrors.organCredentialsMissing({ organId })
        No  → DDL + seed + insert + buildOrganExport
    ↓
[200 응답] .db ArrayBuffer
[400 응답] { error: { code: "PARITY-007", message, details: { organId } } }
    ↓ 클라이언트 에러 핸들러
    "선관위 프로그램 로그인 정보가 등록되지 않았습니다. [기관 정보 등록하러 가기] 버튼"
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| `dashboard/organ/page.tsx` | `useAuth`, `supabase` client, `Card/Input/Button/Label` | 자격증명 입력 폼 |
| `export-sqlite/route.ts` | `ParityErrors.organCredentialsMissing` (NEW), `buildOrganExport` (수정) | 사전 검증 + 페어 자격증명 전달 |
| `organ-pair.ts` | — (자체 모듈) | `candidateCredentials` 옵션 처리 |
| `parity-errors.ts` | — | `PARITY-007: ORGAN_CREDENTIALS_MISSING` 추가 |

---

## 3. Data Model

### 3.1 기존 컬럼 재활용 (스키마 변경 없음)

```sql
-- pfam.organ (변경 없음 — 주석만 정정 예정)
CREATE TABLE pfam.organ (
  org_id    SERIAL PRIMARY KEY,
  org_sec_cd INTEGER NOT NULL,
  org_name  VARCHAR(100) NOT NULL,
  reg_num   VARCHAR(13) NOT NULL,
  ...
  userid    VARCHAR(20),    -- 변경: 주석 "PFund2 ORGAN.USERID — Supabase Auth와 무관"
  passwd    VARCHAR(100),   -- 변경: 주석 "PFund2 ORGAN.PASSWD — 평문, RLS로 격리"
  hint1     VARCHAR(50),
  hint2     VARCHAR(50),
  ...
);
```

**주의**: `passwd VARCHAR(100)`이지만 PFund2 ORGAN.PASSWD는 VARCHAR(20). 클라이언트/서버 검증에서 20자 상한 적용.

### 3.2 클라이언트 폼 모델

```typescript
// app/src/app/dashboard/organ/page.tsx 내부 타입
interface OrganFormState {
  userid: string;          // 1~20자, [A-Za-z0-9_]
  passwd: string;          // 1~20자, 빈 값 금지
  hint1: string;           // 0~50자
  hint2: string;           // 0~50자
  // 페어 export 옵션 (org_sec_cd가 후원회일 때만 노출)
  useSeparateCandidateCredentials: boolean;
  candidateUserid?: string;
  candidatePasswd?: string;
}

interface OrganRow {
  org_id: number;
  org_sec_cd: number;
  org_name: string;
  userid: string | null;
  passwd: string | null;
  hint1: string | null;
  hint2: string | null;
}
```

### 3.3 페어 export 시 사용자가 추가로 전달하는 값 (URL query)

```text
GET /api/system/export-sqlite
  ?orgId=11
  &orgName=오준석후보
  &candUserid=ohjunsuk      ← optional, 후원회일 때만 의미 있음
  &candPasswd=1234           ← optional
```

→ `candidateCredentials` 옵션 빌드:
- 둘 다 비어 있으면 → fallback (organ.userid/passwd로 동일하게 복제)
- 둘 다 채워져 있으면 → 후보자 행에 그 값 사용
- 한쪽만 채워져 있으면 → 400 PARITY-007 details에 `candidate_partial`

---

## 4. API Specification

### 4.1 신규/변경 엔드포인트

| Method | Path | 변경 유형 | 설명 |
|--------|------|----------|------|
| GET | `/api/system/export-sqlite` | **수정** | 사전 검증 추가 + `candUserid`/`candPasswd` query 추가 |
| (직접 supabase) | `pfam.organ` UPDATE | — | 클라이언트가 RLS 정책으로 직접 update. 별도 API 라우트 미생성. |

별도 `/api/organ-credentials` 라우트는 만들지 않는다. 이유: 기존 dashboard 페이지(`customer`, `codes` 등)도 `@/lib/supabase/client.ts`로 직접 update하고 있고, RLS 정책이 이미 본인 `org_id`만 update 허용한다고 가정. 패턴 일관성 우선.

### 4.2 GET /api/system/export-sqlite 변경 사양

**Request (변경)**:
```text
GET /api/system/export-sqlite
  ?orgId={number, required}
  &orgName={string, optional, default="data"}
  &candUserid={string, optional, max 20}    ← NEW
  &candPasswd={string, optional, max 20}    ← NEW
```

**Response (200)**: 기존 동일 — `Content-Type: application/x-sqlite3` 바이너리

**Response (400) — NEW**:
```json
{
  "error": {
    "code": "PARITY-007",
    "message": "선관위 프로그램 로그인 정보(사용자ID/비밀번호)가 등록되지 않았습니다",
    "details": {
      "organId": 11,
      "missing": ["userid", "passwd"],
      "actionUrl": "/dashboard/organ"
    }
  }
}
```

**Response (400) — candidate partial**:
```json
{
  "error": {
    "code": "PARITY-007",
    "message": "후보자 계정 자격증명은 ID/비밀번호 둘 다 입력하거나 둘 다 비워야 합니다",
    "details": {
      "organId": 11,
      "candidate_partial": true
    }
  }
}
```

### 4.3 ParityErrors 확장

`app/src/lib/accounting/parity-errors.ts`:

```typescript
// PARITY_ERROR_CODES에 추가
ORGAN_CREDENTIALS_MISSING: "PARITY-007",

// ParityErrors에 팩토리 추가
organCredentialsMissing(details?: Record<string, unknown>): ParityError {
  return new ParityError(
    PARITY_ERROR_CODES.ORGAN_CREDENTIALS_MISSING,
    "선관위 프로그램 로그인 정보(사용자ID/비밀번호)가 등록되지 않았습니다",
    400,
    details,
  );
},
```

---

## 5. UI/UX Design

### 5.1 화면 레이아웃 — `/dashboard/organ`

```text
┌─────────────────────────────────────────────────────────────┐
│  대시보드 > 기관 정보                                       │
│                                                             │
│  [기관 식별 정보] (읽기 전용)                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 기관 ID:       11                                   │    │
│  │ 기관 종류:     (예비)후보자후원회 (cv_id=109)        │    │
│  │ 기관명:        동대문구라선거구... 오준석후원회       │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  [선관위 프로그램 로그인 정보] ← NEW 섹션                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ℹ️ 이 정보는 다운로드한 .db 파일을 선관위 정치자금   │    │
│  │   회계관리 프로그램에서 [자료 복구] 후 재로그인할   │    │
│  │   때 사용됩니다.                                    │    │
│  │                                                     │    │
│  │ 사용자 ID *    [ohjunsuk        ]  (영문/숫자/_)    │    │
│  │ 비밀번호 *     [••••••••] [👁]    (1~20자)          │    │
│  │ 비밀번호 힌트1 [어머니 성함        ]                │    │
│  │ 비밀번호 힌트2 [고향               ]                │    │
│  │                                                     │    │
│  │ ☐ 후보자 계정 자격증명을 별도로 지정                │    │
│  │   (후원회 단위일 때만 노출)                         │    │
│  │ ┌─────────────────────────────────────────────┐    │    │
│  │ │ 후보자 ID      [...]                        │    │    │
│  │ │ 후보자 비밀번호 [...] [👁]                  │    │    │
│  │ └─────────────────────────────────────────────┘    │    │
│  │                                                     │    │
│  │              [저장] [취소]                          │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 User Flow

```text
[처음 등록]
대시보드 → 사이드바 "기관 정보" 클릭 → /dashboard/organ
  → 사용자 ID/PW/힌트 입력 → [저장]
  → toast "저장됨" → 자동으로 supabase update
  → backup 페이지로 이동 (또는 그대로 머묾)

[Export 차단 시나리오]
backup 페이지 → [DB 백업 다운로드] 클릭
  → fetch GET /api/system/export-sqlite
  → 400 PARITY-007
  → 다이얼로그 "선관위 프로그램 로그인 정보가 없습니다.
                먼저 기관 정보를 등록해 주세요."
                [기관 정보 등록하러 가기] → /dashboard/organ
                [취소]

[페어 export 시나리오]
/dashboard/organ에서 "후보자 계정 자격증명 별도 지정" 체크
  → 후보자 ID/PW 입력 (DB에는 저장하지 않음, 세션 상태로만)
  → 사용자가 backup 페이지로 이동 시 sessionStorage에서 읽어
     export-sqlite 호출 시 query string에 포함
```

### 5.3 컴포넌트 목록

| 컴포넌트 | 위치 | 역할 |
|---------|------|------|
| `OrganInfoPage` | `app/src/app/dashboard/organ/page.tsx` | 페이지 본체. `useAuth` + supabase로 organ 로드/저장 |
| `OrganIdentityCard` | 동일 파일 내부 컴포넌트 | 읽기 전용 기관 식별 정보 |
| `OrganCredentialsForm` | 동일 파일 내부 컴포넌트 | 자격증명 입력 폼 (validator 포함) |
| `PasswordInput` | 동일 파일 내부 컴포넌트 | `type="password"` + 표시/숨김 토글 (재사용 가능하면 `components/ui/`로 이동 검토) |
| (수정) `dashboard/backup` 또는 export 트리거 페이지 | `app/src/app/dashboard/backup/page.tsx` 또는 `submit/page.tsx` | 400 PARITY-007 응답 처리 + 다이얼로그 |
| (메뉴) 사이드바 메뉴 항목 | `app/src/app/dashboard/layout.tsx` | "기관 정보" 링크 추가 |

### 5.4 검증 규칙 (클라이언트)

```typescript
function validateUserid(value: string): string | null {
  if (!value) return "필수 입력입니다";
  if (value.length > 20) return "최대 20자까지 입력 가능합니다";
  if (!/^[A-Za-z0-9_]+$/.test(value)) return "영문, 숫자, 언더스코어(_)만 사용 가능합니다";
  return null;
}

function validatePasswd(value: string): string | null {
  if (!value) return "필수 입력입니다";
  if (value.length > 20) return "최대 20자까지 입력 가능합니다 (선관위 프로그램 제약)";
  return null;
}

function validateHint(value: string): string | null {
  if (value.length > 50) return "최대 50자까지 입력 가능합니다";
  return null;
}
```

---

## 6. Error Handling

### 6.1 신규 에러 코드

| Code | HTTP | Message | Cause | Handling |
|------|------|---------|-------|----------|
| `PARITY-007` | 400 | 선관위 프로그램 로그인 정보가 등록되지 않았습니다 | export 시 `organ.userid` 또는 `passwd` 빈 값 | `details.actionUrl` 링크로 organ 페이지 안내 |
| `PARITY-007` | 400 | 후보자 자격증명 partial | `candUserid`만 있거나 `candPasswd`만 있을 때 | 둘 다 입력 또는 둘 다 제거 안내 |

### 6.2 클라이언트 에러 응답 처리 (백업 페이지)

```typescript
async function handleExport() {
  const res = await fetch(`/api/system/export-sqlite?orgId=${orgId}&orgName=${orgName}`);
  if (!res.ok) {
    const body = await res.json();
    if (body?.error?.code === "PARITY-007") {
      const actionUrl = body.error.details?.actionUrl ?? "/dashboard/organ";
      setErrorDialog({
        title: "선관위 프로그램 로그인 정보 필요",
        message: body.error.message,
        primaryAction: { label: "등록하러 가기", href: actionUrl },
      });
      return;
    }
    setErrorDialog({ title: "다운로드 실패", message: body?.error?.message ?? "Unknown" });
    return;
  }
  // 정상 다운로드 처리
}
```

---

## 7. Security Considerations

| 항목 | 처리 |
|------|------|
| 비밀번호 평문 저장 | Supabase pfam.organ에 평문. RLS로 본인 organ만 select/update. PFund2 호환 필수 (해싱 시 PFund2 로그인 불가) |
| 비밀번호 전송 | HTTPS (기존). URL query는 GET이지만 로그에 잔존 우려 → **TODO: 페어 자격증명은 POST body로 받는 형태도 검토** (1차는 GET query로 단순화. 다음 iteration에서 POST 보강) |
| RLS 정책 | 기존 `organ` 정책에 변경 없음. update 권한이 본인 organ에만 있는지 마이그레이션 검토 |
| XSS / Injection | `Input` 컴포넌트는 React가 자동 escape. SQL은 Supabase ORM이 처리. |
| 비밀번호 표시/숨김 토글 | 어깨너머 노출 차단. 단 토글 시 sessionStorage에 잔존 안 함 (React state만) |
| 비밀번호 정책 | PFund2가 약한 비밀번호 허용하므로 별도 강제 없음. 단 "1234" 같은 약한 비밀번호는 UI 경고만 (블록 안 함) |
| 페어 자격증명 sessionStorage | 페이지 이동 시 보관 → 탭 닫으면 사라짐. localStorage 사용 금지 |

---

## 8. Test Plan

### 8.1 Test Scope

| 유형 | 대상 | 도구 |
|------|------|------|
| Unit | `organ-pair.ts`의 `candidateCredentials` 옵션 | Vitest |
| Unit | `parity-errors.ts`의 `organCredentialsMissing` | Vitest |
| Component | `OrganInfoPage` 렌더링/저장 | Vitest + RTL + happy-dom |
| Integration | `/api/system/export-sqlite` 사전 검증 | Vitest (mock supabase) |
| UAT | 실 PFund2 환경 [자료 복구] + 로그인 | 사용자 수동 |

### 8.2 핵심 테스트 케이스

**Unit — organ-pair.ts**:
- [ ] `buildOrganExport(supporter, { candidateCredentials: undefined })` → 후보자 행 USERID/PASSWD = supporter.userid/passwd (fallback, FR-06)
- [ ] `buildOrganExport(supporter, { candidateCredentials: { userid: "x", passwd: "y" } })` → 후보자 행 USERID="x", PASSWD="y"
- [ ] `buildOrganExport(party, { ... })` → 단일 row, candidateCredentials 무시 (페어 없음)

**Unit — parity-errors.ts**:
- [ ] `ParityErrors.organCredentialsMissing({ organId: 11, missing: ["userid"] })` → code = "PARITY-007", httpStatus = 400

**Integration — export-sqlite**:
- [ ] organ.userid = null → 400 PARITY-007
- [ ] organ.passwd = "" → 400 PARITY-007
- [ ] organ 정상 + candUserid만 있고 candPasswd 없음 → 400 PARITY-007 (candidate_partial)
- [ ] organ 정상 + 페어 자격증명 둘 다 비어 있음 → 200 + ORGAN.USERID/PASSWD 후보자 행에 fallback 적용
- [ ] organ 정상 + 페어 자격증명 둘 다 있음 → 200 + 후보자 행 = 입력값, 후원회 행 = organ값

**Component — OrganInfoPage**:
- [ ] 페이지 마운트 시 supabase에서 현재 orgId organ 데이터 로드
- [ ] userid에 한글 입력 시 검증 메시지 노출
- [ ] passwd 21자 입력 시 검증 메시지 노출
- [ ] [저장] 클릭 시 supabase.update 호출, 성공 시 toast
- [ ] 후원회 organ일 때 "후보자 자격증명 별도 지정" 체크박스 노출
- [ ] 후보자 organ일 때 체크박스 비노출

**E2E — 수동 UAT** (개발자/사용자 합동):
1. `/dashboard/organ`에서 userid="ohjunsuk", passwd="1234" 저장
2. backup 페이지 → DB 백업 다운로드
3. 다운로드된 `.db`를 윈도우 PFund2에서 [자료 복구]
4. PFund2 로그인 화면에서 ohjunsuk / 1234 입력 → 로그인 성공
5. 메인 화면에서 데이터 정상 표시

---

## 9. Clean Architecture

이 프로젝트는 Starter 레벨로 layer 분리가 엄격하지 않다. 본 기능의 파일 배치:

| 컴포넌트 | 레이어 | 위치 |
|---------|--------|------|
| `OrganInfoPage` (UI) | Presentation | `app/src/app/dashboard/organ/page.tsx` |
| `validateUserid` / `validatePasswd` | Domain (pure) | 동일 파일 내부 또는 `app/src/lib/accounting/organ-validators.ts` (선택) |
| `buildOrganExport` 수정 | Domain | `app/src/lib/accounting/organ-pair.ts` (기존) |
| `ParityErrors.organCredentialsMissing` | Domain | `app/src/lib/accounting/parity-errors.ts` (기존) |
| `export-sqlite` 사전 검증 | Application/Infra | `app/src/app/api/system/export-sqlite/route.ts` (기존) |
| Supabase update 호출 | Infrastructure | OrganInfoPage 내부 `supabase` client 직접 호출 (기존 패턴) |

---

## 10. Coding Convention Reference

| 항목 | 적용 |
|------|------|
| Component naming | `OrganInfoPage` (PascalCase) |
| File naming | `page.tsx` (App Router 규칙) |
| State management | React `useState` (zustand 사용 안 함 — 폼 로컬 상태) |
| Form library | 없음 (native state + 직접 validator) |
| Error handling | `ParityError` 클래스 + `try/catch` (기존 패턴) |
| Validation | 클라이언트 직접 함수 + 서버 사전 검증 |
| Styling | Tailwind CSS v4 + shadcn/ui (`Card`, `Input`, `Label`, `Button`) |

---

## 11. Implementation Guide

### 11.1 파일 변경 계획

```text
app/src/
├── app/
│   ├── api/system/export-sqlite/route.ts   ← 사전 검증 추가, candidateCredentials 전달
│   └── dashboard/
│       ├── layout.tsx                       ← 사이드바 메뉴 "기관 정보" 추가
│       ├── organ/page.tsx                   ← 신규 작성 (메인 작업)
│       └── backup/page.tsx (있다면)         ← PARITY-007 에러 다이얼로그 처리
│         또는 submit/page.tsx, system 메뉴
├── lib/accounting/
│   ├── organ-pair.ts                        ← candidateCredentials 옵션 추가
│   ├── organ-pair.test.ts                   ← 테스트 3건 추가
│   ├── parity-errors.ts                     ← PARITY-007 추가
│   └── parity-errors.test.ts                ← PARITY-007 테스트 추가
└── scripts/
    └── 001_create_tables.sql                ← passwd 주석 정정 (마이그레이션 없음)
```

### 11.2 구현 순서

1. [ ] `lib/accounting/parity-errors.ts`에 `PARITY-007` + `organCredentialsMissing` 팩토리 추가
2. [ ] `lib/accounting/parity-errors.test.ts`에 케이스 추가
3. [ ] `lib/accounting/organ-pair.ts`에 `BuildOrganExportOptions.candidateCredentials` 추가
4. [ ] `buildOrganExport` 구현 수정 (옵션 파라미터 처리 + fallback)
5. [ ] `lib/accounting/organ-pair.test.ts`에 3건 추가
6. [ ] `/api/system/export-sqlite/route.ts` GET 핸들러 시작부에 사전 검증 + query 파싱
7. [ ] `dashboard/organ/page.tsx` 신규 작성
8. [ ] `dashboard/layout.tsx` 사이드바 메뉴 추가
9. [ ] backup 또는 export 트리거 페이지에서 PARITY-007 다이얼로그 처리
10. [ ] `scripts/001_create_tables.sql` 주석 정정
11. [ ] `npm run lint` + `npm run build` + `npm run test`
12. [ ] 수동 UAT (사용자가 실 PFund2로 시도)

### 11.3 의존성 설치

신규 패키지 없음. 기존 shadcn/ui 컴포넌트 그대로 사용.

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-05-15 | Initial draft — UI/API/데이터/테스트 설계 | Claude (사용자 지시) |
