# Design: 선거비용 보전청구서 제작 페이지

> **Feature**: reimbursement-claim-form
> **Created**: 2026-05-05
> **Status**: Design
> **Plan**: `docs/01-plan/features/reimbursement-claim-form.plan.md`
> **참고**: `app/src/lib/excel-template/burden-cost-form.ts` (서식 7 패턴), `app/src/app/dashboard/income-expense-report/page.tsx` (자금원 분류 로직)

---

## 0. 핵심 결정 사항

| 결정 | 내용 | 근거 |
|---|---|---|
| **자금원 분류 방식** | `acc_sec_cd` 코드값 매핑 (이미 존재) | 코드 82=보조금, 83=보조금외, 84=후보자자산, 85=후원회기부금 — `income-expense-report/page.tsx`에 동일 로직 존재 |
| **양식 자동 판별** | `org.org_sec_cd` 비례대표면 서식 2, 그 외 서식 1 | `organ.org_sec_cd`가 정당 비례대표 식별자 보유 |
| **Phase 1 범위** | 서식 1 (지역구), 단일 청구 단위(선거사무소), 자금원 4개 모두 | 청구기한 6/15 임박 |
| **Excel 라이브러리** | ExcelJS (기존) | `burden-cost-form.ts`와 동일 패턴 유지 |
| **신규 모듈 이름** | `lib/excel-template/reimbursement-claim-form.ts` | 기존 `burden-cost-form.ts`와 자매 모듈 |
| **선거연락소 데이터** | Phase 2로 분리 | 현 schema에 연락소 분리 컬럼 없음, Phase 1은 단일 단위로 출시 |

---

## 1. 데이터 모델

### 1.1 자금원 분류 (acc_sec_cd 매핑)

```typescript
// lib/accounting/funding-source.ts
export type FundingSource = "후보자자산" | "후원회기부금" | "보조금" | "보조금외" | "기타";

export const FUNDING_SOURCE_BY_ACC_SEC_CD: Record<number, FundingSource> = {
  82: "보조금",
  83: "보조금외",
  84: "후보자자산",
  85: "후원회기부금",
};

export function classifyFundingSource(accSecCd: number, accSecName?: string): FundingSource {
  // 1차: 코드값 직접 매핑
  if (FUNDING_SOURCE_BY_ACC_SEC_CD[accSecCd]) {
    return FUNDING_SOURCE_BY_ACC_SEC_CD[accSecCd];
  }
  // 2차: 이름 기반 폴백 (income-expense-report와 동일 로직)
  if (!accSecName) return "기타";
  if (accSecName.includes("보조금외")) return "보조금외";
  if (accSecName.includes("보조금")) return "보조금";
  if (accSecName.includes("후원") || accSecName.includes("기부")) return "후원회기부금";
  return "후보자자산";
}
```

### 1.2 보전청구 데이터 구조

```typescript
// lib/excel-template/reimbursement-claim-form.ts
export interface ClaimAmounts {
  후보자자산: number;
  후원회기부금: number;
  보조금: number;
  보조금외: number;
  합계: number; // = 4개 합산
}

export interface ClaimRowGroup {
  label: string;       // "선거사무소" | "○○선거연락소"
  amounts: ClaimAmounts;
  remark?: string;     // "비고" 컬럼
}

export interface ReimbursementClaimFormData {
  // 양식 종류
  formType: "form1" | "form2";  // 지역구 | 비례대표

  // 1~4번 항목
  electionName: string;          // "제9회 전국동시지방선거"
  partyName: string;             // 소속정당명 (form1) / 정당명 (form2)
  electionDistrictName?: string; // 선거구명 (form1만)
  candidateName?: string;        // 후보자명 (form1만)

  // 5번 청구내역 (form1: 선거사무소+연락소별 행, form2: 보조금 종류별 1행)
  rows: ClaimRowGroup[];
  totalAmount: number;            // 보전청구 총액 (모든 행 합계)

  // 7번 수령계좌
  account: {
    holder: string;       // 예금주
    bankName: string;     // 금융기관명
    accountNumber: string;// 계좌번호
    note?: string;        // 비고
  };

  // 청구인 정보 (기명·날인)
  claimants: {
    candidate?: string;       // 후보자 (form1)
    partyRepresentative?: string;  // 정당 대표자 (form2)
    campaignManager: string;  // 선거사무장
    accountant: string;       // 회계책임자
  };

  // 양식 옵션
  isAdditional?: boolean;  // 추가청구 여부 (FR-08, Phase 3)
  submissionDate: string;  // "2026년 6월 _일"
  receivingCommittee: string; // "○○선거관리위원회"
}
```

### 1.3 acc_book → 자금원별 집계 알고리즘

```typescript
// lib/accounting/reimbursement-aggregator.ts
export interface ReimbAggregateInput {
  orgId: number;
  // 보전 대상 행만 (acc_print_ok = 'Y')
  // 선거비용과목만 (item_sec_cd → "선거비용")
}

export interface ReimbAggregateOutput {
  byFundingSource: ClaimAmounts;
  rowCount: number;       // 집계된 거래 건수
  rejectedCount: number;  // 보전 미체크 거래 건수
}

export async function aggregateReimbursementByFundingSource(
  supabase: SupabaseClient,
  input: ReimbAggregateInput,
): Promise<ReimbAggregateOutput> {
  // 1. acc_book에서 해당 org의 보전 대상 + 선거비용 지출 조회
  const { data: rows, error } = await supabase
    .schema("pfam")
    .from("acc_book")
    .select("acc_book_id, acc_sec_cd, item_sec_cd, acc_amt, acc_print_ok, incm_sec_cd")
    .eq("org_id", input.orgId)
    .eq("incm_sec_cd", /* 지출 = 1 또는 명시적 코드 */)
    .eq("acc_print_ok", "Y");

  if (error) throw error;

  // 2. 선거비용 과목 필터링 (item_sec_cd → 코드명 lookup)
  // 코드명에 "선거비용"이 포함되고 "선거비용외"가 아닌 행만
  const electionRows = rows.filter((r) => isElectionExpenseItem(r.item_sec_cd));

  // 3. 자금원별 합산
  const sums: ClaimAmounts = {
    후보자자산: 0, 후원회기부금: 0, 보조금: 0, 보조금외: 0, 합계: 0,
  };
  for (const r of electionRows) {
    const src = classifyFundingSource(r.acc_sec_cd, getCodeName(r.acc_sec_cd));
    if (src === "기타") continue;
    sums[src] += r.acc_amt;
    sums.합계 += r.acc_amt;
  }

  return {
    byFundingSource: sums,
    rowCount: electionRows.length,
    rejectedCount: rows.length - electionRows.length,
  };
}
```

---

## 2. 서식 1 Excel 셀 좌표 (지역구)

선관위 안내서 p.133-134 양식 기준. 8열 구조 (A~H).

### 2.1 컬럼 너비

| 열 | 너비 | 용도 |
|---|---|---|
| A | 14 | 구분 |
| B | 12 | 청구액(후보자자산) |
| C | 12 | 후원회 기부금 |
| D | 12 | 보조금 |
| E | 12 | 보조금외 |
| F | 14 | 합계 |
| G | 10 | 비고 |
| H | 10 | (여백/날인) |

### 2.2 행별 구성

| 행 | 내용 | 비고 |
|---|---|---|
| 1 | "서식 1" 라벨 (A1, font 9, left) | merge A1:B1 |
| 2 | 제목 "선거비용 보전청구서" (font 16, bold, center) | merge A2:H2 |
| 3 | 부제 "(지역구지방의원 및 지방자치단체의 장 선거용)" (font 11, center) | merge A3:H3 |
| 4 | (공백) |  |
| 5 | "1. 선 거 명 : {electionName}" (left) | merge A5:H5 |
| 6 | "2. 소속정당명 : {partyName}" |  |
| 7 | "3. 선거구명 : {electionDistrictName}" |  |
| 8 | "4. 후보자명 : {candidateName}" |  |
| 9 | "5. 청구내역" (bold) | (단위: 원) right-aligned |
| 10 | 헤더 1행: "구분" (A) / "청구액" (B-E merge) / "합계" (F) / "비고" (G) | bg `#E8E8E8` |
| 11 | 헤더 2행: 후보자자산 / 후원회기부금 / 보조금 / 보조금외 (B,C,D,E) | bg `#E8E8E8` |
| 12+N | 행그룹: "선거사무소" 또는 "○○선거연락소" + 자금원 4개 + 합계 + 비고 | rows[].length 만큼 |
| 12+N+1 | "합 계" 행 (모든 행그룹 합산, font bold) | bg `#F5F5F5` |
| +2 | "6. 보전청구 총액 : 금 {한글} 원(₩ {숫자})" (left) | merge A:H |
| +2 | "7. 수령계좌" (bold) |  |
| +1 | 헤더: 예금주 / 금융기관명 / 계좌번호 / 비고 | bg `#E8E8E8` |
| +1 | 데이터 |  |
| +2 | "{년} {월} {일} 실시한 제9회 전국동시지방선거에서…" 본문 |  |
| +2 | "붙임 1. 정치자금 수입·지출부 사본 1부…" (4개) | left-aligned 들여쓰기 |
| +2 | "{2026년} {월} {일}" right-align |  |
| +1 | 청구인 헤더 |  |
| +1 | 후보자 / 선거사무장 / 회계책임자 (3행, 우측 "(인)" 날인란) |  |
| +2 | "○○선거관리위원회 귀중" (right, bold) | merge A:H |
| +2 | 주석 "주 1. ..." (font 9) |  |

### 2.3 서식 1 레이아웃 다이어그램

```
┌──────────────────────────────────────────────────┐
│ 서식 1                                            │  Row 1
├──────────────────────────────────────────────────┤
│         선거비용 보전청구서                          │  Row 2 (bold 16)
│       (지역구지방의원 및 지방자치단체의 장 선거용)      │  Row 3
├──────────────────────────────────────────────────┤
│ 1. 선 거 명 : 제9회 전국동시지방선거                 │  Row 5
│ 2. 소속정당명 : ○○당                              │
│ 3. 선거구명 : ○○선거구                            │
│ 4. 후보자명 : 홍길동                                │
├──────────────────────────────────────────────────┤
│ 5. 청구내역                          (단위: 원)      │  Row 9
│ ┌──────┬──────────────────────────┬──────┬────┐  │
│ │ 구분  │       청 구 액              │ 합계  │비고 │  │
│ │      ├──────┬──────┬──────┬──────┤      │    │  │  Row 10-11 (header 2행)
│ │      │후보자 │후원회 │보조금  │보조금 │      │    │  │
│ │      │자산   │기부금 │      │  외   │      │    │  │
│ ├──────┼──────┼──────┼──────┼──────┼──────┼────┤  │
│ │선거  │      │      │      │      │      │    │  │
│ │사무소 │      │      │      │      │      │    │  │
│ │○○연락소│   │      │      │      │      │    │  │
│ │ 합계 │      │      │      │      │      │    │  │
│ └──────┴──────┴──────┴──────┴──────┴──────┴────┘  │
│ 6. 보전청구 총액 : 금 일십이백삼십만 원(₩ 12,300,000) │
│ 7. 수령계좌                                         │
│ ┌────┬────────┬────────┬────┐                     │
│ │예금주│금융기관명│계좌번호  │비고 │                    │
│ ├────┼────────┼────────┼────┤                     │
│ │홍길동│ ○○은행 │ 123-... │    │                    │
│ └────┴────────┴────────┴────┘                     │
│ 2026년 6월 3일 실시한 제9회…보전을 위와 같이 청구합니다 │
│ 붙임  1. 정치자금 수입·지출부(선거비용과목) 사본 1부.  │
│       2. 영수증 등 증빙서류 사본 1부.                 │
│       3. 선거연락소별 보전청구서 사본 1부.             │
│       4. 정치자금 수입·지출 통장 사본 1부.             │
│                                  2026년  월  일      │
│                  ┌─────────┬─────────┬────┐          │
│ 청구인           │ 후보자   │ 홍길동   │(인) │          │
│                  │ 선거사무장│ 김선거   │(인) │          │
│                  │ 회계책임자│ 이회계   │(인) │          │
│                  └─────────┴─────────┴────┘          │
│                          ○○선거관리위원회 귀중          │
│ 주 1. 청구인란에는 …                                  │
└──────────────────────────────────────────────────┘
```

---

## 3. 서식 2 Excel 셀 좌표 (비례대표)

서식 1과 차이점:

| 항목 | 서식 1 | 서식 2 |
|---|---|---|
| 부제 | (지역구...장 선거용) | (비례대표지방의원선거용) |
| 식별 항목 | 선거구명, 후보자명 | 정당명만 |
| 청구내역 컬럼 | 후보자자산/기부금/보조금/보조금외 | **계 / 보조금외 / 경상보조금 / 선거보조금 / 여청추천 / 장애인추천 / 청년추천** |
| 청구내역 행 | 선거사무소 + 연락소별 (다행) | "총계" 1행만 |
| 청구금액 표기 | "6. 보전청구 총액 : 금 ___원" | "4. 청구금액 : 금 ___원" |
| 청구인 | 후보자/선거사무장/회계책임자 | 정당대표자/선거사무장/회계책임자 |
| 첨부서류 | 4개 (수입·지출부 + 증빙 + 연락소별 + 통장) | 3개 (정당 지출부 + 증빙 + 통장) |

서식 2의 보조금 분류는 별도 매핑 필요:
```typescript
// Phase 2 — 비례대표 보조금 세분화
const SUBSIDY_TYPE_BY_INCM_DETAIL: Record<string, string> = {
  // 미정 — codeset/codevalue에서 보조금 종류 파악 필요
  // 경상보조금 / 선거보조금 / 여청추천보조금 / 장애인추천보조금 / 청년추천보조금
};
```

→ Phase 1에서는 서식 1만 구현, 서식 2는 Phase 2로 분리

---

## 4. UI 설계

### 4.1 페이지 통합 — 보전 페이지 탭 구조

```
┌─────────────────────────────────────────────────────────┐
│ /dashboard/reimbursement                                  │
│                                                            │
│ [선거비용 보전 (체크)]  [부담비용 청구 (서식7)]  [보전청구서 ★]│  ← 신규 탭
│                                                            │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ 보전청구서 생성                                          │ │
│ │                                                          │ │
│ │ 양식 종류: ●서식1 (지역구) ○서식2 (비례대표) [자동판별]  │ │
│ │                                                          │ │
│ │ ── 1. 기본 정보 ────────────────────────────────────── │ │
│ │   선거명:      [제9회 전국동시지방선거          ] (자동) │ │
│ │   소속정당명: [○○당                           ] (수정) │ │
│ │   선거구명:   [○○선거구                       ] (수정) │ │
│ │   후보자명:   [홍길동                          ] (자동) │ │
│ │                                                          │ │
│ │ ── 2. 청구내역 (자금원별 자동 집계) ───────────────────  │ │
│ │   ┌──────────────┬──────────┐                            │ │
│ │   │후보자자산        │  3,000,000│                          │ │
│ │   │후원회기부금       │  5,000,000│                          │ │
│ │   │보조금            │  4,000,000│                          │ │
│ │   │보조금외          │    300,000│                          │ │
│ │   ├──────────────┼──────────┤                            │ │
│ │   │합계              │ 12,300,000│ ← 보전청구 총액            │ │
│ │   └──────────────┴──────────┘                            │ │
│ │   📊 집계 거래: 234건 (보전 미체크: 12건)                  │ │
│ │   [보전 체크 화면으로 이동 →]                              │ │
│ │                                                          │ │
│ │ ── 3. 수령계좌 ───────────────────────────────────────── │ │
│ │   예금주:    [홍길동           ]                          │ │
│ │   금융기관명: [○○은행          ]                          │ │
│ │   계좌번호:  [123-456-789012   ]                          │ │
│ │   비고:     [                  ]                          │ │
│ │                                                          │ │
│ │ ── 4. 청구인 정보 ────────────────────────────────────── │ │
│ │   후보자:     [홍길동      ] ✓ 자동 입력                   │ │
│ │   선거사무장: [김선거      ]                              │ │
│ │   회계책임자: [이회계      ] ⚠️ 미입력 시 경고              │ │
│ │                                                          │ │
│ │ ── 5. 부속서류 안내 ──────────────────────────────────── │ │
│ │   ☑ 정치자금 수입·지출부(선거비용과목) [📄 자동생성]      │ │
│ │   ☐ 영수증 등 증빙서류 사본 (수기 첨부)                   │ │
│ │   ☐ 선거연락소별 보전청구서 사본 (해당 시)                │ │
│ │   ☐ 정치자금 수입·지출 통장 사본                          │ │
│ │                                                          │ │
│ │            [    보전청구서 (서식1) 다운로드  📥    ]     │ │
│ └──────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 4.2 컴포넌트 트리

```
ReimbursementPage (page.tsx)
├── Tabs (existing)
│   ├── TabsContent value="check"      (기존 보전 체크)
│   ├── TabsContent value="burden"     (기존 부담비용 청구)
│   └── TabsContent value="claim"      ★ 신규
│       └── ClaimFormTab
│           ├── ClaimFormTypeSelector  // 서식1 / 서식2
│           ├── BasicInfoForm          // 1. 선거명/정당/선거구/후보자
│           ├── ClaimSummaryCard       // 2. 자금원별 집계 카드
│           ├── ReceivingAccountForm   // 3. 수령계좌 입력
│           ├── ClaimantsForm          // 4. 청구인 입력
│           ├── AttachmentsChecklist   // 5. 부속서류 체크
│           └── DownloadButton         // → generateReimbursementClaimForm()
```

---

## 5. API 설계

### 5.1 신규 API: `POST /api/reimbursement/claim-form/aggregate`

**목적**: 자금원별 집계 결과 반환 (UI 미리보기용)

**Request**:
```json
{
  "orgId": 123,
  "formType": "form1"
}
```

**Response**:
```json
{
  "byFundingSource": {
    "후보자자산": 3000000,
    "후원회기부금": 5000000,
    "보조금": 4000000,
    "보조금외": 300000,
    "합계": 12300000
  },
  "rowCount": 234,
  "rejectedCount": 12
}
```

**구현 위치**: `app/src/app/api/reimbursement/claim-form/aggregate/route.ts`

### 5.2 Excel 생성 — 클라이언트 사이드

ExcelJS는 브라우저에서 실행 가능. `burden-cost-form.ts`와 동일하게 클라이언트에서 생성:

```typescript
// components/reimbursement/claim-form-tab.tsx
const handleDownload = async () => {
  const aggregate = await fetch("/api/reimbursement/claim-form/aggregate", {...});
  const formData = composeFormData(aggregate, userInputs);
  const wb = await generateReimbursementClaimForm(formData);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  saveAs(blob, `선거비용_보전청구서_${candidateName}_${dateStr}.xlsx`);
};
```

---

## 6. 한글 통화 변환 함수

서식 1·2의 "금 ___원" 표기는 한글 표기 + 숫자 병기.

```typescript
// lib/utils/korean-amount.ts (신규 또는 기존 활용)
export function toKoreanAmount(amount: number): string {
  // 12,300,000 → "일천이백삼십만"
  // 알고리즘: 4자리씩 분할, 단위(만/억/조) 부착
  // 0인 자리는 생략
}
```

기존 코드에 동일 유틸 있으면 재사용. 없으면 신규 작성.

---

## 7. 파일 구조

```
app/src/
├── lib/
│   ├── accounting/
│   │   ├── adjust-negative-income.ts        # 기존
│   │   ├── funding-source.ts                ★ 신규 (자금원 분류)
│   │   └── reimbursement-aggregator.ts      ★ 신규 (보전 집계)
│   ├── excel-template/
│   │   ├── burden-cost-form.ts              # 기존 (서식 7)
│   │   └── reimbursement-claim-form.ts      ★ 신규 (서식 1·2)
│   └── utils/
│       └── korean-amount.ts                 ★ 신규 또는 기존 재사용
├── app/
│   ├── api/
│   │   └── reimbursement/
│   │       └── claim-form/
│   │           └── aggregate/
│   │               └── route.ts             ★ 신규
│   └── dashboard/
│       └── reimbursement/
│           └── page.tsx                     # 수정 (탭 추가)
└── components/
    └── reimbursement/
        ├── claim-form-tab.tsx               ★ 신규
        ├── claim-summary-card.tsx           ★ 신규
        └── claimants-form.tsx               ★ 신규
```

---

## 8. 구현 순서

| 순서 | 항목 | 의존성 | 예상 |
|---|---|---|---|
| 1 | `funding-source.ts` + 단위 테스트 | 없음 | 0.5일 |
| 2 | `reimbursement-aggregator.ts` + 단위 테스트 | 1 | 0.5일 |
| 3 | `korean-amount.ts` (확인 후 신규/재사용) | 없음 | 0.25일 |
| 4 | `reimbursement-claim-form.ts` 서식 1 Excel 생성 + 단위 테스트 | 1, 3 | 1.5일 |
| 5 | `/api/reimbursement/claim-form/aggregate` route | 2 | 0.25일 |
| 6 | UI 컴포넌트 (`claim-form-tab.tsx` 등) | 5 | 1일 |
| 7 | `reimbursement/page.tsx` 탭 통합 | 6 | 0.25일 |
| 8 | 안내서 작성예시 1과 셀 단위 비교 검증 | 4 | 0.5일 |
| **합계** | | | **~5일** |

---

## 9. 디자인 시스템 적용 (DESIGN.md 참조)

| 요소 | 적용 토큰/색상 | 비고 |
|---|---|---|
| 신규 탭 활성 상태 | `--accent` (#D4883A) | 기존 탭과 동일 |
| "보전청구서 다운로드" CTA | `--accent` 배경, `text-white` | 주요 액션 |
| 자금원 합계 카드 배경 | `--info-bg` (#EFF6FF) | 보전 페이지 기존 카드와 동일 |
| 합계 행 강조 | `bg-gray-50` + `font-bold` | 표 내부 |
| 청구인 누락 경고 아이콘 | `text-warning` (amber-600) | ⚠️ 표기 |
| 부속서류 자동생성 가능 항목 | `text-success` (#166534) | 📄 아이콘 |
| 입력 필드 | `Input` + `Label` (shadcn/ui) | 기존 디자인 시스템 |

---

## 10. 테스트 전략

### 10.1 단위 테스트

```typescript
// funding-source.test.ts
describe("classifyFundingSource", () => {
  it("코드 84 → 후보자자산", () => {
    expect(classifyFundingSource(84)).toBe("후보자자산");
  });
  it("코드 85 → 후원회기부금", () => { ... });
  it("이름 폴백: '보조금외 지원금' → 보조금외", () => {
    expect(classifyFundingSource(999, "보조금외 지원금")).toBe("보조금외");
  });
});

// reimbursement-aggregator.test.ts (mock supabase)
describe("aggregateReimbursementByFundingSource", () => {
  it("선거비용 보전 체크된 행만 집계", async () => { ... });
  it("자금원 4개 합계 = 총합계", async () => { ... });
  it("선거비용외 항목은 제외", async () => { ... });
});

// reimbursement-claim-form.test.ts
describe("generateReimbursementClaimForm 서식 1", () => {
  it("필수 셀(제목/선거명/합계/날인란) 존재", async () => { ... });
  it("자금원 4열 + 합계 + 비고 = 7열 표 구조", async () => { ... });
  it("청구인란 3행 (후보자/선거사무장/회계책임자)", async () => { ... });
});
```

### 10.2 통합 테스트 (Phase 1 완료 후)

- 안내서 p.144 작성예시 1과 다운로드된 Excel을 셀 단위로 비교
- 실제 acc_book 샘플 데이터로 합계 정확성 검증 (±0원)

---

## 11. 결정 보류/Phase 2 항목

| 항목 | 보류 사유 | Phase |
|---|---|---|
| 선거연락소 분리 집계 | acc_book에 연락소 식별 컬럼 없음, schema 확장 필요 | 2 |
| 서식 2 (비례대표) | 보조금 5종 매핑 codeset 확인 필요 | 2 |
| 추가청구 모드 (FR-08) | Phase 1 출시 후 사용자 피드백 반영 | 3 |
| 영수증 zip 자동 묶음 | evidence_file 정렬·매칭 로직 별도 설계 필요 | 3 |
| 한글금액 변환 (`toKoreanAmount`) | 기존 코드 검색 후 재사용/신규 결정 | 1 (구현 시점) |

---

## 12. 위험 및 완화

| 위험 | 영향 | 완화 |
|---|---|---|
| 자금원 코드값(82~85)이 다른 환경(테스트/프로덕션)에서 다를 수 있음 | 합계 오류 | 코드값 하드코딩 + 이름 폴백 이중화 (`funding-source.ts` 참조) |
| 양식 표 셀 병합이 LibreOffice/Excel/Numbers에서 다르게 렌더링 | 시각적 불일치 | `burden-cost-form.ts`와 동일 ExcelJS 패턴 적용, Excel 365 기준 검증 |
| 보전 미체크 거래가 많을 경우 사용자 혼동 | UX 저하 | UI에서 미체크 건수 표시 + "보전 체크 화면으로 이동" 링크 제공 |
| 청구인 미입력 상태로 다운로드 | 양식 무효 | 다운로드 버튼 disabled 또는 confirm dialog |

---

## 13. Acceptance Criteria

- ✅ 신규 탭 "보전청구서"가 `/dashboard/reimbursement`에 표시됨
- ✅ 자금원 4개 합계가 `acc_book` 보전 체크 행 합계와 일치 (±0원)
- ✅ 다운로드 버튼 클릭 시 `선거비용_보전청구서_{candidate}_{YYYYMMDD}.xlsx` 파일 생성
- ✅ Excel 파일을 안내서 p.144 작성예시 1과 비교 시 셀 좌표·내용 일치
- ✅ 단위 테스트 3개 모듈 모두 통과 (funding-source, aggregator, form-generator)
- ✅ 청구인 미입력 시 시각적 경고 표시
- ✅ 한글 통화 표기 정확 (예: 12,300,000 → "일천이백삼십만")
