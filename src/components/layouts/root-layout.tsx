import { Analytics } from "@vercel/analytics/react";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { ROUTES } from "@/lib/routes";
import { AppProvider } from "@/providers/app-provider";
import { usePrivateMode } from "@/providers/private-mode-context";

const CommandPalette = lazy(() =>
  import("@/components/navigation/command-palette").then(m => ({
    default: m.CommandPalette,
  }))
);

import { CommandPaletteTrigger } from "@/components/navigation/command-palette-trigger";
import { GlobalDragDropPrevention } from "@/components/ui/global-drag-drop-prevention";
import { OnlineStatus } from "@/components/ui/online-status";
import { Toaster } from "@/components/ui/sonner";

function PrivateModeKeyboardShortcut() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isPrivateMode, togglePrivateMode } = usePrivateMode();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + Shift + P for private mode toggle
      // Only works on home page or when already in private mode
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "p") {
        const canToggle =
          location.pathname === "/" || location.pathname.startsWith("/private");
        if (!canToggle) {
          return;
        }
        e.preventDefault();
        if (isPrivateMode && location.pathname.startsWith("/private")) {
          navigate(ROUTES.HOME);
        } else if (!isPrivateMode) {
          navigate(ROUTES.PRIVATE_CHAT);
        }
        togglePrivateMode();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPrivateMode, location.pathname, navigate, togglePrivateMode]);

  return null;
}

export default function RootLayout() {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const location = useLocation();

  // Handle command palette close - focus chat input on pages that have it
  const handleCommandPaletteClose = useCallback(() => {
    const isHomePage = location.pathname === "/";
    const isConversationPage = location.pathname.startsWith("/chat/");
    const isPrivateChatPage = location.pathname.startsWith("/private");

    // Focus chat input if we're on a page that has it
    if (isHomePage || isConversationPage || isPrivateChatPage) {
      // Find and focus the chat input textarea
      const chatInput = document.querySelector(
        'textarea[aria-label="Chat message input"]'
      ) as HTMLTextAreaElement;
      if (chatInput) {
        chatInput.focus();
      }
    }
  }, [location.pathname]);

  return (
    <AppProvider>
      <GlobalDragDropPrevention />
      <PrivateModeKeyboardShortcut />
      <CommandPaletteTrigger onTrigger={() => setCommandPaletteOpen(true)} />
      <Suspense fallback={null}>
        <CommandPalette
          open={commandPaletteOpen}
          onOpenChange={setCommandPaletteOpen}
          onClose={handleCommandPaletteClose}
        />
      </Suspense>
      <Outlet />
      <Toaster />
      <Analytics />
      <OnlineStatus variant="floating" />
    </AppProvider>
  );
}
