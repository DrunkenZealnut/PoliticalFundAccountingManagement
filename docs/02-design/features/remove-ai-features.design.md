# AI 이용 기능 전면 제거 (remove-ai-features) Design Document

> **Feature**: remove-ai-features
> **Plan**: `docs/01-plan/features/remove-ai-features.plan.md`
> **Date**: 2026-05-15
> **Status**: Draft
> **Strategy**: 의존 그래프 *역방향* 제거 (호출부 → API → 의존성/환경변수 → 문서). 결정사항(옵션 B + 5개 archive + 수동입력 유지)을 라인 단위로 명세.

---

## 1. Change Map (파일·라인 단위)

### 1.1 완전 삭제 파일

| 파일 | LoC | 사유 |
|---|---:|---|
| `app/src/app/api/chat/route.ts` | 278 | Gemini 챗봇 API |
| `app/src/app/api/receipt-scan/route.ts` | 78 | Gemini Vision OCR API |
| `app/src/hooks/use-chat.ts` | 101 | AI SSE 스트리밍 클라이언트 훅 |
| `app/src/lib/chat/election-cost-guide.ts` | 450 | Gemini RAG 컨텍스트 (선관위 가이드 텍스트) |
| `app/src/lib/chat/sample-accounting-data.ts` | 207 | Gemini RAG 컨텍스트 (회계 샘플) |
| `app/src/lib/chat/receipt-naming-rules.ts` | 124 | 영수증 OCR 후처리 규칙 |

→ **총 1,238 LoC 삭제** + 디렉토리 2개(`api/chat/`, `api/receipt-scan/`) 정리.

### 1.2 수정 파일 (AI 부분만 제거, FAQ/수동 입력은 유지)

#### `app/src/components/chat/ChatBubble.tsx` (321 → 약 200줄 예상)

| 변경 | 라인 (현재) | 처리 |
|---|---|---|
| `import { useChat }` | L6 | **삭제** |
| `import ReactMarkdown, remarkGfm` | L7-8 | **삭제** (FAQ 정답은 plain text + line break — 또는 유지 검토. Decision: **삭제**하고 FAQ `a` 필드는 `<div className="whitespace-pre-wrap">`로 렌더) |
| `const [input, setInput] = useState("")` | L13 | **삭제** (사용자 자유입력 제거) |
| `useChat({...})` 호출 + 반환값 분해 | L32-37 | **대체** — 내부 `useState<ChatMessage[]>` + `clearMessages`/`addMessages` 직접 구현 (약 15줄). `isLoading`, `error`, `sendMessage` 제거 |
| `handleSend()` | L43-47 | **삭제** |
| `<p className="text-sm text-blue-200">선관위 공식 자료 기반 AI 답변</p>` | L138 | **문구 변경**: `"선관위 공식 자료 기반 FAQ"` |
| `messages.length === 0` 안내 문구 `"...질문해 보세요"` | L150-152 | **문구 변경**: `"카테고리를 선택해 자주 묻는 질문 정답을 확인하세요"` |
| `isLoading && i === messages.length - 1` 분기 + `"답변 생성 중..."` | L265-271 | **삭제** — FAQ 정답은 즉시 표시되므로 로딩 분기 불필요 |
| `ReactMarkdown` 사용 부분 | L268-270 | **단순화** — `<p className="whitespace-pre-wrap">{msg.content}</p>` |
| `error &&` 에러 박스 | L282-286 | **삭제** (AI 호출 없으니 에러 없음) |
| AI Disclaimer `"AI 참고용 답변입니다..."` | L292-294 | **문구 변경**: `"FAQ는 참고용입니다. 중요 사항은 선관위에 확인하세요."` |
| Input 영역 (`<input>`, `<button>전송</button>`) + 컨테이너 | L296-316 | **삭제** |

> **내부 state 대체 구현 (대체 블록 약 15줄):**
> ```ts
> type ChatMessage = { role: "user" | "assistant"; content: string; source: "faq" };
> const [messages, setMessages] = useState<ChatMessage[]>([]);
> const clearMessages = () => setMessages([]);
> const addMessages = (msgs: ChatMessage[]) => setMessages((p) => [...p, ...msgs]);
> // 기존 isLoading/error는 모두 미사용 → JSX에서 제거
> ```

> **잔존 동작**: 카테고리 선택 → 서브섹션 → 항목 클릭 → `handleFaqItem` → `addMessages` 로 user(질문)+assistant(정답) 페어 추가 → 메시지 스크롤. "대화 초기화" 버튼은 그대로 작동.

#### `app/src/components/chat/ChatBubble.test.tsx`

| 변경 | 처리 |
|---|---|
| `vi.mock("@/hooks/use-chat", ...)` | **삭제** — mock 대상 없음 |
| 테스트: `describe("chat input")` 블록 (input 입력/Enter/전송 클릭) | **삭제** (Input UI 제거됨) |
| 테스트: `"AI가 생성한 다른 답변입니다."` 같은 AI assistant 메시지 시나리오 | **삭제** 또는 **FAQ 정답으로 교체** |
| FAQ 카테고리/서브섹션/항목 탐색 + 정답 표시 + 동일 질문 중복 방지 + 초기화 테스트 | **유지** |

#### `app/src/app/dashboard/document-register/page.tsx` (529 → 약 460줄 예상)

| 변경 | 라인 | 처리 |
|---|---|---|
| `interface ScanResult { ... }` | L21-30 | **삭제** |
| `scanning: boolean;` 필드 (ParsedEntry) | L38 | **삭제** |
| `rcpNoOffset` ref | L79, L172, L203 | **유지** (수동 등록에서도 증빙서번호 자동 채번은 필요 — 단, `scanFile` 외 사용처가 있다면 유지, 없으면 삭제) — **확인 후 결정** |
| `/* ---- AI scan ---- */` 주석 + `scanFile()` 함수 전체 | L139-193 | **삭제** |
| `for (const entry of newEntries) scanFile(entry);` (handleFiles 내) | L221 | **삭제** — 파일 업로드 후 자동 분석 호출 없음. 사용자가 수동으로 모든 필드 입력 |
| `scanning: false, error: null,` (newEntry 초기화) | L213 | **삭제** (필드 자체가 없으니) |
| `e.scanning` 조건 | L256, L451 | **단순화** — 조건에서 `!e.scanning` 제거 (true로 가정) |
| `entry.scanning && <span>AI 분석 중...</span>` | L502 | **삭제** |
| `!entry.scanning && renderEntryForm(entry)` | L507 | **단순화** — `renderEntryForm(entry)` 항상 호출 |
| 통계 표시 `"분석완료"`, `"오류"` 카운트 | L513 | **문구 변경**: `"총 N건 | 등록 가능 M건"` (scanning/error 제거) |
| `"AI 분석 중 오류가 발생했습니다."` catch | L191 | **함수와 함께 삭제** |

> **수동 입력 폼은 그대로 유지**: 파일 업로드 → 빈 폼 → 사용자가 모든 필드(거래일·금액·내역·거래처·사업자번호·결제수단·과목·항목) 직접 입력 → 등록.

#### `app/src/app/dashboard/layout.tsx`

| 변경 | 라인 | 처리 |
|---|---|---|
| `import { ChatBubble }` | L13 | **유지** (FAQ 브라우저 컴포넌트로 동작) |
| `<ChatBubble />` 마운트 | L356 | **유지** |

#### `app/package.json`

| 변경 | 라인 | 처리 |
|---|---|---|
| `"@google/generative-ai": "^0.24.1",` | L15 | **삭제** |
| `"@pinecone-database/pinecone": "^7.1.0",` | L16 | **삭제** |

→ 적용 후 `npm install` 실행하여 `package-lock.json` 재생성.

#### `app/.env.local`

| 변경 | 라인 | 처리 |
|---|---|---|
| `GEMINI_API_KEY=...` | L13 | **삭제** |
| `PINECONE_API_KEY=...` | L16 | **삭제** |
| `PINECONE_HOST=...` | L17 | **삭제** |
| `PINECONE_INDEX_NAME=...` | L18 | **삭제** |

#### `CLAUDE.md` (root)

| 변경 | 라인 | 처리 |
|---|---|---|
| `GEMINI_API_KEY # Gemini API (used in /api/chat, /api/receipt-scan)` | L127 | **삭제** |
| "AI Chat: Google Generative AI (Gemini 2.5 Flash) with keyword-based RAG" | (Tech Stack 섹션) | **삭제** 또는 "AI Chat: 없음 (정적 FAQ 브라우저만)"로 정정 |
| "/api/chat (...)", "/api/receipt-scan (...)" API 라우트 언급 | (Source Layout 섹션) | **삭제** — `app/api/` 라우트 그룹 카운트 갱신 (10 → 8) |
| "Evidence File Storage" §의 receipt-scan Gemini OCR 언급 | (해당 §) | **삭제** — 영수증은 수동 입력만 명시 |
| "components/chat/ChatBubble (FAQ browser + AI chat, well-tested)" | (Source Layout 섹션) | **수정** — `"ChatBubble (정적 FAQ browser only)"` |
| "The chat API (`/api/chat`) streams responses via SSE using Gemini 2.5 Flash..." | (API Pattern 섹션) | **삭제** |

### 1.3 PDCA 문서 Archive (결정 2)

```
docs/archive/2026-05/removed-features/
├── _INDEX.md                                  ← 신규 작성 (archive 사유 기록)
├── chatbot-faq-integration/
│   ├── chatbot-faq-integration.plan.md       ← from docs/01-plan/features/
│   └── chatbot-faq-integration.design.md     ← from docs/02-design/features/
├── rag-chat/
│   ├── rag-chat.plan.md
│   └── rag-chat.design.md
├── smart-auto-register/
│   ├── smart-auto-register.plan.md
│   └── smart-auto-register.design.md
├── receipt-auto-register/
│   └── receipt-auto-register.plan.md         ← design 없을 수 있음
└── search-pipeline/
    ├── search-pipeline.plan.md
    └── search-pipeline.design.md
```

`_INDEX.md` 내용 (요약):
```markdown
# Removed AI Features Archive (2026-05)

본 디렉토리의 PDCA 문서들은 `remove-ai-features` 작업으로 코드에서 제거된 기능에 해당함.
관련 결정: `docs/01-plan/features/remove-ai-features.plan.md` §2.3 결정 2.

| Feature | Archived On | 비고 |
|---|---|---|
| chatbot-faq-integration | 2026-05-15 | AI 챗봇 FAQ 응답 — 정적 FAQ 브라우저로 대체 (코드 보존) |
| rag-chat | 2026-05-15 | Pinecone + Gemini RAG 챗봇 — 완전 제거 |
| smart-auto-register | 2026-05-15 | AI 기반 자동 등록 — 완전 제거 |
| receipt-auto-register | 2026-05-15 | Gemini Vision OCR — 완전 제거, 수동 입력만 유지 |
| search-pipeline | 2026-05-15 | Pinecone RAG 파이프라인 — 완전 제거 |
```

---

## 2. Implementation Order

코드 빌드가 깨지지 않도록 *역방향 의존* 순서로 진행:

| # | 단계 | 작업 | 검증 |
|---|---|---|---|
| 1 | 호출부 정리 | `document-register/page.tsx` 의 `scanFile`·`scanning` UI/필드 제거 | `npm run build` 통과 |
| 2 | ChatBubble 리팩토링 | `useChat` 의존 제거 + 내부 state로 대체 + Input/Disclaimer/문구 수정 | `npm run build` 통과 |
| 3 | 테스트 정리 | `ChatBubble.test.tsx` AI mock/시나리오 제거 (FAQ 탐색 테스트만 유지) | `npm run test` 통과 |
| 4 | Hook 삭제 | `app/src/hooks/use-chat.ts` 삭제 | `npm run build` 통과 (참조 없음 확인) |
| 5 | API 라우트 삭제 | `app/src/app/api/chat/`, `app/src/app/api/receipt-scan/` 디렉토리 삭제 | `npm run build` 통과 |
| 6 | Lib 정리 | `lib/chat/election-cost-guide.ts`, `sample-accounting-data.ts`, `receipt-naming-rules.ts` 삭제. `faq-data.ts`만 유지 | `npm run build` 통과 |
| 7 | 의존성 제거 | `package.json`에서 deps 2개 제거 → `npm install` 재실행 | `npm run build`, `npm run test`, `npm run lint` 모두 통과 |
| 8 | 환경변수 제거 | `.env.local`에서 `GEMINI_API_KEY`, `PINECONE_*` 4개 제거 | grep 결과 0 |
| 9 | CLAUDE.md 정정 | 루트 + app 디렉토리 CLAUDE.md의 AI 언급 제거/정정 | 수동 검토 |
| 10 | PDCA 문서 Archive | `docs/archive/2026-05/removed-features/` 생성 + 5개 feature 문서 이동 + `_INDEX.md` 작성 | 디렉토리 구조 확인 |
| 11 | 수동 회귀 검증 | `npm run dev` → dashboard 진입 → ChatBubble 작동 확인 → document-register 수동 등록 1건 성공 | 사용자 확인 |

---

## 3. Test Strategy

### 3.1 자동 테스트 (Vitest)

| 테스트 파일 | 변경 |
|---|---|
| `ChatBubble.test.tsx` | AI 시나리오 제거 (mock useChat·input·error·전송 버튼 테스트). FAQ 탐색 4개 시나리오 유지 |
| 신규 추가 (선택) | "Input 영역이 DOM에 없어야 함" 회귀 테스트 1개 |

전체 테스트 통과 기준: `npm run test` 0 실패.

### 3.2 수동 회귀

| # | 시나리오 | 기대 |
|---|---|---|
| M1 | dashboard 우하단 💬 버튼 클릭 | 챗 패널 열림, 헤더 `"FAQ"` 문구, Input 영역 없음 |
| M2 | 카테고리 → 항목 클릭 | 정적 정답 표시 |
| M3 | "대화 초기화" 클릭 | 메시지 초기화 + 카테고리 화면 복귀 |
| M4 | document-register 진입 → 이미지 업로드 | "AI 분석 중" 표시 없음, 빈 폼 노출, 모든 필드 직접 입력 가능 |
| M5 | 수동 입력 후 "등록" | 정상 저장 |
| M6 | `/api/chat`, `/api/receipt-scan` 호출 | 404 (라우트 없음) |

### 3.3 정적 검증

```bash
# AI 참조 0건 확인
grep -rn "GoogleGenerativeAI\|@google/generative-ai\|@pinecone-database/pinecone" app/src
grep -rn "GEMINI_API_KEY\|PINECONE_" app/src .env*
grep -rn "use-chat\|useChat" app/src
grep -rn "/api/chat\|/api/receipt-scan" app/src
# 모두 0건이어야 함

# Lint/Build/Test
cd app && npm run lint && npm run test && npm run build
```

---

## 4. Rollback Plan

- 작업 시작 전 현재 브랜치(`feat/official-program-parity`)에서 분기: `feat/remove-ai-features`
- 각 단계(§2의 1~10)를 **개별 커밋**으로 분리 (atomic commits) — 단계별 롤백 가능
- 의존성 제거 단계(§2.7)는 별도 커밋: `package-lock.json` 변경분 분리
- Archive 단계(§2.10)는 마지막 커밋: 코드 변경 전 archive 시 빌드 안전성에 영향 없음

---

## 5. Non-Goals (재확인)

- AI 대체 비-AI OCR(Tesseract 등) 도입 — 별도 plan
- FAQ 데이터 콘텐츠 변경 — 본 작업에서는 *제거*만, 데이터 보존
- 새 UI 디자인 — ChatBubble 외관은 그대로 유지(문구만 정정)
- 자동 등록 보조 도구(예: ExcelJS 일괄 import) — 별도 plan

---

## 6. Open Issues (Design 검증 단계 추적)

| # | 이슈 | 결정 시점 |
|---|---|---|
| O1 | `rcpNoOffset` ref가 `scanFile` 외에서도 쓰이는지 확인 (안 쓰이면 삭제) | Do 단계 §2.1 작업 중 |
| O2 | `ReactMarkdown` 제거 시 FAQ 정답에 markdown 표가 포함된 경우 표시 깨짐 — `faq-data.ts` 내용 점검 후 결정 | Do 단계 §2.2 작업 전 |
| O3 | `receipt-auto-register` 의 design 문서 존재 여부 (없으면 plan만 archive) | Archive 단계 §2.10 |
| O4 | Vercel 배포 환경의 `GEMINI_API_KEY` / `PINECONE_*` 환경변수 — Vercel 콘솔에서 사용자가 수동 삭제 | 배포 시 |

---

## 7. Acceptance Criteria (Plan §4 매핑)

| Plan §4 # | 기준 | Design 검증 방법 |
|---|---|---|
| 1 | AI 참조 0건 (faq-data 제외) | §3.3 정적 검증 |
| 2 | deps 2개 제거 | `app/package.json` 변경 |
| 3 | lint/test/build 통과 | §2.11 단계별 검증 |
| 4 | dashboard 정상 (ChatBubble = FAQ 브라우저) | §3.2 M1~M3 |
| 5 | document-register 수동 등록 가능 | §3.2 M4~M5 |
| 6 | PDCA 5개 archive | §1.3 |
| 7 | Match Rate ≥ 90% | `/pdca analyze` 후 측정 |
