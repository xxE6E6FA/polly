import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import { useUserIdentity } from "@/providers/user-data-context";
import { useChatInputStore } from "@/stores/chat-input-store";
import type { ConversationId } from "@/types";

/**
 * Hook that overrides the selected model to match the last used model in a conversation
 * when entering that conversation
 */
type LastUsedModel = {
  modelId: string;
  provider: string;
} | null;

type SelectedModel =
  | {
      modelId: string;
      provider: string;
    }
  | null
  | undefined;

export function useConversationModelOverride(
  conversationId?: ConversationId,
  initialModel?: LastUsedModel,
  currentSelectedModel?: SelectedModel
) {
  const { user } = useUserIdentity();
  const selectModelMutation = useMutation(api.userModels.selectModel);
  const lastAppliedKeyRef = useRef<string | null>(null);
  const setSelectedModel = useChatInputStore(s => s.setSelectedModel);

  // Get the last used model from the conversation
  const queryLastUsedModel = useQuery(
    api.messages.getLastUsedModel,
    conversationId
      ? { conversationId: conversationId as Id<"conversations"> }
      : "skip"
  );

  const effectiveLastUsedModel = queryLastUsedModel ?? initialModel ?? null;

  const resolvedModel = useQuery(
    api.userModels.getModelByID,
    effectiveLastUsedModel
      ? {
          modelId: effectiveLastUsedModel.modelId,
          provider: effectiveLastUsedModel.provider,
        }
      : "skip"
  );

  // Override the model when entering a new conversation
  useEffect(() => {
    if (
      !(conversationId && effectiveLastUsedModel) ||
      effectiveLastUsedModel === null ||
      resolvedModel === undefined
    ) {
      return;
    }

    if (resolvedModel === null) {
      return;
    }

    const conversationPrefix = `${conversationId}:`;
    if (
      lastAppliedKeyRef.current &&
      !lastAppliedKeyRef.current.startsWith(conversationPrefix)
    ) {
      lastAppliedKeyRef.current = null;
    }

    const overrideKey = `${conversationId}:${effectiveLastUsedModel.modelId}:${effectiveLastUsedModel.provider}`;
    if (lastAppliedKeyRef.current === overrideKey) {
      return;
    }

    // Update local model state immediately to reflect the conversation's context.
    setSelectedModel(resolvedModel as unknown as import("@/types").AIModel);

    // Persist selection server-side when possible (non-anonymous users).
    const hasModelMismatch =
      !currentSelectedModel ||
      currentSelectedModel === null ||
      currentSelectedModel.modelId !== effectiveLastUsedModel.modelId ||
      currentSelectedModel.provider !== effectiveLastUsedModel.provider;

    if (user && !user.isAnonymous && hasModelMismatch) {
      selectModelMutation({
        modelId: effectiveLastUsedModel.modelId,
        provider: effectiveLastUsedModel.provider,
      }).catch(error => {
        console.warn("Failed to override model for conversation:", error);
      });
    }

    lastAppliedKeyRef.current = overrideKey;
  }, [
    conversationId,
    effectiveLastUsedModel,
    currentSelectedModel,
    user,
    selectModelMutation,
    setSelectedModel,
    resolvedModel,
  ]);

  // Reset the tracking when conversationId becomes null (user navigates away)
  useEffect(() => {
    if (!conversationId) {
      lastAppliedKeyRef.current = null;
    }
  }, [conversationId]);

  return {
    lastUsedModel: effectiveLastUsedModel,
    shouldOverride: false, // Always return false since we handle override logic internally
  };
}
