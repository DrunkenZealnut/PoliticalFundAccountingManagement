import { create } from "zustand";
import { persist } from "zustand/middleware";

interface HelpModeState {
  isEnabled: boolean;
  toggle: () => void;
}

export const useHelpMode = create<HelpModeState>()(
  persist(
    (set) => ({
      isEnabled: true,
      toggle: () => set((s) => ({ isEnabled: !s.isEnabled })),
    }),
    { name: "help-mode" }
  )
);
