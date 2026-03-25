/**
 * Contextual Retrieval 방식 RAG 업로드 스크립트
 *
 * 사용법: node scripts/rag-upload.mjs <파일경로.md>
 *
 * 흐름:
 * 1. MD 파일 읽기
 * 2. 섹션(##, ###) 기준 청크 분할
 * 3. 각 청크에 Gemini Flash로 맥락 설명 생성 (Contextual Retrieval)
 * 4. contextual_content = 맥락 + 원본 청크
 * 5. Gemini Embedding 2로 임베딩 (3072차원)
 * 6. Pinecone accmanage index에 upsert
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!GEMINI_API_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('환경변수 필요: GEMINI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  console.error('실행: source ../app/.env.local && node scripts/rag-upload.mjs <file.md>');
  process.exit(1);
}

// ─── 1. MD 파일 → 청크 분할 ────────────────────────────────────

function chunkMarkdown(text, filePath) {
  const fileName = path.basename(filePath, '.md');
  const chunks = [];

  // ## 또는 ### 헤더 기준으로 분할
  const sections = text.split(/(?=^#{2,3}\s)/m);

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed || trimmed.length < 30) continue;

    // 섹션 제목 추출
    const titleMatch = trimmed.match(/^(#{2,3})\s+(.+)/);
    const sectionTitle = titleMatch ? titleMatch[2].trim() : '';
    const level = titleMatch ? titleMatch[1].length : 0;

    // 600자 이하면 그대로, 초과면 빈 줄 기준 재분할
    if (trimmed.length <= 800) {
      chunks.push({
        content: trimmed,
        metadata: {
          source: fileName,
          section: sectionTitle,
          level,
        }
      });
    } else {
      // 큰 섹션은 빈 줄 + 목록항목 경계로 재분할
      const subChunks = trimmed.split(/\n\n+/);
      let buffer = '';

      for (const sub of subChunks) {
        if (buffer.length + sub.length > 700 && buffer.length > 100) {
          chunks.push({
            content: buffer.trim(),
            metadata: { source: fileName, section: sectionTitle, level }
          });
          buffer = sub;
        } else {
          buffer += (buffer ? '\n\n' : '') + sub;
        }
      }
      if (buffer.trim().length > 30) {
        chunks.push({
          content: buffer.trim(),
          metadata: { source: fileName, section: sectionTitle, level }
        });
      }
    }
  }

  return chunks;
}

// ─── 2. Contextual Retrieval: 맥락 생성 ────────────────────────

async function generateContext(chunk, docTitle) {
  const prompt = `다음은 "${docTitle}" 문서의 한 섹션입니다. 이 섹션이 다루는 내용을 1~2문장으로 간결하게 설명하세요. 검색에 도움이 되도록 핵심 키워드를 포함하세요.

섹션:
${chunk.content.slice(0, 500)}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 100, temperature: 0.1 }
      })
    }
  );

  const data = await response.json();
  const contextText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return contextText.trim();
}

// ─── 3. Gemini Embedding 2 (3072차원) ──────────────────────────

async function embedText(text) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2-preview:embedContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/gemini-embedding-2-preview',
        content: { parts: [{ text }] },
        outputDimensionality: 1536
      })
    }
  );

  const data = await response.json();
  return data?.embedding?.values || [];
}

// ─── 4. Supabase pgvector Insert ───────────────────────────────

async function insertToSupabase(vectors) {
  let total = 0;

  for (let i = 0; i < vectors.length; i++) {
    const v = vectors[i];
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rag_documents`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        content: v.metadata.text,
        embedding: JSON.stringify(v.values),
        metadata: {
          source: v.metadata.source,
          section: v.metadata.section,
          context: v.metadata.context,
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`\n❌ Supabase 오류 (${i}): ${response.status} ${errText.slice(0, 200)}`);
      continue;
    }

    total++;
    process.stdout.write(`  inserted: ${total}/${vectors.length}\r`);
  }

  console.log(`  inserted: ${total}/${vectors.length} 완료`);
  return total;
}

// ─── 5. 메인 ───────────────────────────────────────────────────

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('사용법: node scripts/rag-upload.mjs <파일경로.md>');
    process.exit(1);
  }

  console.log(`\n📄 파일: ${filePath}`);
  const text = fs.readFileSync(filePath, 'utf-8');
  const docTitle = path.basename(filePath, '.md');

  // 1. 청크 분할
  const chunks = chunkMarkdown(text, filePath);
  console.log(`📦 청크 수: ${chunks.length}`);

  // 2. Contextual Retrieval + 임베딩
  const vectors = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    process.stdout.write(`🔄 [${i + 1}/${chunks.length}] ${chunk.metadata.section?.slice(0, 30) || '...'}\r`);

    // 맥락 생성
    const context = await generateContext(chunk, docTitle);
    const contextualContent = `${context}\n\n${chunk.content}`;

    // 임베딩 생성 (3072차원)
    const embedding = await embedText(contextualContent);

    if (embedding.length !== 1536) {
      console.warn(`\n⚠️  임베딩 차원 불일치: ${embedding.length} (expected 1536)`);
      continue;
    }

    const id = crypto.createHash('sha256').update(chunk.content).digest('hex').slice(0, 16);

    vectors.push({
      id: `${docTitle}-${id}`,
      values: embedding,
      metadata: {
        source: chunk.metadata.source,
        section: chunk.metadata.section,
        text: contextualContent.slice(0, 2000),  // Pinecone metadata 크기 제한
        context: context,
        original: chunk.content.slice(0, 1000),
      }
    });

    // Rate limiting (Gemini API)
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n✅ 임베딩 완료: ${vectors.length}개`);

  // 3. Supabase pgvector 업로드
  console.log(`📤 Supabase pgvector 업로드 (3072차원)...`);
  const inserted = await insertToSupabase(vectors);

  // 4. 결과
  console.log(`\n════════════════════════════════`);
  console.log(`📊 업로드 완료`);
  console.log(`  문서: ${docTitle}`);
  console.log(`  청크: ${chunks.length}개`);
  console.log(`  임베딩: ${vectors.length}개 (3072차원)`);
  console.log(`  Supabase: ${inserted}개 inserted`);
  console.log(`  모델: gemini-embedding-2-preview`);
  console.log(`  방식: Contextual Retrieval`);
  console.log(`════════════════════════════════\n`);
}

main().catch(console.error);
