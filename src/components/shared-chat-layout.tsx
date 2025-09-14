import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useNavigate } from "react-router";
import { Sidebar } from "@/components/sidebar";
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
  const [isExiting, setIsExiting] = useState(false);
  const [, startTransition] = useTransition();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevPrivateMode = useRef(isPrivateMode);
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

  useEffect(() => {
    if (prevPrivateMode.current && !isPrivateMode) {
      setIsExiting(true);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      startTransition(() => {
        timeoutRef.current = setTimeout(() => {
          setIsExiting(false);
          timeoutRef.current = null;
        }, 700);
      });
    }

    prevPrivateMode.current = isPrivateMode;
  }, [isPrivateMode]);

  const showPrivateBackground = isPrivateMode || isExiting;

  const mainStyle = useMemo(
    () => ({
      "--sidebar-width": `${sidebarWidth}px`,
      "--sidebar-visible": isSidebarVisible ? "1" : "0",
      marginLeft: !isMobile && isSidebarVisible ? "var(--sidebar-width)" : "0",
    }),
    [sidebarWidth, isSidebarVisible, isMobile]
  );

  return (
    <div className="flex min-h-[100dvh] w-full">
      <Sidebar />
      <main
        className={cn(
          "min-w-0 flex-1 overflow-hidden flex flex-col transition-all duration-300 ease-out bg-background",
          showPrivateBackground && "private-mode-background",
          isExiting && "exiting"
        )}
        style={mainStyle}
      >
        <div className="flex-1 overflow-hidden">{children}</div>
      </main>
    </div>
  );
};
