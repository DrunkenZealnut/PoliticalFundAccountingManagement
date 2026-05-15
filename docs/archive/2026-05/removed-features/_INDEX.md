# Removed AI Features Archive (2026-05)

본 디렉토리의 PDCA 문서들은 `remove-ai-features` 작업으로 코드베이스에서 제거된 AI 기반 기능에 해당합니다.

- **관련 결정**: `docs/01-plan/features/remove-ai-features.plan.md` §2.3 (Decisions Made)
- **관련 설계**: `docs/02-design/features/remove-ai-features.design.md` §1.3
- **Archive 일자**: 2026-05-15
- **Archive 사유**: 외부 LLM(Gemini) 호출의 비용/지연/할당량 리스크, 정치자금 도메인의 정확성·법적 책임 검증 불가, 데이터 외부 전송 우려로 모든 AI 기능을 코드베이스에서 제거. ChatBubble은 정적 FAQ 브라우저로 축소.

## Archived Features

| Feature | Archived On | 비고 |
|---|---|---|
| chatbot-faq-integration | 2026-05-15 | AI 챗봇 FAQ 응답 — 정적 FAQ 브라우저(`components/chat/ChatBubble.tsx` + `lib/chat/faq-data.ts`)로 대체. 코드는 보존. |
| rag-chat | 2026-05-15 | Pinecone + Gemini RAG 챗봇 — 완전 제거. `@google/generative-ai`, `@pinecone-database/pinecone` 의존성 삭제. |
| smart-auto-register | 2026-05-15 | AI 기반 자동 회계 등록 — 완전 제거. |
| receipt-auto-register | 2026-05-15 | Gemini Vision 영수증 OCR — 완전 제거. `document-register` 페이지는 수동 입력 폼만 유지. (design 문서 부재) |
| search-pipeline | 2026-05-15 | Pinecone RAG 검색 파이프라인 — 완전 제거. |

## Related Code Changes (커밋 참조)

본 archive 작업에 선행된 코드 변경 커밋(branch `feat/remove-ai-features`):

- `refactor(remove-ai-features): document-register OCR 호출 제거, 수동 입력 폼만 유지`
- `refactor(remove-ai-features): ChatBubble을 정적 FAQ 브라우저로 축소`
- `chore(remove-ai-features): AI 의존 파일 삭제` (api/chat, api/receipt-scan, hooks/use-chat, lib/chat의 RAG 컨텍스트 3개)
- `chore(remove-ai-features): AI 관련 npm 의존성 제거`
- `docs(remove-ai-features): CLAUDE.md에서 AI 관련 기술 스택 정정`
