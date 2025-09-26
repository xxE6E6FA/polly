import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useConvex } from "convex/react";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { handleImageGeneration } from "@/lib/ai/image-generation-handlers";
import { ROUTES } from "@/lib/routes";
import type {
  Attachment,
  ConversationId,
  ImageGenerationParams,
} from "@/types";

interface UseSubmitLogicOptions {
  conversationId?: ConversationId;
  selectedPersonaId: Id<"personas"> | null;
  generationMode: "text" | "image";
  imageParams: {
    model?: string;
    prompt?: string;
    aspectRatio?: string;
    steps?: number;
    guidanceScale?: number;
    count?: number;
    negativePrompt?: string;
  };
  setInput: (value: string) => void;
  setAttachments: (attachments: Attachment[]) => void;
  resetImageParams: () => void;
  clearChatInputState: () => void;
  shouldUsePreservedState: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

export function useSubmitLogic({
  conversationId,
  selectedPersonaId,
  generationMode,
  imageParams,
  setInput,
  setAttachments,
  resetImageParams,
  clearChatInputState,
  shouldUsePreservedState,
  textareaRef,
}: UseSubmitLogicOptions) {
  const convex = useConvex();
  const navigate = useNavigate();
  const [isUploading] = useState(false);

  const submit = useCallback(async () => {
    if (generationMode === "image") {
      // Handle image generation
      const trimmedModelId = imageParams.model?.trim();
      if (!trimmedModelId) {
        throw new Error(
          "Please enter a Replicate model ID in the settings. You can copy model IDs from replicate.com."
        );
      }

      const sanitizedParams: ImageGenerationParams = {
        ...imageParams,
        model: trimmedModelId,
        prompt: imageParams.prompt || "",
      } as ImageGenerationParams;

      if (conversationId) {
        // Existing conversation, proceed normally
        const result = await convex.action(
          api.conversations.createUserMessage,
          {
            conversationId: conversationId as Id<"conversations">,
            content: "",
            personaId: selectedPersonaId || undefined,
            model: sanitizedParams.model,
            provider: "replicate",
          }
        );

        await handleImageGeneration(
          convex,
          conversationId as Id<"conversations">,
          result.userMessageId,
          "",
          sanitizedParams
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
            content: "",
            personaId: selectedPersonaId || undefined,
            model: sanitizedParams.model,
            provider: "replicate",
          }
        );

        await handleImageGeneration(
          convex,
          newConversation.conversationId as Id<"conversations">,
          result.userMessageId,
          "",
          sanitizedParams
        );

        navigate(ROUTES.CHAT_CONVERSATION(newConversation.conversationId));
      }
    } else {
      // Handle text generation - this would need to be implemented
      // For now, just reset the form
    }

    // Reset state
    setInput("");
    setAttachments([]);
    resetImageParams();

    textareaRef.current?.focus();
    if (shouldUsePreservedState) {
      clearChatInputState();
    }
  }, [
    generationMode,
    imageParams,
    conversationId,
    selectedPersonaId,
    convex,
    navigate,
    setInput,
    setAttachments,
    resetImageParams,
    clearChatInputState,
    shouldUsePreservedState,
    textareaRef,
  ]);

  return {
    submit,
    isUploading,
  };
}
