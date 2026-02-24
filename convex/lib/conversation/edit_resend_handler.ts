import type { Doc, Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { api, internal } from "../../_generated/api";
import { getAuthenticatedUserWithDataForAction } from "../shared_utils";
import { executeStreamMessage } from "../../streaming_actions";

export async function editAndResendMessageHandler(
  ctx: ActionCtx,
  args: {
    messageId: Id<"messages">;
    model?: string;
    provider?: string;
    newContent: string;
    reasoningConfig?: { enabled: boolean };
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    webSearchMaxResults?: number;
  }
): Promise<{ assistantMessageId: Id<"messages"> }> {
  // Parallel: get message, auth, and conversation
  const [message, { user }] = await Promise.all([
    ctx.runQuery(api.messages.getById, { id: args.messageId }),
    getAuthenticatedUserWithDataForAction(ctx),
  ]);

  if (!message) {
    throw new Error("Message not found");
  }
  if (message.role !== "user") {
    throw new Error("Can only edit user messages");
  }

  const conversation = await ctx.runQuery(api.conversations.get, {
    id: message.conversationId,
  });
  if (!conversation) {
    throw new Error("Conversation not found or access denied");
  }
  if (conversation.userId !== user._id) {
    throw new Error(
      "Access denied: conversation does not belong to authenticated user"
    );
  }

  // Get all messages to compute which ones to delete
  const messages = await ctx.runQuery(api.messages.getAllInConversation, {
    conversationId: message.conversationId,
  });

  const messageIndex = messages.findIndex(
    (msg: Doc<"messages">) => msg._id === args.messageId
  );
  if (messageIndex === -1) {
    throw new Error("Message not found");
  }

  // Choose model/provider: prefer the original model stored on the edited message
  const preferredModelId = message.model || args.model;
  const preferredProvider = message.provider || args.provider;
  const normalizedProvider = preferredProvider?.toLowerCase();

  // Handle Replicate (image generation) — keep existing path
  if (normalizedProvider === "replicate") {
    const prompt = args.newContent;

    const messagesToDelete = messages.slice(messageIndex + 1);
    const subsequentAssistant = messagesToDelete.find(
      (
        msg
      ): msg is Doc<"messages"> & {
        imageGeneration: Doc<"messages">["imageGeneration"];
      } => msg.role === "assistant" && Boolean(msg.imageGeneration)
    );

    const previousMetadata = subsequentAssistant?.imageGeneration?.metadata;
    const candidateModel =
      preferredModelId || (previousMetadata?.model as string | undefined);

    if (!candidateModel) {
      throw new Error(
        "Unable to determine Replicate model for edit. Please choose a model and try again."
      );
    }

    const allowedParamKeys = new Set([
      "aspectRatio", "steps", "guidanceScale", "seed", "negativePrompt", "count",
    ]);

    const sanitizedParams = previousMetadata?.params
      ? (Object.fromEntries(
          Object.entries(previousMetadata.params).filter(
            ([key, value]) =>
              allowedParamKeys.has(key) &&
              value !== undefined &&
              value !== null
          )
        ) as {
          aspectRatio?: string;
          steps?: number;
          guidanceScale?: number;
          seed?: number;
          negativePrompt?: string;
          count?: number;
        })
      : undefined;

    // Update content
    await ctx.runMutation(internal.messages.updateContent, {
      messageId: args.messageId,
      content: args.newContent,
    });

    // Delete subsequent messages
    const messageIdsToDelete = messagesToDelete
      .filter((msg: Doc<"messages">) => msg.role !== "context")
      .map((msg: Doc<"messages">) => msg._id);
    if (messageIdsToDelete.length > 0) {
      await ctx.runMutation(api.messages.removeMultiple, {
        ids: messageIdsToDelete,
      });
    }

    if (
      message.model !== candidateModel ||
      message.provider?.toLowerCase() !== "replicate"
    ) {
      await ctx.runMutation(internal.messages.internalUpdate, {
        id: message._id,
        model: candidateModel,
        provider: "replicate",
      });
    }

    const imageGenerationMetadata: {
      model: string;
      prompt: string;
      params?: {
        aspectRatio?: string;
        steps?: number;
        guidanceScale?: number;
        seed?: number;
        negativePrompt?: string;
        count?: number;
      };
    } = {
      model: candidateModel,
      prompt,
    };

    if (sanitizedParams && Object.keys(sanitizedParams).length > 0) {
      imageGenerationMetadata.params = sanitizedParams;
    }

    const assistantMessageId = await ctx.runMutation(api.messages.create, {
      conversationId: message.conversationId,
      role: "assistant",
      content: "",
      status: "streaming",
      model: "replicate",
      provider: "replicate",
      imageGeneration: {
        status: "starting",
        metadata: imageGenerationMetadata,
      },
    });

    await ctx.runMutation(internal.conversations.internalPatch, {
      id: message.conversationId,
      updates: { isStreaming: true },
      setUpdatedAt: true,
    });

    await ctx.runAction(api.ai.replicate.generateImage, {
      conversationId: message.conversationId,
      messageId: assistantMessageId,
      prompt,
      model: candidateModel,
      params:
        sanitizedParams && Object.keys(sanitizedParams).length > 0
          ? sanitizedParams
          : undefined,
    });

    return { assistantMessageId };
  }

  // Non-Replicate path: use combined mutation + direct streaming
  const messageIdsToDelete = messages
    .slice(messageIndex + 1)
    .filter((msg: Doc<"messages">) => msg.role !== "context")
    .map((msg: Doc<"messages">) => msg._id);

  // Single combined mutation: update content, delete subsequent, create assistant, set streaming
  const { assistantMessageId, streamingArgs } = await ctx.runMutation(
    internal.conversations.prepareEditAndResend,
    {
      userId: user._id,
      conversationId: message.conversationId,
      userMessageId: args.messageId,
      newContent: args.newContent,
      messageIdsToDelete,
      model: preferredModelId,
      provider: preferredProvider,
      personaId: conversation.personaId,
      reasoningConfig: args.reasoningConfig,
    },
  );

  // Direct streaming call — skip scheduler hop (~50-200ms savings)
  await executeStreamMessage(ctx, {
    messageId: assistantMessageId,
    conversationId: message.conversationId,
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
