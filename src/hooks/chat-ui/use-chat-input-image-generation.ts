import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useConvex } from "convex/react";
import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useConvexFileUpload } from "@/hooks/use-convex-file-upload";
import { useEnabledImageModels } from "@/hooks/use-enabled-image-models";
import { useImageParams } from "@/hooks/use-generation";
import { useReplicateSchema } from "@/hooks/use-replicate-schema";
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
  const enabledImageModels = useEnabledImageModels();
  const { setParams: setImageParams, setNegativePromptEnabled } =
    useImageParams();

  // Fetch fresh schema capabilities to ensure UI reflects latest detection logic
  // This overrides potentially stale data in the database
  const { schema, capabilities } = useReplicateSchema(imageParams.model);

  // Simple conditional logic - React Compiler will optimize if needed
  const selectedImageModel = imageParams.model
    ? (() => {
        // If we have a fresh schema, prefer its capabilities
        if (schema) {
          return {
            modelId: imageParams.model,
            provider: "replicate",
            supportsMultipleImages: capabilities.supportsMultipleImages,
            supportsNegativePrompt: capabilities.supportsNegativePrompt,
            supportsImageToImage: capabilities.supportsImageInput,
            supportsImages: capabilities.supportsImageInput,
          };
        }

        // Fallback to database values if schema not yet loaded
        const matchingModel = enabledImageModels?.find(
          model => model.modelId === imageParams.model
        );

        if (!matchingModel) {
          return {
            modelId: imageParams.model,
            provider: "replicate",
            supportsMultipleImages: false,
            supportsNegativePrompt: false,
            supportsImageToImage: false,
            supportsImages: false,
          };
        }

        return {
          modelId: matchingModel.modelId,
          provider: "replicate",
          supportsMultipleImages: matchingModel.supportsMultipleImages ?? false,
          supportsNegativePrompt: matchingModel.supportsNegativePrompt ?? false,
          supportsImageToImage: matchingModel.supportsImageToImage ?? false,
          supportsImages: matchingModel.supportsImageToImage ?? false,
        };
      })()
    : null;

  // Keep memoized because it's used in useCallback dependencies
  const sanitizedImageParams = useMemo(
    (): ImageGenerationParams => ({
      ...imageParams,
      model: imageParams.model?.trim() ?? "",
    }),
    [imageParams]
  );

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
    setImageParams(prev => ({ ...prev, negativePrompt: "" }));
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
    setImageParams,
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
      input,
      selectedPersonaId,
      sanitizedImageParams,
      navigate,
      onResetInputState,
      setImageParams,
      setNegativePromptEnabled,
    ]
  );

  return {
    selectedImageModel,
    handleImageGenerationSubmit,
    handleSendAsNewConversation,
  };
}
