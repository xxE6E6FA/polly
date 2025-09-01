import { useCallback, useMemo } from "react";
import { useChatFullscreenUI } from "@/stores/chat-ui-store";
import type { ConversationId } from "@/types";

export function useChatFullscreen(_conversationId?: ConversationId) {
  const {
    isFullscreen,
    isMultiline,
    isTransitioning,
    setFullscreen,
    setMultiline,
    setTransitioning,
    clearOnSend,
  } = useChatFullscreenUI();

  const toggleFullscreen = useCallback(
    () => setFullscreen(!isFullscreen),
    [setFullscreen, isFullscreen]
  );
  const closeFullscreen = useCallback(
    () => setFullscreen(false),
    [setFullscreen]
  );
  const onHeightChange = useCallback(
    (nextIsMultiline: boolean) => setMultiline(nextIsMultiline),
    [setMultiline]
  );

  return useMemo(
    () => ({
      isFullscreen,
      isMultiline,
      isTransitioning,
      setFullscreen,
      setMultiline,
      setTransitioning,
      toggleFullscreen,
      closeFullscreen,
      onHeightChange,
      clearOnSend,
    }),
    [
      isFullscreen,
      isMultiline,
      isTransitioning,
      setFullscreen,
      setMultiline,
      setTransitioning,
      toggleFullscreen,
      closeFullscreen,
      onHeightChange,
      clearOnSend,
    ]
  );
}
