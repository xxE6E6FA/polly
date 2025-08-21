import type { ActionCtx, MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { ConvexError } from "convex/values";
import { log } from "../logger";
import { api, internal } from "../../_generated/api";
import { 
  DEFAULT_TEMPERATURE,
  DEFAULT_MAX_TOKENS,
} from "../../../shared/constants";
import { getAuthUserId } from "@convex-dev/auth/server";
import { getUserEffectiveModelWithCapabilities } from "../model_resolution";
import type { StreamingActionResult, MessageActionArgs } from "./types";
import { 
  buildUserMessageContent,
  createMessage,
  incrementUserMessageStats,
  scheduleTitleGeneration,
  mergeSystemPrompts,
  getPersonaPrompt,
  ensureStreamingCleared,
  checkConversationAccess
} from "./message_handling";
import { buildHierarchicalContextMessages } from "./context_building";
import { getBaselineInstructions } from "../../constants";

// Process attachments for storage
export const processAttachmentsForStorage = async (
  _ctx: ActionCtx, // Reserved for future use
  attachments: Array<{
    storageId?: Id<"_storage">;
    url?: string;
    name: string;
    type: "image" | "pdf" | "text";
    size: number;
    content?: string;
    thumbnail?: string;
  }>
): Promise<
  Array<{
    storageId?: Id<"_storage">;
    url: string;
    name: string;
    type: "image" | "pdf" | "text";
    size: number;
    content?: string;
    thumbnail?: string;
    mimeType?: string;
  }>
> => {
  // For now, just pass through the attachments ensuring url is set
  // In a real implementation, you might want to process or validate them
  return attachments.map(attachment => ({
    ...attachment,
    url: attachment.url || "", // Ensure url is never undefined
  }));
};

export const buildContextMessages = async (
  ctx: ActionCtx,
  conversationId: Id<"conversations">,
  userId: Id<"users">,
  model?: string,
  recentMessageCount: number = 50
): Promise<Array<{ role: "system" | "user" | "assistant"; content: string }>> => {
  try {
    log.info(`[buildContextMessages] Starting context building for conversation ${conversationId}, userId: ${userId}, model: ${model}`);
    
    // Get conversation messages
    const messages = await ctx.runQuery(api.messages.getAllInConversation, {
      conversationId,
    });

    log.info(`[buildContextMessages] Retrieved ${messages?.length || 0} messages from getAllInConversation`);

    if (!messages || messages.length === 0) {
      log.warn(`[buildContextMessages] No messages found for conversation ${conversationId}`);
      return [];
    }

    // Build hierarchical context if needed
    const contextMessages = await buildHierarchicalContextMessages(
      ctx,
      conversationId,
      userId,
      model,
      recentMessageCount
    );

    log.info(`[buildContextMessages] Built ${contextMessages.length} hierarchical context messages`);

    // Get recent messages (those not summarized)
    const recentMessages = messages
      .slice(-recentMessageCount)
      .filter((msg: any) => msg.role !== "system" && msg.role !== "context")
      .map((msg: any) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      }));

    log.info(`[buildContextMessages] Filtered to ${recentMessages.length} recent messages`);

    // Get persona prompt if specified
    const personaPrompt = await getPersonaPrompt(ctx, null);
    
    // Build system messages
    const systemMessages = [];
    
    // Add baseline instructions with persona
    const baselineInstructions = getBaselineInstructions(model || "default");
    const mergedInstructions = mergeSystemPrompts(baselineInstructions, personaPrompt);
    systemMessages.push({
      role: "system" as const,
      content: mergedInstructions,
    });

    log.info(`[buildContextMessages] Built ${systemMessages.length} system messages`);

    // Combine all messages: system + context + recent
    const allMessages = [
      ...systemMessages,
      ...contextMessages,
      ...recentMessages,
    ];

    log.info(`[buildContextMessages] Built context with ${allMessages.length} total messages: ${systemMessages.length} system + ${contextMessages.length} context + ${recentMessages.length} recent`);
    return allMessages;

  } catch (error) {
    log.error(`[buildContextMessages] Error building context messages: ${error}`);
    throw error;
  }
};

// Moved from conversations.ts
export const executeStreamingAction = async (
  ctx: ActionCtx,
  args: {
    conversationId: Id<"conversations">;
    model: any; // Full model object with capabilities
    reasoningMode?: boolean;
    content: string;
    attachments?: Array<{
      storageId?: Id<"_storage">;
      url?: string;
      name: string;
      type: "image" | "pdf" | "text";
      size: number;
      content?: string;
      thumbnail?: string;
    }>;
    personaId?: Id<"personas"> | null;
    webSearchEnabled?: boolean;
    temperature?: number;
    isNewConversation?: boolean;
    sourceConversationId?: Id<"conversations">;
  }
): Promise<StreamingActionResult> => {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError("Not authenticated");
  }

  const { conversationId, model, content, attachments = [], temperature } = args;
  const provider = model.provider;

  // Verify conversation access
  await checkConversationAccess(ctx, conversationId, userId);

  // Process user message content with attachments
  const { content: enhancedContent } = await buildUserMessageContent(
    ctx,
    content,
    attachments.length > 0 ? attachments : undefined
  );

  // Process attachments for storage if needed
  const processedAttachments = attachments.length > 0 
    ? await processAttachmentsForStorage(ctx, attachments)
    : undefined;

  // Create user message
  const userMessageId = await createMessage(ctx, {
    conversationId,
    role: "user",
    content: enhancedContent,
    attachments: processedAttachments,
    metadata: {
      temperature,
    },
  });

  // Create streaming assistant message
  const assistantMessageId = await createMessage(ctx, {
    conversationId,
    role: "assistant",
    content: "", // Empty content for streaming
    model: model.modelId,
    provider: provider as "openai" | "anthropic" | "google" | "groq" | "openrouter" | "replicate" | "elevenlabs",
    metadata: {
      status: "pending",
    },
  });

  // Set conversation as streaming
  await ctx.runMutation(api.conversations.setStreaming, {
    conversationId,
    isStreaming: true,
  });

  // Schedule the streaming response
  await ctx.scheduler.runAfter(0, internal.ai.messages.streamResponse, {
    conversationId,
    messageId: assistantMessageId,
    model: model,
    reasoningConfig: args.reasoningMode ? { enabled: true, effort: "medium" } : undefined,
    temperature: temperature || DEFAULT_TEMPERATURE,
    maxTokens: DEFAULT_MAX_TOKENS,
    useWebSearch: args.webSearchEnabled || false,
  });

  // Increment user stats
  await incrementUserMessageStats(ctx, userId, model.name, provider);

  // Schedule title generation for new conversations
  const messageCount = await ctx.runQuery(api.messages.getMessageCount, { conversationId });
  const isNewConversation = messageCount <= 2; // User message + assistant message
  if (isNewConversation) {
    await scheduleTitleGeneration(ctx, conversationId, 5000);
  }

  return {
    userMessageId,
    assistantMessageId,
  };
};

export const setupAndStartStreaming = async (
  ctx: ActionCtx,
  conversationId: Id<"conversations">,
  messageId: Id<"messages">,
  model: string,
  provider: string,
  userId: Id<"users">,
  _personaId?: Id<"personas"> | null,
  _reasoningMode: boolean = false,
  _webSearchEnabled: boolean = false,
  temperature: number = DEFAULT_TEMPERATURE,
  _maxTokens: number = DEFAULT_MAX_TOKENS
): Promise<void> => {
  try {
    // Get model information for capabilities
    const modelInfo = await getUserEffectiveModelWithCapabilities(ctx, userId, model);
    if (!modelInfo) {
      throw new ConvexError(`Model not found or not accessible: ${model}`);
    }

    // Build context messages for the conversation
    const messages = await buildContextMessages(
      ctx,
      conversationId,
      userId,
      model,
      50 // recent message count
    );

    if (!messages || messages.length === 0) {
      throw new ConvexError("Failed to build context messages");
    }

    log.info(`Starting streaming for model ${model} with ${messages.length} context messages`);

    // Start the actual streaming based on provider
    if (provider === "anthropic") {
      await ctx.scheduler.runAfter(0, internal.ai.messages.streamResponse, {
        conversationId,
        messageId,
        model: modelInfo,
        reasoningConfig: _reasoningMode ? { enabled: true, effort: "medium" } : undefined,
        temperature,
        maxTokens: _maxTokens,
        useWebSearch: _webSearchEnabled,
      });
    } else if (provider === "openai") {
      await ctx.scheduler.runAfter(0, internal.ai.messages.streamResponse, {
        conversationId,
        messageId,
        model: modelInfo,
        reasoningConfig: _reasoningMode ? { enabled: true, effort: "medium" } : undefined,
        temperature,
        maxTokens: _maxTokens,
        useWebSearch: _webSearchEnabled,
      });
    } else if (provider === "google") {
      await ctx.scheduler.runAfter(0, internal.ai.messages.streamResponse, {
        conversationId,
        messageId,
        model: modelInfo,
        reasoningConfig: _reasoningMode ? { enabled: true, effort: "medium" } : undefined,
        temperature,
        maxTokens: _maxTokens,
        useWebSearch: _webSearchEnabled,
      });
    } else {
      throw new ConvexError(`Unsupported provider: ${provider}`);
    }

    log.info(`Streaming scheduled for ${provider} model ${model}`);

  } catch (error) {
    log.error(`Error in setupAndStartStreaming: ${error}`);
    await handleStreamingError(ctx, conversationId, messageId, error);
    throw error;
  }
};

export const handleStreamingError = async (
  ctx: ActionCtx | MutationCtx,
  conversationId: Id<"conversations">,
  messageId: Id<"messages">,
  error: any
): Promise<void> => {
  try {
    // Clear streaming state
    await ensureStreamingCleared(ctx, conversationId);

    // Update the assistant message with error content
    await ctx.runMutation(api.messages.update, {
      id: messageId,
      content: `I apologize, but I encountered an error while processing your request: ${error?.message || "Unknown error"}. Please try again.`,
    });

    log.error(`Streaming error handled for conversation ${conversationId}: ${error}`);
  } catch (handlingError) {
    log.error(`Error while handling streaming error: ${handlingError}`);
  }
};

// Create executeStreamingAction for retry functionality
export const executeStreamingActionForRetry = async (
  ctx: ActionCtx,
  args: {
    conversationId: Id<"conversations">;
    model: string;
    provider: string;
    conversation: any; // Doc<"conversations">
    contextMessages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    useWebSearch: boolean;
    reasoningConfig?: any;
  }
): Promise<StreamingActionResult> => {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError("Not authenticated");
  }

  const { conversationId, model, provider, reasoningConfig } = args;

  // Create streaming assistant message
  const assistantMessageId = await createMessage(ctx, {
    conversationId,
    role: "assistant",
    content: "", // Empty content for streaming
    model,
    provider: provider as "openai" | "anthropic" | "google" | "groq" | "openrouter" | "replicate" | "elevenlabs",
    metadata: {
      status: "pending",
    },
  });

  // Set conversation as streaming
  await ctx.runMutation(api.conversations.setStreaming, {
    conversationId,
    isStreaming: true,
  });

  // Get user's effective model with capabilities
  const fullModel = await getUserEffectiveModelWithCapabilities(
    ctx,
    model,
    provider
  );

  // Schedule the streaming response
  await ctx.scheduler.runAfter(0, internal.ai.messages.streamResponse, {
    conversationId,
    messageId: assistantMessageId,
    model: fullModel, // Pass the full model object
    personaId: args.conversation.personaId,
    reasoningConfig,
    temperature: undefined,
    maxTokens: DEFAULT_MAX_TOKENS,
    topP: undefined,
    frequencyPenalty: undefined,
    presencePenalty: undefined,
    topK: undefined,
    repetitionPenalty: undefined,
    useWebSearch: args.useWebSearch,
  });

  // Increment user stats
  await incrementUserMessageStats(ctx, userId, model, provider);

  return {
    assistantMessageId,
  };
};

export {
  type StreamingActionResult,
  type MessageActionArgs,
};
