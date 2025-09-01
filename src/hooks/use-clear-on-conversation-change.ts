import { useEffect, useRef } from "react";

export function useClearOnConversationChange(
  key: string,
  clear: (k: string) => void
) {
  const prevRef = useRef<string>(key);
  useEffect(() => {
    if (prevRef.current !== key) {
      clear(prevRef.current);
      prevRef.current = key;
    }
  }, [key, clear]);
}
