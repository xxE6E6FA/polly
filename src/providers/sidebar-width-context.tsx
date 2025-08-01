import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
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
  const [sidebarWidth, setSidebarWidthState] = useState(MIN_SIDEBAR_WIDTH);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    const savedWidth = get(CACHE_KEYS.sidebarWidth, MIN_SIDEBAR_WIDTH);
    setSidebarWidthState(
      Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, savedWidth))
    );
  }, []);

  const setSidebarWidth = (width: number) => {
    const constrainedWidth = Math.max(
      MIN_SIDEBAR_WIDTH,
      Math.min(MAX_SIDEBAR_WIDTH, width)
    );
    setSidebarWidthState(constrainedWidth);
    if (constrainedWidth !== MIN_SIDEBAR_WIDTH) {
      set(CACHE_KEYS.sidebarWidth, constrainedWidth);
    }
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
