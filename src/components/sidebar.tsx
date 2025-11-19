import { api } from "@convex/_generated/api";
import { HeartIcon, SidebarSimple } from "@phosphor-icons/react";
import { useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BatchActions } from "@/components/sidebar/batch-actions";
import { ConversationList } from "@/components/sidebar/conversation-list";
import { SidebarSearch } from "@/components/sidebar/search";
import { UserSection } from "@/components/sidebar/user-section";
import { Backdrop } from "@/components/ui/backdrop";
import { Button } from "@/components/ui/button";
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

const SCROLL_THRESHOLD = 6;
const SHADOW_HEIGHT = 6;

export const Sidebar = ({ forceHidden = false }: { forceHidden?: boolean }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [shadowHeight, setShadowHeight] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);
  const [isScrollHovered, setIsScrollHovered] = useState(false);
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

  const toggleSidebarWithCheck = useCallback(() => {
    if (!isSelectionMode) {
      toggleSidebar();
    }
  }, [toggleSidebar, isSelectionMode]);
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
        toggleSidebarWithCheck();
        return;
      }
      if (e.key === "Escape" && isMobile && isSidebarVisible) {
        e.preventDefault();
        setSidebarVisible(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebarWithCheck, isMobile, isSidebarVisible, setSidebarVisible]);

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

  const handleExpandZoneClick = useCallback(() => {
    if (isMobile) {
      return;
    }

    setSidebarVisible(true);
  }, [isMobile, setSidebarVisible]);

  const sidebarStyle = useMemo(
    () =>
      ({
        "--sidebar-width": `${sidebarWidth}px`,
        "--shadow-height": `${shadowHeight}px`,
      }) as React.CSSProperties,
    [sidebarWidth, shadowHeight]
  );

  const scrollContainerStyle = useMemo(() => {
    return {
      "--shadow-height": `${shadowHeight}px`,
    } as React.CSSProperties;
  }, [shadowHeight]);

  return (
    <>
      {!(isMobile || isSidebarVisible || forceHidden) && (
        <button
          type="button"
          aria-label="Expand sidebar"
          className="fixed inset-y-0 left-0 z-40 w-5 cursor-e-resize bg-transparent transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring hover:bg-muted/40"
          onClick={handleExpandZoneClick}
        />
      )}

      <div
        className={cn(
          "fixed inset-y-0 left-0 z-40 bg-card dark:bg-card",
          isSidebarVisible &&
            !forceHidden &&
            "dark:border-r dark:border-border",
          !forceHidden &&
            (isMobile
              ? "transform transition-transform duration-300 ease-out rounded-r-xl"
              : "transition-[width,transform] duration-300 ease-out"),
          isSidebarVisible && (isMobile ? "mobile-sidebar-elevation" : "")
        )}
        style={{
          ...sidebarStyle,
          width: (() => {
            if (isMobile) {
              return "clamp(280px, 88vw, 420px)";
            }
            if (isSidebarVisible) {
              return "var(--sidebar-width)";
            }
            return "0";
          })(),
          transform:
            (isMobile && !isSidebarVisible) || forceHidden
              ? "translateX(-100%)"
              : "translateX(0)",
        }}
        role={isMobile ? "dialog" : undefined}
        aria-modal={isMobile ? true : undefined}
        aria-hidden={!isSidebarVisible}
      >
        {isSidebarVisible && (
          <div className="flex h-full flex-col">
            <div className="flex-shrink-0">
              <div
                className="flex h-10 items-center px-3 pt-2"
                style={
                  isMobile
                    ? { paddingTop: "calc(env(safe-area-inset-top) + 8px)" }
                    : undefined
                }
              >
                <Link className="group ml-1.5 text-foreground" to={ROUTES.HOME}>
                  <div className="flex items-center gap-2">
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

                <div className="ml-auto">
                  <Button
                    size="icon-sm"
                    title="Collapse sidebar"
                    variant="ghost"
                    className="text-foreground/70 hover:text-foreground h-9 w-9"
                    onClick={() => setSidebarVisible(false)}
                  >
                    <SidebarSimple className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              {/* Search Bar - Distinct Form Input */}
              <div className="px-3 pt-2 pb-4">
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
                  : "scrollbar-thin",
                isScrollHovered && "sidebar-scroll-hover"
              )}
              style={scrollContainerStyle}
              onMouseEnter={() => {
                setHoveringOverSidebar(true);
                setIsScrollHovered(true);
              }}
              onMouseLeave={() => {
                setHoveringOverSidebar(false);
                setIsScrollHovered(false);
              }}
            >
              {user &&
                !user.isAnonymous &&
                favorites &&
                favorites.total > 0 && (
                  <div className="pb-3 border-b border-border/30">
                    <Link
                      to={ROUTES.FAVORITES}
                      className="flex items-center gap-2 py-2 px-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-200 no-underline"
                    >
                      <HeartIcon
                        className="h-4 w-4 text-amber-500 dark:text-amber-400 flex-shrink-0"
                        weight="fill"
                      />
                      <span className="text-xs font-semibold">Favorites</span>
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
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-muted active:bg-muted transition-colors z-10"
            data-sidebar-interactive="true"
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
              "z-backdrop lg:hidden transition-opacity duration-300",
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
                className="text-foreground/70 hover:text-foreground h-9 w-9"
                style={{ cursor: isSidebarVisible ? "w-resize" : "e-resize" }}
                onClick={toggleSidebarWithCheck}
              >
                <SidebarSimple className="h-5 w-5" />
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
};
