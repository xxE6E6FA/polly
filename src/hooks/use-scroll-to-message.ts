import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Reads `?m={messageId}` from the URL, dispatches a scroll event when messages
 * are loaded, and cleans up the query param afterwards.
 */
export function useScrollToMessage(
  conversationId: string | undefined,
  messagesLoaded: boolean
): { targetMessageId: string | null } {
  const [searchParams, setSearchParams] = useSearchParams();
  const targetMessageId = searchParams.get("m");
  const dispatchedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!(targetMessageId && messagesLoaded && conversationId)) {
      return;
    }

    // Only dispatch once per target
    if (dispatchedRef.current === targetMessageId) {
      return;
    }
    dispatchedRef.current = targetMessageId;

    // Dispatch scroll event after a brief delay to let the virtualized list settle
    const scrollTimer = setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("polly:scroll-to-message", {
          detail: { messageId: targetMessageId, conversationId },
        })
      );
    }, 100);

    // Clean up the ?m= param
    const cleanupTimer = setTimeout(() => {
      setSearchParams(
        prev => {
          prev.delete("m");
          return prev;
        },
        { replace: true }
      );
    }, 300);

    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(cleanupTimer);
    };
  }, [targetMessageId, messagesLoaded, conversationId, setSearchParams]);

  return { targetMessageId };
}
