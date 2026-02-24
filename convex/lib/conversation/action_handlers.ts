import { getAuthUserId } from "../auth";
import { DEFAULT_BUILTIN_MODEL_ID } from "../../../shared/constants";
import { api, internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { handleMessageDeletion } from "./message_handling";
import {
  executeStreamingActionForRetry,
  incrementUserMessageStats,
  processAttachmentsForStorage,
} from "../conversation_utils";
import { getUserEffectiveModelWithCapabilities } from "../model_resolution";
import { scheduleRunAfter } from "../scheduler";
import {
  getAuthenticatedUserWithDataForAction,
  setConversationStreamingForAction,
  validateFreeModelUsage,
  validateUserMessageLength,
} from "../shared_utils";
import type { Citation } from "../../types";

export async function createUserMessageHandler(
  ctx: ActionCtx,
  args: {
    conversationId: Id<"conversations">;
    content: string;
    model?: string;
    provider?: string;
    personaId?: Id<"personas">;
    attachments?: Array<{
      type: "image" | "pdf" | "text" | "audio" | "video";
      url: string;
      name: string;
      size: number;
      content?: string;
      thumbnail?: string;
      storageId?: Id<"_storage">;
      mimeType?: string;
    }>;
    reasoningConfig?: { enabled: boolean };
    temperature?: number;
  }
): Promise<{
  userMessageId: Id<"messages">;
}> {
  // Enforce max size on user-authored content
  validateUserMessageLength(args.content);
  // Get user's effective model with full capabilities
  const fullModel = await getUserEffectiveModelWithCapabilities(
    ctx,
    args.model,
    args.provider
  );
  // Create user message only
  const userMessageId: Id<"messages"> = await ctx.runMutation(
    api.messages.create,
    {
      conversationId: args.conversationId,
      role: "user",
      content: args.content,
      attachments: args.attachments,
      reasoningConfig: args.reasoningConfig,
      model: fullModel.modelId,
      provider: fullModel.provider,
      metadata:
        args.temperature !== undefined
          ? { temperature: args.temperature }
          : undefined,
    }
  );

  // Check if this is the first user message in the conversation
  // If so, and the conversation has a generic title, schedule title generation
  // This handles image generation conversations which create empty conversations first
  const conversation = await ctx.runQuery(api.conversations.get, {
    id: args.conversationId,
  });

  if (conversation) {
    const messages = await ctx.runQuery(api.messages.getAllInConversation, {
      conversationId: args.conversationId,
    });

    // Check if this is the first user message and the title looks generic
    const userMessages = messages.filter(
      (m: Doc<"messages">) => m.role === "user"
    );
    const hasGenericTitle =
      conversation.title === "Image Generation" ||
      conversation.title === "New Conversation" ||
      conversation.title === "New conversation";

    if (
      userMessages.length === 1 &&
      hasGenericTitle &&
      args.content.trim().length > 0
    ) {
      // Schedule title generation based on the user message
      await scheduleRunAfter(
        ctx,
        100,
        api.titleGeneration.generateTitleBackground,
        {
          conversationId: args.conversationId,
          message: args.content,
        }
      );
    }
  }

  return { userMessageId };
}

export async function sendMessageHandler(
  ctx: ActionCtx,
  args: {
    conversationId: Id<"conversations">;
    content: string;
    model?: string;
    provider?: string;
    personaId?: Id<"personas">;
    attachments?: Array<{
      type: "image" | "pdf" | "text" | "audio" | "video";
      url: string;
      name: string;
      size: number;
      content?: string;
      thumbnail?: string;
      storageId?: Id<"_storage">;
      mimeType?: string;
    }>;
    reasoningConfig?: { enabled: boolean };
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    topK?: number;
    repetitionPenalty?: number;
  }
): Promise<{
  userMessageId: Id<"messages">;
  assistantMessageId: Id<"messages">;
}> {
  // Validate user message size before any writes
  validateUserMessageLength(args.content);
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("User not authenticated");
  }
  const [conversation, fullModel] = await Promise.all([
    ctx.runQuery(api.conversations.get, { id: args.conversationId }),
    getUserEffectiveModelWithCapabilities(ctx, args.model, args.provider),
  ]);

  if (!conversation) {
    throw new Error("Conversation not found or access denied");
  }

  // Use provided personaId, or fall back to conversation's existing personaId
  const effectivePersonaId =
    args.personaId !== undefined ? args.personaId : conversation?.personaId;

  // Store attachments as-is during message creation
  // PDF text extraction will happen during assistant response with progress indicators
  const processedAttachments = args.attachments;

  // Create user message first to maintain proper order
  const userMessageId = await ctx.runMutation(api.messages.create, {
    conversationId: args.conversationId,
    role: "user",
    content: args.content,
    attachments: processedAttachments,
    reasoningConfig: args.reasoningConfig,
    model: fullModel.modelId,
    provider: fullModel.provider,
    metadata:
      args.temperature !== undefined
        ? { temperature: args.temperature }
        : undefined,
  });

  // Create file entries for attachments if any
  if (processedAttachments && processedAttachments.length > 0) {
    await ctx.runMutation(internal.fileStorage.createUserFileEntries, {
      userId,
      messageId: userMessageId,
      conversationId: args.conversationId,
      attachments: processedAttachments,
    });
  }

  // Create assistant message + mark streaming in parallel
  const [assistantMessageId] = await Promise.all([
    ctx.runMutation(api.messages.create, {
      conversationId: args.conversationId,
      role: "assistant",
      content: "",
      status: "thinking",
      model: fullModel.modelId,
      provider: fullModel.provider,
    }),
    ctx.runMutation(internal.conversations.internalPatch, {
      id: args.conversationId,
      updates: { isStreaming: true },
      setUpdatedAt: true,
    }),
  ]);

  const supportsTools = fullModel.supportsTools ?? false;

  // Schedule streaming — context building, image models, and API key all happen inside streamMessage
  await ctx.scheduler.runAfter(0, internal.streaming_actions.streamMessage, {
    messageId: assistantMessageId,
    conversationId: args.conversationId,
    model: fullModel.modelId,
    provider: fullModel.provider,
    personaId: effectivePersonaId,
    reasoningConfig: args.reasoningConfig,
    supportsTools,
    supportsImages: fullModel.supportsImages ?? false,
    supportsFiles: fullModel.supportsFiles ?? false,
    supportsReasoning: fullModel.supportsReasoning ?? false,
    supportsTemperature: fullModel.supportsTemperature ?? undefined,
    contextLength: fullModel.contextLength,
    userId,
  });

  // Schedule memory extraction (non-blocking background job)
  try {
    const settings = await ctx.runQuery(
      internal.memory.getUserMemorySettings,
      { userId },
    );
    if (settings?.memoryEnabled) {
      await ctx.scheduler.runAfter(
        0,
        internal.memory_actions.extractMemories,
        { conversationId: args.conversationId, userId, assistantMessageId },
      );
    }
  } catch (error) {
    console.warn("[sendMessageHandler] Memory scheduling failed:", error);
  }

  return { userMessageId, assistantMessageId };
}

export async function savePrivateConversationHandler(
  ctx: ActionCtx,
  args: {
    messages: Array<{
      role: string;
      content: string;
      createdAt: number;
      model?: string;
      provider?: string;
      reasoning?: string;
      attachments?: Array<{
        type: "image" | "pdf" | "text" | "audio" | "video";
        url: string;
        name: string;
        size: number;
        content?: string;
        thumbnail?: string;
        storageId?: Id<"_storage">;
        mimeType?: string;
      }>;
      citations?: Citation[];
      metadata?: {
        tokenCount?: number;
        finishReason?: string;
        duration?: number;
        stopped?: boolean;
      };
    }>;
    title?: string;
    personaId?: Id<"personas">;
  }
): Promise<Id<"conversations">> {
  // Get authenticated user - this is the correct pattern for actions
  const { user } = await getAuthenticatedUserWithDataForAction(ctx);

  // Block anonymous users from saving private conversations
  if (user.isAnonymous) {
    throw new Error("Anonymous users cannot save private conversations.");
  }
  // Generate a title from the first user message or use provided title
  const conversationTitle = args.title || "New conversation";

  // Create the conversation (without any initial messages since we'll add them manually)
  const conversationId = await ctx.runMutation(
    internal.conversations.createEmptyInternal,
    {
      title: conversationTitle,
      userId: user._id,
      personaId: args.personaId,
    }
  );

  // Extract model/provider from the first user message for stats tracking
  // Only increment stats once for the entire conversation, not per message
  const firstUserMessage = args.messages.find(msg => msg.role === "user");
  if (firstUserMessage?.model && firstUserMessage?.provider) {
    try {
      // Increment user message stats
      await incrementUserMessageStats(
        ctx,
        user._id,
        firstUserMessage.model,
        firstUserMessage.provider
      );
    } catch (error) {
      // If the model doesn't exist in the user's database, skip stats increment
      // This can happen when importing private conversations with models the user no longer has
      console.warn(
        `Skipping stats increment for model ${firstUserMessage.model}/${firstUserMessage.provider}: ${error}`
      );
    }
  }

  // Process and save all messages to the conversation
  for (const message of args.messages as Array<{
    role: string;
    content: string;
    createdAt: number;
    model?: string;
    provider?: string;
    reasoning?: string;
    attachments?: Array<{
      type: "image" | "pdf" | "text" | "audio" | "video";
      url: string;
      name: string;
      size: number;
      content?: string;
      thumbnail?: string;
      storageId?: Id<"_storage">;
      mimeType?: string;
    }>;
    citations?: Citation[];
    metadata?: {
      tokenCount?: number;
      finishReason?: string;
      duration?: number;
      stopped?: boolean;
    };
  }>) {
    // Skip empty messages and system messages (these are not user-facing)
    if (
      !message.content ||
      message.content.trim() === "" ||
      message.role === "system" ||
      message.role === "context"
    ) {
      continue;
    }

    // Process attachments - upload base64 content to Convex storage
    let processedAttachments = message.attachments;
    if (message.attachments && message.attachments.length > 0) {
      processedAttachments = await processAttachmentsForStorage(
        ctx,
        message.attachments
      );
    }

    await ctx.runMutation(api.messages.create, {
      conversationId,
      role: message.role,
      content: message.content,
      model: message.model,
      provider: message.provider,
      reasoning: message.reasoning,
      attachments: processedAttachments,
      metadata: message.metadata,
      isMainBranch: true,
    });

    // If the message has citations, we need to update it after creation
    // since citations aren't in the create args
    if (message.citations && message.citations.length > 0) {
      const createdMessages = await ctx.runQuery(
        api.messages.getAllInConversation,
        { conversationId }
      );
      const lastMessage = createdMessages[createdMessages.length - 1];
      if (lastMessage) {
        await ctx.runMutation(internal.messages.internalUpdate, {
          id: lastMessage._id,
          citations: message.citations,
        });
      }
    }
  }

  // Mark conversation as not streaming since all messages are already complete
  await ctx.runMutation(internal.conversations.internalPatch, {
    id: conversationId,
    updates: { isStreaming: false },
    setUpdatedAt: true,
  });

  // Schedule title generation if not provided
  if (!args.title) {
    const firstMessage = args.messages?.[0];
    if (firstMessage && typeof firstMessage.content === "string") {
      await scheduleRunAfter(ctx, 100, api.titleGeneration.generateTitle, {
        conversationId,
        message: firstMessage.content,
      });
    }
  }

  return conversationId;
}

export async function startConversationHandler(
  ctx: ActionCtx,
  args: {
    clientId: string;
    content: string;
    personaId?: Id<"personas">;
    profileId?: Id<"profiles">;
    attachments?: Array<{
      type: "image" | "pdf" | "text" | "audio" | "video";
      url: string;
      name: string;
      size: number;
      content?: string;
      thumbnail?: string;
      storageId?: Id<"_storage">;
      mimeType?: string;
    }>;
    model?: string;
    provider?: string;
    reasoningConfig?: { enabled: boolean };
    temperature?: number;
  }
): Promise<{
  conversationId: Id<"conversations">;
  userMessageId: Id<"messages">;
  assistantMessageId: Id<"messages">;
}> {
  // Validate content
  validateUserMessageLength(args.content);

  // Get authenticated user
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Not authenticated");
  }

  // 1. Create conversation with clientId using existing internal mutation
  const conversationId = await ctx.runMutation(
    internal.conversations.createEmptyInternal,
    {
      userId,
      personaId: args.personaId,
      profileId: args.profileId,
      clientId: args.clientId,
    }
  );

  // 2. Get model info for the message
  const fullModel = await getUserEffectiveModelWithCapabilities(
    ctx,
    args.model,
    args.provider
  );

  // 3. Create user message
  const userMessageId = await ctx.runMutation(api.messages.create, {
    conversationId,
    role: "user",
    content: args.content,
    attachments: args.attachments,
    reasoningConfig: args.reasoningConfig,
    model: fullModel.modelId,
    provider: fullModel.provider,
    metadata:
      args.temperature !== undefined
        ? { temperature: args.temperature }
        : undefined,
  });

  // Create file entries for attachments if any
  if (args.attachments && args.attachments.length > 0) {
    await ctx.runMutation(internal.fileStorage.createUserFileEntries, {
      userId,
      messageId: userMessageId,
      conversationId,
      attachments: args.attachments,
    });
  }

  // 4. Create assistant placeholder and mark as streaming
  const [assistantMessageId] = await Promise.all([
    ctx.runMutation(api.messages.create, {
      conversationId,
      role: "assistant",
      content: "",
      status: "thinking",
      model: fullModel.modelId,
      provider: fullModel.provider,
    }),
    ctx.runMutation(internal.conversations.internalPatch, {
      id: conversationId,
      updates: { isStreaming: true },
      setUpdatedAt: true,
    }),
  ]);

  // 5. Schedule streaming — context building, image models, memory all happen inside streamMessage
  await ctx.scheduler.runAfter(0, internal.streaming_actions.streamMessage, {
    messageId: assistantMessageId,
    conversationId,
    model: fullModel.modelId,
    provider: fullModel.provider,
    personaId: args.personaId,
    reasoningConfig: args.reasoningConfig,
    supportsTools: fullModel.supportsTools ?? false,
    supportsImages: fullModel.supportsImages ?? false,
    supportsFiles: fullModel.supportsFiles ?? false,
    supportsReasoning: fullModel.supportsReasoning ?? false,
    supportsTemperature: fullModel.supportsTemperature ?? undefined,
    contextLength: fullModel.contextLength,
    userId,
  });

  // Schedule memory extraction (non-blocking background job)
  try {
    const memSettings = await ctx.runQuery(
      internal.memory.getUserMemorySettings,
      { userId },
    );
    if (memSettings?.memoryEnabled) {
      await ctx.scheduler.runAfter(
        0,
        internal.memory_actions.extractMemories,
        { conversationId, userId, assistantMessageId },
      );
    }
  } catch (error) {
    console.warn("[startConversationHandler] Memory scheduling failed:", error);
  }

  // 6. Schedule title generation
  await scheduleRunAfter(ctx, 100, api.titleGeneration.generateTitle, {
    conversationId,
    message: args.content,
  });

  return {
    conversationId,
    userMessageId,
    assistantMessageId,
  };
}

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

  // Create assistant message + mark streaming in parallel
  const [assistantMessageId] = await Promise.all([
    ctx.runMutation(api.messages.create, {
      conversationId: message.conversationId,
      role: "assistant",
      content: "",
      model: fullModel.modelId,
      provider: fullModel.provider,
      status: "thinking",
    }),
    ctx.runMutation(internal.conversations.internalPatch, {
      id: message.conversationId,
      updates: { isStreaming: true },
    }),
  ]);

  // Schedule streaming — context building + image models happen inside streamMessage
  await ctx.scheduler.runAfter(0, internal.streaming_actions.streamMessage, {
    messageId: assistantMessageId,
    conversationId: message.conversationId,
    model: fullModel.modelId,
    provider: fullModel.provider,
    personaId: conversation.personaId,
    reasoningConfig: args.reasoningConfig,
    supportsTools: fullModel.supportsTools ?? false,
    supportsImages: fullModel.supportsImages ?? false,
    supportsFiles: fullModel.supportsFiles ?? false,
    supportsReasoning: fullModel.supportsReasoning ?? false,
    supportsTemperature: fullModel.supportsTemperature ?? undefined,
    contextLength: fullModel.contextLength,
    userId: user._id,
  });

  return {
    assistantMessageId,
  };
}

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
    const fullModel = await getUserEffectiveModelWithCapabilities(
      ctx,
      requestedModel,
      requestedProvider
    );
    // Assistant retry: delete messages AFTER this assistant message (preserve context),
    // then clear this assistant message and stream into the SAME messageId

    // Clear stop request FIRST to prevent race conditions with previous streaming actions
    // Any previous action checking stopRequested in its finally block will see it's cleared
    await ctx.runMutation(internal.conversations.internalPatch, {
      id: args.conversationId,
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
    // Also update model/provider so UI reflects the new selection immediately
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
        | "openai"
        | "anthropic"
        | "google"
        | "groq"
        | "openrouter"
        | "replicate"
        | "elevenlabs",
      clearMetadataFields: ["finishReason", "stopped"],
    });

    // Set status to thinking
    await ctx.runMutation(internal.messages.updateMessageStatus, {
      messageId: targetMessage._id,
      status: "thinking",
    });

    // Mark conversation as streaming and clear any previous stop request
    await ctx.runMutation(internal.conversations.internalPatch, {
      id: args.conversationId,
      updates: { isStreaming: true },
      clearFields: ["stopRequested"],
    });

    // Build context up to the previous user message
    const previousUserMessageIndex = messageIndex - 1;
    const previousUserMessage = messages[previousUserMessageIndex];
    if (!previousUserMessage || previousUserMessage.role !== "user") {
      throw new Error("Cannot find previous user message to retry from");
    }

    // Schedule streaming — context building + image models happen inside streamMessage
    await ctx.scheduler.runAfter(
      0,
      internal.streaming_actions.streamMessage,
      {
        messageId: targetMessage._id,
        conversationId: args.conversationId,
        model: fullModel.modelId,
        provider: fullModel.provider,
        personaId: effectivePersonaId,
        reasoningConfig: args.reasoningConfig,
        supportsTools: fullModel.supportsTools ?? false,
        supportsImages: fullModel.supportsImages ?? false,
        supportsFiles: fullModel.supportsFiles ?? false,
        supportsReasoning: fullModel.supportsReasoning ?? false,
        supportsTemperature: fullModel.supportsTemperature ?? undefined,
        contextLength: fullModel.contextLength,
        contextEndIndex: previousUserMessageIndex,
        userId: user._id,
      }
    );

    return { assistantMessageId: targetMessage._id };
  }

  if (retryType === "user" && normalizedProvider === "replicate") {
    const prompt = targetMessage.content || "";

    const subsequentAssistant = messages
      .slice(messageIndex + 1)
      .find(msg => msg.role === "assistant" && msg.imageGeneration);

    const previousMetadata = subsequentAssistant?.imageGeneration?.metadata;
    const candidateModel =
      requestedModel || (previousMetadata?.model as string | undefined);

    if (!candidateModel) {
      throw new Error(
        "Unable to determine Replicate model for retry. Please choose a model and try again."
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

    // Delete messages after the user message (preserve the user message and context)
    await handleMessageDeletion(ctx, messages, messageIndex, "user");

    if (
      targetMessage.model !== candidateModel ||
      targetMessage.provider?.toLowerCase() !== "replicate"
    ) {
      await ctx.runMutation(internal.messages.internalUpdate, {
        id: targetMessage._id,
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
      conversationId: args.conversationId,
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
      id: args.conversationId,
      updates: { isStreaming: true },
      setUpdatedAt: true,
    });

    await ctx.runAction(api.ai.replicate.generateImage, {
      conversationId: args.conversationId,
      messageId: assistantMessageId,
      prompt,
      model: candidateModel,
      params:
        sanitizedParams && Object.keys(sanitizedParams).length > 0
          ? sanitizedParams
          : undefined,
    });

    return {
      assistantMessageId,
    };
  }

  // User retry: keep the user message, delete messages after it, and create a fresh assistant message
  const fullModel = await getUserEffectiveModelWithCapabilities(
    ctx,
    requestedModel,
    requestedProvider
  );

  // Delete messages after the user message (preserve the user message and context)
  await handleMessageDeletion(ctx, messages, messageIndex, "user");

  // Execute streaming — context building + image models happen inside streamMessage
  const result = await executeStreamingActionForRetry(ctx, {
    conversationId: args.conversationId,
    model: fullModel.modelId,
    provider: fullModel.provider,
    conversation: { ...conversation, personaId: effectivePersonaId },
    reasoningConfig: args.reasoningConfig,
    supportsTools: fullModel.supportsTools ?? false,
    supportsImages: fullModel.supportsImages ?? false,
    supportsFiles: fullModel.supportsFiles ?? false,
    supportsReasoning: fullModel.supportsReasoning ?? false,
    supportsTemperature: fullModel.supportsTemperature ?? undefined,
    contextLength: fullModel.contextLength,
    contextEndIndex: messageIndex,
    userId: user._id,
  });

  return {
    assistantMessageId: result.assistantMessageId,
  };
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

  // Store the original web search setting before deleting messages
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

  // Get user's effective model using centralized resolution with full capabilities
  const fullModel = await getUserEffectiveModelWithCapabilities(
    ctx,
    preferredModelId,
    preferredProvider
  );

  // Execute streaming — context building + image models happen inside streamMessage
  const result = await executeStreamingActionForRetry(ctx, {
    conversationId: args.conversationId,
    model: fullModel.modelId,
    provider: fullModel.provider,
    conversation,
    reasoningConfig: args.reasoningConfig,
    supportsTools: fullModel.supportsTools ?? false,
    supportsImages: fullModel.supportsImages ?? false,
    supportsFiles: fullModel.supportsFiles ?? false,
    supportsReasoning: fullModel.supportsReasoning ?? false,
    supportsTemperature: fullModel.supportsTemperature ?? undefined,
    contextLength: fullModel.contextLength,
    userId: user._id,
  });

  return {
    assistantMessageId: result.assistantMessageId,
  };
}

export async function createBranchingConversationHandler(
  ctx: ActionCtx,
  args: {
    userId?: Id<"users">;
    firstMessage: string;
    sourceConversationId?: Id<"conversations">;
    personaId?: Id<"personas">;
    personaPrompt?: string;
    attachments?: Array<{
      type: "image" | "pdf" | "text" | "audio" | "video";
      url: string;
      name: string;
      size: number;
      content?: string;
      thumbnail?: string;
      storageId?: Id<"_storage">;
      mimeType?: string;
    }>;
    useWebSearch?: boolean;
    generateTitle?: boolean;
    reasoningConfig?: { enabled: boolean };
    contextSummary?: string;
  }
): Promise<{
  conversationId: Id<"conversations">;
  userId: Id<"users">;
  isNewUser: boolean;
  assistantMessageId?: Id<"messages">;
}> {
  // Get authenticated user ID first
  let authenticatedUserId: Id<"users"> | null = null;
  try {
    const { userId } = await getAuthenticatedUserWithDataForAction(ctx);
    authenticatedUserId = userId;
  } catch (error) {
    console.warn("Failed to get authenticated user:", error);
  }

  // Create user if needed or use provided user ID
  let actualUserId: Id<"users">;
  let isNewUser = false;

  if (args.userId) {
    // Use provided user ID (for background jobs or specific user creation)
    actualUserId = args.userId;
  } else if (authenticatedUserId) {
    // Use authenticated user ID
    actualUserId = authenticatedUserId;
  } else {
    throw new Error("Not authenticated");
  }

  const [selectedModel, user] = await Promise.all([
    ctx.runQuery(api.userModels.getUserSelectedModel),
    ctx.runQuery(api.users.getById, { id: actualUserId }),
  ]);

  if (!selectedModel) {
    throw new Error("No model selected. Please select a model in Settings.");
  }
  if (!user) {
    throw new Error("User not found");
  }

  // Check if it's a built-in free model and enforce limits
  // If model has 'free' field, it's from builtInModels table and is a built-in model
  const isBuiltInModelResult = selectedModel.free === true;

  if (isBuiltInModelResult && !user.hasUnlimitedCalls) {
    validateFreeModelUsage(user);
  }

  // Fetch persona prompt if personaId is provided but personaPrompt is not
  let finalPersonaPrompt = args.personaPrompt;
  if (args.personaId && !finalPersonaPrompt) {
    const persona = await ctx.runQuery(api.personas.get, {
      id: args.personaId,
    });
    finalPersonaPrompt = persona?.prompt ?? undefined;
  }

  // Provider is already the actual provider - no mapping needed
  const actualProvider = selectedModel.provider as
    | "openai"
    | "anthropic"
    | "google"
    | "openrouter";

  // Create conversation using internal mutation
  const createResult = await ctx.runMutation(
    internal.conversations.createWithUserId,
    {
      title: "New conversation",
      userId: actualUserId,
      personaId: args.personaId,
      sourceConversationId: args.sourceConversationId,
      firstMessage: args.firstMessage,
      attachments: args.attachments,
      useWebSearch: args.useWebSearch,
      model: selectedModel.modelId,
      provider: actualProvider,
      reasoningConfig: args.reasoningConfig,
    }
  );

  // Note: createWithUserId already increments user stats; avoid double increment here

  // Create context message FIRST if contextSummary is provided
  // This must happen before streaming so the AI can see the context
  if (args.sourceConversationId && args.contextSummary) {
    await ctx.runMutation(api.messages.create, {
      conversationId: createResult.conversationId,
      role: "context",
      content: `Prior context: ${args.contextSummary}`,
      sourceConversationId: args.sourceConversationId,
      isMainBranch: true,
    });
  }

  // **CRITICAL**: Trigger streaming for the assistant response!
  // This happens AFTER context is added so AI can see the full conversation
  if (args.firstMessage && args.firstMessage.trim().length > 0) {
    const [_fullModel] = await Promise.all([
      getUserEffectiveModelWithCapabilities(
        ctx,
        selectedModel.modelId,
        actualProvider
      ),

      // Mark conversation as streaming
      setConversationStreamingForAction(
        ctx,
        createResult.conversationId,
        true
      ),
    ]);
  }

  return {
    conversationId: createResult.conversationId,
    userId: actualUserId,
    isNewUser,
    // Expose assistantMessageId so the client can kick off HTTP streaming
    assistantMessageId: createResult.assistantMessageId,
  };
}

export async function createConversationActionHandler(
  ctx: ActionCtx,
  args: {
    title?: string;
    personaId?: Id<"personas">;
    profileId?: Id<"profiles">;
    model?: string;
    provider?: string;
    firstMessage?: string;
    attachments?: Array<{
      type: "image" | "pdf" | "text" | "audio" | "video";
      url: string;
      name: string;
      size: number;
      content?: string;
      thumbnail?: string;
      storageId?: Id<"_storage">;
      mimeType?: string;
    }>;
    useWebSearch?: boolean;
    reasoningConfig?: { enabled: boolean };
    temperature?: number;
  }
): Promise<
  | {
      conversationId: Id<"conversations">;
      userMessageId: Id<"messages">;
      assistantMessageId: Id<"messages">;
    }
  | { conversationId: Id<"conversations"> }
> {
  // Get current authenticated user
  const user = await ctx.runQuery(api.users.current);

  if (!user) {
    throw new Error("Not authenticated");
  }

  // If there's a first message, create conversation with it
  if (args.firstMessage) {
    // Resolve the model capabilities to decide on PDF processing
    await getUserEffectiveModelWithCapabilities(
      ctx,
      args.model,
      args.provider
    );

    // Store attachments as-is during conversation creation
    // PDF text extraction will happen during assistant response with progress indicators
    const processedAttachments = args.attachments;

    const result: {
      conversationId: Id<"conversations">;
      userMessageId: Id<"messages">;
      assistantMessageId: Id<"messages">;
    } = await ctx.runMutation(api.conversations.createConversation, {
      title: args.title,
      personaId: args.personaId,
      profileId: args.profileId,
      firstMessage: args.firstMessage,
      model: args.model || DEFAULT_BUILTIN_MODEL_ID,
      provider:
        (args.provider as
          | "openai"
          | "anthropic"
          | "google"
          | "openrouter"
          | undefined) || "google",
      attachments: processedAttachments,
      reasoningConfig: args.reasoningConfig,
      temperature: args.temperature,
    });

    // Kick off title generation immediately (action -> action), so UI updates fast
    try {
      await ctx.runAction(api.titleGeneration.generateTitleBackground, {
        conversationId: result.conversationId,
        message: args.firstMessage,
      });
    } catch {
      // Best-effort; server already scheduled a background job
    }

    return {
      conversationId: result.conversationId,
      userMessageId: result.userMessageId,
      assistantMessageId: result.assistantMessageId,
    };
  }

  // Create empty conversation - use internal mutation to create just the conversation
  const conversationId: Id<"conversations"> = await ctx.runMutation(
    internal.conversations.createEmptyInternal,
    {
      title: args.title || "New Conversation",
      userId: user._id,
      personaId: args.personaId,
      profileId: args.profileId,
    }
  );

  return { conversationId };
}
