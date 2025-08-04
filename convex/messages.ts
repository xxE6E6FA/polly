import { ConvexError, v } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { withRetry } from "./ai/error_handlers";

import {
  checkConversationAccess,
  incrementUserMessageStats,
} from "./lib/conversation_utils";
import { paginationOptsSchema, validatePaginationOpts } from "./lib/pagination";
import {
  attachmentSchema,
  extendedMessageMetadataSchema,
  messageStatusSchema,
  reasoningConfigSchema,
  webCitationSchema,
} from "./lib/schemas";

export const create = mutation({
  args: {
    conversationId: v.id("conversations"),
    role: v.string(),
    content: v.string(),
    status: v.optional(messageStatusSchema),
    model: v.optional(v.string()),
    provider: v.optional(v.string()),
    reasoningConfig: v.optional(reasoningConfigSchema),
    parentId: v.optional(v.id("messages")),
    isMainBranch: v.optional(v.boolean()),
    reasoning: v.optional(v.string()),
    sourceConversationId: v.optional(v.id("conversations")),
    useWebSearch: v.optional(v.boolean()),
    attachments: v.optional(v.array(attachmentSchema)),
    metadata: v.optional(extendedMessageMetadataSchema),
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
        // Only increment stats if model and provider are provided
        if (args.model && args.provider) {
          // Check if this is a built-in model
          const model = await ctx.runQuery(api.userModels.getModelByID, {
            modelId: args.model,
            provider: args.provider,
          });
          await incrementUserMessageStats(ctx, model?.free === true);
        }
      }
    }

    return messageId;
  },
});

export const createUserMessageBatched = mutation({
  args: {
    conversationId: v.id("conversations"),
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
    metadata: v.optional(extendedMessageMetadataSchema),
  },
  handler: async (ctx, args) => {
    const messageId = await ctx.db.insert("messages", {
      ...args,
      role: "user",
      isMainBranch: args.isMainBranch ?? true,
      createdAt: Date.now(),
    });

    // Check if this is a built-in model
    if (args.model && args.provider) {
      const model = await ctx.runQuery(api.userModels.getModelByID, {
        modelId: args.model,
        provider: args.provider,
      });
      await incrementUserMessageStats(ctx, model?.free === true);
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
      : await query.take(500); // Limit unbounded queries to 500 messages

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
    const message = await ctx.db.get(args.id);
    if (!message) {
      throw new Error("Message not found");
    }

    // Check access to the conversation this message belongs to (no shared access for mutations)
    const { hasAccess } = await checkConversationAccess(
      ctx,
      message.conversationId,
      false
    );
    if (!hasAccess) {
      throw new Error("Access denied");
    }

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
    metadata: v.optional(extendedMessageMetadataSchema),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;

    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
      try {
        // Check if message exists before patching
        const message = await ctx.db.get(id);
        if (!message) {
          console.log(
            "[internalUpdate] Message not found, id:",
            id,
            "- likely already finalized or deleted"
          );
          return; // Return silently instead of throwing
        }
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

// Internal mutation to update message content and completion metadata
export const updateContent = internalMutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
    reasoning: v.optional(v.string()),
    finishReason: v.optional(v.string()),
    usage: v.optional(
      v.object({
        promptTokens: v.number(),
        completionTokens: v.number(),
        totalTokens: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const { messageId, usage, finishReason, ...updates } = args;

    // Check if message exists before patching
    const message = await ctx.db.get(messageId);
    if (!message) {
      console.log(
        "[updateContent] Message not found, messageId:",
        messageId,
        "- likely already finalized or deleted"
      );
      return; // Return silently instead of throwing
    }

    // Build the update object
    const updateData = {
      ...updates,
      completedAt: Date.now(),
      ...(usage &&
        finishReason && {
          metadata: {
            finishReason,
            usage,
          },
        }),
    };

    await ctx.db.patch(messageId, updateData);
  },
});

export const setBranch = mutation({
  args: {
    messageId: v.id("messages"),
    parentId: v.optional(v.id("messages")),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found");
    }

    // Check access to the conversation this message belongs to (no shared access for mutations)
    const { hasAccess } = await checkConversationAccess(
      ctx,
      message.conversationId,
      false
    );
    if (!hasAccess) {
      throw new Error("Access denied");
    }

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

    // Check access to the conversation this message belongs to (no shared access for mutations)
    const { hasAccess } = await checkConversationAccess(
      ctx,
      message.conversationId,
      false
    );
    if (!hasAccess) {
      throw new Error("Access denied");
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
          const user = await ctx.db.get(conversation.userId);
          if (user) {
            operations.push(
              ctx.db.patch(conversation.userId, {
                totalMessageCount: Math.max(
                  0,
                  (user.totalMessageCount || 0) - 1
                ),
              })
            );
          }
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

    // Check access for all messages before proceeding
    for (const message of messages) {
      if (message) {
        const { hasAccess } = await checkConversationAccess(
          ctx,
          message.conversationId,
          false
        );
        if (!hasAccess) {
          throw new Error("Access denied to one or more messages");
        }
      }
    }

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
              const user = await ctx.db.get(conversation.userId);
              if (user && "totalMessageCount" in user) {
                const currentCount =
                  userMessageCounts.get(conversation.userId) || 0;
                userMessageCounts.set(conversation.userId, currentCount + 1);
              }
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
        (async () => {
          const user = await ctx.db.get(userId);
          if (user && "totalMessageCount" in user) {
            await ctx.db.patch(userId, {
              totalMessageCount: Math.max(
                0,
                (user.totalMessageCount || 0) - messageCount
              ),
            });
          }
        })()
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
    const message = await ctx.db.get(args.id);
    if (!message) {
      return null;
    }

    // Check access to the conversation this message belongs to
    const { hasAccess } = await checkConversationAccess(
      ctx,
      message.conversationId,
      true
    );
    if (!hasAccess) {
      return null;
    }

    return message;
  },
});

export const getAllInConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    // Check access to the conversation
    const { hasAccess } = await checkConversationAccess(
      ctx,
      args.conversationId,
      true
    );
    if (!hasAccess) {
      return [];
    }

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
    metadata: v.optional(extendedMessageMetadataSchema),
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

export const getLastUsedModel = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    // Get the most recent assistant message with model info
    const lastAssistantMessage = await ctx.db
      .query("messages")
      .withIndex("by_conversation_role", q =>
        q.eq("conversationId", args.conversationId).eq("role", "assistant")
      )
      .order("desc")
      .filter(q =>
        q.and(
          q.neq(q.field("model"), undefined),
          q.neq(q.field("provider"), undefined)
        )
      )
      .first();

    if (lastAssistantMessage?.model && lastAssistantMessage?.provider) {
      return {
        modelId: lastAssistantMessage.model,
        provider: lastAssistantMessage.provider,
      };
    }

    return null;
  },
});

// Production-grade mutations for message status management
export const updateMessageStatus = internalMutation({
  args: {
    messageId: v.id("messages"),
    status: messageStatusSchema,
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      status: args.status,
    });
  },
});

export const updateAssistantContent = internalMutation({
  args: {
    messageId: v.id("messages"),
    content: v.optional(v.string()),
    appendContent: v.optional(v.string()),
    status: v.optional(messageStatusSchema),
    reasoning: v.optional(v.string()),
    appendReasoning: v.optional(v.string()),
    citations: v.optional(v.array(webCitationSchema)),
    metadata: v.optional(extendedMessageMetadataSchema),
  },
  handler: async (ctx, args) => {
    const { messageId, appendContent, appendReasoning, ...updates } = args;

    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, value]) => value !== undefined)
    );

    // Never overwrite "done" status - once a message is done, it stays done
    let finalUpdates = filteredUpdates;
    if (args.status && args.status !== "done") {
      const currentMessage = await ctx.db.get(messageId);
      if (currentMessage?.status === "done") {
        // Don't overwrite "done" status with any other status
        const { status: _, ...updatesWithoutStatus } = filteredUpdates;
        finalUpdates = updatesWithoutStatus;
      }
    }

    if (!(appendContent || appendReasoning)) {
      if (Object.keys(finalUpdates).length === 0) {
        return;
      }
      return await ctx.db.patch(messageId, finalUpdates);
    }

    return await withRetry(
      async () => {
        const message = await ctx.db.get(messageId);
        if (!message) {
          console.log(
            "[updateAssistantContent] Message not found, messageId:",
            messageId,
            "- likely already finalized or deleted"
          );
          // Don't throw error, just return silently as the message might have been finalized
          return;
        }

        const appendUpdates = { ...finalUpdates };

        // Never overwrite "done" status in append operations either
        let finalAppendUpdates = appendUpdates;
        if (
          args.status &&
          args.status !== "done" &&
          message.status === "done"
        ) {
          const { status: _, ...updatesWithoutStatus } = appendUpdates;
          finalAppendUpdates = updatesWithoutStatus;
        }

        if (appendContent) {
          finalAppendUpdates.content = (message.content || "") + appendContent;
        }
        if (appendReasoning) {
          finalAppendUpdates.reasoning =
            (message.reasoning || "") + appendReasoning;
        }

        return await ctx.db.patch(messageId, finalAppendUpdates);
      },
      2,
      10
    );
  },
});

export const updateAssistantStatus = internalMutation({
  args: {
    messageId: v.id("messages"),
    status: messageStatusSchema,
    statusText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { messageId, status, statusText } = args;

    try {
      // Update the message status and statusText in database
      await ctx.db.patch(messageId, {
        status,
        statusText,
      });
    } catch (error) {
      console.error(
        "[updateAssistantStatus] Message not found, messageId:",
        messageId,
        error
      );
      throw new ConvexError(
        `Message with id ${messageId} not found: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
});

// Re-export streamResponse from ai/messages for internal API access
export { streamResponse } from "./ai/messages";
