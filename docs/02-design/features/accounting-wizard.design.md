# 회계자료등록 마법사 — Design Document

> Plan: `docs/01-plan/features/accounting-wizard.plan.md`

## 1. 거래유형 카드 정의

### 1.1 지출 카드 (10종)

```text
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  🏢 사무소    │ │  📄 인쇄물    │ │  📢 광고/홍보  │ │  🎽 소품      │
│  임대료,관리비 │ │  명함,공보물   │ │  신문,TV,인터넷 │ │  어깨띠,모자   │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  🚗 차량/이동  │ │  📱 전화/문자  │ │  👥 인건비    │ │  🏗 현수막/설치 │
│  임차,유류비   │ │  통화,SMS발송  │ │  사무원수당    │ │  현수막,무대   │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
┌──────────────┐ ┌──────────────┐
│  🧾 영수증첨부 │ │  📦 기타      │
│  문서로 자동입력│ │  그 외 지출    │
└──────────────┘ └──────────────┘
```

### 1.2 수입 카드 (5종)

```text
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  💰 후원금    │ │  🏛 보조금    │ │  🏦 자산      │
│  기명/익명    │ │  정당 지원금   │ │  후보자 자산   │
└──────────────┘ └──────────────┘ └──────────────┘
┌──────────────┐ ┌──────────────┐
│  🧾 영수증첨부 │ │  📦 기타수입  │
│  문서로 자동입력│ │  이자,기타    │
└──────────────┘ └──────────────┘
```

### 1.3 "영수증첨부" 카드 동작

"영수증첨부" 카드를 선택하면 기존 `/dashboard/document-register` (영수증/계약서 자동등록) 페이지로 이동합니다.
- 이미 구현된 Gemini Vision OCR 기능 활용
- 마법사 내에서 중복 구현하지 않고 기존 페이지로 라우팅

```text
영수증첨부 카드 클릭
  → router.push("/dashboard/document-register")
  → AI가 일자/금액/거래처/내역 자동 추출
  → 사용자가 계정/과목/지출유형 선택 후 저장
```

## 2. 거래유형 → 코드 매핑 (wizard-mappings.ts)

### 2.1 데이터 구조

```typescript
interface WizardType {
  id: string;
  icon: string;
  label: string;
  description: string;
  // 자동 설정 코드
  incmSecCd: 1 | 2;              // 수입/지출
  accSecCdName?: string;          // 계정명 (없으면 기관별 첫 계정)
  itemKeyword?: string;           // 과목 검색 키워드
  expGroup1?: string;             // 지출유형 대분류
  expGroup2?: string;             // 지출유형 중분류
  // 키워드 매칭용
  keywords: string[];
}
```

### 2.2 지출 매핑

```typescript
export const EXPENSE_WIZARD_TYPES: WizardType[] = [
  {
    id: "office",
    icon: "🏢",
    label: "사무소",
    description: "임대료, 관리비, 비품, 사무집기",
    incmSecCd: 2,
    itemKeyword: "선거비용외",
    expGroup1: "선거사무소",
    keywords: ["사무소", "임대", "임차", "관리비", "전기", "수도", "비품", "사무용품"],
  },
  {
    id: "print",
    icon: "📄",
    label: "인쇄물",
    description: "명함, 공보물, 홍보물, 선거벽보",
    incmSecCd: 2,
    itemKeyword: "선거비용",
    expGroup1: "인쇄물",
    keywords: ["인쇄", "명함", "공보", "홍보물", "벽보", "공약서", "사진"],
  },
  {
    id: "ad",
    icon: "📢",
    label: "광고/홍보",
    description: "신문, TV, 라디오, 인터넷 광고",
    incmSecCd: 2,
    itemKeyword: "선거비용",
    expGroup1: "광고",
    keywords: ["광고", "신문", "TV", "라디오", "인터넷", "배너", "SNS"],
  },
  {
    id: "goods",
    icon: "🎽",
    label: "소품",
    description: "어깨띠, 윗옷, 모자, 폼보드",
    incmSecCd: 2,
    itemKeyword: "선거비용",
    expGroup1: "소품",
    keywords: ["소품", "어깨띠", "윗옷", "모자", "폼보드", "기호"],
  },
  {
    id: "vehicle",
    icon: "🚗",
    label: "차량/이동",
    description: "차량 임차, 유류비, 기사 인건비",
    incmSecCd: 2,
    itemKeyword: "선거비용",
    expGroup1: "공개장소연설대담",
    expGroup2: "차량",
    keywords: ["차량", "유류", "기사", "주유", "택시", "렌트"],
  },
  {
    id: "telecom",
    icon: "📱",
    label: "전화/문자",
    description: "전화요금, 문자발송비, 인터넷",
    incmSecCd: 2,
    itemKeyword: "선거비용",
    expGroup1: "전화/전자우편/문자메시지",
    keywords: ["전화", "문자", "SMS", "통화", "인터넷", "이메일", "우편"],
  },
  {
    id: "labor",
    icon: "👥",
    label: "인건비",
    description: "선거사무원 수당, 활동보조인",
    incmSecCd: 2,
    itemKeyword: "선거비용",
    expGroup1: "선거사무관계자",
    keywords: ["수당", "인건비", "사무원", "사무장", "활동보조", "식대"],
  },
  {
    id: "banner",
    icon: "🏗",
    label: "현수막/설치",
    description: "현수막, 무대, 확성장치, 간판",
    incmSecCd: 2,
    itemKeyword: "선거비용",
    expGroup1: "거리게시용현수막",
    keywords: ["현수막", "무대", "연단", "확성", "간판", "현판", "설치", "철거"],
  },
  {
    id: "receipt-scan",
    icon: "🧾",
    label: "영수증/계약서 첨부",
    description: "문서 업로드로 자동 입력",
    incmSecCd: 2,
    keywords: ["영수증", "계약서", "견적서", "거래내역서", "주문서"],
    // 특수: document-register 페이지로 이동
  },
  {
    id: "other-expense",
    icon: "📦",
    label: "기타",
    description: "위 항목에 해당하지 않는 지출",
    incmSecCd: 2,
    itemKeyword: "선거비용",
    expGroup1: "",  // 사용자가 직접 선택
    keywords: [],
  },
];
```

### 2.3 수입 매핑

```typescript
export const INCOME_WIZARD_TYPES: WizardType[] = [
  {
    id: "donation",
    icon: "💰",
    label: "후원금",
    description: "기명후원금, 익명후원금",
    incmSecCd: 1,
    accSecCdName: "후원회기부금",
    keywords: ["후원", "기부", "후원금"],
  },
  {
    id: "subsidy",
    icon: "🏛",
    label: "보조금",
    description: "정당 보조금 지원",
    incmSecCd: 1,
    accSecCdName: "보조금",
    keywords: ["보조금", "지원금", "정당"],
  },
  {
    id: "asset",
    icon: "🏦",
    label: "자산",
    description: "후보자 개인 자산 투입",
    incmSecCd: 1,
    accSecCdName: "후보자등자산",
    keywords: ["자산", "후보자", "개인자금"],
  },
  {
    id: "receipt-scan-income",
    icon: "🧾",
    label: "영수증/계약서 첨부",
    description: "문서 업로드로 자동 입력",
    incmSecCd: 1,
    keywords: ["영수증", "계약서"],
    // 특수: document-register 페이지로 이동 (수입 탭)
  },
  {
    id: "other-income",
    icon: "📦",
    label: "기타수입",
    description: "이자수입, 기타",
    incmSecCd: 1,
    keywords: ["이자", "기타"],
  },
];
```

## 3. 컴포넌트 설계

### 3.1 파일 구조

```text
app/src/
├── app/dashboard/wizard/page.tsx       ← 마법사 메인 페이지
├── lib/wizard-mappings.ts              ← 거래유형 → 코드 매핑 데이터
└── (기존 재사용)
    ├── components/code-select.tsx
    ├── components/customer-search-dialog.tsx
    ├── hooks/use-code-values.ts
    ├── lib/expense-types.ts
    └── app/api/acc-book/route.ts
```

### 3.2 WizardPage 상태 설계

```typescript
// Step 관리
const [mode, setMode] = useState<"expense" | "income">("expense");
const [step, setStep] = useState(1);    // 1, 2, 3
const [selectedType, setSelectedType] = useState<WizardType | null>(null);
const [searchKeyword, setSearchKeyword] = useState("");

// Step 2: 세부 정보
const [form, setForm] = useState({
  acc_date: todayStr(),     // 기본값: 오늘
  acc_amt: 0,
  content: "",
  cust_id: 0,
  customerName: "",
  rcp_yn: "Y",
  rcp_no: "",
  bigo: "",
  acc_ins_type: "118",      // 지출 전용
  exp_group2_cd: "",        // 지출유형 중분류 (선택적)
  exp_group3_cd: "",        // 지출유형 소분류 (선택적)
});

// Step 3: 자동 설정값 (수정 가능)
const [autoSet, setAutoSet] = useState({
  acc_sec_cd: 0,
  item_sec_cd: 0,
  exp_group1_cd: "",
});

// 증빙파일
const [evidenceFile, setEvidenceFile] = useState<{...} | null>(null);
```

### 3.3 Step 1: TypeSelector

```text
┌─────────────────────────────────────────────────────┐
│  어떤 종류의 거래인가요?                               │
│                                                       │
│  🔍 [검색: 현수막_______________]                      │
│                                                       │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐                        │
│  │🏢  │ │📄  │ │📢  │ │🎽  │  ← 카드 그리드          │
│  │사무소│ │인쇄물│ │광고 │ │소품 │                       │
│  └────┘ └────┘ └────┘ └────┘                        │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐                        │
│  │🚗  │ │📱  │ │👥  │ │🏗  │                         │
│  │차량 │ │전화 │ │인건비│ │현수막│                       │
│  └────┘ └────┘ └────┘ └────┘                        │
│  ┌────┐ ┌────┐                                      │
│  │🧾  │ │📦  │                                      │
│  │영수증│ │기타 │  ← 영수증첨부 카드 추가                │
│  └────┘ └────┘                                      │
│                                                       │
│                            [이전] [다음 →]             │
└─────────────────────────────────────────────────────┘
```

**검색 동작:**
- 키워드 입력 시 매칭되는 카드만 하이라이트 (나머지 dim)
- "현수막" 입력 → 🏗 현수막/설치 카드 강조
- "전기세" 입력 → 🏢 사무소 카드 강조

**영수증첨부 카드 클릭:**
- `router.push("/dashboard/document-register")` 실행
- 수입 탭에서 클릭 시 `?tab=income` 쿼리 파라미터 추가

### 3.4 Step 2: DetailForm

```text
┌─────────────────────────────────────────────────────┐
│  📄 인쇄물 — 세부 정보를 입력하세요                     │
│                                                       │
│  거래처  [양지디자인___________] [검색] [등록]           │
│  금  액  [1,000,000__________]                        │
│  날  짜  [2026-04-09_________] (기본: 오늘)            │
│  내  역  [명함 인쇄 1,000매___]                        │
│  결  제  [계좌입금 ▼]          (지출만)                 │
│                                                       │
│  증빙파일 [파일선택___] 폼보드_거래내역서.pdf            │
│                                                       │
│                            [← 이전] [다음 →]           │
└─────────────────────────────────────────────────────┘
```

### 3.5 Step 3: ConfirmSave

```text
┌─────────────────────────────────────────────────────┐
│  등록 내용을 확인하세요                                 │
│                                                       │
│  ┌─ 자동 설정 (수정 가능) ──────────────────────┐     │
│  │ 계  정  [후보자등자산 ▼]                      │     │
│  │ 과  목  [선거비용 ▼]                          │     │
│  │ 지출유형 인쇄물 > 명함 > 인쇄비               │     │
│  └──────────────────────────────────────────────┘     │
│                                                       │
│  ┌─ 입력 내용 ──────────────────────────────────┐     │
│  │ 거래처  양지디자인                             │     │
│  │ 금  액  1,000,000원                           │     │
│  │ 날  짜  2026-04-09                            │     │
│  │ 내  역  명함 인쇄 1,000매                     │     │
│  │ 증  빙  첨부 (번호: 자동 채번)                 │     │
│  │ 증빙파일 폼보드_거래내역서.pdf                  │     │
│  └──────────────────────────────────────────────┘     │
│                                                       │
│              [← 이전] [등록하기]                        │
└─────────────────────────────────────────────────────┘
```

## 4. 코드 매핑 로직

### 4.1 자동 계정/과목 선택

```typescript
function resolveCodeValues(
  type: WizardType,
  orgSecCd: number,
  getAccounts: Function,
  getItems: Function,
): { accSecCd: number; itemSecCd: number } {
  const incmSecCd = type.incmSecCd;

  // 1) 계정 선택
  const accounts = getAccounts(orgSecCd, incmSecCd);
  let accSecCd = accounts[0]?.cv_id || 0;

  if (type.accSecCdName) {
    // 계정명으로 매칭 (수입: "후원회기부금", "보조금" 등)
    const match = accounts.find(a => a.cv_name.includes(type.accSecCdName));
    if (match) accSecCd = match.cv_id;
  }

  // 2) 과목 선택
  const items = getItems(orgSecCd, incmSecCd, accSecCd);
  let itemSecCd = items[0]?.cv_id || 0;

  if (type.itemKeyword) {
    // "선거비용외" 먼저 체크 (더 구체적)
    if (type.itemKeyword.includes("선거비용외")) {
      const match = items.find(i => i.cv_name.includes("선거비용외"));
      if (match) itemSecCd = match.cv_id;
    } else if (type.itemKeyword.includes("선거비용")) {
      const match = items.find(i =>
        i.cv_name.includes("선거비용") && !i.cv_name.includes("선거비용외")
      );
      if (match) itemSecCd = match.cv_id;
    }
  }

  return { accSecCd, itemSecCd };
}
```

### 4.2 키워드 검색 매칭

```typescript
function searchWizardTypes(
  types: WizardType[],
  keyword: string
): WizardType[] {
  if (!keyword.trim()) return types;
  const lower = keyword.toLowerCase();
  return types.filter(t =>
    t.label.includes(lower) ||
    t.description.includes(lower) ||
    t.keywords.some(k => k.includes(lower))
  );
}
```

## 5. 라우팅 및 메뉴

### 5.1 사이드바 메뉴 위치

```typescript
// layout.tsx — 모든 기관 유형의 "정치자금관리" 그룹 최상단에 추가
{ group: "정치자금관리", items: [
  { href: "/dashboard/wizard", label: "간편등록 마법사" },  // ← NEW
  { href: "/dashboard/income", label: "수입내역관리" },
  { href: "/dashboard/expense", label: "지출내역관리" },
  ...
]}
```

### 5.2 document-register 연동

마법사에서 "영수증첨부" 카드 클릭 시:

```typescript
// 지출 탭에서 클릭
router.push("/dashboard/document-register");

// 수입 탭에서 클릭
router.push("/dashboard/document-register?tab=income");
```

document-register 페이지에서 URL 쿼리 파라미터 처리:

```typescript
const searchParams = useSearchParams();
const initialTab = searchParams.get("tab") || "expense";
const [tab, setTab] = useState(initialTab);
```

## 6. 저장 흐름

```text
Step 3 "등록하기" 클릭
  │
  ├── 거래처 미등록? → /api/customers POST (자동 등록)
  │
  ├── /api/acc-book POST (action: "insert")
  │     payload: org_id, incm_sec_cd, acc_sec_cd, item_sec_cd,
  │              cust_id, acc_date, content, acc_amt,
  │              rcp_yn, rcp_no, acc_ins_type,
  │              exp_group1_cd, exp_group2_cd, exp_group3_cd
  │
  ├── 증빙파일 있으면 → /api/evidence-file POST
  │
  └── 성공 → "등록 완료! 추가 등록하시겠습니까?" 
        → [예: Step 1로] [아니요: 수입/지출 내역 페이지로]
```

## 7. 구현 순서

1. `lib/wizard-mappings.ts` — 매핑 데이터 + 유틸 함수
2. `dashboard/wizard/page.tsx` — 3단계 마법사 UI
3. `dashboard/layout.tsx` — 메뉴 추가
4. `dashboard/document-register/page.tsx` — URL 쿼리 파라미터 지원 (tab)

## 8. 구현 제외 (NOT in scope)

- AI 기반 자연어 분류 (키워드 매핑으로 충분)
- 마법사 내 영수증 OCR 직접 구현 (기존 document-register로 라우팅)
- 일괄등록 기능 (기존 batch-import 사용)
- 기존 수입/지출 페이지 UI 변경
- 모바일 전용 레이아웃 (반응형으로 충분)
