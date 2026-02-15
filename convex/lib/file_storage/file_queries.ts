import { ConvexError } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { checkConversationAccess } from "../conversation_utils";
import { getAuthenticatedUser } from "../shared_utils";

/**
 * Get file metadata and URL from storage ID
 * Convex automatically stores metadata in the "_storage" system table
 * Requires authentication and verifies file ownership or conversation access
 */
export async function getFileMetadataHandler(
  ctx: QueryCtx,
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

  // If user doesn't own the file directly, check conversation access
  if (!userFileEntry) {
    // Try to find the file in any conversation the user can access
    const allUserFileEntries = await ctx.db
      .query("userFiles")
      .withIndex("by_message")
      .filter(q => q.eq(q.field("storageId"), args.storageId))
      .collect();

    let hasAccess = false;
    for (const entry of allUserFileEntries) {
      const { hasAccess: conversationAccess } = await checkConversationAccess(
        ctx,
        entry.conversationId,
        true // allowShared
      );
      if (conversationAccess) {
        hasAccess = true;
        break;
      }
    }

    // If no userFiles entries exist at all, the file may have just been uploaded
    // and the message hasn't been saved yet. Allow access if the file exists in storage.
    // This handles the race condition between file upload and message creation.
    if (!hasAccess && allUserFileEntries.length === 0) {
      const metadata = await ctx.db.system.get(args.storageId);
      const fileUrl = metadata
        ? await ctx.storage.getUrl(args.storageId)
        : null;
      if (metadata && fileUrl) {
        return {
          storageId: args.storageId,
          url: fileUrl,
          metadata,
        };
      }
    }

    if (!hasAccess) {
      throw new ConvexError("Access denied");
    }
  }

  // Get file metadata from system table
  const metadata = await ctx.db.system.get(args.storageId);
  if (!metadata) {
    throw new ConvexError("File not found");
  }

  // Get file URL
  const fileUrl = await ctx.storage.getUrl(args.storageId);
  if (!fileUrl) {
    throw new ConvexError("Failed to get file URL");
  }

  return {
    storageId: args.storageId,
    url: fileUrl,
    metadata,
  };
}

/**
 * Get a file URL from storage ID
 * Requires authentication and verifies file ownership or conversation access
 */
export async function getFileUrlHandler(
  ctx: QueryCtx,
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

  // If user doesn't own the file directly, check conversation access
  if (!userFileEntry) {
    // Try to find the file in any conversation the user can access
    const allUserFileEntries = await ctx.db
      .query("userFiles")
      .withIndex("by_message")
      .filter(q => q.eq(q.field("storageId"), args.storageId))
      .collect();

    let hasAccess = false;
    for (const entry of allUserFileEntries) {
      const { hasAccess: conversationAccess } = await checkConversationAccess(
        ctx,
        entry.conversationId,
        true // allowShared
      );
      if (conversationAccess) {
        hasAccess = true;
        break;
      }
    }

    // If no userFiles entries exist at all, the file may have just been uploaded
    // and the message hasn't been saved yet. Allow access if the file exists in storage.
    // This handles the race condition between file upload and message creation.
    // Also handles the case where both the file and userFiles entries were deleted
    // (e.g., during message retry cleanup) — return null instead of throwing.
    if (!hasAccess && allUserFileEntries.length === 0) {
      return await ctx.storage.getUrl(args.storageId);
    }

    if (!hasAccess) {
      throw new ConvexError("Access denied");
    }
  }

  return await ctx.storage.getUrl(args.storageId);
}
