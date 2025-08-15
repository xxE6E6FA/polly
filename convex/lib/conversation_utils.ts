import { api, internal } from "../_generated/api";
import { type Doc, type Id } from "../_generated/dataModel";
import {
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";

import { ConvexError } from "convex/values";
import { log } from "./logger";
import {
  DEFAULT_TEMPERATURE,
  DEFAULT_MAX_TOKENS,
} from "@shared/constants";
import { getAuthUserId } from "@convex-dev/auth/server";
import { getBaselineInstructions, DEFAULT_POLLY_PERSONA } from "../constants";

import { CreateMessageArgs, CreateConversationArgs } from "./schemas";
import { getUserEffectiveModelWithCapabilities } from "./model_resolution";
import { api as conversationSummaryApi } from "../_generated/api";

// Hierarchical summarization configuration
const CONTEXT_CONFIG = {
  CHUNK_SIZE: 15, // Messages per chunk
  SUMMARY_THRESHOLD: 20, // When to start summarizing
  MAX_SUMMARY_LENGTH: 400, // Max characters per summary (increased for richer summaries)
  MAX_SUMMARY_CHUNKS: 5, // Max summaries before creating meta-summary
  MIN_CHUNK_SIZE: 10, // Minimum chunk size
  MAX_CHUNK_SIZE: 25, // Maximum chunk size
  // LLM summarization settings
  MAX_API_TOKENS: 1000, // Maximum tokens for API calls
  TEMPERATURE: 0.2, // Temperature for consistent summaries
  TOP_P: 0.9, // Top-p for focused generation
  TOP_K: 40, // Top-k for quality variety
  // Fallback settings
  FALLBACK_SUMMARY_LENGTH: 300, // Length for fallback summaries
  TRUNCATE_BUFFER: 20, // Buffer space for truncation
} as const;

// Dynamic chunk size calculation based on model context window
function calculateOptimalChunkSize(modelContextWindow?: number): number {
  if (!modelContextWindow) {
    return CONTEXT_CONFIG.CHUNK_SIZE;
  }

  // Adjust chunk size based on context window
  // Larger context windows can handle bigger chunks
  if (modelContextWindow >= 200000) { // Claude 3.5/3.7, GPT-4o
    return Math.min(CONTEXT_CONFIG.MAX_CHUNK_SIZE, 25);
  } else if (modelContextWindow >= 128000) { // GPT-4 Turbo
    return Math.min(CONTEXT_CONFIG.MAX_CHUNK_SIZE, 22);
  } else if (modelContextWindow >= 32000) { // GPT-4, Gemini 2.5
    return Math.min(CONTEXT_CONFIG.MAX_CHUNK_SIZE, 18);
  } else if (modelContextWindow >= 16000) { // GPT-3.5 Turbo
    return Math.min(CONTEXT_CONFIG.MAX_CHUNK_SIZE, 15);
  } else {
    return Math.max(CONTEXT_CONFIG.MIN_CHUNK_SIZE, 12);
  }
}

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
    log.error(
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
    // NEVER delete context messages - they should persist across retries
    if (msg.role === "context") {
      continue;
    }
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
    extractedText?: string;
    textFileId?: Id<"_storage">;
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
    extractedText?: string;
    textFileId?: Id<"_storage">;
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
        extractedText?: string;
        textFileId?: Id<"_storage">;
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
      extractedText?: string;
      textFileId?: Id<"_storage">;
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
        attachment: attachment.storageId
          ? {
              storageId: attachment.storageId,
              type: attachment.type,
              name: attachment.name,
              // Include extracted text for PDFs that don't have native support
              extractedText: attachment.extractedText,
              textFileId: (attachment as any).textFileId,
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
    useWebSearch: boolean; // Add useWebSearch parameter
    reasoningConfig?: {
      enabled?: boolean;
      effort: "low" | "medium" | "high";
      maxTokens?: number;
    };
  }
): Promise<StreamingActionResult> => {
  let assistantMessageId: Id<"messages"> | undefined;
  try {
    // Determine persona sampling parameters if any
    let samplingParams:
      | {
          temperature?: number;
          topP?: number;
          topK?: number;
          frequencyPenalty?: number;
          presencePenalty?: number;
          repetitionPenalty?: number;
        }
      | undefined;

    if (args.conversation.personaId) {
      try {
        const persona = await ctx.runQuery(api.personas.get, {
          id: args.conversation.personaId,
        });
        if (persona) {
          samplingParams = {
            temperature: (persona as { temperature?: number }).temperature,
            topP: (persona as { topP?: number }).topP,
            topK: (persona as { topK?: number }).topK,
            frequencyPenalty: (persona as { frequencyPenalty?: number }).frequencyPenalty,
            presencePenalty: (persona as { presencePenalty?: number }).presencePenalty,
            repetitionPenalty: (persona as { repetitionPenalty?: number }).repetitionPenalty,
          };
        }
      } catch (_ignored) {
        // Ignore persona fetch failures
      }
    }

    assistantMessageId = await setupAndStartStreaming(ctx, {
      conversationId: args.conversationId,
      contextMessages: args.contextMessages,
      model: args.model,
      provider: args.provider,
      userId: args.conversation.userId,
      personaId: args.conversation.personaId,
      useWebSearch: args.useWebSearch, // Pass through useWebSearch
      reasoningConfig: args.reasoningConfig,
      sampling: samplingParams,
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
    extractedText?: string;
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
      textFileId?: Id<"_storage">;
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
        const { mimeType, extractedText, ...rest } = attachment;
        
        // If this is a PDF with extracted text, store it
        let textFileId: Id<"_storage"> | undefined;
        if (attachment.type === "pdf" && extractedText) {
          try {
            const textBlob = new globalThis.Blob([extractedText], { type: "text/plain" });
            textFileId = await ctx.storage.store(textBlob) as Id<"_storage">;
          } catch (error) {
            console.warn("Failed to store extracted text:", error);
          }
        }
        
        return { ...rest, content: undefined, textFileId };
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
    modelCapabilities?: {
      supportsImages?: boolean;
      supportsFiles?: boolean;
    };
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
            extractedText?: string;
            textFileId?: Id<"_storage">;
          };
        }>;
  }>;
  messages: any[];
}> => {
  // OPTIMIZATION: Run conversation and messages queries in parallel
  const [conversation, messagesResult] = await Promise.all([
    ctx.runQuery(api.conversations.get, {
      id: args.conversationId,
    }),
    ctx.runQuery(api.messages.list, {
      conversationId: args.conversationId,
    }),
  ]);

  const messages: any[] = Array.isArray(messagesResult)
    ? messagesResult
    : messagesResult.page;

  const relevantMessages: any[] =
    args.includeUpToIndex !== undefined
      ? messages.slice(0, args.includeUpToIndex + 1)
      : messages;

  // Use the personaId from the conversation (or fallback to args.personaId)
  const effectivePersonaId = conversation?.personaId || args.personaId;

  // OPTIMIZATION: Parallelize persona prompt fetch and attachment URL resolution
  const [personaPrompt, messagesWithResolvedUrls] = await Promise.all([
    // Fetch persona prompt
    effectivePersonaId
      ? ctx.runQuery(api.personas.get, { id: effectivePersonaId }).then(p => p?.prompt)
      : Promise.resolve(undefined),
    
    // Resolve attachment URLs only for messages that have attachments
    Promise.all(
      relevantMessages.map(async (msg: any) => {
        const message = msg;
        if (message.attachments && message.attachments.length > 0) {
          // Filter attachments based on model capabilities
          let filteredAttachments = message.attachments;
          if (args.modelCapabilities) {
            filteredAttachments = message.attachments.filter((attachment: any) => {
              if (attachment.type === "image" && args.modelCapabilities?.supportsImages === false) {
                return false;
              }
              if ((attachment.type === "pdf" || attachment.type === "text") && args.modelCapabilities?.supportsFiles === false) {
                return false;
              }
              return true;
            });
          }
          
          const resolvedAttachments = await resolveAttachmentUrls(
            ctx,
            filteredAttachments
          );
          return {
            ...message,
            attachments: resolvedAttachments,
          };
        }
        return message;
      })
    ),
  ]);
  // Collect context messages separately to append to system prompt
  const contextMessageContents: string[] = [];
  
  let carriedAssistantAttachments: Array<{
    type: "image" | "pdf" | "text";
    url: string;
    name: string;
    size: number;
    content?: string;
    thumbnail?: string;
    storageId?: Id<"_storage">;
    extractedText?: string;
    textFileId?: Id<"_storage">;
  }> = [];

  const contextMessagesPromises = messagesWithResolvedUrls
    .filter((msg: any) => {
      const message = msg;
      const hasText = typeof message.content === "string" && message.content.trim().length > 0;
      const hasAttachments = Array.isArray(message.attachments) && message.attachments.length > 0;
      return hasText || hasAttachments;
    })
    .map(async (msg: any) => {
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
      if (message.role === "context") {
        // Collect context content to append to main system prompt
        contextMessageContents.push(message.content);
        return undefined; // Don't create separate system messages for context
      }
      if (message.role === "user") {
        // Merge any carried attachments from the previous assistant message
        const mergedAttachments = [
          ...(Array.isArray(message.attachments) ? message.attachments : []),
          ...carriedAssistantAttachments,
        ];

        // Clear carried attachments after merging into this user message
        carriedAssistantAttachments = [];

        const content = await buildUserMessageContent(
          ctx,
          message.content,
          mergedAttachments
        );
        return {
          role: "user" as const,
          content,
        };
      }
      if (message.role === "assistant") {
        // Carry assistant attachments forward to the next user message so that
        // the AI SDK receives image/file parts on user role (which is required
        // by the schema for multimodal inputs).
        if (Array.isArray(message.attachments) && message.attachments.length > 0) {
          carriedAssistantAttachments = message.attachments;
        }

        // If there is no assistant text content, omit this message entirely.
        const hasText = typeof message.content === "string" && message.content.trim().length > 0;
        if (!hasText) {
          return undefined;
        }

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

  // Get model name from the last assistant message or use a default
  const lastAssistantMessage = relevantMessages
    .filter((msg: any) => {
      const message = msg;
      return message.role === "assistant" && message.model;
    })
    .pop();
  const modelName = lastAssistantMessage?.model || "an AI model";

  // Merge baseline instructions with persona prompt and context into a single system message
  let mergedSystemPrompt = mergeSystemPrompts(modelName, personaPrompt);
  
  // Append context messages to the system prompt if any exist
  if (contextMessageContents.length > 0) {
    mergedSystemPrompt += `\n\nAdditional Context:\n${contextMessageContents.join('\n\n')}`;
  }

  contextMessages.unshift({
    role: "system",
    content: mergedSystemPrompt,
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
    useWebSearch: boolean; // Add useWebSearch parameter
    reasoningConfig?: {
      enabled?: boolean;
      effort: "low" | "medium" | "high";
      maxTokens?: number;
    };
    sampling?: {
      temperature?: number;
      topP?: number;
      topK?: number;
      frequencyPenalty?: number;
      presencePenalty?: number;
      repetitionPenalty?: number;
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
    temperature: args.sampling?.temperature ?? DEFAULT_TEMPERATURE,
    maxTokens: DEFAULT_MAX_TOKENS,
    topP: args.sampling?.topP,
    topK: args.sampling?.topK,
    frequencyPenalty: args.sampling?.frequencyPenalty,
    presencePenalty: args.sampling?.presencePenalty,
    repetitionPenalty: args.sampling?.repetitionPenalty,
    useWebSearch: args.useWebSearch, // Pass through the useWebSearch parameter
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
): Promise<{ hasAccess: boolean; conversation?: Doc<"conversations">; isDeleted: boolean }> {
  const userId = await getAuthUserId(ctx);

  // Use direct database operations since we have QueryCtx | MutationCtx
  const conversation = await ctx.db.get(conversationId);

  if (!conversation) {
    return { hasAccess: false, isDeleted: true };
  }

  // If no user is authenticated, only allow access to shared conversations
  if (!userId) {
    if (!allowShared) {
      return { hasAccess: false, isDeleted: false };
    }

    // Check if this conversation is shared using direct database query
    const sharedConversation = await ctx.db
      .query("sharedConversations")
      .withIndex("by_original_conversation", (q) =>
        q.eq("originalConversationId", conversationId)
      )
      .first();

    if (!sharedConversation) {
      return { hasAccess: false, isDeleted: false };
    }

    return { hasAccess: true, conversation, isDeleted: false };
  }

  // For authenticated users, check if they own the conversation
  if (conversation.userId !== userId) {
    if (!allowShared) {
      return { hasAccess: false, isDeleted: false };
    }

    const sharedConversation = await ctx.db
      .query("sharedConversations")
      .withIndex("by_original_conversation", (q) =>
        q.eq("originalConversationId", conversationId)
      )
      .first();

    if (!sharedConversation) {
      return { hasAccess: false, isDeleted: false };
    }

    return { hasAccess: true, conversation, isDeleted: false };
  }

  return { hasAccess: true, conversation, isDeleted: false };
}

// Improved type definitions for hierarchical summarization
export type ChunkSummary = {
  chunkIndex: number;
  summary: string;
  messageCount: number;
  firstMessageId: Id<"messages">;
  lastMessageId: Id<"messages">;
};

// More flexible type for API responses that may have string roles
type ApiMessageDoc = Omit<MessageDoc, 'role' | 'citations'> & {
  role: string;
  citations?: Array<{
    image?: string;
    cited_text?: string;
    snippet?: string;
    description?: string;
    favicon?: string;
    siteName?: string;
    title: string;
    url: string;
    score?: number;
    publishedDate?: string;
    author?: string;
    text?: string;
  }>;
};

// Update ProcessedChunk to handle both string summaries and API message arrays
export type ProcessedChunk = string | ApiMessageDoc[];

export type HierarchicalContextArgs = {
  conversationId: Id<"conversations">;
  personaId?: Id<"personas">;
  maxTokens?: number;
  modelCapabilities?: {
    supportsImages?: boolean;
    supportsFiles?: boolean;
    contextWindow?: number;
  };
};

export type HierarchicalContextResult = {
  contextMessages: Array<{
    role: "user" | "assistant" | "system";
    content: string | Array<any>;
  }>;
  messages: ApiMessageDoc[];
};

// Type for summary messages used in recursive processing
type SummaryMessage = {
  role: "system";
  content: string;
  createdAt: number;
};

export const buildHierarchicalContextMessages = async (
  ctx: ActionCtx,
  args: HierarchicalContextArgs
): Promise<HierarchicalContextResult> => {
  const messagesResult = await ctx.runQuery(api.messages.list, { conversationId: args.conversationId });

  const messages: ApiMessageDoc[] = Array.isArray(messagesResult)
    ? messagesResult
    : messagesResult.page;

  // If conversation is short, use full context
  if (messages.length <= CONTEXT_CONFIG.SUMMARY_THRESHOLD) {
    log.debug(`Using full context for conversation ${args.conversationId} (${messages.length} messages)`);
    return buildContextMessages(ctx, {
      conversationId: args.conversationId,
      personaId: args.personaId,
      modelCapabilities: args.modelCapabilities,
    });
  }

  log.debug(`Building hierarchical context for conversation ${args.conversationId} (${messages.length} messages)`);

  // Get model context window from model capabilities if available
  const modelContextWindow = args.modelCapabilities?.contextWindow;
  const optimalChunkSize = calculateOptimalChunkSize(modelContextWindow);
  log.debug(`Model context window: ${modelContextWindow}, optimal chunk size: ${optimalChunkSize}`);

  // Build hierarchical context with automatic summarization
  const { contextMessages, processedMessages } = await buildHierarchicalContext(
    ctx,
    messages,
    args,
    optimalChunkSize
  );

  log.debug(`Built hierarchical context: ${contextMessages.length} context messages, ${processedMessages.length} processed messages`);

  return { contextMessages, messages: processedMessages };
};

async function processChunksWithStoredSummaries(
  ctx: ActionCtx,
  chunks: ApiMessageDoc[][],
  storedSummaries: ChunkSummary[],
  optimalChunkSize: number
): Promise<ProcessedChunk[]> {
  if (chunks.length === 1) {
    return chunks;
  }

  log.debug(`Processing ${chunks.length} chunks with ${storedSummaries.length} stored summaries`);

  // Process each chunk using stored summaries when available
  const processedChunks: ProcessedChunk[] = [];
  
  for (let i = 0; i < chunks.length - 1; i++) {
    const chunk = chunks[i];
    const chunkIndex = i;
    
    // Look for stored summary for this chunk
    const storedSummary = storedSummaries.find(s => s.chunkIndex === chunkIndex);
    
    if (storedSummary && storedSummary.messageCount === chunk.length) {
      // Use stored summary
      processedChunks.push(storedSummary.summary);
      log.debug(`Using stored summary for chunk ${chunkIndex}: ${storedSummary.summary.length} chars`);
    } else {
      // Generate new summary if stored one doesn't match
      log.debug(`Generating new summary for chunk ${chunkIndex} (${chunk.length} messages)`);
      const summary = await summarizeChunk(chunk, CONTEXT_CONFIG.MAX_SUMMARY_LENGTH);
      processedChunks.push(summary);
      
      // Store the new summary for future use
      await storeChunkSummary(ctx, chunk, chunkIndex, summary);
    }
  }

  // Keep the last chunk in full (most recent messages)
  processedChunks.push(chunks[chunks.length - 1]);
  log.debug(`Last chunk: ${chunks[chunks.length - 1].length} messages (kept in full)`);

  // If we have too many summaries, create meta-summaries recursively
  if (processedChunks.length > CONTEXT_CONFIG.MAX_SUMMARY_CHUNKS) {
    log.debug(`Too many summaries (${processedChunks.length}), creating recursive meta-summary`);
    return await createRecursiveMetaSummary(ctx, processedChunks, optimalChunkSize);
  }

  return processedChunks;
}

// Extract summary storage logic into separate function
async function storeChunkSummary(
  ctx: ActionCtx,
  chunk: ApiMessageDoc[],
  chunkIndex: number,
  summary: string
): Promise<void> {
  try {
    await ctx.runMutation(conversationSummaryApi.conversationSummary.upsertConversationSummary, {
      conversationId: chunk[0].conversationId,
      chunkIndex,
      summary,
      messageCount: chunk.length,
      firstMessageId: chunk[0]._id,
      lastMessageId: chunk[chunk.length - 1]._id,
    });
    log.debug(`Stored new summary for chunk ${chunkIndex}`);
  } catch (error) {
    log.error(`Failed to store summary for chunk ${chunkIndex}:`, error);
  }
}

// Extract recursive meta-summary creation into separate function
async function createRecursiveMetaSummary(
  ctx: ActionCtx,
  processedChunks: ProcessedChunk[],
  optimalChunkSize: number
): Promise<ProcessedChunk[]> {
  // Create a new level of summarization by combining the existing string summaries
  const summaryChunks = processedChunks.slice(0, -1); // Exclude the last full chunk

  const summaryTexts: string[] = summaryChunks
    .filter((chunk): chunk is string => typeof chunk === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const combinedText = summaryTexts.join("\n\n");

  // Build a meta-summary from the summaries above
  let metaSummary: string;
  try {
    const prompt = buildMetaSummaryPrompt(combinedText, CONTEXT_CONFIG.MAX_SUMMARY_LENGTH);
    metaSummary = await generateLLMSummary(prompt, CONTEXT_CONFIG.MAX_SUMMARY_LENGTH);
    log.debug(`Recursive meta-summary created: ${metaSummary.length} chars`);
  } catch {
    // Fallback to intelligent truncation if LLM unavailable or fails
    metaSummary = intelligentTruncateSummary(combinedText, CONTEXT_CONFIG.MAX_SUMMARY_LENGTH);
    log.debug(`Recursive meta-summary (fallback) created: ${metaSummary.length} chars`);
  }

  return [metaSummary, processedChunks[processedChunks.length - 1]];
}

async function buildHierarchicalContext(
  ctx: ActionCtx,
  messages: ApiMessageDoc[],
  args: {
    personaId?: Id<"personas">;
    maxTokens?: number;
    modelCapabilities?: {
      supportsImages?: boolean;
      supportsFiles?: boolean;
      contextWindow?: number;
    };
  },
  optimalChunkSize: number
): Promise<{
  contextMessages: Array<{
    role: "user" | "assistant" | "system";
    content: string | Array<any>;
  }>;
  processedMessages: ApiMessageDoc[];
}> {
  // If under threshold, return full context
  if (messages.length <= CONTEXT_CONFIG.SUMMARY_THRESHOLD) {
    const result = await buildContextMessages(ctx, {
      conversationId: messages[0]?.conversationId || ("" as Id<"conversations">),
      personaId: args.personaId,
      modelCapabilities: args.modelCapabilities,
    });
    return {
      contextMessages: result.contextMessages,
      processedMessages: result.messages as unknown as ApiMessageDoc[],
    };
  }

  // Get stored summaries for this conversation
  const storedSummaries = await ctx.runQuery(conversationSummaryApi.conversationSummary.getConversationSummaries, {
    conversationId: messages[0]?.conversationId || ("" as Id<"conversations">),
    limit: 100, // Get up to 100 summaries
  });

  log.debug(`Found ${storedSummaries.length} stored summaries for conversation`);

  // Split into chunks
  const chunks: ApiMessageDoc[][] = [];
  for (let i = 0; i < messages.length; i += optimalChunkSize) {
    chunks.push(messages.slice(i, i + optimalChunkSize));
  }

  // Process chunks using stored summaries when available
  const processedChunks = await processChunksWithStoredSummaries(
    ctx,
    chunks,
    storedSummaries,
    optimalChunkSize
  );

  // Determine model name from last assistant message
  const lastAssistant = messages
    .filter((m) => (m as any).role === "assistant" && (m as any).model)
    .pop();
  const modelName = (lastAssistant as any)?.model || "an AI model";

  // Fetch persona prompt (if any)
  const personaPrompt = await getPersonaPrompt({ runQuery: ctx.runQuery }, args.personaId);

  // Build final context with summaries and recent messages
  const contextMessages = await buildFinalContext(
    ctx,
    processedChunks,
    {
      modelName,
      personaPrompt,
      modelCapabilities: args.modelCapabilities,
    }
  );

  return {
    contextMessages,
    processedMessages: messages.slice(-optimalChunkSize), // Return recent messages for reference
  };
}

async function summarizeChunk(
  chunk: ApiMessageDoc[],
  maxLength: number
): Promise<string> {
  // Use LLM to create intelligent, rich summaries
  try {
    const conversationText = buildConversationText(chunk);

    // If the text is short enough, return it as-is
    if (conversationText.length <= maxLength) {
      return conversationText;
    }

    const summaryPrompt = buildSummaryPrompt(conversationText, maxLength);
    const summary = await generateLLMSummary(summaryPrompt, maxLength);

    if (summary && summary.length > 0) {
      // Ensure the summary doesn't exceed our target length
      if (summary.length <= maxLength) {
        return summary;
      } else {
        // If it's too long, intelligently truncate while preserving structure
        return intelligentTruncateSummary(summary, maxLength);
      }
    }

    throw new Error("No summary generated or empty response");
    
  } catch (error) {
    log.error("Error creating LLM summary:", error);
    // Fallback to intelligent truncation
    const fallbackText = buildConversationText(chunk);
    return createFallbackSummary(fallbackText, maxLength);
  }
}

// Extract conversation text building into separate function
function buildConversationText(chunk: ApiMessageDoc[]): string {
  return chunk
    .filter((msg) => msg.role !== "system")
    .map((msg) => {
      const role = msg.role === "user" ? "User" : "Assistant";
      const content = typeof msg.content === "string" ? msg.content : "Content";
      return `${role}: ${content}`;
    })
    .join("\n\n");
}

// Extract summary prompt building into separate function
function buildSummaryPrompt(conversationText: string, maxLength: number): string {
  return `You are an expert at summarizing conversations between users and AI assistants. Your task is to create a rich, comprehensive summary that preserves the most important information for conversation continuity.

Please analyze the following conversation excerpt and create a summary that captures:

1. **Main Topics & Themes**: What subjects were discussed? What was the primary focus?
2. **Key Questions & Requests**: What did the user want to know or accomplish?
3. **Important Insights & Explanations**: What key information, concepts, or conclusions were shared?
4. **Context & Background**: What context or setup was established?
5. **Conversation Flow**: How did the discussion progress? What was the logical sequence?

Guidelines:
- Be comprehensive but concise (aim for ${Math.floor(maxLength / 3)} characters)
- Preserve technical accuracy and domain-specific terminology
- Maintain the conversational tone and context
- Focus on information that would be useful for continuing the conversation
- If the conversation covers multiple topics, organize them logically
- Use clear, structured language that another AI can easily understand
- Adapt your summary style to the domain (technical, casual, academic, etc.)

Conversation excerpt:
${conversationText}

Rich Summary:`;
}

// Extract LLM summary generation into separate function
async function generateLLMSummary(prompt: string, maxLength: number): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // Fallback to intelligent truncation if no API key
    log.warn("No Gemini API key available, using fallback summarization");
    throw new Error("No API key available");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: Math.min(CONTEXT_CONFIG.MAX_API_TOKENS, Math.floor(maxLength / 2)),
          temperature: CONTEXT_CONFIG.TEMPERATURE,
          topP: CONTEXT_CONFIG.TOP_P,
          topK: CONTEXT_CONFIG.TOP_K,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
        }>;
      };
    }>;
  };
  
  const summary: string | undefined =
    data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  if (!summary || summary.length === 0) {
    throw new Error("No summary generated or empty response");
  }

  return summary;
}

// Build a prompt for summarizing previously generated chunk summaries into a single coherent summary
function buildMetaSummaryPrompt(summaries: string, maxLength: number): string {
  return `You are an expert at synthesizing multiple summaries into a single, coherent meta-summary suitable for conditioning a conversational AI.

Please read the following summaries of earlier conversation segments and produce ONE consolidated summary that preserves:

1. Main topics and themes across all segments
2. Key user goals, constraints, and decisions made
3. Important technical details and definitions
4. Any follow-ups or unresolved questions to be aware of

Guidelines:
- Target length: ~${Math.floor(maxLength / 3)} characters (concise but information-dense)
- Maintain accuracy; avoid repetition
- Structure clearly so another AI can use it as context

Summaries:
${summaries}

Consolidated Meta-Summary:`;
}

function createFallbackSummary(text: string, maxLength: number): string {
  // Create a structured fallback summary when LLM is unavailable
  if (text.length <= maxLength) {
    return text;
  }

  // Try to preserve complete sentences and logical breaks
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  let result = "";
  
  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if ((result + trimmedSentence + ". ").length <= maxLength - CONTEXT_CONFIG.TRUNCATE_BUFFER) {
      result += trimmedSentence + ". ";
    } else {
      break;
    }
  }
  
  if (result.length === 0) {
    // If we can't fit even one sentence, just truncate
    return text.substring(0, maxLength - 3) + "...";
  }
  
  return result.trim() + "\n\n[Summary truncated - LLM unavailable]";
}

function intelligentTruncateSummary(summary: string, maxLength: number): string {
  // Intelligently truncate LLM-generated summaries while preserving structure
  if (summary.length <= maxLength) {
    return summary;
  }

  // Try to preserve complete sections by looking for natural breaks
  const sections = summary.split(/\n+/);
  let result = "";
  
  for (const section of sections) {
    const trimmedSection = section.trim();
    if (trimmedSection.length === 0) continue;
    
    if ((result + trimmedSection + "\n").length <= maxLength - CONTEXT_CONFIG.TRUNCATE_BUFFER) {
      result += trimmedSection + "\n";
    } else {
      // Try to fit part of this section if there's enough space
      const remainingLength = maxLength - result.length - CONTEXT_CONFIG.TRUNCATE_BUFFER;
      if (remainingLength > 30) {
        result += trimmedSection.substring(0, remainingLength) + "...";
      }
      break;
    }
  }
  
  if (result.length === 0) {
    // If we can't fit even one section, just truncate
    return summary.substring(0, maxLength - 3) + "...";
  }
  
  return result.trim();
}

async function buildFinalContext(
  ctx: ActionCtx,
  processedChunks: ProcessedChunk[],
  options?: {
    modelName?: string;
    personaPrompt?: string;
    modelCapabilities?: {
      supportsImages?: boolean;
      supportsFiles?: boolean;
    };
  }
): Promise<Array<{
  role: "user" | "assistant" | "system";
  content: string | Array<any>;
}>> {
  const contextMessages: Array<{
    role: "user" | "assistant" | "system";
    content: string | Array<any>;
  }> = [];

  // Count how many layers of summarization we have
  const summaryLayers = processedChunks.filter(chunk => typeof chunk === "string").length;
  
  // Build summary context content
  const contextContent = buildContextContent(processedChunks, summaryLayers);

  // Merge baseline instructions with persona, then append our summary context
  const mergedSystemPrompt = mergeSystemPrompts(options?.modelName || "an AI model", options?.personaPrompt);
  const systemContent = `${mergedSystemPrompt}\n\n${contextContent}`;

  contextMessages.push({
    role: "system",
    content: systemContent,
  });

  // Add the last chunk (most recent messages) in full, with attachment handling similar to buildContextMessages
  const lastChunk = processedChunks[processedChunks.length - 1];
  if (Array.isArray(lastChunk)) {
    let carriedAssistantAttachments: Array<{
      type: "image" | "pdf" | "text";
      url: string;
      name: string;
      size: number;
      content?: string;
      thumbnail?: string;
      storageId?: Id<"_storage">;
      extractedText?: string;
      textFileId?: Id<"_storage">;
    }> = [];

    for (const msg of lastChunk) {
      if (msg.role === "system" || msg.role === "context") continue; // Skip system/context messages

      if (msg.role === "assistant") {
        // Carry assistant attachments forward
        if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
          carriedAssistantAttachments = msg.attachments;
        }

        // Only include assistant text content
        const hasText = typeof msg.content === "string" && msg.content.trim().length > 0;
        if (!hasText) {
          continue;
        }

        contextMessages.push({
          role: "assistant",
          content: msg.content,
        });
      } else if (msg.role === "user") {
        // Filter attachments based on model capabilities
        let filteredAttachments = msg.attachments;
        if (options?.modelCapabilities) {
          filteredAttachments = (msg.attachments || []).filter((attachment: any) => {
            if (attachment.type === "image" && options.modelCapabilities?.supportsImages === false) {
              return false;
            }
            if ((attachment.type === "pdf" || attachment.type === "text") && options.modelCapabilities?.supportsFiles === false) {
              return false;
            }
            return true;
          });
        }

        const mergedAttachments = [
          ...(Array.isArray(filteredAttachments) ? filteredAttachments : []),
          ...carriedAssistantAttachments,
        ];
        carriedAssistantAttachments = [];

        const content = await buildUserMessageContent(
          ctx,
          typeof msg.content === "string" ? msg.content : "",
          mergedAttachments
        );

        contextMessages.push({
          role: "user",
          content,
        });
      }
    }
  }

  return contextMessages;
}

// Extract context content building into separate function
function buildContextContent(processedChunks: ProcessedChunk[], summaryLayers: number): string {
  let contextContent = `Previous conversation context (${summaryLayers} layer${summaryLayers !== 1 ? 's' : ''} of AI-generated summarization):\n\n`;
  
  let layerIndex = 1;
  for (let i = 0; i < processedChunks.length - 1; i++) {
    const chunk = processedChunks[i];
    if (typeof chunk === "string") {
      // Truncate very long summaries to keep context manageable
      const truncatedSummary = chunk.length > 500 ? chunk.substring(0, 500) + "..." : chunk;
      contextContent += `Layer ${layerIndex}: ${truncatedSummary}\n\n`;
      layerIndex++;
    }
  }

  // Add intelligent instructions for the AI based on summarization depth
  contextContent += buildAIInstructions(summaryLayers);

  // Add specific guidance for using the rich summaries effectively
  if (summaryLayers > 1) {
    contextContent += buildSummaryGuidance();
  }

  return contextContent;
}

// Extract AI instructions building into separate function
function buildAIInstructions(summaryLayers: number): string {
  if (summaryLayers > 3) {
    return `IMPORTANT: This conversation has been summarized through ${summaryLayers} layers due to extreme length. The AI-generated summaries above contain rich, structured information about earlier parts of the conversation.\n\nYour task: Use this context to maintain conversation continuity while focusing primarily on the recent messages below. If the user references something from earlier in the conversation, acknowledge the context from the summaries above and connect it to the current discussion.\n\n`;
  } else if (summaryLayers > 2) {
    return `Note: This conversation has been summarized through ${summaryLayers} layers. The AI-generated summaries above preserve key topics, questions, and insights in a structured format.\n\nYour task: Use this context to maintain conversation continuity while focusing on the recent messages below. Be aware of the broader context and reference relevant information from the summaries when appropriate.\n\n`;
  } else if (summaryLayers > 1) {
    return `Note: This conversation has been summarized to manage length. The AI-generated summaries above contain rich, structured information about earlier discussion points.\n\nYour task: Continue naturally from the recent messages below while being aware of the broader context. Use the summaries to understand what has already been discussed and avoid repetition.\n\n`;
  } else {
    return `Continue the conversation naturally from the recent messages below.\n\n`;
  }
}

// Extract summary guidance building into separate function
function buildSummaryGuidance(): string {
  return `How to use the summaries above:\n` +
    `• Each summary is AI-generated and structured to preserve key information\n` +
    `• They maintain technical accuracy and domain-specific terminology\n` +
    `• They capture the logical flow and progression of ideas\n` +
    `• Use them to understand context, avoid repetition, and maintain continuity\n` +
    `• If the user references earlier topics, use the summaries to provide relevant context\n\n`;
}