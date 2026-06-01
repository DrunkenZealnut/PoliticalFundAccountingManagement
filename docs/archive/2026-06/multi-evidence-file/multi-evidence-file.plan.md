# Plan: 지출내역 증빙파일 다중 첨부

> **Feature**: multi-evidence-file
> **Created**: 2026-06-01
> **Status**: Plan
> **배경**: 하나의 지출 거래에 영수증·계약서·세금계산서 등 증빙이 2개 이상인 경우가 많으나 현재 지출 페이지 UI는 1개만 첨부 가능

---

## Executive Summary

| 관점 | 내용 |
|------|------|
| Problem | 지출 거래 1건에 영수증·세금계산서·계약서 등 증빙파일이 2개 이상인 경우가 많은데, 지출 페이지 UI가 단일 파일만 첨부·표시할 수 있어 나머지 증빙을 등록할 수 없음 |
| Solution | DB/API는 이미 1:N(여러 파일)을 지원하므로 **지출 페이지 UI를 다중 첨부로 개선** + 첨부 파일 목록 조회·개별 삭제(DELETE API) 추가 |
| Function UX Effect | 한 거래에 여러 증빙을 한 번에/추가로 업로드, 이미 첨부된 파일 목록 확인·다운로드·삭제 가능 |
| Core Value | 실제 회계 실무(거래당 증빙 다건)와 시스템을 일치시켜 증빙 누락을 방지하고 선관위 제출 자료의 완전성 확보 |

---

## 1. 배경 및 현황 분석

### 1.1 현재 동작
지출 페이지(`dashboard/expense/page.tsx`)에서 거래를 선택해 수정할 때 증빙파일을 1개만 첨부할 수 있다. 영수증과 세금계산서가 함께 발생하는 등 증빙이 2개 이상인 거래는 1개만 등록 가능하다.

### 1.2 레이어별 제약 분석 (조사 결과)

| 레이어 | 현황 | 다중 첨부 가능 여부 |
|--------|------|:---:|
| **DB 스키마** (`scripts/007_evidence_file_table.sql`) | `acc_book_id`에 FK만 있고 **UNIQUE 제약 없음**, `idx_evidence_file_acc_book` 인덱스 존재 | ✅ 이미 1:N |
| **API** (`api/evidence-file/route.ts`) | `GET`은 `acc_book_id`로 **배열 반환**(created_at 역순), `POST`는 **누적 insert** | ✅ 이미 1:N (단 `DELETE` 없음) |
| **타입** (`types/database.ts`) | `evidence_file` Row/Insert/Update에 단·복수 제약 없음 | ✅ |
| **지출 페이지 UI** (`expense/page.tsx`) | 단일 state `evidenceFile`, `<input type=file>`(multiple 없음), `files?.[0]`만 처리, 기존 첨부 목록 미표시 | ❌ **1:1 강제 — 병목 지점** |
| document-register | 한 번에 여러 파일 업로드하나 **파일당 acc_book 1건 생성**(구조적 1:1) — 이번 범위 아님 | 별개 |

### 1.3 핵심 결론
**백엔드(DB·API)는 이미 다중 증빙을 지원**한다. 병목은 오직 **지출 페이지 UI**다. 따라서 스키마 마이그레이션 없이 **UI 개선 + DELETE API 추가**만으로 해결 가능하다. (작업 비용 낮음, 데이터 리스크 낮음)

---

## 2. 기능 요구사항

### FR-01 다중 파일 첨부 (지출 페이지)
- 파일 input에 `multiple` 지원 + 한 번에 여러 파일 선택
- 선택한 파일들을 **배열 state**로 관리(미리보기/제거 가능)
- 저장 시 각 파일을 `POST /api/evidence-file`로 누적 업로드 (기존 누적 동작 그대로 활용)
- 파일 형식: 기존과 동일 `image/*, application/pdf`, 개당 최대 10MB

### FR-02 기존 첨부파일 목록 표시
- 거래 선택 시 `GET /api/evidence-file?accBookId=...`로 **이미 첨부된 파일 목록** 조회·표시
- 각 항목: 파일명, (가능 시) 크기/업로드일, 다운로드/미리보기 링크, 삭제 버튼

### FR-03 개별 파일 삭제 (신규 DELETE API)
- `DELETE /api/evidence-file` (또는 `?fileId=`) 추가
- Supabase Storage 객체 + `evidence_file` 행 동시 삭제
- 삭제 시 목록 즉시 갱신

### FR-04 첨부 개수 표시 (목록/그리드)
- 지출 내역 목록에서 해당 거래의 증빙 첨부 개수(또는 클립 아이콘 + N) 표시로 다건 여부를 한눈에 인지 (선택 범위, Phase 2 가능)

---

## 3. 비즈니스 규칙

| 항목 | 규칙 |
|------|------|
| 첨부 개수 | 거래당 다건 허용 (상한 없음 또는 합리적 상한 예: 10건 — 논의) |
| 파일 크기 | 개당 10MB (기존 유지) |
| 형식 | 이미지(image/*), PDF |
| org 스코프 | `org_id` 일치 항목만 조회/삭제 (RLS 우회 service-role 사용, 서버에서 org 검증) |
| 삭제 정합성 | Storage 객체와 DB 행은 함께 삭제(한쪽 실패 시 처리 정책 정의) |
| acc_book 삭제 시 | 기존 `ON DELETE CASCADE`로 자동 정리 (변경 없음) |

---

## 4. 구현 범위

### Phase 1 (MVP)
- [ ] `api/evidence-file/route.ts`에 `DELETE` 메서드 추가 (Storage + DB)
- [ ] `expense/page.tsx`: `evidenceFile` 단일 → **배열(newFiles[])** state로 변경, input `multiple`
- [ ] `expense/page.tsx`: 거래 선택 시 기존 첨부 목록 `GET` 조회·렌더
- [ ] `expense/page.tsx`: 목록 항목별 다운로드/미리보기 + 삭제 버튼
- [ ] 저장 로직: 신규 선택 파일들을 순회 업로드
- [ ] 단위 테스트: DELETE API 핸들러, 다중 업로드 페이로드 처리

### Phase 2 (개선, 선택)
- [ ] 지출 목록 그리드에 첨부 개수 배지 표시 (FR-04)
- [ ] 드래그&드롭 업로드 (document-register 패턴 재사용)
- [ ] income 페이지에도 동일 다중 증빙 적용 (현재 income엔 증빙 기능 없음)

---

## 5. 관련 파일

| 파일 | 역할 | 수정 여부 |
|------|------|:--------:|
| `app/src/app/api/evidence-file/route.ts` | DELETE 메서드 추가 (Storage+DB 삭제) | 수정 |
| `app/src/app/dashboard/expense/page.tsx` | 다중 첨부 state·input, 기존 목록 조회/삭제 UI | 수정 |
| `app/src/types/database.ts` | (변경 불필요 — 이미 지원) | - |
| `app/scripts/007_evidence_file_table.sql` | (마이그레이션 불필요 — UNIQUE 없음) | - |
| `app/src/app/api/evidence-file/route.test.ts` | DELETE/다중 처리 테스트 | 신규 |

---

## 6. 위험 및 제약

| 위험 | 대응 |
|------|------|
| Storage 객체 삭제 실패 시 DB 행만 남거나 그 반대 (고아 데이터) | DB 행 삭제 후 Storage 삭제 순서 고정, 실패 로깅 + 재시도/정리 정책 명시 |
| 다건 업로드 중 일부 실패 | 파일별 결과 수집 후 성공/실패 건수 사용자 피드백 |
| 기존 데이터 호환 | 스키마 무변경이므로 기존 단일 첨부 데이터 그대로 목록에 노출 |
| 권한/스코프 | 삭제·조회 모두 서버에서 `org_id` 검증 (타 조직 파일 접근 차단) |
| 첨부 무제한 시 스토리지 비용 | 거래당 합리적 상한(예: 10건) 논의 후 적용 |

---

## 7. 미해결 논의 사항 (Design 단계 확정 필요)
1. 거래당 첨부 상한 (무제한 vs 10건)
2. 부분 실패 시 트랜잭션 처리 수준 (best-effort vs 전건 롤백)
3. 미리보기 방식 (Storage signed URL vs 기존 공개 경로)
4. 지출 목록 첨부 개수 배지를 Phase 1에 포함할지
