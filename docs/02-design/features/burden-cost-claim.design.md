# Design: 부담비용 청구 기능

> **Feature**: burden-cost-claim
> **Plan Reference**: `docs/01-plan/features/burden-cost-claim.plan.md`
> **Created**: 2026-04-15
> **Status**: Design

---

## 1. 이미 구현된 항목 (Phase 1 선행 작업)

| 항목 | 파일 | 상태 |
|------|------|:----:|
| NON_ELECTION_EXP_TYPES에 "부담비용" 카테고리 추가 | `lib/expense-types.ts` | ✅ |
| ReimbursementStatus에 "부담비용" 상태 + 판별 로직 | `lib/expense-types.ts` | ✅ |
| EXPENSE_WIZARD_TYPES에 "부담비용" 카드 (♿) | `lib/wizard-mappings.ts` | ✅ |
| LEVEL2_INDEX에 NON_ELECTION_EXP_TYPES 포함 | `lib/wizard-mappings.ts` | ✅ |
| wizard 보전 여부 배지에 "부담비용" 스타일(파란색) | `dashboard/wizard/page.tsx` | ✅ |

---

## 2. 남은 구현 항목

### DR-01. 보전 페이지 탭 UI (FR-04)

`reimbursement/page.tsx`를 탭 구조로 리팩터링:

```
┌──────────────────────────────────────────────────┐
│  [선거비용 보전]  |  [부담비용 청구]               │
├──────────────────────────────────────────────────┤
│ (탭별 콘텐츠)                                      │
└──────────────────────────────────────────────────┘
```

```typescript
// 탭 상태
const [activeTab, setActiveTab] = useState<"reimbursement" | "burden">("reimbursement");
```

- "선거비용 보전" 탭: 기존 기능 그대로 유지 (과목=선거비용 고정)
- "부담비용 청구" 탭: 새 컴포넌트 `BurdenCostTab`

### DR-02. 부담비용 지출내역 조회 (FR-01)

#### 쿼리 조건

```typescript
// acc_book 조회 조건
supabase.from("acc_book")
  .select("acc_book_id, incm_sec_cd, acc_sec_cd, item_sec_cd, acc_date, content, acc_amt, rcp_yn, rcp_no, acc_print_ok, bigo, exp_group1_cd, exp_group2_cd, exp_group3_cd, customer:cust_id(name, reg_num, addr, job, tel)")
  .eq("org_id", orgId)
  .eq("incm_sec_cd", 2)           // 지출
  .eq("item_sec_cd", nonElectionItemSecCd)  // 선거비용외 과목
  .eq("exp_group1_cd", "부담비용") // 부담비용 카테고리만
  .gte("acc_date", fromStr)
  .lte("acc_date", toStr)
  .order("acc_date", { ascending: true })
```

#### 과목 자동 결정

```typescript
// 과목 "선거비용외" 자동 선택
const nonElectionItem = itemOptions.find((i) =>
  i.cv_name.includes("선거비용외")
);
const nonElectionItemSecCd = nonElectionItem?.cv_id || 0;
```

### DR-03. 부담비용 항목별 소계 (FR-02)

체크된 지출을 `exp_group2_cd` 기준으로 그룹화하여 소계 표시:

```typescript
interface BurdenSummary {
  점자형선거공보: number;
  점자형선거공약서: number;
  저장매체: number;
  활동보조인: number;
  total: number;
}

function calcBurdenSummary(records: BurdenRow[], checkedIds: Set<number>): BurdenSummary {
  const checked = records.filter((r) => checkedIds.has(r.acc_book_id));
  return {
    점자형선거공보: checked.filter((r) => r.exp_group2_cd === "점자형선거공보").reduce((s, r) => s + r.acc_amt, 0),
    점자형선거공약서: checked.filter((r) => r.exp_group2_cd === "점자형선거공약서").reduce((s, r) => s + r.acc_amt, 0),
    저장매체: checked.filter((r) => r.exp_group2_cd === "저장매체").reduce((s, r) => s + r.acc_amt, 0),
    활동보조인: checked.filter((r) => r.exp_group2_cd === "활동보조인").reduce((s, r) => s + r.acc_amt, 0),
    total: checked.reduce((s, r) => s + r.acc_amt, 0),
  };
}
```

#### 소계 UI

```
┌────────────────────────────────────────────────┐
│ 부담비용 항목별 소계                              │
├────────────────┬──────────┬──────────┬─────────┤
│ 점자형선거공보   │ 점자형공약서 │ 저장매체    │ 활동보조인 │
│ 1,200,000원    │ 800,000원  │ 300,000원 │ 450,000원│
├────────────────┴──────────┴──────────┴─────────┤
│ 합계: 2,750,000원 (4건 선택)                     │
└────────────────────────────────────────────────┘
```

### DR-04. 서식7 부담비용 지급청구서 Excel 생성 (FR-03)

#### 파일 구조

```
lib/excel-template/
├── burden-cost-form.ts     # 서식7 생성 로직 (신규)
└── ...
```

#### 데이터 인터페이스

```typescript
interface BurdenCostFormData {
  // 1. 기본 정보 (organ 테이블에서 자동)
  electionName: string;       // "제9회 전국동시지방선거"
  partyName: string;          // 소속정당명
  candidateName: string;      // 후보자명

  // 2. 작성/제출 수량 (사용자 입력)
  braillePublic: {            // 점자형 선거공보
    count: number;            // 작성·제출 부수(A)
    pagesPerCopy: number;     // 1부당 매수(B)
  };
  braillePledge: {            // 점자형 선거공약서
    count: number;
    pagesPerCopy: number;
  };
  storageMedia: {             // 저장매체
    count: number;            // 개수
  };

  // 3. 청구금액 (체크된 acc_book 합산, 항목별)
  amounts: BurdenSummary;

  // 4. 수령계좌 (사용자 입력)
  account: {
    holder: string;           // 예금주
    bankName: string;         // 금융기관명
    accountNumber: string;    // 계좌번호
  };
}
```

#### Excel 생성 흐름

```typescript
export async function generateBurdenCostForm(data: BurdenCostFormData): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("부담비용 지급청구서");

  // 1. 제목
  // "점자형 선거공보 등 부담비용 지급청구서"

  // 2. 기본 정보 (1~3번)
  // 선거명, 소속정당명, 후보자명

  // 3. 작성/제출 수량 표 (4번)
  // 점자형 선거공보: 부수(A), 1부당매수(B), 총매수(C=A×B)
  // 점자형 선거공약서: 동일 구조
  // 저장매체: 개수

  // 4. 청구금액 표 (5번)
  // 구분 | 계 | 제작비(한글인쇄료포함) | 저장매체디지털파일전환비 | 운반비 | 수당·실비·산재보험료
  // 점자형선거공보 / 점자형선거공약서 / 저장매체 / 활동보조인 / 합계

  // 5. 수령계좌 (6번)
  // 예금주 | 금융기관명 | 계좌번호

  // 6. 청구 문구
  // "2026년 6월 3일 실시한 제9회 전국동시지방선거에서 ...에 대한 부담비용을 위와 같이 청구합니다."

  // 7. 첨부서류 안내
  // 1. 정치자금 수입·지출부 사본 1부
  // 2. 활동보조인 수당·실비 지급 명세서 1부
  // 3. 영수증 등 증빙서류 사본 1부
  // 4. 정치자금 수입·지출 통장(수령계좌 통장) 사본 1부

  return wb;
}
```

#### 청구금액 표 상세 매핑

| 구분 | 계 | 제작비 | 디지털파일전환비 | 운반비 | 수당·실비 |
|------|-----|--------|-----------------|--------|----------|
| 점자형 선거공보 | `amounts.점자형선거공보` | exp_group3 "지대/인쇄비/제본비" + "한글인쇄료" | - | exp_group3 "운반비" | - |
| 점자형 선거공약서 | `amounts.점자형선거공약서` | exp_group3 "지대/인쇄비/제본비" + "한글인쇄료" | - | - | - |
| 저장매체 | `amounts.저장매체` | exp_group3 "제작비" | exp_group3 "디지털파일전환비" | exp_group3 "운반비" | - |
| 활동보조인 | `amounts.활동보조인` | - | - | - | exp_group3 "수당" + "실비" + "산재보험료" |
| 합계 | `amounts.total` | (열 합계) | (열 합계) | (열 합계) | (열 합계) |

> 참고: exp_group3 세부 분류가 없는 건은 `amounts.{항목}` 전액을 "계" 열에만 표시

---

## 3. 컴포넌트 설계

### 3.1 파일 구조

```
app/src/
├── app/dashboard/reimbursement/
│   └── page.tsx                        # 탭 UI + 기존 보전 + 부담비용 탭 (수정)
├── lib/
│   ├── expense-types.ts                # 부담비용 카테고리 + 판별 (✅ 완료)
│   ├── wizard-mappings.ts              # 부담비용 카드 (✅ 완료)
│   └── excel-template/
│       └── burden-cost-form.ts         # 서식7 Excel 생성 (신규)
```

### 3.2 reimbursement/page.tsx 구조 변경

```tsx
export default function ReimbursementPage() {
  const [activeTab, setActiveTab] = useState<"reimbursement" | "burden">("reimbursement");

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">보전비용 관리</h2>

      {/* 탭 */}
      <div className="flex border-b">
        <button onClick={() => setActiveTab("reimbursement")}
          className={activeTab === "reimbursement" ? "border-b-2 border-blue-600 font-bold" : ""}>
          선거비용 보전
        </button>
        <button onClick={() => setActiveTab("burden")}
          className={activeTab === "burden" ? "border-b-2 border-blue-600 font-bold" : ""}>
          부담비용 청구
        </button>
      </div>

      {/* 탭 콘텐츠 */}
      {activeTab === "reimbursement" ? <ReimbursementTab /> : <BurdenCostTab />}
    </div>
  );
}
```

### 3.3 BurdenCostTab 컴포넌트

```tsx
function BurdenCostTab() {
  // 상태
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [records, setRecords] = useState<BurdenRow[]>([]);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [showFormDialog, setShowFormDialog] = useState(false);

  // 조회: 선거비용외 + exp_group1_cd="부담비용"
  // 체크: 개별/전체 토글
  // 소계: calcBurdenSummary()
  // 청구서: Dialog로 수량/계좌 입력 → Excel 생성

  return (
    <>
      {/* 안내 배너 */}
      <div className="bg-blue-50 rounded p-3 text-sm text-blue-800">
        부담비용(점자형 선거공보, 저장매체, 활동보조인 등)에 해당하는 지출내역을 조회합니다.
        부담비용은 선거비용외 정치자금으로, 국가/지자체에 별도 청구합니다.
        <br/>청구기한: <b>선거일 후 10일 이내 (2026.6.15까지)</b>
      </div>

      {/* 기간 필터 + 조회 버튼 */}
      {/* 항목별 소계 카드 */}
      {/* 지출내역 테이블 (체크박스 포함) */}
      {/* 하단: 청구서 생성 버튼 */}

      {/* 청구서 정보 입력 Dialog */}
      {showFormDialog && (
        <BurdenCostFormDialog
          summary={calcBurdenSummary(records, checkedIds)}
          onGenerate={handleGenerateForm}
          onClose={() => setShowFormDialog(false)}
        />
      )}
    </>
  );
}
```

### 3.4 BurdenCostFormDialog

청구서 생성 전 추가 정보 입력 다이얼로그:

```
┌─────────────────────────────────────────┐
│ 부담비용 지급청구서 생성                   │
├─────────────────────────────────────────┤
│ ■ 작성/제출 수량                          │
│  점자형 선거공보: [__]부 × [__]매          │
│  점자형 선거공약서: [__]부 × [__]매         │
│  저장매체: [__]개                         │
│                                          │
│ ■ 수령계좌                               │
│  예금주: [__________]                    │
│  금융기관: [__________]                   │
│  계좌번호: [__________]                   │
│                                          │
│ ■ 청구금액 확인                           │
│  점자형선거공보: 1,200,000원              │
│  점자형선거공약서: 800,000원               │
│  저장매체: 300,000원                      │
│  활동보조인: 450,000원                    │
│  합계: 2,750,000원                       │
│                                          │
│ ■ 필수 첨부서류 체크리스트                  │
│  ☐ 정치자금 수입·지출부 사본               │
│  ☐ 활동보조인 수당·실비 지급 명세서         │
│  ☐ 영수증 등 증빙서류 사본                 │
│  ☐ 수령계좌 통장 사본                     │
│                                          │
│         [취소]  [청구서 Excel 다운로드]     │
└─────────────────────────────────────────┘
```

---

## 4. DB 스키마

### 기존 테이블 활용 (변경 없음)

부담비용 지출은 `acc_book` 테이블의 기존 컬럼으로 충분:

| 컬럼 | 용도 |
|------|------|
| `incm_sec_cd = 2` | 지출 |
| `item_sec_cd` | 선거비용외 정치자금 과목 코드 |
| `exp_group1_cd = "부담비용"` | 부담비용 카테고리 |
| `exp_group2_cd` | 점자형선거공보 / 점자형선거공약서 / 저장매체 / 활동보조인 |
| `exp_group3_cd` | 세부 (지대/인쇄비, 수당, 실비 등) |
| `acc_print_ok` | 부담비용 청구 대상 체크 ("Y"/"N") |

> 신규 테이블이나 컬럼 추가 불필요

---

## 5. API 설계

### 서식7 생성은 클라이언트사이드

기존 Excel 생성 패턴(`reports/page.tsx`)과 동일하게 **클라이언트에서 ExcelJS로 직접 생성**.
서버 API 없이 브라우저에서 다운로드.

```typescript
// BurdenCostTab 내부
async function handleGenerateForm(formInput: BurdenCostFormInput) {
  const orgInfo = { /* auth store에서 */ };
  const data: BurdenCostFormData = {
    electionName: orgInfo.electionName || "제9회 전국동시지방선거",
    partyName: orgInfo.partyName || "",
    candidateName: orgInfo.candidateName || "",
    braillePublic: formInput.braillePublic,
    braillePledge: formInput.braillePledge,
    storageMedia: formInput.storageMedia,
    amounts: calcBurdenSummary(records, checkedIds),
    account: formInput.account,
  };

  const wb = await generateBurdenCostForm(data);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `부담비용_지급청구서_${data.candidateName}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
```

---

## 6. 지출내역 테이블 디자인

기존 보전 탭과 동일한 2단 헤더 테이블 구조 사용, 차이점:

| 차이 | 선거비용 보전 탭 | 부담비용 청구 탭 |
|------|----------------|----------------|
| 과목 필터 | 선거비용 (고정) | 선거비용외 (고정) |
| 추가 필터 | 없음 | exp_group1_cd="부담비용" |
| 헤더 "보전" | 보전 체크 | 청구 체크 |
| 소계 | 보전 대상 금액 | 항목별(공보/공약서/매체/보조인) 소계 |
| 하단 버튼 | "보전 대상 저장" | "청구 대상 저장" + "청구서 생성" |
| 테마 색상 | 파란색 (blue) | 파란색 (blue), 동일 |

---

## 7. 비즈니스 규칙 구현

### 7.1 부담비용 자동 필터

```typescript
// 부담비용에 해당하는 acc_book 레코드 필터
function isBurdenCost(row: BurdenRow): boolean {
  return row.exp_group1_cd === "부담비용";
}
```

### 7.2 주의사항 안내

| 상황 | 안내 메시지 |
|------|-----------|
| 활동보조인 선택 시 | "고용보험료는 부담비용이 아닙니다. 선거비용외로 별도 처리하세요." |
| 점자형 공보 선택 시 | "기획/도안료는 부담 대상이 아닙니다." |
| 점자형 공약서 선택 시 | "발송용 봉투/우편비는 보전대상 선거비용입니다." |
| 청구서 생성 시 | "청구기한: 2026.6.15(선거일 후 10일). 점자해독문 1부를 함께 제출하세요." |

---

## 8. 구현 순서

| 순서 | 파일 | 작업 | 의존성 |
|:----:|------|------|:------:|
| 1 | `lib/excel-template/burden-cost-form.ts` | 서식7 Excel 생성 함수 | - |
| 2 | `dashboard/reimbursement/page.tsx` | 탭 UI 추가 + 기존 코드를 ReimbursementTab으로 분리 | - |
| 3 | `dashboard/reimbursement/page.tsx` | BurdenCostTab 구현 (조회/체크/소계) | 순서 2 |
| 4 | `dashboard/reimbursement/page.tsx` | BurdenCostFormDialog 구현 (수량/계좌 입력 → Excel 다운로드) | 순서 1, 3 |
| 5 | 테스트 + 검증 | 타입체크 + 빌드 + 브라우저 확인 | 순서 4 |

---

## 9. 의존성

### 기존 패키지 활용 (추가 설치 없음)

| 패키지 | 용도 | 상태 |
|--------|------|:----:|
| `exceljs` | 서식7 Excel 생성 | 이미 설치됨 |
| `@supabase/supabase-js` | DB 조회 | 이미 설치됨 |
| shadcn/ui (Button, Input, Label, Dialog) | UI | 이미 설치됨 |

---

## 10. 보안 고려사항

| 항목 | 대응 |
|------|------|
| 계좌번호 노출 | 클라이언트 메모리에서만 사용, DB 미저장, Excel 파일에만 기록 |
| 권한 검증 | 기존 auth store의 orgId 기반 데이터 필터 유지 |
| Excel 파일 | 로컬 다운로드만 지원, 서버 업로드 없음 |
