import { useCallback, useState } from "react";

export function useChatInputFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMultiline, setIsMultiline] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const handleHeightChange = useCallback((multiline: boolean) => {
    setIsMultiline(multiline);
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    setIsTransitioning(true);
    setIsFullscreen(!isFullscreen);

    // Reset transition state after animation completes
    setTimeout(() => {
      setIsTransitioning(false);
    }, 300);
  }, [isFullscreen]);

  const handleCloseFullscreen = useCallback(() => {
    setIsTransitioning(true);
    setIsFullscreen(false);

    // Reset transition state after animation completes
    setTimeout(() => {
      setIsTransitioning(false);
    }, 300);
  }, []);

  return {
    isFullscreen,
    isMultiline,
    isTransitioning,
    handleHeightChange,
    handleToggleFullscreen,
    handleCloseFullscreen,
  };
}
