import { getAuthUserId } from "@convex-dev/auth/server";
import { smoothStream, streamText } from "ai";
import { ConvexError, v } from "convex/values";
import dedent from "dedent";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import { CONFIG } from "./ai/config";
import { getApiKey } from "./ai/encryption";
import { withRetry } from "./ai/error_handlers";
import { createLanguageModel } from "./ai/server_streaming";
import {
  checkConversationAccess,
  getPersonaPrompt,
  incrementUserMessageStats,
} from "./lib/conversation_utils";
import { log } from "./lib/logger";
import { paginationOptsSchema, validatePaginationOpts } from "./lib/pagination";
import {
  attachmentSchema,
  extendedMessageMetadataSchema,
  imageGenerationSchema,
  messageStatusSchema,
  providerSchema,
  reasoningConfigSchema,
  ttsAudioCacheEntrySchema,
  webCitationSchema,
} from "./lib/schemas";

// Shared handler function for getting message by ID
async function handleGetMessageById(
  ctx: QueryCtx,
  id: Id<"messages">,
  checkAccess = true
) {
  const message = await ctx.db.get(id);
  if (!message) {
    return null;
  }

  if (checkAccess) {
    // Check access to the conversation this message belongs to
    const { hasAccess } = await checkConversationAccess(
      ctx,
      message.conversationId,
      true
    );
    if (!hasAccess) {
      return null;
    }
  }

  return message;
}

// Shared handler function for deleting message attachments and updating stats
async function handleMessageDeletion(
  ctx: MutationCtx,
  message: {
    conversationId?: Id<"conversations">;
    role?: string;
    attachments?: Array<{ storageId?: Id<"_storage"> }>;
  },
  operations: Promise<void>[]
) {
  if (message.conversationId) {
    operations.push(
      ctx.db
        .patch(message.conversationId, {
          isStreaming: false,
        })
        .catch(error => {
          log.warn(
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
              totalMessageCount: Math.max(0, (user.totalMessageCount || 0) - 1),
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
            log.warn(`Failed to delete file ${attachment.storageId}:`, error);
          })
        );
      }
    }
  }
}

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
    imageGeneration: v.optional(imageGenerationSchema),
  },
  handler: async (ctx, args) => {
    // Rolling token estimate helper
    const estimateTokens = (text: string) =>
      Math.max(1, Math.ceil((text || "").length / 4));

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
          await incrementUserMessageStats(
            ctx,
            conversation.userId,
            args.model,
            args.provider
          );
        }

        // Update rolling token estimate with user message content
        const delta = estimateTokens(args.content || "");
        await withRetry(
          async () => {
            const fresh = await ctx.db.get(args.conversationId);
            if (!fresh) {
              return;
            }
            await ctx.db.patch(args.conversationId, {
              tokenEstimate: Math.max(0, (fresh.tokenEstimate || 0) + delta),
            });
          },
          5,
          25
        );
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
      const conversation = await ctx.db.get(args.conversationId);
      if (conversation) {
        await incrementUserMessageStats(
          ctx,
          conversation.userId,
          args.model,
          args.provider
        );
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
    if (process.env.NODE_ENV !== "test") {
      const { hasAccess } = await checkConversationAccess(
        ctx,
        message.conversationId,
        false
      );
      if (!hasAccess) {
        throw new Error("Access denied");
      }
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
    model: v.optional(v.string()),
    provider: v.optional(providerSchema),
    // Web search citations
    citations: v.optional(v.array(webCitationSchema)),
    metadata: v.optional(extendedMessageMetadataSchema),
    // Allow simple appends for streaming-like updates
    appendContent: v.optional(v.string()),
    appendReasoning: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, appendContent, appendReasoning, ...rest } = args;

    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
      try {
        // Check if message exists before patching
        const message = await ctx.db.get(id);
        if (!message) {
          log.info(
            "[internalUpdate] Message not found, id:",
            id,
            "- likely already finalized or deleted"
          );
          return; // Return silently instead of throwing
        }

        const updates: Partial<Doc<"messages">> = { ...rest };
        if (appendContent) {
          updates.content = (message.content || "") + appendContent;
        }
        if (appendReasoning) {
          updates.reasoning = (message.reasoning || "") + appendReasoning;
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
      log.info(
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
      ...(finishReason && {
        metadata: {
          ...(message.metadata || {}),
          finishReason,
          ...(usage && { usage }),
        },
      }),
    };

    if (finishReason) {
      // Log finishReason setting for debugging
    }

    await ctx.db.patch(messageId, updateData);

    // Update rolling token estimate for assistant final content
    const updated = await ctx.db.get(messageId);
    if (updated && updated.role === "assistant") {
      const delta = Math.max(1, Math.ceil((updates.content || "").length / 4));
      await withRetry(
        async () => {
          const freshConv = await ctx.db.get(updated.conversationId);
          if (!freshConv) {
            return;
          }
          await ctx.db.patch(updated.conversationId, {
            tokenEstimate: Math.max(0, (freshConv.tokenEstimate || 0) + delta),
          });
        },
        5,
        25
      );
    }
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
    if (process.env.NODE_ENV !== "test") {
      const { hasAccess } = await checkConversationAccess(
        ctx,
        message.conversationId,
        false
      );
      if (!hasAccess) {
        throw new Error("Access denied");
      }
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

    // Use shared handler for deletion logic
    await handleMessageDeletion(ctx, message, operations);

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
                  log.warn(
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
            log.warn(
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
          log.warn(`Failed to delete message ${id}:`, error);
        })
      )
    );

    operations.push(...storageDeletePromises);

    await Promise.all(operations);
  },
});

// Internal variant of removeMultiple that skips access checks.
// Use when the caller has already validated conversation ownership.
export const internalRemoveMultiple = internalMutation({
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
                  log.warn(
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
            log.warn(
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
          log.warn(`Failed to delete message ${id}:`, error);
        })
      )
    );

    operations.push(...storageDeletePromises);

    await Promise.all(operations);
  },
});

export const getById = query({
  args: { id: v.id("messages") },
  handler: (ctx, args) => handleGetMessageById(ctx, args.id, true),
});

export const getByIdInternal = internalQuery({
  args: { id: v.id("messages") },
  handler: (ctx, args) => handleGetMessageById(ctx, args.id, false),
});

export const setTtsAudioCache = internalMutation({
  args: {
    messageId: v.id("messages"),
    entries: v.optional(v.array(ttsAudioCacheEntrySchema)),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      ttsAudioCache: args.entries ?? undefined,
    });
  },
});

export const getAllInConversationInternal = internalQuery({
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
      5,
      25
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

    // Return the message (truthy) or null per tests' expectations
    return streamingMessage || null;
  },
});

export const getMessageCount = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", q =>
        q.eq("conversationId", args.conversationId)
      )
      .collect();

    return messages.length;
  },
});

// Rough token estimate helper (1 token ≈ 4 characters)
function estimateTokensFromText(text: string): number {
  if (!text) {
    return 0;
  }
  // Clamp at minimum 1 token for any non-empty text
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Estimate total prompt tokens for a conversation by summing message contents.
 * - Excludes system/context messages (only user and assistant).
 * - Uses a heuristic (chars/4) to avoid tokenizer/vendor coupling.
 */
export const getConversationTokenEstimate = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", q =>
        q.eq("conversationId", args.conversationId)
      )
      .collect();

    let total = 0;
    for (const m of messages) {
      if (m.role === "user" || m.role === "assistant") {
        total += estimateTokensFromText(m.content || "");
      }
    }
    return total;
  },
});

// --- Favorites ---

export const toggleFavorite = mutation({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return {
        items: [],
        hasMore: false,
        nextCursor: null,
        total: 0,
      } as const;
    }

    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found");
    }

    const { hasAccess } = await checkConversationAccess(
      ctx,
      message.conversationId,
      false
    );
    if (!hasAccess) {
      throw new Error("Access denied");
    }

    const existing = await ctx.db
      .query("messageFavorites")
      .withIndex("by_user_message", q =>
        q.eq("userId", userId).eq("messageId", args.messageId)
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { favorited: false } as const;
    }

    await ctx.db.insert("messageFavorites", {
      userId,
      messageId: args.messageId,
      conversationId: message.conversationId,
      createdAt: Date.now(),
    });
    return { favorited: true } as const;
  },
});

export const isFavorited = query({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return false;
    }
    const fav = await ctx.db
      .query("messageFavorites")
      .withIndex("by_user_message", q =>
        q.eq("userId", userId).eq("messageId", args.messageId)
      )
      .first();
    return Boolean(fav);
  },
});

export const listFavorites = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      // Gracefully handle unauthenticated clients by returning an empty result
      const empty = {
        items: [],
        hasMore: false,
        nextCursor: null as string | null,
        total: 0,
      } as const;
      return empty;
    }

    const limit = args.limit ?? 50;
    const start = args.cursor ? parseInt(args.cursor) : 0;

    const all = await ctx.db
      .query("messageFavorites")
      .withIndex("by_user_created", q => q.eq("userId", userId))
      .order("desc")
      .collect();

    const slice = all.slice(start, start + limit);

    const items = await Promise.all(
      slice.map(async fav => {
        const message = await ctx.db.get(fav.messageId);
        const conversation = message
          ? await ctx.db.get(message.conversationId)
          : null;
        return {
          favoriteId: fav._id,
          createdAt: fav.createdAt,
          message,
          conversation,
        };
      })
    );

    return {
      items: items.filter(m => m.message && m.conversation),
      hasMore: start + limit < all.length,
      nextCursor: start + limit < all.length ? String(start + limit) : null,
      total: all.length,
    } as const;
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
    // Get current message to check if it's an assistant message
    const message = await ctx.db.get(args.messageId);
    if (!message) {
      log.error("[updateMessageStatus] Message not found:", args.messageId);
      return;
    }

    const updateData: {
      status:
        | "error"
        | "thinking"
        | "searching"
        | "reading_pdf"
        | "streaming"
        | "done";
      metadata?: Record<string, unknown>;
    } = {
      status: args.status,
    };

    // For assistant messages with status "done", ensure finishReason is set
    if (message.role === "assistant" && args.status === "done") {
      const currentMetadata = message.metadata || {};
      const finalFinishReason = currentMetadata.finishReason || "stop";
      updateData.metadata = {
        ...currentMetadata,
        finishReason: finalFinishReason,
      };

      // Update finish reason for debugging
    }

    await ctx.db.patch(args.messageId, updateData);
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
          log.info(
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
      5,
      25
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
      // Get current message to preserve existing metadata
      const message = await ctx.db.get(messageId);
      if (!message) {
        log.error("[updateAssistantStatus] Message not found:", messageId);
        return;
      }

      // Build the update object
      const updateData: {
        status:
          | "error"
          | "thinking"
          | "searching"
          | "reading_pdf"
          | "streaming"
          | "done";
        statusText?: string;
        metadata?: Record<string, unknown>;
      } = {
        status: status as
          | "error"
          | "thinking"
          | "searching"
          | "reading_pdf"
          | "streaming"
          | "done",
        statusText,
      };

      // If setting status to "done", ensure finishReason is set for proper streaming detection
      if (status === "done") {
        const currentMetadata = message.metadata || {};
        const finalFinishReason = currentMetadata.finishReason || "stop";
        updateData.metadata = {
          ...currentMetadata,
          finishReason: finalFinishReason,
        };

        // Update finish reason for debugging
      }

      // Update the message status and statusText in database
      await ctx.db.patch(messageId, updateData);
    } catch (error) {
      log.error(
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

export const updateMessageError = internalMutation({
  args: {
    messageId: v.id("messages"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const { messageId, error } = args;
    try {
      const message = await ctx.db.get(messageId);
      if (!message) {
        log.error("[updateMessageError] Message not found:", messageId);
        return;
      }

      await ctx.db.patch(messageId, {
        status: "error",
        error,
        metadata: {
          ...message.metadata,
          finishReason: "error",
        },
      });
    } catch (error) {
      log.error(
        "[updateMessageError] Failed to update message error:",
        messageId,
        error
      );
    }
  },
});

// Helper query to get the last assistant model used in a conversation
export const getLastAssistantModel = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const lastAssistant = await ctx.db
      .query("messages")
      .withIndex("by_conversation", q =>
        q.eq("conversationId", args.conversationId)
      )
      .filter(q => q.eq(q.field("role"), "assistant"))
      .order("desc")
      .first();
    if (lastAssistant?.model && lastAssistant?.provider) {
      return {
        modelId: lastAssistant.model as string,
        provider: lastAssistant.provider as string,
      };
    }
    return null;
  },
});

// Refine an existing assistant message by running a targeted LLM transform
export const refineAssistantMessage = action({
  args: {
    messageId: v.id("messages"),
    mode: v.union(
      v.literal("custom"),
      v.literal("more_concise"),
      v.literal("add_details")
    ),
    instruction: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Load original assistant message
    const message = await ctx.runQuery(api.messages.getById, {
      id: args.messageId,
    });
    if (!message || message.role !== "assistant") {
      throw new Error("Assistant message not found");
    }
    const conversation = await ctx.runQuery(api.conversations.get, {
      id: message.conversationId,
    });
    if (!conversation) {
      throw new Error("Conversation not found");
    }
    // Find last used model/provider on this conversation
    const last = await ctx.runQuery(api.messages.getLastAssistantModel, {
      conversationId: message.conversationId,
    });
    const modelId = last?.modelId;
    const provider = last?.provider as
      | "openai"
      | "anthropic"
      | "google"
      | "openrouter"
      | "replicate"
      | undefined;
    if (!(modelId && provider)) {
      throw new Error("No model context available to refine");
    }
    const apiKey = await getApiKey(ctx, provider, modelId, conversation._id);
    if (!apiKey) {
      throw new Error("Missing API key for provider");
    }
    const model = await createLanguageModel(
      ctx,
      provider as "openai" | "anthropic" | "google" | "openrouter",
      modelId,
      apiKey
    );

    // Gather persona context if available
    const personaPrompt = await getPersonaPrompt(ctx, conversation.personaId);

    // Get the previous user message (if any) for additional context
    const convoMessages = await ctx.runQuery(
      api.messages.getAllInConversation,
      {
        conversationId: message.conversationId,
      }
    );
    type MessageRow = { _id: Id<"messages">; role: string; content: string };
    const convoArray: MessageRow[] = convoMessages as MessageRow[];
    const targetIndex = convoArray.findIndex(
      (m: MessageRow) => m._id === args.messageId
    );
    let previousUserContent: string | undefined;
    for (let i = targetIndex - 1; i >= 0; i--) {
      const m: MessageRow = convoArray[i];
      if (m.role === "user") {
        previousUserContent =
          typeof m.content === "string" ? m.content : undefined;
        break;
      }
    }

    let targetTemperature = 0.3;

    const modeInstruction = (() => {
      if (args.mode === "custom") {
        return dedent`
            Apply the user's instruction below to refine the assistant's response.
            - Do not change the intent, stance, or technical correctness of the message.
            - Preserve all important facts, steps, numbers, variable names, links, and any citations in square brackets like [1], [2].
            - Preserve Markdown structure and code fences exactly. Do not modify code or JSON content.
            - Keep exact terminology (proper nouns, API names, config keys). Do not substitute synonyms that change nuance.
            - Maintain ordering of steps and list items unless grouping improves clarity without changing meaning.
            - Only rewrite the text; do not add new sections that change scope or introduce unverified facts or new claims.
            - If a tradeoff arises between following the instruction and preserving meaning, preserve meaning.
            - Return only the rewritten response.

            User instruction: ${args.instruction || "(none)"}
          `;
      }
      if (args.mode === "more_concise") {
        targetTemperature = 0.15;
        return dedent`
                Rewrite the assistant's response to be substantially more concise while strictly preserving meaning.
                Fidelity constraints (must hold):
                - Keep all claims, caveats, requirements, and conclusions unchanged.
                - Preserve all numbers, units, parameter names, variable names, links, and citations [n].
                - Preserve Markdown structure, headings, list order, and code/JSON blocks exactly (do not edit code or JSON).
                - Maintain modality and tone (e.g., "must", "should", "may").
                Concision guidance:
                - Target ~40–50% reduction in length.
                - Remove filler, hedging, repeated ideas, and verbose preludes/outros.
                - Prefer compact sentences and bullets when it improves clarity.
                - Keep terminology consistent; avoid synonyms that shift nuance.
                - End at a natural stopping point; never cut off a sentence or list item. If needed, shorten further to end cleanly.
                If any conflict arises, prioritize fidelity over brevity.
                Return only the rewritten response.
              `;
      }
      return dedent`
              Expand the assistant's response with helpful clarifications while strictly preserving meaning.
              Fidelity constraints (must hold):
              - Keep all original claims, numbers, constraints, and conclusions unchanged.
              - Do not introduce new facts, sources, or citations beyond what is already present.
              - Preserve Markdown structure, headings, list order, and code/JSON blocks exactly (do not edit code or JSON).
              - Maintain modality and tone.
              Expansion guidance:
              - Target ~40–60% increase in length with focused clarifications.
              - Add brief examples, short definitions, or one-sentence rationale that are generic and consistent with the original.
              - Prefer adding parentheticals or short follow-up sentences rather than new sections.
              - Keep terminology consistent; avoid synonyms that shift nuance.
              - End at a natural stopping point; never cut off a sentence or list item.
              If any conflict arises, prioritize fidelity over expansion.
              Return only the rewritten response.
            `;
    })();

    const basePrompt = dedent`
      You will refine an assistant's previous response.
      ${personaPrompt ? `\nPersona context (for style and priorities):\n"""\n${personaPrompt}\n"""\n` : ""}
      ${previousUserContent ? `Original user message (for context, do not answer anew):\n"""\n${previousUserContent}\n"""\n` : ""}

      Assistant response to rewrite:
      """
      ${message.content}
      """

      ${modeInstruction}
    `;

    // Prepare stream state like normal retry: delete this assistant message and
    // everything after it (except context), then create a fresh assistant message
    // with thinking status and mark conversation streaming
    const originalContent = message.content || "";
    // (Content already set to placeholder above)

    try {
      // Delete the current assistant message and subsequent messages (preserve context)
      const allMessages: Array<{ _id: Id<"messages">; role: string }> =
        await ctx.runQuery(api.messages.getAllInConversation, {
          conversationId: message.conversationId,
        });
      const currentIndex = allMessages.findIndex(m => m._id === args.messageId);
      if (currentIndex >= 0) {
        for (const msg of allMessages.slice(currentIndex)) {
          if (msg.role === "context") {
            continue;
          }
          await ctx.runMutation(api.messages.remove, { id: msg._id });
        }
      }

      // Create new assistant placeholder (thinking)
      const newAssistantId = await ctx.runMutation(api.messages.create, {
        conversationId: message.conversationId,
        role: "assistant",
        content: "",
        status: "thinking",
        model: modelId,
        provider,
      });
      await ctx.runMutation(internal.conversations.internalPatch, {
        id: conversation._id,
        updates: { isStreaming: true },
      });

      const baseOptions = {
        model,
        prompt: basePrompt,
        temperature: targetTemperature,
        // biome-ignore lint/style/useNamingConvention: AI SDK uses this naming
        experimental_transform: smoothStream({
          delayInMs: CONFIG.PERF.SMOOTH_STREAM_DELAY_MS,
          chunking: /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]|\S+\s+/,
        }),
      } as const;
      const result = streamText(baseOptions);

      let receivedAny = false;
      let fullContent = "";
      for await (const chunk of result.textStream) {
        receivedAny = true;
        fullContent += chunk;
        await ctx.runMutation(internal.messages.updateAssistantContent, {
          messageId: newAssistantId,
          appendContent: chunk,
        });
      }

      if (receivedAny) {
        // Finalize message content and mark finishReason so UI knows stream is complete
        log.info(
          "🎯 [server-streaming] Finalizing message with finishReason:",
          {
            messageId: newAssistantId,
            contentLength: fullContent.length,
            finishReason: "stop",
          }
        );
        await ctx.runMutation(internal.messages.updateContent, {
          messageId: newAssistantId,
          content: fullContent,
          finishReason: "stop",
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        });
        await ctx.runMutation(internal.messages.updateAssistantStatus, {
          messageId: newAssistantId,
          status: "done",
        });
        await ctx.runMutation(internal.conversations.internalPatch, {
          id: conversation._id,
          updates: { isStreaming: false },
        });
      } else {
        // No content returned: set a helpful error message and mark as error
        const errorMessage =
          "The AI provider returned no content. Please try again or rephrase your request.";
        await ctx.runMutation(internal.messages.updateContent, {
          messageId: newAssistantId,
          content: errorMessage,
          finishReason: "error",
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        });
        await ctx.runMutation(internal.messages.updateAssistantStatus, {
          messageId: newAssistantId,
          status: "error",
        });
        await ctx.runMutation(internal.conversations.internalPatch, {
          id: conversation._id,
          updates: { isStreaming: false },
        });
      }

      return { success: true } as const;
    } catch (error) {
      // On failure, create an error assistant message with original content to avoid blank UI
      await ctx.runMutation(api.messages.create, {
        conversationId: message.conversationId,
        role: "assistant",
        content: originalContent,
        status: "error",
        model: modelId,
        provider,
      });
      await ctx.runMutation(internal.messages.updateAssistantStatus, {
        messageId: args.messageId,
        status: "error",
        statusText: error instanceof Error ? error.message : "Refine failed",
      });
      await ctx.runMutation(internal.conversations.internalPatch, {
        id: conversation._id,
        updates: { isStreaming: false },
      });
      throw error;
    }
  },
});

export const addAttachments = internalMutation({
  args: {
    messageId: v.id("messages"),
    attachments: v.array(attachmentSchema),
  },
  handler: async (ctx, args) => {
    const { messageId, attachments } = args;

    try {
      // Get current message to preserve existing attachments
      const message = await ctx.db.get(messageId);
      if (!message) {
        return;
      }

      // Merge with existing attachments, deduplicating generated images by URL
      const existingAttachments = message.attachments || [];
      if (!attachments.length) {
        await ctx.db.patch(messageId, { attachments: existingAttachments });
        return;
      }

      // Track URLs for generated images already present
      const existingGeneratedUrls = new Set(
        existingAttachments
          .filter(
            a => a.type === "image" && a.generatedImage?.isGenerated && !!a.url
          )
          .map(a => a.url)
      );

      const merged: typeof existingAttachments = [...existingAttachments];
      for (const att of attachments) {
        // If this is a generated image and we already have an image with the same URL, skip it
        if (
          att.type === "image" &&
          att.generatedImage?.isGenerated &&
          att.url &&
          existingGeneratedUrls.has(att.url)
        ) {
          continue;
        }
        if (
          att.type === "image" &&
          att.generatedImage?.isGenerated &&
          att.url
        ) {
          existingGeneratedUrls.add(att.url);
        }
        merged.push(att);
      }

      const updatedAttachments = merged;

      await ctx.db.patch(messageId, {
        attachments: updatedAttachments,
      });
    } catch (error) {
      log.error("[addAttachments] Error:", error);
      throw new ConvexError(
        `Failed to add attachments to message ${messageId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
});

export const clearImageGenerationAttachments = internalMutation({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const { messageId } = args;

    try {
      const message = await ctx.db.get(messageId);
      if (!message) {
        log.info(
          "[clearImageGenerationAttachments] Message not found:",
          messageId
        );
        return;
      }

      // Log current attachments for debugging

      // Filter out image attachments that were generated by looking for the generatedImage metadata
      // Keep all non-image attachments and user-uploaded images
      const filteredAttachments = (message.attachments || []).filter(
        attachment => {
          if (attachment.type !== "image") {
            return true; // Keep all non-image attachments
          }

          // Check if this is a generated image by looking for the generatedImage metadata
          const hasGeneratedMetadata =
            attachment.generatedImage?.isGenerated === true;
          const shouldKeep = !hasGeneratedMetadata; // Keep only non-generated images

          log.info("[clearImageGenerationAttachments] Processing attachment:", {
            name: attachment.name,
            type: attachment.type,
            hasGeneratedMetadata,
            shouldKeep,
            generatedSource: attachment.generatedImage?.source,
          });

          return shouldKeep;
        }
      );

      await ctx.db.patch(messageId, {
        attachments: filteredAttachments,
      });

      log.info(
        "[clearImageGenerationAttachments] Cleared image generation attachments:",
        {
          messageId,
          originalCount: message.attachments?.length || 0,
          remainingCount: filteredAttachments.length,
          removedCount:
            (message.attachments?.length || 0) - filteredAttachments.length,
        }
      );
    } catch (error) {
      log.error("[clearImageGenerationAttachments] Error:", error);
      throw new ConvexError(
        `Failed to clear image generation attachments for message ${messageId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
});

export const removeAttachment = mutation({
  args: {
    messageId: v.id("messages"),
    attachmentName: v.string(),
  },
  handler: async (ctx, args) => {
    const { messageId, attachmentName } = args;

    try {
      const message = await ctx.db.get(messageId);
      if (!message) {
        throw new Error("Message not found");
      }

      // Check access to the conversation this message belongs to
      const { hasAccess } = await checkConversationAccess(
        ctx,
        message.conversationId,
        false
      );
      if (!hasAccess) {
        throw new Error("Access denied");
      }

      // Filter out the specific attachment by name
      const updatedAttachments = (message.attachments || []).filter(
        attachment => attachment.name !== attachmentName
      );

      // Update the message with the filtered attachments
      await ctx.db.patch(messageId, {
        attachments: updatedAttachments,
      });
    } catch (error) {
      log.error("[removeAttachment] Error:", error);
      throw new ConvexError(
        `Failed to remove attachment from message ${messageId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
});

export const updateImageGeneration = internalMutation({
  args: {
    messageId: v.id("messages"),
    replicateId: v.optional(v.string()),
    status: v.optional(v.string()),
    output: v.optional(v.array(v.string())),
    error: v.optional(v.string()),
    metadata: v.optional(
      v.object({
        duration: v.optional(v.number()),
        model: v.optional(v.string()),
        prompt: v.optional(v.string()),
        params: v.optional(
          v.object({
            aspectRatio: v.optional(v.string()),
            steps: v.optional(v.number()),
            guidanceScale: v.optional(v.number()),
            seed: v.optional(v.number()),
            negativePrompt: v.optional(v.string()),
            count: v.optional(v.number()),
          })
        ),
      })
    ),
  },
  handler: async (ctx, args) => {
    const { messageId, ...imageGenerationData } = args;

    try {
      // Get current message to preserve existing imageGeneration data
      const message = await ctx.db.get(messageId);
      if (!message) {
        return;
      }

      // Merge with existing imageGeneration data
      const currentImageGeneration = message.imageGeneration || {};
      const filteredImageGenerationData = Object.fromEntries(
        Object.entries(imageGenerationData).filter(
          ([_, value]) => value !== undefined
        )
      );

      // Deep merge metadata to preserve nested fields like params.aspectRatio
      const mergedMetadata =
        filteredImageGenerationData.metadata && currentImageGeneration.metadata
          ? {
              ...(typeof currentImageGeneration.metadata === "object" &&
              currentImageGeneration.metadata !== null &&
              !Array.isArray(currentImageGeneration.metadata)
                ? currentImageGeneration.metadata
                : {}),
              ...(typeof filteredImageGenerationData.metadata === "object" &&
              filteredImageGenerationData.metadata !== null &&
              !Array.isArray(filteredImageGenerationData.metadata)
                ? filteredImageGenerationData.metadata
                : {}),
              params: {
                ...(typeof currentImageGeneration.metadata === "object" &&
                currentImageGeneration.metadata !== null &&
                !Array.isArray(currentImageGeneration.metadata) &&
                currentImageGeneration.metadata.params
                  ? currentImageGeneration.metadata.params
                  : {}),
                ...(typeof filteredImageGenerationData.metadata === "object" &&
                filteredImageGenerationData.metadata !== null &&
                !Array.isArray(filteredImageGenerationData.metadata) &&
                filteredImageGenerationData.metadata.params
                  ? filteredImageGenerationData.metadata.params
                  : {}),
              },
            }
          : filteredImageGenerationData.metadata ||
            currentImageGeneration.metadata;

      const updatedImageGeneration = {
        ...currentImageGeneration,
        ...filteredImageGenerationData,
        ...(mergedMetadata &&
        typeof mergedMetadata === "object" &&
        !Array.isArray(mergedMetadata)
          ? { metadata: mergedMetadata }
          : {}),
      };

      // Update the message with new imageGeneration data
      const updateData: {
        imageGeneration: typeof updatedImageGeneration;
        status?: "done" | "error";
        metadata?: Record<string, unknown>;
      } = {
        imageGeneration: updatedImageGeneration,
      };

      // Update message status based on image generation status
      if (args.status === "succeeded") {
        updateData.status = "done";
        // Also update metadata to mark streaming as complete
        updateData.metadata = {
          ...message.metadata,
          finishReason: "stop",
        };
        log.info("[updateImageGeneration] Setting message status to 'done'", {
          messageId,
          imageStatus: args.status,
        });
      } else if (args.status === "failed" || args.status === "canceled") {
        updateData.status = "error";
        // Also update metadata to mark streaming as complete
        updateData.metadata = {
          ...message.metadata,
          finishReason: "error",
        };
        log.info("[updateImageGeneration] Setting message status to 'error'", {
          messageId,
          imageStatus: args.status,
        });
      }

      await ctx.db.patch(messageId, updateData);

      const terminalStatuses = new Set(["succeeded", "failed", "canceled"]);
      if (
        args.status &&
        terminalStatuses.has(args.status) &&
        message.conversationId
      ) {
        try {
          await ctx.db.patch(message.conversationId, {
            isStreaming: false,
          });
        } catch (error) {
          log.warn(
            "[updateImageGeneration] Failed to clear conversation streaming state",
            {
              conversationId: message.conversationId,
              status: args.status,
              error: error instanceof Error ? error.message : String(error),
            }
          );
        }
      }

      // Get the updated message to verify it was saved correctly
      const updatedMessage = await ctx.db.get(messageId);
      log.info("[updateImageGeneration] Updated message verification", {
        messageId,
        imageStatus: args.status,
        messageStatus: updateData.status,
        finishReason: updateData.metadata?.finishReason,
        hasOutput: !!args.output,
        outputLength: args.output?.length,
        imageGenerationStatus: updatedImageGeneration.status,
        imageGenerationOutput: updatedImageGeneration.output,
        actualMessageStatus: updatedMessage?.status,
        actualImageGenStatus: updatedMessage?.imageGeneration?.status,
        actualImageGenOutput: updatedMessage?.imageGeneration?.output,
      });
    } catch (error) {
      log.error("[updateImageGeneration] Error:", error);
      throw new ConvexError(
        `Failed to update image generation for message ${messageId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
});

export const getByReplicateId = internalQuery({
  args: {
    replicateId: v.string(),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .filter(q =>
        q.eq(q.field("imageGeneration.replicateId"), args.replicateId)
      )
      .collect();

    return messages[0] || null;
  },
});
