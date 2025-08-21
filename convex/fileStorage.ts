import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

import { mutation, query } from "./_generated/server";

/**
 * Generate an upload URL for a file
 * This is step 1 of the 3-step upload process
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async ctx => {
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Get file metadata and URL from storage ID
 * Convex automatically stores metadata in the "_storage" system table
 */
export const getFileMetadata = query({
  args: {
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
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
  },
});

/**
 * Get a file URL from storage ID
 */
export const getFileUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

/**
 * Delete a file from storage
 */
export const deleteFile = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    await ctx.storage.delete(args.storageId);
  },
});

/**
 * Get all user files with metadata and usage information
 */
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
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const limit = args.limit || 50;

    console.log(`[getUserFiles] Starting query for user: ${userId}`);

    // Get user's conversations first
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_user_recent", q => q.eq("userId", userId))
      .collect();

    console.log(`[getUserFiles] Auth user ID: ${userId}`);
    console.log(
      `[getUserFiles] Found ${conversations.length} conversations for user`
    );

    // Debug: Let's see what user IDs actually exist in conversations
    const allConversations = await ctx.db.query("conversations").collect();
    const uniqueUserIds = [...new Set(allConversations.map(c => c.userId))];
    console.log(
      `[getUserFiles] All unique user IDs in database: ${JSON.stringify(uniqueUserIds)}`
    );
    console.log(
      `[getUserFiles] Total conversations in database: ${allConversations.length}`
    );

    const conversationIds = conversations.map(c => c._id);

    // Get messages from user's conversations
    const allMessages = await Promise.all(
      conversationIds.map(async conversationId => {
        return await ctx.db
          .query("messages")
          .withIndex("by_conversation", q =>
            q.eq("conversationId", conversationId)
          )
          .collect();
      })
    );

    const messages = allMessages
      .flat()
      .sort((a, b) => b._creationTime - a._creationTime);

    console.log(`[getUserFiles] Found ${messages.length} total messages`);

    // Count messages with attachments
    const messagesWithAttachments = messages.filter(
      m => m.attachments && m.attachments.length > 0
    );
    console.log(
      `[getUserFiles] Found ${messagesWithAttachments.length} messages with attachments`
    );

    // Extract all attachments with storage IDs
    const attachmentsMap = new Map();
    const conversationMap = new Map(); // Track which conversation each file belongs to
    let totalAttachments = 0;
    let attachmentsWithStorageId = 0;

    for (const message of messages) {
      if (message.attachments) {
        for (const attachment of message.attachments) {
          totalAttachments++;
          console.log(
            `[getUserFiles] Attachment: ${attachment.name}, type: ${attachment.type}, hasStorageId: ${!!attachment.storageId}`
          );

          // Include attachments with storageId OR text attachments with content
          if (attachment.storageId) {
            attachmentsWithStorageId++;
            const key = attachment.storageId;
            if (!attachmentsMap.has(key)) {
              attachmentsMap.set(key, {
                attachment,
                messageId: message._id,
                conversationId: message.conversationId,
                createdAt: message._creationTime,
              });
              conversationMap.set(key, message.conversationId);
            }
          } else if (attachment.type === "text" && attachment.content) {
            // Handle text attachments stored with content instead of storageId
            const key = `${message._id}-${attachment.name}-${attachment.type}`;
            if (!attachmentsMap.has(key)) {
              attachmentsMap.set(key, {
                attachment,
                messageId: message._id,
                conversationId: message.conversationId,
                createdAt: message._creationTime,
                isContentBased: true, // Flag to indicate this is content-based, not storage-based
              });
              conversationMap.set(key, message.conversationId);
            }
          }
        }
      }
    }

    console.log(
      `[getUserFiles] Total attachments: ${totalAttachments}, with storageId: ${attachmentsWithStorageId}, unique files: ${attachmentsMap.size}`
    );

    // Create conversation names mapping from already fetched conversations
    const conversationNames = Object.fromEntries(
      conversations.map(c => [c._id, c.title])
    );

    // Filter by file type if specified
    let filteredAttachments = Array.from(attachmentsMap.entries());

    if (args.fileType && args.fileType !== "all") {
      filteredAttachments = filteredAttachments.filter(([_, data]) => {
        const attachment = data.attachment;
        if (args.fileType === "image") {
          // Include both regular images and generated images if includeGenerated is true
          return (
            attachment.type === "image" &&
            (args.includeGenerated || !attachment.generatedImage?.isGenerated)
          );
        }
        return attachment.type === args.fileType;
      });
    }

    // Sort by creation time (newest first)
    filteredAttachments.sort((a, b) => b[1].createdAt - a[1].createdAt);

    // Apply pagination
    const startIndex = args.cursor ? parseInt(args.cursor) : 0;
    const endIndex = startIndex + limit;
    const paginatedAttachments = filteredAttachments.slice(
      startIndex,
      endIndex
    );

    // Get file metadata and URLs for the paginated results
    const filesWithMetadata = await Promise.all(
      paginatedAttachments.map(async ([key, data]) => {
        try {
          if (data.isContentBased) {
            // Handle text attachments with content but no storageId
            return {
              storageId: null, // No actual storage ID for content-based attachments
              attachment: data.attachment,
              messageId: data.messageId,
              conversationId: data.conversationId,
              conversationName:
                conversationNames[data.conversationId] ||
                "Unknown Conversation",
              createdAt: data.createdAt,
              url: null, // No download URL for content-based attachments
              metadata: null, // No file metadata for content-based attachments
            };
          }
          // Handle regular storage-based attachments
          const storageId = key as Id<"_storage">;
          const fileMetadata = await ctx.db.system.get(storageId);
          const fileUrl = await ctx.storage.getUrl(storageId);

          return {
            storageId,
            attachment: data.attachment,
            messageId: data.messageId,
            conversationId: data.conversationId,
            conversationName:
              conversationNames[data.conversationId] || "Unknown Conversation",
            createdAt: data.createdAt,
            url: fileUrl,
            metadata: fileMetadata,
          };
        } catch (error) {
          console.error(`Failed to get metadata for file ${key}:`, error);
          return null;
        }
      })
    );

    const validFiles = filesWithMetadata.filter(Boolean);

    return {
      files: validFiles,
      hasMore: endIndex < filteredAttachments.length,
      nextCursor:
        endIndex < filteredAttachments.length ? endIndex.toString() : null,
      total: filteredAttachments.length,
    };
  },
});

/**
 * Delete multiple files from storage
 */
export const deleteMultipleFiles = mutation({
  args: {
    storageIds: v.array(v.id("_storage")),
    updateMessages: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
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
      // Get user's conversations first
      const userConversations = await ctx.db
        .query("conversations")
        .withIndex("by_user_recent", q => q.eq("userId", userId))
        .collect();

      const userConversationIds = userConversations.map(c => c._id);

      // Get messages from user's conversations
      const allUserMessages = await Promise.all(
        userConversationIds.map(async conversationId => {
          return await ctx.db
            .query("messages")
            .withIndex("by_conversation", q =>
              q.eq("conversationId", conversationId)
            )
            .collect();
        })
      );

      const messages = allUserMessages.flat();

      const storageIdSet = new Set(args.storageIds);

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
  },
});

/**
 * Get file usage statistics for a user
 */
export const getUserFileStats = query({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    // Get user's conversations first
    const userConversations = await ctx.db
      .query("conversations")
      .withIndex("by_user_recent", q => q.eq("userId", userId))
      .collect();

    const userConversationIds = userConversations.map(c => c._id);

    // Get messages from user's conversations to count file attachments
    const allUserMessages = await Promise.all(
      userConversationIds.map(async conversationId => {
        return await ctx.db
          .query("messages")
          .withIndex("by_conversation", q =>
            q.eq("conversationId", conversationId)
          )
          .collect();
      })
    );

    const messages = allUserMessages.flat();

    let totalFiles = 0;
    let totalSize = 0;
    const typeCounts = { image: 0, pdf: 0, text: 0 };
    const generatedImageCount = { count: 0, size: 0 };

    for (const message of messages) {
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
  },
});
