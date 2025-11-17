import { PaperclipIcon } from "@phosphor-icons/react";
import { useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
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

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

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
        <TooltipTrigger asChild>
          <Button
            aria-label="Upload files"
            className={cn(
              "chat-input-control",
              "h-8 w-8 rounded-full p-0 shrink-0",
              "transition-all duration-200",
              "bg-primary text-primary-foreground",
              "hover:bg-primary/90 hover:text-primary-foreground",
              "hover:scale-105 active:scale-95",
              disabled && "cursor-not-allowed opacity-50 hover:scale-100"
            )}
            disabled={disabled || isSubmitting}
            size="icon"
            type="button"
            variant="ghost"
            onClick={handleClick}
          >
            <PaperclipIcon className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs">Upload files</div>
        </TooltipContent>
      </Tooltip>
    </>
  );
}
