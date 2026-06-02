# 지출내역 증빙파일 다중 첨부 — Design Document

> Plan: `docs/01-plan/features/multi-evidence-file.plan.md`
> 핵심 추가 요구(사용자): **다건 거래 × 다건 파일 환경에서 첨부파일 저장·다운로드 경로를 체계적으로 관리**

---

## 0. 설계 결정 요약 (Plan 미해결 사항 해소)

| 의문점 | 결정 | 근거 |
|---|---|---|
| 거래당 첨부 상한 | **10건** | document-register 일괄등록 상한(10)과 일관. UI 과부하/스토리지 남용 방지. 서버에서도 검증 |
| 부분 실패 처리 | **Best-effort, 파일별 결과 집계** | 다건 업로드 중 일부 실패해도 나머지는 저장. `{success, failed[]}` 반환 → 사용자에게 "N건 성공/M건 실패" 피드백. 전건 롤백은 과설계 |
| 미리보기/다운로드 방식 | **Signed URL (버킷 private 유지)** | 버킷이 `public:false`. 현재 코드베이스에 다운로드 로직이 **전무**(`createSignedUrl`/`getPublicUrl` 미사용). GET 목록 응답에 `signed_url`(만료 1h) 동봉 |
| **[신규] Storage 경로 체계** | **`{org_id}/acc/{acc_book_id}/{ts}_{safeName}.ext` 계층 구조** | 현재는 `{org_id}/{ts}_...` 평면 → 거래 그룹화 불가. 거래별 prefix로 그룹화하면 조회·일괄삭제·감사 용이. §2 상세 |
| 다운로드 경로 해석 원천 | **DB `storage_path` 컬럼이 단일 진실 원천(SSOT)** | UI/다운로드는 경로 규칙을 추측하지 않고 저장값으로만 signed URL 생성 → 향후 스킴이 바뀌어도 기존 파일 다운로드 안전(legacy 호환) |
| 목록 첨부 개수 배지 | **Phase 1 포함(경량)** | 지출 그리드에 클립📎+N 표시. `GET ?orgId=` 1회로 acc_book_id별 카운트 맵 구성 |
| 스키마 마이그레이션 | **불필요** | `evidence_file`는 이미 UNIQUE 제약 없는 1:N. 컬럼 변경 없음 |

---

## 1. 아키텍처 개요

```text
┌────────────────────────────────────────────────────────────────────┐
│ 지출 페이지 expense/page.tsx                                          │
│   거래 선택 ──→ <EvidenceFileManager accBookId orgId />              │
│                   │                                                  │
│   ┌───────────────┼────────────────────────────────────────────┐   │
│   │ ① 기존 목록 조회   ② 신규 다중 선택   ③ 개별 삭제             │   │
│   │  GET ?accBookId    input multiple      DELETE ?fileId        │   │
│   │  → signed_url[]    → newFiles[](대기)  → 목록 갱신            │   │
│   └───────────────┼────────────────────────────────────────────┘   │
│            저장 시 newFiles 순회 POST (성공/실패 집계)               │
└───────────────────┼────────────────────────────────────────────────┘
                     ▼
┌────────────────────────────────────────────────────────────────────┐
│ /api/evidence-file (route.ts)                                        │
│   GET    목록 + per-row createSignedUrl(3600s)                       │
│   POST   경로 = {org_id}/acc/{acc_book_id}/{ts}_{safe}.ext           │
│   DELETE (신규) org 검증 → Storage.remove → DB delete (best-effort)  │
└───────────────────┼────────────────────────────────────────────────┘
                     ▼
┌──────────────────────────────┐   ┌──────────────────────────────────┐
│ Supabase Storage (evidence,  │   │ pfam.evidence_file (메타, SSOT)   │
│ private)                     │   │  storage_path = 다운로드 경로 원천 │
│  {org}/acc/{accId}/...       │   │  acc_book_id FK (ON DELETE CASCADE)│
└──────────────────────────────┘   └──────────────────────────────────┘
```

---

## 2. Storage 경로 체계 (사용자 핵심 요구)

### 2.1 경로 스킴

| 케이스 | storage_path 규칙 | 예시 |
|---|---|---|
| **거래 연결 파일** (정상) | `{org_id}/acc/{acc_book_id}/{ts}_{seq}_{safeName}.ext` | `7/acc/1024/1717200000000_1_receipt.jpg` |
| **미연결(조직 레벨)** acc_book_id=NULL | `{org_id}/unlinked/{ts}_{safeName}.ext` | `7/unlinked/1717200000000_logo.pdf` |
| **legacy(기존 데이터)** | `{org_id}/{ts}_{safeName}.ext` (변경 없이 유지) | `7/1716000000000_old.jpg` |

- `{org_id}` 최상위 → **조직 격리**(스코프/보안 prefix). signed URL·삭제 모두 org 검증과 정합.
- `acc/{acc_book_id}` → **거래별 그룹화**. 한 거래의 모든 증빙이 같은 prefix 아래 모임.
  - 조회: `storage.list('{org}/acc/{accId}')` 가능(보조 수단, 단 SSOT는 DB)
  - 일괄삭제: 거래 삭제 시 prefix 단위 정리 용이(Phase 2)
- `{ts}_{seq}_{safeName}.ext` → 동일 거래 내 충돌 방지. `seq`는 한 번의 다중 업로드 내 인덱스, `ts`는 `Date.now()`.
- 파일명 정규화는 기존 로직 유지(영문/숫자/`_`/`-`만, 100자 제한, 확장자 보존).

### 2.2 다운로드 경로 해석 — 단일 진실 원천(SSOT)

```text
DB.evidence_file.storage_path  ──(createSignedUrl)──▶  임시 다운로드 URL(만료 1h)
```

- **경로 규칙을 클라이언트가 재구성하지 않는다.** 항상 DB에 저장된 `storage_path`로만 signed URL을 만든다.
- 따라서 §2.1 스킴이 미래에 또 바뀌어도, 과거 파일(legacy 평면 경로 포함)의 다운로드는 그대로 동작 → **하위 호환 보장**.
- 마이그레이션 불요: 기존 평면 경로 행은 그 값 그대로 다운로드되고, 신규 업로드만 계층 스킴을 사용.

### 2.3 보안·스코프

- 버킷 `evidence`는 **private 유지**. 직접 public URL 노출 금지.
- GET/DELETE는 `org_id` 필터 필수 → 타 조직 파일 접근·삭제 차단(서버 service-role이지만 org 게이트).
- signed URL 만료 1시간. 만료 후 UI는 목록 재조회(GET)로 갱신.

---

## 3. API 설계 (`app/src/app/api/evidence-file/route.ts`)

### 3.1 GET (수정) — 목록 + signed URL

```http
GET /api/evidence-file?accBookId=1024&orgId=7
→ 200 [{ file_id, acc_book_id, org_id, file_name, file_type,
         storage_path, file_size, created_at, signed_url }]
```
- 기존 쿼리(created_at desc) 유지 + 각 행에 `signed_url` 추가:
  `supabase.storage.from('evidence').createSignedUrl(storage_path, 3600)`
- signed URL 생성 실패 행은 `signed_url: null`로 두고 목록은 계속 반환(방어적).

### 3.2 POST (수정) — 계층 경로 생성

- `storagePath` 생성부만 변경:
  ```ts
  const dir = accBookId ? `${orgId}/acc/${accBookId}` : `${orgId}/unlinked`;
  const storagePath = `${dir}/${Date.now()}_${seq}_${safeName}${ext}`;
  ```
- `seq`는 요청 바디의 선택적 `index`(없으면 0). 나머지(크기 검증, ensureBucket, insert) 동일.
- 서버측 상한 검증: 해당 `acc_book_id`의 기존 파일 수 + 신규 > 10 → 400(`첨부 한도 초과`).

### 3.3 DELETE (신규)

```http
DELETE /api/evidence-file?fileId=55&orgId=7
```
처리 순서(best-effort, 고아 최소화):
1. `evidence_file`에서 `file_id=fileId AND org_id=orgId` 단건 조회 → 없으면 404
2. `storage.from('evidence').remove([row.storage_path])` (실패해도 로깅 후 계속)
3. `evidence_file.delete().eq('file_id')` → 결과 반환 `{ deleted: true, storageRemoved: boolean }`
- org 불일치 행은 조회 단계에서 걸러져 삭제 불가.

### 3.4 응답/에러 규약

| 상황 | status | body |
|---|---|---|
| 한도 초과 | 400 | `{ error: "첨부 한도(10건) 초과" }` |
| 파일 없음(DELETE) | 404 | `{ error: "파일을 찾을 수 없음" }` |
| Storage 삭제 실패하나 DB 삭제 성공 | 200 | `{ deleted:true, storageRemoved:false }` (고아 가능 — 로깅) |

---

## 4. 프론트엔드 설계

### 4.1 컴포넌트 분리 — `components/evidence/EvidenceFileManager.tsx` (신규)

지출 페이지 인라인 비대화 방지 + 향후 income 재사용 목적.

```tsx
interface EvidenceFile {
  file_id: number; acc_book_id: number | null; file_name: string;
  file_type: string; storage_path: string; file_size: number;
  created_at: string; signed_url: string | null;
}
interface Props { accBookId: number; orgId: number;
  pendingFiles: PendingFile[];                       // 저장 전 대기 파일(상위 state)
  onPendingChange: (files: PendingFile[]) => void;
}
type PendingFile = { name: string; type: string; base64: string };
```

책임:
- `accBookId` 변경 시 `GET`으로 `existingFiles` 로드(signed_url 포함)
- 기존 파일 행: 파일명 · 크기 · (이미지면 썸네일 / PDF 아이콘) · [다운로드](signed_url) · [삭제](DELETE)
- 신규 선택: `<input type="file" multiple accept="image/*,application/pdf">` → base64 변환 후 `pendingFiles` 누적, 개별 ✕ 제거, (기존+대기) 합계 10건 클라 검증

### 4.2 지출 페이지(`expense/page.tsx`) 변경

- `const [evidenceFile, setEvidenceFile] = useState<...|null>` **삭제** → `const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])`
- 편집 영역에 `<EvidenceFileManager .../>` 삽입(거래 선택 시 노출).
- 저장 핸들러: 단건 POST 블록(현 356·376행) → `for (const [i,f] of pendingFiles.entries())` 순회 POST(`index:i`), `{success, failed}` 집계 → toast/알림.
- 저장 후 `pendingFiles=[]`, 매니저 목록 재조회.

### 4.3 첨부 개수 배지 (지출 목록 그리드)

- 페이지 진입 시 `GET ?orgId=`로 전체 증빙 1회 조회 → `Map<acc_book_id, count>` 구성.
- 각 행에 첨부 있으면 `📎 N` 배지. 신규/삭제 후 맵 갱신.

### 4.4 미리보기 (Dialog 모달)

- 기존/대기 파일 행에서 **이미지 썸네일 또는 파일명 클릭 시 모달 미리보기**.
  - 이미지: `<img src=...>` (기존=signed_url, 대기=base64 data URL)
  - PDF: `<iframe src=...>` 임베드
  - 미리보기 불가 형식: `signed_url` 새 탭 다운로드로 폴백
- 대기 파일도 업로드 전 base64 data URL로 즉시 미리보기 가능.
- 모달 하단에 "새 탭에서 열기 / 다운로드" 링크 제공.

---

## 5. 구현 순서 (Do 단계 체크리스트)

1. **API**: DELETE 메서드 추가 → POST 경로 스킴 변경 → GET signed_url 추가 → 서버측 10건 검증
2. **타입**: `EvidenceFile` 인터페이스(컴포넌트 내) 정의 (database.ts는 변경 없음)
3. **컴포넌트**: `EvidenceFileManager.tsx` 신규(목록·다중선택·다운로드·삭제)
4. **지출 페이지**: 단일 state 제거 → 매니저 연동 → 저장 순회 업로드 → 개수 배지
5. **테스트**: `route.test.ts`(DELETE/한도/경로 스킴), 컴포넌트 렌더·삭제 인터랙션
6. `npm run lint` · `npm run test` · `npm run build`

---

## 6. 테스트 설계

| 케이스 | 검증 |
|---|---|
| POST 경로 스킴 | accBookId 有 → `{org}/acc/{id}/...`, 無 → `{org}/unlinked/...` |
| POST 한도 | 기존10+신규1 → 400 |
| GET signed_url | 각 행 signed_url 포함, storage_path null/실패 방어 |
| DELETE 정상 | DB행+Storage 제거, org 불일치 시 404 |
| DELETE Storage 실패 | DB는 삭제, `storageRemoved:false` |
| 컴포넌트 | 다중선택 누적·개별제거, 기존목록 렌더, 삭제 후 갱신 |
| legacy 호환 | 평면경로 행도 signed_url 생성·다운로드 |

---

## 7. 위험 및 대응

| 위험 | 대응 |
|---|---|
| acc_book 삭제 시 Storage 고아 객체 | DB는 CASCADE로 정리됨. Storage는 신규 prefix `{org}/acc/{id}/`로 Phase 2에서 일괄삭제(acc-book delete 액션 연동). Phase 1은 개별 DELETE만, 고아 가능성 문서화 |
| signed URL 만료 후 깨진 링크 | 만료 1h, 클릭 시점 만료면 목록 재조회 안내. (대안: 다운로드 전용 엔드포인트 302 redirect — Phase 2) |
| 다건 base64 메모리/요청 크기 | 파일별 개별 POST(일괄 X)로 요청당 ≤10MB 유지. maxDuration=60 |
| 부분 실패 사용자 혼란 | 성공/실패 건수 명시 피드백, 실패 파일은 pending에 잔류해 재시도 |
| legacy 경로 혼재 | 다운로드는 SSOT(storage_path)로만 해석 → 스킴 혼재 무해 |

---

## 8. 변경 파일 요약

| 파일 | 변경 | 비고 |
|---|---|:--:|
| `app/src/app/api/evidence-file/route.ts` | GET signed_url·POST 경로스킴·DELETE·한도검증 | 수정 |
| `app/src/components/evidence/EvidenceFileManager.tsx` | 목록/다중/다운로드/삭제 | 신규 |
| `app/src/app/dashboard/expense/page.tsx` | 단일→다중, 매니저 연동, 개수 배지 | 수정 |
| `app/src/app/api/evidence-file/route.test.ts` | API 테스트 | 신규 |
| `app/scripts/007_evidence_file_table.sql` | 변경 없음(이미 1:N) | - |
