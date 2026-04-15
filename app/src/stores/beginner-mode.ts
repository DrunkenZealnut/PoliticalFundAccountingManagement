import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface WorkflowStep {
  id: string;
  label: string;
  completed: boolean;
  count?: number;
  href: string;
  wizardHref?: string;
}

interface BeginnerModeState {
  isEnabled: boolean;
  toggle: () => void;
  workflowSteps: WorkflowStep[] | null;
  currentStepId: string | null;
  setWorkflow: (steps: WorkflowStep[], currentStep: string) => void;
  collapsedGuides: Record<string, boolean>;
  setGuideCollapsed: (pageId: string, collapsed: boolean) => void;
}

export const useBeginnerMode = create<BeginnerModeState>()(
  persist(
    (set) => ({
      isEnabled: true,
      toggle: () => set((s) => ({ isEnabled: !s.isEnabled })),
      workflowSteps: null,
      currentStepId: null,
      setWorkflow: (steps, currentStep) =>
        set({ workflowSteps: steps, currentStepId: currentStep }),
      collapsedGuides: {},
      setGuideCollapsed: (pageId, collapsed) =>
        set((s) => ({
          collapsedGuides: { ...s.collapsedGuides, [pageId]: collapsed },
        })),
    }),
    {
      name: "beginner-mode",
      partialize: (state) => ({
        isEnabled: state.isEnabled,
        collapsedGuides: state.collapsedGuides,
      }),
    }
  )
);
