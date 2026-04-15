import { useState, useCallback } from "react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  source?: "faq" | "user";
}

interface ChatContext {
  currentPage?: string;
  orgType?: string;
  orgId?: number;
  orgName?: string;
}

export function useChat(context?: ChatContext) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(async (message: string) => {
    if (!message.trim() || isLoading) return;

    setError(null);
    const userMsg: ChatMessage = { role: "user", content: message };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    // Add empty assistant message for streaming
    const assistantMsg: ChatMessage = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, context, history }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "채팅 요청 실패");
      }

      if (!response.body) {
        throw new Error("응답 스트림을 읽을 수 없습니다");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

        for (const line of lines) {
          const data = line.slice(6);
          if (data === "[DONE]") break;

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "text") {
              fullContent += parsed.content;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { ...updated[updated.length - 1], content: fullContent };
                return updated;
              });
            } else if (parsed.type === "error") {
              throw new Error(parsed.content);
            }
          } catch {
            // skip malformed JSON lines
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류 발생");
      // Remove empty assistant message on error
      setMessages((prev) => prev.filter((m) => m.content !== "" || m.role !== "assistant"));
    } finally {
      setIsLoading(false);
    }
  }, [messages, isLoading, context]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  const addMessages = useCallback((msgs: ChatMessage[]) => {
    setMessages((prev) => [...prev, ...msgs]);
  }, []);

  return { messages, isLoading, error, sendMessage, clearMessages, addMessages };
}
