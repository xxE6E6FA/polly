import { tool } from "ai";
import { z } from 'zod/v3';
import { performWebSearch, type WebSearchResult } from "../exa";
import type { Citation } from "../../types";

/**
 * Clean snippet text by removing common boilerplate patterns.
 * Strips navigation, social share links, and other cruft from web scrapes.
 */
function cleanSnippet(text: string): string {
  if (!text) return "";

  return text
    // Remove markdown-style links but keep the text: [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Remove standalone URLs
    .replace(/https?:\/\/[^\s]+/g, "")
    // Remove common nav patterns
    .replace(/^(Menu|Navigation|Skip to [Cc]ontent|Home|News|Sport|Business|Culture|Arts|Travel)[\s\n]*/gm, "")
    // Remove social share text
    .replace(/(Share|Tweet|Email|Facebook|Twitter|LinkedIn|Reddit|Whatsapp|Bluesky)[\s\n]*/gi, "")
    // Remove "IE 11 is not supported" type messages
    .replace(/IE \d+ is not supported[^.]*\./gi, "")
    // Remove "For an optimal experience" messages
    .replace(/For an optimal experience[^.]*\./gi, "")
    // Collapse multiple newlines
    .replace(/\n{3,}/g, "\n\n")
    // Collapse multiple spaces
    .replace(/  +/g, " ")
    // Trim
    .trim();
}

/**
 * Web search tool schema for AI SDK tool calling.
 * Models with tool support can use this to search the web when they need
 * current information, real-time data, or factual verification.
 */
export const webSearchToolSchema = z.object({
  query: z.string().describe("The search query to find relevant information"),
  searchMode: z
    .enum(["instant", "fast", "deep", "auto"])
    .optional()
    .default("instant")
    .describe(
      "Search mode: 'instant' for ultra-fast results (<200ms, default), 'fast' for quick results (~350ms), 'deep' for comprehensive research (~3.5s), 'auto' for balanced"
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
  - 'instant': Default for most queries (<200ms, ultra-fast)
  - 'fast': Quick results (~350ms)
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
          searchMode: searchMode || "instant",
          searchType: searchType || "search",
          category,
        };
      } catch (error) {
        return {
          success: false,
          citations: [],
          context: "",
          searchQuery: query,
          searchMode: searchMode || "instant",
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
 * Optimized for token efficiency - removes boilerplate and limits snippet length.
 */
function buildContextSummary(result: WebSearchResult): string {
  if (!result.citations.length) {
    return "No relevant results found.";
  }

  const summaryParts: string[] = [
    `Found ${result.citations.length} sources:\n`,
  ];

  result.citations.forEach((citation, index) => {
    const parts: string[] = [`[${index + 1}] ${citation.title}`];

    if (citation.siteName) {
      parts.push(`   Source: ${citation.siteName}`);
    }

    if (citation.publishedDate) {
      // Format date more concisely
      const date = new Date(citation.publishedDate);
      const formatted = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      parts.push(`   Date: ${formatted}`);
    }

    if (citation.snippet) {
      // Clean and truncate snippets for token efficiency
      const cleaned = cleanSnippet(citation.snippet);
      const snippet = cleaned.length > 300
        ? `${cleaned.substring(0, 300)}...`
        : cleaned;
      if (snippet) {
        parts.push(`   Content: ${snippet}`);
      }
    }

    summaryParts.push(parts.join("\n"));
  });

  // Citation reminder for the LLM - make it emphatic
  summaryParts.push("\n---\nIMPORTANT: You MUST cite these sources in your response using [1], [2], etc.\nPlace citations after punctuation: \"The empire fell in 476 AD.[1]\"");

  return summaryParts.join("\n\n");
}

/**
 * Tool name constant for reference
 */
export const WEB_SEARCH_TOOL_NAME = "webSearch" as const;
