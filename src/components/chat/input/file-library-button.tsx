import { FolderOpenIcon } from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import { FileSelectorDialog } from "@/components/files/file-selector-dialog";
import { ChatInputIconButton } from "@/components/ui/chat-input-icon-button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useChatScopedState } from "@/hooks/use-chat-scoped-state";
import { useSelectedModel } from "@/hooks/use-selected-model";
import { cn } from "@/lib/utils";
import { useUserIdentity } from "@/providers/user-data-context";
import type { Attachment } from "@/types";

interface FileLibraryButtonProps {
  disabled?: boolean;
  isSubmitting: boolean;
  conversationId?: string | null;
  selectedModel?: { supportsImages?: boolean };
}

export function FileLibraryButton({
  disabled = false,
  isSubmitting,
  conversationId,
  selectedModel: propsSelectedModel,
}: FileLibraryButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { selectedModel: hookSelectedModel } = useSelectedModel();
  const selectedModel = propsSelectedModel ?? hookSelectedModel;
  const { isAuthenticated } = useUserIdentity();
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

  const handleClick = () => {
    setDialogOpen(true);
  };

  // Check if the selected model supports images
  const supportsImages = selectedModel?.supportsImages ?? true;

  // Hide button for signed-out users since getUserFiles requires authentication
  if (!isAuthenticated) {
    return null;
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger delayDuration={200}>
          <ChatInputIconButton
            aria-label="Select from library"
            disabled={disabled || isSubmitting}
            type="button"
            onClick={handleClick}
          >
            <FolderOpenIcon className="h-3.5 w-3.5" />
          </ChatInputIconButton>
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
