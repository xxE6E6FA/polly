import { createContext, type ReactNode, useContext, useState } from "react";
import { CACHE_KEYS, get, set } from "@/lib/local-storage";

const MIN_SIDEBAR_WIDTH = 320;
const MAX_SIDEBAR_WIDTH = 600;

interface SidebarWidthContextType {
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  isResizing: boolean;
  setIsResizing: (resizing: boolean) => void;
}

const SidebarWidthContext = createContext<SidebarWidthContextType | null>(null);

export function SidebarWidthProvider({ children }: { children: ReactNode }) {
  // Initialize from localStorage synchronously to prevent animation on first render
  const [sidebarWidth, setSidebarWidthState] = useState(() => {
    if (typeof window === "undefined") {
      return MIN_SIDEBAR_WIDTH;
    }
    const savedWidth = get(CACHE_KEYS.sidebarWidth, MIN_SIDEBAR_WIDTH);
    return Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, savedWidth));
  });
  const [isResizing, setIsResizing] = useState(false);

  const setSidebarWidth = (width: number) => {
    const constrainedWidth = Math.max(
      MIN_SIDEBAR_WIDTH,
      Math.min(MAX_SIDEBAR_WIDTH, width)
    );
    setSidebarWidthState(constrainedWidth);
    set(CACHE_KEYS.sidebarWidth, constrainedWidth);
  };

  return (
    <SidebarWidthContext.Provider
      value={{
        sidebarWidth,
        setSidebarWidth,
        isResizing,
        setIsResizing,
      }}
    >
      {children}
    </SidebarWidthContext.Provider>
  );
}

export function useSidebarWidth() {
  const context = useContext(SidebarWidthContext);
  if (!context) {
    throw new Error(
      "useSidebarWidth must be used within a SidebarWidthProvider"
    );
  }
  return context;
}
