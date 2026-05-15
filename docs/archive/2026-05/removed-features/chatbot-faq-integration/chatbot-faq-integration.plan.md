# Plan: 챗봇 FAQ 통합 - political-fund-faq 데이터를 채팅창에 연결

> **Feature**: chatbot-faq-integration
> **Created**: 2026-03-28
> **Status**: Plan

---

## Executive Summary

| 관점 | 내용 |
|------|------|
| **Problem** | `political-fund-faq.jsx`에 60+개의 체계적인 FAQ(8개 장/절, 서브섹션 포함)가 있지만, 챗봇 `ChatBubble.tsx`의 FAQ는 4개 항목만 하드코딩되어 있어 방대한 FAQ 자원이 활용되지 못하고 있음 |
| **Solution** | `political-fund-faq.jsx`의 `faqData` 구조를 챗봇에서 사용할 수 있는 데이터 모듈로 분리하고, 챗봇 채팅창에 장/절별 FAQ 탐색 UI를 제공하여 AI 호출 없이 즉시 답변 표시 |
| **Function UX Effect** | 채팅 버블 클릭 → 초기 화면에 장/절별 FAQ 카테고리 표시 → 카테고리 선택 시 해당 Q&A 목록 → 질문 클릭 시 저장된 답변 즉시 표시 (AI 미경유) |
| **Core Value** | 60+개 FAQ를 통해 AI 호출 비용 없이 대부분의 회계 실무 질문에 즉시 답변. 사용자 경험 향상 + API 비용 절감 |

---

## 1. 배경 및 목적

### 1.1 현재 문제
- `RAG/political-fund-faq.jsx`에 8개 장/절, 60+개 Q&A가 체계적으로 정리되어 있음
- 현재 `ChatBubble.tsx`에는 4개의 FAQ만 하드코딩 (`FAQ_ITEMS` 상수)
- 나머지 56+개의 FAQ 자원이 챗봇에서 전혀 활용되지 않음
- 사용자가 간단한 질문도 AI에게 보내야 하므로 응답 지연 + API 비용 발생

### 1.2 목표
1. `political-fund-faq.jsx`의 전체 FAQ 데이터를 챗봇에서 활용
2. 장/절별 카테고리 탐색 UI를 통해 직관적으로 FAQ 접근
3. FAQ 답변은 AI를 거치지 않고 즉시 표시 (기존 `handleFaq` 패턴 유지)
4. 기존 AI 질문 기능(QUICK_ACTIONS, 직접 입력)은 그대로 유지

### 1.3 범위
- **포함**: FAQ 데이터 모듈 분리, 챗봇 UI에 카테고리형 FAQ 표시, 기존 FAQ 교체
- **제외**: FAQ 데이터 자체의 수정/추가, RAG 벡터DB 변경, API 라우트 변경

---

## 2. 기능 요구사항

### FR-01: FAQ 데이터 모듈화
- `political-fund-faq.jsx`의 `faqData` 배열을 TypeScript 데이터 모듈로 분리
- 장(chapter) → 절(subsection, optional) → Q&A(items) 계층 구조 유지
- 타입 정의: `FaqChapter`, `FaqSubsection`, `FaqItem`

### FR-02: 카테고리형 FAQ UI
- 초기 화면에 장/절별 카테고리 버튼 표시 (아코디언 또는 탭 형태)
- 카테고리 선택 시 해당 Q&A 목록 표시
- Q&A 클릭 시 `addMessages`를 통해 대화에 삽입 (기존 패턴)
- "전체 FAQ 보기" / "뒤로가기" 네비게이션

### FR-03: 기존 기능 호환
- 기존 4개 FAQ 항목은 새 데이터로 대체
- QUICK_ACTIONS (AI 질문 예시)는 그대로 유지
- 직접 입력 → AI 응답 흐름 변경 없음

### FR-04: FAQ 검색 (선택사항)
- FAQ 내 키워드 검색 기능 (faqData의 q/a 필드 대상)
- 검색 결과 클릭 시 즉시 답변 표시

---

## 3. 기술 설계 방향

### 3.1 데이터 구조
```typescript
// app/src/lib/chat/faq-data.ts
interface FaqItem {
  q: string;  // 질문
  a: string;  // 답변
}

interface FaqSubsection {
  label: string;
  items: FaqItem[];
}

interface FaqChapter {
  chapter: string;
  color: string;
  subsections: FaqSubsection[] | null;
  items: FaqItem[] | null;  // subsections가 없을 때
}

export const faqData: FaqChapter[] = [ ... ];
```

### 3.2 컴포넌트 구조
```
ChatBubble.tsx
  ├── FaqCategoryList (장/절 카테고리 목록)
  │   ├── FaqChapterButton (장 버튼)
  │   └── FaqItemList (Q&A 목록)
  │       └── FaqItemButton (개별 Q&A 버튼)
  ├── QuickActions (AI 질문 예시 - 기존 유지)
  └── MessageList (대화 내역 - 기존 유지)
```

### 3.3 상호작용 흐름
1. 채팅 열림 → 메시지 없으면 FAQ 카테고리 + AI 질문 표시
2. 카테고리 클릭 → 해당 장의 Q&A 목록 표시
3. Q&A 클릭 → `addMessages([user: q, assistant: a])` → 대화에 삽입
4. "뒤로" 클릭 → 카테고리 목록으로 복귀
5. 대화 초기화 → 다시 FAQ 카테고리 표시

---

## 4. 작업 항목

| # | 작업 | 우선순위 | 예상 복잡도 |
|---|------|----------|-------------|
| 1 | `faqData`를 TypeScript 데이터 모듈로 변환 (`app/src/lib/chat/faq-data.ts`) | P0 | 낮음 |
| 2 | FAQ 타입 정의 추가 | P0 | 낮음 |
| 3 | `ChatBubble.tsx`에 카테고리형 FAQ UI 구현 | P0 | 중간 |
| 4 | 기존 `FAQ_ITEMS` 상수를 새 데이터로 교체 | P0 | 낮음 |
| 5 | FAQ 내 검색 기능 (선택사항) | P1 | 중간 |

---

## 5. 제약사항 및 리스크

### 5.1 제약사항
- 60+개 FAQ 데이터가 클라이언트 번들에 포함됨 (약 30-40KB 텍스트)
- 채팅 패널 크기(w-96, h-[70vh])에서 카테고리 + Q&A 탐색이 편해야 함

### 5.2 리스크
| 리스크 | 영향 | 대응 |
|--------|------|------|
| FAQ 데이터 크기로 초기 로딩 지연 | 낮음 | 동적 import 또는 lazy loading 적용 가능 |
| 챗봇 UI 공간 부족 | 중간 | 스크롤 + 아코디언 패턴으로 해결 |
| FAQ 답변이 마크다운이 아닌 plain text | 낮음 | ReactMarkdown이 이미 적용되어 있어 포맷팅 가능 |

---

## 6. 성공 기준

- [ ] `political-fund-faq.jsx`의 전체 FAQ가 챗봇에서 접근 가능
- [ ] 카테고리 선택 → Q&A 선택 → 즉시 답변 표시 (AI 미경유)
- [ ] 기존 AI 질문/직접 입력 기능 정상 동작
- [ ] 대화 초기화 후 FAQ 카테고리 다시 표시
