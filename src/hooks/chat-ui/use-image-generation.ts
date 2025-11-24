import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useConvex } from "convex/react";
import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useChatInputState } from "@/hooks/chat-ui/use-chat-input-state";
import { useConvexFileUpload } from "@/hooks/use-convex-file-upload";
import { useEnabledImageModels } from "@/hooks/use-enabled-image-models";
import { handleImageGeneration } from "@/lib/ai/image-generation-handlers";
import { ROUTES } from "@/lib/routes";
import { usePrivateMode } from "@/providers/private-mode-context";
import type {
  Attachment,
  ConversationId,
  ImageGenerationParams,
} from "@/types";

interface UseImageGenerationProps {
  conversationId?: ConversationId;
  onResetInputState?: () => void;
}

export function useImageGeneration({
  conversationId,
  onResetInputState,
}: UseImageGenerationProps = {}) {
  const convex = useConvex();
  const navigate = useNavigate();
  const generateSummaryAction = useAction(
    api.conversationSummary.generateConversationSummary
  );
  const { uploadFile } = useConvexFileUpload();
  const { isPrivateMode } = usePrivateMode();
  const enabledImageModels = useEnabledImageModels();

  const {
    imageParams,
    setImageParams,
    generationMode,
    setGenerationMode,
    selectedPersonaId,
    negativePromptEnabled,
    setNegativePromptEnabled,
  } = useChatInputState(conversationId);

  const selectedImageModel = useMemo(() => {
    if (!imageParams.model) {
      return null;
    }

    const matchingModel = enabledImageModels?.find(
      model => model.modelId === imageParams.model
    );

    if (!matchingModel) {
      return {
        modelId: imageParams.model,
        supportsMultipleImages: false,
        supportsNegativePrompt: false,
      };
    }

    return {
      modelId: matchingModel.modelId,
      supportsMultipleImages: matchingModel.supportsMultipleImages ?? false,
      supportsNegativePrompt: matchingModel.supportsNegativePrompt ?? false,
    };
  }, [enabledImageModels, imageParams.model]);

  const sanitizedImageParams = useMemo((): ImageGenerationParams => {
    const trimmedModel = imageParams.model?.trim() ?? "";
    return {
      ...imageParams,
      model: trimmedModel,
    };
  }, [imageParams]);

  const prepareAttachments = useCallback(
    async (attachments: readonly Attachment[]) => {
      const uploadedAttachments: Attachment[] = [];
      for (const att of attachments) {
        if (att.type === "text" || att.storageId) {
          uploadedAttachments.push(att);
          continue;
        }
        if (isPrivateMode) {
          if (att.content && att.mimeType && !att.url) {
            uploadedAttachments.push({
              ...att,
              url: `data:${att.mimeType};base64,${att.content}`,
            });
          } else {
            uploadedAttachments.push(att);
          }
          continue;
        }

        if (att.content && att.mimeType && !att.storageId) {
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
            const uploaded = await uploadFile(file);
            uploadedAttachments.push(uploaded);
          } catch (_e) {
            // Fallback: keep original attachment for small files
            uploadedAttachments.push(att);
          }
        } else {
          uploadedAttachments.push(att);
        }
      }
      return uploadedAttachments;
    },
    [isPrivateMode, uploadFile]
  );

  const submitImageGeneration = useCallback(
    async (input: string, attachments: readonly Attachment[] = []) => {
      if (!sanitizedImageParams.model) {
        throw new Error(
          "Please enter a Replicate model ID in the settings. You can copy model IDs from replicate.com."
        );
      }

      const uploadedAttachments = await prepareAttachments(attachments);

      if (conversationId) {
        // Existing conversation, proceed normally
        const result = await convex.action(
          api.conversations.createUserMessage,
          {
            conversationId,
            content: input.trim(),
            attachments: uploadedAttachments,
            personaId: selectedPersonaId || undefined,
            model: sanitizedImageParams.model,
            provider: "replicate",
          }
        );

        await handleImageGeneration(
          convex,
          conversationId,
          result.userMessageId,
          input.trim(),
          sanitizedImageParams
        );
      } else {
        // No conversation exists, create a new one for image generation
        const newConversation = await convex.action(
          api.conversations.createConversationAction,
          {
            title: "Image Generation",
          }
        );

        const result = await convex.action(
          api.conversations.createUserMessage,
          {
            conversationId: newConversation.conversationId,
            content: input.trim(),
            attachments: uploadedAttachments,
            personaId: selectedPersonaId || undefined,
            model: sanitizedImageParams.model,
            provider: "replicate",
          }
        );

        await handleImageGeneration(
          convex,
          newConversation.conversationId,
          result.userMessageId,
          input.trim(),
          sanitizedImageParams
        );

        navigate(ROUTES.CHAT_CONVERSATION(newConversation.conversationId));
      }

      // Reset input state after successful submission
      onResetInputState?.();
      setImageParams(prev => ({ ...prev, negativePrompt: "" }));
    },
    [
      sanitizedImageParams,
      conversationId,
      selectedPersonaId,
      convex,
      navigate,
      onResetInputState,
      setImageParams,
      prepareAttachments,
    ]
  );

  const sendAsNewConversation = useCallback(
    async (
      input: string,
      attachments: readonly Attachment[] = [],
      shouldNavigate = true,
      personaId?: Id<"personas"> | null
    ) => {
      try {
        // Generate summary if we have a current conversation
        if (conversationId) {
          try {
            await generateSummaryAction({
              conversationId,
              maxTokens: 150,
            });
          } catch (_error) {
            // Summary generation failed, continue without summary
          }
        }

        const uploadedAttachments = await prepareAttachments(attachments);

        // Create new conversation for image generation
        const newConversation = await convex.action(
          api.conversations.createConversationAction,
          {
            title: "Image Generation",
          }
        );

        const result = await convex.action(
          api.conversations.createUserMessage,
          {
            conversationId: newConversation.conversationId,
            content: input.trim(),
            attachments: uploadedAttachments,
            personaId: personaId || selectedPersonaId || undefined,
            model: sanitizedImageParams.model,
            provider: "replicate",
          }
        );

        await handleImageGeneration(
          convex,
          newConversation.conversationId,
          result.userMessageId,
          input.trim(),
          sanitizedImageParams
        );

        if (shouldNavigate) {
          navigate(ROUTES.CHAT_CONVERSATION(newConversation.conversationId));
        }

        // Reset input state after successful submission
        onResetInputState?.();
        setImageParams(prev => ({ ...prev, negativePrompt: "" }));
        setNegativePromptEnabled(false);

        return newConversation.conversationId;
      } catch (_error) {
        // Conversation creation error is handled by the main flow
        return undefined;
      }
    },
    [
      conversationId,
      generateSummaryAction,
      convex,
      selectedPersonaId,
      sanitizedImageParams,
      navigate,
      onResetInputState,
      setImageParams,
      setNegativePromptEnabled,
      prepareAttachments,
    ]
  );

  return {
    // State
    imageParams,
    setImageParams,
    generationMode,
    setGenerationMode,
    selectedImageModel,
    negativePromptEnabled,
    setNegativePromptEnabled,

    // Actions
    submitImageGeneration,
    sendAsNewConversation,
  };
}
