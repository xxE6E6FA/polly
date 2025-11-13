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
 * Now using the dedicated userFiles table with proper pagination support
 */
export async function getUserFilesHandler(
  ctx: QueryCtx,
  args: {
    paginationOpts: PaginationOptions;
    fileType?: "image" | "pdf" | "text" | "all";
    includeGenerated?: boolean;
  }
) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Not authenticated");
  }

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

  // Apply pagination
  const paginatedResult = await query.paginate(args.paginationOpts);

  // Filter out generated images if type is "image" and includeGenerated is false
  const filteredFiles = paginatedResult.page.filter(file => {
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

  return {
    page: files,
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
    const userFileEntry: Doc<"userFiles"> | null = await ctx.db
      .query("userFiles")
      // biome-ignore lint/suspicious/noExplicitAny: Convex query builder type
      .withIndex("by_storage_id", (q: any) =>
        q.eq("userId", userId).eq("storageId", storageId)
      )
      .unique();

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

  // Delete only owned entries from userFiles table
  for (const storageId of deletedStorageIds) {
    const userFileEntry: Doc<"userFiles"> | null = await ctx.db
      .query("userFiles")
      // biome-ignore lint/suspicious/noExplicitAny: Convex query builder type
      .withIndex("by_storage_id", (q: any) =>
        q.eq("userId", userId).eq("storageId", storageId)
      )
      .unique();

    if (userFileEntry && userFileEntry.userId === userId) {
      await ctx.db.delete(userFileEntry._id);
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
          await ctx.db.patch(message._id, {
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
  const message = await ctx.db.get(args.messageId);
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
  const messages = await Promise.all(args.messageIds.map(id => ctx.db.get(id)));

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
