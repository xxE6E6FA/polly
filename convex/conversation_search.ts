import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalQuery, type QueryCtx } from "./_generated/server";

// ============================================================================
// Constants
// ============================================================================

/** Maximum length for context strings to prevent token bloat */
const MAX_CONTEXT_LENGTH = 1000;

/** Multiplier for message search limit to account for filtering and deduplication */
const MESSAGE_FETCH_MULTIPLIER = 5;

/** Maximum length for message snippets */
const SNIPPET_MAX_LENGTH = 200;

/** Number of recent messages to fetch for preview when no summary exists */
const RECENT_MESSAGES_COUNT = 6;

/** Maximum length for individual message previews */
const MESSAGE_PREVIEW_LENGTH = 150;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Truncate text at word boundaries to prevent mid-word cuts.
 * Adds ellipsis if truncation occurs.
 */
function truncateAtWordBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  // Find the last space before maxLength
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");

  // If we found a space, truncate there; otherwise use hard cut
  const result =
    lastSpace > maxLength * 0.7 ? truncated.substring(0, lastSpace) : truncated;

  return `${result}...`;
}

// ============================================================================
// Types
// ============================================================================

/**
 * Result from searching a conversation
 */
export interface ConversationSearchResult {
  conversationId: string;
  title: string;
  snippet: string;
  matchedIn: "title" | "message";
  messageCount: number;
  updatedAt: number;
  relevantContext?: string;
}

/**
 * Fetch recent messages from a conversation to build a preview.
 * Used as a fallback when no summary exists.
 */
async function getRecentMessagesPreview(
  ctx: QueryCtx,
  conversationId: Id<"conversations">,
  limit = RECENT_MESSAGES_COUNT
): Promise<string | undefined> {
  const messages = await ctx.db
    .query("messages")
    .withIndex("by_conversation_main_branch", q =>
      q.eq("conversationId", conversationId).eq("isMainBranch", true)
    )
    .order("desc")
    .take(limit);

  if (messages.length === 0) {
    return undefined;
  }

  // Reverse to get chronological order and format
  const preview = messages
    .reverse()
    .filter(m => m.role !== "system")
    .map(m => {
      const role = m.role === "user" ? "User" : "Assistant";
      const content = (m.content || "").substring(0, MESSAGE_PREVIEW_LENGTH);
      return `${role}: ${content}${m.content && m.content.length > MESSAGE_PREVIEW_LENGTH ? "..." : ""}`;
    })
    .join("\n");

  return preview || undefined;
}

/**
 * Fetch context for a conversation using recent messages preview.
 */
async function getConversationContext(
  ctx: QueryCtx,
  conversationId: Id<"conversations">
): Promise<string | undefined> {
  const preview = await getRecentMessagesPreview(ctx, conversationId);
  if (preview) {
    return truncateAtWordBoundary(preview, MAX_CONTEXT_LENGTH);
  }
  return preview;
}

/**
 * Search conversation titles using Convex full-text search index.
 * Uses the search_title index for O(1) tokenized, relevance-ranked search.
 * Also fetches summaries for matched conversations to provide context.
 * Uses Promise.all() for batch loading contexts to avoid N+1 queries.
 */
async function searchInTitles(
  ctx: QueryCtx,
  userId: Id<"users">,
  query: string,
  limit: number
): Promise<ConversationSearchResult[]> {
  // Use Convex searchIndex for tokenized full-text search
  const titleMatches = await ctx.db
    .query("conversations")
    .withSearchIndex("search_title", q =>
      q.search("title", query).eq("userId", userId).eq("isArchived", false)
    )
    .take(limit);

  if (titleMatches.length === 0) {
    return [];
  }

  // Batch fetch contexts for all matched conversations in parallel
  const contexts = await Promise.all(
    titleMatches.map(conv => getConversationContext(ctx, conv._id))
  );

  // Build results with fetched contexts
  return titleMatches.map((conv, index) => ({
    conversationId: conv._id,
    title: conv.title || "Untitled",
    snippet: conv.title || "Untitled",
    matchedIn: "title" as const,
    messageCount: conv.messageCount || 0,
    updatedAt: conv.updatedAt,
    relevantContext: contexts[index],
  }));
}

/**
 * Search message content using Convex full-text search index.
 * Uses the search_content index for O(1) tokenized search.
 * Note: Messages index doesn't have userId filter, so we verify ownership after.
 * Uses Promise.all() for batch loading contexts to avoid N+1 queries.
 */
async function searchInMessages(
  ctx: QueryCtx,
  userId: Id<"users">,
  query: string,
  existingIds: Set<string>,
  limit: number
): Promise<ConversationSearchResult[]> {
  // Use Convex searchIndex for tokenized full-text search on message content
  // Get extra results since we need to filter by user ownership and dedupe
  const messageMatches = await ctx.db
    .query("messages")
    .withSearchIndex("search_content", q =>
      q.search("content", query).eq("isMainBranch", true)
    )
    .take(limit * MESSAGE_FETCH_MULTIPLIER);

  // Group messages by conversation, storing conversation data to avoid re-fetching
  const conversationMap = new Map<
    string,
    {
      conversationId: Id<"conversations">;
      snippet: string;
      title: string;
      messageCount: number;
      updatedAt: number;
    }
  >();

  for (const msg of messageMatches) {
    // Skip if we already have this conversation from title search
    if (existingIds.has(msg.conversationId)) {
      continue;
    }
    // Skip if we already found a message from this conversation
    if (conversationMap.has(msg.conversationId)) {
      continue;
    }

    // Verify user owns this conversation
    const conversation = await ctx.db.get("conversations", msg.conversationId);
    if (
      !conversation ||
      conversation.userId !== userId ||
      conversation.isArchived
    ) {
      continue;
    }

    // Extract snippet using constant
    const content = msg.content || "";
    const snippet = truncateAtWordBoundary(content, SNIPPET_MAX_LENGTH);

    // Store conversation data to avoid re-fetching later
    conversationMap.set(msg.conversationId, {
      conversationId: msg.conversationId,
      snippet,
      title: conversation.title || "Untitled",
      messageCount: conversation.messageCount || 0,
      updatedAt: conversation.updatedAt,
    });

    // Stop once we have enough
    if (conversationMap.size >= limit) {
      break;
    }
  }

  if (conversationMap.size === 0) {
    return [];
  }

  // Convert to array for batch processing
  const matchedConversations = Array.from(conversationMap.values());

  // Batch fetch contexts for all matched conversations in parallel
  const contexts = await Promise.all(
    matchedConversations.map(conv =>
      getConversationContext(ctx, conv.conversationId)
    )
  );

  // Build results with fetched contexts
  return matchedConversations.map((conv, index) => ({
    conversationId: conv.conversationId,
    title: conv.title,
    snippet: conv.snippet,
    matchedIn: "message" as const,
    messageCount: conv.messageCount,
    updatedAt: conv.updatedAt,
    relevantContext: contexts[index],
  }));
}

/**
 * Handler for searching through user's conversations to find relevant context.
 * Uses Convex full-text search indexes for O(1) tokenized, relevance-ranked search.
 * Two-phase approach: first search titles (fast), then message content if needed.
 *
 * Exported separately for unit testing.
 */
export async function searchUserConversationsHandler(
  ctx: QueryCtx,
  args: { userId: Id<"users">; query: string; limit?: number }
): Promise<ConversationSearchResult[]> {
  const { userId, query, limit = 10 } = args;

  // Handle empty/short queries by returning recent conversations
  if (!query.trim() || query.trim().length < 2) {
    // Use by_user_archived index to directly query non-archived conversations
    // This avoids fetching archived conversations that would be filtered out
    const recentConversations = await ctx.db
      .query("conversations")
      .withIndex("by_user_archived", q =>
        q.eq("userId", userId).eq("isArchived", false)
      )
      .order("desc")
      .take(limit);

    return recentConversations.map(conv => ({
      conversationId: conv._id,
      title: conv.title || "Untitled",
      snippet: conv.title || "No title",
      matchedIn: "title" as const,
      messageCount: conv.messageCount || 0,
      updatedAt: conv.updatedAt,
    }));
  }

  // Phase 1: Search conversation titles using searchIndex (fast, relevance-ranked)
  const titleResults = await searchInTitles(ctx, userId, query, limit);

  // If we have enough results, return them
  if (titleResults.length >= limit) {
    return titleResults.slice(0, limit);
  }

  // Phase 2: Search message content using searchIndex (if needed)
  const existingIds = new Set(titleResults.map(r => r.conversationId));
  const remainingLimit = limit - titleResults.length;
  const messageResults = await searchInMessages(
    ctx,
    userId,
    query,
    existingIds,
    remainingLimit
  );

  // Sort each category by recency (more recent conversations first)
  const sortByRecency = (
    a: ConversationSearchResult,
    b: ConversationSearchResult
  ) => b.updatedAt - a.updatedAt;

  titleResults.sort(sortByRecency);
  messageResults.sort(sortByRecency);

  // Combine results - title matches first (higher priority), then message matches
  const allResults = [...titleResults, ...messageResults];

  return allResults.slice(0, limit);
}

/**
 * Search through user's conversations to find relevant context.
 * Wraps the handler for use as a Convex internal query.
 */
export const searchUserConversations = internalQuery({
  args: {
    userId: v.id("users"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: searchUserConversationsHandler,
});
