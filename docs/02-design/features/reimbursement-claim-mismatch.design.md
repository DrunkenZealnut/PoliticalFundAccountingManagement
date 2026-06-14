# Design: 보전청구 금액 불일치 수정 (reimbursement-claim-mismatch)

> Plan: `docs/01-plan/features/reimbursement-claim-mismatch.plan.md`
> 확정안: **방안 B (집계 SSOT 완전 통일) + 기타 자금원 경고 노출**
> 버전 목표: v0.13.1.0

## 1. 설계 개요

보전금액을 산출하는 **단일 진실원천(SSOT)을 `aggregateReimbursementByFundingSource`로 고정**한다. 보전 탭의 "보전 금액"과 보전청구서 탭의 "합계"가 모두 이 함수를 통해 산출되어 항상 일치한다. 자금원 "기타"로 분류되어 4분류 합계에 들어가지 못하는 보전 체크 거래는 **버리지 않고 카운트·금액을 반환**해 양쪽 화면에서 경고로 노출한다.

### 1.1 핵심 원칙
- **모집단 단일화**: 전체 기간 + 전체 계정 + `incm_sec_cd=2` + `acc_print_ok='Y'` + 선거비용 과목 + `acc_amt>0`
- **금액 SSOT**: `claimAmount(r) = claim_amt ?? acc_amt`
- **silent drop 제거**: "기타" 분류분을 `otherFundingCount`/`otherFundingAmt`로 표면화
- **보전 탭 합계 = 청구서 합계**: 두 화면이 동일 aggregate API 결과를 표시

---

## 2. 상세 설계

### 2.1 `lib/accounting/reimbursement-aggregator.ts`

**(a) `AggregateOutput`에 기타 필드 추가**
```ts
export interface AggregateOutput {
  byFundingSource: ClaimAmounts;
  rowCount: number;
  uncheckedCount: number;
  nonElectionCount: number;
  otherFundingCount: number;   // [신규] 자금원 "기타"로 합계 제외된 보전 체크 거래 수
  otherFundingAmt: number;     // [신규] 그 합계(claimAmount 기준)
}
```

**(b) "기타" drop 로직 교체** (`:88` 부근)
```ts
const source = classifyFundingSource(r.acc_sec_cd, input.accSecCdNames?.[r.acc_sec_cd]);
if (source === "기타") {
  otherFundingCount++;
  otherFundingAmt += claimAmount(r);   // 누락분 금액 보존(경고 표시용)
  continue;                            // 4분류 합계에는 미포함(사용자 결정: 흡수 X)
}
```
> 합계(`byFundingSource.합계`)는 4분류 합으로 유지. 기타는 별도 필드로만 노출 → 사용자가 계정 교정 시 자동으로 4분류에 흡수됨.

**(c) 반환 객체에 두 필드 포함.** `EMPTY` 경로/0건 경로에서도 0으로 초기화.

### 2.2 `app/api/reimbursement/claim-form/aggregate/route.ts`
- `aggregateReimbursementByFundingSource` 결과를 그대로 반환하므로 **자동으로 새 필드 포함** — 코드 변경 없음(또는 타입만 동기화).
- 모집단(전체 기간/계정) 유지 — 변경 없음.

### 2.3 `app/api/hwpx/reimbursement-claim/route.ts`
- 동일 aggregator 사용 → `byFundingSource`는 불변(회귀 없음).
- 신규 필드는 무시되어도 무방. (선택) HWPX 응답에 경고 메타를 실어 보낼 수 있으나 **본 수정 범위에서는 byFundingSource 정합만 보장**, 추가 노출은 생략.

### 2.4 `app/dashboard/reimbursement/page.tsx` — 보전 탭(`ReimbursementTab`) 통일

**현재**: 보전 탭은 조회된 `records`의 체크 합(`checkedTotal`)만 표시. aggregate API 미사용.

**변경**: 보전 탭이 aggregate API를 호출해 **전체 보전 대상 합계(청구 기준)**를 주 지표로 표시.

| 지표 | 출처 | 의미 | 표기 |
|------|------|------|------|
| **보전 금액(청구 기준)** | aggregate API `byFundingSource.합계` | 전체 보전 대상 = 청구서와 동일 | 주 지표(강조) |
| 현재 조회분 체크 합계 | `checkedTotal` (기존) | 이번 조회 화면에서 체크한 행 합(작업 확인용) | 보조 지표 |
| 자금원 미분류(기타) | aggregate API `otherFundingCount`/`otherFundingAmt` | 합계서 빠진 보전 대상 — 계정 교정 필요 | 경고(amber) |

**호출 타이밍**:
- `orgId` 준비 시 1회 (`useEffect`)
- `handleQuery` 완료 후
- `handleSave` 완료 후 (DB 반영분 재집계) — 저장 직후에도 두 화면 일치 보장

**상태 추가**: `const [claimAgg, setClaimAgg] = useState<AggregateResult | null>(null)` + `fetchClaimAgg()` (claim-form 탭의 `fetchAggregate`와 동형, 공용 헬퍼로 추출 가능).

**UI**: 요약 바(`page.tsx:210-218`)에 "보전 금액(청구 기준)" 카드 + 미분류 경고 라인 추가. 기존 "보전 금액" 라벨은 "현재 조회분 체크"로 명확화.

### 2.5 `app/dashboard/reimbursement/page.tsx` — 청구서 탭(`ClaimFormTab`) 경고 추가
- 집계 결과 영역(`:538-545`)에 기존 `uncheckedCount` 경고와 동일 패턴으로 **`otherFundingCount` 경고** 추가:
  > ⚠️ 자금원 미분류(기타) N건 / ⊕원 — 보전 탭에서 해당 거래의 계정(자금원)을 교정하세요.

---

## 3. 데이터 흐름 (수정 후)

```
[acc_book] (org 전체)
   │  org_id + incm_sec_cd=2 + acc_print_ok='Y' + 선거비용과목 + acc_amt>0
   ▼
aggregateReimbursementByFundingSource()  ◄── 단일 SSOT
   │  classifyFundingSource → 4분류 합산 / "기타"는 otherFunding*로 분리
   ▼
{ byFundingSource.합계, otherFundingCount, otherFundingAmt, ... }
   ├──────────────► 보전 탭: "보전 금액(청구 기준)" + 기타 경고
   ├──────────────► 보전청구서 탭(Excel 서식1): 합계 + 기타 경고
   └──────────────► HWPX 서식43: byFundingSource (불변)
```
→ 세 출력이 동일 `byFundingSource.합계`를 공유하므로 항상 일치.

---

## 4. 테스트 설계 (`reimbursement-aggregator.test.ts` 확장)

| ID | 케이스 | 기대 |
|----|--------|------|
| T-1 | 기타 자금원(acc_sec_cd 미지정 코드) 보전 체크 1건 | `otherFundingCount=1`, `otherFundingAmt=claimAmount`, `합계`엔 미포함 |
| T-2 | 4분류 + 기타 혼재 | 4분류 합계 정확, 기타는 별도 필드 |
| T-3 | 기타 0건 | `otherFundingCount=0`, `otherFundingAmt=0` (기존 합계 회귀 없음) |
| T-4 | 기존 전체 케이스 회귀 | `byFundingSource` 값 불변 |
| T-5 | claim_amt 일할계산 + 기타 혼재 | 금액 SSOT(`claimAmount`) 일관 |

> 기존 통과 테스트(606+)의 `byFundingSource` 단언 회귀 없음 확인.

---

## 5. 영향·회귀 범위
- **변경**: `reimbursement-aggregator.ts`(필드 2개+분기), `page.tsx`(보전 탭 집계 호출·UI, 청구서 탭 경고)
- **타입 동기화**: `AggregateResult`(page.tsx) ↔ `AggregateOutput`
- **회귀 주의**: HWPX 서식43·Excel 서식1 `byFundingSource.합계` 불변, `org-metrics.ts`의 aggregator 소비부 확인
- **DB/마이그레이션**: 없음(스키마 무변경)

## 6. 구현 순서
1. aggregator 필드·분기 추가 + 단위 테스트(T-1~T-5)
2. aggregate route 타입 동기화 (반환 자동)
3. page.tsx 청구서 탭 경고 추가(저위험)
4. page.tsx 보전 탭 aggregate 호출·UI 통일 + 저장 후 재집계
5. 전체 테스트·lint·build
6. (수동) 실데이터로 보전 탭 합계 == 청구서 합계 == HWPX 합계 확인

## 7. 검증 기준 (Plan §6 계승)
- 보전 탭(전체 조회) 합계 == 보전청구서 합계 == HWPX 서식43 합계
- 기타 보전 대상 존재 시 양쪽 경고 노출, 계정 교정 후 합계 자동 포함
- 단위 테스트 통과 · lint 0 · build 성공
