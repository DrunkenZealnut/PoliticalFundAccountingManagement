import { NextRequest } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import { ELECTION_COST_GUIDE } from "@/lib/chat/election-cost-guide";
import { SAMPLE_ACCOUNTING_DATA } from "@/lib/chat/sample-accounting-data";

// Vercel serverless 함수 타임아웃 확장 (Hobby: 최대 60초)
export const maxDuration = 60;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { db: { schema: "pfam" } }
);

const SYSTEM_PROMPT = `당신은 정치자금 회계관리 프로그램의 AI 도우미입니다.
아래 제공되는 자료를 근거로 답변하세요.

답변 규칙:
1. 제공된 자료에 근거하여 정확하게 답변하세요.
2. 과목 분류, 보전 여부, 관련 법조항을 함께 안내하세요.
3. 답변은 **간결하게** 작성하세요. 빈 줄을 반복하지 마세요.
4. 표는 5행 이내로 핵심만 정리하세요. 긴 표 대신 항목별 요약을 사용하세요.
5. 자료에 없는 내용은 "관할 선거관리위원회에 문의하세요"라고 안내하세요.
6. 한국어로 답변하세요.

⚠ 이 답변은 참고용이며, 실제 회계 처리는 관할 선거관리위원회에 확인하세요.`;

// ─── 키워드 기반 관련 섹션 추출 ─────────────────────────────
const SECTION_KEYWORDS: Record<string, string[]> = {
  "기탁금": ["제56조", "제60조의2", "기탁금"],
  "홈페이지|인터넷|앱|모바일": ["제59조", "인터넷 홈페이지"],
  "사무소|월세|임차|전기|수도|정수기|사무용|문구|다과|개소식|관리비|계약금": ["제60조의3.*선거사무소", "제61조.*후보자의 선거사무소", "사무소 관련"],
  "간판|현수막|현판|설치|철거": ["간판.*현수막", "제61조.*간판", "제67조", "현수막 관련"],
  "명함|피켓": ["명함", "제60조의3.*명함", "명함 관련"],
  "전화|문자|이메일|전자우편|통화|메시지": ["전자우편.*전화.*문자", "제59조.*전자우편", "제82조의4", "전화.*문자"],
  "홍보물|공보물|봉투|발송|라벨": ["홍보물", "제60조의3.*홍보물", "제65조", "선거벽보.*선거공보"],
  "어깨띠|조끼|모자|소품|장갑": ["어깨띠", "제68조", "소품"],
  "공약|공약집": ["공약집", "제60조의4"],
  "방송|광고|신문": ["방송광고", "방송연설", "신문광고", "인터넷 광고", "제69조", "제70조", "제71조", "제82조의7"],
  "연설|대담|차량|유세|래핑|확성": ["공개장소", "제79조", "제104조"],
  "수당|실비|식사|식대|취사|숙박": ["수당.*실비", "제135조"],
  "여론조사": ["여론조사", "제108조"],
  "기부|식비": ["기부행위", "제112조"],
  "답례|인사서신": ["답례", "제118조"],
  "자동차|표지|벽보|코팅": ["확성장치.*자동차", "제91조"],
  "행렬|자전거": ["행렬", "제105조"],
  "점자|시각장애": ["점자형", "제65조.*점자", "점자형 선거공보"],
  "후원|후원금|기명|익명": ["후원금 수입"],
  "보전|미보전|선거비용": ["보전대상", "비보전대상", "선거비용과 선거비용이 아닌"],
};

function extractRelevantSections(message: string, fullText: string): string {
  const messageLower = message.toLowerCase();

  // 매칭되는 키워드 그룹 찾기
  const matchedPatterns: string[] = [];
  for (const [keywords, patterns] of Object.entries(SECTION_KEYWORDS)) {
    const keywordList = keywords.split("|");
    if (keywordList.some((kw) => messageLower.includes(kw))) {
      matchedPatterns.push(...patterns);
    }
  }

  // 매칭 없으면 일반 안내만 반환
  if (matchedPatterns.length === 0) {
    return "(질문과 관련된 구체적인 항목 정보가 없습니다. 항목명을 포함하여 다시 질문해주세요.)";
  }

  // 전체 텍스트에서 관련 섹션 추출 (## 기준으로 분리)
  const sections = fullText.split(/(?=^## )/m);
  const matched: string[] = [];

  for (const section of sections) {
    const sectionLower = section.toLowerCase();
    for (const pattern of matchedPatterns) {
      try {
        if (new RegExp(pattern, "i").test(section) || sectionLower.includes(pattern.toLowerCase())) {
          if (!matched.includes(section)) {
            matched.push(section.trim());
          }
          break;
        }
      } catch {
        if (sectionLower.includes(pattern.toLowerCase())) {
          if (!matched.includes(section)) {
            matched.push(section.trim());
          }
          break;
        }
      }
    }
  }

  // 최대 3개 섹션, 각 섹션 최대 2000자로 제한
  return matched
    .slice(0, 3)
    .map((s) => s.slice(0, 2000))
    .join("\n\n---\n\n");
}

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

const PAGE_CONTEXT: Record<string, string> = {
  "/dashboard": "대시보드 — 수입/지출 요약과 업무 진행 현황을 보여주는 메인 화면입니다.",
  "/dashboard/income": "수입내역관리 — 후원금, 보조금 등 수입을 등록·조회·수정하는 화면입니다. 계정→과목→수입제공자→금액 순서로 입력합니다.",
  "/dashboard/expense": "지출내역관리 — 지출을 등록·조회·수정하는 화면입니다. 계정→과목→지출유형→지출방법→지출대상자→금액 순서로 입력합니다.",
  "/dashboard/customer": "수입지출처관리 — 수입제공자(후원자)와 지출대상자(거래처)를 등록·관리하는 화면입니다.",
  "/dashboard/organ": "사용기관관리 — 회계 사용기관 정보와 회계기간을 설정하는 화면입니다.",
  "/dashboard/wizard": "간편등록 마법사 — 카드 선택만으로 계정·과목이 자동 설정되는 초보자용 등록 화면입니다.",
  "/dashboard/settlement": "결산작업 — 수입·지출·재산을 종합하여 결산을 수행하는 화면입니다.",
  "/dashboard/estate": "재산내역관리 — 토지, 건물, 현금 및 예금 등 재산을 등록하는 화면입니다.",
  "/dashboard/reports": "보고서 출력 — 수입부, 지출부, 총괄표 등 회계보고 서식을 출력하는 화면입니다.",
};

function getPageContext(pathname: string): string {
  const ctx = PAGE_CONTEXT[pathname];
  return ctx ? `\n현재 화면: ${ctx}` : "";
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

  const { data: codes } = await supabase.from("codevalue").select("cv_id, cs_id, cv_name");
  const codeMap: Record<number, string> = {};
  (codes || []).forEach((c: CodeValue) => { codeMap[c.cv_id] = c.cv_name; });

  const { data: orgInfo } = await supabase
    .from("organ")
    .select("org_id, org_name, org_sec_cd")
    .in("org_id", orgIds);

  let summaryCtx = "";
  for (const oid of orgIds) {
    const { data: summary } = await supabase.rpc("calculate_balance", { p_org_id: oid });
    if (summary?.[0]) {
      const org = (orgInfo || []).find((o: { org_id: number }) => o.org_id === oid);
      const s = summary[0];
      summaryCtx += `[${org?.org_name || `기관 ${oid}`}] 수입: ${Number(s.income_total).toLocaleString()}원, 지출: ${Number(s.expense_total).toLocaleString()}원, 잔액: ${Number(s.balance).toLocaleString()}원\n`;
    }
  }

  const { data: transactions } = await supabase
    .from("acc_book")
    .select("acc_book_id, incm_sec_cd, acc_sec_cd, item_sec_cd, acc_date, content, acc_amt, rcp_yn, customer:cust_id(name)")
    .in("org_id", orgIds)
    .order("acc_date", { ascending: true });

  let ctx = "\n📊 현재 기관 회계 요약:\n" + summaryCtx;

  if (transactions?.length) {
    const expenseItems = (transactions as AccBookRow[]).filter((t) => t.incm_sec_cd === 2);
    if (expenseItems.length > 0) {
      ctx += `\n지출 내역 (${expenseItems.length}건):\n`;
      for (const t of expenseItems.slice(0, 30)) {
        const date = `${t.acc_date.slice(0, 4)}-${t.acc_date.slice(4, 6)}-${t.acc_date.slice(6)}`;
        const accName = codeMap[t.acc_sec_cd] || String(t.acc_sec_cd);
        const itemName = codeMap[t.item_sec_cd] || String(t.item_sec_cd);
        const name = t.customer?.[0]?.name || "";
        ctx += `${date} | ${t.content} | ${accName}>${itemName} | ${Number(t.acc_amt).toLocaleString()}원 | ${name} | 영수증:${t.rcp_yn === "Y" ? "O" : "X"}\n`;
      }
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

    if (message.length > 2000) {
      return Response.json({ error: "메시지는 2000자 이내로 입력해주세요" }, { status: 400 });
    }

    // 1. 회계 데이터 조회
    let accountingContext = "";
    try {
      const orgId = context?.orgId ? Number(context.orgId) : undefined;
      accountingContext = await fetchAccountingContext(orgId);
    } catch (err) {
      console.error("Accounting data fetch error:", err);
      accountingContext = "(회계 데이터 조회 실패)";
    }

    // 2. 질문 관련 섹션만 추출 (컨텍스트 최적화)
    const relevantGuide = extractRelevantSections(message, ELECTION_COST_GUIDE);
    const relevantSample = extractRelevantSections(message, SAMPLE_ACCOUNTING_DATA);

    // 3. Gemini 채팅 생성
    const chatModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const pageContext = context?.currentPage ? getPageContext(context.currentPage) : "";
    const contextInfo = context
      ? `\n사용자: ${context.orgName || "미정"} (${context.orgType || "미정"})${pageContext}`
      : "";

    const fullPrompt = `${SYSTEM_PROMPT}${contextInfo}\n${accountingContext}\n\n📋 관련 보전항목 가이드:\n${relevantGuide}\n\n📊 관련 샘플 데이터:\n${relevantSample}\n\n사용자 질문: ${message}`;

    const chatHistory = (history || []).map((h: { role: string; content: string }) => ({
      role: h.role === "user" ? "user" : "model",
      parts: [{ text: h.content }],
    }));

    const chat = chatModel.startChat({
      history: chatHistory,
      generationConfig: { maxOutputTokens: 2048, temperature: 0.3 },
    });

    // 4. 스트리밍 응답
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
