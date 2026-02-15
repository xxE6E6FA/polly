import type { Doc, Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { api, internal } from "../../_generated/api";
import type { ImageModelInfo } from "../../ai/tools";
import { toImageModelInfos } from "./helpers";
import { handleMessageDeletion } from "./message_handling";
import {
  buildContextMessages,
  executeStreamingActionForRetry,
} from "../conversation_utils";
import { getUserEffectiveModelWithCapabilities } from "../model_resolution";
import { getAuthenticatedUserWithDataForAction } from "../shared_utils";
import { handleAssistantRetry } from "./assistant_retry";
import { handleReplicateUserRetry, handleUserRetry } from "./user_retry";

export async function retryFromMessageHandler(
  ctx: ActionCtx,
  args: {
    conversationId: Id<"conversations">;
    messageId: Id<"messages">;
    retryType?: "user" | "assistant";
    model?: string;
    provider?: string;
    personaId?: Id<"personas">;
    reasoningConfig?: {
      enabled: boolean;
      effort: "low" | "medium" | "high";
      maxTokens?: number;
    };
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
    reasoningConfig?: {
      enabled: boolean;
      effort: "low" | "medium" | "high";
      maxTokens?: number;
    };
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

  // Update the message content
  await ctx.runMutation(internal.messages.updateContent, {
    messageId: args.messageId,
    content: args.newContent,
  });

  // Delete all messages after the edited message (use user retry logic)
  await handleMessageDeletion(ctx, messages, messageIndex, "user");

  // Prefer the original model/provider recorded on the edited message
  const preferredModelId = targetMessage.model || args.model;
  const preferredProvider = targetMessage.provider || args.provider;

  const fullModel = await getUserEffectiveModelWithCapabilities(
    ctx,
    preferredModelId,
    preferredProvider
  );

  // Query image models if the text model supports tools
  const editSupportsTools = fullModel.supportsTools ?? false;
  let imageModelsForEdit: ImageModelInfo[] | undefined;
  if (editSupportsTools) {
    const userImageModels = await ctx.runQuery(
      internal.imageModels.getUserImageModelsInternal,
      { userId: user._id }
    );
    imageModelsForEdit = toImageModelInfos(userImageModels);
  }

  // Build context messages including the edited message
  const { contextMessages } = await buildContextMessages(ctx, {
    conversationId: args.conversationId,
    personaId: conversation.personaId,
    modelCapabilities: {
      supportsImages: fullModel.supportsImages ?? false,
      supportsFiles: fullModel.supportsFiles ?? false,
    },
    provider: fullModel.provider,
    modelId: fullModel.modelId,
    prefetchedMessages: messages,
    prefetchedModelInfo: { contextLength: fullModel.contextLength },
  });

  // Execute streaming action for retry
  const result = await executeStreamingActionForRetry(ctx, {
    conversationId: args.conversationId,
    model: fullModel.modelId,
    provider: fullModel.provider,
    conversation,
    contextMessages,
    useWebSearch: true,
    reasoningConfig: args.reasoningConfig,
    supportsTools: editSupportsTools,
    supportsFiles: fullModel.supportsFiles ?? false,
    imageModels: imageModelsForEdit,
    userId: user._id,
  });

  return { assistantMessageId: result.assistantMessageId };
}
