import type { ActionCtx, MutationCtx, QueryCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import { ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { DEFAULT_POLLY_PERSONA } from "../../constants";
import { CreateMessageArgs, CreateConversationArgs } from "../schemas";
import { api } from "../../_generated/api";
import { log } from "../logger";

// Helper function to handle message deletion logic for retry and edit operations
export const handleMessageDeletion = async (
  ctx: ActionCtx,
  messages: Doc<"messages">[],
  messageIndex: number,
  retryType: "user" | "assistant"
) => {
  if (retryType === "assistant") {
    // For assistant retry, delete the assistant message itself AND everything after it
    // BUT preserve context messages
    const messagesToDelete = messages.slice(messageIndex);
    for (const msg of messagesToDelete) {
      // NEVER delete context messages - they should persist across retries
      if (msg.role === "context") {
        continue;
      }
      await ctx.runMutation(api.messages.remove, { id: msg._id });
    }
  } else {
    // For user retry, delete messages after the user message (but keep the user message)
    const userMessage = messages[messageIndex];
    if (userMessage) {
      // For edit operations, we need to delete:
      // 1. The immediate assistant response to the original user message
      // 2. All messages after the edited user message

      const messageIdsToDelete = [];

      // Find the assistant response immediately following the user message
      if (messageIndex + 1 < messages.length) {
        const nextMessage = messages[messageIndex + 1];
        if (nextMessage.role === "assistant") {
          messageIdsToDelete.push(nextMessage._id);
        }
      }

      // Get all messages after the user message
      const messagesToDelete = messages.slice(messageIndex + 1);
      const additionalMessageIds = messagesToDelete
        .filter(msg => msg.role !== "context") // Don't delete context messages
        .map(msg => msg._id);

      messageIdsToDelete.push(...additionalMessageIds);

      if (messageIdsToDelete.length > 0) {
        await ctx.runMutation(api.messages.removeMultiple, {
          ids: messageIdsToDelete,
        });
      }
    }
  }
};

// Helper to find streaming assistant message
export const findStreamingMessage = (
  messages: Doc<"messages">[]
): Doc<"messages"> | null => {
  return (
    messages
      .filter((m) => m.role === "assistant")
      .find((m) => !m.content || m.content.trim() === "") || null
  );
};

// Helper to ensure conversation streaming state is cleared
export const ensureStreamingCleared = async (
  ctx: ActionCtx | MutationCtx,
  conversationId: Id<"conversations">
) => {
  // Clear streaming state by patching the conversation directly
  if ("db" in ctx) {
    await ctx.db.patch(conversationId, { isStreaming: false });
  } else {
    throw new ConvexError("Cannot clear streaming state from ActionCtx");
  }
};

// Common helper for message deletion operations
export const deleteMessagesAfterIndex = async (
  ctx: ActionCtx | MutationCtx,
  conversationId: Id<"conversations">,
  afterMessageId: Id<"messages">
) => {
  // Get all messages in conversation
  const allMessages = await ctx.runQuery(api.messages.getAllInConversation, {
    conversationId,
  });
  
  // Find the index of the target message
  const afterMessageIndex = allMessages.findIndex((msg: any) => msg._id === afterMessageId);
  if (afterMessageIndex === -1) return;

  // Get messages to delete (all messages after the target message)
  const messagesToDelete = allMessages.slice(afterMessageIndex + 1);
  const messageIds = messagesToDelete.map((msg: any) => msg._id);
  
  if (messageIds.length > 0) {
    await ctx.runMutation(api.messages.removeMultiple, {
      ids: messageIds,
    });
  }
};

// Helper function to resolve attachment URLs from storage IDs
export const resolveAttachmentUrls = async (
  ctx: QueryCtx | ActionCtx | MutationCtx,
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
    type: "image" | "pdf" | "text";
    url: string;
    name: string;
    size: number;
    content?: string;
    thumbnail?: string;
  }>
> => {
  const resolvedAttachments = await Promise.all(
    attachments.map(async (attachment) => {
      let url = attachment.url;
      
      if (attachment.storageId && !url) {
        url = await ctx.storage.getUrl(attachment.storageId) ?? undefined;
        if (!url) {
          throw new ConvexError("Failed to resolve attachment URL");
        }
      }
      
      if (!url) {
        throw new ConvexError("Attachment must have either storageId or url");
      }

      return {
        type: attachment.type,
        url,
        name: attachment.name,
        size: attachment.size,
        content: attachment.content,
        thumbnail: attachment.thumbnail,
      };
    })
  );

  return resolvedAttachments;
};

// Helper function to build user message content with attachments
export const buildUserMessageContent = async (
  ctx: QueryCtx | ActionCtx | MutationCtx,
  content: string,
  attachments?: Array<{
    storageId?: Id<"_storage">;
    url?: string;
    name: string;
    type: "image" | "pdf" | "text";
    size: number;
    content?: string;
    thumbnail?: string;
  }>
): Promise<{
  content: string;
  resolvedAttachments?: Array<{
    type: "image" | "pdf" | "text";
    url: string;
    name: string;
    size: number;
    content?: string;
    thumbnail?: string;
  }>;
}> => {
  if (!attachments || attachments.length === 0) {
    return { content };
  }

  const resolvedAttachments = await resolveAttachmentUrls(ctx, attachments);

  // For text and PDF attachments with content, include in the message content
  let enhancedContent = content;
  const imageAttachments: typeof resolvedAttachments = [];
  
  for (const attachment of resolvedAttachments) {
    if (attachment.type === "image") {
      imageAttachments.push(attachment);
    } else if (attachment.content) {
      // Add text/PDF content to the message
      enhancedContent += `\n\n--- Content from ${attachment.name} ---\n${attachment.content}\n--- End of ${attachment.name} ---`;
    }
  }

  return {
    content: enhancedContent,
    resolvedAttachments: imageAttachments.length > 0 ? imageAttachments : undefined,
  };
};

// Helper to get a default system prompt based on conversation messages

// DRY Helper: Process attachments for storage
// (This would be implemented based on your attachment processing logic)

// DRY Helper: Fetch persona prompt if needed
export async function getPersonaPrompt(
  ctx: QueryCtx | ActionCtx | MutationCtx,
  personaId?: Id<"personas"> | null
): Promise<string> {
  if (!personaId) {
    return "";
  }

  const persona = await ctx.runQuery(api.personas.get, { id: personaId });
  return persona?.prompt || "";
}

// DRY Helper: Create a message (works for both ActionCtx and MutationCtx)
export async function createMessage(
  ctx: ActionCtx | MutationCtx,
  args: CreateMessageArgs
): Promise<Id<"messages">> {
  return await ctx.runMutation(api.messages.create, args);
}

// DRY Helper: Create a conversation (works for both ActionCtx and MutationCtx)
export async function createConversation(
  ctx: ActionCtx | MutationCtx,
  args: CreateConversationArgs
): Promise<Id<"conversations">> {
  const result = await ctx.runMutation(api.conversations.createConversation, {
    ...args,
    firstMessage: "Initial message", // Add required field temporarily
  });
  return result.conversationId;
}

export async function incrementUserMessageStats(
  ctx: ActionCtx | MutationCtx,
  userId: Id<"users">,
  model: string,
  provider: string,
  tokensUsed?: number
): Promise<void> {
  try {
    await ctx.runMutation(api.users.incrementMessage, {
      userId,
      model,
      provider,
      tokensUsed: tokensUsed || 0,
    });
  } catch (error) {
    // Log error but don't fail the operation
    log.warn("Failed to increment user message stats:", error);
  }
}

export async function scheduleTitleGeneration(
  ctx: ActionCtx,
  conversationId: Id<"conversations">,
  delayMs: number = 3000
): Promise<void> {
  try {
    await ctx.scheduler.runAfter(
      delayMs,
      api.titleGeneration.generateTitle,
      {
        conversationId,
        message: "Generated title", // Add required message field
      }
    );
  } catch (error) {
    console.warn("Failed to schedule title generation:", error);
    // Don't throw - this is not critical for the conversation flow
  }
}

// DRY Helper: Generate export metadata
export function generateExportMetadata(
  conversation: Doc<"conversations">,
  messageCount: number,
  attachmentCount: number = 0
): {
  conversationId: string;
  title: string;
  messageCount: number;
  attachmentCount: number;
  createdAt: string;
  exportedAt: string;
} {
  return {
    conversationId: conversation._id,
    title: conversation.title,
    messageCount,
    attachmentCount,
    createdAt: new Date(conversation.createdAt).toISOString(),
    exportedAt: new Date().toISOString(),
  };
}

// DRY Helper: Merge baseline instructions with persona prompt
export const mergeSystemPrompts = (
  baselineInstructions: string,
  personaPrompt?: string
): string => {
  if (!personaPrompt) {
    return baselineInstructions;
  }

  return `${baselineInstructions}\n\n${DEFAULT_POLLY_PERSONA}\n\n${personaPrompt}`;
};

// Overloaded function for access control
export async function checkConversationAccess(
  ctx: QueryCtx | ActionCtx | MutationCtx,
  conversationId: Id<"conversations">,
  allowSharedAccess: boolean
): Promise<{ hasAccess: boolean; conversation: Doc<"conversations"> | null; isDeleted?: boolean }>;

export async function checkConversationAccess(
  ctx: QueryCtx | ActionCtx | MutationCtx,
  conversationId: Id<"conversations">,
  userId: Id<"users">
): Promise<Doc<"conversations">>;

export async function checkConversationAccess(
  ctx: QueryCtx | ActionCtx | MutationCtx,
  conversationId: Id<"conversations">,
  userIdOrAllowShared?: Id<"users"> | boolean
): Promise<Doc<"conversations"> | { hasAccess: boolean; conversation: Doc<"conversations"> | null; isDeleted?: boolean }> {
  
  if (typeof userIdOrAllowShared === "boolean") {
    // New overload: return access info object
    // Note: allowSharedAccess parameter is reserved for future use
    
    try {
      const userId = await getAuthUserId(ctx);
      if (!userId) {
        return { hasAccess: false, conversation: null };
      }

      const conversation = "db" in ctx 
        ? await ctx.db.get(conversationId)
        : await ctx.runQuery(api.conversations.get, { id: conversationId });
      if (!conversation) {
        return { hasAccess: false, conversation: null, isDeleted: true };
      }

      const hasAccess = conversation.userId === userId; // For now, only owner has access
      return { 
        hasAccess, 
        conversation: hasAccess ? conversation : null,
        isDeleted: false 
      };
    } catch (error) {
      return { hasAccess: false, conversation: null };
    }
  } else {
    // Legacy overload: return conversation or throw
    const userId = userIdOrAllowShared;
    const effectiveUserId = userId || (await getAuthUserId(ctx));
    
    if (!effectiveUserId) {
      throw new ConvexError("Not authenticated");
    }

    const conversation = "db" in ctx 
      ? await ctx.db.get(conversationId)
      : await ctx.runQuery(api.conversations.get, { id: conversationId });

    if (!conversation) {
      throw new ConvexError("Conversation not found");
    }

    if (conversation.userId !== effectiveUserId) {
      throw new ConvexError("Access denied");
    }

    return conversation;
  }
}