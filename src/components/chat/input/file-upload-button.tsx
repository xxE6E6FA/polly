import { PaperclipIcon } from "@phosphor-icons/react";
import {
  buildAcceptAttribute,
  describeSupportedTypes,
} from "@shared/file-constants";
import { useMemo, useRef } from "react";
import { ChatInputIconButton } from "@/components/ui/chat-input-icon-button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useChatScopedState } from "@/hooks/use-chat-scoped-state";
import { useFileUpload } from "@/hooks/use-file-upload";
import { useSelectedModel } from "@/hooks/use-selected-model";
import { usePrivateMode } from "@/providers/private-mode-context";
import type { AIModel } from "@/types";

interface FileUploadButtonProps {
  disabled?: boolean;
  isSubmitting: boolean;
  conversationId?: string | null;
  selectedModel?: unknown;
}

export function FileUploadButton({
  disabled = false,
  isSubmitting,
  conversationId,
  selectedModel: propsSelectedModel,
}: FileUploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { selectedModel: hookSelectedModel } = useSelectedModel();
  const selectedModel = (propsSelectedModel ?? hookSelectedModel) as
    | AIModel
    | undefined;
  const { isPrivateMode } = usePrivateMode();
  useChatScopedState(conversationId ?? undefined);

  // Use the file upload hook which handles eager upload to Convex storage
  const { handleFileUpload } = useFileUpload({
    currentModel: selectedModel,
    privateMode: isPrivateMode,
    conversationId,
  });

  const supportedTypes = useMemo(() => {
    const supportsImages = selectedModel?.supportsImages ?? false;
    const supportsAudio =
      selectedModel?.inputModalities?.includes("audio") ?? false;
    const supportsVideo =
      selectedModel?.inputModalities?.includes("video") ?? false;

    return {
      accept: buildAcceptAttribute({
        image: supportsImages,
        pdf: true,
        text: true,
        audio: supportsAudio,
        video: supportsVideo,
      }),
      description: describeSupportedTypes({
        image: supportsImages,
        pdf: true,
        text: true,
        audio: supportsAudio,
        video: supportsVideo,
      }),
    };
  }, [selectedModel]);

  const handleFileSelect = async () => {
    const input = fileInputRef.current;
    if (!input?.files || input.files.length === 0) {
      return;
    }

    await handleFileUpload(input.files);
    input.value = "";
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <>
      <input
        ref={fileInputRef}
        accept={supportedTypes.accept}
        className="hidden"
        multiple
        type="file"
        onChange={handleFileSelect}
      />
      <Tooltip>
        <TooltipTrigger delayDuration={200}>
          <ChatInputIconButton
            aria-label="Upload files"
            disabled={disabled || isSubmitting}
            type="button"
            onClick={handleClick}
          >
            <PaperclipIcon className="size-3.5" />
          </ChatInputIconButton>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs">{supportedTypes.description}</div>
        </TooltipContent>
      </Tooltip>
    </>
  );
}
