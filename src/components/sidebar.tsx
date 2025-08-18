import { api } from "@convex/_generated/api";
import { GearIcon, HeartIcon, SidebarSimpleIcon } from "@phosphor-icons/react";
import { useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { BatchActions } from "@/components/sidebar/batch-actions";
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
import {
  useBatchSelection,
  useSidebarHoverSetter,
} from "@/providers/batch-selection-context";
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
  const setHoveringOverSidebar = useSidebarHoverSetter();
  const params = useParams();
  const currentConversationId = params.conversationId as ConversationId;
  const { user } = useUserDataContext();
  const { isSelectionMode, hasSelection } = useBatchSelection();
  const [hasInitialized, setHasInitialized] = useState(false);
  const favorites = useQuery(
    api.messages.listFavorites,
    user && !user.isAnonymous ? { limit: 1 } : "skip"
  );

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
        return;
      }
      if (e.key === "Escape" && isMobile && isSidebarVisible) {
        e.preventDefault();
        setSidebarVisible(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar, isMobile, isSidebarVisible, setSidebarVisible]);

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

  useEffect(() => {
    if (!mounted) {
      return;
    }
    if (isMobile && isSidebarVisible) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isMobile, isSidebarVisible, mounted]);

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
    setSidebarVisible(false);
  }, [setSidebarVisible]);

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
          "fixed inset-y-0 left-0 z-40 bg-background dark:bg-card",
          isSidebarVisible && "dark:border-r dark:border-border",
          isMobile
            ? "transform transition-transform duration-300 ease-out rounded-r-xl"
            : "transition-[width] duration-300 ease-out",
          isSidebarVisible &&
            (isMobile ? "mobile-sidebar-elevation" : "shadow-xl")
        )}
        style={{
          ...sidebarStyle,
          width: isMobile
            ? "clamp(280px, 88vw, 420px)"
            : isSidebarVisible
              ? "var(--sidebar-width)"
              : "0",
          transform:
            isMobile && !isSidebarVisible
              ? "translateX(-100%)"
              : "translateX(0)",
        }}
        role={isMobile ? "dialog" : undefined}
        aria-modal={isMobile ? true : undefined}
        aria-hidden={!isSidebarVisible}
      >
        {isSidebarVisible && (
          <div className="flex h-full flex-col">
            <div className="flex-shrink-0 pb-2">
              <div
                className="relative flex h-12 items-center justify-center px-3"
                style={
                  isMobile
                    ? { paddingTop: "env(safe-area-inset-top)" }
                    : undefined
                }
              >
                {isMobile && (
                  <div className="absolute left-3">
                    <Button
                      size="icon-sm"
                      title="Close sidebar"
                      variant="ghost"
                      className="hover:bg-accent text-foreground/70 hover:text-foreground h-9 w-9"
                      onClick={() => setSidebarVisible(false)}
                    >
                      <SidebarSimpleIcon className="h-5 w-5 -scale-x-100" />
                    </Button>
                  </div>
                )}
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
                    <h1 className="leading-none font-semibold polly-logo-text-unified text-base">
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
                {isSelectionMode || hasSelection ? (
                  <BatchActions />
                ) : (
                  <SidebarSearch
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                  />
                )}
              </div>
            </div>

            <div
              ref={scrollContainerRef}
              className={cn(
                "flex-1 overflow-y-auto min-h-0 px-3 relative",
                isMobile
                  ? "hide-scrollbar overscroll-contain"
                  : "scrollbar-thin"
              )}
              style={scrollContainerStyle}
              onMouseEnter={() => setHoveringOverSidebar(true)}
              onMouseLeave={() => setHoveringOverSidebar(false)}
            >
              {user &&
                !user.isAnonymous &&
                favorites &&
                favorites.total > 0 && (
                  <div className="pb-2">
                    <Link to={ROUTES.FAVORITES}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start gap-1 h-auto py-1.5 px-0 hover:bg-accent/50"
                      >
                        <HeartIcon
                          className="h-3.5 w-3.5 text-destructive"
                          weight="fill"
                        />
                        <span className="text-xs font-medium uppercase tracking-wider text-foreground/70">
                          Favorites
                        </span>
                      </Button>
                    </Link>
                  </div>
                )}
              <ConversationList
                currentConversationId={currentConversationId}
                searchQuery={searchQuery}
              />
            </div>

            <div
              style={
                isMobile
                  ? { paddingBottom: "env(safe-area-inset-bottom)" }
                  : undefined
              }
            >
              <UserSection />
            </div>
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

          {!isSidebarVisible && (
            <div
              className="fixed left-1.5 z-[60]"
              style={{ top: "calc(env(safe-area-inset-top) + 6px)" }}
            >
              <Button
                size="icon-sm"
                title={isSidebarVisible ? "Collapse sidebar" : "Expand sidebar"}
                variant="ghost"
                className="hover:bg-accent text-foreground/70 hover:text-foreground h-9 w-9"
                style={{ cursor: isSidebarVisible ? "w-resize" : "e-resize" }}
                onClick={toggleSidebar}
              >
                <SidebarSimpleIcon className="h-5 w-5" />
              </Button>
            </div>
          )}
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
                style={{ cursor: isSidebarVisible ? "w-resize" : "e-resize" }}
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
