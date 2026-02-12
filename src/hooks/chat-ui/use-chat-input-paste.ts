import { useCallback } from "react";

interface UseChatInputPasteProps {
  canSend: boolean;
  isLoading: boolean;
  isStreaming: boolean;
  onProcessFiles: (files: FileList) => Promise<void>;
}

export function useChatInputPaste({
  canSend,
  isLoading,
  isStreaming,
  onProcessFiles,
}: UseChatInputPasteProps) {
  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      if (!canSend || isLoading || isStreaming) {
        return;
      }

      const files = e.clipboardData.files;
      if (files.length > 0) {
        e.preventDefault();
        await onProcessFiles(files);
      }
    },
    [canSend, isLoading, isStreaming, onProcessFiles]
  );

  return { handlePaste };
}
