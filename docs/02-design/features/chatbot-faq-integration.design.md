# Design: 챗봇 FAQ 통합

> **Feature**: chatbot-faq-integration
> **Plan**: [chatbot-faq-integration.plan.md](../../01-plan/features/chatbot-faq-integration.plan.md)
> **Created**: 2026-03-28
> **Status**: Design

---

## 1. 설계 개요

`political-fund-faq.jsx`의 60+개 FAQ 데이터를 TypeScript 모듈로 변환하고, `ChatBubble.tsx` 내에 카테고리 탐색형 FAQ UI를 구현한다. FAQ 답변은 AI를 거치지 않고 기존 `addMessages` 패턴으로 즉시 대화에 삽입한다.

---

## 2. 파일 변경 목록

| 파일 | 변경 유형 | 설명 |
|------|-----------|------|
| `app/src/lib/chat/faq-data.ts` | **신규** | FAQ 데이터 + 타입 정의 |
| `app/src/components/chat/ChatBubble.tsx` | **수정** | FAQ UI 교체 (4개 → 60+개 카테고리형) |

---

## 3. 데이터 설계

### 3.1 타입 정의 (`faq-data.ts`)

```typescript
export interface FaqItem {
  q: string;
  a: string;
}

export interface FaqSubsection {
  label: string;
  items: FaqItem[];
}

export interface FaqChapter {
  chapter: string;       // "제1장 제I절 · 정치자금 개요"
  shortLabel: string;    // "정치자금 개요" (UI 버튼용 축약)
  color: string;         // "#1a3a5c"
  subsections: FaqSubsection[] | null;
  items: FaqItem[] | null;
}

export const FAQ_DATA: FaqChapter[];
```

### 3.2 데이터 변환 규칙

| 원본 (`political-fund-faq.jsx`) | 변환 (`faq-data.ts`) |
|--------------------------------|----------------------|
| `faqData` 배열 | `FAQ_DATA` export const |
| `chapter` 필드 그대로 | `chapter` + `shortLabel` 추가 |
| `subsections` / `items` 구조 유지 | 동일 |
| `color` 필드 | 유지 (UI 카테고리 색상에 활용) |

### 3.3 shortLabel 매핑

| chapter | shortLabel |
|---------|------------|
| 제1장 제I절 · 정치자금 개요 | 정치자금 개요 |
| 제1장 제II절 · 정치자금 수입·지출 준비 | 수입·지출 준비 |
| 제1장 제III절 · 정치자금 수입 회계처리 | 수입 회계처리 |
| 제1장 제IV절 · 정치자금 지출 회계처리 | 지출 회계처리 |
| 제1장 제V절 · 회계보고 및 열람·사본교부 | 회계보고 |
| 제2장 제I절 · 후원회 제도 | 후원회 제도 |
| 제2장 제II절 · 후원금의 모금·기부 | 후원금 모금·기부 |
| 제3장 제I절 · 선거비용 보전청구 | 보전청구 |
| 제3장 제II절 · 선거비용 보전제한 및 반환 | 보전제한·반환 |

---

## 4. UI 설계

### 4.1 화면 상태 (State Machine)

```
┌──────────────────────────────────────┐
│  messages.length === 0               │
│                                      │
│  ┌─ faqView 상태 ──────────────────┐ │
│  │                                  │ │
│  │  "categories"                    │ │
│  │    장/절 카테고리 버튼 목록       │ │
│  │    + AI 질문 예시 (QUICK_ACTIONS)│ │
│  │         │                        │ │
│  │    카테고리 클릭                  │ │
│  │         ↓                        │ │
│  │  "items"                         │ │
│  │    선택된 장의 Q&A 목록           │ │
│  │    + 뒤로가기 버튼               │ │
│  │         │                        │ │
│  │    Q&A 클릭                      │ │
│  │         ↓                        │ │
│  │  addMessages → messages > 0      │ │
│  │  → 일반 대화 화면으로 전환        │ │
│  │                                  │ │
│  └──────────────────────────────────┘ │
│                                      │
│  messages.length > 0                 │
│    일반 대화 화면 (기존 그대로)       │
│    대화 초기화 → faqView 리셋        │
└──────────────────────────────────────┘
```

### 4.2 컴포넌트 내부 상태

```typescript
// ChatBubble.tsx 내부 state 추가
const [faqView, setFaqView] = useState<"categories" | "items">("categories");
const [selectedChapter, setSelectedChapter] = useState<number | null>(null);
```

> 별도 컴포넌트 파일 분리 없이, `ChatBubble.tsx` 내 인라인으로 구현한다.
> 이유: 현재 ChatBubble이 단일 파일 컴포넌트이며, FAQ UI는 초기 화면에서만 표시되는 간단한 조건부 렌더링이므로 분리의 이점이 적다.

### 4.3 카테고리 화면 (faqView === "categories")

```
┌──────────────────────────────┐
│ 정치자금 회계처리에 대해       │
│ 질문해 보세요.                │
│                              │
│ ── 자주 묻는 질문 ──          │
│ ┌──────────┐┌──────────┐     │
│ │정치자금   ││수입·지출  │     │
│ │개요      ││준비      │     │
│ └──────────┘└──────────┘     │
│ ┌──────────┐┌──────────┐     │
│ │수입      ││지출      │     │
│ │회계처리   ││회계처리   │     │
│ └──────────┘└──────────┘     │
│ ┌──────────┐┌──────────┐     │
│ │회계보고   ││후원회    │     │
│ │          ││제도      │     │
│ └──────────┘└──────────┘     │
│ ┌──────────┐┌──────────┐     │
│ │후원금    ││보전청구   │     │
│ │모금·기부  ││          │     │
│ └──────────┘└──────────┘     │
│ ┌──────────┐                 │
│ │보전제한   │                 │
│ │·반환     │                 │
│ └──────────┘                 │
│                              │
│ ── AI에게 질문하기 ──         │
│ ┌──────────┐┌──────────┐     │
│ │현수막    ││수당·실비  │     │
│ │비용 보전  ││기준      │     │
│ └──────────┘└──────────┘     │
│ ┌──────────┐┌──────────┐     │
│ │증빙서번호 ││우리 기관  │     │
│ │규칙      ││지출 현황  │     │
│ └──────────┘└──────────┘     │
└──────────────────────────────┘
```

**카테고리 버튼 스타일:**
- 2열 그리드 (`grid grid-cols-2 gap-2`)
- 각 장의 `color`를 `border-left` 또는 배경 틴트로 사용
- 각 버튼에 Q&A 개수 배지 표시 (예: `6개`)

### 4.4 Q&A 목록 화면 (faqView === "items")

```
┌──────────────────────────────┐
│ ← 뒤로  │ 지출 회계처리      │
│──────────────────────────────│
│                              │
│ [subsection이 있는 경우]      │
│ ── 1. 지출처리 회계원칙 ──    │
│ ┌────────────────────────┐   │
│ │ 정치자금 지출의 기본     │   │
│ │ 원칙은 무엇인가요?      │   │
│ └────────────────────────┘   │
│ ┌────────────────────────┐   │
│ │ 회계사무보조자에게 지출을 │   │
│ │ 위임할 수 있나요?       │   │
│ └────────────────────────┘   │
│ ...                          │
│                              │
│ ── 2. 신분에 따른 지출 범위 ──│
│ ┌────────────────────────┐   │
│ │ (예비)후보자가 직접      │   │
│ │ 경비를 지출할 수 있나요?  │   │
│ └────────────────────────┘   │
│ ...                          │
│                              │
│ [subsection이 없는 경우]      │
│ 질문 버튼 직접 나열           │
└──────────────────────────────┘
```

**Q&A 버튼 스타일:**
- 단일 열 풀 너비 (`flex flex-col gap-1.5`)
- 기존 FAQ 버튼 스타일 유지 (emerald 테두리)
- subsection이 있으면 라벨 헤더로 구분

### 4.5 Q&A 클릭 시 동작

```typescript
function handleFaqItem(item: FaqItem) {
  // 기존 handleFaq 패턴과 동일
  addMessages([
    { role: "user", content: item.q },
    { role: "assistant", content: item.a },
  ]);
  // faqView 리셋 (대화가 생겼으므로 자동으로 대화 화면 전환)
}
```

FAQ 답변은 plain text이므로, `ReactMarkdown`이 아닌 일반 `<p>` 태그로 렌더링된다 (기존 assistant 메시지 렌더링 로직이 자동 처리).

---

## 5. 구현 순서

| 순서 | 작업 | 파일 | 의존성 |
|------|------|------|--------|
| 1 | FAQ 타입 + 데이터 모듈 생성 | `app/src/lib/chat/faq-data.ts` | 없음 |
| 2 | ChatBubble에 state 추가 | `ChatBubble.tsx` | #1 |
| 3 | 카테고리 화면 렌더링 | `ChatBubble.tsx` | #2 |
| 4 | Q&A 목록 화면 렌더링 | `ChatBubble.tsx` | #3 |
| 5 | Q&A 클릭 → 대화 삽입 연결 | `ChatBubble.tsx` | #4 |
| 6 | 기존 FAQ_ITEMS 제거 + QUICK_ACTIONS 유지 | `ChatBubble.tsx` | #5 |
| 7 | 대화 초기화 시 faqView 리셋 | `ChatBubble.tsx` | #6 |

---

## 6. 기존 코드 영향 분석

| 파일 | 영향 | 설명 |
|------|------|------|
| `ChatBubble.tsx` | 직접 수정 | FAQ_ITEMS 제거, 카테고리형 UI 추가 |
| `use-chat.ts` | 변경 없음 | `addMessages` 인터페이스 그대로 사용 |
| `api/chat/route.ts` | 변경 없음 | AI 질문 흐름 변경 없음 |
| `lib/chat/election-cost-guide.ts` | 변경 없음 | RAG 시스템 프롬프트용 데이터 |
| `lib/chat/sample-accounting-data.ts` | 변경 없음 | RAG 시스템 프롬프트용 데이터 |

---

## 7. 검증 기준

| # | 항목 | 검증 방법 |
|---|------|-----------|
| V-01 | FAQ 데이터 모듈이 정상 export | TypeScript 컴파일 에러 없음 |
| V-02 | 카테고리 화면에 9개 장 모두 표시 | 화면 확인 |
| V-03 | 카테고리 클릭 → 해당 Q&A 목록 표시 | 화면 확인 |
| V-04 | Q&A 클릭 → 대화에 Q&A 삽입 | 화면 확인 |
| V-05 | 뒤로가기 → 카테고리 목록 복귀 | 화면 확인 |
| V-06 | AI 질문 예시 (QUICK_ACTIONS) 정상 동작 | 화면 확인 |
| V-07 | 직접 입력 → AI 응답 스트리밍 정상 | API 호출 확인 |
| V-08 | 대화 초기화 → FAQ 카테고리 다시 표시 | 화면 확인 |
| V-09 | `npm run build` 성공 | 빌드 에러 없음 |
