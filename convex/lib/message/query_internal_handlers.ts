import type { Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { withRetry } from "../../ai/error_handlers";
import { getStorageIdsSafeToDelete } from "../file_storage/helpers";

export async function getAllInConversationInternalHandler(
  ctx: QueryCtx,
  args: { conversationId: Id<"conversations"> }
) {
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
}

export async function internalGetByIdHandler(
  ctx: MutationCtx,
  args: { id: Id<"messages"> }
) {
  return await ctx.db.get("messages", args.id);
}

export async function internalGetByIdQueryHandler(
  ctx: QueryCtx,
  args: { id: Id<"messages"> }
) {
  return await ctx.db.get("messages", args.id);
}

export async function internalGetAllInConversationHandler(
  ctx: MutationCtx,
  args: { conversationId: Id<"conversations"> }
) {
  return await ctx.db
    .query("messages")
    .withIndex("by_conversation", q =>
      q.eq("conversationId", args.conversationId)
    )
    .order("asc")
    .collect();
}

export async function internalRemoveMultipleHandler(
  ctx: MutationCtx,
  args: { ids: Id<"messages">[] }
) {
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
}
