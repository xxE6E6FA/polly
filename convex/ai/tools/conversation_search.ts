import { tool } from "ai";
import { z } from "zod/v3";
import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { internal } from "../../_generated/api";
import type { ConversationSearchResult } from "../../conversation_search";

/**
 * Conversation search tool schema for AI SDK tool calling.
 * Models with tool support can use this to search the user's past conversations.
 */
export const conversationSearchToolSchema = z.object({
  mode: z
    .enum(["recent", "search"])
    .describe(
      "Mode: 'recent' to list recent conversations (for questions like 'what have we discussed?'), 'search' to find specific content"
    ),
  query: z
    .string()
    .optional()
    .default("")
    .describe("Search terms (required for 'search' mode, ignored for 'recent' mode)"),
  limit: z
    .number()
    .optional()
    .default(10)
    .describe("Maximum number of conversations to return (default: 10)"),
});

export type ConversationSearchToolParams = z.infer<
  typeof conversationSearchToolSchema
>;

/**
 * Citation for a conversation reference.
 */
export interface ConversationCitation {
  type: "conversation_citation";
  conversationId: string;
  title: string;
  matchedIn: "title" | "summary" | "message";
  snippet?: string;
  messageCount: number;
  updatedAt: number;
}

/**
 * Result returned from the conversation search tool.
 * Contains results and context for the model to use.
 */
export interface ConversationSearchToolResult {
  success: boolean;
  results: ConversationSearchResult[];
  citations: ConversationCitation[];
  context: string;
  searchQuery: string;
  error?: string;
}

export const CONVERSATION_SEARCH_TOOL_NAME = "conversationSearch" as const;

/**
 * Convert search results to citations.
 */
function buildCitations(results: ConversationSearchResult[]): ConversationCitation[] {
  return results.map(result => ({
    type: "conversation_citation" as const,
    conversationId: result.conversationId,
    title: result.title,
    matchedIn: result.matchedIn,
    snippet: result.snippet,
    messageCount: result.messageCount,
    updatedAt: result.updatedAt,
  }));
}

/**
 * Build a formatted context string from search results for the LLM.
 */
function buildConversationContext(
  results: ConversationSearchResult[]
): string {
  if (!results.length) {
    return "No matching conversations found in your history.";
  }

  const parts: string[] = [
    `Found ${results.length} relevant conversation(s):\n`,
  ];

  for (const [index, result] of results.entries()) {
    const date = new Date(result.updatedAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    parts.push(`[${index + 1}] "${result.title}" (${date}, ${result.messageCount} messages)`);
    parts.push(`    Matched in: ${result.matchedIn}`);

    // Show snippet for message matches, or just title for title matches
    if (result.matchedIn === "message") {
      parts.push(`    Matched content: ${result.snippet}`);
    }

    // Show conversation content if available
    if (result.relevantContext) {
      parts.push(`    Conversation preview:`);
      // Indent each line of the context
      for (const line of result.relevantContext.split("\n")) {
        parts.push(`      ${line}`);
      }
    }
    parts.push(""); // Empty line between results
  }

  parts.push(
    "---\nIntegrate this context naturally into your response. Don't explicitly mention searching - respond as if you remember these conversations."
  );

  return parts.join("\n");
}

/**
 * Creates the conversation search tool for AI SDK streamText.
 * Requires userId for user isolation - must be passed from authenticated context.
 *
 * @param ctx - Convex action context for running queries
 * @param userId - The authenticated user's ID for scoping searches
 * @param currentConversationId - Optional ID of the current conversation to exclude from results
 */
export function createConversationSearchTool(
  ctx: ActionCtx,
  userId: Id<"users">,
  currentConversationId?: Id<"conversations">
) {
  return tool({
    description: `Search through the user's past conversations to find relevant context and information.

TWO MODES:
- mode="recent": List recent conversations. Use for "what have we discussed?", "what did we talk about recently?", "show my conversations"
- mode="search": Search for specific content. Use for "find where we discussed X", "what did I say about Y"

WHEN TO USE THIS TOOL:

1. LISTING RECENT (mode="recent"):
   - "what have we discussed?"
   - "what did we talk about recently?"
   - "show me my recent conversations"
   - "what topics have we covered?"

2. SEARCHING CONTENT (mode="search"):
   - "remember when we talked about X" → search for X
   - "what did I say about Y" → search for Y
   - "find that conversation about Z" → search for Z
   - User references "the project" without specifying → search for project-related terms

3. DO NOT USE WHEN:
   - User provides complete context in their message
   - Question is about general knowledge (use webSearch instead)
   - It's a brand new topic with no possible history`,
    inputSchema: conversationSearchToolSchema,
    execute: async ({
      mode,
      query,
      limit,
    }): Promise<ConversationSearchToolResult> => {
      // For "recent" mode, use empty query to trigger recent conversations fallback
      const effectiveQuery = mode === "recent" ? "" : query;
      console.log(
        `[ConversationSearch] Tool called with mode="${mode}", query="${effectiveQuery}", limit=${limit}, userId=${userId}`
      );

      try {
        const allResults = await ctx.runQuery(
          internal.conversation_search.searchUserConversations,
          {
            userId,
            query: effectiveQuery,
            limit: limit + 1, // Get one extra in case we filter out current
          }
        );

        // Filter out the current conversation (user already has this context)
        const results = currentConversationId
          ? allResults.filter(r => r.conversationId !== currentConversationId)
          : allResults;

        // Trim to requested limit
        const limitedResults = results.slice(0, limit);

        console.log(
          `[ConversationSearch] Found ${limitedResults.length} results for mode="${mode}"${currentConversationId ? " (excluded current conversation)" : ""}`
        );
        if (limitedResults.length > 0) {
          console.log(
            `[ConversationSearch] Top results:`,
            limitedResults.slice(0, 3).map((r) => ({
              title: r.title,
              matchedIn: r.matchedIn,
              snippet: r.snippet.substring(0, 100),
            }))
          );
        }

        return {
          success: true,
          results: limitedResults,
          citations: buildCitations(limitedResults),
          context: buildConversationContext(limitedResults),
          searchQuery: effectiveQuery,
        };
      } catch (error) {
        console.error(`[ConversationSearch] Error searching:`, error);
        return {
          success: false,
          results: [],
          citations: [],
          context: "",
          searchQuery: effectiveQuery,
          error:
            error instanceof Error ? error.message : "Unknown error occurred",
        };
      }
    },
  });
}
