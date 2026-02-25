import { getAuthUserId } from "../auth";
import { DEFAULT_BUILTIN_MODEL_ID } from "../../../shared/constants";
import { api, internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import {
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
  validateUserMessageLength(args.content);
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("User not authenticated");
  }

  // Single mutation: creates messages, sets streaming, schedules streamMessage
  const result = await ctx.runMutation(
    internal.conversations.prepareSendMessage,
    {
      userId,
      conversationId: args.conversationId,
      content: args.content,
      model: args.model,
      provider: args.provider,
      personaId: args.personaId,
      attachments: args.attachments,
      reasoningConfig: args.reasoningConfig,
      temperature: args.temperature,
    },
  );

  // Schedule memory extraction (non-blocking, needs action context for scheduler)
  try {
    const settings = await ctx.runQuery(
      internal.memory.getUserMemorySettings,
      { userId },
    );
    if (settings?.memoryEnabled) {
      await ctx.scheduler.runAfter(
        0,
        internal.memory_actions.extractMemories,
        {
          conversationId: args.conversationId,
          userId,
          assistantMessageId: result.assistantMessageId,
        },
      );
    }
  } catch (error) {
    console.warn("[sendMessageHandler] Memory scheduling failed:", error);
  }

  return result;
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
  validateUserMessageLength(args.content);
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Not authenticated");
  }

  // Single mutation: creates conversation + messages, schedules streaming + title gen
  const result = await ctx.runMutation(
    internal.conversations.prepareStartConversation,
    {
      userId,
      clientId: args.clientId,
      content: args.content,
      personaId: args.personaId,
      profileId: args.profileId,
      attachments: args.attachments,
      model: args.model,
      provider: args.provider,
      reasoningConfig: args.reasoningConfig,
      temperature: args.temperature,
    },
  );

  // Schedule memory extraction (non-blocking, needs action context for scheduler)
  try {
    const memSettings = await ctx.runQuery(
      internal.memory.getUserMemorySettings,
      { userId },
    );
    if (memSettings?.memoryEnabled) {
      await ctx.scheduler.runAfter(
        0,
        internal.memory_actions.extractMemories,
        {
          conversationId: result.conversationId,
          userId,
          assistantMessageId: result.assistantMessageId,
        },
      );
    }
  } catch (error) {
    console.warn("[startConversationHandler] Memory scheduling failed:", error);
  }

  return result;
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
  const message = await ctx.runQuery(api.messages.getById, {
    id: args.messageId,
  });
  if (!message) {
    throw new Error("Message not found");
  }
  if (message.role !== "user") {
    throw new Error("Can only edit user messages");
  }

  const { user } = await getAuthenticatedUserWithDataForAction(ctx);

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

  // Get all messages to compute IDs to delete and check for Replicate branch
  const messages = await ctx.runQuery(api.messages.getAllInConversation, {
    conversationId: message.conversationId,
  });

  const messageIndex = messages.findIndex(
    (msg: Doc<"messages">) => msg._id === args.messageId
  );
  if (messageIndex === -1) {
    throw new Error("Message not found");
  }

  const messagesToDelete = messages.slice(messageIndex + 1);
  const messageIdsToDelete = messagesToDelete
    .filter((msg: Doc<"messages">) => msg.role !== "context")
    .map((msg: Doc<"messages">) => msg._id);

  // Prefer the original model stored on the edited message
  const preferredModelId = message.model || args.model;
  const preferredProvider = message.provider || args.provider;
  const normalizedProvider = preferredProvider?.toLowerCase();

  // Replicate (image gen) branch — fundamentally different flow, no streamMessage
  if (normalizedProvider === "replicate") {
    // Update the user message content first
    await ctx.runMutation(internal.messages.updateContent, {
      messageId: args.messageId,
      content: args.newContent,
    });

    // Delete subsequent messages
    if (messageIdsToDelete.length > 0) {
      await ctx.runMutation(api.messages.removeMultiple, {
        ids: messageIdsToDelete,
      });
    }

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

  // LLM path: single mutation handles content update, deletion, assistant creation,
  // streaming state, and schedules streamMessage
  const { assistantMessageId } = await ctx.runMutation(
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

  return { assistantMessageId };
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
