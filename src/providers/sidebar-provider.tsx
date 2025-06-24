import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import {
  setSidebarStorage,
  getSidebarFromStorage,
  getDefaultSidebarState,
} from "@/lib/sidebar-utils";

interface SidebarContextValue {
  isSidebarVisible: boolean;
  setSidebarVisible: (visible: boolean) => void;
  toggleSidebar: () => void;
  isMobile: boolean;
  mounted: boolean;
}

interface SidebarProviderProps {
  children: React.ReactNode;
  serverSidebarVisible?: boolean;
}

const SidebarContext = React.createContext<SidebarContextValue>({
  isSidebarVisible: false,
  setSidebarVisible: () => {},
  toggleSidebar: () => {},
  isMobile: false,
  mounted: false,
});

export function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}

// For backward compatibility
export function useServerSidebar() {
  const { isSidebarVisible } = useSidebar();
  return isSidebarVisible;
}

function withDisabledAnimations(fn: () => void) {
  if (typeof document === "undefined") return fn();

  document.documentElement.classList.add("disable-animations");
  fn();

  setTimeout(() => {
    document.documentElement.classList.remove("disable-animations");
  }, 100);
}

export function SidebarProvider({
  children,
  serverSidebarVisible = false,
}: SidebarProviderProps) {
  const [mounted, setMounted] = useState(false);
  const [clientSidebarVisible, setClientSidebarVisible] =
    useState(serverSidebarVisible);
  const [isMobile, setIsMobile] = useState(false);
  const [lastDesktopSidebarState, setLastDesktopSidebarState] = useState(true);

  // Initial setup
  useEffect(() => {
    withDisabledAnimations(() => {
      setMounted(true);

      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);

      if (mobile) {
        setClientSidebarVisible(false);
        setSidebarStorage(false);
      } else {
        const storedVisibility = getSidebarFromStorage();
        const finalVisibility =
          storedVisibility !== null
            ? storedVisibility
            : getDefaultSidebarState();
        setClientSidebarVisible(finalVisibility);
        setLastDesktopSidebarState(finalVisibility);
      }
    });
  }, []);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      const newMobile = window.innerWidth < 1024;

      setIsMobile(prevMobile => {
        if (newMobile !== prevMobile) {
          if (newMobile) {
            // Desktop to mobile transition
            setClientSidebarVisible(prev => {
              setLastDesktopSidebarState(prev);
              return false;
            });
            setSidebarStorage(false);
          } else {
            // Mobile to desktop transition
            setLastDesktopSidebarState(desktopState => {
              setClientSidebarVisible(desktopState);
              setSidebarStorage(desktopState);
              return desktopState;
            });
          }
        }
        return newMobile;
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const setSidebarVisible = useCallback(
    (isVisible: boolean) => {
      setClientSidebarVisible(isVisible);

      // Only save to localStorage on desktop
      if (!isMobile) {
        setSidebarStorage(isVisible);
        setLastDesktopSidebarState(isVisible);
      }
    },
    [isMobile]
  );

  const toggleSidebar = useCallback(() => {
    setSidebarVisible(!clientSidebarVisible);
  }, [clientSidebarVisible, setSidebarVisible]);

  const isSidebarVisible = mounted
    ? clientSidebarVisible
    : serverSidebarVisible;

  const value: SidebarContextValue = {
    isSidebarVisible,
    setSidebarVisible,
    toggleSidebar,
    isMobile,
    mounted,
  };

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
}
