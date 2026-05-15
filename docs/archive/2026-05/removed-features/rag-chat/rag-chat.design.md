# Design: 선거회계처리 AI 채팅 + 키워드 RAG 구현

> **Feature**: rag-chat
> **Plan Reference**: `docs/01-plan/features/rag-chat.plan.md`
> **Created**: 2026-03-25
> **Updated**: 2026-04-14 (디자인-구현 동기화)
> **Status**: Implemented

---

## 설계 변경 이력

| 일자 | 변경 내용 | 사유 |
|------|----------|------|
| 2026-03-25 | 초기 설계: Anthropic Claude + OpenAI 임베딩 + pgvector | - |
| 2026-04-06 | Gemini 2.5 Flash + 키워드 검색으로 전환 | 단일 API 의존성(Gemini), 비용 절감, pgvector 불필요 |
| 2026-04-14 | 디자인 문서를 현 구현에 맞게 재작성 | Gap Analysis 75% → 동기화 |

---

## 1. 데이터베이스 스키마

### 1.1 Supabase pgvector (임베딩 업로드용, 런타임 미사용)

pgvector 확장 및 `rag_documents` 테이블은 오프라인 임베딩 업로드(`rag-upload.mjs`)용으로 유지됨.
런타임 Chat API에서는 사용하지 않음 (향후 시맨틱 검색 도입 시 활용 가능).

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE rag_documents (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  content TEXT NOT NULL,
  embedding VECTOR(1536),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON rag_documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX ON rag_documents USING gin (metadata);

-- match_documents RPC — 향후 시맨틱 검색 시 사용
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding VECTOR(1536),
  match_count INT DEFAULT 5,
  filter JSONB DEFAULT '{}'
)
RETURNS TABLE (id BIGINT, content TEXT, metadata JSONB, similarity FLOAT)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT rd.id, rd.content, rd.metadata,
         1 - (rd.embedding <=> query_embedding) AS similarity
  FROM rag_documents rd
  WHERE (filter = '{}' OR rd.metadata @> filter)
  ORDER BY rd.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

### 1.2 metadata 구조

```json
{
  "source": "도움말",
  "file": "정치자금회계관리프로그램_도움말.pdf",
  "page": 23,
  "section": "수입내역관리",
  "category": "income"
}
```

### 1.3 category 분류 체계

| category | 설명 | 대상 문서 |
|----------|------|---------|
| `income` | 수입 관련 | 수입내역, 후원금, 한도액 |
| `expense` | 지출 관련 | 지출내역, 선거비용, 지출유형 |
| `estate` | 재산 관련 | 재산명세서, 결산 |
| `report` | 보고/제출 관련 | 회계보고서, 감사의견서, 제출파일 |
| `law` | 법률/규칙 | 정치자금법, 사무관리규칙 |
| `form` | 서식 관련 | 서식 작성법, 신고서 |
| `general` | 일반/기타 | 프로그램 사용법, 로그인 등 |

---

## 2. 임베딩 파이프라인 (오프라인)

### 2.1 스크립트 구조

```
app/scripts/
└── rag-upload.mjs    # TS 가이드 텍스트 → Gemini 임베딩 → Supabase 저장
```

> 초기 설계의 `rag-embed.mjs`, `rag-extract-pdf.mjs`, `rag-chunk.mjs` 3-파일 구조에서
> `rag-upload.mjs` 단일 파일로 통합됨.

### 2.2 처리 흐름

```
1. lib/chat/ 내 TS 가이드 파일에서 텍스트 추출 (template literal)
2. ## 기준으로 섹션 분할, 800자 청크 제한
3. Contextual Retrieval: 각 청크에 문맥 요약 추가 (Gemini 2.0 Flash)
4. Gemini embedding-2-preview로 임베딩 생성 (1536차원)
5. Supabase rag_documents에 INSERT
```

### 2.3 환경변수

```env
GEMINI_API_KEY=...              # Gemini 임베딩 + 문맥 생성
SUPABASE_SERVICE_ROLE_KEY=...   # DB 쓰기
```

---

## 3. API 설계

### 3.1 POST `/api/chat/route.ts`

```typescript
// Vercel serverless 타임아웃 확장
export const maxDuration = 60;

// Request
interface ChatRequest {
  message: string;          // 최대 2000자
  context?: {
    currentPage?: string;   // 현재 페이지 경로
    orgType?: string;       // 사용기관 유형
    orgId?: number;         // 기관 ID (회계 데이터 조회용)
    orgName?: string;       // 기관명
  };
  history?: Array<{         // 이전 대화 (멀티턴)
    role: "user" | "assistant";
    content: string;
  }>;
}

// Response: text/event-stream (SSE)
// data: {"type":"text","content":"답변 텍스트..."}
// data: [DONE]
```

#### 처리 흐름

```
1. 요청 파싱 (message, context, history)
2. 입력 검증: message 필수 + 2000자 제한
3. 회계 데이터 조회 (Supabase RPC calculate_balance + acc_book)
4. 키워드 기반 관련 섹션 추출 (SECTION_KEYWORDS 매핑)
   - election-cost-guide에서 관련 섹션 추출
   - sample-accounting-data에서 관련 섹션 추출
5. Gemini 2.5 Flash 채팅 API 호출 (스트리밍)
   - 시스템 프롬프트 + 회계 데이터 + 관련 가이드 + 사용자 질문
6. SSE로 실시간 텍스트 전달
7. [DONE] 시그널로 종료
```

#### 키워드 검색 방식 (SECTION_KEYWORDS)

```typescript
// 질문의 키워드 → 관련 법조항/섹션 패턴 매핑
const SECTION_KEYWORDS: Record<string, string[]> = {
  "기탁금": ["제56조", "제60조의2", "기탁금"],
  "사무소|월세|임차|...": ["제60조의3.*선거사무소", "사무소 관련"],
  "수당|실비|식사|...": ["수당.*실비", "제135조"],
  // ... 20+ 키워드 그룹
};

// 전체 가이드 텍스트를 ## 기준으로 분할 후
// 매칭된 패턴이 포함된 섹션만 추출 (최대 3개, 각 2000자)
```

#### 시스템 프롬프트

```
당신은 정치자금 회계관리 프로그램의 AI 도우미입니다.
아래 제공되는 자료를 근거로 답변하세요.

답변 규칙:
1. 제공된 자료에 근거하여 정확하게 답변하세요.
2. 과목 분류, 보전 여부, 관련 법조항을 함께 안내하세요.
3. 답변은 간결하게 작성하세요. 빈 줄을 반복하지 마세요.
4. 표는 5행 이내로 핵심만 정리하세요.
5. 자료에 없는 내용은 "관할 선거관리위원회에 문의하세요"라고 안내하세요.
6. 한국어로 답변하세요.

⚠ 이 답변은 참고용이며, 실제 회계 처리는 관할 선거관리위원회에 확인하세요.
```

#### 회계 데이터 컨텍스트 (`fetchAccountingContext`)

```
- Supabase RPC calculate_balance로 기관별 수입/지출/잔액 요약
- acc_book에서 지출 내역 최대 30건 조회
- 코드값 매핑 (codevalue → 과목명, 항목명)
- 결과를 텍스트로 변환하여 LLM 컨텍스트에 포함
```

---

## 4. 컴포넌트 설계

### 4.1 파일 구조 (인라인 통합)

```
app/src/
├── components/
│   └── chat/
│       ├── ChatBubble.tsx      # 플로팅 버튼 + 채팅 패널 + FAQ 브라우저 (통합)
│       └── ChatBubble.test.tsx # 테스트 (329줄, FAQ/AI/UX 포괄)
├── hooks/
│   └── use-chat.ts             # 채팅 상태 관리 훅
└── lib/
    └── chat/
        ├── faq-data.ts                # FAQ 데이터 (9개 장, 계층 구조)
        ├── election-cost-guide.ts     # 선거비용 가이드 (키워드 RAG 소스)
        ├── sample-accounting-data.ts  # 샘플 회계 데이터
        └── receipt-naming-rules.ts    # 증빙서번호 네이밍 규칙
```

> 초기 설계의 6개 파일 분리(ChatPanel, ChatMessage, ChatInput, ChatSources, QuickActions)에서
> ChatBubble.tsx 단일 파일 통합으로 변경. chatbot-faq-integration 설계에서 의도적 결정.

### 4.2 ChatBubble 컴포넌트

```tsx
// 위치: 화면 우하단 고정 (fixed bottom-6 right-6)
// 구조: 플로팅 버튼 → 채팅 패널 → FAQ 브라우저 + AI 채팅
//
// ┌──────────────────┐
// │ 헤더 (제목 + 닫기) │
// ├──────────────────┤
// │ FAQ 카테고리       │  ← 3단계 네비게이션 (장 → 절 → Q&A)
// │ (접기/펼치기)      │  ← 메시지 존재 시 접기 가능
// ├──────────────────┤
// │ 메시지 목록        │  ← FAQ 답변 + AI 스트리밍 답변
// │  (markdown 렌더링) │
// ├──────────────────┤
// │ 입력란 + 전송      │  ← 하단 고정
// │ 면책 안내          │  ← "AI 참고용 답변" 배너
// └──────────────────┘

기능:
- FAQ 중복 방지: 동일 FAQ 재클릭 시 스크롤 + ring-yellow-400 하이라이트 (1.5초)
- FAQ 접기/펼치기: 대화 시작 후 FAQ 영역 toggle
- 3단계 네비게이션: chapters → subsections → items
- 메시지 source 구분: "faq" | "user"
```

### 4.3 use-chat 훅

```typescript
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  source?: "faq" | "user";     // FAQ vs 직접 입력 구분
}

interface UseChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (message: string) => Promise<void>;
  clearMessages: () => void;
  addMessages: (msgs: ChatMessage[]) => void;  // FAQ 대화 삽입용
}
```

---

## 5. SSE 스트리밍 구현

### 5.1 서버 (API Route)

```typescript
export async function POST(request: NextRequest) {
  const { message, context, history } = await request.json();

  // 1. 입력 검증
  if (!message || typeof message !== "string") return 400;
  if (message.length > 2000) return 400;

  // 2. 회계 데이터 + 키워드 검색
  const accountingContext = await fetchAccountingContext(context?.orgId);
  const relevantGuide = extractRelevantSections(message, ELECTION_COST_GUIDE);
  const relevantSample = extractRelevantSections(message, SAMPLE_ACCOUNTING_DATA);

  // 3. Gemini 2.5 Flash 스트리밍
  const chatModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const chat = chatModel.startChat({
    history: chatHistory,
    generationConfig: { maxOutputTokens: 2048, temperature: 0.3 },
  });
  const result = await chat.sendMessageStream(fullPrompt);

  // 4. SSE 응답
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({type:"text", content: text})}\n\n`)
          );
        }
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
```

### 5.2 클라이언트 (SSE 파싱)

```typescript
// use-chat.ts — ReadableStream reader로 SSE 파싱
const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value);
  const lines = chunk.split("\n").filter(l => l.startsWith("data: "));
  for (const line of lines) {
    const data = line.slice(6);
    if (data === "[DONE]") break;
    const parsed = JSON.parse(data);
    if (parsed.type === "text") {
      fullContent += parsed.content;
      // 실시간 메시지 업데이트
    }
  }
}
```

---

## 6. 의존성

### 6.1 패키지

```bash
# 현재 사용 중
npm install @google/generative-ai react-markdown remark-gfm
```

### 6.2 환경변수

```env
GEMINI_API_KEY=...                     # Gemini 2.5 Flash (채팅) + embedding-2-preview (임베딩)
NEXT_PUBLIC_SUPABASE_URL=...           # Supabase
SUPABASE_SERVICE_ROLE_KEY=...          # 서버 전용 (RLS bypass)
```

---

## 7. 대시보드 통합

### 7.1 레이아웃 (`dashboard/layout.tsx`)

```tsx
<main>{children}</main>
<ChatBubble />  // 모든 대시보드 페이지에 표시
```

### 7.2 맥락 전달

```typescript
// ChatBubble에서 Zustand auth store의 orgId, orgName, orgType 사용
// use-chat 훅에 context로 전달
```

---

## 8. FAQ 데이터 (chatbot-faq-integration)

```typescript
// lib/chat/faq-data.ts
interface FaqItem { q: string; a: string; }
interface FaqSubsection { label: string; items: FaqItem[]; }
interface FaqChapter {
  label: string;
  items?: FaqItem[];
  subsections?: FaqSubsection[];
}

// 9개 장 구조: 프로그램 기본, 기관 관리, 수입 관리, 지출 관리, ...
export const FAQ_DATA: FaqChapter[] = [...];
```

---

## 9. 구현 순서

| 순서 | 파일 | 설명 | 상태 |
|------|------|------|:----:|
| 1 | `scripts/rag-upload.mjs` | TS 가이드 → Gemini 임베딩 → Supabase 저장 | ✅ |
| 2 | Supabase SQL | pgvector 확장 + 테이블 + RPC | ✅ |
| 3 | `lib/chat/*.ts` | FAQ 데이터 + 가이드 + 샘플 데이터 | ✅ |
| 4 | `hooks/use-chat.ts` | 채팅 상태 관리 훅 | ✅ |
| 5 | `app/api/chat/route.ts` | Chat API (키워드 검색 + Gemini SSE) | ✅ |
| 6 | `components/chat/ChatBubble.tsx` | 통합 컴포넌트 (FAQ + AI) | ✅ |
| 7 | `dashboard/layout.tsx` 수정 | ChatBubble 통합 | ✅ |
| 8 | 테스트 | ChatBubble.test.tsx (329줄) | ✅ |

---

## 10. 보안 고려사항

| 항목 | 대응 | 상태 |
|------|------|:----:|
| API 키 노출 | GEMINI_API_KEY는 서버사이드 전용 (NEXT_PUBLIC_ 접두사 없음) | ✅ |
| 입력 검증 | message 길이 제한 (2000자) | ✅ |
| Rate Limiting | 미구현 — 향후 @upstash/ratelimit 또는 미들웨어 도입 검토 | ⏳ |
| XSS 방지 | ReactMarkdown이 raw HTML을 렌더링하지 않음 | ✅ |
| 비용 관리 | maxOutputTokens: 2048, 키워드 검색으로 임베딩 API 호출 없음 | ✅ |
| 면책 | "AI 참고용 답변입니다. 중요 사항은 선관위에 확인하세요." 표시 | ✅ |

---

## 11. 향후 개선 계획

| 항목 | 설명 | 우선순위 |
|------|------|:------:|
| 시맨틱 검색 전환 | pgvector match_documents RPC를 런타임에서 활용 | Low |
| Rate Limiting | IP/사용자별 요청 제한 | Medium |
| 출처 표시 | 답변에 참고 법조항/페이지 출처 SSE 전송 | Low |
| QUICK_ACTIONS | AI 질문 예시 버튼 재도입 | Low |
