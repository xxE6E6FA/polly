import { getAuthUserId } from "@convex-dev/auth/server";
import type { PaginationResult } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { log } from "./lib/logger";

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

type PendingAttachmentRef = {
  messageId: Id<"messages">;
  conversationId: Id<"conversations">;
  attachmentIndex: number;
};

type CursorState = {
  messageCursor: string | null;
  pending: PendingAttachmentRef[];
};

const MAX_LIMIT = 1000;
const PAGE_SIZE_CAP = 200;

type AttachmentFilters = {
  fileType: FileTypeFilter;
  includeGenerated: boolean;
};

const EMPTY_CURSOR_STATE: CursorState = {
  messageCursor: null,
  pending: [],
};

function parseCursor(raw?: string | null): CursorState {
  if (!raw) {
    return { ...EMPTY_CURSOR_STATE };
  }

  if (/^\d+$/.test(raw)) {
    return { ...EMPTY_CURSOR_STATE };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<CursorState> & {
      messageCursor?: string | null;
      pending?: PendingAttachmentRef[];
    };

    const messageCursor =
      typeof parsed.messageCursor === "string" ? parsed.messageCursor : null;

    const pending = Array.isArray(parsed.pending)
      ? parsed.pending.filter((ref): ref is PendingAttachmentRef =>
          Boolean(ref?.messageId && ref?.conversationId)
        )
      : [];

    return {
      messageCursor,
      pending,
    };
  } catch {
    return { ...EMPTY_CURSOR_STATE };
  }
}

function encodeCursor(state: CursorState | null): string | null {
  if (!state) {
    return null;
  }

  const hasPending = state.pending.length > 0;
  const hasMessageCursor = Boolean(state.messageCursor);

  if (!(hasPending || hasMessageCursor)) {
    return null;
  }

  return JSON.stringify({
    messageCursor: state.messageCursor,
    pending: hasPending ? state.pending : undefined,
  });
}

function isInvalidCursorError(error: unknown): boolean {
  let message: string;
  if (error instanceof ConvexError) {
    message = error.message;
  } else if (error instanceof Error) {
    message = error.message;
  } else {
    message = String(error ?? "");
  }

  return message.includes("InvalidCursor");
}

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

    const limit = Math.max(1, Math.min(args.limit ?? PAGE_SIZE_CAP, MAX_LIMIT));
    const filters: AttachmentFilters = {
      fileType: args.fileType ?? "all",
      includeGenerated: args.includeGenerated ?? true,
    };

    const { messageCursor, pending } = parseCursor(args.cursor);

    const seenKeys = new Set<string>();
    const results: AttachmentCandidate[] = [];
    const nextPending: PendingAttachmentRef[] = [];

    const conversationCache = new Map<
      Id<"conversations">,
      Doc<"conversations"> | null
    >();

    const ensureConversation = async (
      conversationId: Id<"conversations">
    ): Promise<Doc<"conversations"> | null> => {
      if (!conversationCache.has(conversationId)) {
        const conversation = await ctx.db.get(conversationId);
        if (!conversation || conversation.userId !== userId) {
          conversationCache.set(conversationId, null);
        } else {
          conversationCache.set(conversationId, conversation);
        }
      }
      return conversationCache.get(conversationId) ?? null;
    };

    const buildQuery = () => {
      const baseQuery = ctx.db.query("messages");
      return baseQuery.withIndex("by_created_at", q => q);
    };

    const pageSize = Math.min(limit, PAGE_SIZE_CAP);

    const fetchPage = async (
      cursor: string | null
    ): Promise<PaginationResult<Doc<"messages">>> => {
      let cursorToUse = cursor;

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          return await buildQuery()
            .order("desc")
            .paginate({ cursor: cursorToUse, numItems: pageSize });
        } catch (error) {
          if (cursorToUse && isInvalidCursorError(error)) {
            cursorToUse = null;
            continue;
          }
          throw error;
        }
      }

      return {
        page: [],
        continueCursor: cursorToUse ?? "",
        cursor: cursorToUse ?? "",
        isDone: true,
      } as PaginationResult<Doc<"messages">>;
    };

    const processAttachment = (
      message: Doc<"messages">,
      conversation: Doc<"conversations">,
      attachment: MessageAttachment,
      idx: number
    ) => {
      if (!attachment) {
        return;
      }

      if (
        !attachmentMatchesFilters(
          attachment,
          filters.fileType,
          filters.includeGenerated
        )
      ) {
        return;
      }

      if (results.length >= limit) {
        nextPending.push({
          messageId: message._id,
          conversationId: conversation._id,
          attachmentIndex: idx,
        });
        return;
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
        return;
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
    };

    for (const ref of pending) {
      if (results.length >= limit) {
        nextPending.push(ref);
        continue;
      }

      const message = await ctx.db.get(ref.messageId);
      if (!message) {
        continue;
      }

      const conversation = await ensureConversation(message.conversationId);
      if (!conversation) {
        continue;
      }

      const attachments = (message.attachments ?? []) as MessageAttachment[];
      const attachment = attachments[ref.attachmentIndex];
      if (!attachment) {
        continue;
      }

      processAttachment(message, conversation, attachment, ref.attachmentIndex);
    }

    let cursor = messageCursor;
    let moreMessagesAvailable = true;

    while (moreMessagesAvailable && results.length < limit) {
      const page = await fetchPage(cursor);
      cursor = page.continueCursor ?? null;
      moreMessagesAvailable = Boolean(page.continueCursor);

      for (const message of page.page as Doc<"messages">[]) {
        const conversation = await ensureConversation(message.conversationId);
        if (!conversation) {
          continue;
        }

        const attachments = (message.attachments ?? []) as MessageAttachment[];
        if (attachments.length === 0) {
          continue;
        }

        for (let idx = 0; idx < attachments.length; idx++) {
          processAttachment(message, conversation, attachments[idx], idx);
        }
      }

      if (!moreMessagesAvailable) {
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
          log.error(
            `Failed to get metadata for file ${candidate.storageId ?? candidate.messageId}:`,
            error
          );
          return null;
        }
      })
    );

    const files = filesWithMetadata.filter(isNonNull);

    const nextCursorState =
      nextPending.length > 0 || moreMessagesAvailable
        ? {
            messageCursor: cursor,
            pending: nextPending,
          }
        : null;

    const nextCursor = encodeCursor(nextCursorState);
    const hasMore = Boolean(nextCursorState);

    return {
      files,
      hasMore,
      nextCursor,
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
