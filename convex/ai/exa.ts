import { type Infer, v } from "convex/values";
import Exa from "exa-js";
import { WEB_SEARCH_MAX_RESULTS } from "@shared/constants";
import { type Citation, type WebSource } from "../types";
import { log } from "../lib/logger";

export const exaSearchArgs = v.object({
  query: v.string(),
  maxResults: v.optional(v.number()),
  searchType: v.optional(
    v.union(v.literal("keyword"), v.literal("neural"), v.literal("auto"))
  ),
  category: v.optional(
    v.union(
      v.literal("company"),
      v.literal("research paper"),
      v.literal("news"),
      v.literal("github"),
      v.literal("tweet"),
      v.literal("personal site"),
      v.literal("pdf"),
      v.literal("linkedin profile"),
      v.literal("financial report")
    )
  ),
  includeText: v.optional(v.boolean()),
  includeHighlights: v.optional(v.boolean()),
  // Date filtering for fresh content
  startPublishedDate: v.optional(v.string()),
  endPublishedDate: v.optional(v.string()),
  // Domain filtering
  excludeDomains: v.optional(v.array(v.string())),
  // Phrase filtering for precise matches
  mustIncludePhrase: v.optional(v.string()), // Must contain this exact phrase
  mustExcludePhrase: v.optional(v.string()), // Must NOT contain this phrase
});

export type ExaSearchArgs = Infer<typeof exaSearchArgs>;



export const exaResultsToCitations = (
  results: Array<{
    url: string;
    title?: string | null;
    text?: string;
    highlights?: string[];
    publishedDate?: string;
    author?: string;
    // Additional fields that Exa provides
    image?: string;
    favicon?: string;
    summary?: string;
    score?: number;
  }>
): Citation[] => {
  return results.map(result => {
    return {
      type: "url_citation" as const,
      url: result.url,
      title: result.title || "Web Source",
      snippet: result.text || "",
      cited_text: result.highlights?.[0] || result.text?.substring(0, 200),
    };
  });
};

export async function searchWithExa(
  apiKey: string,
  args: ExaSearchArgs
): Promise<{
  citations: Citation[];
  sources: WebSource[];
  context: string;
  rawResults: unknown;
}> {
      log.debug("🌐 searchWithExa called with query:", args.query);
  
  try {
    const exa = new Exa(apiKey);

    const searchOptions: Record<string, unknown> = {
      numResults: args.maxResults || WEB_SEARCH_MAX_RESULTS,
      type: args.searchType || "auto",
      useAutoprompt: true,
      category: args.category,
      startPublishedDate: args.startPublishedDate,
      endPublishedDate: args.endPublishedDate,
      ...(args.excludeDomains && { excludeDomains: args.excludeDomains }),
      text:
        args.includeText !== false
          ? {
              maxCharacters: 2000,
              includeHtmlTags: false,
            }
          : undefined,
      highlights:
        args.includeHighlights !== false
          ? {
              numSentences: 3,
              highlightsPerUrl: 2,
              query: args.query,
            }
          : undefined,
    };

    const searchResults = await exa.searchAndContents(
      args.query,
      searchOptions
    );

    const citations = exaResultsToCitations(searchResults.results);
    const sources: WebSource[] = searchResults.results.map(result => ({
      url: result.url,
      title: result.title || undefined,
    }));

    const context =
      searchResults.context ||
      searchResults.results
        .slice(0, 3)
        .map(r => {
          const result = r as {
            url: string;
            title?: string | null;
            text?: string;
            highlights?: string[];
          };
          return (
            result.text ||
            (result.highlights ? result.highlights.join(" ") : "") ||
            ""
          );
        })
        .filter(text => text.length > 0)
        .join("\n\n")
        .substring(0, 2000) ||
      "No relevant content found.";

    return {
      citations,
      sources,
      context,
      rawResults: searchResults,
    };
  } catch (error) {
    log.error("Exa search error:", error);
    throw new Error(
      `Failed to search with Exa: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// Get direct answers using Exa (using search for answer-like responses)
export async function getExaAnswer(
  apiKey: string,
  args: { question: string; numResults?: number }
): Promise<{
  answer: string;
  citations: Citation[];
  sources: WebSource[];
  context?: string;
}> {
  try {
    const exa = new Exa(apiKey);

    const results = await exa.answer(args.question, {
      text: true,
    });

    const citations = exaResultsToCitations(results.citations);
    const sources = results.citations.map(result => ({
      url: result.url,
      title: result.title || undefined,
    }));

    return {
      answer: results.answer as string,
      citations,
      sources,
      context: results.answer as string,
    };
  } catch (error) {
    log.error("Exa answer error:", error);
    throw new Error(
      `Failed to get answer from Exa: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// Find similar pages using Exa
export async function findSimilarWithExa(
  apiKey: string,
  args: { url: string; numResults?: number; includeText?: boolean }
): Promise<{
  citations: Citation[];
  sources: WebSource[];
  context: string;
  rawResults: unknown;
}> {
  try {
    const exa = new Exa(apiKey);

    const similarResults = await exa.findSimilarAndContents(args.url, {
      numResults: args.numResults || WEB_SEARCH_MAX_RESULTS,
      text: args.includeText !== false ? true : undefined,
    });

    const citations = exaResultsToCitations(similarResults.results);
    const sources = similarResults.results.map(result => ({
      url: result.url,
      title: result.title || undefined,
    }));

    // Extract context if available from Exa
    const resultWithContext = similarResults as typeof similarResults & {
      context?: string;
    };

    // For similar pages, create context from results
    const context =
      resultWithContext.context ||
      similarResults.results
        .slice(0, 3)
        .map(r => {
          const result = r as {
            url: string;
            title?: string | null;
            text?: string;
            highlights?: string[];
          };
          return (
            result.text ||
            (result.highlights ? result.highlights.join(" ") : "") ||
            ""
          );
        })
        .filter(text => text.length > 0)
        .join("\n\n")
        .substring(0, 2000) ||
      "No similar content found.";

    return {
      citations,
      sources,
      context,
      rawResults: similarResults,
    };
  } catch (error) {
    log.error("Exa find similar error:", error);
    throw new Error(
      `Failed to find similar with Exa: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}



export interface WebSearchArgs {
  query: string;
  searchType?: "search" | "answer" | "similar";
  category?: string;
  maxResults?: number;
  excludeDomains?: string[];
}

export interface WebSearchResult {
  citations: Citation[];
  sources: WebSource[];
  context: string;
  rawResults: unknown;
}

/**
 * Exa search function that handles all search types
 */
export async function performWebSearch(
  apiKey: string,
  args: WebSearchArgs
): Promise<WebSearchResult> {
  log.debug("🔍 performWebSearch called with:", {
    query: args.query,
    searchType: args.searchType,
    maxResults: args.maxResults,
    hasApiKey: !!apiKey
  });
  
  const searchType = args.searchType || "search";
  const maxResults = args.maxResults || WEB_SEARCH_MAX_RESULTS; // Default to 12 results

  try {
    switch (searchType) {
      case "answer": {
        const answerResult = await getExaAnswer(apiKey, {
          question: args.query,
          numResults: maxResults,
        });

        const result = {
          citations: answerResult.citations,
          sources: answerResult.sources,
          context: answerResult.context || answerResult.answer,
          rawResults: { answer: answerResult.answer },
        };
        logSearchSuccess("answer", result);
        return result;
      }

      case "similar": {
        const urlMatch = args.query.match(/(?:https?:\/\/|www\.)[^\s]+/);
        if (urlMatch) {
          const result = await findSimilarWithExa(apiKey, {
            url: urlMatch[0],
            numResults: maxResults,
            includeText: true,
          });
          logSearchSuccess("similar", result);
          return result;
        }

        const result = await searchWithExa(apiKey, {
          query: args.query,
          maxResults,
          searchType: "auto",
          category: args.category as
            | "company"
            | "research paper"
            | "news"
            | "github"
            | "tweet"
            | "personal site"
            | "pdf"
            | "linkedin profile"
            | "financial report"
            | undefined,
          excludeDomains: args.excludeDomains,
          includeText: true,
          includeHighlights: true,
        });
        logSearchSuccess("similar-fallback", result);
        return result;
      }

      case "search":
      default: {
        // Regular search with optional category
        const result = await searchWithExa(apiKey, {
          query: args.query,
          maxResults,
          searchType: "auto",
          category: args.category as
            | "company"
            | "research paper"
            | "news"
            | "github"
            | "tweet"
            | "personal site"
            | "pdf"
            | "linkedin profile"
            | "financial report"
            | undefined,
          excludeDomains: args.excludeDomains,
          includeText: true,
          includeHighlights: true,
        });
        logSearchSuccess("search", result);
        return result;
      }
    }
  } catch (error) {
          log.error(`❌ Exa ${searchType} error:`, error);
    throw new Error(
      `Failed to perform ${searchType} with Exa: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

// Add success logging after the switch statement
function logSearchSuccess(searchType: string, result: WebSearchResult) {
      log.debug(`✅ EXA ${searchType} completed successfully:`, {
    citationsCount: result.citations.length,
    sourcesCount: result.sources.length,
    contextLength: result.context.length,
    hasRawResults: !!result.rawResults
  });
}

/**
 * Extract search context from results based on search type
 * Handles the special case of answer results
 */
export function extractSearchContext(
  searchType: string,
  searchResult: WebSearchResult
): string {
  if (searchType === "answer") {
    const answerData = searchResult.rawResults as { answer?: string };
    if (answerData.answer) {
      return answerData.answer;
    }
  }

  return searchResult.context || "";
}
