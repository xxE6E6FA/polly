import { useCallback, useEffect, useRef, useState } from "react";

interface UseScrollDirectionProps {
  hideThreshold?: number;
}

interface ScrollState {
  shouldHideHeader: boolean;
  isAtTop: boolean;
}

export function useScrollDirection({
  hideThreshold = 100,
}: UseScrollDirectionProps = {}): [
  ScrollState,
  (element: HTMLElement | null) => void,
] {
  const [scrollState, setScrollState] = useState<ScrollState>({
    shouldHideHeader: false,
    isAtTop: true,
  });

  const lastScrollY = useRef(0);
  const scrollElement = useRef<HTMLElement | null>(null);
  const ticking = useRef(false);
  const isInitialLoad = useRef(true);
  const initialLoadTimer = useRef<NodeJS.Timeout | null>(null);

  const updateScrollState = useCallback(() => {
    if (!scrollElement.current) return;

    const currentScrollY = scrollElement.current.scrollTop;
    const difference = currentScrollY - lastScrollY.current;

    if (Math.abs(difference) < 1) {
      ticking.current = false;
      return;
    }

    const isScrollingDown = difference > 0;
    const isScrollingUp = difference < 0;
    const isAtTop = currentScrollY <= 10;

    let shouldHideHeader = false;

    // Don't hide header during initial load
    if (isInitialLoad.current) {
      shouldHideHeader = false;
    } else if (isAtTop || isScrollingUp) {
      shouldHideHeader = false;
    } else if (isScrollingDown && currentScrollY > hideThreshold) {
      shouldHideHeader = true;
    }

    setScrollState({
      shouldHideHeader,
      isAtTop,
    });

    lastScrollY.current = currentScrollY;
    ticking.current = false;
  }, [hideThreshold]);

  const handleScroll = useCallback(() => {
    if (!ticking.current) {
      requestAnimationFrame(updateScrollState);
      ticking.current = true;
    }
  }, [updateScrollState]);

  const setRef = useCallback(
    (element: HTMLElement | null) => {
      if (scrollElement.current) {
        scrollElement.current.removeEventListener("scroll", handleScroll);
      }

      // Clear any existing timer
      if (initialLoadTimer.current) {
        clearTimeout(initialLoadTimer.current);
      }

      scrollElement.current = element;

      if (element) {
        // Reset initial load state
        isInitialLoad.current = true;

        element.addEventListener("scroll", handleScroll, { passive: true });

        const initialScrollY = element.scrollTop;
        setScrollState({
          shouldHideHeader: false,
          isAtTop: initialScrollY <= 10,
        });
        lastScrollY.current = initialScrollY;

        // Allow header hiding after a delay to let initial scroll complete
        initialLoadTimer.current = setTimeout(() => {
          isInitialLoad.current = false;
        }, 1000);
      }
    },
    [handleScroll]
  );

  useEffect(() => {
    return () => {
      if (scrollElement.current) {
        scrollElement.current.removeEventListener("scroll", handleScroll);
      }
      if (initialLoadTimer.current) {
        clearTimeout(initialLoadTimer.current);
      }
    };
  }, [handleScroll]);

  return [scrollState, setRef];
}
