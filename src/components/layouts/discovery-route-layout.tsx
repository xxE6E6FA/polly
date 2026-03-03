import { ArrowLeftIcon, XIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { SquarePenIcon } from "@/components/animate-ui/icons/square-pen";
import {
  DiscoveryPanelSidebar,
  DiscoverySidebar,
} from "@/components/canvas/discovery-sidebar";
import { Button } from "@/components/ui/button";
import { useDiscoverySessionSync, useMediaQuery } from "@/hooks";
import { ROUTES } from "@/lib/routes";
import { useDiscoveryStore } from "@/stores/discovery-store";

/**
 * Wraps all /discover routes so the sidebar stays mounted across navigations
 * (entry form ↔ session).
 */
export default function DiscoveryRouteLayout() {
  const navigate = useNavigate();
  const { syncPause } = useDiscoverySessionSync();
  const isMobile = useMediaQuery("(max-width: 640px)");
  const isPanelVisible = useDiscoveryStore(s => s.isPanelVisible);
  const togglePanel = useDiscoveryStore(s => s.togglePanel);

  const handleResumeSession = useCallback(
    (sessionId: string) => {
      const state = useDiscoveryStore.getState();
      if (state.isActive && sessionId !== state.sessionId) {
        syncPause(state.sessionId);
      }
      // Close panel on mobile after selecting
      if (isMobile && isPanelVisible) {
        togglePanel();
      }
      navigate(ROUTES.DISCOVER_SESSION(sessionId));
    },
    [syncPause, navigate, isMobile, isPanelVisible, togglePanel]
  );

  return (
    <div className="flex h-[100dvh] bg-background">
      {/* Desktop: normal resizable sidebar */}
      {!isMobile && (
        <DiscoveryPanelSidebar onResumeSession={handleResumeSession} />
      )}

      {/* Mobile: overlay sidebar */}
      {isMobile && (
        <AnimatePresence>
          {isPanelVisible && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-sidebar bg-black/40"
                onClick={togglePanel}
              />
              {/* Panel */}
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="fixed inset-y-0 left-0 z-modal w-72 bg-sidebar border-r border-border/40 flex flex-col"
              >
                {/* Header */}
                <div className="flex items-center justify-between px-3 py-3">
                  <div className="flex items-center gap-1">
                    <Link to={ROUTES.CANVAS} viewTransition>
                      <Button
                        size="icon-sm"
                        title="Back to canvas"
                        variant="ghost"
                      >
                        <ArrowLeftIcon className="size-4.5" />
                      </Button>
                    </Link>
                    <Link to={ROUTES.DISCOVER}>
                      <Button
                        size="icon-sm"
                        title="New session"
                        variant="ghost"
                        onClick={togglePanel}
                      >
                        <SquarePenIcon animateOnHover className="size-4.5" />
                      </Button>
                    </Link>
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={togglePanel}>
                    <XIcon className="size-4" />
                  </Button>
                </div>
                {/* Session list */}
                <div className="flex-1 overflow-y-auto">
                  <DiscoverySidebar onResumeSession={handleResumeSession} />
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      )}

      <Outlet />
    </div>
  );
}
