import { useCallback, useEffect } from "react";
import { toast } from "sonner";
import { usePrivateMode } from "@/contexts/private-mode-context";

export function useChatVisualMode(
  overridePrivateMode?: boolean,
  onToggleOverride?: () => void
) {
  const { isPrivateMode, togglePrivateMode } = usePrivateMode();

  // Use override if provided (for specific use cases), otherwise use context
  const effectivePrivateMode = overridePrivateMode ?? isPrivateMode;

  const handleToggle = useCallback(() => {
    if (onToggleOverride) {
      onToggleOverride();
    } else {
      togglePrivateMode();
      const newMode = !isPrivateMode;
      if (newMode) {
        toast.info("Private mode on", {
          description: "Your messages won't be saved",
        });
      } else {
        toast.info("Private mode off", {
          description: "Your messages will be saved to history",
        });
      }
    }
  }, [onToggleOverride, togglePrivateMode, isPrivateMode]);

  // Visual feedback effect
  useEffect(() => {
    if (effectivePrivateMode) {
      document.documentElement.classList.add("private-mode");
    } else {
      document.documentElement.classList.remove("private-mode");
    }

    return () => {
      document.documentElement.classList.remove("private-mode");
    };
  }, [effectivePrivateMode]);

  return {
    isPrivateMode: effectivePrivateMode,
    toggleMode: handleToggle,
  };
}
