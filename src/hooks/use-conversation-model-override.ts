import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo } from "react";
import { useUserDataContext } from "@/providers/user-data-context";
import type { ConversationId } from "@/types";

/**
 * Hook that overrides the selected model to match the last used model in a conversation
 * when entering that conversation
 */
export function useConversationModelOverride(conversationId?: ConversationId) {
  const { user } = useUserDataContext();
  const selectModelMutation = useMutation(api.userModels.selectModel);

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

  // Check if we need to override the model
  const shouldOverride = useMemo(() => {
    // Don't override for anonymous users or if we don't have necessary data
    if (!(lastUsedModel && currentSelectedModel && user) || user.isAnonymous) {
      return false;
    }

    // Don't override if the current model is already the same as the last used model
    return !(
      currentSelectedModel.modelId === lastUsedModel.modelId &&
      currentSelectedModel.provider === lastUsedModel.provider
    );
  }, [lastUsedModel, currentSelectedModel, user]);

  // Override the model when entering the conversation
  useEffect(() => {
    if (shouldOverride && lastUsedModel && conversationId) {
      selectModelMutation({
        modelId: lastUsedModel.modelId,
        provider: lastUsedModel.provider,
      }).catch(error => {
        console.warn("Failed to override model for conversation:", error);
      });
    }
  }, [shouldOverride, lastUsedModel, conversationId, selectModelMutation]);

  return {
    lastUsedModel,
    shouldOverride,
  };
}
