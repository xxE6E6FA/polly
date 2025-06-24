import { Button } from "@/components/ui/button";
import { SidebarSearch } from "@/components/sidebar/search";
import { ConversationList } from "@/components/sidebar/conversation-list";
import { UserSection } from "@/components/sidebar/user-section";
import { ConversationId } from "@/types";
import { Settings, PanelLeft } from "lucide-react";

import { cn } from "@/lib/utils";
import { useState, useEffect, useCallback } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Link, useParams } from "react-router";
import { useUser } from "@/hooks/use-user";
import { useSidebar } from "@/hooks/use-sidebar";
import { ROUTES } from "@/lib/routes";

export function Sidebar() {
  const [searchQuery, setSearchQuery] = useState("");
  const {
    isSidebarVisible,
    toggleSidebar,
    isMobile,
    setSidebarVisible,
    mounted,
  } = useSidebar();
  const params = useParams();
  const currentConversationId = params.conversationId as ConversationId;
  const { user } = useUser();
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
      {isMobile && isSidebarVisible && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 lg:hidden"
          onClick={handleBackdropClick}
        />
      )}

      <div
        className={cn("fixed left-4 top-4 z-50", isMobile && "left-3 top-3")}
      >
        {isMobile ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleSidebar}
            className={cn(
              "hover:bg-accent text-foreground/70 hover:text-foreground",
              "h-10 w-10"
            )}
            title={isSidebarVisible ? "Collapse sidebar" : "Expand sidebar"}
          >
            <PanelLeft className="h-5 w-5" />
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={toggleSidebar}
                className="hover:bg-accent text-foreground/70 hover:text-foreground"
                title={isSidebarVisible ? "Collapse sidebar" : "Expand sidebar"}
              >
                <PanelLeft className="h-4 w-4" />
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
          "bg-background flex-shrink-0 overflow-hidden fixed left-0 top-0 h-screen z-40",
          "shadow-xl dark:shadow-none dark:border-r dark:border-border/50",
          isSidebarVisible ? "w-80 opacity-100" : "w-0 opacity-0"
        )}
        style={{
          transition:
            mounted && hasInitialized
              ? "width 300ms cubic-bezier(0.4, 0, 0.2, 1), opacity 300ms cubic-bezier(0.4, 0, 0.2, 1)"
              : "none",
        }}
        suppressHydrationWarning
      >
        <div className="flex flex-col h-full w-80">
          <div className="flex-shrink-0 pb-2">
            <div
              className={cn(
                "grid grid-cols-3 items-center",
                isMobile ? "h-20 px-4" : "h-16 px-4"
              )}
            >
              <div className="flex justify-start">
                {/* Left spacer - intentionally empty for balance */}
              </div>

              <div className="flex justify-center">
                <Link to={ROUTES.HOME} className="group">
                  <div className="flex items-center gap-2 transition-transform group-hover:scale-105">
                    <div
                      className={cn(
                        "polly-logo-gradient-unified",
                        isMobile ? "w-7 h-7" : "w-6 h-6"
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
                        "leading-none font-semibold polly-logo-text-unified",
                        isMobile ? "text-2xl" : "text-xl"
                      )}
                    >
                      Polly
                    </h1>
                  </div>
                </Link>
              </div>

              <div className="flex justify-end items-center gap-1">
                {user && !user.isAnonymous && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link to={ROUTES.SETTINGS.ROOT}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          title="Settings"
                        >
                          <Settings className="h-5 w-5" />
                        </Button>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Settings</p>
                    </TooltipContent>
                  </Tooltip>
                )}

                <ThemeToggle
                  variant="ghost"
                  size="icon-sm"
                  className={cn(
                    "hover:bg-accent text-foreground/70 hover:text-foreground",
                    isMobile && "h-10 w-10"
                  )}
                />
              </div>
            </div>

            <div
              className={cn("space-y-4", isMobile ? "px-4 pb-4" : "px-4 pb-4")}
            >
              <div>
                <Link to={ROUTES.HOME} className="block w-full">
                  <Button
                    variant="primary"
                    className={cn(
                      "w-full justify-center gap-2 text-sm font-medium shadow-sm hover:shadow-md transition-all duration-200",
                      isMobile && "h-11 text-base"
                    )}
                  >
                    New Chat
                  </Button>
                </Link>
              </div>

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
              searchQuery={searchQuery}
              currentConversationId={currentConversationId}
            />
          </div>

          <UserSection />
        </div>
      </div>
    </div>
  );
}
