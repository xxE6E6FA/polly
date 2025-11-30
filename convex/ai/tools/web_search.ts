import { tool } from "ai";
import { z } from "zod";
import { performWebSearch, type WebSearchResult } from "../exa";
import type { Citation } from "../../types";

/**
 * Web search tool schema for AI SDK tool calling.
 * Models with tool support can use this to search the web when they need
 * current information, real-time data, or factual verification.
 */
export const webSearchToolSchema = z.object({
  query: z.string().describe("The search query to find relevant information"),
  searchMode: z
    .enum(["fast", "deep", "auto"])
    .optional()
    .default("fast")
    .describe(
      "Search mode: 'fast' for quick results (~350ms), 'deep' for comprehensive research (~3.5s), 'auto' for balanced"
    ),
  searchType: z
    .enum(["search", "answer", "similar"])
    .optional()
    .default("search")
    .describe(
      "Search type: 'search' for general web search, 'answer' for direct factual answers, 'similar' for finding similar pages to a URL"
    ),
  category: z
    .enum([
      "news",
      "company",
      "research paper",
      "github",
      "tweet",
      "pdf",
      "financial report",
    ])
    .optional()
    .describe("Optional category to filter results"),
});

export type WebSearchToolParams = z.infer<typeof webSearchToolSchema>;

/**
 * Result returned from the web search tool.
 * Contains citations and context for the model to use.
 */
export interface WebSearchToolResult {
  success: boolean;
  citations: Citation[];
  context: string;
  searchQuery: string;
  searchMode: string;
  searchType: string;
  category?: string;
  error?: string;
}

/**
 * Creates the web search tool for AI SDK streamText.
 * Call this with the Exa API key to get a configured tool.
 */
export function createWebSearchTool(exaApiKey: string) {
  return tool({
    description: `Search the web for current information, real-time data, recent events, or factual verification.

Use this tool when you need:
- Current events or breaking news
- Real-time data (prices, weather, sports scores)
- Recent information about people, companies, or events
- Verification of facts you're uncertain about
- Technical documentation or research papers

Do NOT use this tool for:
- General knowledge you already know confidently
- Explanations of established concepts
- Code help or debugging
- Casual conversation

Parameters:
- searchType: The type of search operation
  - 'search': General web search (default)
  - 'answer': Direct factual questions (who is CEO of X, what is the price of Y)
  - 'similar': Find pages similar to a given URL
- searchMode: Search speed/depth tradeoff
  - 'fast': Default for most queries (~350ms)
  - 'deep': For comprehensive research (~3.5s)
  - 'auto': Let the system decide
- category: Optional filter to narrow results by type
  - 'news': For current events, breaking news, recent articles
  - 'company': For business/corporate information
  - 'research paper': For academic content
  - 'github': For code repositories
  - 'tweet': For social media posts
  - 'pdf': For PDF documents
  - 'financial report': For financial data

Example: For "latest AI news", use searchType='search' with category='news'.`,
    inputSchema: webSearchToolSchema,
    execute: async ({ query, searchMode, searchType, category }): Promise<WebSearchToolResult> => {
      try {
        const result = await performWebSearch(exaApiKey, {
          query,
          searchType,
          searchMode,
          category,
          maxResults: 8,
        });

        return {
          success: true,
          citations: result.citations,
          context: buildContextSummary(result),
          searchQuery: query,
          searchMode: searchMode || "fast",
          searchType: searchType || "search",
          category,
        };
      } catch (error) {
        return {
          success: false,
          citations: [],
          context: "",
          searchQuery: query,
          searchMode: searchMode || "fast",
          searchType: searchType || "search",
          error:
            error instanceof Error ? error.message : "Unknown error occurred",
        };
      }
    },
  });
}

/**
 * Build a structured context summary from search results.
 * This gives the model a clean view of the search results.
 */
function buildContextSummary(result: WebSearchResult): string {
  if (!result.citations.length) {
    return "No relevant results found.";
  }

  const summaryParts: string[] = [
    `Found ${result.citations.length} relevant sources:\n`,
  ];

  result.citations.forEach((citation, index) => {
    const parts: string[] = [`[${index + 1}] ${citation.title}`];

    if (citation.siteName) {
      parts.push(`   Source: ${citation.siteName}`);
    }

    if (citation.publishedDate) {
      parts.push(`   Published: ${citation.publishedDate}`);
    }

    if (citation.snippet) {
      // Truncate long snippets
      const snippet =
        citation.snippet.length > 500
          ? `${citation.snippet.substring(0, 500)}...`
          : citation.snippet;
      parts.push(`   Content: ${snippet}`);
    }

    parts.push(`   URL: ${citation.url}`);
    summaryParts.push(parts.join("\n"));
  });

  // Add the full context if available
  if (result.context && result.context !== "No relevant content found.") {
    summaryParts.push("\n--- Detailed Context ---\n");
    summaryParts.push(result.context);
  }

  return summaryParts.join("\n\n");
}

/**
 * Tool name constant for reference
 */
export const WEB_SEARCH_TOOL_NAME = "webSearch" as const;
