import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { ChatBubble } from "./ChatBubble";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

// Mock auth store
vi.mock("@/stores/auth", () => ({
  useAuth: () => ({ orgId: 1, orgName: "테스트기관", orgType: "party" }),
}));

vi.mock("@/lib/chat/faq-data", () => {
  const FAQ_DATA = [
    {
      label: "제1장 · 정치자금 개요",
      shortLabel: "정치자금 개요",
      items: [
        { q: "정치자금이란 무엇인가요?", a: "정치자금이란 당비, 후원금 등입니다." },
        { q: "선거비용이란 무엇인가요?", a: "선거비용이란 선거운동을 위한 비용입니다." },
      ],
    },
    {
      label: "제2장 · 수입 회계처리",
      shortLabel: "수입 회계처리",
      subsections: [
        {
          label: "당비",
          items: [{ q: "당비란 무엇인가요?", a: "당비는 정당 가입자가 납부하는 금전입니다." }],
        },
      ],
    },
  ];
  return {
    FAQ_DATA,
    getChapterItemCount: (ch: { items?: unknown[]; subsections?: { items: unknown[] }[] }) => {
      if (ch.items) return ch.items.length;
      if (ch.subsections) return ch.subsections.reduce((sum: number, sub: { items: unknown[] }) => sum + sub.items.length, 0);
      return 0;
    },
  };
});

// Mock useChat hook
const mockSendMessage = vi.fn();
const mockClearMessages = vi.fn();
const mockAddMessages = vi.fn();
let mockMessages: Array<{ role: string; content: string; source?: string; sources?: unknown[] }> = [];

vi.mock("@/hooks/use-chat", () => ({
  useChat: () => ({
    messages: mockMessages,
    isLoading: false,
    error: null,
    sendMessage: mockSendMessage,
    clearMessages: mockClearMessages,
    addMessages: mockAddMessages,
  }),
}));

// Mock ReactMarkdown
vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));

vi.mock("remark-gfm", () => ({
  default: {},
}));

function openChat() {
  const bubble = screen.getByTitle("회계 상담 채팅");
  fireEvent.click(bubble);
}

describe("ChatBubble", () => {
  beforeEach(() => {
    mockMessages = [];
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders the chat bubble button", () => {
    render(<ChatBubble />);
    expect(screen.getByTitle("회계 상담 채팅")).toBeInTheDocument();
  });

  it("opens the chat panel when clicked", () => {
    render(<ChatBubble />);
    openChat();
    expect(screen.getByText("정치자금 회계 상담")).toBeInTheDocument();
  });

  it("shows FAQ categories when no messages exist", () => {
    render(<ChatBubble />);
    openChat();
    expect(screen.getByText("자주 묻는 질문")).toBeInTheDocument();
    expect(screen.getByText("정치자금 개요")).toBeInTheDocument();
    expect(screen.getByText("수입 회계처리")).toBeInTheDocument();
  });

  it("navigates to FAQ items when clicking a chapter without subsections", () => {
    render(<ChatBubble />);
    openChat();
    fireEvent.click(screen.getByText("정치자금 개요"));
    expect(screen.getByText("정치자금이란 무엇인가요?")).toBeInTheDocument();
    expect(screen.getByText("선거비용이란 무엇인가요?")).toBeInTheDocument();
  });

  it("navigates to subsections when clicking a chapter with subsections", () => {
    render(<ChatBubble />);
    openChat();
    fireEvent.click(screen.getByText("수입 회계처리"));
    expect(screen.getByText("당비")).toBeInTheDocument();
  });

  it("navigates back from items to categories", () => {
    render(<ChatBubble />);
    openChat();
    fireEvent.click(screen.getByText("정치자금 개요"));
    fireEvent.click(screen.getByText("← 뒤로"));
    expect(screen.getByText("정치자금 개요")).toBeInTheDocument();
    expect(screen.getByText("수입 회계처리")).toBeInTheDocument();
  });

  it("calls addMessages with FAQ source when clicking a FAQ item", () => {
    render(<ChatBubble />);
    openChat();
    fireEvent.click(screen.getByText("정치자금 개요"));
    fireEvent.click(screen.getByText("정치자금이란 무엇인가요?"));
    expect(mockAddMessages).toHaveBeenCalledWith([
      { role: "user", content: "정치자금이란 무엇인가요?", source: "faq" },
      { role: "assistant", content: "정치자금이란 당비, 후원금 등입니다.", source: "faq" },
    ]);
  });

  describe("duplicate FAQ prevention", () => {
    function clickFaqButton(text: string) {
      // Use data-testid to reliably target FAQ buttons, avoiding ambiguity
      // when the same text appears in both FAQ buttons and message bubbles.
      const allFaqButtons = screen.getAllByTestId(/^faq-item-/);
      const faqButton = allFaqButtons.find((el) => el.textContent === text);
      if (!faqButton) throw new Error(`FAQ button with text "${text}" not found`);
      fireEvent.click(faqButton);
    }

    it("scrolls to existing FAQ message instead of adding duplicate", () => {
      mockMessages = [
        { role: "user", content: "정치자금이란 무엇인가요?", source: "faq" },
        { role: "assistant", content: "정치자금이란 당비, 후원금 등입니다.", source: "faq" },
      ];
      render(<ChatBubble />);
      openChat();
      fireEvent.click(screen.getByText("정치자금 개요"));
      clickFaqButton("정치자금이란 무엇인가요?");
      expect(mockAddMessages).not.toHaveBeenCalled();
    });

    it("does not treat manual messages as FAQ duplicates", () => {
      mockMessages = [
        { role: "user", content: "정치자금이란 무엇인가요?" },
        { role: "assistant", content: "AI가 생성한 다른 답변입니다." },
      ];
      render(<ChatBubble />);
      openChat();
      fireEvent.click(screen.getByText("정치자금 개요"));
      clickFaqButton("정치자금이란 무엇인가요?");
      expect(mockAddMessages).toHaveBeenCalledWith([
        { role: "user", content: "정치자금이란 무엇인가요?", source: "faq" },
        { role: "assistant", content: "정치자금이란 당비, 후원금 등입니다.", source: "faq" },
      ]);
    });

    it("highlights both the question and answer for duplicates", () => {
      mockMessages = [
        { role: "user", content: "정치자금이란 무엇인가요?", source: "faq" },
        { role: "assistant", content: "정치자금이란 당비, 후원금 등입니다.", source: "faq" },
      ];
      render(<ChatBubble />);
      openChat();
      fireEvent.click(screen.getByText("정치자금 개요"));
      clickFaqButton("정치자금이란 무엇인가요?");

      const msg0 = document.getElementById("msg-0");
      const msg1 = document.getElementById("msg-1");
      expect(msg0?.className).toContain("ring-yellow-400");
      expect(msg1?.className).toContain("ring-yellow-400");
    });

    it("removes highlight after 1.5 seconds", () => {
      mockMessages = [
        { role: "user", content: "정치자금이란 무엇인가요?", source: "faq" },
        { role: "assistant", content: "정치자금이란 당비, 후원금 등입니다.", source: "faq" },
      ];
      render(<ChatBubble />);
      openChat();
      fireEvent.click(screen.getByText("정치자금 개요"));
      clickFaqButton("정치자금이란 무엇인가요?");

      const msg0 = document.getElementById("msg-0");
      expect(msg0?.className).toContain("ring-yellow-400");

      act(() => {
        vi.advanceTimersByTime(1500);
      });

      expect(msg0?.className).not.toContain("ring-yellow-400");
    });
  });

  describe("FAQ collapse toggle", () => {
    it("shows collapse toggle when messages exist", () => {
      mockMessages = [
        { role: "user", content: "테스트", source: "faq" },
        { role: "assistant", content: "답변", source: "faq" },
      ];
      render(<ChatBubble />);
      openChat();
      expect(screen.getByText(/자주 묻는 질문/)).toBeInTheDocument();
      expect(screen.getByText(/접기/)).toBeInTheDocument();
    });

    it("does not show collapse toggle when no messages", () => {
      render(<ChatBubble />);
      openChat();
      // The "자주 묻는 질문" heading should exist but not as a toggle button
      const toggleBtn = screen.queryByText(/접기/);
      expect(toggleBtn).not.toBeInTheDocument();
    });

    it("hides FAQ content when collapsed", () => {
      mockMessages = [
        { role: "user", content: "테스트", source: "faq" },
        { role: "assistant", content: "답변", source: "faq" },
      ];
      render(<ChatBubble />);
      openChat();

      // FAQ categories should be visible initially
      expect(screen.getByText("정치자금 개요")).toBeInTheDocument();

      // Click collapse toggle
      fireEvent.click(screen.getByText(/접기/));

      // FAQ categories should be hidden
      expect(screen.queryByText("정치자금 개요")).not.toBeInTheDocument();
      // Toggle should show "펼치기"
      expect(screen.getByText(/펼치기/)).toBeInTheDocument();
    });

    it("shows FAQ content when expanded", () => {
      mockMessages = [
        { role: "user", content: "테스트", source: "faq" },
        { role: "assistant", content: "답변", source: "faq" },
      ];
      render(<ChatBubble />);
      openChat();

      // Collapse
      fireEvent.click(screen.getByText(/접기/));
      expect(screen.queryByText("정치자금 개요")).not.toBeInTheDocument();

      // Expand
      fireEvent.click(screen.getByText(/펼치기/));
      expect(screen.getByText("정치자금 개요")).toBeInTheDocument();
    });
  });

  describe("handleClearMessages state reset", () => {
    it("resets faqCollapsed state on clear", () => {
      mockMessages = [
        { role: "user", content: "테스트", source: "faq" },
        { role: "assistant", content: "답변", source: "faq" },
      ];
      const { rerender } = render(<ChatBubble />);
      openChat();

      // Collapse FAQ
      fireEvent.click(screen.getByText(/접기/));
      expect(screen.queryByText("정치자금 개요")).not.toBeInTheDocument();

      // Clear messages
      fireEvent.click(screen.getByText("대화 초기화"));
      expect(mockClearMessages).toHaveBeenCalled();

      // Simulate messages being cleared
      mockMessages = [];
      rerender(<ChatBubble />);

      // FAQ should be visible again (not collapsed)
      expect(screen.getByText("정치자금 개요")).toBeInTheDocument();
    });
  });

  describe("chat input", () => {
    it("sends message on Enter", () => {
      render(<ChatBubble />);
      openChat();
      const input = screen.getByPlaceholderText("질문을 입력하세요...");
      fireEvent.change(input, { target: { value: "테스트 질문" } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(mockSendMessage).toHaveBeenCalledWith("테스트 질문");
    });

    it("does not send empty messages", () => {
      render(<ChatBubble />);
      openChat();
      const input = screen.getByPlaceholderText("질문을 입력하세요...");
      fireEvent.change(input, { target: { value: "   " } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it("sends message on button click", () => {
      render(<ChatBubble />);
      openChat();
      const input = screen.getByPlaceholderText("질문을 입력하세요...");
      fireEvent.change(input, { target: { value: "테스트 질문" } });
      fireEvent.click(screen.getByText("전송"));
      expect(mockSendMessage).toHaveBeenCalledWith("테스트 질문");
    });
  });
});
