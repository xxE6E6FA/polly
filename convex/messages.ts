import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { withRetry } from "./ai/error_handlers";
import { paginationOptsSchema, validatePaginationOpts } from "./lib/pagination";
import {
  attachmentSchema,
  messageMetadataSchema,
  messageRoleSchema,
  reasoningConfigSchema,
  webCitationSchema,
} from "./lib/schemas";

export const create = mutation({
  args: {
    conversationId: v.id("conversations"),
    role: messageRoleSchema,
    content: v.string(),
    model: v.optional(v.string()),
    provider: v.optional(v.string()),
    reasoningConfig: v.optional(reasoningConfigSchema),
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

    if (args.role === "user") {
      const conversation = await ctx.db.get(args.conversationId);
      if (conversation) {
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
      // Use optimized compound index for main branch messages
      query = ctx.db
        .query("messages")
        .withIndex("by_conversation_main_branch", q =>
          q.eq("conversationId", args.conversationId).eq("isMainBranch", true)
        )
        .order("asc");
    }

    const validatedOpts = validatePaginationOpts(args.paginationOpts);
    const messages = validatedOpts
      ? await query.paginate(validatedOpts)
      : await query.collect();

    if (args.resolveAttachments !== false && !args.paginationOpts) {
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
    patch: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { id, patch, ...directUpdates } = args;

    const updates = patch || directUpdates;

    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, value]) => value !== undefined)
    );

    if (Object.keys(cleanUpdates).length > 0) {
      await ctx.db.patch(id, cleanUpdates);
    }
  },
});

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

    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
      try {
        return await ctx.db.patch(id, updates);
      } catch (error) {
        if (
          retries < maxRetries - 1 &&
          error instanceof Error &&
          (error.message.includes("write conflict") ||
            error.message.includes("conflict"))
        ) {
          retries++;
          await new Promise(resolve =>
            setTimeout(resolve, 10 * 2 ** (retries - 1))
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
    if (args.parentId) {
      const siblings = await ctx.db
        .query("messages")
        .withIndex("by_parent", q => q.eq("parentId", args.parentId))
        .collect();

      await Promise.all(
        siblings.map(sibling =>
          ctx.db.patch(sibling._id, { isMainBranch: false })
        )
      );
    }

    return await ctx.db.patch(args.messageId, { isMainBranch: true });
  },
});

export const remove = mutation({
  args: { id: v.id("messages") },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.id);

    if (!message) {
      return;
    }

    const operations: Promise<void>[] = [];

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

      if (message.role === "user") {
        const conversation = await ctx.db.get(message.conversationId);
        if (conversation) {
          operations.push(
            ctx
              .runMutation(internal.users.decrementTotalMessageCountAtomic, {
                userId: conversation.userId,
              })
              .then(() => {
                // Fire-and-forget background job
              })
          );
        }
      }
    }

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

    operations.push(ctx.db.delete(args.id));

    await Promise.all(operations);
  },
});

export const removeMultiple = mutation({
  args: { ids: v.array(v.id("messages")) },
  handler: async (ctx, args) => {
    const messages = await Promise.all(args.ids.map(id => ctx.db.get(id)));

    const conversationIds = new Set<Id<"conversations">>();
    const userMessageCounts = new Map<Id<"users">, number>();
    const storageDeletePromises: Promise<void>[] = [];

    for (const message of messages) {
      if (message) {
        if (message.conversationId) {
          conversationIds.add(message.conversationId);

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

    const operations: Promise<void>[] = [];

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

    for (const [userId, messageCount] of userMessageCounts) {
      operations.push(
        ctx
          .runMutation(internal.users.decrementTotalMessageCountAtomic, {
            userId,
            decrement: messageCount,
          })
          .then(() => {
            // Fire-and-forget background job
          })
      );
    }

    operations.push(
      ...args.ids.map(id =>
        ctx.db.delete(id).catch(error => {
          console.warn(`Failed to delete message ${id}:`, error);
        })
      )
    );

    operations.push(...storageDeletePromises);

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

    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, value]) => value !== undefined)
    );

    if (!(appendContent || appendReasoning)) {
      if (Object.keys(filteredUpdates).length === 0) {
        return;
      }
      return await ctx.db.patch(id, filteredUpdates);
    }

    return await withRetry(
      async () => {
        const message = await ctx.db.get(id);
        if (!message) {
          throw new Error(`Message with id ${id} not found`);
        }

        const appendUpdates = { ...filteredUpdates };

        if (appendContent) {
          appendUpdates.content = (message.content || "") + appendContent;
        }
        if (appendReasoning) {
          appendUpdates.reasoning = (message.reasoning || "") + appendReasoning;
        }

        return await ctx.db.patch(id, appendUpdates);
      },
      2,
      10
    );
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

export const hasStreamingMessage = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const streamingMessage = await ctx.db
      .query("messages")
      .withIndex("by_conversation_streaming", q =>
        q
          .eq("conversationId", args.conversationId)
          .eq("role", "assistant")
          .eq("metadata.finishReason", undefined)
      )
      .first();

    return {
      hasStreaming: Boolean(streamingMessage),
      streamingMessageId: streamingMessage?._id || null,
    };
  },
});
