import { GearIcon, SidebarSimpleIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";

import { ConversationList } from "@/components/sidebar/conversation-list";
import { SidebarSearch } from "@/components/sidebar/search";
import { UserSection } from "@/components/sidebar/user-section";
import { Backdrop } from "@/components/ui/backdrop";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useBatchSelection } from "@/providers/batch-selection-context";
import { useSidebarWidth } from "@/providers/sidebar-width-context";
import { useUI } from "@/providers/ui-provider";
import { useUserDataContext } from "@/providers/user-data-context";
import type { ConversationId } from "@/types";

const SCROLL_THRESHOLD = 8;
const SHADOW_HEIGHT = 8;

export const Sidebar = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [shadowHeight, setShadowHeight] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);
  const {
    isSidebarVisible,
    toggleSidebar,
    isMobile,
    setSidebarVisible,
    mounted,
  } = useUI();
  const { sidebarWidth, setSidebarWidth, setIsResizing } = useSidebarWidth();
  const { setHoveringOverSidebar } = useBatchSelection();
  const params = useParams();
  const currentConversationId = params.conversationId as ConversationId;
  const { user } = useUserDataContext();
  const [hasInitialized, setHasInitialized] = useState(false);

  useEffect(() => {
    if (mounted && !hasInitialized) {
      setHasInitialized(true);
    }
  }, [mounted, hasInitialized]);

  useEffect(() => {
    if (currentConversationId && isMobile) {
      setSidebarVisible(false);
    }
  }, [currentConversationId, isMobile, setSidebarVisible]);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isScrollable = scrollHeight > clientHeight;

    if (isScrollable) {
      const topShadow = scrollTop > SCROLL_THRESHOLD ? SHADOW_HEIGHT : 0;
      const bottomShadow =
        scrollTop < scrollHeight - clientHeight - SCROLL_THRESHOLD
          ? SHADOW_HEIGHT
          : 0;
      setShadowHeight(Math.max(topShadow, bottomShadow));
    } else {
      setShadowHeight(0);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    container.addEventListener("scroll", handleScroll);
    handleScroll();

    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [handleScroll]);

  const handleBackdropClick = useCallback(() => {
    if (isMobile && isSidebarVisible) {
      setSidebarVisible(false);
    }
  }, [isMobile, isSidebarVisible, setSidebarVisible]);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);

      const startX = e.clientX;
      const startWidth = sidebarWidth;

      const handleMouseMove = (e: MouseEvent) => {
        const deltaX = e.clientX - startX;
        const newWidth = startWidth + deltaX;
        setSidebarWidth(newWidth);
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [sidebarWidth, setSidebarWidth, setIsResizing]
  );

  const handleDoubleClick = useCallback(() => {
    setSidebarWidth(320);
  }, [setSidebarWidth]);

  const sidebarStyle = useMemo(
    () =>
      ({
        "--sidebar-width": `${sidebarWidth}px`,
        "--shadow-height": `${shadowHeight}px`,
      }) as React.CSSProperties,
    [sidebarWidth, shadowHeight]
  );

  const scrollContainerStyle = useMemo(
    () =>
      ({
        "--shadow-height": `${shadowHeight}px`,
        maskImage:
          shadowHeight > 0
            ? "linear-gradient(to bottom, transparent, #000 var(--shadow-height), #000 calc(100% - var(--shadow-height)), transparent 100%)"
            : "none",
        WebkitMaskImage:
          shadowHeight > 0
            ? "linear-gradient(to bottom, transparent, #000 var(--shadow-height), #000 calc(100% - var(--shadow-height)), transparent 100%)"
            : "none",
      }) as React.CSSProperties,
    [shadowHeight]
  );

  return (
    <>
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-40 bg-background dark:bg-card dark:border-r dark:border-border shadow-xl",
          isMobile
            ? "w-full transform transition-transform duration-300 ease-out"
            : "transition-[width] duration-300 ease-out"
        )}
        style={{
          ...sidebarStyle,
          width: isMobile
            ? "100%"
            : isSidebarVisible
              ? "var(--sidebar-width)"
              : "0",
          transform:
            isMobile && !isSidebarVisible
              ? "translateX(-100%)"
              : "translateX(0)",
        }}
      >
        {isSidebarVisible && (
          <div className="flex h-full flex-col">
            <div className="flex-shrink-0 pb-2">
              <div className="relative flex h-12 items-center justify-center px-3">
                <Link className="group" to={ROUTES.HOME}>
                  <div className="flex items-center gap-1.5 transition-transform group-hover:scale-105">
                    <div
                      className="polly-logo-gradient-unified flex-shrink-0 w-5 h-5"
                      style={{
                        maskImage: "url('/favicon.svg')",
                        maskSize: "contain",
                        maskRepeat: "no-repeat",
                        maskPosition: "center",
                        WebkitMaskImage: "url('/favicon.svg')",
                        WebkitMaskSize: "contain",
                        WebkitMaskRepeat: "no-repeat",
                        WebkitMaskPosition: "center",
                      }}
                    />
                    <h1 className="leading-none font-bold polly-logo-text-unified text-lg">
                      Polly
                    </h1>
                  </div>
                </Link>

                <div className="absolute flex items-center gap-1 right-3">
                  {user && !user.isAnonymous && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link to={ROUTES.SETTINGS.ROOT}>
                          <Button
                            size="icon-sm"
                            title="Settings"
                            variant="ghost"
                            className="text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <GearIcon className="h-4 w-4 transition-colors" />
                          </Button>
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Settings</p>
                      </TooltipContent>
                    </Tooltip>
                  )}

                  <ThemeToggle
                    size="icon-sm"
                    variant="ghost"
                    className="hover:bg-accent text-foreground/70 hover:text-foreground"
                  />
                </div>
              </div>

              <div className="space-y-3 px-3 pb-3">
                <SidebarSearch
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                />
              </div>
            </div>

            <div
              ref={scrollContainerRef}
              className="flex-1 overflow-y-auto min-h-0 scrollbar-thin px-3 relative"
              style={scrollContainerStyle}
              onMouseEnter={() => setHoveringOverSidebar(true)}
              onMouseLeave={() => setHoveringOverSidebar(false)}
            >
              <ConversationList
                currentConversationId={currentConversationId}
                searchQuery={searchQuery}
              />
            </div>

            <UserSection />
          </div>
        )}

        {!isMobile && isSidebarVisible && (
          <div
            ref={resizeRef}
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/50 active:bg-accent transition-colors z-10"
            onMouseDown={handleResizeStart}
            onDoubleClick={handleDoubleClick}
          />
        )}
      </div>

      {isMobile && (
        <>
          <Backdrop
            blur="sm"
            variant="default"
            className={cn(
              "z-30 lg:hidden transition-opacity duration-300",
              isSidebarVisible ? "opacity-100" : "opacity-0 pointer-events-none"
            )}
            onClick={handleBackdropClick}
          />

          <div className="fixed left-1.5 top-1.5 z-[60]">
            <Button
              size="icon-sm"
              title={isSidebarVisible ? "Collapse sidebar" : "Expand sidebar"}
              variant="ghost"
              className="hover:bg-accent text-foreground/70 hover:text-foreground h-9 w-9"
              onClick={toggleSidebar}
            >
              <SidebarSimpleIcon className="h-5 w-5" />
            </Button>
          </div>
        </>
      )}

      {!isMobile && (
        <div className="fixed left-2 top-2 z-50">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                className="text-foreground/70 hover:bg-accent hover:text-foreground"
                size="icon-sm"
                title={isSidebarVisible ? "Collapse sidebar" : "Expand sidebar"}
                variant="ghost"
                onClick={toggleSidebar}
              >
                <SidebarSimpleIcon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{isSidebarVisible ? "Collapse sidebar" : "Expand sidebar"}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      )}
    </>
  );
};
