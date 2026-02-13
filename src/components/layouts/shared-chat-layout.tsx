import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useNavigate } from "react-router-dom";
import { PrivateModeHeader } from "@/components/chat/private-mode-header";
import { PrivateToggle } from "@/components/chat/private-toggle";
import { Sidebar } from "@/components/navigation/sidebar";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { usePrivateMode } from "@/providers/private-mode-context";
import { useSidebarWidth } from "@/providers/sidebar-width-context";
import { useUI } from "@/providers/ui-provider";

type SharedChatLayoutProps = {
  children: React.ReactNode;
};

export const SharedChatLayout = ({ children }: SharedChatLayoutProps) => {
  const { isPrivateMode } = usePrivateMode();
  const { isSidebarVisible, isMobile } = useUI();
  const { sidebarWidth } = useSidebarWidth();
  const [, _startTransition] = useTransition();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Keyboard shortcut for starting a new chat
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // CMD/CTRL + SHIFT + O for new chat - using keyCode as fallback for reliability
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        (e.key === "O" || e.key === "o" || e.keyCode === 79)
      ) {
        e.preventDefault();
        navigate(ROUTES.HOME);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  const showPrivateBackground = isPrivateMode;

  // In private mode, we effectively hide the sidebar by setting width to 0 in calculations
  // or by ensuring the main content takes full width.
  const effectiveSidebarVisible = isSidebarVisible && !isPrivateMode;

  const mainStyle = useMemo(() => {
    const style: React.CSSProperties = {
      "--sidebar-width": `${sidebarWidth}px`,
      "--sidebar-visible": effectiveSidebarVisible ? "1" : "0",
    } as React.CSSProperties;

    // Only apply margin-left if we're NOT in private mode (or exiting).
    // In private mode, we rely on the tailwind classes (mx-4) to set the margins.
    // Inline styles override classes, so we must not set it here if we want mx-4 to work.
    if (!showPrivateBackground) {
      style.marginLeft =
        !isMobile && effectiveSidebarVisible ? "var(--sidebar-width)" : "0";
    }

    return style;
  }, [sidebarWidth, effectiveSidebarVisible, isMobile, showPrivateBackground]);

  return (
    <div
      className={cn(
        "flex min-h-[100dvh] w-full transition-colors duration-500 relative",
        isPrivateMode ? "bg-foreground" : "bg-background"
      )}
    >
      <Sidebar forceHidden={isPrivateMode} />
      <PrivateModeHeader />
      <PrivateToggle />

      <main
        className={cn(
          "min-w-0 flex-1 overflow-hidden flex flex-col transition-[margin,padding,border-radius,box-shadow] duration-300 ease-out",
          // Base styles
          "bg-background",
          // Private mode specific styles: use margins to create the "shrunk" card effect
          // mt-12 gives space for the header
          showPrivateBackground
            ? "mx-4 mb-4 mt-12 rounded-xl border border-border/50 shadow-xl ring-1 ring-black/5 dark:ring-white/5"
            : ""
        )}
        style={mainStyle}
      >
        <div className="flex-1 overflow-hidden relative z-10">{children}</div>
      </main>
    </div>
  );
};
