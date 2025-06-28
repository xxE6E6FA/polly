// Determine which Exa feature to use based on query type
export type ExaFeatureType = "search" | "answer" | "similar";

export interface SearchDecision {
  shouldSearch: boolean;
  searchType: ExaFeatureType;
  category?: string;
  reasoning: string;
  confidence: number;
  suggestedSources?: number;
  suggestedQuery?: string;
}

export interface SearchDecisionContext {
  userQuery: string;
  conversationHistory?: Array<{
    role: "user" | "assistant";
    content: string;
    hasSearchResults?: boolean;
  }>;
  previousSearches?: Array<{
    query: string;
    searchType: string;
    category?: string;
    resultCount: number;
  }>;
}

export const generateSearchDecisionPromptWithContext = (
  context: SearchDecisionContext
): string => {
  let prompt = `Analyze if web search is needed for this query.

OUTPUT (JSON only):
{
  "shouldSearch": boolean,
  "searchType": "search" | "answer" | "similar",
  "category": null | "news" | "company" | "research paper" | "github" | "tweet" | "pdf" | "financial report",
  "reasoning": "brief explanation",
  "confidence": 0.0-1.0,
  "suggestedSources": 12,
  "suggestedQuery": "optimized query if different"
}

DON'T SEARCH FOR:
- Meta-conversation ("what did you say", "remind me")
- Code analysis ("fix this", "review this code")
- Basic knowledge (capitals, definitions, pre-2023 tech)
- Opinion requests ("what do you think")

DO SEARCH FOR:
- Current info (prices, "latest", "today", "now")
- Post-2023 developments
- Dynamic data (CEOs, versions, statistics)
- URL similarity requests

SEARCH TYPES:
- "answer": Quick facts (CEO names, prices, dates)
- "search": General info gathering (default)
- "similar": When URL provided + "similar" requested

CATEGORIES: Default to null unless very specific (99% should be null)

CONFIDENCE: 0.8+ for clear temporal markers, 0.3- for established facts`;

  // Add conversation context if relevant
  if (context.conversationHistory && context.conversationHistory.length > 0) {
    const hasRecentSearches = context.conversationHistory.some(
      msg => msg.hasSearchResults
    );
    if (hasRecentSearches) {
      prompt += `\n\n⚠️ Recent searches performed - avoid redundant searches.`;
    }
  }

  prompt += `\n\nQUERY: "${context.userQuery}"\n\nJSON:`;

  return prompt;
};

export const parseSearchDecision = (
  llmResponse: string,
  userQuery: string
): SearchDecision => {
  try {
    // Extract JSON from the response
    const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      shouldSearch: Boolean(parsed.shouldSearch),
      searchType: parsed.searchType || "search",
      category: parsed.category || undefined,
      reasoning: parsed.reasoning || "No reasoning provided",
      confidence: parsed.confidence || 0.5,
      suggestedSources: parsed.suggestedSources || 12,
      suggestedQuery: parsed.suggestedQuery || userQuery,
    };
  } catch (error) {
    console.error("Failed to parse LLM response:", error);

    // Don't search if the LLM failed to parse the response
    return {
      shouldSearch: false,
      searchType: "search",
      reasoning: "Fallback decision",
      confidence: 0.3,
      suggestedSources: 12,
      suggestedQuery: userQuery,
    };
  }
};
