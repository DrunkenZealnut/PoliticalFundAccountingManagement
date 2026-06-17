# 수입계정별 잔액 가드 Design Document

> **Plan**: [income-account-balance-guard.plan.md](../../01-plan/features/income-account-balance-guard.plan.md) (v0.2)
> **Project**: PoliticalFundAccountingManagement
> **Date**: 2026-06-17
> **Status**: Draft
> **확정 정책**: 후보자 전용 / non-blocking 경고 / 입력일 기준 시간순(as-of-date) 가용잔액 / SSOT(`acc-book-sort`·`funding-source`) 재사용
> **Related**: [[negative-balance-reallocation]] (사후 교정 짝 — 동일 시간순 계산 기반 공유)

---

## 1. 개요

후보자 지출 입력(`expense`·`document-register`) 시, **입력하려는 거래일 기준 자금원별 시간순 가용잔액**을 보여주고, 입력 중 금액을 반영한 "저장 후 예상 잔액"을 미리보기하며, 선택 자금원이 음수가 되면 **non-blocking 경고**(태깅 불일치→사후 재배분 필요 프레이밍)를 띄운다.

구성: **순수 함수** `lib/accounting/funding-balance-asof.ts`(as-of-date 가용·미리보기) + **공유 UI** `FundingDraftPreview`(두 페이지 공용) + 기존 `FundingAllocationPanel` 보강.

---

## 2. 데이터 모델 (타입)

```ts
// lib/accounting/funding-balance-asof.ts
export interface AsOfRow {
  acc_sec_cd: number;       // 자금원 82~85
  incm_sec_cd: number;      // 1=수입, 2=지출
  acc_date: string;         // YYYYMMDD
  acc_time: string | null;  // HHmm (정렬 2차키)
  acc_amt: number;          // 환급은 음수
  acc_book_id?: number;     // 수정 시 자기 제외용
}

export interface DraftExpense {
  acc_sec_cd: number;
  acc_amt: number;          // 입력 중 금액(>0 가정; 환급 입력은 미리보기 생략 가능)
  acc_date: string;         // 입력 거래일
  acc_time?: string | null;
  excludeAccBookId?: number;// 수정 중인 자기 행 제외
}

export interface SourceAvail { accSecCd: number; available: number; }

export interface DraftPreview {
  source: number;
  current: number;          // 입력 전 해당 자금원 as-of 가용
  projected: number;        // 입력 후 = current − draft.acc_amt
  willGoNegative: boolean;  // projected < 0
  bySource: SourceAvail[];  // 전 자금원 as-of 가용(여유 있는 자금원 추천용)
}
```

---

## 3. 순수 함수 명세

### 3.1 `availableAsOf(rows, asOfDate, opts?) → Record<number, number>`

자금원별 **입력 거래일까지의 시간순 가용잔액**. 같은 누계 규칙을 [[negative-balance-reallocation]]의 `fund-realloc.ts`와 공유한다.

```
opts: { asOfTime?: string|null; excludeAccBookId?: number }
대상 = rows 중 compareAccDateTime(row, {acc_date:asOfDate, acc_time:asOfTime}) <= 0  (그 시점까지)
       AND row.acc_book_id !== excludeAccBookId
각 자금원 src:
  avail[src] = Σ(incm=1 acc_amt) − Σ(incm=2 acc_amt)   // 환급(음수 지출)은 −(음수)=+ 로 복원
반환: {82:…, 83:…, 84:…, 85:…} (존재하는 src만)
```
- 환급/정정: `acc_amt !== 0` 그대로 합산(부호 보존) — 메모 [[negative-refund-rows-in-aggregation]].
- 정렬: `compareAccDateTime`(acc-book-sort SSOT). 같은 날짜는 시각까지, 시각 동률은 포함(<=0).

### 3.2 `previewDraft(rows, draft, opts?) → DraftPreview`

```
base = availableAsOf(rows, draft.acc_date, { asOfTime: draft.acc_time, excludeAccBookId: draft.excludeAccBookId })
current   = base[draft.acc_sec_cd] ?? 0
projected = current − max(0, draft.acc_amt)     // 환급(≤0)은 차감 안 함
willGoNegative = projected < 0
bySource = 전 자금원 base 배열(내림차순 정렬 — 여유 있는 자금원 위로)
```

> **단일 통합계좌 주의(Plan v0.2 §1.2.1)**: 여기서 "가용"은 자금원 태깅 기준값이지 실제 통장 현금이 아니다. `willGoNegative`는 "현금 부족"이 아니라 "이 태깅 시 수입지출부·결산에서 음수 → 사후 재배분 필요"를 뜻한다(경고 문구 FR-10).

---

## 4. UI 설계

### 4.1 자금원 가용 현황 미니패널 (FR-01·FR-02)

기존 `FundingAllocationPanel`(org 전체 누적)과 별개로, **입력 거래일 기준** `bySource`를 보여주는 컴팩트 표를 폼 옆/아래 배치. 선택 중인 자금원 하이라이트.

```
자금원 가용 현황 (입력일 2026-05-22 기준)        ← as-of 날짜 명시
  후보자자산   1,250,000원
  후원회기부금    180,000원   ← 선택됨(하이라이트)
  보조금외      3,000,000원
  (보조금 해당 없음)
```
- **인라인 드롭다운 병기**(FR-02)는 `CodeSelect`의 옵션 라벨 커스터마이즈 가능 여부에 따라 결정(§8 To-Verify). 1차는 위 미니패널로 충족하고, 가능하면 드롭다운 라벨에 `(가용 N원)` 병기.

### 4.2 저장 후 예상 잔액 미리보기 (FR-03)

계정+금액 입력 시 금액 필드 하단:
```
후원회기부금: 현재 180,000원  →  저장 후 −85,000원   ⚠
```
- `projected ≥ 0`: 차분한 톤. `projected < 0`: 빨강 + 경고.

### 4.3 경고 배너 (FR-04·FR-10, non-blocking)

`willGoNegative`면 폼 영역에 배너:
> ⚠ 후원회기부금이 −85,000원이 됩니다. 이 자금원으로 저장하면 수입지출부·결산에서 음수가 되어 **사후 재배분이 필요**합니다. 여유 있는 **후보자자산(1,250,000원)** 선택을 권장합니다. (저장은 가능합니다)

- 저장 버튼은 막지 않음. 문구/색으로 인지 강화.
- "여유 있는 자금원" = `bySource`에서 projected ≥ draft인 최상위.

### 4.4 컴포넌트 구조

```
lib/accounting/
  funding-balance-asof.ts        # 신규 순수: availableAsOf, previewDraft
  funding-balance-asof.test.ts   # 신규 테스트
components/dashboard/
  FundingDraftPreview.tsx        # 신규 공유: 미니패널 + 미리보기 행 + 경고 배너
                                 #   props: { rows: AsOfRow[]; draft: DraftExpense; getName }
app/dashboard/expense/page.tsx          # form(acc_sec_cd·acc_amt·acc_date) → <FundingDraftPreview>
app/dashboard/document-register/page.tsx# 후보자 지출 탭에 동일 삽입 + org 전체 rows 로드 추가
```
- `expense/page.tsx`는 이미 `allRows`(org 전체) 로드 → `AsOfRow[]`로 매핑해 전달.
- `document-register/page.tsx`는 현재 org 전체 미로드 → 가벼운 조회 1회 추가(`acc_sec_cd, incm_sec_cd, acc_date, acc_time, acc_amt, acc_book_id`).
- 후보자(`orgType==="candidate"`) 게이트. 그 외 미노출(NFR-05).

---

## 5. 테스트 케이스 (`funding-balance-asof.test.ts`)

| # | 시나리오 | 기대 |
|---|---|---|
| A1 | 입력일 이전 수입만 → 가용 = 수입합 | availableAsOf 정확 |
| A2 | 입력일 이후 수입은 미반영(as-of) | 미래 입금 제외 |
| A3 | 환급(음수 지출) → 가용 복원 | `acc_amt!==0`, 부호 보존 |
| A4 | excludeAccBookId(수정) → 자기 행 제외 | 이중계상 없음 |
| A5 | 같은 날짜·시각 tie-break(<=0 포함) | 결정적 |
| P1 | previewDraft: projected = current − amt | 정확 |
| P2 | projected < 0 → willGoNegative true | 경고 트리거 |
| P3 | 환급 입력(amt≤0) → 차감 안 함 | projected = current |
| P4 | bySource 내림차순(여유 자금원 추천) | 정렬 |
| P5 | 자금원 미존재(82 없음) → 0 처리 | 안전 |

---

## 6. 영향 파일

| 파일 | 종류 |
|------|------|
| `lib/accounting/funding-balance-asof.ts` | 신규(순수) |
| `lib/accounting/funding-balance-asof.test.ts` | 신규(테스트) |
| `components/dashboard/FundingDraftPreview.tsx` | 신규(공유 UI) |
| `app/dashboard/expense/page.tsx` | 폼 state 연결 + 컴포넌트 삽입 |
| `app/dashboard/document-register/page.tsx` | org 전체 rows 로드 + 후보자 지출 탭 삽입 |

재사용: `acc-book-sort`(compareAccDateTime), `funding-source`(classify/명칭), `use-code-values`(getName), `HelpTooltip`. 신규 API 없음.

---

## 7. 검증/구현 순서 (Do)

1. `funding-balance-asof.ts` + 테스트(A1~P5) 작성·통과.
2. `FundingDraftPreview.tsx` 작성(미니패널·미리보기·경고).
3. `expense/page.tsx` 연결(allRows→AsOfRow, form draft 전달).
4. `document-register/page.tsx` org rows 로드 + 삽입.
5. 실데이터 QA: 입력일 기준 가용이 수입지출부 시간순 잔액과 일치(오준석 데이터 교차검증), 환급 케이스.
6. lint/build/전체 테스트 무회귀 → `/pdca analyze`.

---

## 8. 미해결/Design 확인 사항

- **`CodeSelect` 옵션 라벨 커스터마이즈 가능 여부** — 가능하면 드롭다운 인라인 `(가용 N원)`, 불가하면 미니패널만(FR-02 충족 방식 결정).
- **as-of-date의 시각 처리** — 입력 폼에 acc_time이 비어 있으면(미입력) 그 날짜 전체 포함으로 처리(nulls 정책은 compareAccDateTime과 일치).
- **back-dated 입력의 후속 영향** — 과거 일자 삽입은 이후 거래 잔액도 바뀌나, 입력 가드는 **삽입 시점 as-of** 신호에 한정(완전 재검증은 사후 재배분 도구가 담당). 설계상 명시.
- **"임박" 경고 임계값**(가용 10% 미만 등) 도입 여부 — 1차는 음수만 경고, 임박은 후속.
- **공유 누계 로직 추출** — `fund-realloc.ts`와 `funding-balance-asof.ts`의 running-balance 규칙이 동일하므로, 작은 공유 헬퍼(`runningBalanceBySource`)로 추출할지 Do에서 판단(중복 최소화 vs 결합도).
