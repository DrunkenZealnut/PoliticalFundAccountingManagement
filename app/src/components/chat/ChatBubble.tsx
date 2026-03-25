"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/stores/auth";
import { useChat } from "@/hooks/use-chat";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const QUICK_ACTIONS = [
  { label: "후원금 한도액", message: "후원금 1회 및 연간 한도액은 얼마인가요?" },
  { label: "선거비용 vs 선거비용외", message: "선거비용과 선거비용외 정치자금의 차이는 무엇인가요?" },
  { label: "감사의견서 작성법", message: "감사의견서는 어떻게 작성하나요?" },
  { label: "영수증 기준", message: "영수증 첨부 기준과 미첨부 사유는?" },
  { label: "회계책임자 선임", message: "회계책임자 선임신고 절차를 알려주세요" },
  { label: "제출파일 생성", message: "선관위 제출파일은 어떻게 만드나요?" },
  { label: "결산 절차", message: "결산작업 절차와 주의사항은?" },
  { label: "후원회 등록", message: "후원회 등록 절차와 필요 서류는?" },
];

export function ChatBubble() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const pathname = usePathname();
  const { orgType } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, isLoading, error, sendMessage, clearMessages } = useChat({
    currentPage: pathname,
    orgType: orgType || undefined,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend() {
    if (!input.trim()) return;
    sendMessage(input);
    setInput("");
  }

  function handleQuickAction(message: string) {
    sendMessage(message);
  }

  return (
    <>
      {/* Chat Bubble Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-all flex items-center justify-center text-2xl"
        title="회계 상담 채팅"
      >
        {isOpen ? "✕" : "💬"}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-96 h-[70vh] bg-white rounded-xl shadow-2xl border flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between shrink-0">
            <div>
              <h3 className="font-semibold text-sm">정치자금 회계 상담</h3>
              <p className="text-xs text-blue-200">선관위 공식 자료 기반 AI 답변</p>
            </div>
            <button onClick={clearMessages} className="text-xs text-blue-200 hover:text-white">
              대화 초기화
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-gray-500 text-center">
                  정치자금 회계처리에 대해 질문해 보세요.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {QUICK_ACTIONS.map((qa) => (
                    <button
                      key={qa.label}
                      onClick={() => handleQuickAction(qa.message)}
                      className="text-xs text-left px-3 py-2 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 transition-colors"
                    >
                      {qa.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-900"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none [&_p]:my-1 [&_li]:my-0.5 [&_ul]:my-1">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content || (isLoading && i === messages.length - 1 ? "⏳ 답변 생성 중..." : "")}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p>{msg.content}</p>
                  )}

                  {/* Sources */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <p className="text-xs font-semibold text-gray-500 mb-1">참고 자료:</p>
                      {msg.sources.slice(0, 3).map((s, j) => (
                        <p key={j} className="text-xs text-gray-400">
                          {j + 1}. {s.title}{s.page ? ` (p.${s.page})` : ""} — {Math.round(s.score * 100)}% 일치
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {error && (
              <div className="text-xs text-red-500 text-center bg-red-50 rounded p-2">
                {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Disclaimer */}
          <div className="px-4 py-1 bg-yellow-50 text-[10px] text-yellow-700 text-center shrink-0">
            AI 참고용 답변입니다. 중요 사항은 선관위에 확인하세요.
          </div>

          {/* Input */}
          <div className="p-3 border-t shrink-0">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                placeholder="질문을 입력하세요..."
                className="flex-1 text-sm border rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400"
                disabled={isLoading}
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                {isLoading ? "..." : "전송"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
