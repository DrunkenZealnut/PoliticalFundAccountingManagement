# Design: 선거회계처리 RAG 구축 및 채팅 UI 구현

> **Feature**: rag-chat
> **Plan Reference**: `docs/01-plan/features/rag-chat.plan.md`
> **Created**: 2026-03-25
> **Status**: Design

---

## 1. 데이터베이스 스키마

### 1.1 Supabase pgvector 설정

```sql
-- pgvector 확장 활성화 (Supabase Dashboard → SQL Editor)
CREATE EXTENSION IF NOT EXISTS vector;

-- RAG 문서 청크 테이블
CREATE TABLE rag_documents (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  content TEXT NOT NULL,                    -- 청크 텍스트 (500~800자)
  embedding VECTOR(1536),                   -- OpenAI text-embedding-3-small
  metadata JSONB DEFAULT '{}',              -- { source, page, section, category }
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 벡터 유사도 검색 인덱스
CREATE INDEX ON rag_documents
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- 메타데이터 검색용 인덱스
CREATE INDEX ON rag_documents USING gin (metadata);

-- 유사도 검색 RPC 함수
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding VECTOR(1536),
  match_count INT DEFAULT 5,
  filter JSONB DEFAULT '{}'
)
RETURNS TABLE (
  id BIGINT,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    rd.id,
    rd.content,
    rd.metadata,
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
  "source": "도움말",                    // 문서명
  "file": "정치자금회계관리프로그램_도움말.pdf",
  "page": 23,                           // 페이지 번호
  "section": "수입내역관리",              // 섹션명
  "category": "income"                   // 분류: income, expense, estate, report, law, form
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

## 2. 임베딩 파이프라인

### 2.1 스크립트 구조

```
app/scripts/
├── rag-embed.mjs           # 메인 임베딩 스크립트
├── rag-extract-pdf.mjs     # PDF → 텍스트 추출
└── rag-chunk.mjs           # 텍스트 → 청크 분할
```

### 2.2 PDF 텍스트 추출 (`rag-extract-pdf.mjs`)

```javascript
// 의존성: pdf-parse
// 입력: PDF 파일 경로
// 출력: { text, pages: [{page, text}] }

처리 흐름:
1. pdf-parse로 PDF 읽기
2. 페이지별 텍스트 추출
3. 한국어 특수문자/줄바꿈 정리
4. 페이지 번호 매핑 유지
```

### 2.3 청크 분할 전략 (`rag-chunk.mjs`)

```
청크 크기: 600자 (한국어 기준)
오버랩: 100자
분할 기준:
  1순위: 빈 줄 (문단 경계)
  2순위: 마침표 + 줄바꿈
  3순위: 고정 길이 분할 (fallback)

각 청크에 metadata 부여:
  - source: 문서명
  - page: 해당 페이지
  - section: 가장 가까운 상위 제목
  - category: 키워드 기반 자동 분류
```

### 2.4 임베딩 생성 + 저장 (`rag-embed.mjs`)

```
처리 흐름:
1. 대상 PDF 목록 설정
2. 각 PDF → 텍스트 추출 → 청크 분할
3. OpenAI API로 배치 임베딩 (50개씩)
4. Supabase rag_documents에 INSERT
5. 결과 리포트 출력 (문서별 청크 수, 총 토큰 수)

실행: node scripts/rag-embed.mjs
환경변수: OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY
```

---

## 3. API 설계

### 3.1 POST `/api/chat/route.ts`

```typescript
// Request
interface ChatRequest {
  message: string;
  context?: {
    currentPage: string;      // 현재 페이지 경로
    orgType: string;          // 사용기관 유형
  };
  history?: Array<{           // 이전 대화 (멀티턴)
    role: "user" | "assistant";
    content: string;
  }>;
}

// Response: text/event-stream (SSE)
// data: {"type":"text","content":"답변 텍스트..."}
// data: {"type":"sources","sources":[{title,page,snippet,similarity}]}
// data: [DONE]
```

#### 처리 흐름

```
1. 요청 파싱 (message, context, history)
2. 질문 임베딩 생성 (OpenAI text-embedding-3-small)
3. Supabase match_documents RPC 호출 (top-5)
4. 시스템 프롬프트 구성:
   - 역할: 정치자금 회계 전문가
   - 지시: 검색된 문서만 기반으로 답변
   - 맥락: 현재 페이지 정보
   - 검색 결과: 관련 문서 청크 5개
5. Anthropic Claude API 호출 (스트리밍)
6. SSE로 실시간 전달
7. 마지막에 출처 정보 전송
```

#### 시스템 프롬프트

```
당신은 중앙선거관리위원회의 정치자금 회계 전문 상담사입니다.
다음 참고 자료를 기반으로 정확하게 답변해 주세요.

규칙:
1. 참고 자료에 있는 내용만으로 답변하세요.
2. 확실하지 않은 내용은 "확인이 필요합니다"라고 안내하세요.
3. 법률 조문을 인용할 때는 정확한 조항을 명시하세요.
4. 금액, 기한 등 숫자 정보는 정확하게 전달하세요.
5. 답변 마지막에 관련 법조문이나 참고 페이지를 안내하세요.

현재 사용자 환경:
- 페이지: {currentPage}
- 기관유형: {orgType}

참고 자료:
---
{검색된 문서 청크 1~5}
---
```

### 3.2 POST `/api/rag/embed/route.ts` (관리자 전용)

```typescript
// 문서 임베딩 API (수동 트리거)
// 보안: SUPABASE_SERVICE_ROLE_KEY 필요

interface EmbedRequest {
  documents: Array<{
    content: string;
    metadata: Record<string, unknown>;
  }>;
}
```

---

## 4. 컴포넌트 설계

### 4.1 파일 구조

```
app/src/
├── components/
│   ├── chat/
│   │   ├── ChatBubble.tsx      # 우하단 플로팅 버튼
│   │   ├── ChatPanel.tsx       # 채팅 패널 (메인)
│   │   ├── ChatMessage.tsx     # 개별 메시지 렌더링
│   │   ├── ChatInput.tsx       # 입력란 + 전송 버튼
│   │   ├── ChatSources.tsx     # 출처 표시 컴포넌트
│   │   └── QuickActions.tsx    # 자주 묻는 질문 버튼들
│   └── ...
├── hooks/
│   └── use-chat.ts             # 채팅 상태 관리 훅
└── app/
    └── api/
        ├── chat/
        │   └── route.ts        # 채팅 API (SSE)
        └── rag/
            └── embed/
                └── route.ts    # 임베딩 API
```

### 4.2 ChatBubble 컴포넌트

```tsx
// 위치: 화면 우하단 고정 (fixed bottom-6 right-6)
// 크기: 56x56px 원형 버튼
// 아이콘: 💬 또는 MessageCircle (lucide)
// 클릭: ChatPanel 토글
// z-index: 50 (다른 UI 위에)

상태:
- isOpen: boolean → ChatPanel 표시 여부
- hasUnread: boolean → 뱃지 표시
```

### 4.3 ChatPanel 컴포넌트

```tsx
// 위치: 우측 사이드 패널 (width: 400px, height: 70vh)
// 애니메이션: 우측에서 슬라이드 인/아웃
// 구조:
//   ┌──────────────────┐
//   │ 헤더 (제목 + 닫기) │
//   ├──────────────────┤
//   │ QuickActions      │  ← 대화 없을 때만 표시
//   ├──────────────────┤
//   │ 메시지 목록        │  ← 스크롤 영역
//   │  ChatMessage[]    │
//   ├──────────────────┤
//   │ ChatInput         │  ← 하단 고정
//   └──────────────────┘

상태:
- messages: Array<{role, content, sources?}>
- isLoading: boolean
- error: string | null
```

### 4.4 ChatMessage 컴포넌트

```tsx
// 사용자 메시지: 우측 정렬, 파란 배경
// 어시스턴트 메시지: 좌측 정렬, 흰 배경
// 마크다운 렌더링: react-markdown + remark-gfm
// 스트리밍 중: 커서 깜빡임 애니메이션
// 출처: ChatSources 컴포넌트 (접기/펼치기)

props:
- role: "user" | "assistant"
- content: string
- sources?: Array<{title, page, snippet}>
- isStreaming?: boolean
```

### 4.5 use-chat 훅

```typescript
interface UseChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (message: string) => Promise<void>;
  clearMessages: () => void;
}

function useChat(context?: ChatContext): UseChatReturn {
  // 1. messages 상태 관리 (useState)
  // 2. sendMessage:
  //    a. user 메시지 추가
  //    b. fetch("/api/chat", { method: "POST", body: ... })
  //    c. SSE 스트림 파싱 (EventSource 또는 ReadableStream)
  //    d. 실시간으로 assistant 메시지 업데이트
  //    e. sources 수신 시 메시지에 추가
  // 3. 에러 핸들링
}
```

---

## 5. SSE 스트리밍 구현

### 5.1 서버 (API Route)

```typescript
// app/api/chat/route.ts

export async function POST(request: NextRequest) {
  const { message, context, history } = await request.json();

  // 1. 임베딩 생성
  const embedding = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: message,
  });

  // 2. 벡터 검색
  const { data: docs } = await supabase.rpc("match_documents", {
    query_embedding: embedding.data[0].embedding,
    match_count: 5,
  });

  // 3. Claude API 스트리밍 호출
  const stream = await anthropic.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: buildSystemPrompt(docs, context),
    messages: [...(history || []), { role: "user", content: message }],
  });

  // 4. SSE 응답
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const event of stream) {
        if (event.type === "content_block_delta") {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({type:"text", content: event.delta.text})}\n\n`)
          );
        }
      }
      // 출처 정보 전송
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({type:"sources", sources: docs})}\n\n`)
      );
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
// use-chat.ts 내부

async function sendMessage(message: string) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, context, history: messages }),
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let assistantContent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split("\n").filter(l => l.startsWith("data: "));

    for (const line of lines) {
      const data = line.slice(6); // "data: " 제거
      if (data === "[DONE]") break;

      const parsed = JSON.parse(data);
      if (parsed.type === "text") {
        assistantContent += parsed.content;
        updateLastMessage(assistantContent); // 실시간 업데이트
      } else if (parsed.type === "sources") {
        setLastMessageSources(parsed.sources);
      }
    }
  }
}
```

---

## 6. 의존성

### 6.1 새로 추가할 패키지

```bash
npm install @anthropic-ai/sdk openai react-markdown remark-gfm pdf-parse
npm install -D @types/pdf-parse
```

### 6.2 환경변수

```env
# .env.local에 추가
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

---

## 7. 대시보드 통합

### 7.1 레이아웃 수정 (`dashboard/layout.tsx`)

```tsx
// ChatBubble을 레이아웃 최하단에 추가
<main>
  {children}
</main>
<ChatBubble />  // ← 추가 (모든 대시보드 페이지에 표시)
```

### 7.2 맥락 전달

```typescript
// ChatBubble에서 현재 라우트 감지
const pathname = usePathname();

// 맥락 매핑
const contextMap: Record<string, string> = {
  "/dashboard/income": "수입내역 관리 화면",
  "/dashboard/expense": "지출내역 관리 화면",
  "/dashboard/estate": "재산내역 관리 화면",
  "/dashboard/settlement": "결산작업 화면",
  "/dashboard/submit": "제출파일생성 화면",
  "/dashboard/audit": "감사의견서 출력 화면",
  "/dashboard/donors": "후원금 기부자 조회 화면",
};
```

---

## 8. Quick Actions (자주 묻는 질문)

```typescript
const QUICK_ACTIONS = [
  { label: "후원금 한도액", message: "후원금 1회 및 연간 한도액은 얼마인가요?" },
  { label: "선거비용 vs 선거비용외", message: "선거비용과 선거비용외 정치자금의 차이는 무엇인가요?" },
  { label: "감사의견서 작성법", message: "감사의견서는 어떻게 작성하나요?" },
  { label: "영수증 기준", message: "영수증 첨부 기준과 미첨부 사유는?" },
  { label: "회계책임자 선임", message: "회계책임자 선임신고 절차를 알려주세요" },
  { label: "제출파일 생성", message: "선관위 제출파일은 어떻게 만드나요?" },
  { label: "결산 절차", message: "결산작업 절차와 주의사항은?" },
  { label: "후원회 등록", message: "후원회 등록 절차와 필요 서류는?" },
];
```

---

## 9. 구현 순서

| 순서 | 파일 | 설명 |
|------|------|------|
| 1 | `scripts/rag-embed.mjs` | PDF 추출 + 청크 + 임베딩 + Supabase 저장 |
| 2 | Supabase SQL | pgvector 확장 + 테이블 + RPC 함수 |
| 3 | `app/api/chat/route.ts` | Chat API (SSE 스트리밍) |
| 4 | `hooks/use-chat.ts` | 채팅 상태 관리 훅 |
| 5 | `components/chat/ChatMessage.tsx` | 메시지 렌더링 |
| 6 | `components/chat/ChatInput.tsx` | 입력란 |
| 7 | `components/chat/ChatSources.tsx` | 출처 표시 |
| 8 | `components/chat/QuickActions.tsx` | 자주 묻는 질문 |
| 9 | `components/chat/ChatPanel.tsx` | 채팅 패널 (조합) |
| 10 | `components/chat/ChatBubble.tsx` | 플로팅 버튼 |
| 11 | `dashboard/layout.tsx` 수정 | ChatBubble 통합 |
| 12 | 테스트 + 배포 | E2E 테스트 |

---

## 10. 보안 고려사항

| 항목 | 대응 |
|------|------|
| API 키 노출 | ANTHROPIC_API_KEY, OPENAI_API_KEY는 서버사이드 전용 (.env.local) |
| 요청 제한 | Chat API에 rate limiting (IP당 분당 10회) |
| 입력 검증 | message 길이 제한 (2000자), XSS 방지 |
| 비용 관리 | 응답 max_tokens 2048, 임베딩은 1회만 실행 |
| 면책 | "이 답변은 AI가 생성한 참고용이며, 중요 사항은 선관위에 확인하세요" 표시 |
