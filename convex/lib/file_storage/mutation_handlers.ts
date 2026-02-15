import type { Infer } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import type { attachmentSchema } from "../schemas";
import { getAuthenticatedUser } from "../shared_utils";
import { validateFileUpload } from "./helpers";

/**
 * Helper function to create userFiles entries for message attachments
 * Call this whenever a message with attachments is created
 */
export async function createUserFileEntriesHandler(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    messageId: Id<"messages">;
    conversationId: Id<"conversations">;
    attachments: Infer<typeof attachmentSchema>[];
  }
) {
  const entries: Id<"userFiles">[] = [];

  for (const attachment of args.attachments) {
    try {
      // Validate file upload security constraints
      validateFileUpload(attachment.size, attachment.mimeType, attachment.name);

      // Only create entries for attachments with storageId
      if (!attachment.storageId) {
        continue;
      }

      const storageId = attachment.storageId;

      // Check if entry already exists for THIS message to avoid duplicates
      // When cloning, we want separate userFiles entries per message even if storageId is shared
      const existing = await ctx.db
        .query("userFiles")
        .withIndex("by_message", q => q.eq("messageId", args.messageId))
        .filter(q => q.eq(q.field("storageId"), storageId))
        .unique();

      if (existing) {
        // Reuse existing entry for this exact message/storageId combination
        entries.push(existing._id);
        continue;
      }

      // Create a new entry - this allows multiple userFiles entries for the same storageId
      // as long as they point to different messages (necessary for cloned messages)
      // Audio/video content is stored in Convex file storage (via storageId),
      // so don't persist the base64 content field — it would exceed the 1 MiB limit.
      const isMediaFile =
        attachment.type === "audio" || attachment.type === "video";

      const entryId = await ctx.db.insert("userFiles", {
        userId: args.userId,
        storageId,
        messageId: args.messageId,
        conversationId: args.conversationId,
        type: attachment.type,
        isGenerated: attachment.generatedImage?.isGenerated ?? false,
        name: attachment.name,
        size: attachment.size,
        mimeType: attachment.mimeType,
        createdAt: Date.now(),
        // Include full attachment metadata
        url: attachment.url,
        content: isMediaFile ? undefined : attachment.content,
        thumbnail: attachment.thumbnail,
        textFileId: attachment.textFileId,
        extractedText: attachment.extractedText,
        extractionError: attachment.extractionError,
        generatedImageSource: attachment.generatedImage?.source,
        generatedImageModel: attachment.generatedImage?.model,
        generatedImagePrompt: attachment.generatedImage?.prompt,
      });
      entries.push(entryId);
    } catch (error) {
      console.error("[createUserFileEntries] Error processing attachment:", {
        attachment: { name: attachment.name, type: attachment.type },
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue processing other attachments even if one fails
    }
  }
  return { created: entries.length, entryIds: entries };
}

/**
 * Generate an upload URL for a file
 * This is step 1 of the 3-step upload process
 */
export async function generateUploadUrlHandler(ctx: MutationCtx) {
  return await ctx.storage.generateUploadUrl();
}

/**
 * Delete a file from storage
 * Requires authentication and verifies file ownership (only owner can delete)
 */
export async function deleteFileHandler(
  ctx: MutationCtx,
  args: { storageId: Id<"_storage"> }
) {
  const userId = await getAuthenticatedUser(ctx);

  // Verify user owns this file via userFiles table
  // Use .first() since the same storageId can have multiple userFiles entries
  // (e.g., when conversations are cloned, each message gets its own entry)
  const userFileEntry = await ctx.db
    .query("userFiles")
    .withIndex("by_storage_id", q =>
      q.eq("userId", userId).eq("storageId", args.storageId)
    )
    .first();

  // Only the owner can delete files
  if (!userFileEntry || userFileEntry.userId !== userId) {
    throw new Error("Access denied - only file owner can delete");
  }

  // Delete ALL userFiles entries for this storageId before deleting storage
  const allEntries = await ctx.db
    .query("userFiles")
    .withIndex("by_storage_id", q =>
      q.eq("userId", userId).eq("storageId", args.storageId)
    )
    .collect();

  for (const entry of allEntries) {
    await ctx.db.delete("userFiles", entry._id);
  }

  // Delete from storage
  await ctx.storage.delete(args.storageId);
}

/**
 * Delete multiple files from storage
 */
export async function deleteMultipleFilesHandler(
  ctx: MutationCtx,
  args: {
    storageIds: Id<"_storage">[];
    updateMessages?: boolean;
  }
) {
  const userId = await getAuthenticatedUser(ctx);

  // First, verify ownership of ALL files before deleting anything
  // This prevents malicious users from deleting other users' files
  const ownershipVerification: Map<Id<"_storage">, boolean> = new Map();

  for (const storageId of args.storageIds) {
    // Use .first() since the same storageId can have multiple userFiles entries
    const userFileEntry: Doc<"userFiles"> | null = await ctx.db
      .query("userFiles")
      // biome-ignore lint/suspicious/noExplicitAny: Convex query builder type
      .withIndex("by_storage_id", (q: any) =>
        q.eq("userId", userId).eq("storageId", storageId)
      )
      .first();

    // Only mark as owned if entry exists AND userId matches
    ownershipVerification.set(
      storageId,
      !!(userFileEntry && userFileEntry.userId === userId)
    );
  }

  // Delete only owned files from storage
  const deletedStorageIds: Id<"_storage">[] = [];
  for (const storageId of args.storageIds) {
    if (ownershipVerification.get(storageId)) {
      await ctx.storage.delete(storageId).catch(error => {
        console.warn(`Failed to delete storage file ${storageId}:`, error);
      });
      deletedStorageIds.push(storageId);
    }
  }

  // Delete ALL owned entries from userFiles table
  // This handles cloned messages where the same storageId has multiple userFiles entries
  for (const storageId of deletedStorageIds) {
    const userFileEntries: Doc<"userFiles">[] = await ctx.db
      .query("userFiles")
      // biome-ignore lint/suspicious/noExplicitAny: Convex query builder type
      .withIndex("by_storage_id", (q: any) =>
        q.eq("userId", userId).eq("storageId", storageId)
      )
      .collect();

    for (const entry of userFileEntries) {
      if (entry.userId === userId) {
        await ctx.db.delete("userFiles", entry._id);
      }
    }
  }

  // Optionally update messages to remove references to deleted files
  if (args.updateMessages) {
    const deletedStorageIdSet = new Set(deletedStorageIds);

    // Use the new by_user_created index to get only user's messages
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_user_created", q => q.eq("userId", userId))
      .collect();

    // Update attachments in messages
    for (const message of messages) {
      if (message.attachments) {
        const updatedAttachments = message.attachments.filter(
          attachment =>
            !(
              attachment.storageId &&
              deletedStorageIdSet.has(attachment.storageId)
            )
        );

        if (updatedAttachments.length !== message.attachments.length) {
          await ctx.db.patch("messages", message._id, {
            attachments: updatedAttachments,
          });
        }
      }
    }
  }
  return { deletedCount: deletedStorageIds.length };
}
