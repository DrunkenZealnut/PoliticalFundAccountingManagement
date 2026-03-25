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
다음 참고 자료와 회계 데이터를 기반으로 정확하고 상세하게 답변해 주세요.

규칙:
1. 참고 자료와 회계 데이터에 있는 내용을 기반으로 충분히 상세하게 답변하세요.
2. 회계 데이터가 제공된 경우, 실제 금액과 거래 내역을 구체적으로 인용하세요.
3. 확실하지 않은 내용은 "확인이 필요합니다"라고 안내하세요.
4. 법률 조문을 인용할 때는 정확한 조항을 명시하세요.
5. 금액, 기한 등 숫자 정보는 정확하게 전달하세요.
6. 한국어로 답변하세요.

답변 형식:
- 질문에 대한 핵심 답변을 먼저 제시하세요.
- 관련 세부사항, 조건, 예외사항이 있으면 구체적으로 설명하세요.
- 실무에 도움이 되는 절차나 주의사항을 포함하세요.
- 답변 마지막에 근거 법조문이나 참고 자료 출처를 안내하세요.

⚠ 이 답변은 AI가 생성한 참고용이며, 중요 사항은 관할 선거관리위원회에 확인하세요.`;

// ─── 회계 데이터 조회 키워드 감지 ─────────────────────────────
const ACC_DATA_KEYWORDS = [
  "수입", "지출", "잔액", "비용", "금액", "얼마", "합계", "총액",
  "거래", "내역", "장부", "회계", "후원금", "보조금", "선거비용",
  "공보", "현수막", "인건비", "임대", "문자", "명함",
];

function needsAccountingData(message: string): boolean {
  return ACC_DATA_KEYWORDS.some((kw) => message.includes(kw));
}

interface AccBookRow {
  acc_book_id: number;
  incm_sec_cd: number;
  acc_date: string;
  content: string;
  acc_amt: number;
  customer: { name: string }[] | null;
}

async function fetchAccountingContext(message: string, orgId?: number): Promise<string> {
  // 기관 ID가 없으면 전체 기관 조회
  const orgIds: number[] = [];
  if (orgId) {
    orgIds.push(orgId);
  } else {
    const { data: organs } = await supabase.from("organ").select("org_id");
    if (organs) orgIds.push(...organs.map((o: { org_id: number }) => o.org_id));
  }

  if (orgIds.length === 0) return "";

  // 수입/지출 요약 (각 기관별)
  let summaryCtx = "";
  for (const oid of orgIds) {
    const { data: summary } = await supabase.rpc("calculate_balance", { p_org_id: oid });
    if (summary?.[0]) {
      const { data: orgInfo } = await supabase.from("organ").select("org_name").eq("org_id", oid).single();
      const s = summary[0];
      summaryCtx += `\n[${orgInfo?.org_name || `기관 ${oid}`} 수입/지출 요약]\n`;
      summaryCtx += `- 총 수입: ${Number(s.income_total).toLocaleString()}원\n`;
      summaryCtx += `- 총 지출: ${Number(s.expense_total).toLocaleString()}원\n`;
      summaryCtx += `- 잔  액: ${Number(s.balance).toLocaleString()}원\n`;
    }
  }

  // 관련 거래 내역 검색 (키워드 매칭)
  let query = supabase
    .from("acc_book")
    .select("acc_book_id, incm_sec_cd, acc_date, content, acc_amt, org_id, customer(name)")
    .in("org_id", orgIds)
    .order("acc_date", { ascending: true })
    .limit(50);

  // 메시지에서 특정 키워드로 필터링
  const contentKeywords = message.match(/공보|현수막|인건비|임대|문자|명함|조끼|모자|사무|다과|설치|철거|후원금|보조금|월세|수수료|전기|수도|정수기|라벨|봉투/g);
  if (contentKeywords) {
    const filters = contentKeywords.map((kw) => `content.ilike.%${kw}%`);
    query = query.or(filters.join(","));
  }

  const { data: transactions } = await query;

  if (!summaryCtx && !transactions?.length) return "";

  let ctx = "\n\n📊 회계 데이터 (2022년 오준석 구의원후보 실제 거래 기록):\n";
  ctx += summaryCtx;

  if (transactions?.length) {
    ctx += `\n[거래 내역 (${transactions.length}건)]\n`;
    for (const t of transactions as AccBookRow[]) {
      const type = t.incm_sec_cd === 1 ? "수입" : "지출";
      const date = `${t.acc_date.slice(0, 4)}-${t.acc_date.slice(4, 6)}-${t.acc_date.slice(6)}`;
      const name = t.customer?.[0]?.name || "";
      ctx += `- ${date} | ${type} | ${t.content} | ${Number(t.acc_amt).toLocaleString()}원 | ${name}\n`;
    }
  }

  return ctx;
}

export async function POST(request: NextRequest) {
  try {
    const { message, context, history } = await request.json();

    if (!message || typeof message !== "string") {
      return Response.json({ error: "message required" }, { status: 400 });
    }

    // 1. Gemini Embedding 2로 질문 임베딩 생성 (1536차원 MRL)
    const embedResponse = await fetch(
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
    );
    if (!embedResponse.ok) {
      const errText = await embedResponse.text();
      console.error("Embedding API error:", embedResponse.status, errText);
      return Response.json({ error: "임베딩 API 호출 실패" }, { status: 502 });
    }
    const embedResult = await embedResponse.json();
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

    // 3. 검색 결과를 컨텍스트로 구성 (유사도 0.3 이상만 사용)
    const sources = (docs || [])
      .filter((d: { similarity: number }) => (d.similarity || 0) >= 0.3)
      .map((d: { id: number; content: string; metadata: Record<string, unknown>; similarity: number }) => ({
        id: String(d.id),
        score: d.similarity || 0,
        title: (d.metadata?.source as string) || "",
        page: (d.metadata?.page as number) || 0,
        content: (d.content || "").slice(0, 1500),
      }));

    const ragContext = sources
      .map((s: { title: string; page: number; content: string; score: number }, i: number) =>
        `[참고자료 ${i + 1}] (${s.title}${s.page ? ` p.${s.page}` : ""}) — ${Math.round(s.score * 100)}% 일치\n${s.content}`
      )
      .join("\n\n---\n\n");

    // 4. 회계 데이터 조회 (질문이 회계 데이터 관련인 경우)
    let accountingContext = "";
    if (needsAccountingData(message)) {
      try {
        const orgId = context?.orgId ? Number(context.orgId) : undefined;
        accountingContext = await fetchAccountingContext(message, orgId);
      } catch (err) {
        console.error("Accounting data fetch error:", err);
      }
    }

    // 5. Gemini 채팅 생성
    const chatModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const contextInfo = context
      ? `\n현재 사용자 환경:\n- 페이지: ${context.currentPage || "대시보드"}\n- 기관유형: ${context.orgType || "미정"}\n- 기관명: ${context.orgName || "미정"}\n- 기관ID: ${context.orgId || "미정"}`
      : "";

    const fullPrompt = `${SYSTEM_PROMPT}${contextInfo}\n\n참고 자료:\n---\n${ragContext || "(검색된 참고 자료 없음)"}\n---${accountingContext}\n\n사용자 질문: ${message}`;

    // Build chat history
    const chatHistory = (history || []).map((h: { role: string; content: string }) => ({
      role: h.role === "user" ? "user" : "model",
      parts: [{ text: h.content }],
    }));

    const chat = chatModel.startChat({
      history: chatHistory,
      generationConfig: { maxOutputTokens: 4096, temperature: 0.3 },
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
