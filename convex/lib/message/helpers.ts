import type { Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import {
  isStorageIdReferencedByOtherMessages,
} from "../../fileStorage";
import {
  checkConversationAccess,
} from "../conversation_utils";

// Shared handler function for getting message by ID
export async function handleGetMessageById(
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
export async function handleMessageDeletion(
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

// Rough token estimate helper (1 token ~ 4 characters)
export function estimateTokensFromText(text: string): number {
  if (!text) {
    return 0;
  }
  // Clamp at minimum 1 token for any non-empty text
  return Math.max(1, Math.ceil(text.length / 4));
}
