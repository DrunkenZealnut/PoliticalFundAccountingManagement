/**
 * TS 가이드 파일 → Supabase pgvector 업로드 스크립트
 *
 * election-cost-guide.ts, sample-accounting-data.ts의 내용을 추출하여
 * 청킹 → Contextual Retrieval → 임베딩 → Supabase 업로드
 *
 * 사용법:
 *   cd app
 *   node scripts/upload-ts-guides.mjs
 *
 * 사전 조건:
 *   Supabase SQL Editor에서 scripts/001_rag_setup.sql 실행 완료
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
  console.error("실행: cd app && source .env.local && node scripts/upload-ts-guides.mjs");
  process.exit(1);
}

// ─── TS 파일에서 템플릿 리터럴 콘텐츠 추출 ─────────────────────

function extractTemplateContent(filePath) {
  const code = fs.readFileSync(filePath, "utf-8");
  // export const XXXX = `...` 형태에서 백틱 사이의 내용 추출
  const match = code.match(/export\s+const\s+\w+\s*=\s*`([\s\S]*?)`\s*;/);
  if (!match) throw new Error(`템플릿 리터럴을 찾을 수 없습니다: ${filePath}`);
  return match[1];
}

// ─── 마크다운 → 청크 분할 ───────────────────────────────────────

function chunkMarkdown(text, sourceName) {
  const chunks = [];
  // ## 헤더 기준으로 분할
  const sections = text.split(/(?=^## )/m);

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed || trimmed.length < 30) continue;

    // 섹션 제목 추출
    const titleMatch = trimmed.match(/^(#{2,3})\s+(.+)/);
    const sectionTitle = titleMatch ? titleMatch[2].trim() : "";
    const level = titleMatch ? titleMatch[1].length : 0;

    // 800자 이하면 그대로, 초과면 테이블 행 경계에서 분할
    if (trimmed.length <= 800) {
      chunks.push({
        content: trimmed,
        metadata: { source: sourceName, section: sectionTitle, level },
      });
    } else {
      // 테이블이 포함된 긴 섹션: 헤더 + 테이블 헤더를 유지하면서 행 단위 분할
      const lines = trimmed.split("\n");
      const headerLines = []; // ## 제목 + 테이블 헤더(| 지출항목... + |---...)
      const dataLines = [];

      for (const line of lines) {
        if (line.startsWith("## ") || line.startsWith("### ")) {
          headerLines.push(line);
        } else if (line.startsWith("|") && line.includes("---")) {
          headerLines.push(line);
        } else if (
          line.startsWith("|") &&
          (line.includes("지출항목") || line.includes("날짜") || line.includes("구분") || line.includes("내용"))
        ) {
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
            metadata: { source: sourceName, section: sectionTitle, level },
          });
          buffer = headerText + "\n" + line;
        } else {
          buffer += "\n" + line;
        }
      }
      if (buffer.trim().length > 50) {
        chunks.push({
          content: buffer.trim(),
          metadata: { source: sourceName, section: sectionTitle, level },
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

async function deleteBySource(sourceName) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/rag_documents?metadata->>source=eq.${sourceName}`,
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
    console.warn(`⚠️  기존 데이터 삭제 실패 (${sourceName}): ${errText.slice(0, 100)}`);
  }
}

// ─── Supabase Insert ────────────────────────────────────────────

async function insertToSupabase(records) {
  let total = 0;

  // 배치 단위로 삽입 (10개씩)
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

// ─── 단일 문서 처리 ─────────────────────────────────────────────

async function processDocument(filePath, sourceName, docTitle) {
  console.log(`\n📄 처리 중: ${sourceName} (${docTitle})`);

  const content = extractTemplateContent(filePath);
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

    // Rate limiting
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(`\n✅ 임베딩 완료: ${records.length}개`);

  // Supabase 업로드
  console.log(`📤 Supabase 업로드...`);
  const inserted = await insertToSupabase(records);

  return { chunks: chunks.length, embedded: records.length, inserted };
}

// ─── 메인 ───────────────────────────────────────────────────────

async function main() {
  console.log("\n═══════════════════════════════════════");
  console.log("📚 TS 가이드 → Supabase pgvector 업로드");
  console.log("═══════════════════════════════════════\n");

  const srcDir = path.resolve(__dirname, "../src/lib/chat");

  const files = [
    {
      path: path.join(srcDir, "election-cost-guide.ts"),
      source: "election-cost-guide",
      title: "선거비용 구분 및 보전항목 일람표",
    },
    {
      path: path.join(srcDir, "sample-accounting-data.ts"),
      source: "sample-accounting-data",
      title: "샘플 회계 데이터 — 오준석 후보",
    },
    {
      path: path.join(srcDir, "receipt-naming-rules.ts"),
      source: "receipt-naming-rules",
      title: "증빙서번호 네이밍 규칙",
    },
  ];

  const results = [];

  for (const file of files) {
    if (!fs.existsSync(file.path)) {
      console.error(`❌ 파일 없음: ${file.path}`);
      continue;
    }
    const result = await processDocument(file.path, file.source, file.title);
    results.push({ name: file.source, ...result });
  }

  console.log("\n═══════════════════════════════════════");
  console.log("📊 업로드 결과 요약");
  console.log("═══════════════════════════════════════");
  for (const r of results) {
    console.log(`  ${r.name}: 청크 ${r.chunks} → 임베딩 ${r.embedded} → 저장 ${r.inserted}`);
  }
  console.log(`  모델: gemini-embedding-2-preview (1536차원)`);
  console.log(`  방식: Contextual Retrieval + pgvector`);
  console.log("═══════════════════════════════════════\n");
}

main().catch(console.error);
