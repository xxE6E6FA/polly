import { PaperclipIcon } from "@phosphor-icons/react";
import { useCallback, useRef } from "react";
import { ChatInputIconButton } from "@/components/ui/chat-input-icon-button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useChatScopedState } from "@/hooks/use-chat-scoped-state";
import { useNotificationDialog } from "@/hooks/use-dialog-management";
import { useSelectedModel } from "@/hooks/use-selected-model";
import { cn } from "@/lib/utils";
import type { Attachment } from "@/types";

interface FileUploadButtonProps {
  disabled?: boolean;
  isSubmitting: boolean;
  conversationId?: string | null;
}

export function FileUploadButton({
  disabled = false,
  isSubmitting,
  conversationId,
}: FileUploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const notificationDialog = useNotificationDialog();
  const [selectedModel] = useSelectedModel();
  useChatScopedState(conversationId ?? undefined);

  const handleFileSelect = useCallback(async () => {
    const input = fileInputRef.current;
    if (!input?.files || input.files.length === 0) {
      return;
    }

    const { processFilesForAttachments } = await import("@/lib/process-files");
    const newAttachments: Attachment[] = await processFilesForAttachments(
      input.files,
      selectedModel,
      args =>
        notificationDialog.notify({
          ...args,
          description: args.description || "",
        })
    );
    if (newAttachments.length > 0) {
      const { appendAttachments } = await import(
        "@/stores/actions/chat-input-actions"
      );
      appendAttachments(conversationId ?? undefined, newAttachments);
    }

    input.value = "";
  }, [selectedModel, notificationDialog, conversationId]);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <>
      <input
        ref={fileInputRef}
        accept="image/*,.pdf,.txt,.md,.js,.py,.html,.css,.json,.xml,.yaml,.sql"
        className="hidden"
        multiple
        type="file"
        onChange={handleFileSelect}
      />
      <Tooltip>
        <TooltipTrigger>
          <ChatInputIconButton
            aria-label="Upload files"
            disabled={disabled || isSubmitting}
            type="button"
            onClick={handleClick}
          >
            <PaperclipIcon className="h-3.5 w-3.5" />
          </ChatInputIconButton>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs">Upload files</div>
        </TooltipContent>
      </Tooltip>
    </>
  );
}
