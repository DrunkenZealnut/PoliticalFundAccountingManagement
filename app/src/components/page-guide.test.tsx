import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PageGuide } from "./page-guide";

const mockSetGuideCollapsed = vi.fn();

vi.mock("@/stores/beginner-mode", () => ({
  useBeginnerMode: (selector: (s: Record<string, unknown>) => unknown) => {
    const state: Record<string, unknown> = {
      isEnabled: true,
      collapsedGuides: {},
      setGuideCollapsed: mockSetGuideCollapsed,
    };
    return selector(state);
  },
}));

const defaultProps = {
  pageId: "income",
  title: "수입내역관리 안내",
  summary: "후원금, 보조금 등 수입 자료를 등록·조회·수정하는 화면입니다.",
  steps: ["[신규입력] 클릭", "목록에서 자료 클릭"],
  tips: ["계정·과목이 어렵다면 마법사를 이용하세요."],
  wizardLink: "/dashboard/wizard",
  refPage: "p.23-30",
};

describe("PageGuide", () => {
  beforeEach(() => {
    mockSetGuideCollapsed.mockClear();
  });

  it("renders title when expanded", () => {
    render(<PageGuide {...defaultProps} />);
    expect(screen.getAllByText("수입내역관리 안내").length).toBeGreaterThan(0);
  });

  it("renders summary", () => {
    render(<PageGuide {...defaultProps} />);
    expect(screen.getAllByText(defaultProps.summary).length).toBeGreaterThan(0);
  });

  it("renders steps as ordered list", () => {
    render(<PageGuide {...defaultProps} />);
    expect(screen.getAllByText("[신규입력] 클릭").length).toBeGreaterThan(0);
    expect(screen.getAllByText("목록에서 자료 클릭").length).toBeGreaterThan(0);
  });

  it("renders tips", () => {
    render(<PageGuide {...defaultProps} />);
    expect(screen.getAllByText(/마법사를 이용하세요/).length).toBeGreaterThan(0);
  });

  it("renders wizard link with correct href", () => {
    render(<PageGuide {...defaultProps} />);
    const links = screen.getAllByText("간편등록 마법사로 이동");
    expect(links[0].closest("a")).toHaveAttribute("href", "/dashboard/wizard");
  });

  it("calls setGuideCollapsed on toggle click", () => {
    render(<PageGuide {...defaultProps} />);
    const buttons = screen.getAllByText(/접기/);
    fireEvent.click(buttons[0]);
    expect(mockSetGuideCollapsed).toHaveBeenCalledWith("income", true);
  });

  it("has aria-expanded on toggle button", () => {
    render(<PageGuide {...defaultProps} />);
    const button = screen.getAllByText("수입내역관리 안내")[0].closest("button");
    expect(button).toHaveAttribute("aria-expanded", "true");
  });
});
