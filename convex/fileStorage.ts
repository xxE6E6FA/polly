import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { log } from "./lib/logger";

type FileTypeFilter = "image" | "pdf" | "text" | "all";

type PendingAttachmentRef = {
  conversationId: Id<"conversations">;
  messageId: Id<"messages">;
  attachmentIndex: number;
};

type CursorState = {
  resumeConversationId: Id<"conversations"> | null;
  messageCursor: string | null;
  nextConversationCursor: string | null;
  pending?: PendingAttachmentRef[];
};

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

const DEFAULT_CURSOR_STATE: CursorState = {
  resumeConversationId: null,
  messageCursor: null,
  nextConversationCursor: null,
  pending: [],
};

const MAX_LIMIT = 500;

function parseCursor(raw?: string | null): CursorState {
  if (!raw) {
    return { ...DEFAULT_CURSOR_STATE };
  }

  // Backwards compatibility with legacy numeric cursors – treat as reset.
  if (/^\d+$/.test(raw)) {
    return { ...DEFAULT_CURSOR_STATE };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<CursorState>;
    return {
      resumeConversationId: (parsed.resumeConversationId ??
        null) as Id<"conversations"> | null,
      messageCursor: parsed.messageCursor ?? null,
      nextConversationCursor: parsed.nextConversationCursor ?? null,
      pending: Array.isArray(parsed.pending)
        ? (parsed.pending as PendingAttachmentRef[])
        : [],
    };
  } catch {
    return { ...DEFAULT_CURSOR_STATE };
  }
}

function encodeCursor(state: CursorState | null): string | null {
  if (!state) {
    return null;
  }

  const hasPending = state.pending && state.pending.length > 0;
  const payload: CursorState = {
    resumeConversationId: state.resumeConversationId ?? null,
    messageCursor: state.resumeConversationId
      ? (state.messageCursor ?? null)
      : null,
    nextConversationCursor: state.nextConversationCursor ?? null,
    pending: hasPending ? state.pending : undefined,
  };

  const hasCursorState = Boolean(
    payload.resumeConversationId || payload.nextConversationCursor || hasPending
  );

  if (!hasCursorState) {
    return null;
  }

  return JSON.stringify(payload);
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

async function resolvePendingAttachments(
  ctx: QueryCtx,
  refs: PendingAttachmentRef[],
  userId: Id<"users">
): Promise<AttachmentCandidate[]> {
  if (refs.length === 0) {
    return [];
  }

  const messageCache = new Map<Id<"messages">, Doc<"messages"> | null>();
  const conversationCache = new Map<
    Id<"conversations">,
    Doc<"conversations"> | null
  >();
  const candidates: AttachmentCandidate[] = [];

  for (const ref of refs) {
    if (!messageCache.has(ref.messageId)) {
      const message = await ctx.db.get(ref.messageId);
      messageCache.set(ref.messageId, message ?? null);
    }

    const message = messageCache.get(ref.messageId);
    if (!message || message.conversationId !== ref.conversationId) {
      continue;
    }

    if (!conversationCache.has(ref.conversationId)) {
      const conversation = await ctx.db.get(ref.conversationId);
      if (!conversation || conversation.userId !== userId) {
        conversationCache.set(ref.conversationId, null);
      } else {
        conversationCache.set(ref.conversationId, conversation);
      }
    }

    const conversation = conversationCache.get(ref.conversationId);
    if (!conversation) {
      continue;
    }

    const attachments = (message.attachments ?? []) as MessageAttachment[];
    const attachment = attachments[ref.attachmentIndex];
    if (!attachment) {
      continue;
    }

    candidates.push({
      storageId: (attachment.storageId as Id<"_storage"> | undefined) ?? null,
      attachment,
      messageId: message._id,
      conversationId: conversation._id,
      conversationTitle: conversation.title ?? "Untitled conversation",
      createdAt: message._creationTime,
      attachmentIndex: ref.attachmentIndex,
    });
  }

  return candidates;
}

async function collectFromConversation(options: {
  ctx: QueryCtx;
  conversation: Doc<"conversations">;
  startCursor: string | null;
  remaining: number;
  fileType: FileTypeFilter;
  includeGenerated: boolean;
  seen: Set<string>;
  results: AttachmentCandidate[];
}): Promise<{
  nextMessageCursor: string | null;
  exhausted: boolean;
}> {
  const {
    ctx,
    conversation,
    startCursor,
    remaining,
    fileType,
    includeGenerated,
    seen,
    results,
  } = options;

  let messageCursor = startCursor;
  let exhausted = false;
  const conversationTitle = conversation.title ?? "Untitled conversation";

  while (results.length <= remaining) {
    const page = await ctx.db
      .query("messages")
      .withIndex("by_conversation", q =>
        q.eq("conversationId", conversation._id)
      )
      .order("desc")
      .paginate({ cursor: messageCursor, limit: 1 });

    if (page.page.length === 0) {
      messageCursor = null;
      exhausted = true;
      break;
    }

    const message = page.page[0] as Doc<"messages">;
    messageCursor = page.continueCursor ?? null;

    const attachments = (message.attachments ?? []) as MessageAttachment[];

    for (let idx = 0; idx < attachments.length; idx++) {
      const attachment = attachments[idx];
      if (!attachmentMatchesFilters(attachment, fileType, includeGenerated)) {
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

      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      results.push({
        storageId,
        attachment,
        messageId: message._id,
        conversationId: conversation._id,
        conversationTitle,
        createdAt: message._creationTime,
        attachmentIndex: idx,
      });
    }

    if (!page.continueCursor) {
      messageCursor = null;
      exhausted = true;
      break;
    }

    if (results.length > remaining) {
      break;
    }
  }

  return {
    nextMessageCursor: messageCursor,
    exhausted,
  };
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

    const limit = Math.max(1, Math.min(args.limit ?? 50, MAX_LIMIT));
    const fileType: FileTypeFilter = args.fileType ?? "all";
    const includeGenerated = args.includeGenerated ?? true;

    const cursorState = parseCursor(args.cursor);
    const seenKeys = new Set<string>();
    const results: AttachmentCandidate[] = [];
    const remainingTarget = limit * 2; // allow modest overflow before trimming

    // Rehydrate any pending attachments that were deferred on the previous page.
    const pendingRefs = cursorState.pending ?? [];
    const remainingPending: PendingAttachmentRef[] = [];
    if (pendingRefs.length > 0) {
      const pendingCandidates = await resolvePendingAttachments(
        ctx,
        pendingRefs,
        userId
      );

      for (const candidate of pendingCandidates) {
        const key = buildAttachmentKey(
          candidate.conversationId,
          candidate.messageId,
          candidate.attachmentIndex,
          candidate.storageId
        );

        if (seenKeys.has(key)) {
          continue;
        }
        seenKeys.add(key);

        if (results.length < limit) {
          results.push(candidate);
        } else {
          remainingPending.push({
            conversationId: candidate.conversationId,
            messageId: candidate.messageId,
            attachmentIndex: candidate.attachmentIndex,
          });
        }
      }
    }

    let resumeConversationId = cursorState.resumeConversationId;
    let nextConversationCursor = cursorState.nextConversationCursor ?? null;
    let messageCursor = cursorState.messageCursor ?? null;

    // Continue within an in-flight conversation if needed.
    if (results.length < limit && resumeConversationId) {
      const conversation = await ctx.db.get(resumeConversationId);

      if (!conversation || conversation.userId !== userId) {
        resumeConversationId = null;
        messageCursor = null;
      } else {
        const { nextMessageCursor, exhausted } = await collectFromConversation({
          ctx,
          conversation,
          startCursor: messageCursor,
          remaining: remainingTarget,
          fileType,
          includeGenerated,
          seen: seenKeys,
          results,
        });

        messageCursor = nextMessageCursor;

        if (exhausted) {
          resumeConversationId = null;
          messageCursor = null;
        }
      }
    }

    // Walk additional conversations until we hit the limit or run out of data.
    let conversationCursor: string | null = resumeConversationId
      ? (nextConversationCursor ?? null)
      : (cursorState.nextConversationCursor ?? null);

    while (results.length < limit) {
      const page = await ctx.db
        .query("conversations")
        .withIndex("by_user_recent", q => q.eq("userId", userId))
        .order("desc")
        .paginate({ cursor: conversationCursor, limit: 1 });

      if (page.page.length === 0) {
        conversationCursor = null;
        nextConversationCursor = null;
        break;
      }

      const conversation = page.page[0] as Doc<"conversations">;
      conversationCursor = page.continueCursor ?? null;
      nextConversationCursor = conversationCursor;

      const { nextMessageCursor, exhausted } = await collectFromConversation({
        ctx,
        conversation,
        startCursor: null,
        remaining: remainingTarget,
        fileType,
        includeGenerated,
        seen: seenKeys,
        results,
      });

      if (!exhausted) {
        resumeConversationId = conversation._id;
        messageCursor = nextMessageCursor;
        break;
      }

      if (results.length >= limit) {
        break;
      }
    }

    // Trim overflow beyond the requested limit and capture as pending for the next page.
    const overflowRefs: PendingAttachmentRef[] = [...remainingPending];
    if (results.length > limit) {
      const overflow = results.splice(limit);
      for (const candidate of overflow) {
        overflowRefs.push({
          conversationId: candidate.conversationId,
          messageId: candidate.messageId,
          attachmentIndex: candidate.attachmentIndex,
        });
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

    const validFiles = filesWithMetadata.filter(Boolean);

    const nextCursor = encodeCursor(
      resumeConversationId || overflowRefs.length > 0 || nextConversationCursor
        ? {
            resumeConversationId,
            messageCursor,
            nextConversationCursor,
            pending: overflowRefs,
          }
        : null
    );

    const hasMore = Boolean(nextCursor);

    return {
      files: validFiles,
      hasMore,
      nextCursor,
      total: hasMore ? undefined : validFiles.length,
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
