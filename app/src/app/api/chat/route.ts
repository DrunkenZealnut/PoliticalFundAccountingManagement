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

const SYSTEM_PROMPT = `당신은 정치자금 회계관리 프로그램의 AI 도우미입니다.
아래 제공되는 **실제 회계 데이터(샘플)** 만을 근거로 답변하세요.

규칙:
1. 제공된 회계 데이터에 있는 내용만 답변하세요. 데이터에 없는 내용은 "등록된 데이터가 없습니다"라고 안내하세요.
2. 과목(계정-항목) 분류와 금액을 정확하게 인용하세요.
3. 같은 항목이 여러 과목에 걸쳐 있을 수 있으니, 모든 해당 내역을 빠짐없이 안내하세요.
4. 영수증 첨부 여부도 함께 안내하세요.
5. 한국어로 답변하세요.
6. 답변은 간결하고 표 형식으로 정리하세요.

⚠ 이 답변은 샘플 데이터 기반이며, 실제 회계 처리는 관할 선거관리위원회에 확인하세요.`;

interface AccBookRow {
  acc_book_id: number;
  incm_sec_cd: number;
  acc_sec_cd: number;
  item_sec_cd: number;
  acc_date: string;
  content: string;
  acc_amt: number;
  rcp_yn: string | null;
  customer: { name: string }[] | null;
}

interface CodeValue {
  cv_id: number;
  cs_id: number;
  cv_name: string;
}

async function fetchAccountingContext(orgId?: number): Promise<string> {
  const orgIds: number[] = [];
  if (orgId) {
    orgIds.push(orgId);
  } else {
    const { data: organs } = await supabase.from("organ").select("org_id");
    if (organs) orgIds.push(...organs.map((o: { org_id: number }) => o.org_id));
  }

  if (orgIds.length === 0) return "(등록된 기관이 없습니다)";

  // 코드값 조회 (과목명 매핑용)
  const { data: codes } = await supabase.from("codevalue").select("cv_id, cs_id, cv_name");
  const codeMap: Record<number, string> = {};
  (codes || []).forEach((c: CodeValue) => { codeMap[c.cv_id] = c.cv_name; });

  // 기관 정보
  const { data: orgInfo } = await supabase
    .from("organ")
    .select("org_id, org_name, org_sec_cd")
    .in("org_id", orgIds);

  // 잔액 요약
  let summaryCtx = "";
  for (const oid of orgIds) {
    const { data: summary } = await supabase.rpc("calculate_balance", { p_org_id: oid });
    if (summary?.[0]) {
      const org = (orgInfo || []).find((o: { org_id: number }) => o.org_id === oid);
      const s = summary[0];
      summaryCtx += `\n[${org?.org_name || `기관 ${oid}`} 요약]\n`;
      summaryCtx += `- 총 수입: ${Number(s.income_total).toLocaleString()}원\n`;
      summaryCtx += `- 총 지출: ${Number(s.expense_total).toLocaleString()}원\n`;
      summaryCtx += `- 잔  액: ${Number(s.balance).toLocaleString()}원\n`;
    }
  }

  // 전체 거래 내역 (과목 매핑 포함)
  const { data: transactions } = await supabase
    .from("acc_book")
    .select("acc_book_id, incm_sec_cd, acc_sec_cd, item_sec_cd, acc_date, content, acc_amt, rcp_yn, customer:cust_id(name)")
    .in("org_id", orgIds)
    .order("acc_date", { ascending: true });

  let ctx = "\n\n📊 회계 데이터:\n";
  ctx += summaryCtx;

  if (transactions?.length) {
    // 수입 내역
    const incomeItems = (transactions as AccBookRow[]).filter((t) => t.incm_sec_cd === 1);
    if (incomeItems.length > 0) {
      ctx += `\n[수입 내역 (${incomeItems.length}건)]\n`;
      ctx += "날짜 | 내용 | 계정 | 항목 | 금액 | 거래처 | 영수증\n";
      for (const t of incomeItems) {
        const date = `${t.acc_date.slice(0, 4)}-${t.acc_date.slice(4, 6)}-${t.acc_date.slice(6)}`;
        const accName = codeMap[t.acc_sec_cd] || String(t.acc_sec_cd);
        const itemName = codeMap[t.item_sec_cd] || String(t.item_sec_cd);
        const name = t.customer?.[0]?.name || "";
        ctx += `${date} | ${t.content} | ${accName} | ${itemName} | ${Number(t.acc_amt).toLocaleString()}원 | ${name} | ${t.rcp_yn === "Y" ? "O" : "X"}\n`;
      }
    }

    // 지출 내역
    const expenseItems = (transactions as AccBookRow[]).filter((t) => t.incm_sec_cd === 2);
    if (expenseItems.length > 0) {
      ctx += `\n[지출 내역 (${expenseItems.length}건)]\n`;
      ctx += "날짜 | 내용 | 계정 | 항목 | 금액 | 거래처 | 영수증\n";
      for (const t of expenseItems) {
        const date = `${t.acc_date.slice(0, 4)}-${t.acc_date.slice(4, 6)}-${t.acc_date.slice(6)}`;
        const accName = codeMap[t.acc_sec_cd] || String(t.acc_sec_cd);
        const itemName = codeMap[t.item_sec_cd] || String(t.item_sec_cd);
        const name = t.customer?.[0]?.name || "";
        ctx += `${date} | ${t.content} | ${accName} | ${itemName} | ${Number(t.acc_amt).toLocaleString()}원 | ${name} | ${t.rcp_yn === "Y" ? "O" : "X"}\n`;
      }
    }

    // 과목별 지출 요약 (항목-과목 매핑 참고표)
    ctx += "\n[과목별 지출 분류 요약]\n";
    ctx += "계정 | 항목 | 대표 내용 | 건수 | 합계\n";
    const categoryMap = new Map<string, { contents: string[]; total: number; count: number }>();
    for (const t of expenseItems) {
      const accName = codeMap[t.acc_sec_cd] || String(t.acc_sec_cd);
      const itemName = codeMap[t.item_sec_cd] || String(t.item_sec_cd);
      const key = `${accName} | ${itemName}`;
      const entry = categoryMap.get(key) || { contents: [], total: 0, count: 0 };
      entry.contents.push(t.content);
      entry.total += t.acc_amt;
      entry.count += 1;
      categoryMap.set(key, entry);
    }
    for (const [key, val] of categoryMap) {
      const uniqueContents = [...new Set(val.contents)].slice(0, 3).join(", ");
      ctx += `${key} | ${uniqueContents} | ${val.count}건 | ${val.total.toLocaleString()}원\n`;
    }
  } else {
    ctx += "\n(등록된 거래 내역이 없습니다)\n";
  }

  return ctx;
}

export async function POST(request: NextRequest) {
  try {
    const { message, context, history } = await request.json();

    if (!message || typeof message !== "string") {
      return Response.json({ error: "message required" }, { status: 400 });
    }

    // 1. 회계 데이터 조회 (항상 조회 — 샘플 데이터 기반 답변)
    let accountingContext = "";
    try {
      const orgId = context?.orgId ? Number(context.orgId) : undefined;
      accountingContext = await fetchAccountingContext(orgId);
    } catch (err) {
      console.error("Accounting data fetch error:", err);
      accountingContext = "(회계 데이터 조회 실패)";
    }

    // 2. Gemini 채팅 생성 (RAG 없이 회계 데이터만 사용)
    const chatModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const contextInfo = context
      ? `\n현재 사용자 환경:\n- 페이지: ${context.currentPage || "대시보드"}\n- 기관유형: ${context.orgType || "미정"}\n- 기관명: ${context.orgName || "미정"}\n- 기관ID: ${context.orgId || "미정"}`
      : "";

    const fullPrompt = `${SYSTEM_PROMPT}${contextInfo}\n${accountingContext}\n\n사용자 질문: ${message}`;

    const chatHistory = (history || []).map((h: { role: string; content: string }) => ({
      role: h.role === "user" ? "user" : "model",
      parts: [{ text: h.content }],
    }));

    const chat = chatModel.startChat({
      history: chatHistory,
      generationConfig: { maxOutputTokens: 4096, temperature: 0.3 },
    });

    // 3. 스트리밍 응답
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
