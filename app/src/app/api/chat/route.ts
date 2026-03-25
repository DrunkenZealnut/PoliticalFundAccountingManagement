import { NextRequest } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";

// Vercel serverless 함수 타임아웃 확장 (Hobby: 최대 60초)
export const maxDuration = 60;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const SYSTEM_PROMPT = `당신은 중앙선거관리위원회의 정치자금 회계 전문 상담사입니다.
다음 참고 자료를 기반으로 정확하게 답변해 주세요.

규칙:
1. 참고 자료에 있는 내용만으로 답변하세요.
2. 확실하지 않은 내용은 "확인이 필요합니다"라고 안내하세요.
3. 법률 조문을 인용할 때는 정확한 조항을 명시하세요.
4. 금액, 기한 등 숫자 정보는 정확하게 전달하세요.
5. 답변 마지막에 관련 법조문이나 참고 페이지를 간단히 안내하세요.
6. 한국어로 답변하세요.
7. 답변은 핵심 위주로 간결하게 작성하세요 (최대 300자 내외).

⚠ 이 답변은 AI가 생성한 참고용이며, 중요 사항은 관할 선거관리위원회에 확인하세요.`;

export async function POST(request: NextRequest) {
  try {
    const { message, context, history } = await request.json();

    if (!message || typeof message !== "string") {
      return Response.json({ error: "message required" }, { status: 400 });
    }

    // 1. Gemini Embedding 2로 질문 임베딩 생성 (1536차원 MRL)
    const embedResult = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2-preview:embedContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/gemini-embedding-2-preview",
          content: { parts: [{ text: message }] },
          outputDimensionality: 1536,
        }),
      }
    ).then((r) => r.json());
    const queryVector = embedResult?.embedding?.values;
    if (!queryVector || queryVector.length === 0) {
      return Response.json({ error: "임베딩 생성 실패" }, { status: 500 });
    }

    // 2. Supabase pgvector 유사도 검색
    const { data: docs, error: searchError } = await supabase.rpc("match_documents", {
      query_embedding: JSON.stringify(queryVector),
      match_count: 8,
    });

    if (searchError) {
      console.error("RAG search error:", searchError.message);
    }

    // 3. 검색 결과를 컨텍스트로 구성
    const sources = (docs || []).map((d: { id: number; content: string; metadata: Record<string, unknown>; similarity: number }) => ({
      id: String(d.id),
      score: d.similarity || 0,
      title: (d.metadata?.source as string) || "",
      page: (d.metadata?.page as number) || 0,
      content: (d.content || "").slice(0, 1000),
    }));

    const ragContext = sources
      .map((s: { title: string; page: number; content: string }, i: number) =>
        `[참고자료 ${i + 1}] (${s.title}${s.page ? ` p.${s.page}` : ""})\n${s.content}`
      )
      .join("\n\n---\n\n");

    // 4. Gemini 채팅 생성
    const chatModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const contextInfo = context
      ? `\n현재 사용자 환경:\n- 페이지: ${context.currentPage || "대시보드"}\n- 기관유형: ${context.orgType || "미정"}`
      : "";

    const fullPrompt = `${SYSTEM_PROMPT}${contextInfo}\n\n참고 자료:\n---\n${ragContext || "(검색된 참고 자료 없음)"}\n---\n\n사용자 질문: ${message}`;

    // Build chat history
    const chatHistory = (history || []).map((h: { role: string; content: string }) => ({
      role: h.role === "user" ? "user" : "model",
      parts: [{ text: h.content }],
    }));

    const chat = chatModel.startChat({
      history: chatHistory,
      generationConfig: { maxOutputTokens: 2048 },
    });

    // 5. 스트리밍 응답
    const result = await chat.sendMessageStream(fullPrompt);
    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "text", content: text })}\n\n`)
              );
            }
          }

          if (sources.length > 0) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "sources", sources })}\n\n`)
            );
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "error", content: String(err) })}\n\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
