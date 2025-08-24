import type { Id } from "@convex/_generated/dataModel";
import { useMemo } from "react";
import type { GenerationMode } from "@/types";
import { AttachmentDisplay } from "../attachment-display";
import { ChatInputField } from "../chat-input-field";
import { useAttachments } from "../context/attachment-context";
import { useChatInputNavigationContext } from "../context/chat-input-navigation-context";
import { useChatInputStateContext } from "../context/chat-input-state-context";
import { useChatInputUIContext } from "../context/chat-input-ui-context";
import { ExpandToggleButton } from "../expand-toggle-button";
import { useEvent } from "../hooks/use-event";
import { NegativePromptToggle } from "../negative-prompt-toggle";

interface TextInputSectionProps {
  onSubmit: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  placeholder: string;
  disabled: boolean;
  autoFocus: boolean;
  hasExistingMessages: boolean;
  mentionOpen: boolean;
  mentionQuery: string;
  mentionActiveIndex: number;
  mentionItems: Array<{
    id: Id<"personas"> | null;
    name: string;
    icon?: string;
  }>;
  onMentionStateChange: (state: {
    open: boolean;
    query: string;
    activeIndex: number;
  }) => void;
  personas: Array<{
    _id: Id<"personas">;
    name: string;
    icon?: string;
  }>;
  canSend: boolean;
  generationMode: GenerationMode;
  hasReplicateApiKey: boolean;
  selectedImageModel?: {
    modelId: string;
    supportsMultipleImages: boolean;
    supportsNegativePrompt: boolean;
  } | null;
  userMessages: string[];
}

export function TextInputSection({
  onSubmit,
  textareaRef,
  placeholder,
  disabled,
  autoFocus,
  hasExistingMessages,
  mentionOpen,
  mentionQuery,
  mentionActiveIndex,
  mentionItems,
  onMentionStateChange,
  onMentionNavigate,
  onMentionConfirm,
  onMentionCancel,
  personas,
  onMentionSelect,
  canSend,
  generationMode,
  hasReplicateApiKey,
  selectedImageModel,
  userMessages,
}: TextInputSectionProps & {
  onMentionNavigate?: (direction: "up" | "down") => boolean;
  onMentionConfirm?: () => Id<"personas"> | null;
  onMentionCancel?: () => boolean;
  onMentionSelect?: (personaId: Id<"personas"> | null) => void;
}) {
  const { attachments, removeAttachment } = useAttachments();
  const {
    input,
    selectedPersonaId,
    personaChipWidth,
    setSelectedPersonaId,
    setPersonaChipWidth,
    handleInputChange,
  } = useChatInputStateContext();
  const {
    isFullscreen,
    isMultiline,
    negativePromptEnabled,
    imageParams,
    handleToggleFullscreen,
    handleNegativePromptEnabledChange,
    setImageParams,
  } = useChatInputUIContext();
  const { navigationProps } = useChatInputNavigationContext();

  // Stable event handlers using useEvent pattern
  const handleInputChangeWithHistory = useEvent((value: string) => {
    handleInputChange(value, userMessages);
  });

  const stableHistoryNavigation = useEvent(() =>
    navigationProps.onHistoryNavigation(userMessages)
  );

  const stableHistoryNavigationDown = useEvent(() =>
    navigationProps.onHistoryNavigationDown(userMessages)
  );

  const handlePersonaClear = useEvent(() => {
    setSelectedPersonaId(null);
  });

  const handleNegativePromptValueChange = useEvent((value: string) => {
    setImageParams(prev => ({ ...prev, negativePrompt: value }));
  });

  // Stable memoized values - only recalculate when actual dependencies change
  const currentPersona = useMemo(
    () =>
      selectedPersonaId
        ? personas.find(p => p._id === selectedPersonaId) || null
        : null,
    [selectedPersonaId, personas]
  );

  // Stable navigation props - use stable handlers
  const navigationPropsWithMessages = useMemo(
    () => ({
      ...navigationProps,
      onHistoryNavigation: stableHistoryNavigation,
      onHistoryNavigationDown: stableHistoryNavigationDown,
    }),
    [navigationProps, stableHistoryNavigation, stableHistoryNavigationDown]
  );

  // Stable mention props - only recalculate when layout changes
  const mentionsProps = useMemo(
    () => ({
      onMentionNavigate,
      onMentionConfirm,
      onMentionCancel,
      onMentionSelect,
      firstLineIndentPx: selectedPersonaId
        ? Math.max(personaChipWidth + 8, 0)
        : undefined,
    }),
    [
      onMentionNavigate,
      onMentionConfirm,
      onMentionCancel,
      onMentionSelect,
      selectedPersonaId,
      personaChipWidth,
    ]
  );

  return (
    <>
      <AttachmentDisplay
        attachments={attachments}
        onRemoveAttachment={removeAttachment}
      />

      <div className="flex flex-col">
        <div className="flex items-end gap-3">
          <div className="flex-1 flex items-center relative">
            <ChatInputField
              value={input}
              onChange={handleInputChangeWithHistory}
              onSubmit={onSubmit}
              textareaRef={textareaRef}
              placeholder={selectedPersonaId ? "" : placeholder}
              disabled={disabled}
              autoFocus={autoFocus}
              className={
                isFullscreen
                  ? selectedPersonaId
                    ? "min-h-[50vh] max-h-[85vh] pl-28"
                    : "min-h-[50vh] max-h-[85vh]"
                  : selectedPersonaId
                    ? "pl-28"
                    : undefined
              }
              navigation={navigationPropsWithMessages}
              mentions={mentionsProps}
              selectedPersonaId={selectedPersonaId}
              currentPersona={currentPersona}
              onPersonaClear={handlePersonaClear}
              hasExistingMessages={hasExistingMessages}
              mentionOpen={mentionOpen}
              mentionQuery={mentionQuery}
              mentionActiveIndex={mentionActiveIndex}
              mentionItems={mentionItems}
              onMentionStateChange={onMentionStateChange}
              onPersonaSelect={setSelectedPersonaId}
              onPersonaChipWidthChange={setPersonaChipWidth}
              onPersonaClearForNavigation={handlePersonaClear}
            />
            <ExpandToggleButton
              onToggle={handleToggleFullscreen}
              isVisible={(isMultiline || isFullscreen) && canSend}
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
                  onEnabledChange={handleNegativePromptEnabledChange}
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
