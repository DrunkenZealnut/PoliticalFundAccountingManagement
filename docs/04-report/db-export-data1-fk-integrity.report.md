# db-export-data1-fk-integrity 완료 보고서

> **Plan**: (없음 — 사용자 즉시 점검·패치 요청, 정식 PDCA 사이클 미진행)
> **Design**: (없음)
> **Analysis**: 인라인 코드 감사 (이 보고서 §3 참조)
> **Status**: ✅ 완료 (회귀 0건, 단위 테스트 125/125 통과)
> **Date**: 2026-05-16 (단일 세션)
> **Predecessor**: `docs/archive/2026-05/db-export-login-id/` — PFund2 호환 mode=data1/data2 도입 작업의 후속 정합성 패치

---

## Executive Summary

| 항목 | 값 |
|---|---|
| Feature | db-export-data1-fk-integrity |
| 시작 | 2026-05-16 22:30 |
| 종료 | 2026-05-16 23:55 |
| 총 소요 | 약 1.5시간 (점검 30분 + 수정 15분 + 검증 10분 + 보고서 30분) |
| 변경 파일 | 1개 (`app/src/app/api/system/export-sqlite/route.ts`) |
| 변경 LOC | +29 / −21 (50줄 변경) |
| 단위 테스트 | 125/125 통과 (accounting/ 디렉터리 8개 파일) |
| TS/ESLint | 신규 에러 0건 |
| Match Rate | N/A (정식 Design 문서 없음 — 의도 vs 구현 일치 자체점검) |

### Value Delivered (4-Perspective)

| Perspective | 내용 |
|---|---|
| **Problem** | PFund2 호환 mode=data1/data2 export에서 ACC_BOOK은 ORG_ID 필터링되지만 ESTATE/OPINION/SUM_REPT/COL_ORGAN/ALARM 5개 종속 테이블은 필터링되지 않아, 후원회 supabase organ에서 data1을 호출하면 ORGAN에는 ORG_ID=1(후보자)만 들어가는데 ESTATE 등은 ORG_ID=2(후원회)로 들어가는 dangling 참조가 발생. ESTATE는 `ORGAN(ORG_ID)` FK가 명시되어 있고, OPINION은 PK가 ORG_ID이므로 PFund2가 무결성 가정으로 동작 중 오작동 가능. 추가로 OPINION fallback의 ORG_ID 결정 로직이 export mode를 반영하지 않아 동일 시나리오에서 ORGAN과 OPINION의 ORG_ID가 어긋날 수 있음. |
| **Solution** | (a) `targetExportOrgId` 변수를 mode 판정 직후에 도입 (data1→1, data2→2, full/master→null), (b) `filterByExportOrgId` 헬퍼를 generic으로 일반화하여 ACC_BOOK·ACC_BOOK_BAK·ESTATE·OPINION·SUM_REPT·COL_ORGAN·ALARM에 동일한 필터 적용, (c) OPINION fallback ORG_ID 분기를 `targetExportOrgId ?? orgIdMap.get(numOrgId) ?? 1` 순서로 변경하여 mode를 최우선 반영. 단일 변수·단일 헬퍼로 5개 테이블의 무결성 정책을 통일. |
| **Function/UX Effect** | 후원회 supabase organ에서 data1 export 호출 시 — 수정 전: ORGAN 1행(후보자) + ESTATE/OPINION 등이 ORG_ID=2로 들어가 PFund2 무결성 위반. 수정 후: ORGAN 1행 + 모든 종속 테이블 0건 (ORGAN과 정합). 후보자 supabase organ에서 data2 호출 시도 동일한 일관성. 사용자가 잘못된 mode를 누르더라도 dangling 참조 없는 깔끔한 빈 결과가 생성되어 PFund2 가져오기 후 비정상 동작 위험이 사라짐. |
| **Core Value** | PFund2 Fund_Data_N.db 호환 export의 **외래키·PK 매핑 무결성**을 ACC_BOOK 외에 5개 종속 테이블까지 확장. 호환성 결함을 "런타임 정합성 가정"이 아닌 "export 단계 데이터 정합성"으로 끌어올려 PFund2 ↔ 우리 웹앱 양방향 동기화 신뢰도가 향상됨. db-export-login-id 작업이 정식 PFund2 호환을 가능하게 했다면, 본 작업은 그 호환성의 **수치적 무결성 보장**을 추가. |

---

## 1. 작업 흐름 (즉시 패치)

이번 작업은 사용자의 **단발성 점검 요청**으로 시작되어 발견된 결함 3건을 즉시 수정한 형태로, 정식 PDCA Plan/Design/Analysis 문서를 사전 작성하지 않았다. 흐름:

1. **사용자 요청**: "fund_data_1.db (후보자 회계) 생성 과정도 문제없는지 점검해주세요"
2. **인라인 감사**: 핵심 파일 4개 정독 (route.ts / pfund2-constants.ts / organ-pair.ts / submit/page.tsx) → 결함 3건 식별·보고
3. **사용자 승인**: "직접 수정해줘"
4. **3 Edit 패치 + 검증** (lint, vitest, tsc)
5. **보고서 작성** (본 문서)

향후 동일 도메인 작업은 `/pdca plan` → `/pdca design` 흐름을 권장하지만, 변경 범위가 50줄·1파일이라 retrospective 보고로 충분하다고 판단.

---

## 2. 발견된 결함 (Check 결과)

### 결함 #1 — ESTATE/OPINION/SUM_REPT/COL_ORGAN/ALARM 필터링 누락 (Critical)

**위치**: `app/src/app/api/system/export-sqlite/route.ts:671-699` (수정 전)

**증상**:
- ACC_BOOK은 `isData1Mode ? filterByExportOrgId(remappedAccBook, 1) : ...` 식으로 mode별 필터를 거쳐 들어가지만,
- ESTATE/OPINION/SUM_REPT/COL_ORGAN/ALARM은 `insertRows(db, "ESTATE", remapOrgId(estate, orgIdMap))` 처럼 remap만 거치고 mode 필터를 거치지 않음.

**파급**:
- 후원회 supabase organ(예: ORG_SEC_CD=91) + data1 호출 시
  - `orgIdMap = { supabase_org_id → 2 }` (후원회만 매핑)
  - ACC_BOOK: remap=2 → data1 필터 → 0건 ✅
  - ESTATE/OPINION: remap=2 → 그대로 insert → ORG_ID=2 행이 ORGAN(ORG_ID=1)에 dangling ❌
- ESTATE는 DDL에 `CONSTRAINT ESTATE_FK1 FOREIGN KEY (ORG_ID) REFERENCES ORGAN(ORG_ID)` 명시
- sql.js는 `PRAGMA foreign_keys=OFF`가 기본이라 insert 자체는 성공하지만, **PFund2가 무결성 가정으로 동작 중 오작동 가능**.

### 결함 #2 — OPINION fallback의 ORG_ID 분기 미스 (Medium)

**위치**: `route.ts:612-614` (수정 전)

```ts
const syncedOpinion = opinion.length > 0
  ? opinion.map((row) => ({ ...row, ...settlementOverlay }))
  : [{ org_id: orgIdMap.get(numOrgId) ?? 1, ...settlementOverlay }];
```

**증상**: opinion 행이 없을 때 fallback ORG_ID가 `orgIdMap.get(supabase_org_id)` 기준으로 결정됨.

**파급**: 후원회 supabase organ + data1 호출 시 fallback OPINION이 `org_id=2`로 생성되어 ORGAN(ORG_ID=1)과 매핑 어긋남 (결함 #1과 동일 시나리오).

### 결함 #3 — UX 안내와 실제 출력 불일치 (Low)

**위치**: `app/src/app/dashboard/submit/page.tsx:519`

**증상**: UI tooltip은 "후보자 단독 + **그 organ 거래**"라고 안내하지만, supabase에 후보자 organ이 없으면 거래 0건짜리 파일이 생성됨.

**처리**: 본 PR 범위에서는 **유보**. UX 변경은 별도 후속 작업으로 분리 (사용자 동의).

---

## 3. 수정 내역 (Do 결과)

### Diff 요약

```
app/src/app/api/system/export-sqlite/route.ts | 50 ++++++++++++++++-----------
 1 file changed, 29 insertions(+), 21 deletions(-)
```

### Edit 1: targetExportOrgId 변수 도입

```ts
// 추가 위치: isMasterMode/isData1Mode/isData2Mode 정의 직후
// data1=후보자(ORG_ID=1), data2=후원회(ORG_ID=2), full/master=필터 없음.
// ESTATE/OPINION/SUM_REPT/COL_ORGAN/ALARM 등 org_id 종속 테이블 일괄 필터에 사용.
const targetExportOrgId: number | null = isData1Mode ? 1 : isData2Mode ? 2 : null;
```

### Edit 2: OPINION fallback ORG_ID 우선순위 재정의

```ts
const fallbackOpinionOrgId =
  targetExportOrgId ?? orgIdMap.get(numOrgId) ?? 1;
const syncedOpinion = opinion.length > 0
  ? opinion.map((row) => ({ ...row, ...settlementOverlay }))
  : [{ org_id: fallbackOpinionOrgId, ...settlementOverlay }];
```

우선순위:
1. data1/data2 모드 → export ORG_ID (1 또는 2) 강제
2. full/master → supabase org_id → export ORG_ID 매핑
3. 매핑 실패 → 1 (최소 후보자 행 보장)

### Edit 3: filterByExportOrgId generic 헬퍼 + 5개 테이블 일괄 적용

```ts
const filterByExportOrgId = <T extends Record<string, unknown>>(rows: T[]): T[] =>
  targetExportOrgId === null
    ? rows
    : rows.filter((r) => Number(r.org_id) === targetExportOrgId);

// ACC_BOOK (기존 동작 유지)
const finalAccBook = filterByExportOrgId(remapOrgId(accBook, orgIdMap));
const finalAccBookBak = filterByExportOrgId(remapOrgId(accBookBak, orgIdMap));

// 신규 적용 5개 테이블
insertRows(db, "ESTATE",   filterByExportOrgId(remapOrgId(estate, orgIdMap)));
insertRows(db, "OPINION",  filterByExportOrgId(remapOrgId(syncedOpinion, orgIdMap)));
insertRows(db, "SUM_REPT", filterByExportOrgId(remapOrgId(sumRept, orgIdMap)));

const colOrganRemapped = filterByExportOrgId(remapOrgId(colOrgan, orgIdMap));
// ... 기존 dedup 로직 유지
const alarmRemapped = filterByExportOrgId(remapOrgId(alarm, orgIdMap));
// ... 기존 dedup 로직 유지
```

---

## 4. 동작 매트릭스 (수정 전/후 비교)

| 모드 | supabase organ | 수정 전 | 수정 후 |
|---|---|---|---|
| data1 | 후보자 (54/90/106) | 정상 | 정상 (불변) |
| data1 | 후원회 (91/92/107/108/109/587/588) | ESTATE/OPINION/SUM_REPT 등이 ORG_ID=2로 들어가 ORGAN(ORG_ID=1)과 dangling | 해당 5개 테이블 0건 (ORGAN과 정합) |
| data2 | 후원회 | 정상 | 정상 (불변) |
| data2 | 후보자 | ORGAN=ORG_ID=2 행 미생성 → ESTATE 등이 ORG_ID=1로 들어가 dangling | 일관되게 0건 (ORGAN/ESTATE 모두 0건) |
| full | 모두 | 정상 | 정상 (filterByExportOrgId가 통과) |
| master | 모두 | 정상 (fetch 단에서 거래 [] 반환) | 정상 (불변) |

---

## 5. 회귀 검증 결과

### ESLint
```
✖ 9 problems (2 errors, 7 warnings)
```
**판정**: 통과. 모든 신규 에러 0건. 기존 2 errors는 `app/src/app/dashboard/reimbursement/page.tsx`의 `expCum` 변수 reassign으로 본 PR과 무관.

### Vitest
```
Test Files  8 passed (8)
Tests       125 passed (125)
Duration    576ms
```
**판정**: 통과. accounting/ 디렉터리 전체 — `code-mapping`, `funding-source`, `organ-pair`, `parity-errors`, `pfund2-constants`, `reimbursement-aggregator`, `settlement-calc`, `submission-forms` 8개 파일 125건 모두 통과.

### tsc --noEmit
```
(no output)
```
**판정**: 통과. 타입 에러 0건.

---

## 6. 산출물

### 수정 파일 (1개)

| 파일 | 변경 요약 |
|---|---|
| `app/src/app/api/system/export-sqlite/route.ts` | targetExportOrgId 변수 + filterByExportOrgId generic 헬퍼 + OPINION fallback 분기 수정. ESTATE/OPINION/SUM_REPT/COL_ORGAN/ALARM에 mode 필터 일괄 적용. |

### 신규 파일 (1개)

| 파일 | 역할 |
|---|---|
| `docs/04-report/db-export-data1-fk-integrity.report.md` | 본 보고서 |

### 테스트 변경 없음

본 PR은 코어 로직 흐름 변경(필터 적용 위치 추가)으로, 단위 테스트 변경은 없음. 기존 125건이 회귀 방지 역할을 수행. 향후 통합 테스트(실제 sql.js로 .db 생성 후 ORG_ID 일관성 검증)는 별도 작업으로 분리 가능.

---

## 7. 한계 및 후속 권고

### 한계
1. **본 PR은 단위 테스트로 검증되지 않음** — sql.js를 실제로 띄우고 다양한 mode×supabase organ 조합의 export 결과를 비교하는 **통합 테스트**가 부재. 현재 검증은 (a) 단위 테스트 회귀 없음 (b) 코드 리뷰로 논리적 정합성 확인 두 가지에 의존.
2. **실 PFund2 환경 검증 미수행** — 수정된 .db를 실제 윈도우 PFund2 v5에 가져와 동작 확인하는 단계는 사용자 환경에 의존.
3. **ESLint 기존 에러 2건 미해결** — `reimbursement/page.tsx`의 `expCum` reassign은 본 PR 범위 밖.

### 후속 권고
1. **(High) 통합 테스트 추가**: `/api/system/export-sqlite` 라우트를 실제 호출하여 4 mode × 2 supabase organ 종류 = 8 조합의 ORG_ID 일관성을 검증. 다음과 같은 assertion 추천:
   - `SELECT COUNT(*) FROM ESTATE WHERE ORG_ID NOT IN (SELECT ORG_ID FROM ORGAN)` = 0
   - `SELECT COUNT(*) FROM OPINION WHERE ORG_ID NOT IN (SELECT ORG_ID FROM ORGAN)` = 0
   - 동일 패턴으로 SUM_REPT / COL_ORGAN / ALARM 확인
2. **(Medium) UX 경고 추가** (결함 #3 후속): submit 페이지에서 data1 호출 시 supabase에 후보자 organ이 없으면 "거래 0건 파일이 생성됩니다" alert를 띄우거나, 후보자 organ 보강을 권유.
3. **(Low) sql.js PRAGMA foreign_keys=ON 도입 검토**: export 시점에 FK 제약을 강제하여 dangling 참조가 insert 단에서 실패하도록 fail-fast 처리. 단, 기존 우리 ACC_BOOK에 dangling이 잠재해 있다면 export가 깨질 수 있으므로 사전 데이터 감사 필요.

---

## 8. 학습 사항 (Lessons Learned)

1. **공용 필터 헬퍼는 일찍 generic화**: db-export-login-id 작업에서 `filterByExportOrgId`를 ACC_BOOK 전용 로컬 함수로 도입했는데, 본 결함의 본질은 같은 필터를 5개 테이블에 깜빡 누락한 것. 같은 매핑 정책을 적용해야 하는 테이블 군이 보이면 처음부터 generic 헬퍼 + 일관 적용 패턴으로 가는 게 안전.
2. **FK 명시 컬럼은 export 시점에 매핑 정합 검증 가치 높음**: ESTATE_FK1처럼 DDL에 FK가 박혀 있는 컬럼은 무결성 가정 위반 시 PFund2 같은 외부 프로그램에서 silent fail 위험. 자동 검증 단계(FK on, COUNT(*) NOT IN ORGAN 검사 등)가 필요.
3. **OPINION fallback처럼 "데이터 없으면 행 1건 생성" 로직은 mode 의존성을 명시적으로 표현**: 본 결함은 "mode를 추가했는데 mode 영향이 fallback까지 도달하지 않은 누락"이었음. mode 분기 변수(`targetExportOrgId`)를 한 곳에서 정의하고 모든 mode 의존 로직이 그 변수를 참조하도록 강제하는 패턴이 효과적.
4. **사용자 점검 요청 → 보고 → 승인 → 패치 → 검증의 작은 사이클도 retrospective report로 가치 있음**: 정식 PDCA를 거치지 않은 1.5시간 짜리 작업이지만, 발견-수정-검증을 문서화하면 후속 통합 테스트 작업의 기반이 되고, 같은 결함 패턴이 재발하는 것을 막을 수 있음.
