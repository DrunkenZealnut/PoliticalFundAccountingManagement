"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/stores/auth";
import { useChat } from "@/hooks/use-chat";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FAQ_DATA, getChapterItemCount, type FaqItem, type FaqChapter } from "@/lib/chat/faq-data";

export function ChatBubble() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const pathname = usePathname();
  const { orgId, orgName, orgType } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // FAQ 탐색 상태
  const [faqView, setFaqView] = useState<"categories" | "subsections" | "items">("categories");
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);
  const [selectedSubsection, setSelectedSubsection] = useState<number | null>(null);

  const { messages, isLoading, error, sendMessage, clearMessages, addMessages } = useChat({
    currentPage: pathname,
    orgType: orgType || undefined,
    orgId: orgId || undefined,
    orgName: orgName || undefined,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend() {
    if (!input.trim()) return;
    sendMessage(input);
    setInput("");
  }

  function handleFaqItem(item: FaqItem) {
    addMessages([
      { role: "user", content: item.q },
      { role: "assistant", content: item.a },
    ]);
  }


  function handleClearMessages() {
    clearMessages();
    setFaqView("categories");
    setSelectedChapter(null);
    setSelectedSubsection(null);
  }

  function handleSelectChapter(index: number) {
    const ch = FAQ_DATA[index];
    setSelectedChapter(index);
    if (ch.subsections && ch.subsections.length > 0) {
      // subsection이 있으면 subsection 목록으로
      setFaqView("subsections");
    } else {
      // subsection이 없으면 바로 Q&A 목록으로
      setFaqView("items");
    }
  }

  function handleSelectSubsection(index: number) {
    setSelectedSubsection(index);
    setFaqView("items");
  }

  function handleBack() {
    if (faqView === "items" && selectedSubsection !== null) {
      // Q&A → subsection 목록으로
      setSelectedSubsection(null);
      setFaqView("subsections");
    } else {
      // subsection 또는 items(subsection 없는 장) → 카테고리로
      setSelectedChapter(null);
      setSelectedSubsection(null);
      setFaqView("categories");
    }
  }

  function getCurrentItems(): FaqItem[] {
    if (selectedChapter === null) return [];
    const ch = FAQ_DATA[selectedChapter];
    if (ch.subsections && selectedSubsection !== null) {
      return ch.subsections[selectedSubsection].items;
    }
    return ch.items || [];
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
        <div className="fixed bottom-24 right-6 z-50 w-[28rem] h-[75vh] bg-white rounded-xl shadow-2xl border flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between shrink-0">
            <div>
              <h3 className="font-semibold text-base">정치자금 회계 상담</h3>
              <p className="text-sm text-blue-200">선관위 공식 자료 기반 AI 답변</p>
            </div>
            <button onClick={handleClearMessages} className="text-sm text-blue-200 hover:text-white">
              대화 초기화
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-4">
                <p className="text-base text-gray-500 text-center">
                  정치자금 회계처리에 대해 질문해 보세요.
                </p>

                {/* FAQ 탐색: 카테고리 → subsection → Q&A */}
                {faqView === "categories" && (
                  <div>
                    <p className="text-sm text-gray-400 mb-2 font-medium">자주 묻는 질문</p>
                    <div className="grid grid-cols-2 gap-2">
                      {FAQ_DATA.map((ch, idx) => (
                        <button
                          key={ch.chapter}
                          onClick={() => handleSelectChapter(idx)}
                          className="text-sm text-left px-3 py-2.5 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors"
                        >
                          <span className="font-medium">{ch.shortLabel}</span>
                          <span className="ml-1 text-emerald-400 text-xs">({getChapterItemCount(ch)})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {faqView === "subsections" && selectedChapter !== null && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <button
                        onClick={handleBack}
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                      >
                        ← 전체 목록
                      </button>
                      <span className="text-sm text-gray-500">|</span>
                      <span className="text-sm font-medium text-gray-700 truncate">
                        {FAQ_DATA[selectedChapter].shortLabel}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {FAQ_DATA[selectedChapter].subsections!.map((sub, idx) => (
                        <button
                          key={sub.label}
                          onClick={() => handleSelectSubsection(idx)}
                          className="w-full text-sm text-left px-3 py-2.5 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors"
                        >
                          <span className="font-medium">{sub.label}</span>
                          <span className="ml-1 text-emerald-400 text-xs">({sub.items.length})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {faqView === "items" && selectedChapter !== null && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <button
                        onClick={handleBack}
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                      >
                        ← 뒤로
                      </button>
                      <span className="text-sm text-gray-500">|</span>
                      <span className="text-sm font-medium text-gray-700 truncate">
                        {selectedSubsection !== null
                          ? FAQ_DATA[selectedChapter].subsections![selectedSubsection].label
                          : FAQ_DATA[selectedChapter].shortLabel}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      {getCurrentItems().map((item, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleFaqItem(item)}
                          className="w-full text-sm text-left px-3 py-2.5 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors leading-relaxed"
                        >
                          {item.q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-4 py-3 text-base ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-900"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div className="prose prose-base max-w-none [&_p]:my-1.5 [&_li]:my-0.5 [&_ul]:my-1.5 [&_h3]:text-base [&_h4]:text-sm">
                      {isLoading && i === messages.length - 1 ? (
                        <p className="whitespace-pre-wrap">{msg.content || "⏳ 답변 생성 중..."}</p>
                      ) : (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      )}
                    </div>
                  ) : (
                    <p>{msg.content}</p>
                  )}

                  {/* Sources */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <p className="text-sm font-semibold text-gray-500 mb-1">참고 자료:</p>
                      {msg.sources.slice(0, 3).map((s, j) => (
                        <p key={j} className="text-sm text-gray-400">
                          {j + 1}. {s.title}{s.page ? ` (p.${s.page})` : ""} — {Math.round(s.score * 100)}% 일치
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {error && (
              <div className="text-sm text-red-500 text-center bg-red-50 rounded p-2">
                {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Disclaimer */}
          <div className="px-4 py-1.5 bg-yellow-50 text-xs text-yellow-700 text-center shrink-0">
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
                className="flex-1 text-base border rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-400"
                disabled={isLoading}
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="px-4 py-2.5 bg-blue-600 text-white text-base rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
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
