import { describe, it, expect, beforeEach } from "vitest";
import { useBeginnerMode } from "./beginner-mode";

describe("beginner-mode store", () => {
  beforeEach(() => {
    // Reset store to default state
    useBeginnerMode.setState({
      isEnabled: true,
      workflowSteps: null,
      currentStepId: null,
      collapsedGuides: {},
    });
  });

  it("defaults to isEnabled=true", () => {
    expect(useBeginnerMode.getState().isEnabled).toBe(true);
  });

  it("toggles isEnabled", () => {
    useBeginnerMode.getState().toggle();
    expect(useBeginnerMode.getState().isEnabled).toBe(false);
    useBeginnerMode.getState().toggle();
    expect(useBeginnerMode.getState().isEnabled).toBe(true);
  });

  it("sets workflow steps and currentStep", () => {
    const steps = [
      { id: "organ", label: "사용기관관리", completed: true, href: "/dashboard/organ" },
      { id: "customer", label: "수입지출처 등록", completed: false, href: "/dashboard/customer" },
    ];
    useBeginnerMode.getState().setWorkflow(steps, "customer");

    const state = useBeginnerMode.getState();
    expect(state.workflowSteps).toHaveLength(2);
    expect(state.currentStepId).toBe("customer");
  });

  it("manages collapsed guides per pageId", () => {
    useBeginnerMode.getState().setGuideCollapsed("income", true);
    expect(useBeginnerMode.getState().collapsedGuides.income).toBe(true);

    useBeginnerMode.getState().setGuideCollapsed("income", false);
    expect(useBeginnerMode.getState().collapsedGuides.income).toBe(false);
  });

  it("preserves other collapsed states when setting one", () => {
    useBeginnerMode.getState().setGuideCollapsed("income", true);
    useBeginnerMode.getState().setGuideCollapsed("expense", true);

    const guides = useBeginnerMode.getState().collapsedGuides;
    expect(guides.income).toBe(true);
    expect(guides.expense).toBe(true);
  });
});
