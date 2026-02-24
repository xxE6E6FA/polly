import type { Doc, Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { executeStreamMessage } from "../../streaming_actions";

export async function handleAssistantRetry(
  ctx: ActionCtx,
  params: {
    conversationId: Id<"conversations">;
    reasoningConfig?: { enabled: boolean };
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

  // Build context up to the previous user message
  const previousUserMessageIndex = messageIndex - 1;
  const previousUserMessage = messages[previousUserMessageIndex];
  if (!previousUserMessage || previousUserMessage.role !== "user") {
    throw new Error("Cannot find previous user message to retry from");
  }

  // Compute IDs to delete (messages after the target, excluding context)
  const messageIdsToDelete = messages
    .slice(messageIndex + 1)
    .filter(msg => msg.role !== "context")
    .map(msg => msg._id);

  // Single combined mutation: deletes messages, resets target, sets streaming state
  const { streamingArgs } = await ctx.runMutation(
    internal.conversations.prepareAssistantRetry,
    {
      userId: user._id,
      conversationId,
      targetMessageId: targetMessage._id,
      messageIdsToDelete,
      model: requestedModel,
      provider: requestedProvider,
      reasoningConfig,
      previousUserMessageIndex,
      personaId: effectivePersonaId,
    },
  );

  // Direct streaming call — skip scheduler hop (~50-200ms savings)
  await executeStreamMessage(ctx, {
    messageId: targetMessage._id,
    conversationId,
    model: streamingArgs.modelId,
    provider: streamingArgs.provider,
    personaId: effectivePersonaId,
    reasoningConfig,
    supportsTools: streamingArgs.supportsTools,
    supportsImages: streamingArgs.supportsImages,
    supportsFiles: streamingArgs.supportsFiles,
    supportsReasoning: streamingArgs.supportsReasoning,
    supportsTemperature: streamingArgs.supportsTemperature,
    contextLength: streamingArgs.contextLength,
    contextEndIndex: streamingArgs.contextEndIndex,
    userId: user._id,
  });

  return { assistantMessageId: targetMessage._id };
}
