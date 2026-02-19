import type { Doc, Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { api, internal } from "../../_generated/api";
import {
  buildContextMessages,
} from "../conversation_utils";
import { getUserEffectiveModelWithCapabilities } from "../model_resolution";
import { getAuthenticatedUserWithDataForAction } from "../shared_utils";

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
  // Get the message to find the conversation
  const message = await ctx.runQuery(api.messages.getById, {
    id: args.messageId,
  });
  if (!message) {
    throw new Error("Message not found");
  }

  if (message.role !== "user") {
    throw new Error("Can only edit user messages");
  }

  // Get authenticated user
  const { user } = await getAuthenticatedUserWithDataForAction(ctx);

  // Validate that the conversation belongs to the authenticated user
  const conversation = await ctx.runQuery(api.conversations.get, {
    id: message.conversationId,
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
    conversationId: message.conversationId,
  });

  const messageIndex = messages.findIndex(
    (msg: Doc<"messages">) => msg._id === args.messageId
  );
  if (messageIndex === -1) {
    throw new Error("Message not found");
  }

  // IMPORTANT: Preserve attachments by updating the existing user message
  await ctx.runMutation(internal.messages.updateContent, {
    messageId: args.messageId,
    content: args.newContent,
  });

  // Delete only messages AFTER the edited message
  const messagesToDelete = messages.slice(messageIndex + 1);
  const messageIdsToDelete = messagesToDelete
    .filter((msg: Doc<"messages">) => msg.role !== "context")
    .map((msg: Doc<"messages">) => msg._id);

  if (messageIdsToDelete.length > 0) {
    await ctx.runMutation(api.messages.removeMultiple, {
      ids: messageIdsToDelete,
    });
  }

  // Choose model/provider: prefer the original model stored on the edited message
  // so that we preserve image-capable models used for this branch. Fallback to
  // client-provided overrides only when the message did not record a model.
  const preferredModelId = message.model || args.model;
  const preferredProvider = message.provider || args.provider;
  const normalizedProvider = preferredProvider?.toLowerCase();

  if (normalizedProvider === "replicate") {
    const prompt = args.newContent;

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
      "aspectRatio",
      "steps",
      "guidanceScale",
      "seed",
      "negativePrompt",
      "count",
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

  // Get user's effective model using centralized resolution with full capabilities
  const fullModel = await getUserEffectiveModelWithCapabilities(
    ctx,
    preferredModelId,
    preferredProvider
  );

  // Build context messages including the edited message, passing pre-fetched data
  await buildContextMessages(ctx, {
    conversationId: message.conversationId,
    personaId: conversation.personaId,
    modelCapabilities: {
      supportsImages: fullModel.supportsImages ?? false,
      supportsFiles: fullModel.supportsFiles ?? false,
    },
    provider: fullModel.provider,
    modelId: fullModel.modelId,
    prefetchedMessages: messages, // Pass already-fetched messages
    prefetchedModelInfo: { contextLength: fullModel.contextLength },
  });

  // Create new assistant message for streaming
  const assistantMessageId = await ctx.runMutation(api.messages.create, {
    conversationId: message.conversationId,
    role: "assistant",
    content: "",
    model: fullModel.modelId,
    provider: fullModel.provider,
    status: "thinking",
  });

  // Mark conversation as streaming
  await ctx.runMutation(internal.conversations.internalPatch, {
    id: message.conversationId,
    updates: { isStreaming: true },
  });

  return {
    assistantMessageId,
  };
}
