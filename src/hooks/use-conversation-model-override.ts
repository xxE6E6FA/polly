import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import { useUserDataContext } from "@/providers/user-data-context";
import type { ConversationId } from "@/types";

/**
 * Hook that overrides the selected model to match the last used model in a conversation
 * when entering that conversation
 */
export function useConversationModelOverride(conversationId?: ConversationId) {
  const { user } = useUserDataContext();
  const selectModelMutation = useMutation(api.userModels.selectModel);
  const lastProcessedConversationId = useRef<ConversationId | null>(null);

  // Get the last used model from the conversation
  const lastUsedModel = useQuery(
    api.messages.getLastUsedModel,
    conversationId
      ? { conversationId: conversationId as Id<"conversations"> }
      : "skip"
  );

  // Get the currently selected model
  const currentSelectedModel = useQuery(
    api.userModels.getUserSelectedModel,
    {}
  );

  // Override the model when entering a new conversation
  useEffect(() => {
    if (
      conversationId &&
      lastUsedModel &&
      currentSelectedModel &&
      user &&
      !user.isAnonymous &&
      lastProcessedConversationId.current !== conversationId
    ) {
      // Only override if the models are different
      if (
        currentSelectedModel.modelId !== lastUsedModel.modelId ||
        currentSelectedModel.provider !== lastUsedModel.provider
      ) {
        lastProcessedConversationId.current = conversationId;
        selectModelMutation({
          modelId: lastUsedModel.modelId,
          provider: lastUsedModel.provider,
        }).catch(error => {
          console.warn("Failed to override model for conversation:", error);
        });
      } else {
        // Mark as processed even if no override was needed
        lastProcessedConversationId.current = conversationId;
      }
    }
  }, [
    conversationId,
    lastUsedModel,
    currentSelectedModel,
    user,
    selectModelMutation,
  ]);

  // Reset the tracking when conversationId becomes null (user navigates away)
  useEffect(() => {
    if (!conversationId) {
      lastProcessedConversationId.current = null;
    }
  }, [conversationId]);

  return {
    lastUsedModel,
    shouldOverride: false, // Always return false since we handle override logic internally
  };
}
