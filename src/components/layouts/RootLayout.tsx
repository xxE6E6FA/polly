import { Analytics } from "@vercel/analytics/react";
import { lazy, Suspense, useCallback, useState } from "react";
import { Outlet, useLocation } from "react-router";

import { AppProvider } from "@/providers/app-provider";

const CommandPalette = lazy(() =>
  import("../command-palette").then(m => ({ default: m.CommandPalette }))
);

import { CommandPaletteTrigger } from "../command-palette-trigger";
import { GlobalDragDropPrevention } from "../ui/global-drag-drop-prevention";
import { OnlineStatus } from "../ui/online-status";
import { Toaster } from "../ui/sonner";

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
