import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { ChatBubble } from "./ChatBubble";

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

function openChat() {
  const bubble = screen.getByTitle("자주 묻는 질문");
  fireEvent.click(bubble);
}

function clickFaqItemByText(text: string) {
  // FAQ 항목 버튼을 data-testid로 안정적으로 찾음 (메시지 버블의 텍스트와 충돌 방지)
  const allFaqButtons = screen.getAllByTestId(/^faq-item-/);
  const faqButton = allFaqButtons.find((el) => el.textContent === text);
  if (!faqButton) throw new Error(`FAQ button with text "${text}" not found`);
  fireEvent.click(faqButton);
}

describe("ChatBubble", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders the chat bubble button", () => {
    render(<ChatBubble />);
    expect(screen.getByTitle("자주 묻는 질문")).toBeInTheDocument();
  });

  it("opens the chat panel when clicked", () => {
    render(<ChatBubble />);
    openChat();
    expect(screen.getByText("정치자금 회계 FAQ")).toBeInTheDocument();
  });

  it("shows FAQ categories when no messages exist", () => {
    render(<ChatBubble />);
    openChat();
    expect(screen.getByText("자주 묻는 질문")).toBeInTheDocument();
    expect(screen.getByText("정치자금 개요")).toBeInTheDocument();
    expect(screen.getByText("수입 회계처리")).toBeInTheDocument();
  });

  it("does not render a free-text input (AI chat removed)", () => {
    render(<ChatBubble />);
    openChat();
    expect(screen.queryByPlaceholderText("질문을 입력하세요...")).not.toBeInTheDocument();
    expect(screen.queryByText("전송")).not.toBeInTheDocument();
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

  it("renders question and answer as messages when clicking a FAQ item", () => {
    render(<ChatBubble />);
    openChat();
    fireEvent.click(screen.getByText("정치자금 개요"));
    clickFaqItemByText("정치자금이란 무엇인가요?");

    // 메시지 영역에 질문/답변이 추가됨 (msg-0, msg-1 컨테이너)
    expect(document.getElementById("msg-0")).toBeInTheDocument();
    expect(document.getElementById("msg-1")).toBeInTheDocument();
    expect(document.getElementById("msg-1")?.textContent).toContain(
      "정치자금이란 당비, 후원금 등입니다."
    );
  });

  describe("duplicate FAQ prevention", () => {
    it("does not add a duplicate when the same FAQ item is clicked again", () => {
      render(<ChatBubble />);
      openChat();
      fireEvent.click(screen.getByText("정치자금 개요"));

      // 1st click → user + assistant 2개 메시지 추가
      clickFaqItemByText("정치자금이란 무엇인가요?");
      expect(document.getElementById("msg-0")).toBeInTheDocument();
      expect(document.getElementById("msg-1")).toBeInTheDocument();
      expect(document.getElementById("msg-2")).toBeNull();

      // 2nd click → 추가 없음, highlight만
      clickFaqItemByText("정치자금이란 무엇인가요?");
      expect(document.getElementById("msg-2")).toBeNull();
    });

    it("highlights both the question and answer for duplicates", () => {
      render(<ChatBubble />);
      openChat();
      fireEvent.click(screen.getByText("정치자금 개요"));
      clickFaqItemByText("정치자금이란 무엇인가요?");
      clickFaqItemByText("정치자금이란 무엇인가요?");

      const msg0 = document.getElementById("msg-0");
      const msg1 = document.getElementById("msg-1");
      expect(msg0?.className).toContain("ring-yellow-400");
      expect(msg1?.className).toContain("ring-yellow-400");
    });

    it("removes highlight after 1.5 seconds", () => {
      render(<ChatBubble />);
      openChat();
      fireEvent.click(screen.getByText("정치자금 개요"));
      clickFaqItemByText("정치자금이란 무엇인가요?");
      clickFaqItemByText("정치자금이란 무엇인가요?");

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
      render(<ChatBubble />);
      openChat();
      fireEvent.click(screen.getByText("정치자금 개요"));
      clickFaqItemByText("정치자금이란 무엇인가요?");

      // 카테고리 화면으로 돌아간 뒤 collapse 토글이 나타남
      fireEvent.click(screen.getByText("← 뒤로"));
      expect(screen.getByText(/접기/)).toBeInTheDocument();
    });

    it("does not show collapse toggle when no messages", () => {
      render(<ChatBubble />);
      openChat();
      expect(screen.queryByText(/접기/)).not.toBeInTheDocument();
    });

    it("hides FAQ content when collapsed", () => {
      render(<ChatBubble />);
      openChat();
      fireEvent.click(screen.getByText("정치자금 개요"));
      clickFaqItemByText("정치자금이란 무엇인가요?");
      fireEvent.click(screen.getByText("← 뒤로"));

      // FAQ 카테고리가 보임
      expect(screen.getByText("정치자금 개요")).toBeInTheDocument();

      // Collapse
      fireEvent.click(screen.getByText(/접기/));

      // 카테고리 사라짐
      expect(screen.queryByText("정치자금 개요")).not.toBeInTheDocument();
      expect(screen.getByText(/펼치기/)).toBeInTheDocument();
    });

    it("shows FAQ content when expanded", () => {
      render(<ChatBubble />);
      openChat();
      fireEvent.click(screen.getByText("정치자금 개요"));
      clickFaqItemByText("정치자금이란 무엇인가요?");
      fireEvent.click(screen.getByText("← 뒤로"));

      fireEvent.click(screen.getByText(/접기/));
      expect(screen.queryByText("정치자금 개요")).not.toBeInTheDocument();

      fireEvent.click(screen.getByText(/펼치기/));
      expect(screen.getByText("정치자금 개요")).toBeInTheDocument();
    });
  });

  describe("handleClearMessages state reset", () => {
    it("resets messages and view state on clear", () => {
      render(<ChatBubble />);
      openChat();
      fireEvent.click(screen.getByText("정치자금 개요"));
      clickFaqItemByText("정치자금이란 무엇인가요?");

      expect(document.getElementById("msg-0")).toBeInTheDocument();

      // 초기화
      fireEvent.click(screen.getByText("초기화"));

      // 메시지 사라지고 카테고리 화면으로 복귀
      expect(document.getElementById("msg-0")).toBeNull();
      expect(screen.getByText("정치자금 개요")).toBeInTheDocument();
      expect(screen.getByText("수입 회계처리")).toBeInTheDocument();
    });
  });
});
