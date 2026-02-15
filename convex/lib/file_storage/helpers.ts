import { getAllowedMimeTypes } from "../../../shared/file-constants";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";

export type FileTypeFilter = "image" | "pdf" | "text" | "audio" | "video" | "all";

export type MessageAttachment = NonNullable<Doc<"messages">["attachments"]>[number];

// File upload security constants
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_MIME_TYPES = getAllowedMimeTypes();

/**
 * Validate file upload security constraints
 * @throws ConvexError if validation fails
 */
export function validateFileUpload(
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

export type _AttachmentCandidate = {
  storageId: Id<"_storage"> | null;
  attachment: MessageAttachment;
  messageId: Id<"messages">;
  conversationId: Id<"conversations">;
  conversationTitle: string;
  createdAt: number;
  attachmentIndex: number;
};

export type _AttachmentFilters = {
  fileType: FileTypeFilter;
  includeGenerated: boolean;
};

export function _buildAttachmentKey(
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

export function _attachmentMatchesFilters(
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

export function isNonNull<T>(value: T | null | undefined): value is T {
  return value != null;
}

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
