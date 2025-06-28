import { api } from "../_generated/api";
import { type Id } from "../_generated/dataModel";
import { type ActionCtx } from "../_generated/server";
import { getDefaultSystemPrompt } from "../constants";

/**
 * Safely converts a string to a conversation ID and retrieves the conversation.
 * Returns null if the ID is invalid or conversation doesn't exist.
 * This is the DRY solution for handling potentially invalid conversation IDs from the frontend.
 * @param ctx
 * @param ctx.db
 * @param ctx.db.get
 * @param conversationIdString
 */
export async function getSafeConversation(
  ctx: {
    db: {
      get: (
        id: Id<"conversations">
      ) => Promise<{ _id: Id<"conversations"> } | null>;
    };
  },
  conversationIdString: string
) {
  try {
    const conversationId = conversationIdString as Id<"conversations">;
    return await ctx.db.get(conversationId);
  } catch {
    return null;
  }
}

/**
 * Validator replacement for frontend-facing queries.
 * Use this pattern in queries that accept conversation IDs from the frontend:
 *
 * args: { conversationId: v.string() }
 * handler: async (ctx, args) => {
 *   const conversation = await getSafeConversation(ctx, args.conversationId);
 *   if (!conversation) return null;
 *   // ... rest of handler
 * }
 */

// Types for conversation operations
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
    .filter(msg => msg.role === "assistant")
    .reverse() // Start from the most recent
    .find(msg => !msg.metadata?.finishReason); // No finish reason means it's still streaming
};

// Helper to ensure conversation streaming state is cleared
export const ensureStreamingCleared = async (
  ctx: ActionCtx,
  conversationId: Id<"conversations">
): Promise<void> => {
  try {
    await ctx.runMutation(api.conversations.setStreamingState, {
      id: conversationId,
      isStreaming: false,
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
    attachments.map(async attachment => {
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
  }> = [{ type: "text", text: content }];

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
export const getDefaultSystemPromptForConversation = (
  messages: Array<MessageDoc>
): string => {
  // Get the model info from the last assistant message or use a default
  const lastAssistantMessage = messages
    .filter(msg => msg.role === "assistant" && msg.model)
    .pop();

  const modelName = lastAssistantMessage?.model || "an AI model";
  return getDefaultSystemPrompt(modelName);
};
