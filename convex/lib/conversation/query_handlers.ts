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

// ============================================================================
// Search with message-level matches
// ============================================================================

type MessageMatchResult = {
  messageId: string;
  snippet: string;
  role: string;
  createdAt: number;
};

type ConversationSearchWithMatchesResult = {
  conversationId: string;
  title: string;
  updatedAt: number;
  isPinned: boolean;
  matchedIn: "title" | "messages" | "both";
  messageMatches: MessageMatchResult[];
};

/** Minimum word length worth centering a snippet on (skip "a", "is", etc.) */
const MIN_SNIPPET_WORD_LENGTH = 3;

/**
 * Extract a snippet centered around the best matching word from `query`.
 *
 * For multi-word queries, tries the full phrase first, then falls back to the
 * longest individual word (>= 3 chars) that appears in the text. Short words
 * are skipped to avoid centering on noise like "a" or "is".
 */
function extractSnippetAroundMatch(
  text: string,
  query: string,
  maxLength = 150
): string {
  if (text.length <= maxLength) {
    return text;
  }

  const lowerText = text.toLowerCase();

  // Try full phrase first
  let matchIndex = lowerText.indexOf(query.toLowerCase());
  let matchLength = query.length;

  // If full phrase not found, try individual words (longest first).
  // Keep the last word even if short — it may be a partial word being typed.
  if (matchIndex === -1) {
    const allWords = query.split(/\s+/);
    const words = allWords
      .filter(
        (w, i) => w.length >= MIN_SNIPPET_WORD_LENGTH || i === allWords.length - 1
      )
      .sort((a, b) => b.length - a.length);

    for (const word of words) {
      const idx = lowerText.indexOf(word.toLowerCase());
      if (idx !== -1) {
        matchIndex = idx;
        matchLength = word.length;
        break;
      }
    }
  }

  // No match at all — fall back to start of text
  if (matchIndex === -1) {
    const truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(" ");
    const end = lastSpace > maxLength * 0.7 ? lastSpace : maxLength;
    return `${text.substring(0, end)}...`;
  }

  // Center the window around the match
  const half = Math.floor((maxLength - matchLength) / 2);
  let start = Math.max(0, matchIndex - half);
  let end = Math.min(text.length, start + maxLength);

  // If we hit the end, shift the window back
  if (end === text.length) {
    start = Math.max(0, end - maxLength);
  }

  // Snap to word boundaries
  if (start > 0) {
    const spaceAfterStart = text.indexOf(" ", start);
    if (spaceAfterStart !== -1 && spaceAfterStart < matchIndex) {
      start = spaceAfterStart + 1;
    }
  }
  if (end < text.length) {
    const spaceBeforeEnd = text.lastIndexOf(" ", end);
    if (spaceBeforeEnd > matchIndex + matchLength) {
      end = spaceBeforeEnd;
    }
  }

  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";
  return `${prefix}${text.substring(start, end)}${suffix}`;
}

export async function searchWithMatchesHandler(
  ctx: QueryCtx,
  args: {
    searchQuery: string;
    limit?: number;
    maxMatchesPerConversation?: number;
  }
): Promise<ConversationSearchWithMatchesResult[]> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return [];
  }

  const userDocId = userId as Id<"users">;
  const q = args.searchQuery.trim();
  if (!q || q.length < 2) {
    return [];
  }

  const limit = args.limit ?? 20;
  const maxMatchesPerConversation = args.maxMatchesPerConversation ?? 5;

  // Phase 1 — Title search using search_title index
  const titleMatches = await ctx.db
    .query("conversations")
    .withSearchIndex("search_title", (sq) =>
      sq.search("title", q).eq("userId", userDocId).eq("isArchived", false)
    )
    .take(limit);

  // Build initial results from title matches
  const resultsMap = new Map<string, ConversationSearchWithMatchesResult>();
  for (const conv of titleMatches) {
    resultsMap.set(conv._id, {
      conversationId: conv._id,
      title: conv.title || "Untitled",
      updatedAt: conv.updatedAt,
      isPinned: conv.isPinned ?? false,
      matchedIn: "title",
      messageMatches: [],
    });
  }

  // Phase 2 — Message content search using search_content index
  const messageMatches = await ctx.db
    .query("messages")
    .withSearchIndex("search_content", (sq) =>
      sq.search("content", q).eq("isMainBranch", true)
    )
    .take(limit * 10);

  // Track how many matches we've collected per conversation
  const matchCountPerConversation = new Map<string, number>();

  for (const msg of messageMatches) {
    const convId = msg.conversationId;
    const currentCount = matchCountPerConversation.get(convId) ?? 0;
    if (currentCount >= maxMatchesPerConversation) {
      continue;
    }

    // Look up conversation for ownership verification
    const conversation = await ctx.db.get(msg.conversationId);
    if (
      !conversation ||
      conversation.userId !== userDocId ||
      conversation.isArchived
    ) {
      continue;
    }

    const snippet = extractSnippetAroundMatch(msg.content || "", q, 150);
    const match: MessageMatchResult = {
      messageId: msg._id,
      snippet,
      role: msg.role,
      createdAt: msg.createdAt,
    };

    const existing = resultsMap.get(convId);
    if (existing) {
      // Conversation already found via title — upgrade to "both"
      if (existing.matchedIn === "title") {
        existing.matchedIn = "both";
      }
      existing.messageMatches.push(match);
    } else {
      resultsMap.set(convId, {
        conversationId: convId,
        title: conversation.title || "Untitled",
        updatedAt: conversation.updatedAt,
        isPinned: conversation.isPinned ?? false,
        matchedIn: "messages",
        messageMatches: [match],
      });
    }

    matchCountPerConversation.set(convId, currentCount + 1);
  }

  // Sort: title matches first, then by updatedAt desc
  const results = Array.from(resultsMap.values()).sort((a, b) => {
    const aHasTitle = a.matchedIn === "title" || a.matchedIn === "both";
    const bHasTitle = b.matchedIn === "title" || b.matchedIn === "both";
    if (aHasTitle !== bHasTitle) {
      return aHasTitle ? -1 : 1;
    }
    return b.updatedAt - a.updatedAt;
  });

  return results.slice(0, limit);
}

export async function isStreamingHandler(
  ctx: QueryCtx,
  args: { conversationId: Id<"conversations"> }
) {
  return await isConversationStreaming(ctx, args.conversationId);
}
