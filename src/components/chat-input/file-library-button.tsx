import { FolderOpenIcon } from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import { FileSelectorDialog } from "@/components/file-selector-dialog";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useChatScopedState } from "@/hooks/use-chat-scoped-state";
import { useSelectedModel } from "@/hooks/use-selected-model";
import { cn } from "@/lib/utils";
import type { Attachment } from "@/types";

interface FileLibraryButtonProps {
  disabled?: boolean;
  isSubmitting: boolean;
  conversationId?: string | null;
}

export function FileLibraryButton({
  disabled = false,
  isSubmitting,
  conversationId,
}: FileLibraryButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedModel] = useSelectedModel();
  useChatScopedState(conversationId ?? undefined);

  const handleSelectFiles = useCallback(
    async (attachments: Attachment[]) => {
      if (attachments.length > 0) {
        try {
          const { appendAttachments } = await import(
            "@/stores/actions/chat-input-actions"
          );
          appendAttachments(conversationId ?? undefined, attachments);
        } catch (error) {
          console.error("Failed to append attachments:", error);
        }
      }
    },
    [conversationId]
  );

  const handleClick = useCallback(() => {
    setDialogOpen(true);
  }, []);

  // Check if the selected model supports images
  const supportsImages = selectedModel?.supportsImages ?? true;

  return (
    <>
      <Tooltip>
        <TooltipTrigger>
          <Button
            aria-label="Select from library"
            className={cn(
              "shrink-0 transition-all duration-200",
              "hover:scale-105 active:scale-95",
              disabled && "cursor-not-allowed opacity-50 hover:scale-100"
            )}
            disabled={disabled || isSubmitting}
            size="icon-pill"
            type="button"
            variant="default"
            onClick={handleClick}
          >
            <FolderOpenIcon className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs">Select from library</div>
        </TooltipContent>
      </Tooltip>

      <FileSelectorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSelectFiles={handleSelectFiles}
        supportsImages={supportsImages}
      />
    </>
  );
}
