# Design: 검색 파이프라인 고도화

> **Feature**: search-pipeline
> **Plan Reference**: `docs/01-plan/features/search-pipeline.plan.md`
> **Created**: 2026-03-25
> **Status**: Design

---

## 1. 파일 구조

```
app/src/lib/rag/
├── pipeline.ts              # 메인 오케스트레이터 (Phase 0~5 순차 실행)
├── domain-classifier.ts     # Phase 0: 도메인 분류 + 쿼리 유형 감지
├── query-enhancer.ts        # Phase 1: Multi-Query + 동의어 확장
├── vector-search.ts         # Phase 2: Pinecone 다중 쿼리 검색
├── hybrid-search.ts         # Phase 3: BM25 키워드 부스팅 + RRF
├── reranker.ts              # Phase 4: Gemini 경량 리랭킹
├── context-optimizer.ts     # Phase 5: 필터링 + 재배치
├── synonyms.ts              # 도메인별 동의어 사전
└── types.ts                 # 공통 타입 정의

app/src/app/api/chat/route.ts  # Phase 6: 기존 API 수정 (pipeline 호출)
```

---

## 2. 공통 타입 (`types.ts`)

```typescript
export interface SearchResult {
  id: string;
  content: string;
  score: number;              // 원본 벡터 유사도 (0~1)
  metadata: {
    source?: string;          // 문서명
    page?: number;            // 페이지
    text?: string;            // 원본 텍스트 (Pinecone metadata)
    content?: string;         // content 필드
    category?: string;        // income|expense|estate|report|law|form|general
    [key: string]: unknown;
  };
  // 파이프라인 단계별 추가 스코어
  bm25Score?: number;         // Phase 3
  hybridScore?: number;       // Phase 3 RRF
  rerankScore?: number;       // Phase 4
  finalScore?: number;        // Phase 5 최종
}

export interface DomainResult {
  domain: string;             // 최고 점수 도메인
  confidence: number;         // 0~1
  queryType: "factual" | "procedural" | "comparison" | "overview";
  topK: number;               // 적응형 top_k
  useMetadataFilter: boolean; // metadata filter 사용 여부
}

export interface EnhancedQuery {
  original: string;           // 원본 질문
  variations: string[];       // Multi-Query 변형들
  keywords: string[];         // BM25용 키워드
  synonymExpanded: string[];  // 동의어 확장 쿼리
}

export interface PipelineResult {
  results: SearchResult[];    // 최종 정렬된 검색 결과
  domain: DomainResult;       // 도메인 분류 결과
  query: EnhancedQuery;       // 쿼리 확장 결과
  stats: {
    totalSearched: number;    // 총 검색된 문서 수
    afterDedup: number;       // 중복 제거 후
    afterFilter: number;      // 필터링 후
    finalCount: number;       // 최종 결과 수
    pipelineMs: number;       // 파이프라인 총 소요시간
  };
}

export interface ChatContext {
  currentPage?: string;
  orgType?: string;
}
```

---

## 3. Phase 0: Domain Classifier (`domain-classifier.ts`)

```typescript
// 입력: 질문 문자열
// 출력: DomainResult

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  income:  ["수입", "후원금", "한도액", "기부", "수입제공자", "기명후원금", "익명후원금", "반환"],
  expense: ["지출", "선거비용", "지출유형", "지출방법", "영수증", "지출결의서", "경비"],
  estate:  ["재산", "현금", "예금", "차입금", "재산명세서", "결산", "잔액"],
  report:  ["보고서", "제출", "감사의견서", "심사의결서", "수입지출부", "총괄표", "제출파일"],
  law:     ["정치자금법", "규칙", "법률", "조항", "제\\d+조", "사무관리"],
  form:    ["서식", "신고서", "신청서", "위임장", "양식", "인계인수", "선임"],
  general: ["프로그램", "로그인", "사용법", "설치", "백업"],
};

const QUERY_TYPE_PATTERNS = {
  factual:    [/얼마/, /무엇/, /몇/, /언제/, /누구/, /어디/],
  procedural: [/어떻게/, /방법/, /절차/, /순서/, /과정/, /하려면/],
  comparison: [/차이/, /비교/, /다른/, /구분/, /vs/],
  overview:   [/전체/, /요약/, /정리/, /개요/, /설명해/],
};

export function classifyDomain(question: string): DomainResult {
  // 1. 각 도메인별 키워드 매칭 점수 계산
  // 2. 최고 점수 도메인 선택 + confidence
  // 3. 쿼리 유형 패턴 매칭
  // 4. confidence 기반 적응형 top_k 설정
  //    - confidence >= 0.7 → top_k=5, metadata filter ON
  //    - confidence >= 0.5 → top_k=7, metadata filter ON
  //    - confidence < 0.5  → top_k=10, metadata filter OFF
  // 5. queryType별 top_k 보정
  //    - overview → top_k += 3
  //    - factual  → top_k 유지
}
```

---

## 4. Phase 1: Query Enhancer (`query-enhancer.ts`)

```typescript
// 입력: 원본 질문, DomainResult
// 출력: EnhancedQuery

export async function enhanceQuery(
  question: string,
  domain: DomainResult,
  genAI: GoogleGenerativeAI
): Promise<EnhancedQuery> {
  // 1. Multi-Query 생성 (Gemini Flash 호출)
  //    프롬프트: "다음 질문의 의미를 유지하면서 다르게 표현한 변형 2개를 생성하세요"
  //    confidence < 0.7 → 변형 3개로 확대

  // 2. 동의어 확장
  //    SYNONYMS 사전에서 질문 내 키워드 매칭 → 동의어로 교체한 쿼리 추가

  // 3. 키워드 추출
  //    질문에서 명사/고유명사 추출 (정규식 기반)
  //    조사/어미 제거, 2글자 이상만 유지
}
```

### 동의어 사전 (`synonyms.ts`)

```typescript
export const SYNONYMS: Record<string, string[]> = {
  "선거비용": ["선거운동비용", "선거경비"],
  "수입": ["입금", "수령"],
  "지출": ["지급", "출금", "납부"],
  "후원금": ["기부금", "후원"],
  "회계책임자": ["회계담당자", "회계책임"],
  "한도액": ["제한액", "상한액", "한도"],
  "영수증": ["증빙", "증빙서류", "증빙서"],
  "감사의견서": ["감사의견", "감사보고"],
  "재산": ["자산", "재산내역"],
  "결산": ["마감", "정산"],
  "제출파일": ["제출자료", "보고파일"],
  "인계인수": ["인수인계", "인계"],
  "사업자번호": ["사업자등록번호", "사업자"],
  "생년월일": ["주민번호", "주민등록번호"],
  "예금계좌": ["계좌", "통장", "예금"],
};
```

---

## 5. Phase 2: Vector Search (`vector-search.ts`)

```typescript
// 입력: EnhancedQuery, DomainResult, Pinecone 인스턴스
// 출력: SearchResult[]

export async function multiQuerySearch(
  query: EnhancedQuery,
  domain: DomainResult,
  pinecone: Pinecone,
  genAI: GoogleGenerativeAI
): Promise<SearchResult[]> {
  // 1. 모든 쿼리 임베딩 생성 (원본 + 변형 + 동의어)
  //    Gemini text-embedding-004 배치 호출
  //    최대 쿼리 수: 5개 (원본1 + 변형2 + 동의어2)

  // 2. Pinecone 병렬 검색
  //    Promise.allSettled()로 병렬 실행
  //    각 쿼리별 topK = domain.topK
  //    metadata filter: domain.useMetadataFilter ? { category: domain.domain } : undefined

  // 3. 중복 제거
  //    content 해시 기반 (앞 300자 정규화 후 비교)
  //    동일 문서는 score가 가장 높은 것만 유지

  // 4. 결과 반환: 최대 15개
}
```

---

## 6. Phase 3: Hybrid Search (`hybrid-search.ts`)

```typescript
// 입력: SearchResult[], keywords[]
// 출력: SearchResult[] (hybridScore 추가)

export function hybridSearch(
  results: SearchResult[],
  keywords: string[]
): SearchResult[] {
  // 1. BM25 스코어 계산
  //    각 result.content에서 각 keyword의 출현 빈도 계산
  //    TF = count(keyword) / total_words
  //    IDF = log(N / (df + 1))  (N=결과수, df=키워드 포함 문서수)
  //    BM25 = sum(TF * IDF * (k1+1) / (TF + k1*(1-b+b*dl/avgdl)))
  //    k1=1.2, b=0.75

  // 2. 벡터 순위 + BM25 순위로 RRF 스코어 계산
  //    RRF = 1/(k + vector_rank) + 1/(k + bm25_rank)
  //    k = 60

  // 3. hybridScore = RRF 스코어 (정규화 0~1)
  // 4. hybridScore 기준 내림차순 정렬
}
```

---

## 7. Phase 4: Reranker (`reranker.ts`)

```typescript
// 입력: 질문, SearchResult[] (상위 10개)
// 출력: SearchResult[] (rerankScore + finalScore 추가)

export async function rerank(
  question: string,
  results: SearchResult[],
  genAI: GoogleGenerativeAI
): Promise<SearchResult[]> {
  // 1. Gemini Flash에 배치 리랭킹 요청 (API 1회)
  //    프롬프트:
  //    "다음 질문과 각 문서의 관련도를 0.0~1.0으로 평가하세요.
  //     질문: {question}
  //     문서 1: {content_preview_200자}
  //     문서 2: ...
  //     JSON 배열로 응답: [{index: 0, score: 0.85}, ...]"

  // 2. 응답 파싱 → rerankScore 할당
  //    파싱 실패 시 → rerankScore = hybridScore (폴백)

  // 3. finalScore = 0.7 * rerankScore + 0.3 * (hybridScore || score)

  // 4. finalScore 기준 내림차순 정렬
  // 5. 상위 5개 반환
}
```

---

## 8. Phase 5: Context Optimizer (`context-optimizer.ts`)

```typescript
// 입력: SearchResult[]
// 출력: SearchResult[] (최종 정렬)

export function optimizeContext(results: SearchResult[]): SearchResult[] {
  // 1. 스코어 필터링
  //    finalScore < 0.15 제거
  //    content 길이 50자 미만 제거

  // 2. Near-Duplicate 제거
  //    content 앞 200자 정규화 비교
  //    유사도 > 0.85 → 낮은 스코어 제거

  // 3. Lost-in-Middle 방지 재배치
  //    인덱스 기준: [0, 2, 4, 3, 1] (고관련도를 앞뒤에)
  //    결과가 3개 이하면 재배치 불필요

  // 4. 결과 2개 미만 → fallback 플래그 설정
  //    (pipeline.ts에서 재검색 트리거)
}
```

---

## 9. 파이프라인 오케스트레이터 (`pipeline.ts`)

```typescript
import { classifyDomain } from "./domain-classifier";
import { enhanceQuery } from "./query-enhancer";
import { multiQuerySearch } from "./vector-search";
import { hybridSearch } from "./hybrid-search";
import { rerank } from "./reranker";
import { optimizeContext } from "./context-optimizer";

export async function runPipeline(
  question: string,
  pinecone: Pinecone,
  genAI: GoogleGenerativeAI
): Promise<PipelineResult> {
  const startTime = Date.now();

  // Phase 0: Domain Classification
  const domain = classifyDomain(question);

  // Phase 1: Query Enhancement
  const query = await enhanceQuery(question, domain, genAI);

  // Phase 2: Multi-Query Vector Search
  let results = await multiQuerySearch(query, domain, pinecone, genAI);
  const afterDedup = results.length;

  // Phase 3: Hybrid Search (BM25 + RRF)
  results = hybridSearch(results, query.keywords);

  // Phase 4: Reranking (상위 10개만)
  results = await rerank(question, results.slice(0, 10), genAI);

  // Phase 5: Context Optimization
  results = optimizeContext(results);

  // 폴백: 결과 부족 시 재검색
  if (results.length < 2 && domain.confidence < 0.5) {
    // metadata filter 해제하고 재검색
    const fallbackDomain = { ...domain, useMetadataFilter: false, topK: 10 };
    const fallbackQuery = { ...query, variations: [...query.variations, ...query.synonymExpanded] };
    const more = await multiQuerySearch(fallbackQuery, fallbackDomain, pinecone, genAI);
    results = [...results, ...more.filter(m => !results.find(r => r.id === m.id))];
    results = optimizeContext(results);
  }

  return {
    results,
    domain,
    query,
    stats: {
      totalSearched: afterDedup,
      afterDedup,
      afterFilter: results.length,
      finalCount: results.length,
      pipelineMs: Date.now() - startTime,
    },
  };
}
```

---

## 10. API 수정 (`/api/chat/route.ts`)

```typescript
// 기존 단순 검색을 pipeline.runPipeline()으로 교체

// AS-IS:
//   const embedResult = await embedModel.embedContent(message);
//   const searchResult = await index.query({ vector, topK: 5 });

// TO-BE:
//   const pipelineResult = await runPipeline(message, pinecone, genAI);

// 시스템 프롬프트에 도메인 정보 추가:
//   "현재 질문 도메인: {domain.domain} (confidence: {domain.confidence})"
//   "질문 유형: {domain.queryType}"

// 출처 정보에 finalScore, category 추가
```

---

## 11. 구현 순서

| # | 파일 | Phase | 의존성 |
|---|------|-------|--------|
| 1 | `types.ts` | - | 없음 |
| 2 | `synonyms.ts` | 1 | 없음 |
| 3 | `domain-classifier.ts` | 0 | types |
| 4 | `context-optimizer.ts` | 5 | types |
| 5 | `query-enhancer.ts` | 1 | types, synonyms, Gemini |
| 6 | `vector-search.ts` | 2 | types, Pinecone, Gemini |
| 7 | `hybrid-search.ts` | 3 | types |
| 8 | `reranker.ts` | 4 | types, Gemini |
| 9 | `pipeline.ts` | - | 모든 모듈 |
| 10 | `route.ts` 수정 | 6 | pipeline |
| 11 | 테스트 | - | 전체 |

---

## 12. 테스트 케이스

| # | 질문 | 예상 도메인 | 예상 queryType |
|---|------|-----------|--------------|
| 1 | "후원금 한도액이 얼마인가요?" | income | factual |
| 2 | "감사의견서 작성 절차를 알려주세요" | report | procedural |
| 3 | "선거비용과 선거비용외의 차이는?" | expense | comparison |
| 4 | "정치자금법 제41조 내용은?" | law | factual |
| 5 | "회계책임자 선임신고서 양식은?" | form | factual |
| 6 | "결산 절차를 전체적으로 설명해주세요" | estate | overview |
| 7 | "영수증 첨부 기준은 어떻게 되나요?" | expense | procedural |
