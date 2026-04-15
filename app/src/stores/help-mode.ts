// Re-export from beginner-mode for backwards compatibility
import { useBeginnerMode } from "./beginner-mode";

export const useHelpMode = () => {
  const isEnabled = useBeginnerMode((s) => s.isEnabled);
  const toggle = useBeginnerMode((s) => s.toggle);
  return { isEnabled, toggle };
};
