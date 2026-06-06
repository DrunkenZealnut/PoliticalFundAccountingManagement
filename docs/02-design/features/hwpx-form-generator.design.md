# Design: 선관위 제출서류 HWPX 생성 페이지

> **Feature**: hwpx-form-generator
> **Created**: 2026-06-06
> **Status**: Design
> **Plan**: [hwpx-form-generator.plan.md](../../01-plan/features/hwpx-form-generator.plan.md)
> **선행 산출물**: `app/public/hwpx-templates/`(Phase 1 템플릿 6종 + `_token-manifest.json` + `README.md`) — 분할·토큰화·배경제거·생성 시뮬레이션 검증 완료

---

## 1. 개요

### 1.1 설계 목표

1. 사이드메뉴에서 서식을 골라 → 입력값을 받아 → `.hwpx`를 다운로드하는 단일 페이지 완성
2. **HWPX 생성 = 사전 제작 템플릿의 `{{토큰}}` 문자열 치환**(JSZip) — Vercel/Node 런타임에서 Python 없이 동작
3. organ/acc_book/customer DB로 **자동 prefill** + 빈 항목 **수동 보완**
4. 서식 추가가 데이터(필드 정의 + 템플릿 파일)만으로 가능한 **선언적 확장 구조**

### 1.2 설계 원칙

- **치환 우선 편집**: 템플릿 구조(문단·표·secPr)는 불변, 텍스트 노드만 치환 → 공식 레이아웃·쪽수 보존
- **단일 진실원천(SSOT)**: 서식 메타는 `submission-forms.ts`, 필드/토큰은 `form-fields.ts`, 토큰↔템플릿은 `_token-manifest.json`
- **순수 함수 분리**: 생성 코어(`lib/hwpx/generate.ts`)는 입력(템플릿 bytes + 값 맵) → 출력(bytes) 순수 함수 → 단위 테스트 용이
- **계층 분리**: Domain(타입) ← Infra(생성/조회) ← Application(prefill 조립) ← Presentation(페이지/폼)

---

## 2. 아키텍처

### 2.1 컴포넌트 다이어그램

```
┌──────────────────────────┐     ┌─────────────────────────────┐     ┌──────────────┐
│ Presentation             │     │ API (server route)          │     │ Storage/DB   │
│  submission-forms/page   │────▶│  POST /api/hwpx/generate    │────▶│ public/hwpx- │
│  FormCatalog             │     │   1) 템플릿 로드             │     │  templates/  │
│  FormInputPanel          │◀────│   2) 토큰 escape+치환        │◀────│ Supabase     │
│  (prefill 표시/수정)     │ hwpx│   3) JSZip 재패키징          │     │  organ/...   │
└──────────────────────────┘     └─────────────────────────────┘     └──────────────┘
        │ GET prefill                         ▲
        └─────────────────────────────────────┘ /api/hwpx/prefill (or 클라이언트 조회)
```

### 2.2 데이터 흐름 (생성 시퀀스)

```
사용자: 서식 선택(formId)
  → 페이지: form-fields.ts 에서 HwpxFormDef 조회 → 입력 폼 렌더
  → prefill: organ/acc_book/customer 조회 → source 매핑된 필드 자동 채움
  → 사용자: 빈 항목 입력 / 자동값 수정
  → "HWPX 생성" 클릭 → POST /api/hwpx/generate { formId, values }
      ① 템플릿 .hwpx 로드 (public/hwpx-templates/form-{id}.hwpx)
      ② section0.xml 추출(JSZip) → 각 값 escapeXml → {{token}} 치환
      ③ mimetype-first(STORED) 재패키징
      ④ Buffer 응답 (application/hwp+zip, attachment; filename=...)
  → 브라우저: .hwpx 다운로드 → 한글에서 열기
```

### 2.3 의존성

| 컴포넌트 | 의존 | 목적 |
|---|---|---|
| `/api/hwpx/generate` | `lib/hwpx/generate.ts`, `lib/hwpx/escape.ts`, `jszip` | 템플릿 치환·패키징 |
| `lib/hwpx/generate.ts` | `jszip` only | 순수 생성 코어 |
| prefill | `lib/supabase/server.ts`, `excel-template/data-query.ts`(재사용) | organ/거래 조회 |
| `FormInputPanel` | `form-fields.ts`, `useCodeValues`, shadcn/ui | 동적 폼 |
| 사이드메뉴 | `dashboard/layout.tsx` `MENU_ITEMS` | 진입점 |

### 2.4 신규 의존성

```
jszip   # Node/브라우저 호환 ZIP. mimetype-first(STORED) 제어
```
> 검증된 생성 로직은 현재 Python(ElementTree)로 PoC 완료. 런타임은 JSZip으로 동등 구현
> (치환은 section0.xml 문자열 replace, 구조 미파싱 → XML 직렬화 이슈 없음).

---

## 3. 데이터 모델

### 3.1 서식 필드 정의 (Domain)

```typescript
// lib/hwpx/form-fields.ts
export type PrefillSource =
  | { from: "organ"; column: "org_name" | "rep_name" | "acct_name" | "addr" | "tel" | "reg_num" }
  | { from: "auth"; key: "orgName" | "acctName" }
  | { from: "const"; value: string }              // 선거명/선거일 등 고정값
  | { from: "manual" };                            // 사용자 입력 전용

export interface HwpxFormField {
  token: string;            // 템플릿의 {{...}} (manifest와 일치)
  label: string;            // 화면 라벨
  type: "text" | "date" | "tel" | "regnum" | "account" | "textarea";
  source: PrefillSource;
  required?: boolean;
  editable?: boolean;       // prefill 후 수정 허용(기본 true)
}

export interface HwpxFormDef {
  id: string;               // submission-forms.ts id 와 연결 ("2-1" 등)
  template: string;         // "form-2-1.hwpx"
  fields: HwpxFormField[];
}

export const HWPX_FORM_DEFS: readonly HwpxFormDef[] = [ /* §3.3 매핑 */ ];
```

### 3.2 생성 요청/응답 (Domain)

```typescript
interface HwpxGenerateRequest {
  formId: string;                      // "2-1"
  values: Record<string, string>;      // { "회계책임자명": "홍길동", ... } (토큰 키, {{}} 제외)
}
// 응답: 200 → application/hwp+zip (Buffer), 4xx → { error: {...} }
```

### 3.3 토큰 ↔ DB prefill 매핑 (Application)

`_token-manifest.json`의 토큰을 organ/auth/const/manual에 매핑. 계좌 전용 테이블이 없어 **계좌 3종은 manual**(추후 계좌신고 데이터 연동 시 source 교체).

| 토큰 | type | source | 비고 |
|---|---|---|---|
| `{{선거명}}` | text | const "제9회 전국동시지방선거" | |
| `{{선거일}}` | date | const "2026-06-03" | |
| `{{후보자명}}` | text | organ.rep_name (또는 auth.orgName) | |
| `{{회계책임자명}}` | text | organ.acct_name / auth.acctName | |
| `{{회계책임자명_한자}}` | text | manual | 한자는 DB 미보유 |
| `{{회계책임자_주소}}` `{{후보자_주소}}` `{{대표자_주소}}` | text | organ.addr (+addr_detail) | |
| `{{회계책임자_전화}}` `{{후보자_전화}}` `{{대표자_전화}}` | tel | organ.tel | |
| `{{선거사무장명}}` | text | manual | |
| `{{선관위명}}` | text | manual | 관할 선관위 |
| `{{후원회명}}` `{{후원회_약칭}}` | text | organ.org_name | 후원회 org |
| `{{대표자명}}` | text | organ.rep_name | |
| `{{사무소_소재지}}` `{{사무소_전화}}` | text/tel | organ.addr / organ.tel | |
| `{{수입계좌_예금주/금융기관/번호}}` | account | manual | 계좌 데이터 소스 부재 |
| `{{지출계좌_예금주/금융기관/번호}}` | account | manual | 〃 |
| `{{대표자_자택전화}}` `{{대표자_휴대폰}}` | tel | manual / organ.tel | |

> 각 서식의 토큰 목록은 `_token-manifest.json` 참조. `HWPX_FORM_DEFS`는 이 매핑을 서식별로 구체화.

---

## 4. API 명세

기존 라우트 패턴(`/api/excel/export`) 준수: `NextResponse(buffer, { headers })`.
서비스 롤 키 사용 시 **org 스코프 필터 필수**(`.eq("org_id", orgId)`).

> ⚠️ Next.js 16 라우트 시그니처는 학습데이터와 다를 수 있음 — Do 단계에서
> `node_modules/next/dist/docs/` 확인 후 작성(AGENTS.md).

### 4.1 엔드포인트

| Method | Path | 설명 | Auth |
|--------|------|------|------|
| GET | `/api/hwpx/forms?orgSecCd=` | 조직타입별 HWPX 가능 서식 목록 | 필요 |
| GET | `/api/hwpx/prefill?formId=&orgId=` | 서식 필드 prefill 값 조회 | 필요 |
| POST | `/api/hwpx/generate` | 토큰 치환 → `.hwpx` 생성 | 필요 |

> `forms`/`prefill`은 클라이언트에서 직접 조회로 대체 가능(서버 라우트는 `generate`만 필수).

### 4.2 `POST /api/hwpx/generate`

**Request**
```json
{ "formId": "2-1", "values": { "회계책임자명": "홍길동", "수입계좌_금융기관": "국민은행", "...": "..." } }
```

**Response 200** — `application/hwp+zip`
```
Content-Type: application/hwp+zip
Content-Disposition: attachment; filename="회계책임자_선임신고서.hwpx"
(바이너리)
```

**처리 로직**
```typescript
1. HWPX_FORM_DEFS 에서 formId 조회 → 없으면 404 FORM_NOT_FOUND
2. 템플릿 로드: public/hwpx-templates/{def.template} (fs 또는 fetch) → 없으면 500 TEMPLATE_MISSING
3. generateHwpx(templateBytes, values):
   - JSZip.loadAsync → "Contents/section0.xml" 문자열 추출
   - 각 토큰: section0 = section0.replaceAll(`{{${key}}}`, escapeXml(value ?? ""))
   - 미치환 토큰 잔존 시 빈 문자열로 정리(또는 경고 로그)
   - zip.file("Contents/section0.xml", section0)
   - zip.generateAsync({ type:"nodebuffer", mimeType:"application/hwp+zip",
       compression:"DEFLATE" }) — ※ mimetype 엔트리는 STORED 보장 필요(§6.3)
4. NextResponse(buffer, { headers })
```

**에러**
- `400 INVALID_REQUEST`: formId/values 누락
- `404 FORM_NOT_FOUND`: 미정의 서식
- `422 MISSING_REQUIRED`: required 필드 미입력(서버 2차 검증)
- `500 TEMPLATE_MISSING` / `GENERATE_FAILED`

---

## 5. UI/UX 설계

### 5.1 화면 레이아웃 (`/dashboard/submission-forms`)

```
┌───────────────────────────────────────────────────────────┐
│ 선관위 제출서류                                            │
├──────────────────────┬────────────────────────────────────┤
│ [서식 카탈로그]      │  [입력 폼: 회계책임자 선임신고서]  │
│  검색: [________]    │  ┌──────────────────────────────┐  │
│  ▸ 회계책임자        │  │ 회계책임자명  [홍길동] 자동   │  │
│   • 2-1 선임신고서 ◀ │  │ 한자          [____]          │  │
│   • 2-2 취임동의서   │  │ 주소          [서울..] 자동    │  │
│  ▸ 예금계좌          │  │ 전화          [02-..] 자동     │  │
│   • 4 예금계좌신고서 │  │ 수입계좌 예금주[____] 수동     │  │
│  ▸ 인계·인수         │  │ ...                           │  │
│   • 1-1 인계인수서   │  │ [HWPX 생성 ⬇]  (미리보기 §12 유보) │  │
│  ▸ 후원회            │  └──────────────────────────────┘  │
│   • 27 등록신청서    │  ⚠ 필수 미입력: 선관위명           │
│   • 29 취임동의서    │                                    │
└──────────────────────┴────────────────────────────────────┘
```

- 좌: `FormCatalog` — `submission-forms.ts` × `HWPX_FORM_DEFS` 교집합을 카테고리별 그룹·검색·조직타입 필터
- 우: `FormInputPanel` — 선택 서식의 `fields`로 동적 렌더. 자동/수동 배지 구분, required 경고

### 5.2 사용자 흐름

```
대시보드 → 보고관리 > 선관위 제출서류 → 서식 선택
  → (자동 prefill) → 빈칸 입력/수정 → 미리보기(선택) → HWPX 생성 → 다운로드 → 한글 열기
```

### 5.3 사이드메뉴 통합

`dashboard/layout.tsx` `MENU_ITEMS`의 각 조직타입 **"보고관리"** 그룹에 추가:
```ts
{ href: "/dashboard/submission-forms", label: "선관위 제출서류" }
```
조직타입별 노출 서식은 `requiredFor`로 필터(후보자: 1-1·2-1·2-2·4 / 후원회: 27·29).

### 5.4 컴포넌트 목록

| 컴포넌트 | 위치 | 책임 |
|---|---|---|
| `SubmissionFormsPage` | `app/dashboard/submission-forms/page.tsx` | 페이지 컨테이너·상태 |
| `FormCatalog` | `components/submission-forms/FormCatalog.tsx` | 서식 목록/검색/필터 |
| `FormInputPanel` | `components/submission-forms/FormInputPanel.tsx` | 동적 입력 폼·prefill·검증 |
| `useHwpxPrefill` | `hooks/use-hwpx-prefill.ts` | organ/거래 조회 → 값 맵 |

---

## 6. 핵심 구현 상세

### 6.1 `lib/hwpx/escape.ts`

```typescript
export const escapeXml = (s: string) =>
  s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
   .replace(/"/g,"&quot;").replace(/'/g,"&apos;");
// 구현: fmtKoreanDate("2026-06-03"|"20260603") → "2026년 6월 3일"
export const fmtKoreanDate = (input: string) => /* ISO/YYYYMMDD → 한글표기 */;
```

### 6.2 `lib/hwpx/generate.ts` (순수 코어)

```typescript
import JSZip from "jszip";
export async function generateHwpx(template: ArrayBuffer, values: Record<string,string>): Promise<Buffer> {
  const zip = await JSZip.loadAsync(template);
  let sec = await zip.file("Contents/section0.xml")!.async("string");
  for (const [k,v] of Object.entries(values))
    sec = sec.split(`{{${k}}}`).join(escapeXml(v ?? "")); // 구현: 정규식 안전 위해 split/join
  sec = sec.replace(/\{\{[^}]+\}\}/g, "");          // 미입력 토큰 제거
  zip.file("Contents/section0.xml", sec);
  return zip.generateAsync({ type:"nodebuffer", compression:"DEFLATE" });
}
```

### 6.3 mimetype-first 보장 (중요)

HWPX는 `mimetype`이 **첫 엔트리·무압축(STORED)**이어야 함. JSZip의 `generateAsync`는
삽입 순서를 따르므로, 템플릿 로드 후 `mimetype`을 STORED로 유지해야 한다.
- 옵션 A: 템플릿의 mimetype 엔트리를 보존(JSZip가 기존 STORED 유지하는지 Do에서 검증)
- 옵션 B: 보장 안 되면 zip을 새로 만들어 `zip.file("mimetype", "application/hwp+zip", {compression:"STORE"})`를 **첫 번째로** 추가 후 나머지 복사
- 검증: 생성물에 `validate.py` 동등 체크(mimetype 첫엔트리·STORED·값) 단위 테스트화

### 6.4 토큰 단일 노드 불변식

토큰은 단일 `<hp:t>` 노드 안의 연속 문자열이어야 `replaceAll`로 안전 치환됨
(템플릿 제작 시 보장 — `README.md` 토큰 규칙). 신규 서식 추가 시 빌드타임에
"템플릿 내 모든 `{{토큰}}`이 manifest와 일치" 자동 점검(§9.2).

---

## 7. 에러 처리

| 코드 | 상황 | 처리 |
|---|---|---|
| 400 INVALID_REQUEST | formId/values 형식 오류 | 클라이언트 재입력 |
| 404 FORM_NOT_FOUND | 미정의 formId | 카탈로그로 안내 |
| 422 MISSING_REQUIRED | 필수 토큰 미입력 | 어떤 필드인지 응답 → 폼 경고 |
| 500 TEMPLATE_MISSING | 템플릿 파일 부재 | 로그 + "관리자 문의" |
| 500 GENERATE_FAILED | JSZip/치환 예외 | 로그 + 재시도 안내 |

응답: `{ "error": { "code": "...", "message": "...", "fields"?: ["선관위명"] } }`

---

## 8. 보안 고려

- [x] **XML escape** 필수(`& < > " '`) — 미처리 시 HWPX 파손/인젝션
- [x] 서버 라우트 service-role 사용 시 **org 스코프 필터**(`org_id`) — 타 조직 데이터 유출 차단
- [x] 템플릿 경로 화이트리스트(`HWPX_FORM_DEFS.template`만 허용) — path traversal 방지
- [x] 입력 길이 제한(셀 폭 초과 → 쪽수 드리프트 방지 겸 DoS 완화)
- [ ] (선택) Rate limiting — 기존 정책 따름

---

## 9. 테스트 계획

### 9.1 범위

| 유형 | 대상 | 도구 |
|---|---|---|
| 단위 | `escapeXml`, `fmtDate`, `generateHwpx`(치환/미입력제거) | Vitest |
| 단위 | mimetype-first·STORED 보장, 잔여 토큰 0 | Vitest(JSZip 재로드 검증) |
| 통합 | `POST /api/hwpx/generate` 서식 1종 happy/누락 | Vitest |
| 수동 | 한글에서 6서식 열기·레이아웃·날인란 육안 확인 | Hancom Office |

### 9.2 핵심 케이스

- [x] Happy: form-2-1 값 채움 → 잔여 토큰 0, well-formed, mimetype STORED *(PoC로 검증 완료)*
- [ ] 특수문자(`<`,`&`) 값 → escape 후 파손 없음
- [ ] 필수 미입력 → 422 + 필드명
- [ ] 미정의 formId → 404
- [ ] 빌드타임 가드: 각 템플릿의 `{{토큰}}` ⊆ manifest, manifest ⊆ `HWPX_FORM_DEFS` 토큰

---

## 10. 클린 아키텍처 계층 배치

| 컴포넌트 | 계층 | 위치 |
|---|---|---|
| `HwpxFormDef`/`PrefillSource` 타입 | Domain | `lib/hwpx/form-fields.ts`(types 동거) |
| `generateHwpx`, `escapeXml` | Infrastructure | `lib/hwpx/generate.ts`, `escape.ts` |
| prefill 조립, 템플릿 로드 | Infrastructure/App | `hooks/use-hwpx-prefill.ts`, API route |
| `SubmissionFormsPage`/`FormCatalog`/`FormInputPanel` | Presentation | `app/dashboard/...`, `components/submission-forms/` |

규칙: Presentation은 `generate.ts` 직접 호출 금지 → API 경유. 생성 코어는 외부 의존 없는 순수 함수.

---

## 11. 구현 가이드

### 11.1 파일 구조

```
app/
├─ public/hwpx-templates/         # ✅ 완료: form-{1-1,2-1,2-2,4,27,29}.hwpx + _token-manifest.json
├─ src/lib/hwpx/
│   ├─ generate.ts                # JSZip 치환 코어
│   ├─ escape.ts                  # XML escape·포맷터
│   └─ form-fields.ts             # HWPX_FORM_DEFS (필드/토큰/prefill source)
├─ src/app/api/hwpx/generate/route.ts
├─ src/app/dashboard/submission-forms/page.tsx
├─ src/components/submission-forms/{FormCatalog,FormInputPanel}.tsx
├─ src/hooks/use-hwpx-prefill.ts
└─ scripts/hwpx/                  # (선택) 템플릿 제작 도구 이식 — §11.3
```

### 11.2 구현 순서

1. [ ] `jszip` 추가 + `escape.ts` + `generate.ts`(순수 코어) + 단위 테스트(치환/escape/mimetype)
2. [ ] `form-fields.ts` — 6서식 `HWPX_FORM_DEFS`(manifest 토큰 기반) + 빌드타임 정합성 테스트
3. [ ] `/api/hwpx/generate` 라우트(Next16 docs 확인) + 통합 테스트
4. [ ] `use-hwpx-prefill` (organ 조회) + `FormInputPanel`(동적 폼·검증)
5. [ ] `FormCatalog` + `submission-forms/page.tsx`
6. [ ] `layout.tsx` 보고관리 메뉴 추가 + 조직타입 필터
7. [ ] 한글 수동 검수 → 미세조정

### 11.3 템플릿 제작 파이프라인(신규 서식 확장용)

Phase 2/3 서식 추가 시 재사용할 PoC 도구(현재 `/tmp`에서 검증, `scripts/hwpx/`로 이식 권장):
- `split_form.py` — 통합본에서 서식 문단 추출 + secPr 이식 + **배경 제거**(masterPage/pageBorderFill) + 미참조 이미지/마스터페이지 제거
- `tokenize.py` — 노드 인덱스 기반 예시값 → `{{토큰}}` 치환 + manifest 생성
- 검증: 구조 무결성 + 생성 시뮬레이션 (lxml 불가 환경 → python3.13 stdlib 사용)

> ⚠️ Phase 3 표 가변 서식(회계장부 등)은 `<hp:tr>` 행 템플릿 복제가 필요 → 본 토큰 치환만으로 부족(별도 설계).

---

## 12. 미해결/Do에서 결정

- JSZip가 기존 STORED mimetype을 보존하는지 → 실측 후 §6.3 옵션 A/B 확정
- 계좌(예금주/금융기관/번호) 데이터 소스 — 현재 manual, 추후 계좌신고 테이블 도입 시 source 교체
- 템플릿 저장: `public/`(현재) vs Supabase Storage(무배포 교체) — Phase 1은 public, 운영 확장 시 재검토
- 미리보기(FR-07): 텍스트 요약 vs 실제 렌더 — Phase 1은 입력값 요약 표

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-06 | 최초 작성 — 생성 파이프라인·필드모델·토큰 prefill 매핑·API·UI·테스트(템플릿 PoC 검증 반영) | Claude |
