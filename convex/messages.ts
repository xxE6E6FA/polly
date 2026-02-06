import { getAuthUserId } from "@convex-dev/auth/server";
import { streamText } from "ai";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, type Infer, v } from "convex/values";
import dedent from "dedent";
import { createSmoothStreamTransform } from "../shared/streaming-utils";
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
  createUserFileEntriesHandler,
  getStorageIdsSafeToDelete,
  isStorageIdReferencedByOtherMessages,
} from "./fileStorage";
import {
  checkConversationAccess,
  getPersonaPrompt,
  incrementUserMessageStats,
} from "./lib/conversation_utils";
import { paginationOptsSchema, validatePaginationOpts } from "./lib/pagination";
import {
  attachmentSchema,
  extendedMessageMetadataSchema,
  imageGenerationSchema,
  messageStatusSchema,
  providerSchema,
  reasoningConfigSchema,
  reasoningPartSchema,
  toolCallSchema,
  ttsAudioCacheEntrySchema,
  webCitationSchema,
} from "./lib/schemas";

/**
 * ============================================================================
 * ATTACHMENT STORAGE PATTERN (Convex Direct Reference Pattern)
 * ============================================================================
 *
 * Attachments are stored in TWO places and kept in sync:
 *
 * 1. PRIMARY: messages.attachments field (array)
 *    - Fast direct access when displaying messages (no joins needed)
 *    - This is the source of truth for what attachments belong to a message
 *
 * 2. SECONDARY: userFiles table (indexed)
 *    - Enables efficient file-centric queries:
 *      * "Show me all PDFs for this user"
 *      * "Show me all images in this conversation"
 *      * "Get file usage statistics"
 *    - Used for file management UI, not for message display
 *
 * WHY BOTH?
 * - Performance: Direct field access is ~1ms vs join queries
 * - Flexibility: Can query files independently of messages
 * - Convex pattern: Duplicating data is OK when kept in sync via ACID mutations
 *
 * See: https://stack.convex.dev/relationship-structures-let-s-talk-about-schemas
 * ============================================================================
 */

// Shared handler function for getting message by ID
async function handleGetMessageById(
  ctx: QueryCtx,
  id: Id<"messages">,
  checkAccess = true
) {
  const message = await ctx.db.get("messages", id);
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
    _id?: Id<"messages">;
    conversationId?: Id<"conversations">;
    role?: string;
    attachments?: Array<{ storageId?: Id<"_storage"> }>;
  },
  operations: Promise<void>[],
  userId?: Id<"users">
) {
  if (message.conversationId) {
    const conversationId = message.conversationId;

    // Decrement messageCount and clear streaming state
    operations.push(
      (async () => {
        try {
          const conversation = await ctx.db.get(
            "conversations",
            conversationId
          );
          if (conversation) {
            await ctx.db.patch("conversations", conversationId, {
              isStreaming: false,
              messageCount: Math.max(0, (conversation.messageCount || 1) - 1),
            });
          }
        } catch (error) {
          console.warn(
            `Failed to update conversation state for ${conversationId}:`,
            error
          );
        }
      })()
    );

    if (message.role === "user") {
      const conversation = await ctx.db.get("conversations", conversationId);
      if (conversation) {
        const user = await ctx.db.get("users", conversation.userId);
        if (user) {
          operations.push(
            ctx.db.patch("users", conversation.userId, {
              totalMessageCount: Math.max(0, (user.totalMessageCount || 0) - 1),
            })
          );
        }
      }
    }
  }

  if (message.attachments && message.conversationId && message._id) {
    const conversationId = message.conversationId;
    const excludeMessageIds = new Set([message._id]);

    for (const attachment of message.attachments) {
      if (attachment.storageId) {
        const storageId = attachment.storageId;

        // Check if this storageId is referenced by other messages before deleting
        operations.push(
          (async () => {
            try {
              const isReferenced = await isStorageIdReferencedByOtherMessages(
                ctx,
                storageId,
                conversationId,
                excludeMessageIds
              );

              if (isReferenced) {
                // Skip storage deletion - file is still in use by other messages
                return;
              }

              // Safe to delete - no other references
              await ctx.storage.delete(storageId);
            } catch (error) {
              console.warn(`Failed to delete file ${storageId}:`, error);
            }
          })()
        );

        // Delete userFiles entry (with ownership verification)
        // Note: We still delete the userFiles entry for THIS message even if storage is kept
        operations.push(
          (async () => {
            try {
              if (userId) {
                // Primary path: use by_storage_id index when userId is available
                const userFileEntry = await ctx.db
                  .query("userFiles")
                  .withIndex("by_storage_id", q =>
                    q.eq("userId", userId).eq("storageId", storageId)
                  )
                  .unique();

                // Verify ownership before deleting
                if (userFileEntry && userFileEntry.userId === userId) {
                  await ctx.db.delete("userFiles", userFileEntry._id);
                }
              } else if (message._id) {
                // Fallback path: use by_message index when userId unavailable
                // This prevents orphaned userFiles entries
                const messageId = message._id;
                console.warn(
                  `Cleaning up userFiles for message ${messageId} without userId - using fallback by_message index`
                );
                const userFileEntries = await ctx.db
                  .query("userFiles")
                  .withIndex("by_message", q => q.eq("messageId", messageId))
                  .collect();

                for (const entry of userFileEntries) {
                  if (entry.storageId === storageId) {
                    await ctx.db.delete("userFiles", entry._id);
                  }
                }
              }
            } catch (error) {
              console.warn(
                `Failed to delete userFile entry for storage ${storageId}:`,
                error
              );
            }
          })()
        );
      }
    }
  }
}

export async function createHandler(
  ctx: MutationCtx,
  args: {
    conversationId: Id<"conversations">;
    role: string;
    content: string;
    status?: Infer<typeof messageStatusSchema>;
    model?: string;
    provider?: string;
    reasoningConfig?: Infer<typeof reasoningConfigSchema>;
    parentId?: Id<"messages">;
    isMainBranch?: boolean;
    reasoning?: string;
    sourceConversationId?: Id<"conversations">;
    useWebSearch?: boolean;
    attachments?: Infer<typeof attachmentSchema>[];
    metadata?: Infer<typeof extendedMessageMetadataSchema>;
    imageGeneration?: Infer<typeof imageGenerationSchema>;
  }
) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError("User not authenticated");
  }
  // Rolling token estimate helper
  const estimateTokens = (text: string) =>
    Math.max(1, Math.ceil((text || "").length / 4));

  // Strip large fields from attachments before storing in database
  // thumbnail: Base64 preview (can be >1MB on iOS), regenerate from storageId when needed
  // content: Text file content, fetch from storageId when needed
  // These fields are only needed for UI during upload, not for storage
  const attachmentsForStorage = args.attachments?.map(
    ({ thumbnail, content, ...attachment }) => attachment
  );

  const messageId = await ctx.db.insert("messages", {
    ...args,
    attachments: attachmentsForStorage,
    userId,
    isMainBranch: args.isMainBranch ?? true,
    createdAt: Date.now(),
  });

  if (args.role === "user") {
    const conversation = await ctx.db.get("conversations", args.conversationId);
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
          const fresh = await ctx.db.get("conversations", args.conversationId);
          if (!fresh) {
            return;
          }
          await ctx.db.patch("conversations", args.conversationId, {
            tokenEstimate: Math.max(0, (fresh.tokenEstimate || 0) + delta),
            messageCount: (fresh.messageCount || 0) + 1,
          });
        },
        5,
        25
      );
    }
  } else {
    // For non-user messages, still update messageCount
    await withRetry(
      async () => {
        const fresh = await ctx.db.get("conversations", args.conversationId);
        if (!fresh) {
          return;
        }
        await ctx.db.patch("conversations", args.conversationId, {
          messageCount: (fresh.messageCount || 0) + 1,
        });
      },
      5,
      25
    );
  }

  return messageId;
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
  handler: createHandler,
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
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError("User not authenticated");
    }

    const messageId = await ctx.db.insert("messages", {
      ...args,
      role: "user",
      userId,
      isMainBranch: args.isMainBranch ?? true,
      createdAt: Date.now(),
    });

    // Check if this is a built-in model
    const conversation = await ctx.db.get("conversations", args.conversationId);
    if (conversation) {
      if (args.model && args.provider) {
        await incrementUserMessageStats(
          ctx,
          conversation.userId,
          args.model,
          args.provider
        );
      }

      // Update messageCount for the conversation
      await withRetry(
        async () => {
          const fresh = await ctx.db.get("conversations", args.conversationId);
          if (!fresh) {
            return;
          }
          await ctx.db.patch("conversations", args.conversationId, {
            messageCount: (fresh.messageCount || 0) + 1,
          });
        },
        5,
        25
      );
    }

    return messageId;
  },
});

export async function listHandler(
  ctx: QueryCtx,
  args: {
    conversationId: Id<"conversations">;
    includeAlternatives?: boolean;
    paginationOpts?: {
      numItems: number;
      cursor?: string | null;
      id?: number;
    };
    resolveAttachments?: boolean;
  }
) {
  // Verify the user has access to this conversation
  if (process.env.NODE_ENV !== "test") {
    const { hasAccess } = await checkConversationAccess(
      ctx,
      args.conversationId,
      true // allowShared for viewing
    );
    if (!hasAccess) {
      throw new ConvexError("Access denied");
    }
  }

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
}

export const list = query({
  args: {
    conversationId: v.id("conversations"),
    includeAlternatives: v.optional(v.boolean()),
    paginationOpts: paginationOptsSchema,
    resolveAttachments: v.optional(v.boolean()), // Only resolve when needed
  },
  handler: listHandler,
});

export async function getAlternativesHandler(
  ctx: QueryCtx,
  args: { parentId: Id<"messages"> }
) {
  return await ctx.db
    .query("messages")
    .withIndex("by_parent", q => q.eq("parentId", args.parentId))
    .collect();
}

export const getAlternatives = query({
  args: { parentId: v.id("messages") },
  handler: getAlternativesHandler,
});

export async function updateHandler(
  ctx: MutationCtx,
  args: {
    id: Id<"messages">;
    content?: string;
    reasoning?: string;
    patch?: unknown;
  }
) {
  const message = await ctx.db.get("messages", args.id);
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
    await ctx.db.patch("messages", id, cleanUpdates);
  }
}

export const update = mutation({
  args: {
    id: v.id("messages"),
    content: v.optional(v.string()),
    reasoning: v.optional(v.string()),
    patch: v.optional(v.any()),
  },
  handler: updateHandler,
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
    // Fields to explicitly delete from metadata. Required because Convex strips `undefined`
    // from function arguments, so passing { metadata: { field: undefined } } won't work.
    clearMetadataFields: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { id, appendContent, appendReasoning, clearMetadataFields, ...rest } =
      args;

    return await withRetry(async () => {
      // Check if message exists before patching
      const message = await ctx.db.get("messages", id);
      if (!message) {
        return; // Return silently instead of throwing
      }

      // Don't overwrite error status - if message already has an error, skip metadata updates
      if (message.status === "error" && rest.metadata) {
        // Still allow non-metadata updates (like model/provider changes)
        const { metadata: _metadata, ...nonMetadataUpdates } = rest;
        if (Object.keys(nonMetadataUpdates).length > 0) {
          const updates: Partial<Doc<"messages">> = { ...nonMetadataUpdates };
          if (appendContent) {
            updates.content = (message.content || "") + appendContent;
          }
          if (appendReasoning) {
            updates.reasoning = (message.reasoning || "") + appendReasoning;
          }
          return await ctx.db.patch("messages", id, updates);
        }
        return;
      }

      const updates: Partial<Doc<"messages">> = { ...rest };
      if (appendContent) {
        updates.content = (message.content || "") + appendContent;
      }
      if (appendReasoning) {
        updates.reasoning = (message.reasoning || "") + appendReasoning;
      }

      // Handle explicit metadata field deletions by merging with existing metadata
      // and setting fields to undefined (which Convex will delete from the document)
      if (clearMetadataFields && clearMetadataFields.length > 0) {
        const existingMetadata = (message.metadata || {}) as Record<
          string,
          unknown
        >;
        const newMetadata: Record<string, unknown> = {
          ...existingMetadata,
          ...(rest.metadata || {}),
        };
        for (const field of clearMetadataFields) {
          newMetadata[field] = undefined;
        }
        updates.metadata = newMetadata as typeof message.metadata;
      }

      return await ctx.db.patch("messages", id, updates);
    });
  },
});

// Internal mutation to update message content and completion metadata
export const updateContent = internalMutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
    reasoning: v.optional(v.string()),
    finishReason: v.optional(v.string()),
    // Legacy usage field (keep for backward compatibility if needed, or map to new structure)
    usage: v.optional(
      v.object({
        promptTokens: v.number(),
        completionTokens: v.number(),
        totalTokens: v.number(),
      })
    ),
    // New rich metadata fields
    tokenUsage: v.optional(
      v.object({
        inputTokens: v.number(),
        outputTokens: v.number(),
        totalTokens: v.number(),
        reasoningTokens: v.optional(v.number()),
        cachedInputTokens: v.optional(v.number()),
      })
    ),
    providerMessageId: v.optional(v.string()),
    timestamp: v.optional(v.string()),
    warnings: v.optional(v.array(v.string())),
    citations: v.optional(v.array(webCitationSchema)),
    timeToFirstTokenMs: v.optional(v.number()),
    tokensPerSecond: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const {
      messageId,
      usage,
      finishReason,
      tokenUsage,
      providerMessageId,
      timestamp,
      warnings,
      citations,
      timeToFirstTokenMs,
      tokensPerSecond,
      ...updates
    } = args;

    // Check if message exists before patching
    const message = await ctx.db.get("messages", messageId);
    if (!message) {
      return false; // Message not found
    }

    // Don't overwrite error status - if message already has an error, skip metadata updates
    if (message.status === "error") {
      return false;
    }

    // If message is already done/stopped and we are NOT just finishing it (i.e. we are still streaming content),
    // then we should stop.
    // If finishReason is provided in args, we are finishing it.
    // If message.metadata?.finishReason is already set, it was stopped by user.
    if (message.metadata?.finishReason && !finishReason) {
      return false; // Stopped by user
    }

    // Build the update object
    const updateData: Record<string, unknown> = {
      ...updates,
      completedAt: Date.now(),
    };

    if (citations) {
      updateData.citations = citations;
    }

    if (finishReason) {
      updateData.status = "done";
      updateData.metadata = {
        ...(message.metadata || {}),
        finishReason,
        ...(usage && { usage }),
        ...(tokenUsage && { tokenUsage }),
        ...(providerMessageId && { providerMessageId }),
        ...(timestamp && { timestamp }),
        ...(warnings && { warnings }),
        ...(timeToFirstTokenMs && { timeToFirstTokenMs }),
        ...(tokensPerSecond && { tokensPerSecond }),
      };
    }

    await ctx.db.patch("messages", messageId, updateData);

    // Update rolling token estimate for assistant final content
    const updated = await ctx.db.get("messages", messageId);
    if (updated && updated.role === "assistant") {
      const delta = Math.max(1, Math.ceil((updates.content || "").length / 4));
      await withRetry(
        async () => {
          const freshConv = await ctx.db.get(
            "conversations",
            updated.conversationId
          );
          if (!freshConv) {
            return;
          }
          await ctx.db.patch("conversations", updated.conversationId, {
            tokenEstimate: Math.max(0, (freshConv.tokenEstimate || 0) + delta),
          });
        },
        5,
        25
      );
    }

    return true;
  },
});

export async function setBranchHandler(
  ctx: MutationCtx,
  args: {
    messageId: Id<"messages">;
    parentId?: Id<"messages">;
  }
) {
  const message = await ctx.db.get("messages", args.messageId);
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
        ctx.db.patch("messages", sibling._id, { isMainBranch: false })
      )
    );
  }

  return await ctx.db.patch("messages", args.messageId, { isMainBranch: true });
}

export const setBranch = mutation({
  args: {
    messageId: v.id("messages"),
    parentId: v.optional(v.id("messages")),
  },
  handler: setBranchHandler,
});

export async function removeHandler(
  ctx: MutationCtx,
  args: { id: Id<"messages"> }
) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Not authenticated");
  }

  const message = await ctx.db.get("messages", args.id);

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
  await handleMessageDeletion(ctx, message, operations, userId);

  operations.push(ctx.db.delete("messages", args.id));

  await Promise.all(operations);
}

export const remove = mutation({
  args: { id: v.id("messages") },
  handler: removeHandler,
});

export const removeMultiple = mutation({
  args: { ids: v.array(v.id("messages")) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const messages = await Promise.all(
      args.ids.map(id => ctx.db.get("messages", id))
    );

    // Collect unique conversation IDs to check access once per conversation (not per message)
    const uniqueConversationIds = new Set<Id<"conversations">>();
    for (const message of messages) {
      if (message?.conversationId) {
        uniqueConversationIds.add(message.conversationId);
      }
    }

    // Check access for each unique conversation
    for (const conversationId of uniqueConversationIds) {
      const { hasAccess } = await checkConversationAccess(
        ctx,
        conversationId,
        false
      );
      if (!hasAccess) {
        throw new Error("Access denied to one or more messages");
      }
    }

    const conversationMessageCounts = new Map<Id<"conversations">, number>();
    const userMessageCounts = new Map<Id<"users">, number>();
    const storageDeletePromises: Promise<void>[] = [];
    const userFileDeletionPromises: Promise<void>[] = [];

    // Collect storageIds per conversation for batch reference checking
    const storageIdsByConversation = new Map<
      Id<"conversations">,
      Id<"_storage">[]
    >();
    const excludeMessageIds = new Set(args.ids);

    // Collect unique conversation IDs from user messages to batch fetch
    const userMessageConversationIds = new Set<Id<"conversations">>();
    for (const message of messages) {
      if (message?.conversationId && message.role === "user") {
        userMessageConversationIds.add(message.conversationId);
      }
    }

    // Batch fetch all conversations needed for user message counting
    const conversationsById = new Map<
      Id<"conversations">,
      { userId: Id<"users"> }
    >();
    if (userMessageConversationIds.size > 0) {
      const conversations = await Promise.all(
        Array.from(userMessageConversationIds).map(id =>
          ctx.db.get("conversations", id)
        )
      );
      for (const conv of conversations) {
        if (conv) {
          conversationsById.set(conv._id, { userId: conv.userId });
        }
      }
    }

    for (const message of messages) {
      if (message) {
        if (message.conversationId) {
          // Track message count per conversation for decrementing
          const currentConvCount =
            conversationMessageCounts.get(message.conversationId) || 0;
          conversationMessageCounts.set(
            message.conversationId,
            currentConvCount + 1
          );

          if (message.role === "user") {
            // Use pre-fetched conversation data instead of fetching per message
            const conversation = conversationsById.get(message.conversationId);
            if (conversation) {
              const currentCount =
                userMessageCounts.get(conversation.userId) || 0;
              userMessageCounts.set(conversation.userId, currentCount + 1);
            }
          }

          // Collect storageIds for batch reference checking
          if (message.attachments) {
            for (const attachment of message.attachments) {
              if (attachment.storageId) {
                const existing =
                  storageIdsByConversation.get(message.conversationId) || [];
                existing.push(attachment.storageId);
                storageIdsByConversation.set(message.conversationId, existing);
              }
            }
          }
        }
      }
    }

    // Batch check which storageIds are safe to delete (per conversation)
    const safeToDeleteByConversation = new Map<
      Id<"conversations">,
      Set<Id<"_storage">>
    >();
    for (const [conversationId, storageIds] of storageIdsByConversation) {
      const safeToDelete = await getStorageIdsSafeToDelete(
        ctx,
        storageIds,
        conversationId,
        excludeMessageIds
      );
      safeToDeleteByConversation.set(conversationId, safeToDelete);
    }

    // Now process storage deletions with reference counting
    for (const message of messages) {
      if (message?.attachments && message.conversationId) {
        const safeToDelete = safeToDeleteByConversation.get(
          message.conversationId
        );

        for (const attachment of message.attachments) {
          if (attachment.storageId) {
            const storageId = attachment.storageId;

            // Only delete storage if safe (not referenced by other messages)
            if (safeToDelete?.has(storageId)) {
              storageDeletePromises.push(
                ctx.storage.delete(storageId).catch(error => {
                  console.warn(`Failed to delete file ${storageId}:`, error);
                })
              );
            }

            // Delete corresponding userFiles entry (with ownership verification)
            // Note: We still delete the userFiles entry for THIS message even if storage is kept
            userFileDeletionPromises.push(
              (async () => {
                try {
                  if (!storageId) {
                    return;
                  }

                  const userFileEntry = await ctx.db
                    .query("userFiles")
                    .withIndex("by_storage_id", q =>
                      q.eq("userId", userId).eq("storageId", storageId)
                    )
                    .unique();

                  // Verify ownership before deleting
                  if (userFileEntry && userFileEntry.userId === userId) {
                    await ctx.db.delete("userFiles", userFileEntry._id);
                  }
                } catch (error) {
                  console.warn(
                    `Failed to delete userFile entry for storage ${storageId}:`,
                    error
                  );
                }
              })()
            );
          }
        }
      }
    }

    const operations: Promise<void>[] = [];

    // Decrement messageCount for each affected conversation
    // Use withRetry to handle write conflicts with fresh reads
    for (const [conversationId, deletedCount] of conversationMessageCounts) {
      operations.push(
        withRetry(async () => {
          const conversation = await ctx.db.get(
            "conversations",
            conversationId
          );
          if (conversation) {
            await ctx.db.patch("conversations", conversationId, {
              isStreaming: false,
              messageCount: Math.max(
                0,
                (conversation.messageCount || deletedCount) - deletedCount
              ),
            });
          }
        }).catch(error => {
          console.warn(
            `Failed to update conversation state for ${conversationId}:`,
            error
          );
        })
      );
    }

    // Decrement user message counts with retry logic
    for (const [userId, messageCount] of userMessageCounts) {
      operations.push(
        withRetry(async () => {
          const user = await ctx.db.get("users", userId);
          if (user && "totalMessageCount" in user) {
            await ctx.db.patch("users", userId, {
              totalMessageCount: Math.max(
                0,
                (user.totalMessageCount || 0) - messageCount
              ),
            });
          }
        }).catch(error => {
          console.warn(
            `Failed to update user message count for ${userId}:`,
            error
          );
        })
      );
    }

    operations.push(
      ...args.ids.map(id =>
        ctx.db.delete("messages", id).catch(error => {
          console.warn(`Failed to delete message ${id}:`, error);
        })
      )
    );

    operations.push(...storageDeletePromises);
    operations.push(...userFileDeletionPromises);

    await Promise.all(operations);
  },
});

// Internal variant of removeMultiple that skips access checks.
// Use when the caller has already validated conversation ownership.
export const internalRemoveMultiple = internalMutation({
  args: { ids: v.array(v.id("messages")) },
  handler: async (ctx, args) => {
    const messages = await Promise.all(
      args.ids.map(id => ctx.db.get("messages", id))
    );

    const conversationMessageCounts = new Map<Id<"conversations">, number>();
    const userMessageCounts = new Map<Id<"users">, number>();
    const storageDeletePromises: Promise<void>[] = [];
    const userFileDeletionPromises: Promise<void>[] = [];

    // Collect storageIds per conversation for batch reference checking
    const storageIdsByConversation = new Map<
      Id<"conversations">,
      Id<"_storage">[]
    >();
    const excludeMessageIds = new Set(args.ids);

    for (const message of messages) {
      if (message) {
        if (message.conversationId) {
          // Track message count per conversation for decrementing
          const currentConvCount =
            conversationMessageCounts.get(message.conversationId) || 0;
          conversationMessageCounts.set(
            message.conversationId,
            currentConvCount + 1
          );

          if (message.role === "user") {
            const conversation = await ctx.db.get(
              "conversations",
              message.conversationId
            );
            if (conversation) {
              const currentCount =
                userMessageCounts.get(conversation.userId) || 0;
              userMessageCounts.set(conversation.userId, currentCount + 1);
            }
          }

          // Collect storageIds for batch reference checking
          if (message.attachments) {
            for (const attachment of message.attachments) {
              if (attachment.storageId) {
                const existing =
                  storageIdsByConversation.get(message.conversationId) || [];
                existing.push(attachment.storageId);
                storageIdsByConversation.set(message.conversationId, existing);
              }
            }
          }
        }
      }
    }

    // Batch check which storageIds are safe to delete (per conversation)
    const safeToDeleteByConversation = new Map<
      Id<"conversations">,
      Set<Id<"_storage">>
    >();
    for (const [conversationId, storageIds] of storageIdsByConversation) {
      const safeToDelete = await getStorageIdsSafeToDelete(
        ctx,
        storageIds,
        conversationId,
        excludeMessageIds
      );
      safeToDeleteByConversation.set(conversationId, safeToDelete);
    }

    // Now process storage deletions with reference counting
    for (const message of messages) {
      if (message?.attachments && message.conversationId) {
        const safeToDelete = safeToDeleteByConversation.get(
          message.conversationId
        );

        for (const attachment of message.attachments) {
          if (attachment.storageId) {
            const storageId = attachment.storageId;

            // Only delete storage if safe (not referenced by other messages)
            if (safeToDelete?.has(storageId)) {
              storageDeletePromises.push(
                ctx.storage.delete(storageId).catch(error => {
                  console.warn(`Failed to delete file ${storageId}:`, error);
                })
              );
            }

            // Delete corresponding userFiles entry by messageId (works even if userId unavailable)
            // Note: We still delete the userFiles entry for THIS message even if storage is kept
            userFileDeletionPromises.push(
              (async () => {
                try {
                  if (!storageId) {
                    return;
                  }

                  // Clean up by messageId to handle cases where userId is unavailable
                  const userFileEntries = await ctx.db
                    .query("userFiles")
                    .withIndex("by_message", q =>
                      q.eq("messageId", message._id)
                    )
                    .collect();

                  for (const entry of userFileEntries) {
                    if (entry.storageId === storageId) {
                      await ctx.db.delete("userFiles", entry._id);
                    }
                  }
                } catch (error) {
                  console.warn(
                    `Failed to delete userFile entry for storage ${storageId}:`,
                    error
                  );
                }
              })()
            );
          }
        }
      }
    }

    const operations: Promise<void>[] = [];

    // Decrement messageCount for each affected conversation
    // Use withRetry to handle write conflicts with fresh reads
    for (const [conversationId, deletedCount] of conversationMessageCounts) {
      operations.push(
        withRetry(async () => {
          const conversation = await ctx.db.get(
            "conversations",
            conversationId
          );
          if (conversation) {
            await ctx.db.patch("conversations", conversationId, {
              isStreaming: false,
              messageCount: Math.max(
                0,
                (conversation.messageCount || deletedCount) - deletedCount
              ),
            });
          }
        }).catch(error => {
          console.warn(
            `Failed to update conversation state for ${conversationId}:`,
            error
          );
        })
      );
    }

    // Decrement user message counts with retry logic
    for (const [userId, messageCount] of userMessageCounts) {
      operations.push(
        withRetry(async () => {
          const user = await ctx.db.get("users", userId);
          if (user && "totalMessageCount" in user) {
            await ctx.db.patch("users", userId, {
              totalMessageCount: Math.max(
                0,
                (user.totalMessageCount || 0) - messageCount
              ),
            });
          }
        }).catch(error => {
          console.warn(
            `Failed to update user message count for ${userId}:`,
            error
          );
        })
      );
    }

    operations.push(
      ...args.ids.map(id =>
        ctx.db.delete("messages", id).catch(error => {
          console.warn(`Failed to delete message ${id}:`, error);
        })
      )
    );

    operations.push(...storageDeletePromises);
    operations.push(...userFileDeletionPromises);

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
    await ctx.db.patch("messages", args.messageId, {
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
        return { shouldStop: false };
      }
      const message = await ctx.db.get("messages", id);
      if (!message) {
        return { shouldStop: false };
      }
      await ctx.db.patch("messages", id, filteredUpdates);
      const conversation = await ctx.db.get(
        "conversations",
        message.conversationId
      );
      return { shouldStop: !!conversation?.stopRequested };
    }

    return await withRetry(
      async () => {
        const message = await ctx.db.get("messages", id);
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

        await ctx.db.patch("messages", id, appendUpdates);

        // Check if stop was requested - return signal to caller
        const conversation = await ctx.db.get(
          "conversations",
          message.conversationId
        );
        return { shouldStop: !!conversation?.stopRequested };
      },
      5,
      25
    );
  },
});

export const internalGetById = internalMutation({
  args: { id: v.id("messages") },
  handler: async (ctx, args) => {
    return await ctx.db.get("messages", args.id);
  },
});

/**
 * Append reasoning text to a specific segment of the message's reasoningParts.
 * Used by the streaming core to build interleaved reasoning/tool-call streams.
 *
 * When a tool call interrupts reasoning, the streaming core bumps the segment index
 * so the next reasoning flush creates a new segment. This produces a structured
 * timeline: [reasoning1, toolCall, reasoning2, toolCall, reasoning3, ...]
 */
export const appendReasoningSegment = internalMutation({
  args: {
    messageId: v.id("messages"),
    segmentIndex: v.number(),
    text: v.string(),
    startedAt: v.number(),
  },
  handler: async (ctx, { messageId, segmentIndex, text, startedAt }) => {
    return await withRetry(
      async () => {
        const message = await ctx.db.get("messages", messageId);
        if (!message) {
          return { shouldStop: false };
        }

        const parts = message.reasoningParts ?? [];

        if (segmentIndex < parts.length) {
          // Append to existing segment
          const existing = parts[segmentIndex];
          if (existing) {
            parts[segmentIndex] = {
              text: existing.text + text,
              startedAt: existing.startedAt,
            };
          }
        } else {
          // Create new segment
          parts.push({ text, startedAt });
        }

        // Keep the flat `reasoning` string in sync for backward compat (search, export)
        const reasoning = parts.map(p => p.text).join("\n\n");

        await ctx.db.patch("messages", messageId, {
          reasoningParts: parts,
          reasoning,
        });

        const conversation = await ctx.db.get(
          "conversations",
          message.conversationId
        );
        return { shouldStop: !!conversation?.stopRequested };
      },
      5,
      25
    );
  },
});

/**
 * Add a new tool call to a message during streaming.
 * Called when a tool-call chunk is received from the AI SDK.
 */
export const addToolCall = internalMutation({
  args: {
    messageId: v.id("messages"),
    toolCall: toolCallSchema,
  },
  handler: async (ctx, { messageId, toolCall }) => {
    const message = await ctx.db.get("messages", messageId);
    if (!message) {
      console.warn(`addToolCall: Message ${messageId} not found`);
      return;
    }

    const existingCalls = message.toolCalls ?? [];
    // Check if tool call with same ID already exists
    if (existingCalls.some(tc => tc.id === toolCall.id)) {
      return; // Already added, skip
    }

    await ctx.db.patch("messages", messageId, {
      toolCalls: [...existingCalls, toolCall],
    });
  },
});

/**
 * Combined mutation: finalize a tool call result in a single DB write.
 * Updates tool call status, optionally writes citations, and sets message status.
 * This avoids 3 sequential round-trips that block the streaming onChunk handler.
 */
export const finalizeToolResult = internalMutation({
  args: {
    messageId: v.id("messages"),
    toolCallId: v.string(),
    toolStatus: v.union(v.literal("completed"), v.literal("error")),
    toolError: v.optional(v.string()),
    citations: v.optional(v.array(webCitationSchema)),
    messageStatus: messageStatusSchema,
  },
  handler: async (
    ctx,
    { messageId, toolCallId, toolStatus, toolError, citations, messageStatus }
  ) => {
    return await withRetry(
      async () => {
        const message = await ctx.db.get("messages", messageId);
        if (!message) {
          return;
        }

        // Update tool call status
        const toolCalls = message.toolCalls ?? [];
        const updatedCalls = toolCalls.map(tc => {
          if (tc.id === toolCallId) {
            return {
              ...tc,
              status: toolStatus,
              completedAt: Date.now(),
              ...(toolError && { error: toolError }),
            };
          }
          return tc;
        });

        // Single patch: tool calls + optional citations + message status
        await ctx.db.patch("messages", messageId, {
          toolCalls: updatedCalls,
          status: messageStatus,
          ...(citations && { citations }),
        });
      },
      5,
      25
    );
  },
});

export const internalGetByIdQuery = internalQuery({
  args: { id: v.id("messages") },
  handler: async (ctx, args) => {
    return await ctx.db.get("messages", args.id);
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
    // Use cached messageCount if available (O(1) instead of O(n))
    const conversation = await ctx.db.get("conversations", args.conversationId);
    if (conversation?.messageCount !== undefined) {
      return conversation.messageCount;
    }

    // Fallback to counting for conversations without cached count
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
 * Estimate total prompt tokens for a conversation.
 * Uses cached tokenEstimate field (O(1)) when available,
 * falls back to scanning messages (O(n)) for backwards compatibility.
 */
export const getConversationTokenEstimate = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    // Use cached tokenEstimate if available (O(1) instead of O(n))
    const conversation = await ctx.db.get("conversations", args.conversationId);
    if (conversation?.tokenEstimate !== undefined) {
      return conversation.tokenEstimate;
    }

    // Fallback to scanning for conversations without cached estimate
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

    const message = await ctx.db.get("messages", args.messageId);
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
      await ctx.db.delete("messageFavorites", existing._id);
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
        const message = await ctx.db.get("messages", fav.messageId);
        const conversation = message
          ? await ctx.db.get("conversations", message.conversationId)
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

/**
 * Paginated query for favorites using Convex's native pagination.
 * Use with usePaginatedQuery hook for efficient infinite scroll.
 */
export const listFavoritesPaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      // Return empty pagination result for unauthenticated users
      return {
        page: [],
        isDone: true,
        continueCursor: "",
      };
    }

    const paginatedFavorites = await ctx.db
      .query("messageFavorites")
      .withIndex("by_user_created", q => q.eq("userId", userId))
      .order("desc")
      .paginate(args.paginationOpts);

    // Enrich paginated results with message and conversation data
    const enrichedPage = await Promise.all(
      paginatedFavorites.page.map(async fav => {
        const message = await ctx.db.get("messages", fav.messageId);
        const conversation = message
          ? await ctx.db.get("conversations", message.conversationId)
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
      ...paginatedFavorites,
      page: enrichedPage.filter(m => m.message && m.conversation),
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
    await withRetry(async () => {
      // Get current message to check if it's an assistant message
      const message = await ctx.db.get("messages", args.messageId);
      if (!message) {
        console.error(
          "[updateMessageStatus] Message not found:",
          args.messageId
        );
        return;
      }

      // Don't overwrite error status - if message already has an error, skip this update
      if (message.status === "error" && args.status !== "error") {
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
      }

      await ctx.db.patch("messages", args.messageId, updateData);
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
      const currentMessage = await ctx.db.get("messages", messageId);
      if (currentMessage?.status === "done") {
        // Don't overwrite "done" status with any other status
        const { status: _, ...updatesWithoutStatus } = filteredUpdates;
        finalUpdates = updatesWithoutStatus;
      }
    }

    if (!(appendContent || appendReasoning)) {
      if (Object.keys(finalUpdates).length === 0) {
        return { shouldStop: false };
      }
      const message = await ctx.db.get("messages", messageId);
      if (!message) {
        return { shouldStop: false };
      }
      await ctx.db.patch("messages", messageId, finalUpdates);
      const conversation = await ctx.db.get(
        "conversations",
        message.conversationId
      );
      return { shouldStop: !!conversation?.stopRequested };
    }

    return await withRetry(
      async () => {
        const message = await ctx.db.get("messages", messageId);
        if (!message) {
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

        await ctx.db.patch("messages", messageId, finalAppendUpdates);

        // Check if stop was requested - return signal to caller
        const conversation = await ctx.db.get(
          "conversations",
          message.conversationId
        );
        return { shouldStop: !!conversation?.stopRequested };
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
      const message = await ctx.db.get("messages", messageId);
      if (!message) {
        console.error("[updateAssistantStatus] Message not found:", messageId);
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
      await ctx.db.patch("messages", messageId, updateData);
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

export const updateMessageError = internalMutation({
  args: {
    messageId: v.id("messages"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const { messageId, error } = args;
    try {
      const message = await ctx.db.get("messages", messageId);
      if (!message) {
        console.error("[updateMessageError] Message not found:", messageId);
        return;
      }

      await ctx.db.patch("messages", messageId, {
        status: "error",
        error,
        metadata: {
          ...message.metadata,
          finishReason: "error",
        },
      });
    } catch (error) {
      console.error(
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
      const m = convoArray[i];
      if (!m) {
        continue;
      }
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
      // Reuse convoMessages from earlier to avoid redundant query
      const currentIndex = convoArray.findIndex(m => m._id === args.messageId);
      if (currentIndex >= 0) {
        for (const msg of convoArray.slice(currentIndex)) {
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
        experimental_transform: createSmoothStreamTransform(),
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
      const message = await ctx.db.get("messages", messageId);
      if (!message) {
        return;
      }

      // Merge with existing attachments, deduplicating generated images by URL
      const existingAttachments = message.attachments || [];
      if (!attachments.length) {
        await ctx.db.patch("messages", messageId, {
          attachments: existingAttachments,
        });
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

      // Track which attachments are actually new (for creating userFiles entries)
      const newAttachments: typeof attachments = [];

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
        newAttachments.push(att);
      }

      const updatedAttachments = merged;

      await ctx.db.patch("messages", messageId, {
        attachments: updatedAttachments,
      });

      // Create userFiles entries for new attachments (enables file library features)
      // This is especially important for generated images which bypass the normal upload flow
      if (newAttachments.length > 0) {
        const conversation = await ctx.db.get(
          "conversations",
          message.conversationId
        );
        if (conversation) {
          await createUserFileEntriesHandler(ctx, {
            userId: conversation.userId,
            messageId,
            conversationId: message.conversationId,
            attachments: newAttachments,
          });
        }
      }
    } catch (error) {
      console.error("[addAttachments] Error:", error);
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
      const message = await ctx.db.get("messages", messageId);
      if (!message) {
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

          return shouldKeep;
        }
      );

      await ctx.db.patch("messages", messageId, {
        attachments: filteredAttachments,
      });
    } catch (error) {
      console.error("[clearImageGenerationAttachments] Error:", error);
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
      const message = await ctx.db.get("messages", messageId);
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

      // Find the attachment being removed to get its storageId
      const attachmentToRemove = (message.attachments || []).find(
        attachment => attachment.name === attachmentName
      );

      // Filter out the specific attachment by name
      const updatedAttachments = (message.attachments || []).filter(
        attachment => attachment.name !== attachmentName
      );

      // Update the message with the filtered attachments
      await ctx.db.patch("messages", messageId, {
        attachments: updatedAttachments,
      });

      // Also delete the corresponding userFiles entry to keep tables in sync
      // This prevents broken image links in the file library
      if (attachmentToRemove?.storageId) {
        const userFileEntry = await ctx.db
          .query("userFiles")
          .withIndex("by_message", q => q.eq("messageId", messageId))
          .filter(q => q.eq(q.field("storageId"), attachmentToRemove.storageId))
          .unique();

        if (userFileEntry) {
          await ctx.db.delete("userFiles", userFileEntry._id);
        }
      }
    } catch (error) {
      console.error("[removeAttachment] Error:", error);
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

    // Use withRetry to handle write conflicts - re-reads message on each retry
    const message = await withRetry(async () => {
      // Get current message to preserve existing imageGeneration data
      const message = await ctx.db.get("messages", messageId);
      if (!message) {
        return null;
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
        status?: "done" | "error" | "streaming";
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
      } else if (args.status === "failed" || args.status === "canceled") {
        updateData.status = "error";
        // Also update metadata to mark streaming as complete
        updateData.metadata = {
          ...message.metadata,
          finishReason: "error",
        };
      } else if (args.status === "starting" || args.status === "processing") {
        // For retry: set message status back to streaming and clear previous finish state
        updateData.status = "streaming";
        // Clear any previous finishReason to allow isStreaming to return true
        updateData.metadata = {
          ...message.metadata,
          finishReason: undefined,
          stopped: undefined,
        };
      }

      await ctx.db.patch("messages", messageId, updateData);
      return message;
    });

    if (!message) {
      return;
    }

    // Handle conversation update separately with its own retry
    const terminalStatuses = new Set(["succeeded", "failed", "canceled"]);
    if (
      args.status &&
      terminalStatuses.has(args.status) &&
      message.conversationId
    ) {
      await withRetry(async () => {
        await ctx.db.patch("conversations", message.conversationId, {
          isStreaming: false,
          activeImageGeneration: undefined, // Clear tracking for OCC-free stop detection
        });
      }).catch(error => {
        console.warn(
          "[updateImageGeneration] Failed to clear conversation streaming state",
          {
            conversationId: message.conversationId,
            status: args.status,
            error: error instanceof Error ? error.message : String(error),
          }
        );
      });
    }
  },
});

export const getByReplicateId = internalQuery({
  args: {
    replicateId: v.string(),
  },
  handler: async (ctx, args) => {
    // Use index for efficient lookup instead of full table scan
    return await ctx.db
      .query("messages")
      .withIndex("by_replicate_id", q =>
        q.eq("imageGeneration.replicateId", args.replicateId)
      )
      .first();
  },
});
