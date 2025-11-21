import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { useMemo } from "react";
import type { ConversationId } from "@/types";

/**
 * Hook to get the seed from the most recent generated image in the conversation
 */
export function useLastGeneratedImageSeed(conversationId?: ConversationId) {
  const messages = useQuery(
    api.messages.getAllInConversation,
    conversationId ? { conversationId } : "skip"
  );

  const lastSeed = useMemo(() => {
    if (!messages) {
      return undefined;
    }

    // Iterate through messages in reverse to find the last generated image with a seed
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (!message?.attachments) {
        continue;
      }

      // Find generated images with seeds
      for (const attachment of message.attachments) {
        if (
          attachment.type === "image" &&
          attachment.generatedImage?.isGenerated &&
          attachment.generatedImage.seed !== undefined
        ) {
          return attachment.generatedImage.seed;
        }
      }
    }

    return undefined;
  }, [messages]);

  return lastSeed;
}
