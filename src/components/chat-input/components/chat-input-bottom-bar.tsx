import type { Doc, Id } from "@convex/_generated/dataModel";
import type { Attachment, ConversationId, ReasoningConfig } from "@/types";
import { ActionSection } from "../sections/action-section";
import { ControlsSection } from "../sections/controls-section";

interface ChatInputBottomBarProps {
  canSend: boolean;
  isStreaming: boolean;
  isLoading: boolean;
  isProcessing: boolean;
  hasExistingMessages: boolean;
  conversationId?: ConversationId;
  hasInputText: boolean;
  onSend: () => void;
  onStop?: () => void;
  onSendAsNewConversation?: (
    shouldNavigate?: boolean,
    personaId?: Id<"personas"> | null,
    reasoningConfig?: ReasoningConfig
  ) => Promise<void>;
  hasApiKeys: boolean;
  hasEnabledModels: boolean;
  selectedModel: Doc<"userModels"> | null;
  onAddAttachments: (attachments: Attachment[]) => void;
  hasReplicateApiKey: boolean;
  isPrivateMode: boolean;
  onSubmit: () => void;
}

export function ChatInputBottomBar({
  canSend,
  isStreaming,
  isLoading,
  isProcessing,
  hasExistingMessages,
  conversationId,
  hasInputText,
  onSend,
  onStop,
  onSendAsNewConversation,
  hasApiKeys,
  hasEnabledModels,
  selectedModel,
  onAddAttachments,
  hasReplicateApiKey,
  isPrivateMode,
  onSubmit,
}: ChatInputBottomBarProps) {
  const disabled = isLoading || isStreaming || isProcessing;

  return (
    <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/20 pt-2">
      <ControlsSection
        canSend={canSend}
        disabled={disabled}
        conversationId={conversationId}
        hasExistingMessages={hasExistingMessages}
        selectedModel={selectedModel}
        hasReplicateApiKey={hasReplicateApiKey}
        isPrivateMode={isPrivateMode}
        onSubmit={onSubmit}
      />

      <ActionSection
        canSend={canSend}
        isStreaming={isStreaming}
        isLoading={isLoading}
        isProcessing={isProcessing}
        hasExistingMessages={hasExistingMessages}
        conversationId={conversationId}
        hasInputText={hasInputText}
        onSend={onSend}
        onStop={onStop}
        onSendAsNewConversation={onSendAsNewConversation}
        hasApiKeys={hasApiKeys}
        hasEnabledModels={hasEnabledModels}
        selectedModel={selectedModel}
        onAddAttachments={onAddAttachments}
      />
    </div>
  );
}
