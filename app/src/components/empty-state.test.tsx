import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("renders icon, title, description", () => {
    render(
      <EmptyState
        icon="📥"
        title="아직 수입 내역이 없습니다"
        description="수입 자료를 등록하면 여기에 목록이 표시됩니다."
        actions={[{ label: "등록하기", href: "/dashboard/income" }]}
      />
    );

    expect(screen.getByText("📥")).toBeInTheDocument();
    expect(screen.getByText("아직 수입 내역이 없습니다")).toBeInTheDocument();
    expect(screen.getByText("수입 자료를 등록하면 여기에 목록이 표시됩니다.")).toBeInTheDocument();
  });

  it("renders action links with correct hrefs", () => {
    render(
      <EmptyState
        icon="📋"
        title="테스트"
        description="설명"
        actions={[
          { label: "마법사로 시작", href: "/dashboard/wizard" },
          { label: "직접 등록", href: "/dashboard/income", variant: "outline" },
        ]}
      />
    );

    const wizardLink = screen.getByText("마법사로 시작");
    expect(wizardLink.closest("a")).toHaveAttribute("href", "/dashboard/wizard");

    const directLink = screen.getByText("직접 등록");
    expect(directLink.closest("a")).toHaveAttribute("href", "/dashboard/income");
  });

  it("uses default icon when not provided", () => {
    const { container } = render(
      <EmptyState
        title="테스트 기본"
        description="설명 기본"
        actions={[{ label: "액션", href: "/" }]}
      />
    );

    const icons = container.querySelectorAll('[aria-hidden="true"]');
    const defaultIcon = Array.from(icons).find(el => el.textContent === "📋");
    expect(defaultIcon).toBeTruthy();
  });

  it("has role=status for accessibility", () => {
    const { container } = render(
      <EmptyState
        title="테스트"
        description="설명"
        actions={[{ label: "액션", href: "/" }]}
      />
    );

    expect(container.querySelector('[role="status"]')).toBeInTheDocument();
  });
});
