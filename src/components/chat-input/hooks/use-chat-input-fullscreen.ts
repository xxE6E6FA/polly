import { useCallback, useMemo } from "react";
import { useChatFullscreenUI } from "@/stores/chat-ui-store";

export function useChatInputFullscreen() {
  const {
    isFullscreen,
    isMultiline,
    isTransitioning,
    setFullscreen,
    setMultiline,
    setTransitioning,
    clearOnSend,
  } = useChatFullscreenUI();

  const handleHeightChange = useCallback(
    (multiline: boolean) => {
      setMultiline(multiline);
    },
    [setMultiline]
  );

  const handleToggleFullscreen = useCallback(() => {
    setTransitioning(true);
    setFullscreen(!isFullscreen);
    setTimeout(() => setTransitioning(false), 300);
  }, [setFullscreen, setTransitioning, isFullscreen]);

  const handleCloseFullscreen = useCallback(() => {
    setTransitioning(true);
    setFullscreen(false);
    setTimeout(() => setTransitioning(false), 300);
  }, [setFullscreen, setTransitioning]);

  // clearOnSend provided by store

  return useMemo(
    () => ({
      isFullscreen,
      isMultiline,
      isTransitioning,
      handleHeightChange,
      // Aliases for consistency with other fullscreen hooks
      onHeightChange: handleHeightChange,
      handleToggleFullscreen,
      toggleFullscreen: handleToggleFullscreen,
      handleCloseFullscreen,
      closeFullscreen: handleCloseFullscreen,
      clearOnSend,
    }),
    [
      isFullscreen,
      isMultiline,
      isTransitioning,
      handleHeightChange,
      handleToggleFullscreen,
      handleCloseFullscreen,
      clearOnSend,
    ]
  );
}
