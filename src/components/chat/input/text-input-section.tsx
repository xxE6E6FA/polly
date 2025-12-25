import { useCallback } from "react";
import { useChatAttachments } from "@/hooks/use-chat-attachments";
import { useImageParams } from "@/hooks/use-generation";
import { useChatHistory } from "@/stores/chat-ui-store";
import type { ConversationId, GenerationMode } from "@/types";
import { AttachmentDisplay } from "./attachment-display";
import { ChatInputField } from "./chat-input-field";
import { NegativePrompt } from "./negative-prompt";
import { QuotePreview } from "./quote-preview";

interface TextInputSectionProps {
  onSubmit: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  placeholder: string;
  disabled: boolean;
  autoFocus: boolean;
  value: string;
  onValueChange: (value: string) => void;
  hasExistingMessages: boolean;
  conversationId?: ConversationId;
  canSend: boolean;
  generationMode: GenerationMode;
  hasReplicateApiKey: boolean;
  selectedImageModel?: {
    modelId: string;
    supportsMultipleImages: boolean;
    supportsNegativePrompt: boolean;
    free?: boolean;
  } | null;
  textareaClassNameOverride?: string;
  disableAutoResize?: boolean;
  quote?: string;
  onClearQuote?: () => void;
}

export function TextInputSection({
  onSubmit,
  textareaRef,
  placeholder,
  disabled,
  autoFocus,
  value,
  onValueChange,
  hasExistingMessages,
  conversationId,
  canSend,
  generationMode,
  hasReplicateApiKey,
  selectedImageModel,
  textareaClassNameOverride,
  disableAutoResize,
  quote,
  onClearQuote,
}: TextInputSectionProps) {
  const { attachments } = useChatAttachments(conversationId);
  const handleRemoveAttachment = useCallback(
    async (index: number) => {
      const { removeAttachmentAt } = await import(
        "@/stores/actions/chat-input-actions"
      );
      removeAttachmentAt(conversationId, index);
    },
    [conversationId]
  );
  const { params: imageParams, setParams: setImageParams } = useImageParams();
  const history = useChatHistory(conversationId);
  // Show negative prompt in image mode when:
  // - User has Replicate API key, OR
  // - Selected image model is free (uses server-side key)
  const canUseImageMode =
    hasReplicateApiKey || (selectedImageModel?.free ?? false);
  const shouldRenderNegativePrompt = Boolean(
    canSend &&
      generationMode === "image" &&
      canUseImageMode &&
      selectedImageModel?.supportsNegativePrompt
  );

  const handleInputChangeWithHistory = (next: string) => {
    onValueChange(next);
  };

  const stableHistoryNavigation = () => {
    const prev = history.prev();
    if (prev != null) {
      onValueChange(prev);
      return true;
    }
    return false;
  };
  const stableHistoryNavigationDown = () => {
    const next = history.next();
    if (next != null) {
      onValueChange(next);
      return true;
    }
    return false;
  };

  const handleNegativePromptValueChange = (value: string) => {
    setImageParams(prev => ({ ...prev, negativePrompt: value }));
  };

  return (
    <>
      {quote && (
        <div className="mb-2">
          <QuotePreview quote={quote} onClear={onClearQuote} />
        </div>
      )}

      <AttachmentDisplay
        attachments={attachments}
        onRemoveAttachment={handleRemoveAttachment}
      />

      <div className="flex flex-col">
        <div className="flex items-end gap-3">
          <div className="flex-1 flex items-center relative group">
            <ChatInputField
              value={value}
              onChange={handleInputChangeWithHistory}
              onSubmit={onSubmit}
              textareaRef={textareaRef}
              placeholder={placeholder}
              disabled={disabled}
              autoFocus={autoFocus}
              className={textareaClassNameOverride}
              disableAutoResize={disableAutoResize}
              navigation={{
                onHistoryNavigation: stableHistoryNavigation,
                onHistoryNavigationDown: stableHistoryNavigationDown,
              }}
            />
          </div>
        </div>

        {shouldRenderNegativePrompt && (
          <NegativePrompt
            value={imageParams.negativePrompt || ""}
            onValueChange={handleNegativePromptValueChange}
            disabled={disabled}
            onSubmit={onSubmit}
          />
        )}
      </div>
    </>
  );
}
