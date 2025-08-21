import type { Doc, Id } from "@convex/_generated/dataModel";
import type { Attachment, ConversationId, ReasoningConfig } from "@/types";
import { useChatInputContext } from "../context/chat-input-context";
import { FileUploadButton } from "../file-upload-button";
import { SendButtonGroup } from "../send-button-group";

interface ActionSectionProps {
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
}

export function ActionSection({
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
}: ActionSectionProps) {
  const { selectedPersonaId, reasoningConfig } = useChatInputContext();

  const disabled = isLoading || isStreaming || isProcessing;

  return (
    <div className="flex items-center gap-1.5">
      {canSend && (
        <FileUploadButton
          disabled={disabled}
          onAddAttachments={onAddAttachments}
          isSubmitting={isProcessing}
          selectedModel={selectedModel}
        />
      )}
      <SendButtonGroup
        canSend={canSend}
        isStreaming={Boolean(isStreaming)}
        isLoading={Boolean(isLoading || isProcessing)}
        isSummarizing={false}
        hasExistingMessages={Boolean(hasExistingMessages)}
        conversationId={conversationId}
        hasInputText={hasInputText}
        onSend={onSend}
        onStop={onStop}
        onSendAsNewConversation={onSendAsNewConversation}
        hasApiKeys={hasApiKeys}
        hasEnabledModels={hasEnabledModels}
        personaId={selectedPersonaId}
        reasoningConfig={reasoningConfig}
      />
    </div>
  );
}
