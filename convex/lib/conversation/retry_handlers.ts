import type { Doc, Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { api, internal } from "../../_generated/api";
import { getAuthenticatedUserWithDataForAction } from "../shared_utils";
import { handleAssistantRetry } from "./assistant_retry";
import { handleReplicateUserRetry, handleUserRetry } from "./user_retry";
import { executeStreamMessage } from "../../streaming_actions";

export async function retryFromMessageHandler(
  ctx: ActionCtx,
  args: {
    conversationId: Id<"conversations">;
    messageId: Id<"messages">;
    retryType?: "user" | "assistant";
    model?: string;
    provider?: string;
    personaId?: Id<"personas">;
    reasoningConfig?: { enabled: boolean };
  }
): Promise<{ assistantMessageId: Id<"messages"> }> {
  // Get authenticated user
  const { user } = await getAuthenticatedUserWithDataForAction(ctx);

  // Validate that the conversation belongs to the authenticated user
  const conversation = await ctx.runQuery(api.conversations.get, {
    id: args.conversationId,
  });
  if (!conversation) {
    throw new Error("Conversation not found or access denied");
  }

  // Additional security check: ensure the conversation belongs to the authenticated user
  if (conversation.userId !== user._id) {
    throw new Error(
      "Access denied: conversation does not belong to authenticated user"
    );
  }

  // Get all messages for the conversation
  const messages = await ctx.runQuery(api.messages.getAllInConversation, {
    conversationId: args.conversationId,
  });

  // Find the target message
  const messageIndex = messages.findIndex(
    (msg: Doc<"messages">) => msg._id === args.messageId
  );
  if (messageIndex === -1) {
    throw new Error("Message not found");
  }

  const targetMessage = messages[messageIndex] as Doc<"messages">;

  // Determine retry type automatically if not provided
  const retryType =
    args.retryType || (targetMessage.role === "user" ? "user" : "assistant");

  // If personaId is provided, update the conversation persona immediately
  const effectivePersonaId = args.personaId ?? conversation.personaId;
  if (args.personaId && args.personaId !== conversation.personaId) {
    await ctx.runMutation(internal.conversations.internalPatch, {
      id: args.conversationId,
      updates: { personaId: args.personaId },
      setUpdatedAt: true,
    });
  }

  const requestedModel =
    args.model ?? (targetMessage.model as string | undefined);
  const requestedProvider =
    args.provider ?? (targetMessage.provider as string | undefined);
  const normalizedProvider = requestedProvider?.toLowerCase();

  if (retryType === "assistant") {
    return handleAssistantRetry(ctx, {
      conversationId: args.conversationId,
      reasoningConfig: args.reasoningConfig,
      user,
      messages,
      messageIndex,
      targetMessage,
      effectivePersonaId,
      requestedModel,
      requestedProvider,
    });
  }

  if (retryType === "user" && normalizedProvider === "replicate") {
    return handleReplicateUserRetry(ctx, {
      conversationId: args.conversationId,
      messages,
      messageIndex,
      targetMessage,
      requestedModel,
    });
  }

  // User retry: keep the user message, delete messages after it, and create a fresh assistant message
  return handleUserRetry(ctx, {
    conversationId: args.conversationId,
    reasoningConfig: args.reasoningConfig,
    user,
    conversation,
    messages,
    messageIndex,
    effectivePersonaId,
    requestedModel,
    requestedProvider,
  });
}

export async function editMessageHandler(
  ctx: ActionCtx,
  args: {
    conversationId: Id<"conversations">;
    messageId: Id<"messages">;
    newContent: string;
    model?: string;
    provider?: string;
    reasoningConfig?: { enabled: boolean };
  }
): Promise<{ assistantMessageId: Id<"messages"> }> {
  // Get authenticated user
  const { user } = await getAuthenticatedUserWithDataForAction(ctx);

  // Validate that the conversation belongs to the authenticated user
  const conversation = await ctx.runQuery(api.conversations.get, {
    id: args.conversationId,
  });
  if (!conversation) {
    throw new Error("Conversation not found or access denied");
  }

  if (conversation.userId !== user._id) {
    throw new Error(
      "Access denied: conversation does not belong to authenticated user"
    );
  }

  // Get all messages for the conversation
  const messages = await ctx.runQuery(api.messages.getAllInConversation, {
    conversationId: args.conversationId,
  });

  // Find the target message and validate it's a user message
  const messageIndex = messages.findIndex(
    (msg: Doc<"messages">) => msg._id === args.messageId
  );
  if (messageIndex === -1) {
    throw new Error("Message not found");
  }

  const targetMessage = messages[messageIndex];
  if (!targetMessage) {
    throw new Error("Message not found");
  }
  if (targetMessage.role !== "user") {
    throw new Error("Can only edit user messages");
  }

  // Compute IDs to delete (messages after the edited message, excluding context)
  const messageIdsToDelete = messages
    .slice(messageIndex + 1)
    .filter((msg: Doc<"messages">) => msg.role !== "context")
    .map((msg: Doc<"messages">) => msg._id);

  // Prefer the original model/provider recorded on the edited message
  const preferredModelId = targetMessage.model || args.model;
  const preferredProvider = targetMessage.provider || args.provider;

  // Single combined mutation: update content, delete subsequent, create assistant, set streaming
  // scheduleStreaming: false because we call executeStreamMessage directly below
  const { assistantMessageId, streamingArgs } = await ctx.runMutation(
    internal.conversations.prepareEditAndResend,
    {
      userId: user._id,
      conversationId: args.conversationId,
      userMessageId: args.messageId,
      newContent: args.newContent,
      messageIdsToDelete,
      model: preferredModelId,
      provider: preferredProvider,
      personaId: conversation.personaId,
      reasoningConfig: args.reasoningConfig,
      scheduleStreaming: false,
    },
  );

  await executeStreamMessage(ctx, {
    messageId: assistantMessageId,
    conversationId: args.conversationId,
    model: streamingArgs.modelId,
    provider: streamingArgs.provider,
    personaId: conversation.personaId,
    reasoningConfig: args.reasoningConfig,
    supportsTools: streamingArgs.supportsTools,
    supportsImages: streamingArgs.supportsImages,
    supportsFiles: streamingArgs.supportsFiles,
    supportsReasoning: streamingArgs.supportsReasoning,
    supportsTemperature: streamingArgs.supportsTemperature,
    contextLength: streamingArgs.contextLength,
    userId: user._id,
  });

  return { assistantMessageId };
}
