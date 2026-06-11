# 후원금 과목코드 반전 버그 수정 완료 리포트

> **Summary**: donation-code-fix 기능 완료. PFund2 공식 역분석으로 발견한 P1 버그 수정 — 후원회 과목코드 반전으로 익명후원금 1회 10만원 한도 검증 미작동 상태 복구.
>
> **Author**: Claude Code (Report Generator Agent)
> **Created**: 2026-06-11
> **Status**: ✅ Completed

---

## 개요

| 항목 | 내용 |
|---|---|
| **Feature** | donation-code-fix |
| **완료일** | 2026-06-11 |
| **소요 기간** | 0.5일 (Starter 규모) |
| **Owner** | DrunkenZealnut |
| **PR** | TBD (ship 단계에서 생성) |

---

## Executive Summary

### 1.3 Value Delivered (4-Perspective)

| Perspective | 내용 |
|---|---|
| **Problem** | PFund2 v2.6.1 공식 역분석으로 발견한 P1 버그. 후원회 과목코드가 공식(94=기명후원금, 95=익명후원금, 96=그밖의수입)과 반대로 프로젝트에 하드코딩(95=기명, 96=익명)됨. 결과: **익명후원금(95) 입력 시 1회 10만원 한도 검증이 동작하지 않고**, 익명 입력에 잘못된 경고(30만원 공개대상·연간한도)가 적용되며, 과목 선택 시 내역 자동입력 반전. 정당 과목 기명/익명 가정(15/16) 허구 발견—공식에는 정당용 기명/익명후원금 과목 자체가 없음. |
| **Solution** | cv_id 하드코딩 제거 → 과목명(`getName(item_sec_cd)`) 기반 분류 전환(SSOT). "익명후원금"/"기명후원금" 명칭으로 판별하면 후원회 94/95 정합 + 정당 자동 비대상(해당 명칭 없음) + 코드값 개정 시 명칭 동일하면 동작 유지. income 페이지 `AUTO_CONTENT_MAP`도 명칭 기반으로 교체. |
| **Function/UX Effect** | 익명후원금 입력 시 1회 10만원 초과 경고 정상 동작 복구. 기명후원금 30만원 초과·연간한도 경고가 올바른 과목에만 적용. 과목 선택 시 내역 자동입력 정확화. 코드값 개정 환경(차기 선거)에서도 명칭 기반이라 깨지지 않음. |
| **Core Value** | 정치자금법상 **익명후원금 1회 한도(10만원)** 라는 법적 통제가 실제로 작동하게 됨. 저장 데이터(사용자가 선택한 cv_id)는 무손상이므로 DB 마이그레이션 불필요. 입력 검증의 정확도만 회복—회계 신뢰성의 최후 안전장치 복구. |

---

## PDCA 사이클 요약

### Plan

**문서**: `docs/01-plan/features/donation-code-fix.plan.md`

**목표**: PFund2 v2.6.1 역분석 발견 P1 버그(익명/기명후원금 과목 반전) 수정. 명칭 기반 분류로 전환하여 한도 검증 정확도 회복.

**예상 기간**: 0.5일 (Starter 규모, 지점 3개: use-donation-limit.ts 수정, income/page.tsx AUTO_CONTENT_MAP 교체, 신규 테스트)

**근거**: `docs/03-analysis/pfund2-exe-feature-gap.analysis.md` P1 항목 + 공식 Fund_Master.db v2.6.1 역분석 + 사용자 실데이터(2022_Fund_Data_2.db) 교차검증

---

### Design

**문서**: `docs/03-analysis/donation-code-fix.analysis.md` (Plan이 설계 겸함 — Starter 규모)

**핵심 설계 결정**:

1. **명칭 기반 SSOT 전환**
   - cv_id 하드코딩 제거: `itemSecCd === 15/16/95/96` → 폐기
   - `const itemName = getName(itemSecCd);` 도출 후 명칭으로 판별
   - `isAnonymous = itemName === "익명후원금"`
   - `isNamedDonation = itemName === "기명후원금"`

2. **정당 자동 비대상화**
   - 정당 CS_ID=3엔 기명/익명후원금 과목 없음
   - 명칭 기반이므로 자동으로 후원금 한도 검증에서 제외

3. **코드값 개정 내구성**
   - 명칭이 같으면 cv_id 변경(차기 선거 코드 개정)에도 동작 유지

---

### Do

**구현 완료 파일**:

| 파일 | 변경 | 라인 |
|---|---|---|
| `app/src/hooks/use-donation-limit.ts` | 수정 | 명칭 기반 분기 + JSDoc 정정 + 의존성 배열 수정 |
| `app/src/app/dashboard/income/page.tsx` | 수정 | AUTO_CONTENT_MAP 명칭 기반 교체 + 주석 정정 |
| `app/src/hooks/use-donation-limit.test.ts` | 신규 | 6개 테스트 케이스(회귀 방지: 96/정당과목) |

**변경 상세**:

#### 1. `use-donation-limit.ts` (명칭 기반 분류)

```typescript
// 과목명으로 후원금 유형 판별 (cv_id 하드코딩 금지)
const itemName = getName(itemSecCd);
const isAnonymous = itemName === "익명후원금";
const isNamedDonation = itemName === "기명후원금";

// 1회 한도(익명: 10만원)
if (isAnonymous && Math.abs(amount) > anonLimit) { ... }

// 30만원 공개 대상(기명만)
if (isNamedDonation && Math.abs(amount) > 300000) { ... }

// 연간 한도(양 과목)
if (custId > 0 && (isNamedDonation || isAnonymous)) { ... }
```

- JSDoc 정정: "94=기명, 95=익명, 96=그 밖의 수입" 명시
- 의존성 배열: `[getByCategory, getName]` 추가

#### 2. `income/page.tsx` AUTO_CONTENT_MAP

```typescript
// 명칭 기반으로 과목 선택 시 자동 내역 입력
function handleItemChange(v: number) {
  const name = getName(v);
  const auto = (name === "당비" || name === "기명후원금" || name === "익명후원금") ? name : "";
  setForm({ ...form, item_sec_cd: v, content: auto && !form.content ? auto : form.content });
}
```

- 틀린 주석(373행 "과목코드: 15=기명...") 제거

#### 3. `use-donation-limit.test.ts` (신규, 105줄)

**6개 케이스** (공식 코드 94/95/96/16, 한도 CV 정확 반영):

1. 익명후원금(95) + 11만원 → 1회 한도 초과 경고 ✅
2. 익명후원금(95) + 9만원 → 경고 없음 ✅
3. 기명후원금(94) + 31만원 → 30만원 공개 경고 ✅
4. **그밖의수입(96) → 경고 없음** (회귀 핵심: 과거엔 96이 익명으로 오인) ✅
5. **정당 과목(16) → 경고 없음** (회귀 핵심: 정당엔 기명/익명후원금 없음) ✅
6. 기명후원금에 익명 한도 미부착 (교차오염 방지) ✅

---

### Check (Gap Analysis)

**분석 문서**: `docs/03-analysis/donation-code-fix.analysis.md`

**실행 환경**:
- `node node_modules/vitest/vitest.mjs run`
- `node node_modules/eslint/bin/eslint.js app/src/hooks/use-donation-limit.ts app/src/app/dashboard/income/page.tsx app/src/hooks/use-donation-limit.test.ts`
- `node node_modules/next/dist/bin/next build`

**결과**:

| 항목 | 결과 |
|---|---|
| **Match Rate** | **100%** |
| **Gap** | 0건 (Missing 0 / Added 0 / Changed 0) |
| **vitest** | **606 passed** (신규 6 + 기존 600) |
| **eslint** | **0 errors** |
| **next build** | **✓ Compiled successfully** |

**Plan 검증 기준(Acceptance) 5항목 전부 충족**:

| # | 기준 | 결과 |
|---|---|---|
| 1 | 익명 +100,001 → 10만 초과 경고 | ✅ 명칭 기반 분류 정상 동작 |
| 2 | 그밖의수입(96) → 경고 없음 | ✅ 명칭 미매칭으로 자동 비대상화 |
| 3 | 기명 +300,001 → 30만 공개 경고 | ✅ 기명후원금에만 적용 |
| 4 | "익명후원금" 선택 시 내역 자동입력 | ✅ handleItemChange 연결 |
| 5 | 신규 6건 + 기존 테스트 통과 | ✅ vitest 606 passed |

**영향 없음 항목 확인**:
- `donors/page.tsx`: over30/over300 금액 임계값 비교 (cv_id 하드코딩 없음)
- `lib/accounting/code-mapping.ts`: 한글 과목명 매핑 (명칭 기반)
- `lib/wizard-mappings.ts`, `lib/help-texts.ts`: 설명 텍스트만

---

## 완료 항목

- ✅ `use-donation-limit.ts` — 명칭 기반 분기 + JSDoc 정정 + 의존성 배열 추가
- ✅ `income/page.tsx` — AUTO_CONTENT_MAP 명칭 기반 교체 + 주석 정정
- ✅ `use-donation-limit.test.ts` — 신규 6케이스 (회귀 방지 포함)
- ✅ vitest 606 passed, eslint 0 errors, next build ✓
- ✅ Gap analysis 100% Match Rate

---

## 미완료/지연 항목

- 없음 (모든 목표 달성)

---

## 학습 및 개선

### 잘된 점

1. **공식 역분석 철저함**
   - PFund2 v2.6.1 설치 exe 분석으로 P1 버그 발견
   - 사용자 실데이터로 교차검증(94 기명 34건, 95 익명 13건 — 전건 10만원 이하)
   - 공식 CODESET/CODEVALUE 311건 정확 파악

2. **명칭 SSOT 원칙 일관**
   - election-item-classification-ssot 메모리와 동일 철학 적용
   - 코드값 개정에도 견고한 설계(명칭 불변이면 동작 유지)

3. **테스트 회귀 방지**
   - 버그 재발 핵심(96 오인, 정당 과목) 명시 케이스로 보호
   - 6케이스 > Plan 5케이스 (보너스 교차오염 방지)

### 개선할 점

1. **정당 과목 재검토**
   - 정당용 기명/익명후원금 과목이 없다는 발견 중요
   - 향후 정당 계열 feature에서 과목 가정 재점검 필수

2. **cv_id 하드코딩 grep**
   - 이번 버그는 하드코딩된 cv_id 비교 때문
   - 새로운 코드 리뷰 시 `itemSecCd === N` 패턴 주의

### 다음 번에 적용할 점

- 공식 프로그램 역분석 → 설계 초기 활용 (코드 구현 전)
- 정당/후원회 계정 과목 구분 매트릭스 별도 문서화
- 대용량 사용자 실데이터 샘플(2022_Fund_Data_2.db) 정기 교차검증

---

## 다음 단계

1. **ship 단계** (요청 시 수행)
   - `app/VERSION` 업데이트: 0.11.1.0 → 0.12.0.0 (MINOR bump)
   - 커밋 메시지: `fix(donation-limit): 후원금 과목코드 반전 버그 수정 (v0.12.0.0) (#NN)`
   - PR 작성 및 merge → Vercel 자동 배포

2. **문서 갱신** (release 단계)
   - `CHANGELOG.md`: 익명후원금 한도 검증 복구 기록
   - `RAG/` 해당 FAQ 업데이트(후원금 한도 안내)

3. **사용자 공지** (선택)
   - 익명후원금 입력 시 1회 10만원 한도 경고 정상화 안내

---

## 요약

PFund2 v2.6.1 공식 역분석으로 발견한 P1 버그(후원회 과목 반전)를 명칭 기반 SSOT로 완벽히 수정. 익명후원금 1회 10만원 한도 검증이 정상 동작하게 되었으며, 저장 데이터는 무손상(사용자 선택 cv_id 유지), 입력 검증의 정확도만 회복. 테스트 커버리지 6개 케이스로 회귀 방지 강화. Gap 0, Match Rate 100%.

**조치**: `/pdca report` 완료 → ship 단계에서 버전 업데이트 및 PR 생성 대기.
