import { api, internal } from "../_generated/api";
import { type Doc, type Id } from "../_generated/dataModel";
import {
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";

import { ConvexError } from "convex/values";
import {
  DEFAULT_TEMPERATURE,
  DEFAULT_MAX_TOKENS,
  WEB_SEARCH_MAX_RESULTS,
} from "@shared/constants";
import { getAuthUserId } from "@convex-dev/auth/server";
import { getBaselineInstructions, DEFAULT_POLLY_PERSONA } from "../constants";

import { CreateMessageArgs, CreateConversationArgs } from "./schemas";
import { getUserEffectiveModelWithCapabilities } from "./model_resolution";

export type StreamingActionResult = {
  userMessageId?: Id<"messages">;
  assistantMessageId: Id<"messages">;
};

export type MessageActionArgs = {
  conversationId: Id<"conversations">;
  model: string;
  provider: string;
};

export type ConversationDoc = {
  _id: Id<"conversations">;
  _creationTime: number;
  userId: Id<"users">;
  title: string;
  personaId?: Id<"personas">;
  sourceConversationId?: Id<"conversations">;
  isStreaming?: boolean;
  isPinned?: boolean;
  isArchived?: boolean;
  createdAt: number;
  updatedAt: number;
};

export type MessageDoc = {
  _id: Id<"messages">;
  _creationTime: number;
  conversationId: Id<"conversations">;
  role: "user" | "assistant" | "system" | "context";
  content: string;
  model?: string;
  provider?: string;
  attachments?: Array<{
    type: "image" | "pdf" | "text";
    url: string;
    name: string;
    size: number;
    content?: string;
    thumbnail?: string;
    storageId?: Id<"_storage">;
  }>;
  useWebSearch?: boolean;
  isMainBranch: boolean;
  createdAt: number;
  metadata?: {
    tokenCount?: number;
    reasoningTokenCount?: number;
    finishReason?: string;
    duration?: number;
    stopped?: boolean;
  };
  reasoning?: string;
  citations?: Array<{
    id: string;
    title: string;
    url: string;
    score?: number;
    publishedDate?: string;
    author?: string;
    text?: string;
  }>;
};

// Helper to find streaming assistant message
export const findStreamingMessage = (
  messages: Array<MessageDoc>
): MessageDoc | undefined => {
  return messages
    .filter((msg) => msg.role === "assistant")
    .reverse() // Start from the most recent
    .find((msg) => !msg.metadata?.finishReason); // No finish reason means it's still streaming
};

// Helper to ensure conversation streaming state is cleared
export const ensureStreamingCleared = async (
  ctx: ActionCtx,
  conversationId: Id<"conversations">
): Promise<void> => {
  try {
    await ctx.runMutation(internal.conversations.internalPatch, {
      id: conversationId,
      updates: { isStreaming: false },
      setUpdatedAt: true,
    });
  } catch (error) {
    // Log but don't throw - this is a cleanup operation
    console.error(
      `Failed to clear streaming state for conversation ${conversationId}:`,
      error
    );
  }
};

// Common helper for message deletion operations
export const deleteMessagesAfterIndex = async (
  ctx: ActionCtx,
  messages: Array<MessageDoc>,
  afterIndex: number
): Promise<void> => {
  const messagesToDelete = messages.slice(afterIndex + 1);
  for (const msg of messagesToDelete) {
    await ctx.runMutation(api.messages.remove, { id: msg._id });
  }
};

// Helper function to resolve attachment URLs from storage IDs
export const resolveAttachmentUrls = async (
  ctx: ActionCtx,
  attachments: Array<{
    type: "image" | "pdf" | "text";
    url: string;
    name: string;
    size: number;
    content?: string;
    thumbnail?: string;
    storageId?: Id<"_storage">;
  }>
) => {
  return await Promise.all(
    attachments.map(async (attachment) => {
      if (attachment.storageId) {
        const url = await ctx.storage.getUrl(attachment.storageId);
        return {
          ...attachment,
          url: url || attachment.url, // Fallback to original URL if getUrl fails
        };
      }
      return attachment;
    })
  );
};

// Helper function to build user message content with attachments
export const buildUserMessageContent = async (
  ctx: ActionCtx,
  content: string,
  attachments?: Array<{
    type: "image" | "pdf" | "text";
    url: string;
    name: string;
    size: number;
    content?: string;
    thumbnail?: string;
    storageId?: Id<"_storage">;
  }>
): Promise<
  | string
  | Array<{
      type: "text" | "image_url" | "file";
      text?: string;
      image_url?: { url: string };
      file?: { filename: string; file_data: string };
      attachment?: {
        storageId: Id<"_storage">;
        type: string;
        name: string;
      };
    }>
> => {
  if (!attachments || attachments.length === 0) {
    return content;
  }

  const contentParts: Array<{
    type: "text" | "image_url" | "file";
    text?: string;
    image_url?: { url: string };
    file?: { filename: string; file_data: string };
    attachment?: {
      storageId: Id<"_storage">;
      type: string;
      name: string;
    };
  }> = [];

  // Add text content if it exists, otherwise add a placeholder
  if (content && content.trim().length > 0) {
    contentParts.push({ type: "text", text: content });
  } else {
    // If no text content but we have attachments, add a minimal placeholder
    contentParts.push({
      type: "text",
      text: "Please analyze the attached files.",
    });
  }

  for (const attachment of attachments) {
    if (attachment.type === "image") {
      // For images with storageId, we need to get the URL for AI processing
      let imageUrl = attachment.url;
      if (attachment.storageId && !attachment.url) {
        imageUrl = (await ctx.storage.getUrl(attachment.storageId)) || "";
      }

      contentParts.push({
        type: "image_url",
        image_url: { url: imageUrl },
        // Include attachment metadata for Convex storage optimization
        attachment: attachment.storageId
          ? {
              storageId: attachment.storageId,
              type: attachment.type,
              name: attachment.name,
            }
          : undefined,
      });
    } else if (attachment.type === "text" || attachment.type === "pdf") {
      contentParts.push({
        type: "file",
        file: {
          filename: attachment.name,
          file_data: attachment.content || "",
        },
        // Include attachment metadata for Convex storage optimization
        attachment: attachment.storageId
          ? {
              storageId: attachment.storageId,
              type: attachment.type,
              name: attachment.name,
            }
          : undefined,
      });
    }
  }

  return contentParts;
};

// Helper to get a default system prompt based on conversation messages


// DRY Helper: Process attachments for storage


// DRY Helper: Fetch persona prompt if needed
export async function getPersonaPrompt(
  ctx: { runQuery: ActionCtx["runQuery"] },
  personaId?: Id<"personas">,
  personaPrompt?: string
): Promise<string | undefined> {
  if (personaPrompt) return personaPrompt;
  if (personaId) {
    const persona = await ctx.runQuery(api.personas.get, { id: personaId });
    return persona?.prompt;
  }
  return undefined;
}

// DRY Helper: Create a message (works for both ActionCtx and MutationCtx)
export async function createMessage(
  ctx: { db: MutationCtx["db"] },
  fields: CreateMessageArgs
) {
  return await ctx.db.insert("messages", {
    ...fields,
    isMainBranch: fields.isMainBranch !== false, // default true
    createdAt: fields.createdAt ?? Date.now(),
  });
}

// Infer the type from the schema


// DRY Helper: Create a conversation (works for both ActionCtx and MutationCtx)
export async function createConversation(
  ctx: { db: MutationCtx["db"] },
  fields: CreateConversationArgs
) {
  return await ctx.db.insert("conversations", {
    ...fields,
    createdAt: fields.createdAt ?? Date.now(),
    updatedAt: fields.updatedAt ?? Date.now(),
  });
}

export async function incrementUserMessageStats(
  ctx: ActionCtx | MutationCtx,
  provider?: string,
  isBuiltInModel?: boolean
) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("User not found");
  }

  const user = await ctx.runQuery(api.users.getById, { id: userId });
  if (!user) {
    throw new Error("User not found");
  }

  // Update user message counters
  const updates: Record<string, number> = {
    messagesSent: (user.messagesSent || 0) + 1,
    totalMessageCount: Math.max(0, (user.totalMessageCount || 0) + 1),
  };

  // Update built-in model counter if applicable
  // Note: With user models taking precedence, a model is built-in only if:
  // 1. No user model exists for this modelId/provider combination, AND
  // 2. A built-in model exists for this combination
  // This is determined by checking if the returned model has the 'free' field
  if (isBuiltInModel) {
    updates.monthlyMessagesSent = (user.monthlyMessagesSent || 0) + 1;
  }

  // Update provider-specific counters if provider is specified
  if (provider) {
    const providerKey = `${provider}MessagesSent` as keyof typeof user;
    const currentCount = (user[providerKey] as number) || 0;
    updates[providerKey] = currentCount + 1;
  }

  await ctx.runMutation(api.users.patch, {
    id: userId,
    updates,
  });
}

export async function scheduleTitleGeneration(
  ctx: { scheduler: ActionCtx["scheduler"] },
  conversationId: Id<"conversations">,
  message: string,
  force?: boolean
) {
  if (force === false && (!message || message.trim().length === 0)) return;
  await ctx.scheduler.runAfter(
    100,
    api.titleGeneration.generateTitleBackground,
    {
      conversationId,
      message,
    }
  );
}

// DRY Helper: Generate export metadata
export function generateExportMetadata(
  conversationIds: Array<Id<"conversations">>,
  includeAttachments: boolean
) {
  const dateStr = new Date().toLocaleDateString();
  const count = conversationIds.length;
  const title =
    count === 1
      ? `Conversation Export - ${dateStr}`
      : `${count} Conversations Export - ${dateStr}`;
  const description = includeAttachments
    ? `Export of ${count} conversation${
        count !== 1 ? "s" : ""
      } with attachments created on ${dateStr}`
    : `Export of ${count} conversation${
        count !== 1 ? "s" : ""
      } created on ${dateStr}`;
  return { title, description };
}

// DRY Helper: Merge baseline instructions with persona prompt
export const mergeSystemPrompts = (
  modelName: string,
  personaPrompt?: string
): string => {
  // Get baseline instructions (formatting rules, date/time, model info, etc.)
  const baselineInstructions = getBaselineInstructions(modelName);

  // Use persona prompt if provided, otherwise use default Polly persona
  const effectivePersonaPrompt = personaPrompt || DEFAULT_POLLY_PERSONA;

  // Combine baseline instructions with persona
  return `${baselineInstructions}\n\n${effectivePersonaPrompt}`;
};

// Moved from conversations.ts
export const executeStreamingAction = async (
  ctx: ActionCtx,
  args: MessageActionArgs & {
    userMessageId?: Id<"messages">;
    conversation: ConversationDoc;
    contextMessages: Array<{
      role: "user" | "assistant" | "system";
      content:
        | string
        | Array<{
            type: "text" | "image_url" | "file";
            text?: string;
            image_url?: { url: string };
            file?: { filename: string; file_data: string };
            attachment?: {
              storageId: Id<"_storage">;
              type: string;
              name: string;
            };
            
          }>;
    }>;
    useWebSearch?: boolean;
    reasoningConfig?: {
      enabled?: boolean;
      effort: "low" | "medium" | "high";
      maxTokens?: number;
    };
  }
): Promise<StreamingActionResult> => {
  let assistantMessageId: Id<"messages"> | undefined;
  try {
    assistantMessageId = await setupAndStartStreaming(ctx, {
      conversationId: args.conversationId,
      contextMessages: args.contextMessages,
      model: args.model,
      provider: args.provider,
      userId: args.conversation.userId,
      personaId: args.conversation.personaId,
      useWebSearch: args.useWebSearch,
      reasoningConfig: args.reasoningConfig,
    });
    return {
      userMessageId: args.userMessageId,
      assistantMessageId: assistantMessageId as Id<"messages">,
    };
  } catch (error) {
    return await handleStreamingError(ctx, error, args.conversationId, {
      userMessageId: args.userMessageId,
      assistantMessageId,
    });
  }
};

export const processAttachmentsForStorage = async (
  ctx: ActionCtx,
  attachments?: Array<{
    type: "image" | "pdf" | "text";
    url: string;
    name: string;
    size: number;
    content?: string;
    thumbnail?: string;
    storageId?: Id<"_storage">;
    mimeType?: string;
  }>
): Promise<
  | Array<{
      type: "image" | "pdf" | "text";
      url: string;
      name: string;
      size: number;
      content?: string;
      thumbnail?: string;
      storageId?: Id<"_storage">;
    }>
  | undefined
> => {
  if (!attachments || attachments.length === 0) {
    return undefined;
  }
  return await Promise.all(
    attachments.map(async (attachment) => {
      // If attachment already has storageId (uploaded on client), preserve it
      if (attachment.storageId) {
        const { mimeType, ...rest } = attachment;
        return { ...rest, content: undefined };
      }

      const needsUpload =
        (attachment.type === "image" || attachment.type === "pdf") &&
        (attachment.url.startsWith("data:") || attachment.content);
      if (needsUpload) {
        try {
          let mimeType: string;
          let base64Data: string;
          if (attachment.url.startsWith("data:")) {
            const matches = attachment.url.match(/^data:([^;]+);base64,(.+)$/);
            if (!matches) {
              throw new ConvexError("Invalid data URL format");
            }
            mimeType = matches[1];
            base64Data = matches[2];
          } else if (attachment.content) {
            mimeType =
              attachment.mimeType ||
              (attachment.type === "image" ? "image/jpeg" : "application/pdf");
            base64Data = attachment.content;
          } else {
            return attachment;
          }
          const byteCharacters = Buffer.from(base64Data, "base64");
          const blob = new globalThis.Blob([byteCharacters], {
            type: mimeType,
          });
          const storageId = await ctx.storage.store(blob);
          return {
            type: attachment.type,
            url: "",
            name: attachment.name,
            size: attachment.size,
            storageId: storageId as Id<"_storage">,
            thumbnail: attachment.thumbnail,
            content: undefined,
          };
        } catch (error) {
          const { content, mimeType, ...rest } = attachment;
          return { ...rest, content: undefined };
        }
      }
      const { content, mimeType, ...rest } = attachment;
      return { ...rest, content: undefined };
    })
  );
};

export const buildContextMessages = async (
  ctx: ActionCtx,
  args: {
    conversationId: Id<"conversations">;
    personaId?: Id<"personas">;
    includeUpToIndex?: number;
  }
): Promise<{
  contextMessages: Array<{
    role: "user" | "assistant" | "system";
    content:
      | string
      | Array<{
          type: "text" | "image_url" | "file";
          text?: string;
          image_url?: { url: string };
          file?: { filename: string; file_data: string };
          attachment?: {
            storageId: Id<"_storage">;
            type: string;
            name: string;
          };
        }>;
  }>;
  messages: any[];
}> => {
  // Development mode logging (always enabled for now to debug streaming issues)
  // biome-ignore lint/suspicious/noExplicitAny: Logging data can be various types
  const log = (step: string, data?: any) => {
    console.log(
      `[BUILD_CONTEXT] ${step}:`,
      data ? JSON.stringify(data, null, 2) : ""
    );
  };

  log("BUILD_CONTEXT_START", {
    conversationId: args.conversationId,
    personaId: args.personaId,
    includeUpToIndex: args.includeUpToIndex,
  });

  // Get the conversation to find its personaId
  const conversation = await ctx.runQuery(api.conversations.get, {
    id: args.conversationId,
  });
  log("CONVERSATION_FETCHED", {
    hasConversation: !!conversation,
    conversationPersonaId: conversation?.personaId,
  });

  const messagesResult: any = await ctx.runQuery(api.messages.list, {
    conversationId: args.conversationId,
  });
  const messages: MessageDoc[] = Array.isArray(messagesResult)
    ? messagesResult
    : messagesResult.page;
  log("MESSAGES_FETCHED", {
    messagesCount: messages.length,
    isArray: Array.isArray(messagesResult),
    includeUpToIndex: args.includeUpToIndex,
  });

  const relevantMessages: MessageDoc[] =
    args.includeUpToIndex !== undefined
      ? messages.slice(0, args.includeUpToIndex + 1)
      : messages;
  log("RELEVANT_MESSAGES_FILTERED", {
    relevantMessagesCount: relevantMessages.length,
    messageRoles: relevantMessages.map((msg: MessageDoc) => msg.role),
  });

  // Use the personaId from the conversation (or fallback to args.personaId)
  const effectivePersonaId = conversation?.personaId || args.personaId;
  log("PERSONA_RESOLUTION", {
    effectivePersonaId,
    conversationPersonaId: conversation?.personaId,
    argsPersonaId: args.personaId,
  });

  const personaPrompt = effectivePersonaId
    ? (await ctx.runQuery(api.personas.get, { id: effectivePersonaId }))?.prompt
    : undefined;
  log("PERSONA_PROMPT_FETCHED", {
    hasPersonaPrompt: !!personaPrompt,
    personaPromptLength: personaPrompt?.length,
  });
  const messagesWithResolvedUrls: MessageDoc[] = await Promise.all(
    relevantMessages.map(async (msg: MessageDoc) => {
      const message = msg;
      if (message.attachments && message.attachments.length > 0) {
        const resolvedAttachments = await resolveAttachmentUrls(
          ctx,
          message.attachments
        );
        return {
          ...message,
          attachments: resolvedAttachments,
        };
      }
      return message;
    })
  );
  const contextMessagesPromises = messagesWithResolvedUrls
    .filter((msg: MessageDoc) => {
      const message = msg;
      return (
        message.role !== "context" &&
        message.content &&
        message.content.trim().length > 0
      );
    })
    .map(async (msg: MessageDoc) => {
      const message = msg;
      if (message.role === "system") {
        const isCitationInstruction =
          message.content.includes("🚨 CRITICAL CITATION REQUIREMENTS") ||
          message.content.includes("SEARCH RESULTS:") ||
          message.content.includes("AVAILABLE SOURCES FOR CITATION:");
        if (isCitationInstruction) {
          return undefined;
        }
        return {
          role: "system" as const,
          content: message.content,
        };
      }
      if (message.role === "user") {
        const content = await buildUserMessageContent(
          ctx,
          message.content,
          message.attachments
        );
        return {
          role: "user" as const,
          content,
        };
      }
      if (message.role === "assistant") {
        return {
          role: "assistant" as const,
          content: message.content,
        };
      }
      return undefined;
    });
  const contextMessagesWithNulls = await Promise.all(contextMessagesPromises);
  const contextMessages = contextMessagesWithNulls.filter(
    (msg: any): msg is Exclude<typeof msg, undefined> => msg !== undefined
  );
  log("CONTEXT_MESSAGES_FILTERED", {
    contextMessagesCount: contextMessages.length,
    filteredFromCount: contextMessagesWithNulls.length,
  });

  // Get model name from the last assistant message or use a default
  const lastAssistantMessage = relevantMessages
    .filter((msg: MessageDoc) => {
      const message = msg;
      return message.role === "assistant" && message.model;
    })
    .pop();
  const modelName = lastAssistantMessage?.model || "an AI model";
  log("MODEL_NAME_RESOLVED", {
    modelName,
    hasLastAssistantMessage: !!lastAssistantMessage,
  });

  // Merge baseline instructions with persona prompt into a single system message
  const mergedSystemPrompt = mergeSystemPrompts(modelName, personaPrompt);
  log("SYSTEM_PROMPT_MERGED", {
    systemPromptLength: mergedSystemPrompt.length,
  });

  contextMessages.unshift({
    role: "system",
    content: mergedSystemPrompt,
  });

  log("BUILD_CONTEXT_COMPLETE", {
    finalContextMessagesCount: contextMessages.length,
    finalMessageRoles: contextMessages.map((m: any) => m.role),
  });

  return { contextMessages, messages: relevantMessages };
};

export const setupAndStartStreaming = async (
  ctx: ActionCtx,
  args: {
    conversationId: Id<"conversations">;
    contextMessages: Array<{
      role: "user" | "assistant" | "system";
      content:
        | string
        | Array<{
            type: "text" | "image_url" | "file";
            text?: string;
            image_url?: { url: string };
            file?: { filename: string; file_data: string };
            attachment?: {
              storageId: Id<"_storage">;
              type: string;
              name: string;
            };
          }>;
    }>;
    model: string;
    provider: string;
    userId: Id<"users">;
    personaId?: Id<"personas">;
    useWebSearch?: boolean;
    reasoningConfig?: {
      enabled?: boolean;
      effort: "low" | "medium" | "high";
      maxTokens?: number;
    };
  }
): Promise<Id<"messages">> => {
  await ctx.runMutation(internal.conversations.internalPatch, {
    id: args.conversationId,
    updates: { isStreaming: true },
  });
  
  const assistantMessageId: Id<"messages"> = await ctx.runMutation(api.messages.create, {
    conversationId: args.conversationId,
    role: "assistant",
    content: "",
    model: args.model,
    provider: args.provider,
    isMainBranch: true,
  });
  
  // Get the full model object with capabilities
  const fullModel = await getUserEffectiveModelWithCapabilities(ctx, args.model, args.provider);
  
  // Use the proper streaming action instead of simple generation
  await ctx.scheduler.runAfter(0, internal.ai.messages.streamResponse, {
    messageId: assistantMessageId,
    conversationId: args.conversationId,
    model: fullModel, // Pass the full model object
    personaId: args.personaId,
    temperature: DEFAULT_TEMPERATURE,
    maxTokens: DEFAULT_MAX_TOKENS,
    useWebSearch: args.useWebSearch,
    webSearchMaxResults: WEB_SEARCH_MAX_RESULTS,
    reasoningConfig: args.reasoningConfig?.enabled
      ? {
          enabled: args.reasoningConfig.enabled,
          effort: args.reasoningConfig.effort,
          maxTokens: args.reasoningConfig.maxTokens,
        }
      : undefined,
  });
  
  return assistantMessageId;
};

export const handleStreamingError = async (
  ctx: ActionCtx,
  error: unknown,
  conversationId: Id<"conversations">,
  messageIds?: {
    userMessageId?: Id<"messages">;
    assistantMessageId?: Id<"messages">;
  }
) => {
  await ctx.runMutation(internal.conversations.internalPatch, {
    id: conversationId,
    updates: { isStreaming: false },
  });
  if (error instanceof Error && error.message === "StoppedByUser") {
    return {
      userMessageId: messageIds?.userMessageId || ("" as Id<"messages">),
      assistantMessageId:
        messageIds?.assistantMessageId || ("" as Id<"messages">),
    };
  }
  throw error;
};

export async function checkConversationAccess(
  ctx: QueryCtx | MutationCtx,
  conversationId: Id<"conversations">,
  allowShared: boolean = false
): Promise<{ hasAccess: boolean; conversation?: Doc<"conversations"> }> {
  const userId = await getAuthUserId(ctx);

  // Use direct database operations since we have QueryCtx | MutationCtx
  const conversation = await ctx.db.get(conversationId);

  if (!conversation) {
    return { hasAccess: false };
  }

  // If no user is authenticated, only allow access to shared conversations
  if (!userId) {
    if (!allowShared) {
      return { hasAccess: false };
    }

    // Check if this conversation is shared using direct database query
    const sharedConversation = await ctx.db
      .query("sharedConversations")
      .withIndex("by_original_conversation", (q) =>
        q.eq("originalConversationId", conversationId)
      )
      .first();

    if (!sharedConversation) {
      return { hasAccess: false };
    }

    return { hasAccess: true, conversation };
  }

  // For authenticated users, check if they own the conversation
  if (conversation.userId !== userId) {
    if (!allowShared) {
      return { hasAccess: false };
    }

    const sharedConversation = await ctx.db
      .query("sharedConversations")
      .withIndex("by_original_conversation", (q) =>
        q.eq("originalConversationId", conversationId)
      )
      .first();

    if (!sharedConversation) {
      return { hasAccess: false };
    }

    return { hasAccess: true, conversation };
  }

  return { hasAccess: true, conversation };
}
