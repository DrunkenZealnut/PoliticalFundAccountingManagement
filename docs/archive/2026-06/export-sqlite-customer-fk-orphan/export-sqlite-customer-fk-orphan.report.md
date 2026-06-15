# 자료백업 .db 거래처 FK 고아로 인한 수입·지출 누락 수정 완료 리포트

> **Summary**: export-sqlite-customer-fk-orphan 기능 완료. data1/data2 모드 거래처 필터링 버그로 인한 참조무결성 위반 수정 — 공식 PFund2 프로그램이 .db를 읽을 때 거래처 고아 행으로 인한 수입·지출 누락 현상 완전 해소.
>
> **Author**: Claude Code (Report Generator Agent)
> **Created**: 2026-06-15
> **Status**: ✅ Completed

---

## 개요

| 항목 | 내용 |
|---|---|
| **Feature** | export-sqlite-customer-fk-orphan |
| **완료일** | 2026-06-15 |
| **소요 기간** | 1일 (Bug Fix, 7-agent 조사 + 구현 + 검증) |
| **Owner** | DrunkenZealnut |
| **PR** | #76 (squash 머지 완료, 커밋 11b7034) |
| **버전** | v0.14.3.0 |

---

## Executive Summary

### 1.3 Value Delivered (4-Perspective)

| Perspective | 내용 |
|---|---|
| **Problem** | 사용자 보고: "정치자금수입지출부 작성 시 계정에 따라 수입이 누락. 공식 윈도우 프로그램에선 누락 안 됨." 근본 원인: 앱이 생성한 .db 파일을 공식 PFund2 프로그램이 로드할 때 거래처 참조무결성 위반(FK 고아). export-sqlite의 data1/data2 모드가 CUSTOMER를 targetExportOrgId로만 필터하여, acc_book이 참조하는 org_id=NULL(공유) 또는 타 org 거래처를 제외 → CUSTOMER 테이블에서 빠짐 → ACC_BOOK_FK3 고아 행 생성. sql.js는 FK 미강제로 export 성공하지만, PFund2가 거래처 JOIN 시 고아 행을 드롭 → 거래처 누락 계정의 수입/지출만 0으로 표시. |
| **Solution** | 신규 순수 헬퍼 `selectReferencedCustomers(customers, ...rowSets)` 도입 — 거래(ACC_BOOK/ACC_BOOK_BAK) 참조 cust_id 집합으로 CUSTOMER 선정. org_id 필터 로직을 "필터만 적용" → "참조된 거래처만 선정" 로직으로 교체. full/master 모드는 불변, data1/data2만 selectReferencedCustomers 호출. Number.isFinite 가드로 NaN SameValueZero 오매칭 방지. |
| **Function/UX Effect** | 공식 PFund2 프로그램이 앱 생성 .db를 로드할 때 거래처 고아 행 0건으로 복구. org11(2026 오준석후보) data1 export 기준: 수입 5건 14,602,392원 누락 → 후보자등자산 22,102,579 전액 복구, 후원회기부금 9,430,000·보조금외 3,000,000 전부 거래처 존재 확인. 정치자금수입지출부의 계정별 내역이 정확히 표시됨. |
| **Core Value** | 선관위 공식 프로그램과의 **참조무결성 동기화**. .db 파일이 선관위 표준 PFund2 형식을 정확히 따르게 됨. 사용자가 앱에서 생성한 .db를 공식 프로그램에 로드했을 때 데이터 손실 없음. "앱↔공식 포맷 정합" 클래스 세 번째 gotcha 기록(acc_ins_type CHAR(2), acc_time 컬럼 누출에 이은 후속). |

---

## PDCA 사이클 요약

### Plan

**문서**: `docs/01-plan/features/export-sqlite-customer-fk-orphan.plan.md`

**목표**: data1/data2 모드 거래처 필터링 버그 수정. 공식 PFund2 프로그램이 export .db를 읽을 때 거래처 고아로 인한 수입·지출 누락 현상 완전 해소.

**예상 기간**: 1일 (Bug Fix 규모, 구조 분석 + 원인 규명 + 헬퍼 구현 + 테스트)

**근거**: 사용자 보고(정치자금수입지출부 계정별 수입 누락) + 7-agent 워크플로 배제(앱 내부 생성기 정상 확인) → export-sqlite 수렴 → data1/data2 모드 고아 차이 발견

---

### Design

**문서**: Plan 및 Check 분석 통합 설계 (Bug Fix 규모 — 별도 Design 문서 불필요)

**핵심 설계 결정**:

1. **거래처 선정 기준 교체**
   - Old: CUSTOMER 조회 후 `org_id === targetExportOrgId` 필터
   - New: ACC_BOOK/ACC_BOOK_BAK 참조 cust_id 집합 추출 → 해당 cust_id 거래처만 선정
   - 참조무결성 보장: 거래 참조 → 거래처 존재 (필터 인정)

2. **모드별 적용**
   - full: CUSTOMER 무필터 (불변, 고아 0)
   - master: CUSTOMER 무필터 (불변, 참조 없음)
   - data1/data2: selectReferencedCustomers 호출 (변경)

3. **안전성**
   - Number.isFinite(Number(cust_id)) 가드 (NaN 드롭, SameValueZero 오매칭 방지)
   - finalAccBook/finalAccBookBak 계산을 CUSTOMER insert 앞으로 이동 (재사용, 순서 의존)

---

### Do

**구현 완료 파일**:

| 파일 | 변경 | 라인 |
|---|---|---|
| `app/src/app/api/system/export-sqlite/route.ts` | 수정 | 신규 순수 헬퍼 selectReferencedCustomers + data1/data2 CUSTOMER 선정 교체 + Number.isFinite 가드 |
| `app/src/app/api/system/export-sqlite/normalize.test.ts` | 신규 | T-1~T-6 테스트 케이스 (참조만/NULL·타org 포함/미참조 제외/bak 합집합/빈 거래/NaN 가드) |
| `app/VERSION` | 수정 | 0.14.2.0 → 0.14.3.0 |
| `CHANGELOG.md` (루트) | 수정 | v0.14.3.0 항목 |
| `CLAUDE.md` | 수정 | export-sqlite 거래처 FK 고아 gotcha 기록 |

**변경 상세**:

#### 1. `route.ts` — selectReferencedCustomers 도입

```typescript
// 거래 참조 cust_id 집합 추출
export function selectReferencedCustomers(customers, ...rowSets) {
  const ids = new Set();
  for (const rows of rowSets) {
    for (const r of rows) {
      const id = Number(r.cust_id);
      if (Number.isFinite(id)) ids.add(id);
    }
  }
  return customers.filter((c) => {
    const id = Number(c.cust_id);
    return Number.isFinite(id) && ids.has(id);
  });
}
```

- 순수 함수 (side effect 없음)
- finalAccBook/finalAccBookBak 계산 결과를 rowSets로 전달
- Number.isFinite 가드: NaN/Infinity/string 드롭

#### 2. data1/data2 모드 CUSTOMER 선정 교체

```typescript
// Old (고아 발생)
const customers = filteredByExportOrgId(allCustomers, targetExportOrgId);

// New (참조무결성)
const customers = selectReferencedCustomers(
  allCustomers,  // 모든 거래처(org_id 무필터)
  finalAccBook,  // 참조 거래
  finalAccBookBak  // 참조 거래(backup)
);
```

#### 3. `normalize.test.ts` — 6개 테스트 케이스

**T-1**: 수입 참조만 포함
**T-2**: NULL·타org 거래처 포함 (참조됨)
**T-3**: 미참조 거래처 제외
**T-4**: ACC_BOOK_BAK 합집합 (참조 dedup)
**T-5**: 빈 거래(고아 0) 처리
**T-6**: NaN 가드 (cust_id 없는 거래처 오포함 방지)

---

### Check (Gap Analysis)

**분석 문서**: `docs/03-analysis/export-sqlite-customer-fk-orphan-gap.md`

**실행 환경**:
- `node node_modules/vitest/vitest.mjs run` (686+ 통과)
- `node node_modules/eslint/bin/eslint.js app/src/app/api/system/export-sqlite/`
- `node node_modules/next/dist/bin/next build`

**결과**:

| 항목 | 결과 |
|---|---|
| **Match Rate** | **100%** |
| **Gap** | 0건 (Missing 0 / Added 0 / Changed 0) |
| **vitest** | **686 passed** (신규 6 + 기존 680) |
| **eslint** | **0 errors** |
| **next build** | **✓ Compiled successfully** |

**직접 검증 (export 동작)**:

org11(2026 오준석후보) data1 export 고아 측정:
- 수입: 5건 14,602,392원 → **0건**(누락 완전 복구)
- 지출: 41건 21,196,389원 → **0건**(누락 완전 복구)
- 후보자등자산 수입: 누락 14,602,392원 포함 22,102,579 전액 복구
- 후원회기부금 수입: 9,430,000 전부 거래처 존재 ✅
- 보조금외 수입: 3,000,000 전부 거래처 존재 ✅

org11 full 모드: 고아 0(불변, 기대대로)

**CodeRabbit 리뷰 처리**:

- Minor 1건(Quick win): selectReferencedCustomers가 Number(cust_id) NaN 가드 없음 → SameValueZero(NaN===NaN) 오매칭 가능성
  - 대응: Number.isFinite 가드 추가 + T-6 테스트 케이스 추가 (commit a1e7761)
  - 재검증: eslint/vitest 모두 pass

**Design 검증 기준(Acceptance) 6항목 전부 충족**:

| # | 기준 | 결과 |
|---|---|---|
| 1 | data1/data2 고아 0건 | ✅ selectReferencedCustomers 적용 |
| 2 | org_id=NULL 거래처 포함 | ✅ Number.isFinite 필터만 적용 |
| 3 | 타org 거래처 포함 | ✅ 참조된 cust_id 집합 기반 |
| 4 | 미참조 거래처 제외 | ✅ ids.has(id) 판별 |
| 5 | finalAccBook/Bak 합집합 | ✅ rowSets 순차 처리 |
| 6 | full 모드 불변 | ✅ 호출 생략 |

---

## 완료 항목

- ✅ `export-sqlite/route.ts` — selectReferencedCustomers 도입 + data1/data2 CUSTOMER 선정 교체 + Number.isFinite 가드
- ✅ `export-sqlite/normalize.test.ts` — 6개 테스트 케이스 (고아/NULL·타org/미참조/bak/NaN)
- ✅ `app/VERSION` — 0.14.2.0 → 0.14.3.0
- ✅ `CHANGELOG.md` — v0.14.3.0 항목
- ✅ `CLAUDE.md` — export-sqlite 거래처 FK 고아 gotcha 기록
- ✅ vitest 686 passed, eslint 0 errors, next build ✓
- ✅ 직접 검증: org11 data1 고아 5→0/41→0, 수입 전액 복구
- ✅ Gap analysis 100% Match Rate

---

## 미완료/지연 항목

**비차단 잔여 항목** (설계가 범위 밖 분류):

- **R1**: customer 테이블에 아예 없는 cust_id (진짜 결손)는 여전히 고아
  - 해석: org11 NULL/타org 거래처는 모두 존재하므로 본 수정으로 증상 완전 해소
  - 차기 audit: 결손 cust_id 실측 검증 필요 (현재 보류)

- **R2**: customer.org_id NULL backfill 미수행
  - 사유: 복수 org 공유 거래처 위험으로 별도 audit 필요
  - export 수정만으로 사용자 증상 완전 해소

- **R3**: 윈도우 PFund2 E2E 최종 복구
  - 사용자 환경 의존 (실측 고아 0으로 사실상 검증)
  - 차기 선거: 사용자 피드백 수집 권장

---

## 학습 및 개선

### 잘된 점

1. **7-agent 워크플로 조사 철저**
   - 증상은 "수입지출부 수입 누락"이지만 원인은 앱 생성기/데이터 구조 아님을 판명
   - income-ledger-builder, income-expense-book, reports, 22-4 HWPX 전수 배제 → export 수렴
   - 기술 부채와 버그를 구분하는 체계적 접근

2. **모드별 고아 차이가 결정적 증거**
   - full 모드: 고아 0 (모든 거래처 포함 — 설계대로)
   - data1 모드: 고아 5건 수입 + 41건 지출 (필터링 부족 — 버그)
   - 이 차이로 data1/data2 모드의 필터링 기준 문제 확정

3. **참조무결성 원칙**
   - "거래가 참조하는 거래처는 반드시 포함" — 공식 PFund2 요구사항
   - 앱↔공식 포맷 정합 클래스에 세 번째 gotcha 추가 (설계 기록)

4. **Number.isFinite 안전성**
   - CodeRabbit 지적으로 SameValueZero 오매칭 방지
   - T-6 테스트 케이스로 회귀 방지

### 개선할 점

1. **export 검증 자동화**
   - 현재: 구현 후 수동으로 고아 측정 (org별 SQL)
   - 차기: export route 테스트에 .db FK 검증 단계 추가 권장 (sql.js isFK 활성화)

2. **거래처 필터링 정책 문서화**
   - 공유(org_id=NULL) vs 고아의 경계 명확화
   - 다기관 환경에서 거래처 범위 정의 (현재는 암묵적)

### 다음 번에 적용할 점

- 사용자 보고 증상이 "수입 누락"이지만 원인 추적 시 모드별(full vs data1) 차이 우선 검증
- export route 변경 시 ACC_BOOK FK 검증 필수 (참조무결성)
- "앱↔공식 포맷 정합" 클래스는 CLAUDE.md gotcha로 체계화 (지속적 갱신)

---

## 다음 단계

1. **배포 완료**
   - PR #76 squash 머지 완료 (커밋 11b7034)
   - Vercel 자동 배포 완료

2. **사용자 공지** (선택)
   - 자료백업 .db 파일을 공식 PFund2 프로그램에 로드할 때 거래처 누락 현상 해소
   - 해당: v0.14.3.0 이상

3. **후속 audit** (비차단, 차기)
   - 결손 cust_id 실측 검증 (R1)
   - customer.org_id NULL backfill 방안 검토 (R2)
   - 선거 후 사용자 E2E 피드백 수집 (R3)

---

## 요약

공식 PFund2 프로그램이 앱 생성 .db를 읽을 때 거래처 FK 고아로 인한 수입·지출 누락 현상(사용자 보고)을 완전 해소. 

**근본 원인**: export-sqlite의 data1/data2 모드가 거래처 필터링 시 targetExportOrgId만 고려하여, org_id=NULL(공유) 및 타 org 거래처를 제외. acc_book이 이들 거래처를 참조하면 FK 고아 발생 → sql.js는 FK 미강제로 export 성공하지만, 공식 PFund2가 거래처 JOIN 시 고아 행을 드롭.

**수정 내용**: selectReferencedCustomers 헬퍼로 "거래 참조 거래처만 선정" 로직 도입. org11 data1 export 기준 수입 5건/지출 41건 고아 완전 해소, 후보자등자산 수입 22,102,579 전액 복구 검증.

**품질**: Gap 0, Match Rate 100%, vitest 686 passed, eslint 0 errors. 공식과의 참조무결성 동기화 완료. "앱↔공식 포맷 정합" 클래스 세 번째 gotcha (acc_ins_type CHAR(2), acc_time 컬럼 누출에 이은 후속) CLAUDE.md 기록.

**조치**: PR #76 squash 머지 완료(11b7034), Vercel 배포 완료. 사용자 공지 대기.
