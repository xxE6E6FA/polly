import { getAuthUserId } from "@convex-dev/auth/server";
import type { PaginationResult } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";

type FileTypeFilter = "image" | "pdf" | "text" | "all";

type MessageAttachment = NonNullable<Doc<"messages">["attachments"]>[number];

type AttachmentCandidate = {
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

type AttachmentFilters = {
  fileType: FileTypeFilter;
  includeGenerated: boolean;
};

function buildAttachmentKey(
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

function attachmentMatchesFilters(
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
  const filters: AttachmentFilters = {
    fileType: args.fileType ?? "all",
    includeGenerated: args.includeGenerated ?? true,
  };

  // Pre-fetch all user's conversations to avoid pagination issues
  const userConversations = await ctx.db
    .query("conversations")
    .withIndex("by_user_recent", q => q.eq("userId", userId))
    .collect();

  const conversationMap = new Map(userConversations.map(c => [c._id, c]));

  // Get all messages with attachments - single collect() call
  const allMessages = await ctx.db
    .query("messages")
    .withIndex("by_created_at")
    .order("desc")
    .collect();

  const seenKeys = new Set<string>();
  const results: AttachmentCandidate[] = [];

  // Process messages and extract attachments
  for (const message of allMessages) {
    const conversation = conversationMap.get(message.conversationId);
    if (!conversation) {
      continue;
    }

    const attachments = (message.attachments ?? []) as MessageAttachment[];
    if (attachments.length === 0) {
      continue;
    }

    for (let idx = 0; idx < attachments.length; idx++) {
      const attachment = attachments[idx];
      if (!attachment) {
        continue;
      }

      if (
        !attachmentMatchesFilters(
          attachment,
          filters.fileType,
          filters.includeGenerated
        )
      ) {
        continue;
      }

      const storageId =
        (attachment.storageId as Id<"_storage"> | undefined) ?? null;
      const key = buildAttachmentKey(
        conversation._id,
        message._id,
        idx,
        storageId
      );

      if (seenKeys.has(key)) {
        continue;
      }

      seenKeys.add(key);
      results.push({
        storageId,
        attachment,
        messageId: message._id,
        conversationId: conversation._id,
        conversationTitle: conversation.title ?? "Untitled conversation",
        createdAt: message.createdAt ?? message._creationTime,
        attachmentIndex: idx,
      });

      // Stop once we have enough results
      if (results.length >= limit) {
        break;
      }
    }

    if (results.length >= limit) {
      break;
    }
  }

  const filesWithMetadata = await Promise.all(
    results.map(async candidate => {
      try {
        if (!candidate.storageId) {
          return {
            storageId: null,
            attachment: candidate.attachment,
            messageId: candidate.messageId,
            conversationId: candidate.conversationId,
            conversationName: candidate.conversationTitle,
            createdAt: candidate.createdAt,
            url: null,
            metadata: null,
          };
        }

        const fileMetadata = await ctx.db.system.get(candidate.storageId);
        const fileUrl = await ctx.storage.getUrl(candidate.storageId);

        return {
          storageId: candidate.storageId,
          attachment: candidate.attachment,
          messageId: candidate.messageId,
          conversationId: candidate.conversationId,
          conversationName: candidate.conversationTitle,
          createdAt: candidate.createdAt,
          url: fileUrl,
          metadata: fileMetadata,
        };
      } catch (error) {
        console.error(
          `Failed to get metadata for file ${candidate.storageId ?? candidate.messageId}:`,
          error
        );
        return null;
      }
    })
  );

  const files = filesWithMetadata.filter(isNonNull);

  return {
    files,
    hasMore: false,
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

  // Optionally update messages to remove references to deleted files
  if (args.updateMessages) {
    // Get user's conversation IDs first
    const userConversations = await ctx.db
      .query("conversations")
      .withIndex("by_user_recent", q => q.eq("userId", userId))
      .collect();

    const userConversationIds = new Set(userConversations.map(c => c._id));
    const storageIdSet = new Set(args.storageIds);

    // Use a single paginated query to get all messages with attachments
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_created_at")
      .order("desc")
      .collect();

    // Filter for user's messages and update attachments
    for (const message of messages) {
      // Skip messages not in user's conversations
      if (!userConversationIds.has(message.conversationId)) {
        continue;
      }

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
 */
export async function getUserFileStatsHandler(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Not authenticated");
  }

  // Get user's conversation IDs first
  const userConversations = await ctx.db
    .query("conversations")
    .withIndex("by_user_recent", q => q.eq("userId", userId))
    .collect();

  const userConversationIds = new Set(userConversations.map(c => c._id));

  // Use a single paginated query to get all messages
  const messages = await ctx.db
    .query("messages")
    .withIndex("by_created_at")
    .order("desc")
    .collect();

  let totalFiles = 0;
  let totalSize = 0;
  const typeCounts = { image: 0, pdf: 0, text: 0 };
  const generatedImageCount = { count: 0, size: 0 };

  for (const message of messages) {
    // Skip messages not in user's conversations
    if (!userConversationIds.has(message.conversationId)) {
      continue;
    }

    if (message.attachments) {
      for (const attachment of message.attachments) {
        // Count files with storageId OR text files with content
        if (
          attachment.storageId ||
          (attachment.type === "text" && attachment.content)
        ) {
          totalFiles++;
          totalSize += attachment.size || 0;

          if (
            attachment.type === "image" &&
            attachment.generatedImage?.isGenerated
          ) {
            generatedImageCount.count++;
            generatedImageCount.size += attachment.size || 0;
          } else {
            typeCounts[attachment.type]++;
          }
        }
      }
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
