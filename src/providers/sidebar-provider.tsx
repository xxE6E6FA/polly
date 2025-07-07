import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getDefaultSidebarState,
  getSidebarFromStorage,
  setSidebarStorage,
} from "@/lib/sidebar-utils";

type SidebarContextValue = {
  isSidebarVisible: boolean;
  setSidebarVisible: (visible: boolean) => void;
  toggleSidebar: () => void;
  isMobile: boolean;
  mounted: boolean;
};

type SidebarProviderProps = {
  children: React.ReactNode;
  serverSidebarVisible?: boolean;
};

const SidebarContext = React.createContext<SidebarContextValue>({
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
  if (typeof document === "undefined") {
    return fn();
  }

  document.documentElement.classList.add("disable-animations");
  fn();

  setTimeout(() => {
    document.documentElement.classList.remove("disable-animations");
  }, 100);
}

export const SidebarProvider = ({
  children,
  serverSidebarVisible = false,
}: SidebarProviderProps) => {
  const [mounted, setMounted] = useState(false);
  const [clientSidebarVisible, setClientSidebarVisible] =
    useState(serverSidebarVisible);
  const [isMobile, setIsMobile] = useState(false);

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
      }
    });
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const newMobile = window.innerWidth < 1024;

      setIsMobile(prevMobile => {
        if (newMobile !== prevMobile) {
          if (newMobile) {
            setClientSidebarVisible(false);
            setSidebarStorage(false);
          } else {
            setClientSidebarVisible(true);
            setSidebarStorage(true);
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

      if (!isMobile) {
        setSidebarStorage(isVisible);
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

  const value: SidebarContextValue = useMemo(
    () => ({
      isSidebarVisible,
      setSidebarVisible,
      toggleSidebar,
      isMobile,
      mounted,
    }),
    [isSidebarVisible, setSidebarVisible, toggleSidebar, isMobile, mounted]
  );

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
};
