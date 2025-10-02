import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useConvex } from "convex/react";
import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useConvexFileUpload } from "@/hooks/use-convex-file-upload";
import { handleImageGeneration } from "@/lib/ai/image-generation-handlers";
import { ROUTES } from "@/lib/routes";
import { usePrivateMode } from "@/providers/private-mode-context";
import type {
  Attachment,
  ConversationId,
  GenerationMode,
  ImageGenerationParams,
} from "@/types";

/**
 * useChatInputImageGeneration
 *
 * Starts a Replicate image generation job and wires up the assistant message that tracks progress.
 *
 * Reference Images
 * - Pass `attachments` containing images to upload a user-provided reference for image-to-image models.
 * - In non-private mode, images are uploaded to Convex storage before creating the user message.
 * - In private mode, images remain local and are attached as data URLs.
 * - If no image is attached, the backend will fall back to the most recent assistant-generated image in the same conversation
 *   when the selected model supports an image input.
 */
interface UseChatInputImageGenerationProps {
  conversationId?: ConversationId;
  selectedPersonaId: Id<"personas"> | null;
  input: string;
  imageParams: ImageGenerationParams;
  generationMode: GenerationMode;
  onResetInputState: () => void;
  /** Optional user attachments to seed image-to-image generation. */
  attachments?: readonly Attachment[];
}

export function useChatInputImageGeneration({
  conversationId,
  selectedPersonaId,
  input,
  imageParams,

  onResetInputState,
  attachments = [],
}: UseChatInputImageGenerationProps) {
  const convex = useConvex();
  const navigate = useNavigate();
  const generateSummaryAction = useAction(
    api.conversationSummary.generateConversationSummary
  );
  const { uploadFile } = useConvexFileUpload();
  const { isPrivateMode } = usePrivateMode();

  const selectedImageModel = useMemo(() => {
    if (!imageParams.model) {
      return null;
    }

    // This will be provided by the parent component
    return {
      modelId: imageParams.model,
      supportsMultipleImages: false,
      supportsNegativePrompt: false,
    };
  }, [imageParams.model]);

  const sanitizedImageParams = useMemo((): ImageGenerationParams => {
    const trimmedModel = imageParams.model?.trim() ?? "";
    return {
      ...imageParams,
      model: trimmedModel,
    };
  }, [imageParams]);

  const handleImageGenerationSubmit = useCallback(async () => {
    if (!sanitizedImageParams.model) {
      throw new Error(
        "Please enter a Replicate model ID in the settings. You can copy model IDs from replicate.com."
      );
    }

    // Prepare attachments: upload to Convex storage when not in private mode
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
          const file = new File([byteArray], att.name, { type: att.mimeType });
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

    if (conversationId) {
      // Existing conversation, proceed normally
      const result = await convex.action(api.conversations.createUserMessage, {
        conversationId,
        content: input.trim(),
        attachments: uploadedAttachments,
        personaId: selectedPersonaId || undefined,
        model: sanitizedImageParams.model,
        provider: "replicate",
      });

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

      const result = await convex.action(api.conversations.createUserMessage, {
        conversationId: newConversation.conversationId,
        content: input.trim(),
        attachments: uploadedAttachments,
        personaId: selectedPersonaId || undefined,
        model: sanitizedImageParams.model,
        provider: "replicate",
      });

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
    onResetInputState();
  }, [
    sanitizedImageParams,
    conversationId,
    input,
    selectedPersonaId,
    convex,
    navigate,
    onResetInputState,
    attachments,
    isPrivateMode,
    uploadFile,
  ]);

  const handleSendAsNewConversation = useCallback(
    async (shouldNavigate = true, personaId?: Id<"personas"> | null) => {
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
        onResetInputState();

        return newConversation.conversationId;
      } catch (_error) {
        // Conversation creation error is handled by the main flow
        return undefined;
      }
    },
    [
      conversationId,
      input,
      selectedPersonaId,
      sanitizedImageParams,
      convex,
      navigate,
      generateSummaryAction,
      onResetInputState,
    ]
  );

  return {
    selectedImageModel,
    handleImageGenerationSubmit,
    handleSendAsNewConversation,
  };
}
