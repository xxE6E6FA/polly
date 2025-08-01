import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CACHE_KEYS, get as getLS, set as setLS } from "@/lib/local-storage";

function setSidebarVisibility(isVisible: boolean): void {
  setLS<boolean>(CACHE_KEYS.sidebar, isVisible);
}

function getSidebarVisibility(): boolean {
  const defaultVisible = window.innerWidth >= 768;
  return getLS<boolean>(CACHE_KEYS.sidebar, defaultVisible);
}

type UIContextValue = {
  isSidebarVisible: boolean;
  setSidebarVisible: (visible: boolean) => void;
  toggleSidebar: () => void;
  isMobile: boolean;
  mounted: boolean;
};

type UIProviderProps = {
  children: React.ReactNode;
  serverSidebarVisible?: boolean;
};

const UIContext = React.createContext<UIContextValue>({
  isSidebarVisible: false,
  setSidebarVisible: () => {
    // Default no-op
  },
  toggleSidebar: () => {
    // Default no-op
  },
  isMobile: false,
  mounted: false,
});

export function useUI() {
  const context = React.useContext(UIContext);
  if (!context) {
    throw new Error("useUI must be used within a UIProvider");
  }
  return context;
}

export const UIProvider = ({
  children,
  serverSidebarVisible = false,
}: UIProviderProps) => {
  const [isSidebarVisible, setSidebarVisible] = useState(serverSidebarVisible);
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  const prevIsMobile = useRef(false);

  // Initialize sidebar state
  useEffect(() => {
    const storedSidebarState = getSidebarVisibility();
    const defaultSidebarState = false;

    setSidebarVisible(
      storedSidebarState !== null ? storedSidebarState : defaultSidebarState
    );
    setMounted(true);
  }, []);

  // Handle mobile detection and resize
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      const wasDesktop = !prevIsMobile.current && mobile;

      setIsMobile(mobile);

      // Only auto-hide sidebar when transitioning from desktop to mobile
      if (wasDesktop && isSidebarVisible) {
        setSidebarVisible(false);
      }

      prevIsMobile.current = mobile;
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isSidebarVisible]);

  // Persist sidebar state
  useEffect(() => {
    if (mounted) {
      setSidebarVisibility(isSidebarVisible);
    }
  }, [isSidebarVisible, mounted]);

  const toggleSidebar = useCallback(() => {
    setSidebarVisible(prev => !prev);
  }, []);

  const value = useMemo(
    () => ({
      isSidebarVisible,
      setSidebarVisible,
      toggleSidebar,
      isMobile,
      mounted,
    }),
    [isSidebarVisible, toggleSidebar, isMobile, mounted]
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
};
