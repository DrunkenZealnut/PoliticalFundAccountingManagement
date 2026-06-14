# Plan: 보전청구 금액 불일치 수정 (reimbursement-claim-mismatch)

> **버그 분류**: P1 (청구 누락 위험) · 데이터 정합성
> **버전 목표**: v0.13.1.0
> **작성일**: 2026-06-14

## Executive Summary

| 관점 | 내용 |
|------|------|
| **Problem (문제)** | "선거비용 보전" 탭에서 보전액(claim_amt)을 수정·저장한 뒤 "보전청구서(서식1)" 탭으로 오면 **저장한 보전금액과 다른 합계**가 나온다. 두 화면이 서로 다른 모집단·분류 기준으로 보전금액을 계산하기 때문이며, 일부 보전 대상이 청구서에서 **조용히 누락(silent drop)**될 수 있다. |
| **Solution (해결)** | 두 화면의 집계 기준을 통일한다. ① 보전청구서 집계(`aggregateReimbursementByFundingSource`)가 자금원 "기타" 거래를 합계에서 버리는 로직을 제거(흡수 또는 명시적 경고)해 합계를 보존하고, ② 보전 탭에 "전체 보전 대상 합계(청구서 기준)"를 함께 노출해 작업화면 부분합과 청구 기준 합계의 차이를 사용자가 인지하도록 한다. |
| **Function UX Effect (기능·UX 효과)** | 보전 탭에서 본 금액 = 보전청구서(Excel 서식1 = HWPX 서식43) 금액이 일치. 자금원이 4분류로 안 잡히는 보전 대상이 있으면 경고로 표면화되어 청구 누락 사고를 예방. |
| **Core Value (핵심 가치)** | 보전 청구액의 신뢰성 확보 — 화면마다 금액이 달라 사용자가 어느 값을 믿어야 할지 혼란스럽고, 실제 보전금 누락(=환급 손실)으로 이어질 수 있는 위험을 제거. |

---

## 1. 문제 상세

### 1.1 재현 경로
1. 보전비용 관리 메뉴 → **선거비용 보전** 탭
2. 기간 조회 → 보전 대상 체크 + 청구액(claim_amt) 수정 → **보전 대상 저장**
3. 화면 상단/푸터의 **보전 금액 합계** 확인 (예: X원)
4. **보전청구서(서식1)** 탭으로 이동 → **보전 대상 집계** 클릭
5. **합계(보전청구 총액)**가 3단계의 X원과 **다르게** 표시됨

### 1.2 영향
- 사용자 혼란: 어느 금액이 진짜 청구액인지 알 수 없음
- **청구 누락 위험**: 보전 체크(`acc_print_ok='Y'`)해서 저장했는데도 청구서 집계에서 빠지는 거래가 존재할 수 있음 → 실제 보전 환급액 손실

---

## 2. 근본 원인 (코드 확정)

두 화면이 **완전히 다른 모집단·분류 기준**으로 보전금액을 계산한다.

### 2.1 선거비용 보전 탭 — 작업 화면 합계
`app/src/app/dashboard/reimbursement/page.tsx:190`
```ts
const checkedTotal = records
  .filter((r) => checkedIds.has(r.acc_book_id))
  .reduce((s, r) => s + effClaim(r), 0);
```
- **모집단**: `org_id` + `incm_sec_cd=2` + **`acc_date` 조회 기간(dateFrom~dateTo)** + (선택)`acc_sec_cd` + (선택)`item_sec_cd`(선거비용 단일) — `page.tsx:143-149`
- 체크된 행만, 분류 무관 **전부** 합산
- 금액: `effClaim` = `claimEdits ?? claim_amt ?? acc_amt`

### 2.2 보전청구서 탭 — 집계 API (Excel 서식1 · HWPX 서식43 공통 SSOT)
`app/src/app/api/reimbursement/claim-form/aggregate/route.ts` → `app/src/lib/accounting/reimbursement-aggregator.ts:64`
- **모집단**: `org_id` + `incm_sec_cd=2` — **기간/계정 필터 전혀 없음(전체)** — `route.ts:49-53`
- 필터: `acc_amt > 0` + `item_sec_cd ∈ (cv_name==="선거비용" 전체)` + `acc_print_ok='Y'` + **`classifyFundingSource ≠ "기타"`**
- 금액: `claimAmount` = `claim_amt ?? acc_amt`

### 2.3 불일치를 만드는 4개 요인

| # | 요인 | 보전 탭 | 보전청구서 | 결과 |
|---|------|---------|-----------|------|
| ① | **기간 범위** | 조회 기간 한정 | 전체 기간 | 다른 기간의 체크 거래가 청구서에만 더해짐 |
| ② | **계정 범위** | 선택 계정 한정 가능 | 전체 계정 | 선택 계정만 본 합계 ≠ 전체 합계 |
| ③ | **자금원 "기타" 제외** | 제외 안 함(전부) | **drop** (`aggregator.ts:88`) | 자금원 미분류 보전 대상이 청구서에서 **silent drop** |
| ④ | **acc_amt>0 게이트** | 없음 | 있음 | 0/음수 보전 대상 처리 차이(영향 적음) |

> ⚠️ **claim_amt 처리 자체는 양쪽 동일**(`claimAmount` SSOT 공유). 차이는 오직 **모집단·분류**에서 발생.
> ✅ **HWPX(서식43)와 Excel(서식1) 보전청구서는 동일 aggregator를 쓰므로 서로 일치** — 불일치는 "작업 화면 ↔ 청구서" 사이에서만 발생.

### 2.4 자금원 "기타" 분류 조건
`app/src/lib/accounting/funding-source.ts` — `acc_sec_cd`가 82(보조금)/83(보조금외)/84(후보자자산)/85(후원회기부금)가 아니고, 계정명에 보조금/후원/기부/자산 키워드도 없으면 **"기타"** → 청구서 집계에서 누락.

---

## 3. 수정 방향 (확정)

> **[결정] 방안 B (집계 SSOT 완전 통일) + 기타 자금원 경고 노출** — 2026-06-14 사용자 확정

### 3.1 채택안: 집계 SSOT 통일
- 보전 탭의 "보전 금액" 합계를 청구서와 **동일한 `aggregateReimbursementByFundingSource` SSOT**로 산출 → 보전 탭에서 보는 보전금액 = 보전청구서(Excel 서식1 = HWPX 서식43) 금액 일치.
- 보전 탭의 "전체 보전 대상 합계(청구 기준)"를 주 지표로 노출. 기간별 조회 테이블의 행 체크 합계(작업 확인용)는 보조 지표로 구분 표기(설계에서 UX 확정).
- 모집단·분류·게이트(전체 기간/계정, `acc_amt>0`, 선거비용 과목, `acc_print_ok='Y'`)를 단일 기준으로 통일.

### 3.2 "기타" 자금원 처리: 경고 노출 + 계정 교정 유도
- aggregator가 "기타"로 분류한 보전 체크 거래를 **합계에서 흡수하지 않고**, `otherFundingCount`/`otherFundingAmt`(또는 동등 필드)로 반환.
- 보전 탭·보전청구서 탭 양쪽에 **"자금원 미분류(기타) N건 / 합계 ⊕원 — 계정(자금원)을 교정하세요"** 경고 표시.
- 사용자가 계정(`acc_sec_cd`)을 4분류 중 하나로 교정하면 자동으로 합계에 포함 → 데이터 차원에서 정정되므로 청구서·회계보고서 전반이 정확해짐.
- ⚠️ silent drop(조용한 누락)은 제거 — 누락분이 항상 화면에 표면화됨.

---

## 4. 결정 사항 (확정 완료)
1. **정합 방식**: ✅ 방안 B — 집계 SSOT 완전 통일
2. **"기타" 자금원 보전 대상 처리**: ✅ 경고 노출 + 계정 교정 유도 (흡수·조용한 제외 모두 배제)

---

## 5. 영향 범위 (예상 변경 파일)
- `app/src/lib/accounting/reimbursement-aggregator.ts` — 기타 처리(drop→흡수/카운트)
- `app/src/app/api/reimbursement/claim-form/aggregate/route.ts` — 반환 필드(otherFundingCount 등)
- `app/src/app/api/hwpx/reimbursement-claim/route.ts` — 동일 SSOT 정합 확인
- `app/src/app/dashboard/reimbursement/page.tsx` — 보전 탭 합계 병기/안내, 청구서 탭 경고 표시
- 테스트: `reimbursement-aggregator.test.ts` 등 회귀 + 신규 케이스

## 6. 검증 기준
- 동일 데이터에서 **보전 탭(전체 기간 조회) 합계 == 보전청구서 합계** 일치
- 자금원 "기타" 보전 대상이 있을 때 합계 보존(또는 명시적 경고로 노출)
- Excel 서식1 합계 == HWPX 서식43 합계 (회귀 없음)
- 단위 테스트 통과 · lint 0 · build 성공
