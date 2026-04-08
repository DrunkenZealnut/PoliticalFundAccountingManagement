# Chat RAG 마이그레이션 Gap Analysis

## Executive Summary

| 항목 | 값 |
|------|-----|
| Feature | chat (키워드 검색 → pgvector RAG) |
| 분석일 | 2026-03-27 |
| Match Rate | **90%** |
| 상태 | ✅ Pass |

| 관점 | 내용 |
|------|------|
| Problem | 키워드 매칭 기반 검색은 자연어 질의에 취약하고 유지보수 비용이 높음 |
| Solution | Supabase pgvector + Gemini Embedding + Contextual Retrieval RAG |
| Function UX Effect | 시맨틱 검색으로 "차량 대여 비용" → "확성장치 자동차" 매칭 가능 |
| Core Value | 인프라 추가 없이(Supabase 기존 사용) 검색 품질 향상 |

---

## Overall Scores

| Category | Score | Status |
|----------|:-----:|:------:|
| Design Match | 90% | ✅ |
| Architecture Compliance | 95% | ✅ |
| Convention Compliance | 85% | ⚠️ |
| **Overall** | **90%** | ✅ |

## Requirement Verification (10/10)

| ID | Requirement | Status |
|----|-------------|:------:|
| DR-1 | Vector search replaces keyword matching | ✅ |
| DR-2 | Embedding dimension matches SQL (1536) | ✅ |
| DR-3 | Upload script extracts TS template literals | ✅ |
| DR-4 | Chunks by ## sections, 800-char limit | ✅ |
| DR-5 | Contextual Retrieval per chunk | ✅ |
| DR-6 | `match_documents` RPC with proper params | ⚠️ implicit type cast |
| DR-7 | RAG results include source/section metadata | ✅ |
| DR-8 | Fallback handling on RAG failure | ✅ |
| DR-9 | Accounting data fetch preserved | ✅ |
| DR-10 | Streaming SSE response preserved | ✅ |

## Gaps Found

### Immediate (수정 권장)

1. **유사도 임계값 없음** — 낮은 유사도(20%) 결과도 LLM 컨텍스트에 포함됨
2. **`inTableHeader` 미사용 변수** — upload-ts-guides.mjs:71

### Minor (문서화 권장)

3. Gemini 모델 버전 차이: embedding-2-preview(임베딩), 2.0-flash(맥락생성), 2.5-flash(채팅)
4. `query_embedding` implicit type cast (JSON string → pgvector)
5. `filter` 파라미터 미사용 (dead code path)

## Recommended Actions

- [x] 유사도 임계값 필터 추가 (> 0.3)
- [x] 미사용 변수 제거
- [ ] 모델 버전 문서화 (optional)
