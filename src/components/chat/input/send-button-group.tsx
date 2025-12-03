import type { Doc, Id } from "@convex/_generated/dataModel";
import { useCallback, useEffect, useState } from "react";
import { useReasoningConfig } from "@/hooks/use-reasoning";
import { isUserModel } from "@/lib/type-guards";
import { cn } from "@/lib/utils";
import type { ConversationId, ReasoningConfig } from "@/types";

type AvailableModel = Doc<"userModels"> | Doc<"builtInModels">;

import { RecordingControls } from "./recording-controls";
import { SendButton } from "./send-button";
import { SendButtonContainer } from "./send-button-container";
import { SendDropdownButton } from "./send-dropdown-button";

type ChatInputButtonSize = "sm" | "default";

type SendButtonGroupProps = {
  canSend: boolean;
  isStreaming: boolean;
  isLoading: boolean;
  isSummarizing: boolean;
  hasExistingMessages: boolean;
  conversationId?: ConversationId;
  hasInputText: boolean;
  onSend: () => void;
  onStop?: () => void;
  onSendAsNewConversation?: (
    navigate: boolean,
    personaId?: Id<"personas"> | null,
    reasoningConfig?: ReasoningConfig
  ) => void;
  hasApiKeys?: boolean;
  hasEnabledModels?: boolean | null;
  personaId?: Id<"personas"> | null;
  isSupported?: boolean;
  isRecording?: boolean;
  isTranscribing?: boolean;
  waveform?: number[];
  onStartTranscribe?: () => Promise<void>;
  onCancelTranscribe?: () => Promise<void>;
  onAcceptTranscribe?: () => Promise<void>;
  size?: ChatInputButtonSize;
  /** Whether the user's quota is exhausted for built-in models */
  isQuotaExhausted?: boolean;
  /** The currently selected model (to determine if BYOK) */
  selectedModel?: AvailableModel | null;
};

export const SendButtonGroup = ({
  canSend,
  isStreaming,
  isLoading,
  isSummarizing,
  hasExistingMessages,
  conversationId,
  hasInputText,
  onSend,
  onStop,
  onSendAsNewConversation,
  hasApiKeys,
  hasEnabledModels,
  personaId,
  isSupported = false,
  isRecording = false,
  isTranscribing = false,
  waveform = [],
  onStartTranscribe,
  onCancelTranscribe,
  onAcceptTranscribe,
  size = "default",
  isQuotaExhausted = false,
  selectedModel,
}: SendButtonGroupProps) => {
  const [reasoningConfig] = useReasoningConfig();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasBeenEnabled, setHasBeenEnabled] = useState(false);
  const [isCollapsing, setIsCollapsing] = useState(false);

  const shouldShowDropdown =
    hasExistingMessages &&
    conversationId &&
    onSendAsNewConversation &&
    !isStreaming &&
    hasInputText;

  const shouldShowWaveform = !hasInputText && isRecording;

  // Manage button expansion/collapse animation
  useEffect(() => {
    const shouldExpand = canSend && shouldShowDropdown;

    if (shouldExpand && !isExpanded) {
      setIsExpanded(true);
      setIsCollapsing(false);
    } else if (!shouldExpand && isExpanded) {
      setIsCollapsing(true);
      const timer = setTimeout(() => {
        setIsExpanded(false);
        setIsCollapsing(false);
      }, 100);
      return () => clearTimeout(timer);
    }

    if (canSend && !hasBeenEnabled) {
      setHasBeenEnabled(true);
    }
  }, [canSend, shouldShowDropdown, isExpanded, hasBeenEnabled]);

  // Check if quota is exhausted and using a built-in (non-BYOK) model
  const isBlockedByQuota =
    isQuotaExhausted && !(selectedModel && isUserModel(selectedModel));

  const isButtonDisabled = (() => {
    if (isStreaming) {
      return !onStop;
    }
    if (!hasInputText && isRecording) {
      return false;
    }
    if (!hasInputText && (isTranscribing || !isSupported)) {
      return true;
    }
    // Block if quota exhausted and using built-in model
    if (isBlockedByQuota) {
      return true;
    }
    return !canSend || isLoading || isSummarizing;
  })();

  const handleButtonClick = useCallback(() => {
    if (isStreaming && onStop) {
      onStop();
      return;
    }
    if (!hasInputText && isRecording && onAcceptTranscribe) {
      onAcceptTranscribe();
      return;
    }
    if (!(hasInputText || isRecording || isTranscribing) && onStartTranscribe) {
      onStartTranscribe();
      return;
    }
    if (hasInputText && !isStreaming) {
      onSend();
    }
  }, [
    isStreaming,
    onStop,
    hasInputText,
    isRecording,
    onAcceptTranscribe,
    isTranscribing,
    onStartTranscribe,
    onSend,
  ]);

  return (
    <SendButtonContainer
      isExpanded={isExpanded}
      isCollapsing={isCollapsing}
      hasBeenEnabled={hasBeenEnabled}
      canSend={canSend}
      isLoading={isStreaming || isTranscribing || isLoading || isSummarizing}
      shouldShowWaveform={shouldShowWaveform}
      size={size}
    >
      {shouldShowWaveform && (
        <RecordingControls
          waveform={waveform}
          onAccept={onAcceptTranscribe}
          onCancel={onCancelTranscribe}
        />
      )}

      {shouldShowDropdown && (
        <SendDropdownButton
          isLoading={isLoading}
          isSummarizing={isSummarizing}
          isExpanded={isExpanded}
          isCollapsing={isCollapsing}
          dropdownOpen={dropdownOpen}
          onDropdownOpenChange={setDropdownOpen}
          onSendAsNewConversation={onSendAsNewConversation}
          personaId={personaId}
          reasoningConfig={reasoningConfig}
        />
      )}

      <div
        className={cn(
          "absolute top-0 bottom-0 right-0",
          "relative z-10",
          shouldShowWaveform && "opacity-0 pointer-events-none"
        )}
      >
        <SendButton
          className={isExpanded ? "border-none shadow-none" : undefined}
          disabled={isButtonDisabled}
          type={
            isStreaming || (!hasInputText && isRecording) ? "button" : "submit"
          }
          isStreaming={isStreaming}
          isLoading={isLoading}
          isSummarizing={isSummarizing}
          hasInputText={hasInputText}
          isSupported={isSupported}
          isRecording={isRecording}
          isTranscribing={isTranscribing}
          canSend={canSend}
          hasApiKeys={hasApiKeys}
          hasEnabledModels={hasEnabledModels}
          isQuotaExhausted={isBlockedByQuota}
          onClick={handleButtonClick}
        />
      </div>
    </SendButtonContainer>
  );
};
