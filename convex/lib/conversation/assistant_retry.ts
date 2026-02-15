import type { Doc, Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { api, internal } from "../../_generated/api";
import type { ImageModelInfo } from "../../ai/tools";
import { toImageModelInfos } from "./helpers";
import {
  buildContextMessages,
} from "../conversation_utils";
import { getUserEffectiveModelWithCapabilities } from "../model_resolution";

export async function handleAssistantRetry(
  ctx: ActionCtx,
  params: {
    conversationId: Id<"conversations">;
    reasoningConfig?: { enabled: boolean; effort: "low" | "medium" | "high"; maxTokens?: number };
    user: Doc<"users">;
    messages: Doc<"messages">[];
    messageIndex: number;
    targetMessage: Doc<"messages">;
    effectivePersonaId: Id<"personas"> | undefined;
    requestedModel: string | undefined;
    requestedProvider: string | undefined;
  }
): Promise<{ assistantMessageId: Id<"messages"> }> {
  const {
    conversationId, reasoningConfig, user, messages, messageIndex,
    targetMessage, effectivePersonaId, requestedModel, requestedProvider,
  } = params;

  const fullModel = await getUserEffectiveModelWithCapabilities(ctx, requestedModel, requestedProvider);

  // Clear stop request FIRST to prevent race conditions with previous streaming actions
  await ctx.runMutation(internal.conversations.internalPatch, {
    id: conversationId,
    updates: { isStreaming: false },
    clearFields: ["stopRequested"],
  });

  // Delete messages after the assistant message (preserve context)
  const messagesToDelete = messages.slice(messageIndex + 1);
  for (const msg of messagesToDelete) {
    if (msg.role === "context") {
      continue;
    }
    await ctx.runMutation(api.messages.remove, { id: msg._id });
  }

  // Clear the assistant message content and reset ALL streaming-related state
  await ctx.runMutation(internal.messages.internalUpdate, {
    id: targetMessage._id,
    content: "",
    reasoning: "",
    citations: [],
    toolCalls: [],
    attachments: [],
    reasoningParts: [],
    model: fullModel.modelId,
    provider: fullModel.provider as
      | "openai" | "anthropic" | "google" | "groq"
      | "openrouter" | "replicate" | "elevenlabs",
    clearMetadataFields: ["finishReason", "stopped"],
  });

  // Set status to thinking
  await ctx.runMutation(internal.messages.updateMessageStatus, {
    messageId: targetMessage._id,
    status: "thinking",
  });

  // Mark conversation as streaming and clear any previous stop request
  await ctx.runMutation(internal.conversations.internalPatch, {
    id: conversationId,
    updates: { isStreaming: true },
    clearFields: ["stopRequested"],
  });

  // Build context up to the previous user message
  const previousUserMessageIndex = messageIndex - 1;
  const previousUserMessage = messages[previousUserMessageIndex];
  if (!previousUserMessage || previousUserMessage.role !== "user") {
    throw new Error("Cannot find previous user message to retry from");
  }

  // Query image models if the text model supports tools
  const retrySupportsTools = fullModel.supportsTools ?? false;
  let imageModelsForRetry: ImageModelInfo[] | undefined;
  if (retrySupportsTools) {
    const userImageModels = await ctx.runQuery(
      internal.imageModels.getUserImageModelsInternal,
      { userId: user._id }
    );
    imageModelsForRetry = toImageModelInfos(userImageModels);
  }

  // Build context messages for streaming
  const { contextMessages } = await buildContextMessages(ctx, {
    conversationId,
    personaId: effectivePersonaId,
    includeUpToIndex: previousUserMessageIndex,
    modelCapabilities: {
      supportsImages: fullModel.supportsImages ?? false,
      supportsFiles: fullModel.supportsFiles ?? false,
    },
    provider: fullModel.provider,
    modelId: fullModel.modelId,
    prefetchedMessages: messages,
    prefetchedModelInfo: { contextLength: fullModel.contextLength },
  });

  // Schedule the streaming action to regenerate the assistant response
  await ctx.scheduler.runAfter(0, internal.streaming_actions.streamMessage, {
    messageId: targetMessage._id,
    conversationId,
    model: fullModel.modelId,
    provider: fullModel.provider,
    messages: contextMessages,
    personaId: effectivePersonaId,
    reasoningConfig,
    supportsTools: retrySupportsTools,
    supportsFiles: fullModel.supportsFiles ?? false,
    supportsReasoning: fullModel.supportsReasoning ?? false,
    imageModels: imageModelsForRetry,
    userId: user._id,
  });

  return { assistantMessageId: targetMessage._id };
}
