/**
 * 마크다운 파일 → Supabase pgvector 업로드 스크립트
 *
 * 원본 MD 파일을 청킹 → Contextual Retrieval → 임베딩 → Supabase 업로드
 *
 * 사용법:
 *   cd app
 *   node scripts/upload-md-to-supabase.mjs <파일경로> [소스명]
 *
 * 예시:
 *   node scripts/upload-md-to-supabase.mjs ../RAG/제9회_지방선거_정치자금_회계실무-1-130.md 회계실무-전체
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// .env.local 자동 로드
const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!GEMINI_API_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "환경변수 필요: GEMINI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY"
  );
  process.exit(1);
}

const mdFilePath = process.argv[2];
const sourceName = process.argv[3] || path.basename(mdFilePath, ".md");

if (!mdFilePath) {
  console.error("사용법: node scripts/upload-md-to-supabase.mjs <파일경로> [소스명]");
  process.exit(1);
}

const resolvedPath = path.resolve(mdFilePath);
if (!fs.existsSync(resolvedPath)) {
  console.error(`파일 없음: ${resolvedPath}`);
  process.exit(1);
}

// ─── 마크다운 → 청크 분할 ───────────────────────────────────────

function chunkMarkdown(text, source) {
  const chunks = [];

  // <!-- page: N --> 주석과 이미지 참조 제거
  const cleaned = text
    .replace(/<!-- page: \d+ -->/g, "")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\n{3,}/g, "\n\n");

  // ## 또는 ### 헤더 기준으로 분할
  const sections = cleaned.split(/(?=^#{2,3} )/m);

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed || trimmed.length < 30) continue;

    const titleMatch = trimmed.match(/^(#{2,3})\s+(.+)/);
    const sectionTitle = titleMatch ? titleMatch[2].trim() : "";
    const level = titleMatch ? titleMatch[1].length : 0;

    if (trimmed.length <= 800) {
      chunks.push({
        content: trimmed,
        metadata: { source, section: sectionTitle, level },
      });
    } else {
      // 긴 섹션은 단락/테이블 경계에서 분할
      const lines = trimmed.split("\n");
      const headerLines = [];
      const dataLines = [];

      for (const line of lines) {
        if (line.startsWith("## ") || line.startsWith("### ")) {
          headerLines.push(line);
        } else if (line.startsWith("|") && line.includes("---")) {
          headerLines.push(line);
        } else if (
          headerLines.length > 0 &&
          dataLines.length === 0 &&
          line.startsWith("|") &&
          !line.includes("---")
        ) {
          // 테이블 컬럼 헤더 행
          headerLines.push(line);
        } else {
          dataLines.push(line);
        }
      }

      const headerText = headerLines.join("\n");
      let buffer = headerText;

      for (const line of dataLines) {
        if (buffer.length + line.length > 700 && buffer.length > 100) {
          chunks.push({
            content: buffer.trim(),
            metadata: { source, section: sectionTitle, level },
          });
          buffer = headerText + "\n" + line;
        } else {
          buffer += "\n" + line;
        }
      }
      if (buffer.trim().length > 50) {
        chunks.push({
          content: buffer.trim(),
          metadata: { source, section: sectionTitle, level },
        });
      }
    }
  }

  return chunks;
}

// ─── Contextual Retrieval: 맥락 생성 ───────────────────────────

async function generateContext(chunk, docTitle) {
  const prompt = `다음은 "${docTitle}" 문서의 한 섹션입니다. 이 섹션이 다루는 내용을 1~2문장으로 간결하게 설명하세요. 검색에 도움이 되도록 핵심 키워드와 법조항 번호를 포함하세요.

섹션:
${chunk.content.slice(0, 500)}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 100, temperature: 0.1 },
        }),
      }
    );

    const data = await response.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
  } catch (err) {
    console.warn(`\n⚠️  맥락 생성 실패: ${err.message}`);
    return "";
  }
}

// ─── Gemini Embedding (1536차원) ────────────────────────────────

async function embedText(text) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2-preview:embedContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/gemini-embedding-2-preview",
        content: { parts: [{ text }] },
        outputDimensionality: 1536,
      }),
    }
  );

  const data = await response.json();
  if (data.error) {
    console.error(`\n❌ 임베딩 오류: ${data.error.message}`);
    return [];
  }
  return data?.embedding?.values || [];
}

// ─── 기존 데이터 삭제 (source 기준) ────────────────────────────

async function deleteBySource(source) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/rag_documents?metadata->>source=eq.${source}`,
    {
      method: "DELETE",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    console.warn(`⚠️  기존 데이터 삭제 실패: ${errText.slice(0, 100)}`);
  }
}

// ─── Supabase Insert ────────────────────────────────────────────

async function insertToSupabase(records) {
  let total = 0;
  const batchSize = 10;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const rows = batch.map((r) => ({
      content: r.content,
      embedding: JSON.stringify(r.embedding),
      metadata: r.metadata,
    }));

    const response = await fetch(`${SUPABASE_URL}/rest/v1/rag_documents`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(rows),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`\n❌ Supabase 오류 (batch ${i}): ${response.status} ${errText.slice(0, 200)}`);
      continue;
    }

    total += batch.length;
    process.stdout.write(`  inserted: ${total}/${records.length}\r`);
  }

  console.log(`  inserted: ${total}/${records.length} 완료`);
  return total;
}

// ─── 메인 ───────────────────────────────────────────────────────

async function main() {
  const docTitle = "정치자금 회계실무 (예비)후보자 및 그 후원회";

  console.log("\n═══════════════════════════════════════");
  console.log("📚 마크다운 → Supabase pgvector 업로드");
  console.log("═══════════════════════════���═══════════");
  console.log(`📄 파일: ${resolvedPath}`);
  console.log(`🏷️  소스명: ${sourceName}`);
  console.log(`📖 문서제목: ${docTitle}\n`);

  const content = fs.readFileSync(resolvedPath, "utf-8");
  const chunks = chunkMarkdown(content, sourceName);
  console.log(`📦 청크 수: ${chunks.length}`);

  // 기존 데이터 삭제
  console.log(`🗑️  기존 ${sourceName} 데이터 삭제...`);
  await deleteBySource(sourceName);

  // 임베딩 생성
  const records = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    process.stdout.write(
      `🔄 [${i + 1}/${chunks.length}] ${chunk.metadata.section?.slice(0, 40) || "..."}\r`
    );

    // 맥락 생성
    const context = await generateContext(chunk, docTitle);
    const contextualContent = `${context}\n\n${chunk.content}`;

    // 임베딩
    const embedding = await embedText(contextualContent);
    if (embedding.length !== 1536) {
      console.warn(`\n⚠️  임베딩 차원 불일치: ${embedding.length} → 스킵`);
      continue;
    }

    records.push({
      content: contextualContent.slice(0, 4000),
      embedding,
      metadata: {
        source: sourceName,
        section: chunk.metadata.section,
        context,
        level: chunk.metadata.level,
      },
    });

    // Rate limiting (Gemini API)
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\n✅ 임베딩 완료: ${records.length}개`);

  // Supabase 업로드
  console.log(`📤 Supabase 업로드...`);
  const inserted = await insertToSupabase(records);

  console.log("\n═══════════════════════════════════════");
  console.log("📊 업로드 결과 요약");
  console.log("═══════════════════════════════════════");
  console.log(`  파일: ${path.basename(resolvedPath)}`);
  console.log(`  소스명: ${sourceName}`);
  console.log(`  청크: ${chunks.length} → 임베딩: ${records.length} → 저장: ${inserted}`);
  console.log(`  모델: gemini-embedding-2-preview (1536차원)`);
  console.log(`  방식: Contextual Retrieval + pgvector`);
  console.log("═══════════════════════════════════════\n");
}

main().catch(console.error);
