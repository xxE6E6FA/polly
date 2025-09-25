import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction } from "convex/react";
import { useCallback, useState } from "react";
import { useConvexFileUpload } from "@/hooks/use-convex-file-upload";
import { useNotificationDialog } from "@/hooks/use-dialog-management";
import { useReasoningConfig } from "@/hooks/use-reasoning";
import { usePrivateMode } from "@/providers/private-mode-context";
import type {
  Attachment,
  ConversationId,
  GenerationMode,
  ReasoningConfig,
} from "@/types";

interface UseChatInputSubmissionProps {
  conversationId?: ConversationId;
  selectedPersonaId: Id<"personas"> | null;
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
  temperature,
  onSendMessage,
  onSendAsNewConversation,
  handleImageGenerationSubmit,
  handleImageGenerationSendAsNew,

  onResetInputState,
}: UseChatInputSubmissionProps) {
  const [reasoningConfig] = useReasoningConfig();
  const notificationDialog = useNotificationDialog();
  const { uploadFile } = useConvexFileUpload();
  const { isPrivateMode } = usePrivateMode();
  const generateSummaryAction = useAction(
    api.conversationSummary.generateConversationSummary
  );
  const [isProcessing, setIsProcessing] = useState(false);

  const uploadAttachmentsToConvex = useCallback(
    async (attachmentsToUpload: Attachment[]): Promise<Attachment[]> => {
      if (isPrivateMode) {
        return attachmentsToUpload.map(att => {
          if (att.content && att.mimeType) {
            return {
              ...att,
              url: `data:${att.mimeType};base64,${att.content}`,
              contentType: att.mimeType,
            } as Attachment;
          }
          return att;
        });
      }

      const uploaded: Attachment[] = [];
      for (const att of attachmentsToUpload) {
        if (att.type === "text" || att.storageId) {
          uploaded.push(att);
        } else if (att.content && att.mimeType) {
          try {
            const byteCharacters = atob(att.content);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const file = new File([byteArray], att.name, {
              type: att.mimeType,
            });
            const res = await uploadFile(file);
            if (att.type === "pdf" && att.extractedText) {
              res.extractedText = att.extractedText;
            }
            uploaded.push(res);
          } catch (_e) {
            uploaded.push(att);
          }
        } else {
          uploaded.push(att);
        }
      }
      return uploaded;
    },
    [isPrivateMode, uploadFile]
  );

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
      onSendMessage,
      selectedPersonaId,
      reasoningConfig,
      temperature,
      handleImageGenerationSubmit,
      onResetInputState,
      notificationDialog,
      uploadAttachmentsToConvex,
    ]
  );

  const handleSendAsNewConversation = useCallback(
    async (
      input: string,
      attachments: Attachment[],
      shouldNavigate = true,
      personaId?: Id<"personas"> | null,
      customReasoningConfig?: ReasoningConfig,
      generationModeOverride?: GenerationMode
    ) => {
      if (!onSendAsNewConversation) {
        return;
      }

      try {
        if (generationModeOverride === "image") {
          const newConversationId = await handleImageGenerationSendAsNew(
            shouldNavigate,
            personaId
          );

          if (newConversationId) {
            onResetInputState();
          }
          return;
        }

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
      conversationId,
      generateSummaryAction,
      reasoningConfig,
      temperature,
      onResetInputState,
      uploadAttachmentsToConvex,
      handleImageGenerationSendAsNew,
    ]
  );

  return {
    isProcessing,
    submit,
    handleSendAsNewConversation,
  };
}
