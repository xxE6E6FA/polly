import { getAuthUserId } from "@convex-dev/auth/server";
import type { PaginationOptions, PaginationResult } from "convex/server";
import { paginationOptsValidator } from "convex/server";
import type { Infer } from "convex/values";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import { checkConversationAccess } from "./lib/conversation_utils";
import { attachmentSchema } from "./lib/schemas";

type FileTypeFilter = "image" | "pdf" | "text" | "all";

type MessageAttachment = NonNullable<Doc<"messages">["attachments"]>[number];

// File upload security constants
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_MIME_TYPES = new Set([
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/heic",
  "image/heif",
  // Documents
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  // Code files
  "text/javascript",
  "text/typescript",
  "application/json",
  "text/html",
  "text/css",
]);

/**
 * Validate file upload security constraints
 * @throws ConvexError if validation fails
 */
function validateFileUpload(
  size: number,
  mimeType: string | undefined,
  name: string
): void {
  // Validate file size
  if (size > MAX_FILE_SIZE) {
    throw new ConvexError(
      `File "${name}" exceeds maximum size of ${MAX_FILE_SIZE / (1024 * 1024)}MB`
    );
  }

  // Validate MIME type if provided
  if (mimeType && !ALLOWED_MIME_TYPES.has(mimeType)) {
    // Allow unknown MIME types but log a warning
    // This prevents blocking legitimate files while still tracking suspicious uploads
    console.warn(
      `[File Upload] Unrecognized MIME type "${mimeType}" for file "${name}"`
    );
  }

  // Basic filename validation to prevent path traversal
  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
    throw new ConvexError("Invalid filename");
  }
}

type _AttachmentCandidate = {
  storageId: Id<"_storage"> | null;
  attachment: MessageAttachment;
  messageId: Id<"messages">;
  conversationId: Id<"conversations">;
  conversationTitle: string;
  createdAt: number;
  attachmentIndex: number;
};

type _AttachmentFilters = {
  fileType: FileTypeFilter;
  includeGenerated: boolean;
};

function _buildAttachmentKey(
  conversationId: Id<"conversations">,
  messageId: Id<"messages">,
  attachmentIndex: number,
  storageId: Id<"_storage"> | null
): string {
  if (storageId) {
    return `storage:${storageId}`;
  }
  return `message:${conversationId}:${messageId}:${attachmentIndex}`;
}

function _attachmentMatchesFilters(
  attachment: MessageAttachment,
  fileType: FileTypeFilter,
  includeGenerated: boolean
): boolean {
  if (!attachment) {
    return false;
  }

  if (fileType !== "all" && attachment.type !== fileType) {
    return false;
  }

  if (fileType === "image" && !includeGenerated) {
    if (attachment.generatedImage?.isGenerated) {
      return false;
    }
  }

  return true;
}

function isNonNull<T>(value: T | null | undefined): value is T {
  return value != null;
}

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
        content: attachment.content,
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

export const createUserFileEntries = internalMutation({
  args: {
    userId: v.id("users"),
    messageId: v.id("messages"),
    conversationId: v.id("conversations"),
    attachments: v.array(attachmentSchema),
  },
  handler: createUserFileEntriesHandler,
});

/**
 * Generate an upload URL for a file
 * This is step 1 of the 3-step upload process
 */
export async function generateUploadUrlHandler(ctx: MutationCtx) {
  return await ctx.storage.generateUploadUrl();
}

export const generateUploadUrl = mutation({
  args: {},
  handler: generateUploadUrlHandler,
});

/**
 * Get file metadata and URL from storage ID
 * Convex automatically stores metadata in the "_storage" system table
 * Requires authentication and verifies file ownership or conversation access
 */
export async function getFileMetadataHandler(
  ctx: QueryCtx,
  args: { storageId: Id<"_storage"> }
) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError("Not authenticated");
  }

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

export const getFileMetadata = query({
  args: {
    storageId: v.id("_storage"),
  },
  handler: getFileMetadataHandler,
});

/**
 * Get a file URL from storage ID
 * Requires authentication and verifies file ownership or conversation access
 */
export async function getFileUrlHandler(
  ctx: QueryCtx,
  args: { storageId: Id<"_storage"> }
) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError("Not authenticated");
  }

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
      const fileExists = await ctx.storage.getUrl(args.storageId);
      if (fileExists) {
        // File exists but no userFiles entry yet - likely a pending upload
        return fileExists;
      }
    }

    if (!hasAccess) {
      throw new ConvexError("Access denied");
    }
  }

  return await ctx.storage.getUrl(args.storageId);
}

export const getFileUrl = query({
  args: { storageId: v.id("_storage") },
  handler: getFileUrlHandler,
});

/**
 * Delete a file from storage
 * Requires authentication and verifies file ownership (only owner can delete)
 */
export async function deleteFileHandler(
  ctx: MutationCtx,
  args: { storageId: Id<"_storage"> }
) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError("Not authenticated");
  }

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
    throw new ConvexError("Access denied - only file owner can delete");
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

export const deleteFile = mutation({
  args: { storageId: v.id("_storage") },
  handler: deleteFileHandler,
});

/**
 * Check if a storageId is referenced by any messages other than the excluded ones.
 * This enables reference counting to prevent premature deletion of shared files.
 *
 * The check is scoped to a specific conversation for performance.
 *
 * @param ctx - Query or Mutation context
 * @param storageId - The storage ID to check
 * @param conversationId - The conversation to check within
 * @param excludeMessageIds - Message IDs to exclude from the check (the ones being deleted)
 * @returns true if the storageId is referenced by other messages in the conversation
 */
export async function isStorageIdReferencedByOtherMessages(
  ctx: QueryCtx | MutationCtx,
  storageId: Id<"_storage">,
  conversationId: Id<"conversations">,
  excludeMessageIds: Set<Id<"messages">>
): Promise<boolean> {
  // Query all messages in the conversation (uses index)
  const conversationMessages = await ctx.db
    .query("messages")
    .withIndex("by_conversation", q => q.eq("conversationId", conversationId))
    .collect();

  // Check if any message (not in exclude list) references this storageId
  for (const message of conversationMessages) {
    if (excludeMessageIds.has(message._id)) {
      continue;
    }
    if (message.attachments) {
      for (const attachment of message.attachments) {
        if (attachment.storageId === storageId) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Batch check for multiple storageIds - more efficient than calling the single check multiple times.
 * Returns a Set of storageIds that are safe to delete (not referenced by other messages).
 *
 * @param ctx - Query or Mutation context
 * @param storageIds - The storage IDs to check
 * @param conversationId - The conversation to check within
 * @param excludeMessageIds - Message IDs to exclude from the check (the ones being deleted)
 * @returns Set of storageIds that can be safely deleted
 */
export async function getStorageIdsSafeToDelete(
  ctx: QueryCtx | MutationCtx,
  storageIds: Id<"_storage">[],
  conversationId: Id<"conversations">,
  excludeMessageIds: Set<Id<"messages">>
): Promise<Set<Id<"_storage">>> {
  if (storageIds.length === 0) {
    return new Set();
  }

  // Build a set of storageIds for quick lookup
  const storageIdSet = new Set(storageIds);
  const referencedStorageIds = new Set<Id<"_storage">>();

  // Query all messages in the conversation (uses index)
  const conversationMessages = await ctx.db
    .query("messages")
    .withIndex("by_conversation", q => q.eq("conversationId", conversationId))
    .collect();

  // Find which storageIds are referenced by messages NOT being deleted
  for (const message of conversationMessages) {
    if (excludeMessageIds.has(message._id)) {
      continue;
    }
    if (message.attachments) {
      for (const attachment of message.attachments) {
        if (attachment.storageId && storageIdSet.has(attachment.storageId)) {
          referencedStorageIds.add(attachment.storageId);
        }
      }
    }
  }

  // Return storageIds that are NOT referenced elsewhere
  const safeToDelete = new Set<Id<"_storage">>();
  for (const storageId of storageIds) {
    if (!referencedStorageIds.has(storageId)) {
      safeToDelete.add(storageId);
    }
  }

  return safeToDelete;
}

/**
 * Get all user files with metadata and usage information
 * Now using the dedicated userFiles table with proper pagination support
 */
export async function getUserFilesHandler(
  ctx: QueryCtx,
  args: {
    paginationOpts: PaginationOptions;
    fileType?: "image" | "pdf" | "text" | "all";
    includeGenerated?: boolean;
    searchQuery?: string;
    sortField?: "name" | "created";
    sortDirection?: "asc" | "desc";
  }
) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    // Return empty result instead of throwing error
    // This prevents console errors when the dialog is mounted but user is not authenticated
    return {
      page: [],
      isDone: true,
      continueCursor: "",
    };
  }

  const fileType = args.fileType ?? "all";
  const includeGenerated = args.includeGenerated ?? true;
  const searchQuery = args.searchQuery?.trim();
  const sortField = args.sortField ?? "created";
  const sortDirection = args.sortDirection ?? "desc";

  // Build the query based on filters - all filtering at database level
  let query;

  // If search query is provided, use search index (sorting by relevance, not customizable)
  if (searchQuery) {
    query = ctx.db
      .query("userFiles")
      .withSearchIndex("search_name", q =>
        q.search("name", searchQuery).eq("userId", userId)
      );

    // Apply type filter if specified
    if (fileType !== "all") {
      query = query.filter(q => q.eq(q.field("type"), fileType));
    }

    // Apply isGenerated filter based on fileType and includeGenerated
    if (fileType === "image" && !includeGenerated) {
      query = query.filter(q => q.eq(q.field("isGenerated"), false));
    } else if (fileType === "all" && !includeGenerated) {
      query = query.filter(q => q.eq(q.field("isGenerated"), false));
    }
  } else if (sortField === "name") {
    // Sort by name - use by_user_name index
    // Note: type filtering with name sorting requires post-filter
    query = ctx.db
      .query("userFiles")
      .withIndex("by_user_name", q => q.eq("userId", userId))
      .order(sortDirection);

    // Apply type filter if specified
    if (fileType !== "all") {
      query = query.filter(q => q.eq(q.field("type"), fileType));
    }

    // Apply isGenerated filter
    if (!includeGenerated) {
      query = query.filter(q => q.eq(q.field("isGenerated"), false));
    }
  } else if (fileType === "image" && !includeGenerated) {
    // Special case: images only, exclude generated
    // Use by_user_type_created for images and filter before ordering
    query = ctx.db
      .query("userFiles")
      .withIndex("by_user_type_created", q =>
        q.eq("userId", userId).eq("type", "image")
      )
      .filter(q => q.eq(q.field("isGenerated"), false))
      .order(sortDirection);
  } else if (fileType === "pdf" || fileType === "text") {
    // PDF or text files (these are never generated, so includeGenerated doesn't matter)
    query = ctx.db
      .query("userFiles")
      .withIndex("by_user_type_created", q =>
        q.eq("userId", userId).eq("type", fileType)
      )
      .order(sortDirection);
  } else if (fileType === "image" && includeGenerated) {
    // All images including generated
    query = ctx.db
      .query("userFiles")
      .withIndex("by_user_type_created", q =>
        q.eq("userId", userId).eq("type", "image")
      )
      .order(sortDirection);
  } else if (fileType === "all" && includeGenerated) {
    // All files including generated
    query = ctx.db
      .query("userFiles")
      .withIndex("by_user_created", q => q.eq("userId", userId))
      .order(sortDirection);
  } else {
    // fileType === "all" && !includeGenerated
    // All files excluding generated images
    query = ctx.db
      .query("userFiles")
      .withIndex("by_user_generated", q =>
        q.eq("userId", userId).eq("isGenerated", false)
      )
      .order(sortDirection);
  }

  // Apply pagination - no post-pagination filtering needed
  const paginatedResult = await query.paginate(args.paginationOpts);

  // Fetch conversation titles and file URLs
  // Note: We build attachment data from userFiles table directly to avoid
  // expensive message lookups (messages can be large with many attachments)
  const filesWithMetadata = await Promise.all(
    paginatedResult.page.map(async file => {
      try {
        const [conversation, fileMetadata, fileUrl] = await Promise.all([
          ctx.db.get("conversations", file.conversationId),
          ctx.db.system.get(file.storageId),
          ctx.storage.getUrl(file.storageId),
        ]);

        // Skip files where storage file no longer exists (was deleted)
        // This prevents broken image links in the file library
        if (!fileUrl) {
          return null;
        }

        // Build attachment from userFiles data (no message fetch needed)
        const attachment = {
          type: file.type,
          name: file.name,
          size: file.size,
          url: fileUrl,
          storageId: file.storageId,
          mimeType: file.mimeType,
          thumbnail: file.thumbnail,
          generatedImage: file.isGenerated
            ? {
                isGenerated: true,
                source: file.generatedImageSource || "unknown",
                model: file.generatedImageModel,
              }
            : undefined,
        };

        return {
          storageId: file.storageId,
          attachment,
          messageId: file.messageId,
          conversationId: file.conversationId,
          conversationName: conversation?.title ?? "Untitled conversation",
          createdAt: file.createdAt,
          url: fileUrl,
          metadata: fileMetadata,
        };
      } catch (error) {
        console.error(
          `Failed to get metadata for file ${file.storageId}:`,
          error
        );
        return null;
      }
    })
  );

  const files = filesWithMetadata.filter(isNonNull);

  // Deduplicate by storageId - files can appear multiple times when conversations are cloned
  // Keep the first occurrence (most recent due to sorting) for each unique storageId
  const seenStorageIds = new Set<Id<"_storage">>();
  const deduplicatedFiles = files.filter(file => {
    if (seenStorageIds.has(file.storageId)) {
      return false;
    }
    seenStorageIds.add(file.storageId);
    return true;
  });

  return {
    page: deduplicatedFiles,
    isDone: paginatedResult.isDone,
    continueCursor: paginatedResult.continueCursor,
  };
}

export const getUserFiles = query({
  args: {
    paginationOpts: paginationOptsValidator,
    fileType: v.optional(
      v.union(
        v.literal("image"),
        v.literal("pdf"),
        v.literal("text"),
        v.literal("all")
      )
    ),
    includeGenerated: v.optional(v.boolean()),
    searchQuery: v.optional(v.string()),
    sortField: v.optional(v.union(v.literal("name"), v.literal("created"))),
    sortDirection: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  },
  handler: getUserFilesHandler,
});

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
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Not authenticated");
  }

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

export const deleteMultipleFiles = mutation({
  args: {
    storageIds: v.array(v.id("_storage")),
    updateMessages: v.optional(v.boolean()),
  },
  handler: deleteMultipleFilesHandler,
});

/**
 * Get file usage statistics for a user
 * Now using the dedicated userFiles table for efficient querying
 */
export async function getUserFileStatsHandler(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Not authenticated");
  }

  // Get all user files efficiently using the index
  const userFiles = await ctx.db
    .query("userFiles")
    .withIndex("by_user_created", q => q.eq("userId", userId))
    .collect();

  let totalFiles = 0;
  let totalSize = 0;
  const typeCounts = { image: 0, pdf: 0, text: 0 };
  const generatedImageCount = { count: 0, size: 0 };

  for (const file of userFiles) {
    totalFiles++;
    totalSize += file.size;

    if (file.type === "image" && file.isGenerated) {
      generatedImageCount.count++;
      generatedImageCount.size += file.size;
    } else {
      typeCounts[file.type]++;
    }
  }

  return {
    totalFiles,
    totalSize,
    typeCounts,
    generatedImages: generatedImageCount,
  };
}

export const getUserFileStats = query({
  args: {},
  handler: getUserFileStatsHandler,
});

/**
 * Get attachments for a single message from userFiles table
 * This is the primary query for the full migration from messages.attachments
 */
export async function getMessageAttachmentsHandler(
  ctx: QueryCtx,
  args: { messageId: Id<"messages"> }
) {
  // Check authentication
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Not authenticated");
  }

  // Get the message to find its conversation
  const message = await ctx.db.get("messages", args.messageId);
  if (!message) {
    throw new Error("Message not found");
  }

  // Check access to the conversation
  const { hasAccess } = await checkConversationAccess(
    ctx,
    message.conversationId,
    false
  );
  if (!hasAccess) {
    throw new Error("Access denied");
  }

  const userFiles = await ctx.db
    .query("userFiles")
    .withIndex("by_message", q => q.eq("messageId", args.messageId))
    .collect();

  // Convert userFiles to attachment format
  const attachments = await Promise.all(
    userFiles.map(async file => {
      // Generate URL from storageId
      const url = (await ctx.storage.getUrl(file.storageId)) ?? "";

      return {
        type: file.type,
        url,
        name: file.name,
        size: file.size,
        content: file.content,
        thumbnail: file.thumbnail,
        storageId: file.storageId,
        mimeType: file.mimeType,
        textFileId: file.textFileId,
        extractedText: file.extractedText,
        extractionError: file.extractionError,
        generatedImage: file.isGenerated
          ? {
              isGenerated: true,
              source: file.generatedImageSource ?? "unknown",
              model: file.generatedImageModel,
              prompt: file.generatedImagePrompt,
            }
          : undefined,
      };
    })
  );

  return attachments;
}

export const getMessageAttachments = query({
  args: {
    messageId: v.id("messages"),
  },
  handler: getMessageAttachmentsHandler,
});

/**
 * Get attachments for multiple messages in a single query (batched)
 * More efficient than calling getMessageAttachments multiple times
 */
export async function getBatchMessageAttachmentsHandler(
  ctx: QueryCtx,
  args: { messageIds: Id<"messages">[] }
) {
  // Check authentication
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Not authenticated");
  }

  // Fetch all messages to verify access
  const messages = await Promise.all(
    args.messageIds.map(id => ctx.db.get("messages", id))
  );

  // Verify access for every message's conversation
  const conversationIds = new Set<Id<"conversations">>();
  for (const message of messages) {
    if (!message) {
      throw new Error("One or more messages not found");
    }
    conversationIds.add(message.conversationId);
  }

  // Check access to all conversations
  for (const conversationId of conversationIds) {
    const { hasAccess } = await checkConversationAccess(
      ctx,
      conversationId,
      false
    );
    if (!hasAccess) {
      throw new Error("Access denied to one or more conversations");
    }
  }

  // Fetch all userFiles for these messages
  const allFiles = await Promise.all(
    args.messageIds.map(async messageId => {
      const files = await ctx.db
        .query("userFiles")
        .withIndex("by_message", q => q.eq("messageId", messageId))
        .collect();
      return { messageId, files };
    })
  );

  // Build a map of messageId -> attachments
  const attachmentsByMessage: Record<string, Infer<typeof attachmentSchema>[]> =
    {};

  for (const { messageId, files } of allFiles) {
    const attachments = await Promise.all(
      files.map(async file => {
        const url = (await ctx.storage.getUrl(file.storageId)) ?? "";

        return {
          type: file.type,
          url,
          name: file.name,
          size: file.size,
          content: file.content,
          thumbnail: file.thumbnail,
          storageId: file.storageId,
          mimeType: file.mimeType,
          textFileId: file.textFileId,
          extractedText: file.extractedText,
          extractionError: file.extractionError,
          generatedImage: file.isGenerated
            ? {
                isGenerated: true,
                source: file.generatedImageSource ?? "unknown",
                model: file.generatedImageModel,
                prompt: file.generatedImagePrompt,
              }
            : undefined,
        };
      })
    );

    attachmentsByMessage[messageId] = attachments;
  }

  return attachmentsByMessage;
}

export const getBatchMessageAttachments = query({
  args: {
    messageIds: v.array(v.id("messages")),
  },
  handler: getBatchMessageAttachmentsHandler,
});
