import { GearIcon, SidebarIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
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
import { useUI } from "@/providers/ui-provider";
import { useUserDataContext } from "@/providers/user-data-context";
import type { ConversationId } from "@/types";

export const Sidebar = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const {
    isSidebarVisible,
    toggleSidebar,
    isMobile,
    setSidebarVisible,
    mounted,
  } = useUI();
  const params = useParams();
  const currentConversationId = params.conversationId as ConversationId;
  const { user } = useUserDataContext();
  const [hasInitialized, setHasInitialized] = useState(false);

  useEffect(() => {
    // Mark as initialized after first render to prevent animations on route changes
    if (mounted && !hasInitialized) {
      setHasInitialized(true);
    }
  }, [mounted, hasInitialized]);

  useEffect(() => {
    if (currentConversationId && isMobile) {
      setSidebarVisible(false);
    }
  }, [currentConversationId, isMobile, setSidebarVisible]);

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

  const handleBackdropClick = useCallback(() => {
    if (isMobile && isSidebarVisible) {
      setSidebarVisible(false);
    }
  }, [isMobile, isSidebarVisible, setSidebarVisible]);

  return (
    <div
      className={cn(
        "h-screen flex",
        mounted && hasInitialized && "transition-width duration-300 ease-out",
        isMobile ? "fixed inset-0 z-30" : "relative",
        isMobile && (isSidebarVisible ? "w-full" : "w-0"),
        !isMobile && (isSidebarVisible ? "w-80" : "w-0")
      )}
    >
      {isMobile && (
        <Backdrop
          blur="sm"
          variant="default"
          className={cn(
            "z-30 lg:hidden",
            isSidebarVisible ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
          onClick={handleBackdropClick}
        />
      )}

      <div
        className={cn(
          "fixed left-2 top-2 z-50",
          isMobile && "left-1.5 top-1.5"
        )}
      >
        {isMobile ? (
          <Button
            size="icon-sm"
            title={isSidebarVisible ? "Collapse sidebar" : "Expand sidebar"}
            variant="ghost"
            className={cn(
              "hover:bg-accent text-foreground/70 hover:text-foreground",
              "h-9 w-9"
            )}
            onClick={toggleSidebar}
          >
            <SidebarIcon className="h-5 w-5" />
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                className="text-foreground/70 hover:bg-accent hover:text-foreground"
                size="icon-sm"
                title={isSidebarVisible ? "Collapse sidebar" : "Expand sidebar"}
                variant="ghost"
                onClick={toggleSidebar}
              >
                <SidebarIcon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{isSidebarVisible ? "Collapse sidebar" : "Expand sidebar"}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <div
        className={cn(
          "bg-background dark:bg-card dark:border-r dark:border-border flex-shrink-0 overflow-hidden fixed left-0 top-0 h-screen z-40 shadow-xl",
          isSidebarVisible ? "w-80 opacity-100" : "w-0 opacity-0"
        )}
        style={{
          transition:
            mounted && hasInitialized
              ? "width 300ms cubic-bezier(0.4, 0, 0.2, 1), opacity 300ms cubic-bezier(0.4, 0, 0.2, 1)"
              : "none",
        }}
      >
        <div className="flex h-full w-80 flex-col">
          <div className="flex-shrink-0 pb-2">
            <div className="relative flex h-12 items-center justify-center px-3">
              <Link className="group" to={ROUTES.HOME}>
                <div className="flex items-center gap-1.5 transition-transform group-hover:scale-105">
                  <div
                    className={cn(
                      "polly-logo-gradient-unified flex-shrink-0",
                      "w-5 h-5"
                    )}
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
                  <h1
                    className={cn(
                      "leading-none font-bold polly-logo-text-unified",
                      "text-lg"
                    )}
                  >
                    Polly
                  </h1>
                </div>
              </Link>

              <div
                className={cn(
                  "absolute flex items-center",
                  isMobile ? "right-1.5 gap-2" : "right-3 gap-1"
                )}
              >
                {user && !user.isAnonymous && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link to={ROUTES.SETTINGS.ROOT}>
                        <Button
                          size="icon-sm"
                          title="Settings"
                          variant="ghost"
                          className={cn(
                            "text-muted-foreground hover:text-foreground transition-colors",
                            isMobile && "h-9 w-9"
                          )}
                        >
                          <GearIcon
                            className={cn(isMobile ? "h-5 w-5" : "h-4 w-4")}
                          />
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
                  className={cn(
                    "hover:bg-accent text-foreground/70 hover:text-foreground",
                    isMobile && "h-9 w-9"
                  )}
                />
              </div>
            </div>

            <div
              className={cn("space-y-3", isMobile ? "px-2 pb-3" : "px-3 pb-3")}
            >
              <SidebarSearch
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
              />
            </div>
          </div>

          <div
            className={cn(
              "flex-1 overflow-y-auto min-h-0 scrollbar-thin",
              isMobile ? "px-2" : "px-2"
            )}
          >
            <ConversationList
              currentConversationId={currentConversationId}
              searchQuery={searchQuery}
            />
          </div>

          <UserSection />
        </div>
      </div>
    </div>
  );
};
