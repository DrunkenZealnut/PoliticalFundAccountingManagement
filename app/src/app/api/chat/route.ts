import { NextRequest } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Pinecone } from "@pinecone-database/pinecone";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });

const SYSTEM_PROMPT = `당신은 중앙선거관리위원회의 정치자금 회계 전문 상담사입니다.
다음 참고 자료를 기반으로 정확하게 답변해 주세요.

규칙:
1. 참고 자료에 있는 내용만으로 답변하세요.
2. 확실하지 않은 내용은 "확인이 필요합니다"라고 안내하세요.
3. 법률 조문을 인용할 때는 정확한 조항을 명시하세요.
4. 금액, 기한 등 숫자 정보는 정확하게 전달하세요.
5. 답변 마지막에 관련 법조문이나 참고 페이지를 안내하세요.
6. 한국어로 답변하세요.

⚠ 이 답변은 AI가 생성한 참고용이며, 중요 사항은 관할 선거관리위원회에 확인하세요.`;

export async function POST(request: NextRequest) {
  try {
    const { message, context, history } = await request.json();

    if (!message || typeof message !== "string") {
      return Response.json({ error: "message required" }, { status: 400 });
    }

    // 1. Gemini로 질문 임베딩 생성
    const embedModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
    const embedResult = await embedModel.embedContent(message);
    const queryVector = embedResult.embedding.values;

    // 2. Pinecone 벡터 검색
    const index = pinecone.index(process.env.PINECONE_INDEX_NAME || "ddm");
    const searchResult = await index.query({
      vector: queryVector,
      topK: 5,
      includeMetadata: true,
    });

    // 3. 검색 결과를 컨텍스트로 구성
    const sources = (searchResult.matches || []).map((m) => ({
      id: m.id,
      score: m.score || 0,
      title: (m.metadata?.source as string) || "",
      page: (m.metadata?.page as number) || 0,
      content: (m.metadata?.text as string) || (m.metadata?.content as string) || "",
    }));

    const ragContext = sources
      .map((s, i) => `[참고자료 ${i + 1}] (${s.title}${s.page ? ` p.${s.page}` : ""})\n${s.content}`)
      .join("\n\n---\n\n");

    // 4. Gemini 채팅 생성
    const chatModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

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

          // 출처 정보 전송
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
