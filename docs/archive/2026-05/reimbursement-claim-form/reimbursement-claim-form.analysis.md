# 선거비용 보전청구서 — Gap 분석 보고서

> **Feature**: reimbursement-claim-form
> **Plan**: `docs/01-plan/features/reimbursement-claim-form.plan.md`
> **Design**: `docs/02-design/features/reimbursement-claim-form.design.md`
> **분석일**: 2026-05-06
> **브랜치**: `feat/reimbursement-claim-form`

## Match Rate

```
┌─────────────────────────────────────────────┐
│  Overall Match Rate: 91%                    │
├─────────────────────────────────────────────┤
│  ✅ Match:           36 items (84%)          │
│  🟡 Minor Gap:        6 items (14%)          │
│  🟠 Major:            1 item   (2%)          │
│  🔴 Critical:         0 items  (0%)          │
└─────────────────────────────────────────────┘
```

**판정**: Report 단계 진입 가능 (>= 90%). Major 1건은 Phase 1 출시 후 리팩터링 권장.

## 섹션별 점수

| 섹션 | 항목 | 점수 | 상태 |
|------|------|:----:|:----:|
| §1.1 자금원 분류 | 4 | 100% | ✅ |
| §1.2 데이터 구조 | 6 | 92% | ✅ |
| §1.3 집계 알고리즘 | 5 | 90% | ✅ |
| §2 서식 1 Excel | 8 | 94% | ✅ |
| §4 UI 설계 | 7 | 86% | ✅ |
| §5.1 API | 4 | 88% | ✅ |
| §7 파일 구조 | 9 | 56% | ⚠️ |
| §10 테스트 전략 | 3 | 100% | ✅ |
| §11 보류/Phase 2 | 5 | 100% | ✅ |
| §13 Acceptance Criteria | 7 | 100% | ✅ |

## Gap 상세 목록

### 🔴 Critical — 0건

### 🟠 Major — 1건

#### M-1. 컴포넌트 파일 분리 미이행

- **위치**: `app/src/app/dashboard/reimbursement/page.tsx` (872줄)
- **Design**: §7 — `components/reimbursement/claim-form-tab.tsx`, `claim-summary-card.tsx`, `claimants-form.tsx` 3 파일 분리
- **실제**: `page.tsx`에 `ClaimFormTab` + `ReimbursementTab` + `BurdenCostTab` + `LedgerTable` + `BurdenCostFormDialog` 모두 통합
- **영향**: 기능 영향 없음 (테스트 모두 통과). 유지보수성·재사용성 저하
- **권장**: Phase 1 출시 후 리팩터링 백로그로 등록

### 🟡 Minor — 6건

#### m-1. `partyName` 필수 → 옵셔널 변경

- **위치**: `lib/excel-template/reimbursement-claim-form.ts`
- **차이**: Design `partyName: string;` → 실제 `partyName?: string;`
- **권장**: Design 문서 갱신 (form2 도입 시 의미 차이 반영)

#### m-2. aggregator 함수 시그니처 변경 (개선)

- **위치**: `lib/accounting/reimbursement-aggregator.ts`
- **차이**: Design은 함수 내부 supabase 호출 → 실제는 순수 함수, DB 조회는 API route
- **권장**: Design 문서 §1.3 갱신 (구현이 우수)

#### m-3. Excel 컬럼 너비 미세 차이

- **차이**: Design A=14, B-E=12, G/H=10 → 실제 A=16, B-E=14, G=12, H=8
- **권장**: 안내서 p.144 작성예시와 비교 후 확정

#### m-4. 양식 종류 선택 UI 누락

- **차이**: Design은 form1/form2 라디오 → 실제 form1 하드코딩
- **권장**: Phase 2(서식2 도입)에서 추가. Design에 "Phase 1: form1 only" 주석

#### m-5. 선거명 하드코딩

- **차이**: Design은 입력 필드(자동+수정 가능) → 실제 `"제9회 전국동시지방선거"` 하드코딩
- **권장**: 차기 선거 재사용을 위해 입력 필드 추가 또는 organ 컬럼 도입

#### m-6. API request에 `formType` 필드 누락

- **차이**: Design `{ orgId, formType }` → 실제 `{ orgId }`
- **권장**: Phase 2 진입 시 추가

## 잘된 점 (Match — 일부 발췌)

- **§1.1 자금원 분류**: 매핑 + 이름 폴백 모두 일치, "자산" 키워드 추가로 폴백 강화
- **§10 테스트 전략**: Design 명세 3 모듈 + `korean-amount.test.ts` 보너스 (총 53건 검증)
- **§11 Phase 2 항목**: 모두 의도된 미구현 (선거연락소·서식2). `buildForm2()` throw로 Phase 2 안내
- **§13 Acceptance Criteria**: 7개 중 6개 자동 검증 완료, 1개(p.144 비교)는 수동 QA
- **추가청구 모드 (FR-08, Phase 3 → Phase 1)**: 조기 구현으로 사용자 가치 제공
- **`uncheckedCount`/`nonElectionCount` 분리**: Design의 `rejectedCount` 단일값보다 진단성 향상

## 권장 다음 단계

### 즉시 (24시간 이내)

- **수동 QA**: Excel 다운로드 결과를 안내서 p.144 작성예시 1과 셀 단위 비교 (AC #4)
- **테스트 재실행**: `cd app && npx vitest run` — 210건 모두 green 확인

### 단기 (1주일 이내)

| 우선순위 | 항목 | 위치 | 영향 | 상태 |
|:--------:|------|------|------|:----:|
| 🟡 1 | Design 문서 갱신 (m-1, m-2, m-4) | design.md | 문서 정합성 | ⏳ |
| 🟢 2 | 컴포넌트 분리 리팩터링 (M-1) | reimbursement/ | 유지보수성 | ⏳ |
| 🟢 3 | 선거명 입력 필드 추가 (m-5) | page.tsx | 차기 선거 재사용 | ⏳ |

### Phase 2 (백로그)

- 서식 2 (비례대표) 구현
- 양식 종류 선택 UI
- API request `formType` 추가
- 선거연락소 분리 집계 (FR-03)

### Phase 3 (백로그)

- 영수증 zip 자동 묶음
- 컴포넌트 트리 정리

## PDCA 다음 액션

Match Rate 91% ≥ 90% → **Report 단계 진입 가능**

```
/pdca report reimbursement-claim-form
```

선택적으로 Major Gap (M-1) 선해결 시:

```
/pdca iterate reimbursement-claim-form
```
