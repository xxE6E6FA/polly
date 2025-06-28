import { v } from "convex/values";

import { type Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  internalQuery,
} from "./_generated/server";
import {
  attachmentSchema,
  messageRoleSchema,
  webCitationSchema,
  messageMetadataSchema,
} from "./lib/schemas";

export const create = mutation({
  args: {
    conversationId: v.id("conversations"),
    role: messageRoleSchema,
    content: v.string(),
    model: v.optional(v.string()),
    provider: v.optional(v.string()),
    parentId: v.optional(v.id("messages")),
    isMainBranch: v.optional(v.boolean()),
    reasoning: v.optional(v.string()),
    sourceConversationId: v.optional(v.id("conversations")),
    useWebSearch: v.optional(v.boolean()),
    attachments: v.optional(v.array(attachmentSchema)),
    metadata: v.optional(
      v.object({
        tokenCount: v.optional(v.number()),
        reasoningTokenCount: v.optional(v.number()),
        finishReason: v.optional(v.string()),
        duration: v.optional(v.number()),
        stopped: v.optional(v.boolean()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const messageId = await ctx.db.insert("messages", {
      ...args,
      isMainBranch: args.isMainBranch ?? true,
      createdAt: Date.now(),
    });

    return messageId;
  },
});

export const list = query({
  args: {
    conversationId: v.id("conversations"),
    includeAlternatives: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const query = ctx.db
      .query("messages")
      .withIndex("by_conversation", q =>
        q.eq("conversationId", args.conversationId)
      )
      .order("asc");

    const messages = !args.includeAlternatives
      ? await query.filter(q => q.eq(q.field("isMainBranch"), true)).collect()
      : await query.collect();

    // Resolve URLs for attachments with storageId
    return await Promise.all(
      messages.map(async message => {
        if (message.attachments) {
          const resolvedAttachments = await Promise.all(
            message.attachments.map(async attachment => {
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
          return {
            ...message,
            attachments: resolvedAttachments,
          };
        }
        return message;
      })
    );
  },
});

export const getAlternatives = query({
  args: { parentId: v.id("messages") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_parent", q => q.eq("parentId", args.parentId))
      .collect();
  },
});

export const update = mutation({
  args: {
    id: v.id("messages"),
    content: v.optional(v.string()),
    reasoning: v.optional(v.string()),
    metadata: v.optional(
      v.object({
        tokenCount: v.optional(v.number()),
        reasoningTokenCount: v.optional(v.number()),
        finishReason: v.optional(v.string()),
        duration: v.optional(v.number()),
        stopped: v.optional(v.boolean()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    return await ctx.db.patch(id, updates);
  },
});

// Internal mutation for streaming updates
export const internalUpdate = internalMutation({
  args: {
    id: v.id("messages"),
    content: v.optional(v.string()),
    reasoning: v.optional(v.string()),
    // Web search citations
    citations: v.optional(v.array(webCitationSchema)),
    metadata: v.optional(
      v.object({
        tokenCount: v.optional(v.number()),
        reasoningTokenCount: v.optional(v.number()),
        finishReason: v.optional(v.string()),
        duration: v.optional(v.number()),
        stopped: v.optional(v.boolean()),
        webSearchCost: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;

    // Use a retry loop with exponential backoff for write conflicts
    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
      try {
        return await ctx.db.patch(id, updates);
      } catch (error) {
        // Check if this is a write conflict and we should retry
        if (
          retries < maxRetries - 1 &&
          error instanceof Error &&
          (error.message.includes("write conflict") ||
            error.message.includes("conflict"))
        ) {
          retries++;
          // Exponential backoff: 10ms, 20ms, 40ms
          await new Promise(resolve =>
            setTimeout(resolve, 10 * Math.pow(2, retries - 1))
          );
          continue;
        }
        throw error;
      }
    }
  },
});

export const setBranch = mutation({
  args: {
    messageId: v.id("messages"),
    parentId: v.optional(v.id("messages")),
  },
  handler: async (ctx, args) => {
    // Set all siblings to non-main branch
    if (args.parentId) {
      const siblings = await ctx.db
        .query("messages")
        .withIndex("by_parent", q => q.eq("parentId", args.parentId))
        .collect();

      for (const sibling of siblings) {
        await ctx.db.patch(sibling._id, { isMainBranch: false });
      }
    }

    // Set this message as main branch
    return await ctx.db.patch(args.messageId, { isMainBranch: true });
  },
});

export const remove = mutation({
  args: { id: v.id("messages") },
  handler: async (ctx, args) => {
    // Get the message to check for attachments and conversation
    const message = await ctx.db.get(args.id);

    if (!message) {
      // Message already deleted
      return;
    }

    // If message has a conversation, clear streaming state
    if (message.conversationId) {
      try {
        // Clear streaming state for the conversation
        await ctx.db.patch(message.conversationId, {
          isStreaming: false,
        });
      } catch (error) {
        console.warn(
          `Failed to clear streaming state for conversation ${message.conversationId}:`,
          error
        );
      }
    }

    // Clean up any attached files from storage
    if (message.attachments) {
      for (const attachment of message.attachments) {
        if (attachment.storageId) {
          try {
            await ctx.storage.delete(attachment.storageId);
          } catch (error) {
            console.warn(
              `Failed to delete file ${attachment.storageId}:`,
              error
            );
          }
        }
      }
    }

    return await ctx.db.delete(args.id);
  },
});

export const removeMultiple = mutation({
  args: { ids: v.array(v.id("messages")) },
  handler: async (ctx, args) => {
    // Get all messages to check for attachments and conversations
    const messages = await Promise.all(args.ids.map(id => ctx.db.get(id)));

    // Collect unique conversation IDs
    const conversationIds = new Set<Id<"conversations">>();

    // Clean up any attached files from storage
    for (const message of messages) {
      if (message) {
        if (message.conversationId) {
          conversationIds.add(message.conversationId);
        }

        if (message.attachments) {
          for (const attachment of message.attachments) {
            if (attachment.storageId) {
              try {
                await ctx.storage.delete(attachment.storageId);
              } catch (error) {
                console.warn(
                  `Failed to delete file ${attachment.storageId}:`,
                  error
                );
              }
            }
          }
        }
      }
    }

    // Clear streaming state for affected conversations
    for (const conversationId of conversationIds) {
      try {
        await ctx.db.patch(conversationId, {
          isStreaming: false,
        });
      } catch (error) {
        console.warn(
          `Failed to clear streaming state for conversation ${conversationId}:`,
          error
        );
      }
    }

    const deletionPromises = args.ids.map(id =>
      ctx.db.delete(id).catch(error => {
        console.warn(`Failed to delete message ${id}:`, error);
      })
    );
    await Promise.all(deletionPromises);
  },
});

export const getById = query({
  args: { id: v.id("messages") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getAllInConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", q =>
        q.eq("conversationId", args.conversationId)
      )
      .order("asc")
      .collect();

    // Resolve URLs for attachments with storageId
    return await Promise.all(
      messages.map(async message => {
        if (message.attachments) {
          const resolvedAttachments = await Promise.all(
            message.attachments.map(async attachment => {
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
          return {
            ...message,
            attachments: resolvedAttachments,
          };
        }
        return message;
      })
    );
  },
});

export const internalAtomicUpdate = internalMutation({
  args: {
    id: v.id("messages"),
    content: v.optional(v.string()),
    reasoning: v.optional(v.string()),
    appendContent: v.optional(v.string()),
    appendReasoning: v.optional(v.string()),
    citations: v.optional(v.array(webCitationSchema)),
    metadata: v.optional(messageMetadataSchema),
  },
  handler: async (ctx, args) => {
    const { id, appendContent, appendReasoning, ...updates } = args;

    // Use a retry loop with exponential backoff for write conflicts
    let retries = 0;
    const maxRetries = 5; // More retries for atomic updates during streaming

    while (retries <= maxRetries) {
      try {
        // For append operations, we need to be extra careful about concurrent modifications
        if (appendContent || appendReasoning) {
          // Use a transaction-like approach: read and update in one go
          const message = await ctx.db.get(id);
          if (!message) {
            throw new Error(`Message with id ${id} not found`);
          }

          const updatesWithAppend = { ...updates };
          if (appendContent) {
            updatesWithAppend.content = (message.content || "") + appendContent;
          }
          if (appendReasoning) {
            updatesWithAppend.reasoning =
              (message.reasoning || "") + appendReasoning;
          }

          return await ctx.db.patch(id, updatesWithAppend);
        }
        // For non-append operations, just do a simple patch
        return await ctx.db.patch(id, updates);
      } catch (error) {
        // Check if this is a write conflict and we should retry
        if (
          retries < maxRetries &&
          error instanceof Error &&
          (error.message.includes(
            "changed while this mutation was being run"
          ) ||
            error.message.includes("write conflict") ||
            error.message.includes("conflict"))
        ) {
          retries++;
          // Exponential backoff: 10ms, 20ms, 40ms, 80ms, 160ms
          await new Promise(resolve =>
            setTimeout(resolve, 10 * Math.pow(2, retries - 1))
          );
          continue;
        }
        throw error;
      }
    }
  },
});

export const internalGetById = internalMutation({
  args: { id: v.id("messages") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const internalGetByIdQuery = internalQuery({
  args: { id: v.id("messages") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const internalGetAllInConversation = internalMutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_conversation", q =>
        q.eq("conversationId", args.conversationId)
      )
      .order("asc")
      .collect();
  },
});

// Public wrapper for migration (temporary - remove after migration)
export const runSearchResultsMigration = mutation({
  args: {},
  handler: async ctx => {
    const messages = await ctx.db.query("messages").collect();
    let migratedCount = 0;

    for (const message of messages) {
      if (message.metadata?.searchResults) {
        // Remove searchResults from metadata
        const { searchResults: _unused, ...cleanMetadata } = message.metadata;
        await ctx.db.patch(message._id, {
          metadata: cleanMetadata,
        });
        migratedCount++;
      }
    }

    return { migratedCount, totalMessages: messages.length };
  },
});
