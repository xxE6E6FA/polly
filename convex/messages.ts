import { v } from "convex/values";

import { type Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import {
  attachmentSchema,
  messageRoleSchema,
  webCitationSchema,
  messageMetadataSchema,
} from "./lib/schemas";
import { paginationOptsSchema, validatePaginationOpts } from "./lib/pagination";

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

    // Only increment totalMessageCount for user messages using atomic operation
    if (args.role === "user") {
      const conversation = await ctx.db.get(args.conversationId);
      if (conversation) {
        // Use atomic increment instead of read-modify-write
        await ctx.runMutation(internal.users.incrementTotalMessageCountAtomic, {
          userId: conversation.userId,
        });
      }
    }

    return messageId;
  },
});

export const list = query({
  args: {
    conversationId: v.id("conversations"),
    includeAlternatives: v.optional(v.boolean()),
    paginationOpts: paginationOptsSchema,
    resolveAttachments: v.optional(v.boolean()), // Only resolve when needed
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("messages")
      .withIndex("by_conversation", q =>
        q.eq("conversationId", args.conversationId)
      )
      .order("asc");

    if (!args.includeAlternatives) {
      query = query.filter(q => q.eq(q.field("isMainBranch"), true));
    }

    // Use pagination if specified for large conversations
    const validatedOpts = validatePaginationOpts(args.paginationOpts);
    const messages = validatedOpts
      ? await query.paginate(validatedOpts)
      : await query.collect();

    // Only resolve attachment URLs when explicitly requested (e.g., for display)
    if (args.resolveAttachments !== false && !args.paginationOpts) {
      // Only resolve for non-paginated results to avoid expensive operations
      return await Promise.all(
        (Array.isArray(messages) ? messages : messages.page).map(
          async message => {
            if (message.attachments) {
              const resolvedAttachments = await Promise.all(
                message.attachments.map(async attachment => {
                  if (attachment.storageId) {
                    const url = await ctx.storage.getUrl(attachment.storageId);
                    return {
                      ...attachment,
                      url: url || attachment.url,
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
          }
        )
      );
    }

    // Return messages without resolving attachment URLs for better performance
    return Array.isArray(messages) ? messages : messages;
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
    // Allow direct patch for efficient updates
    patch: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { id, patch, ...directUpdates } = args;

    // Use patch if provided, otherwise use direct updates
    const updates = patch || directUpdates;

    // Remove undefined values
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, value]) => value !== undefined)
    );

    if (Object.keys(cleanUpdates).length > 0) {
      await ctx.db.patch(id, cleanUpdates);
    }
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

      // Parallelize all sibling updates
      await Promise.all(
        siblings.map(sibling =>
          ctx.db.patch(sibling._id, { isMainBranch: false })
        )
      );
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

    // Prepare parallel operations
    const operations: Promise<void>[] = [];

    // If message has a conversation, clear streaming state
    if (message.conversationId) {
      operations.push(
        ctx.db
          .patch(message.conversationId, {
            isStreaming: false,
          })
          .catch(error => {
            console.warn(
              `Failed to clear streaming state for conversation ${message.conversationId}:`,
              error
            );
          })
      );

      // Only decrement totalMessageCount for user messages using atomic operation
      if (message.role === "user") {
        const conversation = await ctx.db.get(message.conversationId);
        if (conversation) {
          operations.push(
            ctx
              .runMutation(internal.users.decrementTotalMessageCountAtomic, {
                userId: conversation.userId,
              })
              .then(() => {})
          );
        }
      }
    }

    // Clean up any attached files from storage
    if (message.attachments) {
      for (const attachment of message.attachments) {
        if (attachment.storageId) {
          operations.push(
            ctx.storage.delete(attachment.storageId).catch(error => {
              console.warn(
                `Failed to delete file ${attachment.storageId}:`,
                error
              );
            })
          );
        }
      }
    }

    // Add message deletion
    operations.push(ctx.db.delete(args.id));

    // Execute all operations in parallel
    await Promise.all(operations);
  },
});

export const removeMultiple = mutation({
  args: { ids: v.array(v.id("messages")) },
  handler: async (ctx, args) => {
    // Get all messages to check for attachments and conversations
    const messages = await Promise.all(args.ids.map(id => ctx.db.get(id)));

    const conversationIds = new Set<Id<"conversations">>();
    const userMessageCounts = new Map<Id<"users">, number>();
    const storageDeletePromises: Promise<void>[] = [];

    for (const message of messages) {
      if (message) {
        if (message.conversationId) {
          conversationIds.add(message.conversationId);

          // Only count user messages for totalMessageCount
          if (message.role === "user") {
            const conversation = await ctx.db.get(message.conversationId);
            if (conversation) {
              const currentCount =
                userMessageCounts.get(conversation.userId) || 0;
              userMessageCounts.set(conversation.userId, currentCount + 1);
            }
          }
        }

        if (message.attachments) {
          for (const attachment of message.attachments) {
            if (attachment.storageId) {
              storageDeletePromises.push(
                ctx.storage.delete(attachment.storageId).catch(error => {
                  console.warn(
                    `Failed to delete file ${attachment.storageId}:`,
                    error
                  );
                })
              );
            }
          }
        }
      }
    }

    // Parallelize all operations
    const operations: Promise<void>[] = [];

    // Add conversation streaming state updates
    for (const conversationId of conversationIds) {
      operations.push(
        ctx.db
          .patch(conversationId, {
            isStreaming: false,
          })
          .catch(error => {
            console.warn(
              `Failed to clear streaming state for conversation ${conversationId}:`,
              error
            );
          })
      );
    }

    // Add user message count decrements using atomic operations
    for (const [userId, messageCount] of userMessageCounts) {
      operations.push(
        ctx
          .runMutation(internal.users.decrementTotalMessageCountAtomic, {
            userId,
            decrement: messageCount,
          })
          .then(() => {})
      );
    }

    // Add message deletions
    operations.push(
      ...args.ids.map(id =>
        ctx.db.delete(id).catch(error => {
          console.warn(`Failed to delete message ${id}:`, error);
        })
      )
    );

    // Add storage deletions
    operations.push(...storageDeletePromises);

    // Execute all operations in parallel
    await Promise.all(operations);
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

    // Optimize: Use single atomic operation for appends to minimize read/write cycles
    if (appendContent || appendReasoning) {
      // Get current message once
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

      // Single patch operation - no retry loop needed for most cases
      try {
        return await ctx.db.patch(id, updatesWithAppend);
      } catch (error) {
        // Only retry once for genuine conflicts
        if (
          error instanceof Error &&
          error.message.includes("changed while this mutation was being run")
        ) {
          // Brief delay and single retry
          await new Promise(resolve => setTimeout(resolve, 5));
          const retryMessage = await ctx.db.get(id);
          if (!retryMessage) {
            throw new Error(`Message with id ${id} not found on retry`);
          }

          const retryUpdates = { ...updates };
          if (appendContent) {
            retryUpdates.content = (retryMessage.content || "") + appendContent;
          }
          if (appendReasoning) {
            retryUpdates.reasoning =
              (retryMessage.reasoning || "") + appendReasoning;
          }

          return await ctx.db.patch(id, retryUpdates);
        }
        throw error;
      }
    }

    // For non-append operations, direct patch (most common case)
    return await ctx.db.patch(id, updates);
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

export const hasStreamingMessage = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    // Find any assistant message without a finish reason
    const streamingMessage = await ctx.db
      .query("messages")
      .withIndex("by_conversation", q =>
        q.eq("conversationId", args.conversationId)
      )
      .filter(q =>
        q.and(
          q.eq(q.field("role"), "assistant"),
          q.eq(q.field("metadata.finishReason"), undefined)
        )
      )
      .first();

    return {
      hasStreaming: Boolean(streamingMessage),
      streamingMessageId: streamingMessage?._id || null,
    };
  },
});
