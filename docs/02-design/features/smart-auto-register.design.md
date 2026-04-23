# Smart Auto Register — Design Document

> Plan: `docs/01-plan/features/smart-auto-register.plan.md`

## 1. 텍스트 파서 (lib/text-parser.ts)

### 1.1 인터페이스

```typescript
export interface ParsedExpenseText {
  amount: number | null;
  date: string | null;         // YYYY-MM-DD
  payMethod: string | null;    // PAY_METHODS value ("118", "584" 등)
  customerName: string | null;
  content: string;             // 정리된 내역 (금액/날짜/결제수단 제거 후)
  keywords: string[];          // 지출유형 매칭용 추출 키워드
}

export function parseExpenseText(text: string): ParsedExpenseText
```

### 1.2 금액 추출

순서대로 매칭, 첫 번째 매칭 사용:

```typescript
const AMOUNT_PATTERNS = [
  /(\d+)만\s*(\d+)천\s*원?/,    // 3만5천원 → 35,000
  /(\d+)만\s*원?/,              // 50만원 → 500,000
  /(\d{1,3}(?:,\d{3})+)\s*원?/, // 500,000원 → 500,000
  /(\d{5,})\s*원?/,             // 500000 → 500,000 (5자리 이상)
];
```

### 1.3 날짜 추출

```typescript
const DATE_PATTERNS = [
  /(\d{4})[-/.년](\d{1,2})[-/.월](\d{1,2})일?/,  // 2026-04-10, 2026년4월10일
  /(\d{1,2})[-/.월](\d{1,2})일?/,                 // 4월10일, 4/10
];
const DATE_KEYWORDS: Record<string, number> = {
  "오늘": 0, "어제": -1, "그제": -2, "그저께": -2,
};
```

년도 없으면 현재 연도 사용. 매칭 없으면 `null` (기본값은 UI에서 오늘로 설정).

### 1.4 결제수단 추출

```typescript
const PAY_KEYWORDS: Record<string, string> = {
  "신용카드": "584", "체크카드": "585", "카드": "584",
  "현금": "120", "계좌이체": "118", "계좌": "118", "이체": "118",
  "입금": "118", "송금": "118", "수표": "583",
};
```

### 1.5 키워드 + 거래처 추출

1. 금액/날짜/결제수단 토큰을 제거
2. 남은 텍스트에서 wizard-mappings keywords와 매칭되는 토큰 = `keywords`
3. keywords에도 금액/날짜에도 해당하지 않는 남은 문자열 = `customerName` 후보
4. `content`: 금액/결제수단을 제외한 의미 있는 텍스트 전체

```text
"명함 인쇄 50만원 양지디자인 4월10일 카드"
  │       │      │         │       │
  keywords amount customerName date  payMethod
  → content: "명함 인쇄"
  → keywords: ["명함", "인쇄"]
  → customerName: "양지디자인"
  → amount: 500000
  → date: "2026-04-10"
  → payMethod: "584"
```

## 2. 지출유형 추론 (lib/wizard-mappings.ts 확장)

### 2.1 inferExpenseType 함수

```typescript
export interface InferredExpenseType {
  wizardType: WizardType | null;
  expGroup1: string;
  expGroup2: string;
  expGroup3: string;
  confidence: number;           // 0.0 ~ 1.0
}

export function inferExpenseType(
  keywords: string[],
  types: WizardType[],
): InferredExpenseType
```

### 2.2 매칭 알고리즘

```text
Step 1: Level2/Level3 정확 매칭 (confidence 0.9)
  keywords 중 하나가 expense-types의 level2.label과 일치
  예: "명함" → 인쇄물 > 명함

Step 2: WizardType keywords 매칭 (confidence 0.7)
  keywords 중 하나가 WizardType.keywords에 포함
  가장 많은 키워드가 매칭된 WizardType 선택
  예: ["현수막", "제작"] → 현수막/설치 카드 (2개 매칭)

Step 3: 부분 문자열 매칭 (confidence 0.5)
  keywords가 WizardType의 label/description에 부분 포함
  예: "광고" → 광고/홍보 카드

Step 4: 매칭 없음 (confidence 0.0)
  → "기타" 카드, expGroup1 빈값
```

Level2 매칭 시 Level3는 첫 번째 항목 기본 선택.

### 2.3 ExpType level2 키워드 인덱스

expense-types.ts의 level2 라벨을 검색 가능한 인덱스로 구축:

```typescript
// 빌드 타임에 한 번만 생성
const LEVEL2_INDEX: Map<string, { group1: string; group2: string }> = new Map();
// "선거벽보" → { group1: "인쇄물", group2: "선거벽보" }
// "명함" → { group1: "인쇄물", group2: "명함" }
// "신문광고" → { group1: "광고", group2: "신문광고" }
// "차량" → { group1: "공개장소연설대담", group2: "차량" }
// ...
```

## 3. 거래처 자동등록 (OCR 기반)

### 3.1 흐름

```text
첨부파일 OCR 결과
  ├── provider: "양지디자인"
  ├── regNum: "123-45-67890"
  └── addr: "서울시 종로구 ..."
        │
        ↓
기존 거래처 검색 (name LIKE '%양지디자인%')
  ├── 매칭됨 → cust_id 사용
  └── 매칭 없음 → 자동등록
        │
        ↓
/api/customers POST { action: "insert", data: {
  cust_sec_cd: 63,              // 기본 거래처 유형
  name: "양지디자인",            // OCR provider
  reg_num: "123-45-67890",      // OCR regNum (있으면)
  addr: "서울시 종로구 ...",     // OCR addr (있으면)
  reg_date: "20260413"          // 등록일
}}
        │
        ↓
반환된 cust_id를 acc_book에 사용
```

### 3.2 거래처 검색 API

기존 `/api/customers` GET 활용:

```typescript
// 거래처 이름으로 검색
const res = await fetch(`/api/customers?search=${encodeURIComponent(name)}`);
const customers = await res.json();
if (Array.isArray(customers) && customers.length > 0) {
  // 기존 거래처 사용 (가장 유사한 첫 번째)
  return customers[0].cust_id;
}
// 없으면 자동등록
```

### 3.3 OCR 데이터 → 거래처 필드 매핑

| OCR 필드 | customer 테이블 컬럼 | 비고 |
|----------|---------------------|------|
| provider | name | 상호명/거래처명 |
| regNum | reg_num | 사업자등록번호 |
| addr | addr | 사업장 주소 |
| (없음) | cust_sec_cd | 63 (기본) |
| (없음) | reg_date | 오늘 (YYYYMMDD) |

텍스트만 입력하고 첨부파일 없는 경우:
- `customerName`만으로 거래처 검색
- 미등록 시 `{ name, cust_sec_cd: 63, reg_num: "9999" }`로 간단 등록
- 사업자번호/주소는 나중에 거래처 관리에서 수정 가능

### 3.4 사업자번호 중복 체크 (Phase 2 — 향후 개선)

> **Phase 1 (현재)**: 거래처 매칭은 `customerName` 기반 `/api/customers?search=` 검색만 사용.
> 동일 상호 다중 사업자가 있을 경우 첫 번째 결과를 사용하고, 사용자가 분석 결과 화면에서 수정 가능.
>
> **Phase 2 (향후 개선)**: `/api/customers?regNum=` 파라미터 추가 후, OCR로 `regNum`이 추출된 경우
> 이름 매칭 전에 사업자번호로 먼저 검색하여 정확도 향상. (§8 NOT in scope 참조)

Phase 2 구현 예정 코드 (참고용):

```typescript
// 향후 구현 (Phase 2)
if (ocrResult?.regNum) {
  const byRegNum = await fetch(`/api/customers?regNum=${ocrResult.regNum}`);
  // 사업자번호 일치 거래처 있으면 바로 사용 (이름이 달라도)
}
```

## 4. UI 설계

### 4.1 마법사 페이지 탭 구조

```text
┌─────────────────────────────────────────────────────┐
│  간편등록 마법사                                      │
│  3단계로 간편하게 회계자료를 등록하세요                  │
│                                                       │
│  [카드 선택]  [빠른 등록]   ← 탭 전환                  │
│─────────────────────────────────────────────────────│
```

"카드 선택" = 기존 마법사 흐름
"빠른 등록" = 새로운 텍스트+파일 자동등록

### 4.2 빠른 등록 — 입력 화면

```text
┌─────────────────────────────────────────────────────┐
│  💬 지출 내용을 입력하세요                             │
│                                                       │
│  ┌───────────────────────────────────────────────┐   │
│  │ 명함 인쇄 50만원 양지디자인 카드               │   │
│  │                                               │   │
│  └───────────────────────────────────────────────┘   │
│  예: "현수막 제작 30만원 OO간판점 4/10"               │
│                                                       │
│  📎 첨부파일 (선택)                                   │
│  [파일 선택] receipt_001.jpg                           │
│                                                       │
│  [자동 분석하기]                                       │
└─────────────────────────────────────────────────────┘
```

- textarea (2줄 이상, 자동 높이 조절)
- placeholder 예시 텍스트
- 파일 첨부는 선택 (image/*, application/pdf)

### 4.3 빠른 등록 — 분석 결과 화면

```text
┌─────────────────────────────────────────────────────┐
│  분석 결과                                            │
│                                                       │
│  ┌─ 자동 매핑 (수정 가능) ──────────────────────┐     │
│  │ 계  정  [후보자등자산 ▼]                      │     │
│  │ 과  목  [선거비용 ▼]                          │     │
│  │ 유형1   인쇄물      (신뢰도: 90%)             │     │
│  │ 유형2   명함                                  │     │
│  │ 유형3   인쇄비                                │     │
│  │                                              │     │
│  │ ✓ 보전대상 — 인쇄물 > 명함은(는) 보전대상입니다│     │
│  └──────────────────────────────────────────────┘     │
│                                                       │
│  ┌─ 추출 정보 (수정 가능) ──────────────────────┐     │
│  │ 거래처  [양지디자인_______] [검색]             │     │
│  │         ⓘ 신규 거래처 — 등록 시 자동 생성     │     │
│  │         사업자번호: 123-45-67890 (OCR)        │     │
│  │ 금  액  [500,000___________]                  │     │
│  │ 날  짜  [2026-04-13________]                  │     │
│  │ 내  역  [명함 인쇄__________]                  │     │
│  │ 결  제  [신용카드 ▼]                          │     │
│  └──────────────────────────────────────────────┘     │
│                                                       │
│  ┌─ OCR 교차검증 ──────────────────────────────┐      │
│  │ 금액   500,000 ✓ 텍스트와 일치               │      │
│  │ 거래처 양지디자인 ✓ 일치                      │      │
│  │ 날짜   2026-04-10 ⚠ 텍스트(04-13)와 다름     │      │
│  │        [OCR 날짜로 변경]                      │      │
│  └──────────────────────────────────────────────┘     │
│                                                       │
│              [← 다시 입력] [등록하기]                   │
└─────────────────────────────────────────────────────┘
```

### 4.4 신뢰도 표시

| 신뢰도 | 표시 | 의미 |
|--------|------|------|
| 0.9 | 🟢 90% | level2 정확 매칭 |
| 0.7 | 🟡 70% | 카드 키워드 매칭 |
| 0.5 | 🟠 50% | 부분 문자열 매칭 |
| 0.0 | 🔴 0% | 매칭 실패 → "기타" |

신뢰도 0.5 이하일 때: "지출유형을 확인해주세요" 경고 표시.

### 4.5 거래처 자동등록 UI 흐름

```text
Case 1: 기존 거래처 매칭
  거래처  [양지디자인] [검색]
  ✓ 기존 거래처 매칭 (cust_id: 42)

Case 2: OCR로 신규 거래처 정보 있음
  거래처  [양지디자인] [검색]
  ⓘ 신규 거래처 — 등록 시 자동 생성
  사업자번호: 123-45-67890 (OCR 추출)
  주소: 서울시 종로구 ... (OCR 추출)

Case 3: 텍스트만, OCR 없음
  거래처  [양지디자인] [검색]
  ⓘ 신규 거래처 — 이름으로 자동 생성
```

## 5. 컴포넌트 설계

### 5.1 파일 구조

```text
app/src/
├── lib/text-parser.ts                   ← 신규: 텍스트 파서
├── lib/wizard-mappings.ts               ← 수정: inferExpenseType 추가
├── app/dashboard/wizard/page.tsx        ← 수정: "빠른 등록" 탭 추가
└── (기존 재사용)
    ├── lib/expense-types.ts             ← getReimbursementStatus
    ├── app/api/receipt-scan/route.ts    ← OCR API
    ├── app/api/customers/route.ts       ← 거래처 CRUD
    ├── app/api/acc-book/route.ts        ← 저장
    └── app/api/evidence-file/route.ts   ← 증빙파일
```

### 5.2 상태 설계

```typescript
// 기존 마법사 상태에 추가
const [activeTab, setActiveTab] = useState<"card" | "quick">("card");

// 빠른 등록 전용 상태
const [inputText, setInputText] = useState("");
const [quickFile, setQuickFile] = useState<{ name: string; type: string; base64: string } | null>(null);
const [analyzing, setAnalyzing] = useState(false);
const [analysisResult, setAnalysisResult] = useState<{
  parsed: ParsedExpenseText;
  inferred: InferredExpenseType;
  ocrResult: OcrResult | null;
  ocrComparison: OcrComparison | null;
  customerMatch: { matched: boolean; custId: number; isNew: boolean; ocrData?: { regNum?: string; addr?: string } } | null;
} | null>(null);
```

### 5.3 분석 함수

```typescript
async function handleAnalyze() {
  setAnalyzing(true);

  // 1. 텍스트 파싱
  const parsed = parseExpenseText(inputText);

  // 2. 지출유형 추론
  const inferred = inferExpenseType(parsed.keywords, EXPENSE_WIZARD_TYPES);

  // 3. 코드값 자동 매핑
  if (orgSecCd && inferred.wizardType) {
    const { accSecCd, itemSecCd } = resolveCodeValues(
      inferred.wizardType, orgSecCd, getAccounts, getItems
    );
    setAutoSet({ acc_sec_cd: accSecCd, item_sec_cd: itemSecCd, exp_group1_cd: inferred.expGroup1 });
  }

  // 4. OCR (파일 있을 때, 병렬)
  let ocrResult = null;
  if (quickFile) {
    const res = await fetch("/api/receipt-scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: quickFile.base64, mimeType: quickFile.type }),
    });
    if (res.ok) ocrResult = await res.json();
  }

  // 5. 거래처 매칭/자동등록 준비
  const customerName = parsed.customerName || ocrResult?.provider || "";
  let customerMatch = null;
  if (customerName) {
    const res = await fetch(`/api/customers?search=${encodeURIComponent(customerName)}`);
    const { data } = await res.json();
    if (data?.length > 0) {
      customerMatch = { matched: true, custId: data[0].cust_id, isNew: false };
    } else {
      customerMatch = {
        matched: false, custId: 0, isNew: true,
        ocrData: ocrResult ? { regNum: ocrResult.regNum, addr: ocrResult.addr } : undefined,
      };
    }
  }

  // 6. OCR 교차검증
  const ocrComparison = ocrResult ? compareWithOcr(parsed, ocrResult) : null;

  setAnalysisResult({ parsed, inferred, ocrResult, ocrComparison, customerMatch });
  setAnalyzing(false);
}
```

### 5.4 OCR 교차검증

```typescript
interface OcrComparison {
  amount: { ocr: number; text: number | null; match: boolean };
  date: { ocr: string; text: string | null; match: boolean };
  customer: { ocr: string; text: string | null; match: boolean };
}

function compareWithOcr(parsed: ParsedExpenseText, ocr: OcrResult): OcrComparison {
  return {
    amount: {
      ocr: ocr.amount,
      text: parsed.amount,
      match: parsed.amount !== null && parsed.amount === ocr.amount,
    },
    date: {
      ocr: formatDate(ocr.date),  // YYYYMMDD → YYYY-MM-DD
      text: parsed.date,
      match: parsed.date !== null && parsed.date === formatDate(ocr.date),
    },
    customer: {
      ocr: ocr.provider,
      text: parsed.customerName,
      match: parsed.customerName !== null &&
        (parsed.customerName.includes(ocr.provider) || ocr.provider.includes(parsed.customerName)),
    },
  };
}
```

## 6. 저장 흐름

```text
"등록하기" 클릭
  │
  ├── 거래처 처리
  │   ├── customerMatch.matched → 기존 cust_id 사용
  │   └── customerMatch.isNew → /api/customers POST
  │       ├── OCR 데이터 있음 → { name, reg_num, addr, cust_sec_cd: 63 }
  │       └── OCR 없음 → { name, cust_sec_cd: 63, reg_num: "9999" }
  │
  ├── /api/acc-book POST (action: "insert")
  │   payload: org_id, incm_sec_cd, acc_sec_cd, item_sec_cd,
  │            cust_id, acc_date, content, acc_amt,
  │            rcp_yn, rcp_no, acc_ins_type,
  │            exp_group1_cd, exp_group2_cd, exp_group3_cd
  │
  ├── 증빙파일 있으면 → /api/evidence-file POST
  │
  └── 결과 → 기존 인라인 성공/부분성공/에러 배너
        (마법사와 동일한 SaveResult 타입 재사용)
```

## 7. 구현 순서

1. `lib/text-parser.ts` — 텍스트 파서 (금액/날짜/결제수단/거래처/키워드 추출)
2. `lib/text-parser.test.ts` — 파서 유닛 테스트
3. `lib/wizard-mappings.ts` — `inferExpenseType()` 함수 추가 + level2 인덱스
4. `lib/wizard-mappings.test.ts` — inferExpenseType 테스트 추가
5. `dashboard/wizard/page.tsx` — "빠른 등록" 탭 UI + 분석/저장 로직
6. `dashboard/wizard/page.test.tsx` — 빠른 등록 탭 테스트 추가

## 8. 구현 제외 (NOT in scope)

- AI(LLM) 텍스트 분석 (정규식+키워드 매칭으로 충분)
- 음성 입력
- 일괄 텍스트 입력 (여러 건 동시)
- 수입 자동등록 (1차 지출만)
- 거래처 주소 자동 검색 (OCR 추출값 그대로 사용)
- `/api/customers` GET에 `regNum` 검색 파라미터 추가 (Phase 2 — §3.4 사업자번호 우선 검색의 전제조건)

## 9. 디자인 시스템 적용 (DESIGN.md)

| 요소 | 토큰 |
|------|------|
| 탭 활성 | --primary (#1B3A5C) |
| 탭 비활성 | btn-outline |
| textarea | --border, --radius-md |
| "자동 분석하기" 버튼 | --accent (#D4883A) |
| 자동 매핑 섹션 | --info-bg (#EFF6FF) |
| 보전 뱃지 | 기존 보전 뱃지 색상 |
| OCR 일치 | --success (#166534) |
| OCR 불일치 | --warning (#92400E) |
| 신규 거래처 안내 | --info (#1E40AF) |
| 신뢰도 70%+ | text-green-600 |
| 신뢰도 50-69% | text-yellow-600 |
| 신뢰도 50% 미만 | text-red-600 |
