import { getAuthUserId } from "@convex-dev/auth/server";
import type { PaginationResult } from "convex/server";
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
import { attachmentSchema } from "./lib/schemas";

type FileTypeFilter = "image" | "pdf" | "text" | "all";

type MessageAttachment = NonNullable<Doc<"messages">["attachments"]>[number];

type _AttachmentCandidate = {
  storageId: Id<"_storage"> | null;
  attachment: MessageAttachment;
  messageId: Id<"messages">;
  conversationId: Id<"conversations">;
  conversationTitle: string;
  createdAt: number;
  attachmentIndex: number;
};

const MAX_LIMIT = 1000;
const PAGE_SIZE_CAP = 200;

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
      // Only create entries for attachments with storageId
      if (!attachment.storageId) {
        continue;
      }

      const storageId = attachment.storageId;

      // Check if entry already exists to avoid duplicates
      const existing = await ctx.db
        .query("userFiles")
        .withIndex("by_storage_id", q => q.eq("storageId", storageId))
        .unique();

      if (existing) {
        entries.push(existing._id);
        continue;
      }

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
 */
export async function getFileMetadataHandler(
  ctx: QueryCtx,
  args: { storageId: Id<"_storage"> }
) {
  // Get file metadata from system table
  const metadata = await ctx.db.system.get(args.storageId);
  if (!metadata) {
    throw new Error("File not found");
  }

  // Get file URL
  const fileUrl = await ctx.storage.getUrl(args.storageId);
  if (!fileUrl) {
    throw new Error("Failed to get file URL");
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
 */
export async function getFileUrlHandler(
  ctx: QueryCtx,
  args: { storageId: Id<"_storage"> }
) {
  return await ctx.storage.getUrl(args.storageId);
}

export const getFileUrl = query({
  args: { storageId: v.id("_storage") },
  handler: getFileUrlHandler,
});

/**
 * Delete a file from storage
 */
export async function deleteFileHandler(
  ctx: MutationCtx,
  args: { storageId: Id<"_storage"> }
) {
  await ctx.storage.delete(args.storageId);
}

export const deleteFile = mutation({
  args: { storageId: v.id("_storage") },
  handler: deleteFileHandler,
});

/**
 * Get all user files with metadata and usage information
 * Now using the dedicated userFiles table for efficient querying
 */
export async function getUserFilesHandler(
  ctx: QueryCtx,
  args: {
    limit?: number;
    cursor?: string;
    fileType?: "image" | "pdf" | "text" | "all";
    includeGenerated?: boolean;
  }
) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Not authenticated");
  }

  const limit = Math.max(1, Math.min(args.limit ?? PAGE_SIZE_CAP, MAX_LIMIT));
  const fileType = args.fileType ?? "all";
  const includeGenerated = args.includeGenerated ?? true;

  // Build the query based on filters
  let query;

  if (fileType !== "all") {
    // Use type-specific index for better performance
    query = ctx.db
      .query("userFiles")
      .withIndex("by_user_type_created", q =>
        q.eq("userId", userId).eq("type", fileType)
      )
      .order("desc");
  } else if (includeGenerated) {
    // Get all files for user
    query = ctx.db
      .query("userFiles")
      .withIndex("by_user_created", q => q.eq("userId", userId))
      .order("desc");
  } else {
    // Filter out generated images
    query = ctx.db
      .query("userFiles")
      .withIndex("by_user_generated", q =>
        q.eq("userId", userId).eq("isGenerated", false)
      )
      .order("desc");
  }

  // Apply additional filter for generated images if needed
  const userFiles = await query.take(limit);

  // Filter out generated images if type is "image" and includeGenerated is false
  const filteredFiles = userFiles.filter(file => {
    if (fileType === "image" && !includeGenerated && file.isGenerated) {
      return false;
    }
    return true;
  });

  // Fetch conversation titles and file metadata
  const filesWithMetadata = await Promise.all(
    filteredFiles.map(async file => {
      try {
        const conversation = await ctx.db.get(file.conversationId);
        const fileMetadata = await ctx.db.system.get(file.storageId);
        const fileUrl = await ctx.storage.getUrl(file.storageId);

        // Get the attachment data from the message for full details
        const message = await ctx.db.get(file.messageId);
        const attachment = message?.attachments?.find(
          att => att.storageId === file.storageId
        );

        return {
          storageId: file.storageId,
          attachment: attachment || {
            type: file.type,
            name: file.name,
            size: file.size,
            url: fileUrl ?? "",
            mimeType: file.mimeType,
            generatedImage: file.isGenerated
              ? { isGenerated: true, source: "unknown" }
              : undefined,
          },
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

  // TODO: Implement proper cursor-based pagination
  // For now, we use take() which is simpler but doesn't support cursors
  return {
    files,
    hasMore: userFiles.length === limit,
    nextCursor: null,
  };
}

export const getUserFiles = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
    fileType: v.optional(
      v.union(
        v.literal("image"),
        v.literal("pdf"),
        v.literal("text"),
        v.literal("all")
      )
    ),
    includeGenerated: v.optional(v.boolean()),
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

  // Delete files from storage
  await Promise.all(
    args.storageIds.map(storageId => ctx.storage.delete(storageId))
  );

  // Delete entries from userFiles table
  for (const storageId of args.storageIds) {
    const userFileEntry = await ctx.db
      .query("userFiles")
      .withIndex("by_storage_id", q => q.eq("storageId", storageId))
      .unique();

    if (userFileEntry) {
      await ctx.db.delete(userFileEntry._id);
    }
  }

  // Optionally update messages to remove references to deleted files
  if (args.updateMessages) {
    const storageIdSet = new Set(args.storageIds);

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
            !(attachment.storageId && storageIdSet.has(attachment.storageId))
        );

        if (updatedAttachments.length !== message.attachments.length) {
          await ctx.db.patch(message._id, {
            attachments: updatedAttachments,
          });
        }
      }
    }
  }
  return { deletedCount: args.storageIds.length };
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
