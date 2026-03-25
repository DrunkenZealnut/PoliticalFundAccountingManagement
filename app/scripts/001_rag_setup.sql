-- ============================================================
-- RAG: Supabase pgvector 설정 (1536차원, Gemini Embedding 2 MRL)
-- Supabase Dashboard → SQL Editor에서 실행
-- ============================================================

-- 1. pgvector 확장 활성화
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. RAG 문서 테이블
DROP TABLE IF EXISTS rag_documents;
CREATE TABLE rag_documents (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  content TEXT NOT NULL,
  embedding VECTOR(1536),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. 벡터 검색 인덱스 (HNSW, cosine)
CREATE INDEX rag_documents_embedding_idx
  ON rag_documents USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 4. 메타데이터 검색 인덱스
CREATE INDEX rag_documents_metadata_idx
  ON rag_documents USING gin (metadata);

-- 5. 유사도 검색 RPC 함수
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding VECTOR(1536),
  match_count INT DEFAULT 8,
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
