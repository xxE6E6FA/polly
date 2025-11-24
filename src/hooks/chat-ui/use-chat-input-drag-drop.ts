import { useCallback, useState } from "react";

interface UseChatInputDragDropProps {
  canSend: boolean;
  isLoading: boolean;
  isStreaming: boolean;
  onProcessFiles: (files: FileList) => Promise<void>;
}

export function useChatInputDragDrop({
  canSend,
  isLoading,
  isStreaming,
  onProcessFiles,
}: UseChatInputDragDropProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isDragOver) {
        setIsDragOver(true);
      }
    },
    [isDragOver]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Only set drag over to false if we're leaving the container
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const isOutside =
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom;

    if (isOutside) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (!canSend || isLoading || isStreaming) {
        return;
      }

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        await onProcessFiles(files);
      }
    },
    [canSend, isLoading, isStreaming, onProcessFiles]
  );

  return {
    isDragOver,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}
