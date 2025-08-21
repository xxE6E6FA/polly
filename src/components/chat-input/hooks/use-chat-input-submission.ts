import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction } from "convex/react";
import { useCallback, useState } from "react";
import { useNotificationDialog } from "@/hooks/use-dialog-management";
import type {
  Attachment,
  ConversationId,
  GenerationMode,
  ReasoningConfig,
} from "@/types";

interface UseChatInputSubmissionProps {
  conversationId?: ConversationId;
  selectedPersonaId: Id<"personas"> | null;
  reasoningConfig: ReasoningConfig;
  temperature?: number;
  onSendMessage: (
    content: string,
    attachments?: Attachment[],
    personaId?: Id<"personas"> | null,
    reasoningConfig?: ReasoningConfig,
    temperature?: number
  ) => void;
  onSendAsNewConversation?: (
    content: string,
    shouldNavigate: boolean,
    attachments?: Attachment[],
    contextSummary?: string,
    sourceConversationId?: ConversationId,
    personaId?: Id<"personas"> | null,
    reasoningConfig?: ReasoningConfig,
    temperature?: number
  ) => Promise<ConversationId | undefined>;
  uploadAttachmentsToConvex: (
    attachments: Attachment[]
  ) => Promise<Attachment[]>;
  handleImageGenerationSubmit: () => Promise<void>;
  handleImageGenerationSendAsNew: (
    shouldNavigate?: boolean,
    personaId?: Id<"personas"> | null
  ) => Promise<ConversationId | undefined>;
  onResetInputState: () => void;
}

export function useChatInputSubmission({
  conversationId,
  selectedPersonaId,
  reasoningConfig,
  temperature,
  onSendMessage,
  onSendAsNewConversation,
  uploadAttachmentsToConvex,
  handleImageGenerationSubmit,

  onResetInputState,
}: UseChatInputSubmissionProps) {
  const notificationDialog = useNotificationDialog();
  const generateSummaryAction = useAction(
    api.conversationSummary.generateConversationSummary
  );
  const [isProcessing, setIsProcessing] = useState(false);

  const submit = useCallback(
    async (
      input: string,
      attachments: Attachment[],
      generationMode: GenerationMode
    ) => {
      if (input.trim().length === 0 && attachments.length === 0) {
        return;
      }

      setIsProcessing(true);

      try {
        if (generationMode === "image") {
          // Handle image generation
          await handleImageGenerationSubmit();
        } else {
          // Handle text generation
          const uploadedAttachments =
            await uploadAttachmentsToConvex(attachments);

          onSendMessage(
            input.trim(),
            uploadedAttachments,
            selectedPersonaId,
            reasoningConfig.enabled ? reasoningConfig : undefined,
            temperature
          );
        }

        // Reset input state after successful submission
        onResetInputState();
      } catch (error) {
        notificationDialog.notify({
          title: "Error",
          description:
            error instanceof Error ? error.message : "Failed to send message",
          type: "error",
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [
      uploadAttachmentsToConvex,
      onSendMessage,
      selectedPersonaId,
      reasoningConfig,
      temperature,
      handleImageGenerationSubmit,
      onResetInputState,
      notificationDialog,
    ]
  );

  const handleSendAsNewConversation = useCallback(
    async (
      input: string,
      attachments: Attachment[],
      shouldNavigate = true,
      personaId?: Id<"personas"> | null,
      customReasoningConfig?: ReasoningConfig
    ) => {
      if (!onSendAsNewConversation) {
        return;
      }

      try {
        // Generate summary if we have a current conversation
        let contextSummary: string | undefined;
        if (conversationId) {
          try {
            contextSummary = await generateSummaryAction({
              conversationId,
              maxTokens: 150,
            });
          } catch (_error) {
            // Summary generation failed, continue without summary
          }
        }

        // Upload attachments to Convex storage if not in private mode
        const processedAttachments =
          await uploadAttachmentsToConvex(attachments);

        const newConversationId = await onSendAsNewConversation(
          input,
          shouldNavigate,
          processedAttachments,
          contextSummary,
          conversationId,
          personaId,
          customReasoningConfig || reasoningConfig,
          temperature
        );

        if (newConversationId) {
          // Reset input state after successful submission
          onResetInputState();
        }
      } catch (_error) {
        // Conversation creation error is handled by the main flow
      }
    },
    [
      onSendAsNewConversation,
      uploadAttachmentsToConvex,
      conversationId,
      generateSummaryAction,
      reasoningConfig,
      temperature,
      onResetInputState,
    ]
  );

  return {
    isProcessing,
    submit,
    handleSendAsNewConversation,
  };
}
