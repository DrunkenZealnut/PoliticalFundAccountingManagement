# Gap 분석 보고서 — multi-evidence-file

> PDCA Check 단계 · 분석일 2026-06-01
> 설계: `docs/02-design/features/multi-evidence-file.design.md`
> 계획: `docs/01-plan/features/multi-evidence-file.plan.md`

## 종합 점수

| 항목 | 점수 (초기 → 테스트 보강 후) | 상태 |
|------|:----:|:----:|
| 설계 일치 (기능/동작) | 98% → 100% | ✅ |
| 아키텍처 적합성 | 100% | ✅ |
| 컨벤션 준수 | 100% | ✅ |
| **종합 일치율(Match Rate)** | **98% → 100%** | ✅ |

설계와 구현이 완전히 정합. 초기 분석에서 유일 갭이던 API/컴포넌트 통합 테스트를 보강(route.test.ts 11건 + evidence-file-manager.test.tsx 6건)하여 설계 §6 테스트 케이스를 모두 충족함. Phase 2 항목(Storage 고아 정리 등)은 설계상 범위 외.

## 요구사항별 일치 검증

| # | 설계 요구 (§) | 구현 위치 | 일치 |
|---|---|---|:--:|
| 1 | 계층 경로 `{org_id}/acc/{acc_book_id}/{ts}_{seq}_{safe}.ext` (§2.1) | `storage-path.ts:48-49`, `route.ts:108-114` | ✅ |
| 2 | unlinked 경로 `{org_id}/unlinked/{ts}_{safe}.ext` (§2.1) | `storage-path.ts:51` | ✅ |
| 3 | legacy 평면 경로 무변경 유지 + SSOT 다운로드 (§2.1/§2.2) | `route.ts:54-55` | ✅ |
| 4 | 다운로드 = DB storage_path 기반 signed URL, 경로 재구성 금지 (§2.2) | `route.ts:54-55`, `storage-path.ts:5-7` | ✅ |
| 5 | 파일명 정규화 (영숫자/`_`/`-`, 100자, 확장자 보존) (§2.1) | `storage-path.ts:19-27` | ✅ |
| 6 | 버킷 private 유지 (§2.3) | `route.ts:24` | ✅ |
| 7 | GET signed_url 동봉, 실패 행 null 방어 (§3.1) | `route.ts:53-62` | ✅ |
| 8 | POST 계층경로 + `index→seq` (§3.2) | `route.ts:108-114` | ✅ |
| 9 | 서버측 거래당 10건 한도 검증 → 400 (§3.2/§3.4) | `route.ts:83-95` | ✅ |
| 10 | DELETE org 검증 + best-effort + `{deleted, storageRemoved}` (§3.3) | `route.ts:153-210` | ✅ |
| 11 | DELETE 미존재 404 (§3.4) | `route.ts:184` | ✅ |
| 12 | EvidenceFileManager 컴포넌트 (목록·다중선택·삭제) (§4.1) | `evidence-file-manager.tsx` | ✅ |
| 13 | 단일 state 제거 → `pendingFiles` 배열 (§4.2) | `expense/page.tsx` | ✅ |
| 14 | 저장 시 순회 POST + 성공/실패 집계 (§4.2) | `expense/page.tsx` `uploadPendingFiles` | ✅ |
| 15 | 클립 `📎N` 배지 + `Map<acc_book_id,count>` (§4.3) | `expense/page.tsx` `evidenceCounts` | ✅ |
| 16 | 미리보기 모달: 이미지/PDF, 대기파일 base64 (§4.4) | `evidence-file-manager.tsx` Dialog | ✅ |
| 17 | (기존+대기) 합계 10건 클라 검증 (§4.1) | `evidence-file-manager.tsx` `totalCount` | ✅ |

## 차이점

### 🔴 Missing (설계 O, 구현 X)
없음 — Phase 1 범위 설계 항목 전부 구현.

### 🟡 Added (설계 미명시, 합리적 확장)
| 항목 | 위치 | 평가 |
|------|------|------|
| `reloadToken` prop (현재 expense 페이지 미전달) | `evidence-file-manager.tsx` | 무해. income 재사용 대비 확장점 |
| `oversized` 10MB 클라 사전 필터 | `evidence-file-manager.tsx` | UX 강화 (긍정) |
| GET `orgId` 단독 조회 시 signed_url 생략 | `route.ts:53,65` | §4.3 배지용 메타 조회 의도와 정합한 최적화 |

### 🔵 Changed (사소, 영향 없음)
| 항목 | 설계 | 구현 |
|------|------|------|
| signed URL API | `createSignedUrl` 반복 암시 | `createSignedUrls` 일괄 (효율적) |
| 한도 에러 메시지 | "첨부 한도(10건) 초과" | "증빙파일은 거래당 최대 10건…" (의미 동일) |
| DELETE 조회 | 단건 | `.maybeSingle()` + 404 분기 |

### 참고 (불일치 아님)
- 컴포넌트 파일명: 설계 `EvidenceFileManager.tsx` → 구현 kebab-case `evidence-file-manager.tsx`. 레포 관례(`customer-search-dialog.tsx`) 준수. export 식별자는 `EvidenceFileManager`로 정상.
- 경로 헬퍼 분리(`storage-path.ts` + 테스트 11건): 설계 §3.2는 route.ts 인라인이었으나 순수 함수로 분리 — 테스트 가능성 향상, 컨벤션 부합한 개선.

## 테스트 커버리지 (설계 §6 대비)

| 케이스 | 상태 |
|---|---|
| POST 경로 스킴 (acc/unlinked) | ✅ `storage-path.test.ts` |
| 파일명 정규화/100자 | ✅ |
| seq 충돌 방지 | ✅ |
| 상수(10건/10MB) | ✅ |
| POST 한도 400 | ✅ `route.test.ts` |
| GET signed_url/null 방어 | ✅ `route.test.ts` (3종: accBookId/null방어/orgId생략) |
| DELETE 정상/404/storage 실패 | ✅ `route.test.ts` (4종) |
| 컴포넌트 렌더·삭제·대기제거·상한비활성 | ✅ `evidence-file-manager.test.tsx` (6종) |

> **테스트 보강 완료**: storage-path 단위 11건 + route API 11건 + 컴포넌트 6건 = 신규 **28건**, 전체 343건 통과. 설계 §6 케이스 전부 충족.

## 권장 조치
1. **(선택) 테스트 보강**: `route.test.ts`(POST 한도/GET null 방어/DELETE 404·storage 실패) + 컴포넌트 인터랙션 테스트 → 98%→100%
2. **(선택) `reloadToken` 활용 또는 주석 명시** (현재 미전달)
3. **(문서) 설계 §8 변경파일 표에 `storage-path.ts`·`storage-path.test.ts` 2건 반영**

## 결론
Match Rate **100%** (테스트 보강 후) — 핵심 요구(계층 경로, SSOT 다운로드, GET/POST/DELETE, 10건 한도, EvidenceFileManager, 📎N 배지, 미리보기 모달) 전부 구현 + 설계 §6 테스트 케이스 전부 충족(신규 28건). 일부는 설계 의도 범위 내 개선(경로 헬퍼 분리, createSignedUrls 일괄, 클라 사전검증). 완료 보고 단계로 진행 가능.
