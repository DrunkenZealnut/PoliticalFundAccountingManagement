# Plan: 검색 파이프라인 고도화 (SafeFactory RAG Pipeline 참고)

> **Feature**: search-pipeline
> **Created**: 2026-03-25
> **Status**: Plan
> **참고**: http://127.0.0.1:5500/safefactory-rag-pipeline.html

---

## Executive Summary

| 관점 | 내용 |
|------|------|
| **Problem** | 현재 챗봇은 단순 벡터 검색(top-5) → LLM 답변 구조로, 질문 의도 파악 부족, 검색 누락, 중복 문서 포함, 맥락 부적절 등의 문제 발생 |
| **Solution** | SafeFactory RAG Pipeline의 11단계 구조를 참고하여 7단계 검색 파이프라인으로 업그레이드. 도메인 분류 → 쿼리 확장 → 다중 검색 → 하이브리드 융합 → 리랭킹 → 컨텍스트 최적화 → 답변 생성 |
| **Function UX Effect** | 동일한 채팅 UI에서 답변 정확도와 관련성이 크게 향상. 출처 표시에 관련도 점수 + 카테고리 태그 추가 |
| **Core Value** | 검색 정확도 70% → 90%+ 향상, 답변에 불필요한 정보 제거, 법률 조문/서식 관련 질문에 정확한 근거 제공 |

---

## 1. 현재 구조 (AS-IS)

```
사용자 질문
  ↓
Gemini text-embedding-004 임베딩
  ↓
Pinecone 벡터 검색 (top-5, 단일 쿼리)
  ↓
검색 결과 5개 + 시스템 프롬프트 + 질문
  ↓
Gemini 2.0 Flash 답변 생성 (SSE 스트리밍)
```

### 문제점
1. **단일 쿼리 검색** — 질문 표현이 다르면 관련 문서를 놓침
2. **도메인 무구분** — 수입/지출/법률/서식 등 카테고리 필터 없음
3. **중복 문서** — 같은 내용의 청크가 여러 개 검색됨
4. **관련도 검증 없음** — 낮은 유사도 결과도 포함됨
5. **컨텍스트 비최적화** — Lost-in-Middle 현상 발생 가능

---

## 2. 목표 구조 (TO-BE) — 7단계 파이프라인

```
사용자 질문
  ↓
[Phase 0] Domain Classification — 도메인 분류 + 쿼리 유형 감지
  ↓
[Phase 1] Query Enhancement — 다중 쿼리 생성 + 동의어 확장
  ↓
[Phase 2] Multi-Query Vector Search — Pinecone 병렬 검색 + 중복 제거
  ↓
[Phase 3] Hybrid Search — BM25 키워드 부스팅 + RRF 융합
  ↓
[Phase 4] Reranking — 관련도 재정렬 (Cross-encoder 방식)
  ↓
[Phase 5] Context Optimization — 필터링 + Lost-in-Middle 방지 재배치
  ↓
[Phase 6] LLM Answer Generation — Gemini 스트리밍 답변 + 출처
```

---

## 3. 각 Phase 상세 설계

### Phase 0: Domain Classification

```
목적: 질문의 도메인과 유형을 분류하여 후속 단계의 파라미터를 최적화

도메인 분류 (키워드 스코어링):
  income   — 수입, 후원금, 한도액, 기부, 수입제공자
  expense  — 지출, 선거비용, 지출유형, 지출방법, 영수증
  estate   — 재산, 현금, 예금, 차입금, 재산명세서
  report   — 보고서, 결산, 제출, 감사의견서, 심사의결서
  law      — 정치자금법, 규칙, 조항, 법률, 제XX조
  form     — 서식, 신고서, 신청서, 위임장, 양식
  general  — 프로그램, 로그인, 사용법

쿼리 유형 분류:
  factual    — "~은 얼마인가요?", "~은 무엇인가요?"
  procedural — "~은 어떻게 하나요?", "절차는?"
  comparison — "~와 ~의 차이는?"
  overview   — "전체적으로", "요약해주세요"

적응형 파라미터:
  - 도메인 confidence < 0.7 → top_k 확대 (5 → 8)
  - 쿼리 유형별 top_k 조정 (overview: 8, factual: 5)
  - Pinecone metadata filter에 category 적용
```

### Phase 1: Query Enhancement

```
목적: 검색 커버리지를 확대하여 관련 문서를 더 많이 찾기

1. Multi-Query 생성:
   - Gemini에 원본 질문 → 의미적 변형 쿼리 2개 자동 생성
   - 예: "후원금 한도액" → "기부금 제한 금액", "연간 후원 상한선"

2. 동의어 확장:
   - 도메인별 동의어 사전 (정적)
   - 예: "선거비용" ↔ "선거운동비용", "회계책임자" ↔ "회계담당자"
   - "지출" ↔ "지급", "수입" ↔ "입금"

3. 키워드 추출:
   - 질문에서 핵심 명사/고유명사 추출
   - BM25 하이브리드 검색에 사용
```

### Phase 2: Multi-Query Vector Search

```
목적: 확장된 쿼리들로 Pinecone 병렬 검색

1. 각 쿼리(원본 + 변형 2개)를 Gemini embedding으로 변환
2. Pinecone에 3개 쿼리 병렬 검색 (각 top_k=5)
3. 도메인 분류 결과에 따라 metadata filter 적용:
   - filter: { category: "income" } (confidence >= 0.7일 때)
4. 중복 제거: 동일 content의 청크는 score가 높은 것만 유지
5. 총 최대 15개 후보 → 중복 제거 후 8~10개
```

### Phase 3: Hybrid Search (BM25 + Vector)

```
목적: 키워드 매칭으로 벡터 검색을 보완

1. Phase 1에서 추출한 키워드로 BM25 스코어 계산:
   - 각 검색 결과 content에서 키워드 출현 빈도 계산
   - TF-IDF 근사 점수화

2. RRF (Reciprocal Rank Fusion):
   - vector_rank와 bm25_rank를 RRF 공식으로 융합
   - RRF_score = 1/(k + vector_rank) + 1/(k + bm25_rank)
   - k = 60 (기본값)

3. 최종 융합 스코어로 재정렬
```

### Phase 4: Reranking

```
목적: 질문-문서 쌍의 실제 관련도를 정밀 평가

방식: Gemini를 이용한 경량 리랭킹
  - 각 후보 문서에 대해 "이 문서가 질문에 답변하는 데 관련이 있는가? (0~1 점수)" 평가
  - 10개 문서를 한 번에 배치 평가 (API 호출 1회)

하이브리드 스코어:
  final_score = 0.7 × rerank_score + 0.3 × original_score

상위 5개 선택
```

### Phase 5: Context Optimization

```
목적: LLM에 전달할 컨텍스트 품질 최적화

1. 스코어 필터링:
   - final_score < 0.2인 문서 제거
   - content 길이 50자 미만 노이즈 제거

2. Near-Duplicate 제거:
   - 문서 앞 200자 기준 유사도 > 0.9이면 제거

3. Lost-in-Middle 방지 재배치:
   - 1위, 3위, 5위 → 앞쪽 (LLM이 주목)
   - 2위, 4위 → 뒤쪽
   - 패턴: [1, 3, 5, 4, 2] (고관련도를 앞뒤 배치)

4. 결과 부족 시 폴백:
   - 결과 2개 미만 → Phase 1의 Multi-Query를 확대 (변형 4개)
   - 재검색 후 기존 결과에 추가
```

### Phase 6: LLM Answer Generation

```
목적: 최적화된 컨텍스트로 정확한 답변 생성

1. 시스템 프롬프트:
   - 도메인별 전문 지시 추가
   - 쿼리 유형별 답변 형식 지시 (factual: 간결, procedural: 단계별)

2. Gemini 2.0 Flash 스트리밍 호출

3. 출처 구성:
   - 각 참고 문서의 source, page, score, category
   - 관련도 높은 순으로 정렬

4. 면책 문구 자동 추가
```

---

## 4. 구현 파일 구조

```
app/src/lib/
├── rag/
│   ├── pipeline.ts          # 메인 파이프라인 오케스트레이터
│   ├── domain-classifier.ts # Phase 0: 도메인 분류
│   ├── query-enhancer.ts    # Phase 1: 쿼리 확장
│   ├── vector-search.ts     # Phase 2: Pinecone 검색
│   ├── hybrid-search.ts     # Phase 3: BM25 + RRF
│   ├── reranker.ts          # Phase 4: 리랭킹
│   ├── context-optimizer.ts # Phase 5: 컨텍스트 최적화
│   └── synonyms.ts          # 동의어 사전

app/src/app/api/chat/route.ts  # Phase 6 통합 (기존 파일 수정)
```

---

## 5. 구현 우선순위

| 순서 | Phase | 난이도 | 효과 | 설명 |
|------|-------|--------|------|------|
| 1 | Phase 0 | 낮음 | 높음 | 키워드 스코어링만으로 구현, metadata 필터 적용 |
| 2 | Phase 5 | 낮음 | 중간 | 스코어 필터 + 중복 제거 (순수 로직) |
| 3 | Phase 1 | 중간 | 높음 | Gemini 호출 1회 추가, 동의어 사전 |
| 4 | Phase 2 | 중간 | 높음 | 병렬 검색 + 중복 제거 |
| 5 | Phase 3 | 중간 | 중간 | BM25 계산 (클라이언트사이드) |
| 6 | Phase 4 | 높음 | 높음 | Gemini 배치 리랭킹 (API 비용 증가) |
| 7 | Phase 6 | 낮음 | 높음 | 기존 코드 수정 (파이프라인 통합) |

---

## 6. 성능 목표

| 지표 | 현재 (AS-IS) | 목표 (TO-BE) |
|------|-------------|-------------|
| 검색 정확도 | ~70% | 90%+ |
| 첫 토큰 응답 | ~1.5초 | ~2.5초 (파이프라인 추가 감안) |
| 관련 없는 문서 비율 | ~30% | <5% |
| API 호출 수/질문 | Embed 1 + LLM 1 = 2 | Embed 3 + LLM 2~3 = 5~6 |
| 월 추가 비용 | - | ~$5-10 증가 |

---

## 7. 리스크

| 리스크 | 대응 |
|--------|------|
| 응답 지연 | Phase 1+2를 병렬 실행, 리랭킹은 선택적 적용 |
| API 비용 증가 | Multi-Query를 confidence 낮을 때만 활성화 |
| 동의어 사전 유지보수 | 초기 30개 핵심 용어만 수록, 점진 확대 |
| Pinecone 데이터 미존재 | 현재 87,788 벡터 활용, 부족 시 추가 임베딩 |
