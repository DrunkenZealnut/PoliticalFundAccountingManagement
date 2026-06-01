# 지출내역 증빙파일 다중 첨부 — 완료 보고서

> **Feature**: multi-evidence-file
> **Created**: 2026-06-01
> **Status**: 완료 (Match Rate 100%)
> **Branch**: feat/dashboard-org-differentiation

---

## Executive Summary

| 항목 | 값 |
|------|----|
| 기능 | 지출내역 증빙파일 다중 첨부 + Storage 경로 체계화 + 미리보기 |
| PDCA | Plan → Design → Do → Check (1 세션, 2026-06-01) |
| Match Rate | **100%** (테스트 보강 후) |
| 신규/수정 파일 | 신규 2 (+테스트 2) · 수정 2 |
| 테스트 | 신규 28건 · 전체 **343건 통과** · lint·build 통과 |
| 스키마 변경 | **없음** (DB가 이미 1:N 지원) |

### Value Delivered (4관점)

| 관점 | 내용 |
|------|------|
| **Problem** | 지출 거래 1건에 영수증·세금계산서·계약서 등 증빙이 2개 이상인 경우가 많은데, 지출 페이지 UI가 단일 파일만 첨부·표시할 수 있어 나머지 증빙을 등록할 수 없었음. |
| **Solution** | DB·API는 이미 1:N을 지원 → 병목인 지출 페이지 UI를 다중 첨부로 개선. Storage 경로를 거래별 계층(`{org_id}/acc/{acc_book_id}/...`)으로 체계화하고, 다운로드는 DB `storage_path` 단일 원천(SSOT)에서 signed URL 생성. DELETE API와 미리보기 모달 추가. |
| **Function & UX Effect** | 거래당 최대 10건 첨부, 기존 첨부 목록 조회·다운로드·개별 삭제, 이미지/PDF **미리보기 모달**(대기 파일은 업로드 전 base64 미리보기), 목록에 `📎N` 첨부 개수 배지. 신규 28건 포함 343건 전수 통과. |
| **Core Value** | 실제 회계 실무(거래당 증빙 다건)와 시스템을 일치시켜 증빙 누락 방지 및 선관위 제출 자료의 완전성 확보. 경로 SSOT 설계로 legacy 평면 경로 파일도 무중단 호환. |

---

## 1. 배경 및 핵심 발견

기존 지출 페이지는 거래당 증빙파일 1개만 첨부 가능했다. 조사 결과 **제약은 오직 UI 레이어**에 있었다.

| 레이어 | 다중 첨부 | 근거 |
|--------|:---:|------|
| DB 스키마 (`scripts/007`) | ✅ 이미 가능 | `acc_book_id` UNIQUE 제약 없음 (1:N) |
| API (`evidence-file/route.ts`) | ✅ 이미 가능 | GET 배열 반환·POST 누적, 단 DELETE·signed URL 부재 |
| 지출 페이지 UI | ❌ **병목** | 단일 state·`files[0]`·기존 목록 미표시 |

→ **스키마 마이그레이션 불필요.** UI 다중화 + DELETE API + signed URL 다운로드만으로 해결.

---

## 2. 구현 내용

### 2.1 신규 — `app/src/lib/evidence/storage-path.ts` (순수 함수)

| export | 내용 |
|--------|------|
| `EVIDENCE_MAX_FILES` | 거래당 첨부 상한 = `10` |
| `EVIDENCE_MAX_FILE_SIZE` | 파일당 최대 = `10 * 1024 * 1024` (10MB) |
| `sanitizeFileName(fileName)` | `{ safeName, ext }` — 영숫자/`_`/`-`만, 연속 밑줄 축약, 100자 제한, 확장자 보존 |
| `buildEvidenceStoragePath({orgId, accBookId, fileName, seq, timestamp})` | 계층 경로 생성. `timestamp` 주입형 → 순수 함수(테스트 가능) |

**경로 스킴**

| 케이스 | 경로 |
|--------|------|
| 거래 연결 | `{org_id}/acc/{acc_book_id}/{ts}_{seq}_{safeName}.ext` |
| 미연결(조직) | `{org_id}/unlinked/{ts}_{safeName}.ext` |
| legacy(기존 데이터) | `{org_id}/{ts}_{safeName}.ext` (변경 없이 유지) |

### 2.2 수정 — `app/src/app/api/evidence-file/route.ts`

- **GET** `?accBookId=&orgId=` → 행 목록 + 각 행 `signed_url`(`createSignedUrls`, TTL 3600s).
  `?orgId=` 단독(배지 카운트용) → signed URL **생성 생략**(대량 생성 회피).
- **POST** JSON `{accBookId, orgId, fileName, fileType, fileData(base64), index}`
  → 거래당 10건 한도 검증(초과 시 400) → 계층 경로 생성 → Storage 업로드 → 메타 insert.
- **DELETE** `?fileId=&orgId=` (또는 body)
  → `org_id` 일치 행 조회(없으면 404) → **Storage 객체 remove → DB 행 delete** 순서 → `{deleted, storageRemoved}`.
  best-effort: Storage 삭제 실패해도 DB는 삭제하고 `storageRemoved:false`로 로깅(고아 가능성).

### 2.3 신규 — `app/src/components/evidence/evidence-file-manager.tsx`

- 기존 첨부 목록: 이미지 썸네일 / 파일명(미리보기 트리거) / 새 탭 열기(↗) / 크기 / 삭제(✕)
- 신규 대기 파일: 미리보기 / 제거(✕). `<input type="file" multiple accept="image/*,application/pdf">`
- (기존+대기) 합계 10건 클라 검증, 10MB 초과 사전 필터
- **미리보기 모달**(shadcn Dialog): 이미지 `<img>`, PDF `<iframe>`, 대기 파일은 base64 data URL로 즉시 미리보기

### 2.4 수정 — `app/src/app/dashboard/expense/page.tsx`

- 단일 `evidenceFile` state 제거 → `pendingFiles: PendingFile[]`
- 저장 시 `uploadPendingFiles(accBookId)`로 순회 POST(파일별 `index`) + 성공/실패 건수 피드백
- `EvidenceFileManager` 연동, 목록 그리드에 `evidenceCounts` 기반 `📎N` 배지

---

## 3. 보안·정합성

- **버킷 private 유지**(`public:false`), 직접 public URL 노출 없음 → signed URL(1h)만 사용
- GET/DELETE 모두 서버에서 `org_id` 필터/검증 → 타 조직 파일 접근·삭제 차단
- 다운로드 경로는 **DB `storage_path` 단일 원천**으로만 해석 → 스킴 변경/legacy 혼재에도 안전

---

## 4. 테스트 결과

| 테스트 | 건수 | 검증 |
|--------|:---:|------|
| `lib/evidence/storage-path.test.ts` | 11 | 경로 스킴(acc/unlinked)·파일명 정규화·100자 제한·seq 충돌방지·org prefix·상수 |
| `app/api/evidence-file/route.test.ts` (신규) | 11 | GET signed_url/null방어/orgId생략/400, POST 10건한도/계층경로/누락400, DELETE 404/정상/storage실패/400 |
| `components/evidence/evidence-file-manager.test.tsx` (신규) | 6 | 기존목록 렌더·빈상태·대기파일·대기제거(onPendingChange)·삭제(DELETE+재조회)·10건 상한 입력 비활성 |
| **신규 합계** | **28** | — |

- 전체 **343건 통과** (기존 315 → 326[storage-path] → 343[route+component])
- ESLint(v9 flat) 통과, Next.js 16 프로덕션 build 통과(exit 0)
- 검증 시 `node_modules/.bin` 심볼릭 링크 부재로 CLI를 `node node_modules/vitest/vitest.mjs` 등 직접 진입점으로 실행

---

## 5. 미반영 (Phase 2, 설계상 범위 외)

| 항목 | 현황 | 후속 |
|------|------|------|
| acc_book 삭제 시 Storage 고아 객체 | DB는 `ON DELETE CASCADE`로 `evidence_file` 행 자동 삭제되나 **Storage 객체는 잔존** | 신규 경로 `{org}/acc/{id}/` prefix 일괄삭제를 acc-book delete 액션에 연동(Phase 2) |
| signed URL 만료 후 링크 | TTL 1h, 만료 시 거래 재선택으로 자동 갱신 | 필요 시 다운로드 전용 302 redirect 엔드포인트(Phase 2) |

---

## 6. 교훈

- **사전 조사의 가치**: DB/API가 이미 1:N을 지원함을 먼저 확인하여 불필요한 스키마 마이그레이션을 피하고 작업을 UI+API 일부로 한정.
- **경로 SSOT 원칙**: 다운로드를 DB `storage_path`로만 해석하도록 설계해 legacy 평면 경로와 신규 계층 경로가 혼재해도 무중단 호환.
- **순수 함수 분리**: 경로 생성에 `timestamp` 주입형 순수 함수를 도입해 테스트 용이성 확보(레포의 import-helpers 패턴과 동일).
- **report-generator 검증 필요**: 자동 생성 초안이 실제 함수명·API 명세를 일부 잘못 기술 → 코드 대조 후 교정(본 보고서는 교정본).

---

## 7. 관련 문서·파일

- Plan: `docs/01-plan/features/multi-evidence-file.plan.md`
- Design: `docs/02-design/features/multi-evidence-file.design.md`
- Analysis: `docs/03-analysis/multi-evidence-file.analysis.md`

```
app/src/
├── lib/evidence/storage-path.ts            (신규) + storage-path.test.ts (신규)
├── app/api/evidence-file/route.ts          (수정) + route.test.ts (신규)
├── components/evidence/evidence-file-manager.tsx (신규) + .test.tsx (신규)
└── app/dashboard/expense/page.tsx          (수정)
```

## 체크리스트

- ✅ 기능 구현 완료
- ✅ 테스트 343건 통과 (신규 28)
- ✅ Lint / Build 통과
- ✅ PDCA 문서(plan/design/analysis/report) 완비
- ⏳ 커밋·PR (사용자 요청 시)
