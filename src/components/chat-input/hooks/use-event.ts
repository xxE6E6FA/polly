import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * Custom implementation of useEvent (RFC) for stable event handlers
 * This ensures callbacks don't change identity between renders while maintaining access to fresh values
 *
 * @param handler The event handler function
 * @returns A stable callback that doesn't change between renders
 */
export function useEvent<Args extends unknown[], Return>(
  handler: (...args: Args) => Return
): (...args: Args) => Return {
  const handlerRef = useRef<((...args: Args) => Return) | null>(null);

  // Update the ref during render so it's always fresh
  useLayoutEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  return useCallback((...args: Args) => {
    const fn = handlerRef.current;
    if (!fn) {
      throw new Error("useEvent handler called before ref was set");
    }
    return fn(...args);
  }, []);
}
