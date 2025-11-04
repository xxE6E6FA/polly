import { useLayoutEffect, useRef } from "react";

export function useClearOnConversationChange(
  key: string,
  clear: (k: string) => void
) {
  const prevRef = useRef<string | undefined>(undefined);
  const clearRef = useRef(clear);
  clearRef.current = clear;

  useLayoutEffect(() => {
    const prevKey = prevRef.current;
    if (prevKey !== undefined && prevKey !== key) {
      clearRef.current(prevKey);
    }
    prevRef.current = key;
  }, [key]);
}
