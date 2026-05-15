"use client";

import { useState, useRef, useEffect } from "react";
import { FAQ_DATA, getChapterItemCount, type FaqItem } from "@/lib/chat/faq-data";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  source: "faq";
};

export function ChatBubble() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // FAQ 탐색 상태
  const [faqView, setFaqView] = useState<"categories" | "subsections" | "items">("categories");
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);
  const [selectedSubsection, setSelectedSubsection] = useState<number | null>(null);
  const [faqCollapsed, setFaqCollapsed] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState<number | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function addMessages(msgs: ChatMessage[]) {
    setMessages((prev) => [...prev, ...msgs]);
  }

  function handleFaqItem(item: FaqItem) {
    // 이미 같은 FAQ 질문이 있으면 해당 위치로 스크롤
    const existingIndex = messages.findIndex(
      (msg) => msg.role === "user" && msg.content === item.q
    );
    if (existingIndex !== -1) {
      const el = document.getElementById(`msg-${existingIndex}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightIndex(existingIndex);
        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = setTimeout(() => setHighlightIndex(null), 1500);
      }
      return;
    }
    addMessages([
      { role: "user", content: item.q, source: "faq" },
      { role: "assistant", content: item.a, source: "faq" },
    ]);
  }


  function handleClearMessages() {
    setMessages([]);
    setFaqView("categories");
    setSelectedChapter(null);
    setSelectedSubsection(null);
    setFaqCollapsed(false);
    setHighlightIndex(null);
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
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
        title="자주 묻는 질문"
      >
        {isOpen ? "✕" : "💬"}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-[28rem] h-[75vh] bg-white rounded-xl shadow-2xl border flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between shrink-0">
            <div>
              <h3 className="font-semibold text-base">정치자금 회계 FAQ</h3>
              <p className="text-sm text-blue-200">선관위 공식 자료 기반 자주 묻는 질문</p>
            </div>
            <button onClick={handleClearMessages} className="text-sm text-blue-200 hover:text-white">
              초기화
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* FAQ 탐색: 항상 표시, 메시지 있을 때 접기/펼치기 */}
            <div className="space-y-4">
              {messages.length === 0 && (
                <p className="text-base text-gray-500 text-center">
                  카테고리를 선택해 자주 묻는 질문 정답을 확인하세요.
                </p>
              )}

              {messages.length > 0 && (
                <button
                  onClick={() => setFaqCollapsed(!faqCollapsed)}
                  className="w-full text-sm text-left px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition-colors flex items-center justify-between"
                >
                  <span className="font-medium">📚 자주 묻는 질문</span>
                  <span className="text-emerald-400">{faqCollapsed ? "▼ 펼치기" : "▲ 접기"}</span>
                </button>
              )}

              {(messages.length === 0 || !faqCollapsed) && (
                <>
                  {faqView === "categories" && (
                    <div>
                      {messages.length === 0 && (
                        <p className="text-sm text-gray-400 mb-2 font-medium">자주 묻는 질문</p>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        {FAQ_DATA.map((ch, idx) => (
                          <button
                            key={ch.label}
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
                        {FAQ_DATA[selectedChapter].subsections?.map((sub, idx) => (
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
                            ? FAQ_DATA[selectedChapter].subsections?.[selectedSubsection]?.label
                            : FAQ_DATA[selectedChapter].shortLabel}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1">
                        {getCurrentItems().map((item, idx) => (
                          <button
                            key={idx}
                            data-testid={`faq-item-${idx}`}
                            onClick={() => handleFaqItem(item)}
                            className="w-full text-sm text-left px-3 py-2.5 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors leading-relaxed"
                          >
                            {item.q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {messages.map((msg, i) => {
              const alignment = msg.role === "user" ? "justify-end" : "justify-start";
              const isHighlighted = highlightIndex !== null && (i === highlightIndex || i === highlightIndex + 1);
              const msgClassName = `flex ${alignment} ${isHighlighted ? "ring-2 ring-yellow-400 rounded-lg transition-all duration-300" : ""}`;
              return (
                <div key={i} id={`msg-${i}`} className={msgClassName}>
                  <div
                    className={`max-w-[85%] rounded-lg px-4 py-3 text-base whitespace-pre-wrap leading-relaxed ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-900"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              );
            })}

            <div ref={messagesEndRef} />
          </div>

          {/* Disclaimer */}
          <div className="px-4 py-1.5 bg-yellow-50 text-xs text-yellow-700 text-center shrink-0">
            FAQ는 참고용입니다. 중요 사항은 선관위에 확인하세요.
          </div>
        </div>
      )}
    </>
  );
}
