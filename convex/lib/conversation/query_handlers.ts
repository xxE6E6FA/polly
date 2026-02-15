import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { checkConversationAccess } from "../conversation_utils";
import {
  createEmptyPaginationResult,
  validatePaginationOpts,
} from "../pagination";
import { hasConversationAccess } from "../shared_utils";
import { isConversationStreaming } from "../streaming_utils";

export async function listHandler(
  ctx: QueryCtx,
  args: {
    paginationOpts?:
      | {
          numItems: number;
          cursor?: string | null;
          id?: number;
        }
      | undefined;
    includeArchived?: boolean;
    archivedOnly?: boolean;
    sortDirection?: "asc" | "desc";
  }
) {
  // Use getAuthUserId to properly handle both anonymous and authenticated users
  const userId = await getAuthUserId(ctx);

  if (!userId) {
    return args.paginationOpts ? createEmptyPaginationResult() : [];
  }

  const userDocId = userId as Id<"users">;
  const sortDirection = args.sortDirection ?? "desc";

  // Use the appropriate index based on filter type for better performance:
  // - by_user_archived: ["userId", "isArchived", "updatedAt"] - use when filtering by archived status
  // - by_user_recent: ["userId", "updatedAt"] - use when fetching all conversations
  let query;

  if (args.archivedOnly === true) {
    // Use by_user_archived index with isArchived=true
    query = ctx.db
      .query("conversations")
      .withIndex("by_user_archived", q =>
        q.eq("userId", userDocId).eq("isArchived", true)
      )
      .order(sortDirection);
  } else if (args.includeArchived === false) {
    // Use by_user_archived index with isArchived=false (most common case for sidebar)
    query = ctx.db
      .query("conversations")
      .withIndex("by_user_archived", q =>
        q.eq("userId", userDocId).eq("isArchived", false)
      )
      .order(sortDirection);
  } else {
    // Fetch all conversations (archived and non-archived) using by_user_recent
    query = ctx.db
      .query("conversations")
      .withIndex("by_user_recent", q => q.eq("userId", userDocId))
      .order(sortDirection);
  }

  const validatedOpts = validatePaginationOpts(
    args.paginationOpts ?? undefined
  );
  return validatedOpts
    ? await query.paginate(validatedOpts)
    : await query.take(100);
}

export async function searchHandler(
  ctx: QueryCtx,
  args: {
    searchQuery: string;
    includeArchived?: boolean;
    limit?: number;
  }
) {
  const userId = await getAuthUserId(ctx);

  if (!userId) {
    return [];
  }

  const userDocId = userId as Id<"users">;

  const q = args.searchQuery.trim();
  if (!q) {
    return [];
  }

  const limit = args.limit || 50;
  const needle = q.toLowerCase();

  // Load user's conversations first
  const allUserConversations = await ctx.db
    .query("conversations")
    .withIndex("by_user_recent", q => q.eq("userId", userDocId))
    .collect();

  // Apply archived filter if requested
  const filteredConversations =
    args.includeArchived === false
      ? allUserConversations.filter(c => !c.isArchived)
      : allUserConversations;

  // Title matches (case-insensitive contains)
  const titleMatches = filteredConversations.filter(c =>
    (c.title || "").toLowerCase().includes(needle)
  );

  // Message content matches: scan messages within the user's conversations
  const conversationsFromMessages: typeof filteredConversations = [];
  for (const conv of filteredConversations) {
    const msgs = await ctx.db
      .query("messages")
      .withIndex("by_conversation", q => q.eq("conversationId", conv._id))
      .collect();
    if (msgs.some(m => (m.content || "").toLowerCase().includes(needle))) {
      conversationsFromMessages.push(conv);
    }
    if (conversationsFromMessages.length + titleMatches.length >= limit * 2) {
      // Avoid scanning too many in tests; small optimization
      break;
    }
  }

  // Combine and dedupe with title matches first
  const conversationMap = new Map<
    string,
    (typeof filteredConversations)[number]
  >();
  for (const conv of titleMatches) {
    conversationMap.set(conv._id, conv);
  }
  for (const conv of conversationsFromMessages) {
    if (!conversationMap.has(conv._id)) {
      conversationMap.set(conv._id, conv);
    }
  }

  // Sort by updatedAt desc and limit
  const finalResults = Array.from(conversationMap.values()).sort(
    (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
  );
  return finalResults.slice(0, limit);
}

export async function getHandler(
  ctx: QueryCtx,
  args: { id: Id<"conversations"> }
) {
  const { hasAccess, conversation } = await hasConversationAccess(
    ctx,
    args.id,
    true
  );
  if (!hasAccess) {
    return null;
  }
  return conversation;
}

export async function getWithAccessInfoHandler(
  ctx: QueryCtx,
  args: { id: Id<"conversations"> }
) {
  const { hasAccess, conversation } = await hasConversationAccess(
    ctx,
    args.id,
    true
  );
  return { hasAccess, conversation, isDeleted: false };
}

export async function getBySlugHandler(
  ctx: QueryCtx,
  args: { slug: string }
) {
  // First, try to find by clientId (UUID)
  const byClientId = await ctx.db
    .query("conversations")
    .withIndex("by_client_id", q => q.eq("clientId", args.slug))
    .first();

  if (byClientId) {
    const { hasAccess, conversation } = await hasConversationAccess(
      ctx,
      byClientId._id,
      true
    );
    return {
      hasAccess,
      conversation,
      isDeleted: false,
      resolvedId: byClientId._id,
    };
  }

  // Fallback: treat slug as a Convex ID (for legacy URLs)
  try {
    const conversationId = args.slug as Id<"conversations">;
    const { hasAccess, conversation } = await hasConversationAccess(
      ctx,
      conversationId,
      true
    );
    // Only return resolvedId if conversation was actually found
    // This prevents returning the slug as resolvedId when it's not a valid ID
    if (!conversation) {
      return {
        hasAccess: false,
        conversation: null,
        isDeleted: false,
        resolvedId: null,
      };
    }
    return {
      hasAccess,
      conversation,
      isDeleted: false,
      resolvedId: conversationId,
    };
  } catch {
    // Invalid ID format
    return {
      hasAccess: false,
      conversation: null,
      isDeleted: true,
      resolvedId: null,
    };
  }
}

export async function getForExportHandler(
  ctx: QueryCtx,
  args: {
    id: string;
    limit?: number;
  }
) {
  try {
    const conversationId = args.id as Id<"conversations">;
    const { hasAccess, conversation } = await checkConversationAccess(
      ctx,
      conversationId,
      true
    );

    if (!(hasAccess && conversation)) {
      return null;
    }

    // Use take() to limit results and avoid loading massive conversations
    const messagesQuery = ctx.db
      .query("messages")
      .withIndex("by_conversation", q => q.eq("conversationId", conversationId))
      .filter(q => q.eq(q.field("isMainBranch"), true))
      .order("asc");

    const messages = args.limit
      ? await messagesQuery.take(args.limit)
      : await messagesQuery.collect();

    // Strip heavy fields for export to reduce bandwidth
    const optimizedMessages = messages.map(message => ({
      _id: message._id,
      _creationTime: message._creationTime,
      conversationId: message.conversationId,
      role: message.role,
      content: message.content,
      model: message.model,
      provider: message.provider,
      parentId: message.parentId,
      isMainBranch: message.isMainBranch,
      createdAt: message.createdAt,
      // Only include citations, skip heavy attachments and metadata for export
      ...(message.citations && { citations: message.citations }),
    }));

    return {
      conversation,
      messages: optimizedMessages,
    };
  } catch {
    return null;
  }
}

export async function getByClientIdHandler(
  ctx: QueryCtx,
  args: { clientId: string }
) {
  const conversation = await ctx.db
    .query("conversations")
    .withIndex("by_client_id", q => q.eq("clientId", args.clientId))
    .first();

  if (!conversation) {
    return null;
  }

  // Verify user has access
  const userId = await getAuthUserId(ctx);
  if (conversation.userId !== userId) {
    return null;
  }

  return conversation._id;
}

export async function isStreamingHandler(
  ctx: QueryCtx,
  args: { conversationId: Id<"conversations"> }
) {
  return await isConversationStreaming(ctx, args.conversationId);
}
