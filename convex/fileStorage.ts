import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { attachmentSchema } from "./lib/schemas";

export {
  getBatchMessageAttachmentsHandler,
  getMessageAttachmentsHandler,
} from "./lib/file_storage/attachment_queries";
export {
  getFileMetadataHandler,
  getFileUrlHandler,
} from "./lib/file_storage/file_queries";
export {
  getStorageIdsSafeToDelete,
  isStorageIdReferencedByOtherMessages,
} from "./lib/file_storage/helpers";
// Re-export handler functions for tests and other modules
export {
  createUserFileEntriesHandler,
  deleteFileHandler,
  deleteMultipleFilesHandler,
  generateUploadUrlHandler,
} from "./lib/file_storage/mutation_handlers";
export {
  getUserFileStatsHandler,
  getUserFilesHandler,
} from "./lib/file_storage/user_file_queries";

import {
  getBatchMessageAttachmentsHandler,
  getMessageAttachmentsHandler,
} from "./lib/file_storage/attachment_queries";
import {
  getFileMetadataHandler,
  getFileUrlHandler,
} from "./lib/file_storage/file_queries";
import {
  createUserFileEntriesHandler,
  deleteFileHandler,
  deleteMultipleFilesHandler,
  generateUploadUrlHandler,
} from "./lib/file_storage/mutation_handlers";
import {
  getUserFileStatsHandler,
  getUserFilesHandler,
} from "./lib/file_storage/user_file_queries";

// ============================================================================
// Convex function registrations
// ============================================================================

export const createUserFileEntries = internalMutation({
  args: {
    userId: v.id("users"),
    messageId: v.id("messages"),
    conversationId: v.id("conversations"),
    attachments: v.array(attachmentSchema),
  },
  handler: createUserFileEntriesHandler,
});

export const generateUploadUrl = mutation({
  args: {},
  handler: generateUploadUrlHandler,
});

export const getFileMetadata = query({
  args: {
    storageId: v.id("_storage"),
  },
  handler: getFileMetadataHandler,
});

export const getFileUrl = query({
  args: {
    storageId: v.id("_storage"),
    conversationId: v.optional(v.id("conversations")),
  },
  handler: getFileUrlHandler,
});

export const deleteFile = mutation({
  args: {
    storageId: v.id("_storage"),
    messageId: v.optional(v.id("messages")),
    conversationId: v.optional(v.id("conversations")),
    removeFromMessage: v.optional(v.boolean()),
  },
  handler: deleteFileHandler,
});

export const getUserFiles = query({
  args: {
    paginationOpts: paginationOptsValidator,
    fileType: v.optional(
      v.union(
        v.literal("image"),
        v.literal("pdf"),
        v.literal("text"),
        v.literal("audio"),
        v.literal("video"),
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

export const deleteMultipleFiles = mutation({
  args: {
    storageIds: v.array(v.id("_storage")),
    updateMessages: v.optional(v.boolean()),
  },
  handler: deleteMultipleFilesHandler,
});

export const getUserFileStats = query({
  args: {},
  handler: getUserFileStatsHandler,
});

export const getMessageAttachments = query({
  args: {
    messageId: v.id("messages"),
  },
  handler: getMessageAttachmentsHandler,
});

export const getBatchMessageAttachments = query({
  args: {
    messageIds: v.array(v.id("messages")),
  },
  handler: getBatchMessageAttachmentsHandler,
});
