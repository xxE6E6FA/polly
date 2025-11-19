import { api } from "@convex/_generated/api";
import {
  HeartIcon,
  NotePencilIcon,
  SidebarSimpleIcon,
} from "@phosphor-icons/react";
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
  const [topShadow, setTopShadow] = useState(0);
  const [bottomShadow, setBottomShadow] = useState(0);
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
      setTopShadow(scrollTop > SCROLL_THRESHOLD ? SHADOW_HEIGHT : 0);
      setBottomShadow(
        scrollTop < scrollHeight - clientHeight - SCROLL_THRESHOLD
          ? SHADOW_HEIGHT
          : 0
      );
    } else {
      setTopShadow(0);
      setBottomShadow(0);
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
        "--shadow-height-top": `${topShadow}px`,
        "--shadow-height-bottom": `${bottomShadow}px`,
      }) as React.CSSProperties,
    [sidebarWidth, topShadow, bottomShadow]
  );

  const scrollContainerStyle = useMemo(() => {
    return {
      "--shadow-height-top": `${topShadow}px`,
      "--shadow-height-bottom": `${bottomShadow}px`,
    } as React.CSSProperties;
  }, [topShadow, bottomShadow]);

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
          "fixed inset-y-0 left-0 z-40 bg-sidebar dark:bg-sidebar border-r border-border/40",
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
            <div
              className="flex-shrink-0 pt-4 px-3 pb-2"
              style={
                isMobile
                  ? { paddingTop: "calc(env(safe-area-inset-top) + 16px)" }
                  : undefined
              }
            >
              <div className="flex items-center justify-between mb-4 pl-2 pr-2">
                <div className="flex items-center gap-2">
                  <Link
                    className="group flex items-center gap-2 text-sidebar-foreground/90 hover:text-sidebar-foreground transition-colors"
                    to={ROUTES.HOME}
                  >
                    <div
                      className="polly-logo-gradient-unified flex-shrink-0 w-6 h-6"
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
                    <span className="font-semibold text-sm tracking-tight">
                      Polly
                    </span>
                  </Link>
                </div>

                <div className="flex items-center gap-1">
                  {user &&
                    !user.isAnonymous &&
                    favorites &&
                    favorites.total > 0 && (
                      <Link to={ROUTES.FAVORITES}>
                        <Button
                          size="icon-sm"
                          title="New chat"
                          variant="ghost"
                          className="text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-hover h-8 w-8"
                        >
                          <HeartIcon
                            className="h-4.5 w-4.5"
                            weight={
                              location.pathname === ROUTES.FAVORITES
                                ? "fill"
                                : "regular"
                            }
                          />
                        </Button>
                      </Link>
                    )}

                  <Link to={ROUTES.HOME}>
                    <Button
                      size="icon-sm"
                      title="New chat"
                      variant="ghost"
                      className="text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-hover h-8 w-8"
                    >
                      <NotePencilIcon className="h-4.5 w-4.5" />
                    </Button>
                  </Link>
                  <Button
                    size="icon-sm"
                    title="Collapse sidebar"
                    variant="ghost"
                    className="text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-hover h-8 w-8"
                    onClick={() => setSidebarVisible(false)}
                  >
                    <SidebarSimpleIcon className="h-4.5 w-4.5" />
                  </Button>
                </div>
              </div>

              <div>
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
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/10 active:bg-primary/20 transition-colors z-10 group"
            data-sidebar-interactive="true"
            onMouseDown={handleResizeStart}
            onDoubleClick={handleDoubleClick}
          >
            <div className="absolute right-0 top-0 bottom-0 w-[1px] bg-transparent group-hover:bg-border/50 transition-colors" />
          </div>
        )}
      </div>

      {isMobile && (
        <>
          <Backdrop
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
                <SidebarSimpleIcon className="h-5 w-5" />
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
};
