import { useCallback } from "react";
import { useChatAttachments } from "@/hooks/use-chat-attachments";
import { useImageParams } from "@/hooks/use-generation";
import { cn } from "@/lib/utils";
import { useUI } from "@/providers/ui-provider";
import { removeAttachmentAt } from "@/stores/actions/chat-input-actions";
import { useChatHistory } from "@/stores/chat-ui-store";
import type { ConversationId, GenerationMode } from "@/types";
import { AttachmentDisplay } from "../attachment-display";
import { ChatInputField } from "../chat-input-field";
// Fullscreen state and animation
import { ExpandToggleButton } from "../expand-toggle-button";
import { useChatInputFullscreen } from "../hooks";
import { useEvent } from "../hooks/use-event";
import { NegativePromptToggle } from "../negative-prompt-toggle";

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
  } | null;
  textareaClassNameOverride?: string;
  disableAutoResize?: boolean;
  onMobileFullscreenToggle?: () => void;
  hideExpandToggle?: boolean;
  showExpandToggle?: boolean;
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
  onMobileFullscreenToggle,
  hideExpandToggle,
  showExpandToggle,
}: TextInputSectionProps) {
  const { attachments } = useChatAttachments(conversationId);
  const handleRemoveAttachment = useCallback(
    (index: number) => removeAttachmentAt(conversationId, index),
    [conversationId]
  );
  // Build local navigation glue using store-backed hooks when needed
  const { isFullscreen, isTransitioning, handleToggleFullscreen } =
    useChatInputFullscreen();
  const { isMobile } = useUI();
  const {
    params: imageParams,
    setParams: setImageParams,
    negativePromptEnabled,
    setNegativePromptEnabled,
  } = useImageParams();
  const history = useChatHistory(conversationId);

  // Navigation props now read internally by hooks; no prop drilling

  // Stable event handlers using useEvent pattern
  const handleInputChangeWithHistory = useEvent((next: string) => {
    onValueChange(next);
    // history navigation is user-driven; just update input value here
  });

  const stableHistoryNavigation = useEvent(() => {
    const prev = history.prev();
    if (prev != null) {
      onValueChange(prev);
      return true;
    }
    return false;
  });
  const stableHistoryNavigationDown = useEvent(() => {
    const next = history.next();
    if (next != null) {
      onValueChange(next);
      return true;
    }
    return false;
  });

  const handleToggleFullscreenStable = useEvent(() => {
    if (isMobile && onMobileFullscreenToggle) {
      onMobileFullscreenToggle();
      return;
    }
    handleToggleFullscreen();
  });

  const handleNegativePromptValueChange = useEvent((value: string) => {
    setImageParams(prev => ({ ...prev, negativePrompt: value }));
  });

  // Stable memoized values - only recalculate when actual dependencies change
  // Persona chip removed; keep selection state for send flow only

  // Stable navigation props - use stable handlers
  // No navigation prop is passed anymore

  return (
    <>
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
              className={cn(
                // Always reserve a gutter on the right so text never sits under the button
                "pr-10 sm:pr-12",
                textareaClassNameOverride ??
                  (isFullscreen && !isMobile
                    ? "min-h-[50vh] max-h-[85vh]"
                    : undefined)
              )}
              isFullscreen={isFullscreen}
              isTransitioning={isTransitioning}
              disableAutoResize={disableAutoResize}
              navigation={{
                onHistoryNavigation: stableHistoryNavigation,
                onHistoryNavigationDown: stableHistoryNavigationDown,
              }}
              hasExistingMessages={hasExistingMessages}
            />
            <ExpandToggleButton
              onToggle={handleToggleFullscreenStable}
              isVisible={Boolean(
                canSend &&
                  !hideExpandToggle &&
                  (showExpandToggle || isFullscreen)
              )}
              isExpanded={isFullscreen}
              disabled={disabled}
            />
          </div>
        </div>

        {canSend &&
          generationMode === "image" &&
          hasReplicateApiKey &&
          selectedImageModel?.supportsNegativePrompt && (
            <div className="relative mt-1">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border/20 to-transparent" />

              <div className="pt-1">
                <NegativePromptToggle
                  enabled={negativePromptEnabled}
                  value={imageParams.negativePrompt || ""}
                  onEnabledChange={setNegativePromptEnabled}
                  onValueChange={handleNegativePromptValueChange}
                  disabled={disabled}
                  onSubmit={onSubmit}
                  className="hidden sm:block"
                />
              </div>
            </div>
          )}
      </div>
    </>
  );
}
