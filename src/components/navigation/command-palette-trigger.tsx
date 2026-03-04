import { useCallback, useEffect } from "react";
import { useLocation } from "react-router-dom";

type CommandPaletteTriggerProps = {
  onTrigger: () => void;
};

export function CommandPaletteTrigger({
  onTrigger,
}: CommandPaletteTriggerProps) {
  const location = useLocation();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Only trigger on home, conversation, private mode, and canvas pages
      const isHomePage = location.pathname === "/";
      const isConversationPage = location.pathname.startsWith("/chat/");
      const isPrivatePage = location.pathname.startsWith("/private");
      const isCanvasPage = location.pathname.startsWith("/canvas");

      if (
        !(isHomePage || isConversationPage || isPrivatePage || isCanvasPage)
      ) {
        return;
      }

      // Cmd+K or Ctrl+K to open command palette
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onTrigger();
      }
    },
    [location.pathname, onTrigger]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return null;
}
