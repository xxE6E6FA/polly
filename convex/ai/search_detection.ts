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

export interface SearchNeedAssessment {
  canAnswerConfidently: boolean;
  reasoning: string;
  confidence: number;
  knowledgeGaps?: string[];
  temporalConcerns?: boolean;
}

import dedent from "dedent";

export const generateSearchNeedAssessment = (
  context: SearchDecisionContext
): string => {
  return dedent`
    You are determining whether you can answer a user's query confidently using only your training data, or if it would benefit from external sources.

    Ask yourself: "Can I answer this query confidently with my training data, or would it benefit from current information/web search?"

    Most queries can be answered confidently with your training data and do NOT need external sources:
    - Conversational messages, greetings, thanks
    - Explanations of established concepts, definitions, how-to questions
    - Code help, debugging, programming explanations
    - Educational content about well-established topics

    Only queries that would genuinely benefit from external sources need search:
    - Current events, news, recent developments
    - Real-time data (prices, weather, etc.)
    - Specific recent information or updates
    - Questions about people, companies, or events requiring current facts

    OUTPUT (JSON only):
    {
      "canAnswerConfidently": boolean,
      "reasoning": "brief explanation of why you can/cannot answer confidently without external sources",
      "confidence": 0.0-1.0,
      "queryType": "conversational" | "factual" | "instructional" | "current_events" | "unclear",
      "knowledgeGaps": ["specific areas where you lack information"] (optional),
      "temporalConcerns": boolean (true if the question involves current/dynamic data)
    }

    USER QUERY: "${context.userQuery}"

    JSON:
  `;
};

export const generateSearchStrategy = (
  context: SearchDecisionContext
): string => {
  let prompt = dedent`
    The LLM has determined it needs external data to answer this query. Determine the optimal search strategy.

    OUTPUT (JSON only):
    {
      "searchType": "search" | "answer" | "similar",
      "category": null | "news" | "company" | "research paper" | "github" | "tweet" | "pdf" | "financial report",
      "reasoning": "brief explanation of search strategy",
      "suggestedSources": 12,
      "suggestedQuery": "optimized query if different from original"
    }

    SEARCH TYPES:
    - "answer": For specific, factual questions needing direct answers (CEO names, prices, dates, definitions)
    - "search": For general information gathering, research, or complex topics (default choice)
    - "similar": Only when a URL is provided and user wants similar content

    CATEGORIES (use sparingly - default to null for 95% of queries):
    - "news": Breaking news, current events, recent developments
    - "company": Corporate information, earnings, leadership changes
    - "research paper": Academic papers, scientific studies
    - "github": Code repositories, open source projects
    - "tweet": Social media discussions, trending topics
    - "pdf": When specifically looking for document formats
    - "financial report": Financial data, earnings, market data

    QUERY OPTIMIZATION:
    - Improve clarity and searchability
    - Add relevant keywords
    - Remove conversational elements
    - Keep core intent intact
  `;

  // Add conversation context if relevant
  if (context.conversationHistory && context.conversationHistory.length > 0) {
    const hasRecentSearches = context.conversationHistory.some(
      msg => msg.hasSearchResults
    );
    if (hasRecentSearches) {
      prompt += `\n\n⚠️ Recent searches performed - consider if this is a follow-up question.`;
    }
  }

  prompt += `\n\nORIGINAL QUERY: "${context.userQuery}"\n\nJSON:`;

  return prompt;
};

export const parseSearchNeedAssessment = (
  llmResponse: string
): SearchNeedAssessment => {
  try {
    // Extract JSON from the response
    const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in search need assessment response");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      canAnswerConfidently: Boolean(parsed.canAnswerConfidently),
      reasoning: parsed.reasoning || "No reasoning provided",
      confidence: parsed.confidence || 0.5,
      knowledgeGaps: parsed.knowledgeGaps || [],
      temporalConcerns: Boolean(parsed.temporalConcerns),
    };
  } catch (error) {
    console.error("Failed to parse search need assessment response:", error);

    // Conservative fallback: assume we cannot answer confidently
    return {
      canAnswerConfidently: false,
      reasoning: "Failed to parse search need assessment, defaulting to search",
      confidence: 0.3,
      temporalConcerns: true,
    };
  }
};

export const parseSearchStrategy = (
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
      shouldSearch: true, // Always true since we've already determined we need to search
      searchType: parsed.searchType || "search",
      category: parsed.category || undefined,
      reasoning: parsed.reasoning || "No reasoning provided",
      confidence: 0.8, // Set a default high confidence since we're committing to search
      suggestedSources: parsed.suggestedSources || 12,
      suggestedQuery: parsed.suggestedQuery || userQuery,
    };
  } catch (error) {
    console.error("Failed to parse search strategy response:", error);

    // If we can't parse the response, default to basic search
    return {
      shouldSearch: true, // Always true since we've already determined we need to search
      searchType: "search",
      reasoning: "Fallback decision due to parsing error",
      confidence: 0.8, // Set a default high confidence since we're committing to search
      suggestedSources: 12,
      suggestedQuery: userQuery,
    };
  }
};
