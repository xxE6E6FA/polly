import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useConvex } from "convex/react";
import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { handleImageGeneration } from "@/lib/ai/image-generation-handlers";
import { ROUTES } from "@/lib/routes";
import type {
  ConversationId,
  GenerationMode,
  ImageGenerationParams,
} from "@/types";

interface UseChatInputImageGenerationProps {
  conversationId?: ConversationId;
  selectedPersonaId: Id<"personas"> | null;
  input: string;
  imageParams: ImageGenerationParams;
  generationMode: GenerationMode;
  onResetInputState: () => void;
}

export function useChatInputImageGeneration({
  conversationId,
  selectedPersonaId,
  input,
  imageParams,

  onResetInputState,
}: UseChatInputImageGenerationProps) {
  const convex = useConvex();
  const navigate = useNavigate();
  const generateSummaryAction = useAction(
    api.conversationSummary.generateConversationSummary
  );

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

  const handleImageGenerationSubmit = useCallback(async () => {
    if (!imageParams.model?.trim()) {
      throw new Error(
        "Please enter a Replicate model ID in the settings. You can copy model IDs from replicate.com."
      );
    }

    if (conversationId) {
      // Existing conversation, proceed normally
      const result = await convex.action(api.conversations.createUserMessage, {
        conversationId,
        content: input.trim(),
        personaId: selectedPersonaId || undefined,
      });

      await handleImageGeneration(
        convex,
        conversationId,
        result.userMessageId,
        input.trim(),
        imageParams
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
        personaId: selectedPersonaId || undefined,
      });

      await handleImageGeneration(
        convex,
        newConversation.conversationId,
        result.userMessageId,
        input.trim(),
        imageParams
      );

      navigate(ROUTES.CHAT_CONVERSATION(newConversation.conversationId));
    }

    // Reset input state after successful submission
    onResetInputState();
  }, [
    imageParams,
    conversationId,
    input,
    selectedPersonaId,
    convex,
    navigate,
    onResetInputState,
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
          }
        );

        await handleImageGeneration(
          convex,
          newConversation.conversationId,
          result.userMessageId,
          input.trim(),
          imageParams
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
      imageParams,
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
