import { useCallback, useEffect, useRef, useState } from "react";

type Options = {
  delay?: number;
};

/**
 * useHoverLinger
 * Keeps a boolean visible state true while hovered and
 * lingers for `delay` ms after mouse leaves before hiding.
 */
export function useHoverLinger(options: Options = {}) {
  const { delay = 700 } = options;
  const [isVisible, setIsVisible] = useState(false);
  const timerRef = useRef<number | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onMouseEnter = useCallback(() => {
    clear();
    setIsVisible(true);
  }, [clear]);

  const onMouseLeave = useCallback(() => {
    clear();
    timerRef.current = window.setTimeout(() => {
      setIsVisible(false);
    }, delay);
  }, [clear, delay]);

  useEffect(() => () => clear(), [clear]);

  return {
    isVisible,
    setIsVisible,
    onMouseEnter,
    onMouseLeave,
    clear,
  } as const;
}
