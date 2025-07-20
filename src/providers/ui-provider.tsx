import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
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

function withDisabledAnimations(fn: () => void) {
  const style = document.createElement("style");
  style.textContent = `
    * {
      transition: none !important;
      animation: none !important;
    }
  `;
  document.head.appendChild(style);

  fn();

  // Re-enable animations after a short delay
  setTimeout(() => {
    document.head.removeChild(style);
  }, 100);
}

export const UIProvider = ({
  children,
  serverSidebarVisible = false,
}: UIProviderProps) => {
  const [isSidebarVisible, setSidebarVisible] = useState(serverSidebarVisible);
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Initialize sidebar state
  useEffect(() => {
    const storedSidebarState = getSidebarVisibility();
    const defaultSidebarState = false; // Default to false as per new function

    withDisabledAnimations(() => {
      setSidebarVisible(
        storedSidebarState !== null ? storedSidebarState : defaultSidebarState
      );
    });

    setMounted(true);
  }, []);

  // Handle mobile detection and resize
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);

      // Auto-hide sidebar on mobile
      if (mobile && isSidebarVisible) {
        setSidebarVisible(false);
      }
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
