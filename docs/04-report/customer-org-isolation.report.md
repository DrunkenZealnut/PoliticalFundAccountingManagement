# 수입지출처 조직별 격리 + 백업 404 수정 — PDCA 완료 보고서

> **Plan**: 정식 PDCA Plan 미진행 (사용자 즉시 버그 보고·요청 기반 연쇄 작업)
> **Design**: `docs/02-design/customer-org-isolation.design.md` (근본 격리 설계서)
> **Analysis**: 인라인 근본원인 조사 + 운영 데이터 감사 (본 보고서 §3, §5)
> **Status**: ✅ 완료 (운영 배포·검증 / 회귀 0 / 단위테스트 300 통과)
> **Date**: 2026-05-31 ~ 2026-06-01 (단일 세션)
> **Branch**: feat/official-program-parity → main
> **PR**: #35 ~ #40 (6건 머지)

---

## 1. Executive Summary

| 항목 | 내용 |
|---|---|
| 기능 | 수입지출처(거래처) 조직별 격리 + /dashboard/backup 404 수정 + import 헬퍼 리팩토링 |
| 기간 | 2026-05-31 ~ 06-01 (1 세션) |
| 변경 규모 | 17 파일, +1030 / -152, 마이그레이션 1, 단위테스트 +8 |
| PR | #35·#36·#37·#38·#39·#40 (전부 main 머지·운영 배포) |
| 검증 | tsc 0 · vitest 300 통과 · 백필 정확 일치 · 라이브 격리 교집합 0 · export 라운드트립 errors 0 |

### Value Delivered (4관점)

| 관점 | 내용 |
|---|---|
| **Problem** | ① 백업 페이지 404 ② 사용기관(후보/후원회) 전환해도 이전 조직 거래처가 함께 보임 (데이터 격리 실패) |
| **Solution** | ① 백업/복구 페이지 재생성 ② `customer.org_id` 추가(마이그레이션) + 조회·입력·배치·복구·export 전 경로 org 격리 |
| **Function / UX 효과** | 후원회 회계는 후원자 명단만, 후보 회계는 그 후보 거래처만 표시. 조직 간 거래처 노출 0. 백업/복구 정상 동작 |
| **Core Value** | 정치자금 회계의 조직별 독립성 확보 (실명 후보·후원회 데이터 격리) + 선관위 PFund2 파일별 CUSTOMER 분리 모델과 정합 |

---

## 2. 작업 항목 (Do)

### 2-1. /dashboard/backup 404 수정 (PR #35)
- **원인**: 커밋 `eb9c621`("미사용 페이지 12개 제거")에서 `backup/page.tsx` 삭제됐으나 layout 메뉴 링크 잔존 → 깨진 링크.
- **수정**: 페이지 재생성, `export-sqlite`(백업 다운로드)·`import-sqlite`(복구) API 연결. 백업 형식(full/master/data1/data2)·연도 선택, 복구 미리보기(dryRun)·충돌정책(overwrite/skip/merge).

### 2-2. import-sqlite 헬퍼 분리 + 단위테스트 (PR #35)
- `bulkInsert`/`bulkUpsert`/`parseConflictPolicy`를 `lib/accounting/import-helpers.ts`로 추출(Supabase 클라이언트 주입).
- 청크/행단위 폴백 집계·충돌정책 검증 단위테스트 8개 추가.

### 2-3. 수입지출처 조직별 격리 (PR #36·#37·#38·#40) — 핵심
- **임시 UI 격리(#36)**: customer 페이지 기본 조회를 본 기관(acc_book 사용 기준)으로 반전. 즉시 화면 누수 차단.
- **근본 격리(#37)**: `customer.org_id` 추가 (마이그레이션 `011_customer_org_id.sql`).
  - 백필: 거래 사용분 자동 귀속 / 미사용 개인 38 → 후원회(org10) / 미사용 사업자 3 → 후보(org9) / 익명 2 → NULL.
  - 조회(customers API·customer 페이지)·입력(customer-batch·acc-book·document-register)·복구(import-sqlite) 전부 org 범위로.
- **export PFund2 호환(#37·#38)**: PFund2 CUSTOMER DDL에 ORG_ID 없으므로 export 시 strip + data1/data2 모드는 해당 org 거래처만 필터(CUSTOMER_ADDR FK 정합 포함).
- **잔여 경로 격리(#40)**: 보고서(reports)·제출(submit) 페이지의 거래처 over-fetch / 전 조직 합산 통계를 org 범위로.

### 2-4. 부수 정리 (PR #39)
- `.gitignore`에 `.env*.local` 추가(시크릿 추적 방지), db-export data1 FK 무결성 보고서 커밋.

---

## 3. 근본 원인 (Check — 조사)

| 증상 | 근본 원인 |
|---|---|
| /dashboard/backup 404 | 페이지 파일 삭제 + 메뉴 링크 잔존 |
| 조직 전환 후 이전 거래처 노출 | `customer` 테이블에 `org_id` 부재 → DB 레벨 전 조직 공용 + 페이지 기본 전체표시(commit `0cbf228`) + acc-book 배치 매칭이 이름 전역 검색 |

수입/지출 내역·보고서·집계는 `org_id` 필터 + 조직전환 재조회로 **원래 정상 격리**. 누수는 `customer` 경로에 한정됨을 확인.

**PFund2 정합 통찰**: 선관위 PFund2는 거래처를 org별 .db 파일(Fund_Data_1=후보자, Fund_Data_2=후원회)로 격리. 본 시스템은 단일 DB로 합치며 격리를 상실 → `customer.org_id` 추가가 PFund2 모델과 일치(파리티 강화).

---

## 4. 검증 (Check)

| 검증 | 결과 |
|---|---|
| 타입체크 | tsc --noEmit 0 errors |
| 단위테스트 | vitest 20 files / 300 tests 통과 |
| 마이그레이션 백필 | org9=25 · org10=75 · org11=14 · NULL=2(익명) = 116, 미귀속 0 (기대치 정확 일치) |
| 라이브 격리(운영 API) | 후보(9·11·12) 39종 ∩ 후원회(10) 75종 = **교집합 0** |
| export 모드 | full=117 / data1=1 / data2=76 (org별 정확 필터), 각 유효 SQLite |
| export→import 라운드트립 | dryRun errors 0 · warnings 0 |
| 운영 헬스 | 배포 후 / → 200, 각 PR Vercel 운영 배포 success |

---

## 5. 운영 적용 (Act)

- 마이그레이션 `011`은 **추가형(nullable)·비파괴·가역**(롤백 = `DROP COLUMN org_id`, 데이터 손실 0). 사용자가 Supabase SQL 편집기에서 직접 적용, REST로 백필 검증.
- 배포 순서: 마이그레이션(후방호환) → 코드. 적용~배포 사이 잠깐 구 export 코드가 깨졌으나 #37 배포로 즉시 복구.

### 배포 이력
| PR | 내용 | merge |
|---|---|---|
| #35 | backup 404 + import 헬퍼 리팩토링 | dbb0ad3 |
| #36 | 임시 UI 격리 + 설계서 | ff39f38 |
| #37 | 근본 격리(customer.org_id) + export strip | cd21156 |
| #38 | data1/data2 customer 필터 | c6910fb |
| #39 | gitignore + 리포트 문서 | 3160f4a |
| #40 | 보고서·제출 거래처 org 범위 | efc89d7 |

---

## 6. 잔여 / 후속 과제

- **익명 거래처 통일**: 운영에 name='익명' 2건(cust_id 39·65, org_id NULL)이 존재. 향후 PFund2 표준 -999로 통일 검토.
- **export 후속**: data1/data2의 customer 필터는 완료. 추가 PFund2 정합(예: COL_ORGAN 등) 필요 시 별도.
- **`?search=` 전역 브랜치**: customers API의 search-only 브랜치는 현재 UI 미사용. 향후 거래처 자동완성 추가 시 org 범위 적용 필요.

---

## 7. 교훈 (Learnings)

1. **whack-a-mole 경계**: `0cbf228`이 "일괄등록 거래처 안 보임"을 전체표시로 고치며 조직 격리 누수를 유발. 증상 패치가 다음 버그를 만든 전형 — 근본(org_id 부재)을 봐야 했음.
2. **단일 운영 DB 리스크**: 별도 테스트 DB 없이 실명 데이터에 작업. 비파괴/가역 마이그레이션 설계 + 백필 사전 검증으로 안전 확보.
3. **마이그레이션 후방호환 순서**: 추가형 컬럼은 코드보다 먼저 적용 가능하나, "기존 코드가 새 컬럼을 SELECT * 로 읽어 외부(PFund2 .db)에 쓰는" 경로(export)는 후방호환이 깨질 수 있음 — 배포 순서·시점 주의.
4. **격리는 한 화면이 아닌 전 경로**: customer 관리 외 보고서·제출·등록·복구·export까지 거래처 등장 경로 전수 점검이 필요했음.
