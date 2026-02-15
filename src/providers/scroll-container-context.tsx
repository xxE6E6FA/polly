import type React from "react";
import { createContext, useCallback, useContext, useMemo, useRef } from "react";

type ScrollContainerContextValue = {
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  setScrollContainer: (element: HTMLElement | null) => void;
};

const ScrollContainerContext =
  createContext<ScrollContainerContextValue | null>(null);

export function ScrollContainerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const scrollContainerRef = useRef<HTMLElement | null>(null);

  const setScrollContainer = useCallback((element: HTMLElement | null) => {
    scrollContainerRef.current = element;
  }, []);

  const value = useMemo(
    () => ({ scrollContainerRef, setScrollContainer }),
    [setScrollContainer]
  );

  return (
    <ScrollContainerContext.Provider value={value}>
      {children}
    </ScrollContainerContext.Provider>
  );
}

export function useScrollContainer(): {
  ref: React.RefObject<HTMLElement | null>;
  isInScrollContainerContext: boolean;
} | null {
  const context = useContext(ScrollContainerContext);
  if (!context) {
    return null;
  }
  return {
    ref: context.scrollContainerRef,
    isInScrollContainerContext: true,
  };
}

export function useSetScrollContainer():
  | ((element: HTMLElement | null) => void)
  | undefined {
  const context = useContext(ScrollContainerContext);
  return context?.setScrollContainer;
}
