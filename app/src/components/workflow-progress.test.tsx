import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorkflowProgress } from "./workflow-progress";

const mockSetWorkflow = vi.fn();
let mockIsEnabled = true;
let mockWorkflowSteps: Array<{
  id: string; label: string; completed: boolean; href: string; wizardHref?: string;
}> | null = null;
let mockCurrentStepId: string | null = null;

vi.mock("@/stores/beginner-mode", () => ({
  useBeginnerMode: (selector: (s: Record<string, unknown>) => unknown) => {
    const state: Record<string, unknown> = {
      isEnabled: mockIsEnabled,
      workflowSteps: mockWorkflowSteps,
      currentStepId: mockCurrentStepId,
      setWorkflow: mockSetWorkflow,
    };
    return selector(state);
  },
}));

vi.mock("@/stores/auth", () => ({
  useAuth: () => ({ orgId: 1, orgType: "candidate" }),
}));

// Mock fetch — return empty response
global.fetch = vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ steps: [] }) })) as unknown as typeof fetch;

describe("WorkflowProgress", () => {
  beforeEach(() => {
    mockIsEnabled = true;
    mockWorkflowSteps = null;
    mockCurrentStepId = null;
    mockSetWorkflow.mockClear();
    vi.mocked(global.fetch).mockClear();
  });

  it("returns null when isEnabled is false", () => {
    mockIsEnabled = false;
    const { container } = render(<WorkflowProgress />);
    expect(container.innerHTML).toBe("");
  });

  it("returns null when workflowSteps is null", () => {
    mockWorkflowSteps = null;
    const { container } = render(<WorkflowProgress />);
    expect(container.innerHTML).toBe("");
  });

  it("returns null when workflowSteps is empty array", () => {
    mockWorkflowSteps = [];
    const { container } = render(<WorkflowProgress />);
    expect(container.innerHTML).toBe("");
  });

  it("renders steps with correct labels", () => {
    mockWorkflowSteps = [
      { id: "organ", label: "사용기관관리", completed: true, href: "/dashboard/organ" },
      { id: "customer", label: "수입지출처 등록", completed: false, href: "/dashboard/customer" },
    ];
    mockCurrentStepId = "customer";

    render(<WorkflowProgress />);

    expect(screen.getAllByText("사용기관관리").length).toBeGreaterThan(0);
    expect(screen.getAllByText("수입지출처 등록").length).toBeGreaterThan(0);
  });

  it("shows current step description and CTA", () => {
    mockWorkflowSteps = [
      { id: "organ", label: "사용기관관리", completed: true, href: "/dashboard/organ" },
      { id: "income", label: "수입 등록", completed: false, href: "/dashboard/income", wizardHref: "/dashboard/wizard" },
    ];
    mockCurrentStepId = "income";

    render(<WorkflowProgress />);

    expect(screen.getByText("현재 단계: 수입 등록")).toBeInTheDocument();
    expect(screen.getByText("간편등록 마법사로 시작")).toBeInTheDocument();
  });

  it("shows all-completed message when every step is done", () => {
    mockWorkflowSteps = [
      { id: "organ", label: "사용기관관리", completed: true, href: "/dashboard/organ" },
      { id: "customer", label: "수입지출처 등록", completed: true, href: "/dashboard/customer" },
    ];
    mockCurrentStepId = "customer";

    render(<WorkflowProgress />);

    expect(screen.getByText(/모든 업무 단계를 완료했습니다/)).toBeInTheDocument();
  });

  it("has role=navigation with aria-label", () => {
    mockWorkflowSteps = [
      { id: "organ", label: "사용기관관리", completed: true, href: "/dashboard/organ" },
    ];
    mockCurrentStepId = "organ";

    const { container } = render(<WorkflowProgress />);
    const nav = container.querySelector('[role="navigation"]');
    expect(nav).toBeInTheDocument();
    expect(nav).toHaveAttribute("aria-label", "회계 업무 진행 현황");
  });
});
