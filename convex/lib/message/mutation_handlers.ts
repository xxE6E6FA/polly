import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, type Infer } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { withRetry } from "../../ai/error_handlers";
import {
  createUserFileEntriesHandler,
  getStorageIdsSafeToDelete,
} from "../../fileStorage";
import {
  incrementUserMessageStats,
} from "../conversation_utils";
import type {
  attachmentSchema,
  extendedMessageMetadataSchema,
  imageGenerationSchema,
  messageStatusSchema,
  reasoningConfigSchema,
} from "../schemas";
import {
  getAuthenticatedUser,
  validateConversationAccess,
} from "../shared_utils";
import { handleMessageDeletion } from "./helpers";

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
  const userId = await getAuthenticatedUser(ctx);
  // Rolling token estimate helper
  const estimateTokens = (text: string) =>
    Math.max(1, Math.ceil((text || "").length / 4));

  // Strip large fields from attachments before storing in database
  // thumbnail: Base64 preview (can be >1MB on iOS), regenerate from storageId when needed
  // content: Text file content, fetch from storageId when needed
  // These fields are only needed for UI during upload, not for storage
  // Exception: video thumbnails must be preserved (can't regenerate from video URL at display time)
  const attachmentsForStorage = args.attachments?.map(
    ({ thumbnail, content, ...attachment }) => ({
      ...attachment,
      ...(thumbnail && attachment.type === "video" ? { thumbnail } : {}),
    })
  );

  // For assistant messages, snapshot the active persona so it's frozen at creation time
  let personaName: string | undefined;
  let personaIcon: string | undefined;
  if (args.role === "assistant") {
    const conversation = await ctx.db.get("conversations", args.conversationId);
    if (conversation?.personaId) {
      const persona = await ctx.db.get("personas", conversation.personaId);
      if (persona) {
        personaName = persona.name;
        personaIcon = persona.icon ?? undefined;
      }
    }
  }

  const messageId = await ctx.db.insert("messages", {
    ...args,
    attachments: attachmentsForStorage,
    userId,
    personaName,
    personaIcon,
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

export async function createUserMessageBatchedHandler(
  ctx: MutationCtx,
  args: {
    conversationId: Id<"conversations">;
    content: string;
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
  }
) {
  const userId = await getAuthenticatedUser(ctx);

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
}

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
    await validateConversationAccess(ctx, message.conversationId, false);
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
    await validateConversationAccess(ctx, message.conversationId, false);
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

export async function removeHandler(
  ctx: MutationCtx,
  args: { id: Id<"messages"> }
) {
  const userId = await getAuthenticatedUser(ctx);

  const message = await ctx.db.get("messages", args.id);

  if (!message) {
    return;
  }

  // Check access to the conversation this message belongs to (no shared access for mutations)
  await validateConversationAccess(ctx, message.conversationId, false);

  const operations: Promise<void>[] = [];

  // Use shared handler for deletion logic
  await handleMessageDeletion(ctx, message, operations, userId);

  operations.push(ctx.db.delete("messages", args.id));

  await Promise.all(operations);
}

export async function removeMultipleHandler(
  ctx: MutationCtx,
  args: { ids: Id<"messages">[] }
) {
  const userId = await getAuthenticatedUser(ctx);

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
    await validateConversationAccess(ctx, conversationId, false);
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
}

export async function toggleFavoriteHandler(
  ctx: MutationCtx,
  args: { messageId: Id<"messages"> }
) {
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

  await validateConversationAccess(ctx, message.conversationId, false);

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
}

export async function removeAttachmentHandler(
  ctx: MutationCtx,
  args: {
    messageId: Id<"messages">;
    attachmentName: string;
  }
) {
  const { messageId, attachmentName } = args;

  try {
    const message = await ctx.db.get("messages", messageId);
    if (!message) {
      throw new Error("Message not found");
    }

    // Check access to the conversation this message belongs to
    await validateConversationAccess(ctx, message.conversationId, false);

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
}

