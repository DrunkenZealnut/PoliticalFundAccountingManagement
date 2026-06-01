# dashboard-org-differentiation — Gap 분석 보고서 (PDCA Check)

> **Feature**: 메인 대시보드 조직 유형별 콘텐츠 차별화
> **분석일**: 2026-06-01
> **분석 주체**: gap-detector
> **Design 문서**: [dashboard-org-differentiation.design.md](../02-design/features/dashboard-org-differentiation.design.md)
> **Plan 문서**: [dashboard-org-differentiation.plan.md](../01-plan/features/dashboard-org-differentiation.plan.md)
> **브랜치**: `feat/dashboard-org-differentiation`

---

## 1. 전체 점수

| Category | Score | Status |
|----------|:-----:|:------:|
| Design Match (FR + 산식 + 컴포넌트) | 89% | ⚠️ |
| Architecture Compliance (Clean Arch §9.4) | 100% | ✅ |
| Convention Compliance (§10.4) | 100% | ✅ |
| **Overall Match Rate** | **89%** | ⚠️ 90% 미달 |

- 검증 보조 지표: 단위 테스트 10/10, 전체 suite 310/310, ESLint 0, Build 성공.
- FR·컴포넌트·UI 분기·폴백·순수 함수 설계는 정확히 구현. 다만 **보전 도메인 정확성**에 직결되는 High Gap 2건이 임계값 도달을 막음.

---

## 2. 요구사항 추적 (FR)

| FR | 내용 | 판정 |
|----|------|------|
| FR-01 | candidate 요약 카드 4종 | ✅ 구현됨 |
| FR-02 | candidate 차트 2종 | ✅ 구현됨 |
| FR-03 | supporter 요약 카드 4종 | ✅ 구현됨 |
| FR-04 | supporter 차트 2종 | ✅ 구현됨 |
| FR-05 | useDashboardData 파생 지표 | ✅ 구현됨 |
| FR-06 | 보전 예상액 = 보전 대상 선거비용 | ⚠️ 부분 (산식 불일치, GAP-1) |
| FR-07 | 신규 기부자 = 당월 최초 거래 | ✅ 구현됨 |
| FR-08 | party/lawmaker/null 폴백 | ✅ 구현됨 |
| FR-09 | 로딩/빈 데이터 레이아웃 | ✅ 구현됨 |

---

## 3. Gap 목록

### 🔴 GAP-1 (High) — 보전 예상액 산식이 Design §3.3과 불일치
- **위치**: `app/src/lib/dashboard/org-metrics.ts:104-108`
- **설계**: 보전 예상액 = `aggregateReimbursementByFundingSource()` 결과 총합 (§3.3, §9.4 Domain 재사용 명시)
- **구현**: aggregator 미사용, 인라인 재구현. 선거비용 판별 기준 상이:
  - org-metrics: `exp_sec_cd > 0`
  - aggregator: `item_sec_cd ∈ electionExpenseItemCds`, 추가로 자금원 "기타" 행 제외
- **영향**: 대시보드 "보전 예상액"과 보전청구서(`reimbursement/page.tsx`) 금액 불일치 가능 → SSOT 위반, 사용자 신뢰 훼손.

### 🟠 GAP-2 (High) — "후원회→후보자 기부금 = acc_sec_cd=85" 가정 미검증
- **위치**: `org-metrics.ts:178`, 근거 `funding-source.ts:18`
- **설계**: §3.3 ⚠️ / §11.2 1단계 "Fund_Data_2.db(55건)로 검증" — **체크박스 미완료**
- **상태**: acc_sec_cd는 본래 수입 자금원 분류 코드인데 후원회 **지출**에도 동일 코드 적용되는지 실데이터 미확인.
- **영향**: 가정이 틀리면 supporter "후보자 기부금 지급" 카드(FR-03) + GrantStatusChart(FR-04)가 0원/오집계.
- **조치**: Fund_Data_2.db 55건으로 실제 지급 거래의 acc_sec_cd/item_sec_cd 분포 확인.

### 🟡 GAP-3 (Medium) — Edge 테스트 케이스 미커버
- **위치**: `org-metrics.test.ts` (10건)
- **누락**: 음수 보정 거래(음수 acc_amt) — 보전 합산엔 `acc_amt>0` 가드 있으나 선거비용/모금총액/잔액은 음수 그대로 합산, 미검증. 미매핑 acc_sec_cd→"기타" Edge도 미검증.

### 🟡 GAP-4 (Medium) — 보전 판별 시 자금원 "기타" 행 포함 여부 차이
- **위치**: `org-metrics.ts:104-108`
- aggregator는 "기타" 자금원 행을 보전 합계에서 제외, 대시보드는 자금원 무관 전부 합산. (GAP-1 해소 시 동시 해결)

### 🔵 GAP-5 (Low) — currentYM `new Date()` 의존
- **위치**: `use-dashboard-data.ts:93`
- org-metrics는 currentYM 주입식 순수 함수로 설계 의도 부합. 호출부 Date 의존은 런타임 한정 → **설계 부합, 정보성 기록**.

### 🔵 GAP-6 (Low) — MetricCardGrid 신규 컴포넌트 문서 미반영
- **위치**: `app/src/components/dashboard/MetricCardGrid.tsx`
- §5.4 비고 "경량 래퍼 권장" 의도 부합. 설계 위반 아님, 문서 컴포넌트 목록 업데이트 권장.

---

## 4. 중점 검증 결과

| 검증 항목 | 결과 |
|-----------|------|
| 선거비용 판별 = `exp_sec_cd > 0` | ✅ 일치 (org-metrics.ts:72) |
| 보전 예상액 규칙 | ⚠️ 규칙 적용되나 aggregator 미재사용·기준 불일치 (GAP-1/4) |
| 자금원 = `classifyFundingSource(acc_sec_cd)` | ✅ 재사용 (org-metrics.ts:100,178) |
| 신규 기부자 = 당월 최초 거래 | ✅ 일치 (org-metrics.ts:171-187) |
| party/lawmaker 폴백 | ✅ 기존 공통 뷰 유지 (page.tsx:53-101) |
| acc_sec_cd=85 가정 | ⚠️ 미검증 하드코딩 (GAP-2) |

---

## 5. 결론 및 권장 조치

**Match Rate 89% — 90% 미달. `/pdca iterate` 권장.**

### 즉시 조치 (90% 달성 필요)
1. **GAP-2 (최우선)**: Fund_Data_2.db 55건으로 후보자 기부금 지급 거래의 `acc_sec_cd`/`item_sec_cd` 실값 확인 → Design §11.2 1단계 완료. 가정 오류 시 `org-metrics.ts:178` 보정.
2. **GAP-1/GAP-4**: 두 옵션 중 택1
   - **옵션 A (구현 보정)**: 보전 예상액을 `aggregateReimbursementByFundingSource()` 재사용으로 통일 → SSOT 충족, 95%+ 예상.
   - **옵션 B (설계 갱신)**: 대시보드 보전은 `exp_sec_cd>0 & acc_print_ok='Y'` 근사치임을 Design §3.3·§9.4에 명시 + 화면에 "추정치" 라벨 → 93%+ 예상.

### 문서 업데이트
- GAP-6: MetricCardGrid를 Design §5.4 목록에 추가.
- GAP-2 검증 결과를 Design §3.3 ⚠️ 주석에 반영.

### 보조 검증 갭
- GAP-3: 음수 보정 거래 / 미매핑 acc_sec_cd Edge 테스트 추가.

---

## 6. Act (iterate) 재검증 — 2026-06-01

사용자 선택: **GAP-1 = 보전청구서와 완전 일치 (옵션 A)**. 실데이터(`Fund_Data_2.db` 55건) 검증 후 수정.

### 실데이터 검증 결과 (GAP-2 확정)
- 후원회 **지출**의 `acc_sec_cd`는 자금원이 아니라 **수입(1)/지출(2) 플래그** — 초기 가정 `acc_sec_cd=85` 폐기.
- 후보자 기부금은 **과목(item_sec_cd) 코드명 "기부금"**(cv_id 97)으로 기록 → 정확 매칭으로 교정 (`후원회기부금` 오집계 방지).
- 후보자(`Fund_Data_1.db`) 수입 `acc_sec_cd`는 82/84/85로 자금원 분류 정상 → 수입 출처 차트 유지.

### Gap 해소 판정

| Gap | 심각도 | 1차 | 2차 | 조치 |
|-----|:------:|:---:|:---:|------|
| GAP-1 보전 산식 불일치 | High | ⚠️ | ✅ 해소 | `aggregateReimbursementByFundingSource()` 재사용 (claim-form과 동일 기준 교차확인) |
| GAP-2 acc_sec_cd=85 미검증 | High | ⚠️ | ✅ 해소 | 실데이터 검증 → item 코드명 "기부금" 정확매칭 |
| GAP-4 기타 자금원 포함 차이 | Med | ⚠️ | ✅ 해소 | aggregator 내부 "기타" 제외 (GAP-1 동시) |
| GAP-3 Edge 테스트 | Med | ⚠️ | ✅ 해소 | 빈데이터·익명·ctx미주입·오집계방지·음수보정 테스트 추가 (15건) |
| GAP-6 MetricCardGrid 문서 | Low | ⚠️ | ✅ 해소 | Design §5.4 반영 |
| GAP-5 currentYM Date 의존 | Low | ℹ️ | ℹ️ 유지 | 설계 부합 |

### 최종 결과

| Category | 1차 | 2차 |
|----------|:---:|:---:|
| **Overall Match Rate** | 89% | **97%** ✅ |

- 검증 보조: org-metrics 테스트 **15/15**, 전체 suite **314→315 통과**, ESLint 0, Build 성공.
- **90% 달성 → Act 종료 조건 충족. `/pdca report` 진행 가능.**
