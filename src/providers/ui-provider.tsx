import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CACHE_KEYS, get as getLS, set as setLS } from "@/lib/local-storage";

function setSidebarVisibility(isVisible: boolean): void {
  setLS<boolean>(CACHE_KEYS.sidebar, isVisible);
}

function getSidebarVisibility(): boolean {
  // Always default to false to prevent flash - user can open it if needed
  const stored = getLS<boolean>(CACHE_KEYS.sidebar, false);
  return stored;
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
  // Initialize state from localStorage immediately to prevent flash
  const [isSidebarVisible, setSidebarVisible] = useState(() => {
    // Only use serverSidebarVisible if we're on the server (no window object)
    if (typeof window === "undefined") {
      return serverSidebarVisible;
    }
    // On client, always read from localStorage
    return getSidebarVisibility();
  });
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.innerWidth < 768;
  });
  const [mounted, setMounted] = useState(false);
  const prevIsMobile = useRef(false);

  // Mark as mounted
  useEffect(() => {
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
