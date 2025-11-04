// Determine which Exa feature to use based on query type
export type ExaFeatureType = "search" | "answer" | "similar";
export type SearchMode = "fast" | "auto" | "deep";

export interface SearchDecision {
  shouldSearch: boolean;
  searchType: ExaFeatureType;
  searchMode?: SearchMode;
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
}

import dedent from "dedent";

export const generateSearchNeedAssessment = (
  context: SearchDecisionContext
): string => {
  
  return dedent`
    You are determining whether you can answer a user's query confidently using only your training data, or if it would benefit from external sources.

    IMPORTANT: Be VERY conservative. Most queries should NOT trigger search. Only search when you are highly confident that current/real-time information is essential.

    Ask yourself: "Can I answer this query confidently with my training data, or would it absolutely require current information/web search?"

    MOST queries can be answered confidently with your training data and do NOT need external sources:
    - Conversational messages, greetings, thanks, casual chat
    - Explanations of established concepts, definitions, how-to questions
    - Code help, debugging, programming explanations, technical questions
    - Educational content about well-established topics
    - General advice, explanations, tutorials
    - Vague or unclear questions that don't specify current information needs
    - Questions about general concepts, theories, or established knowledge
    - Requests for explanations, examples, or guidance

    ONLY search for queries that absolutely require current/real-time information:
    - Specific current events, breaking news, recent developments (last few days/weeks)
    - Real-time data (current prices, weather, stock prices, live sports scores)
    - Specific recent information about people, companies, or events (last few months)
    - Questions explicitly asking for "latest", "current", "recent", or "today's" information
    - Specific dates, times, or time-sensitive information that you cannot know from training data

    BE EXTRA CONSERVATIVE with:
    - Vague questions that don't specify time sensitivity
    - General questions that could be answered with established knowledge
    - Questions that don't explicitly ask for current information
    - Follow-up questions that don't clearly need new information

    OUTPUT: Respond with only "true" if you can answer confidently with your training data, or "false" if you need external sources.

    USER QUERY: "${context.userQuery}"

    Answer:
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
      "searchMode": "fast" | "auto" | "deep",
      "category": null | "news" | "company" | "research paper" | "github" | "tweet" | "pdf" | "financial report",
      "reasoning": "brief explanation of search strategy",
      "suggestedSources": 12,
      "suggestedQuery": "optimized query if different from original"
    }

    SEARCH TYPES:
    - "answer": For specific, factual questions needing direct answers (CEO names, prices, dates, definitions)
    - "search": For general information gathering, research, or complex topics (default choice)
    - "similar": Only when a URL is provided and user wants similar content

    SEARCH MODES:
    - "fast": Default for most queries (<350ms, best UX, cost-effective)
    - "deep": For research, academic, comprehensive analysis queries (3.5s, highest quality, use when query explicitly asks for research/in-depth analysis)
    - "auto": Balanced mode (use sparingly as fallback)

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
    // Extract true/false from the response
    const trimmedResponse = llmResponse.trim().toLowerCase();
    const isTrue = trimmedResponse === "true";
    const isFalse = trimmedResponse === "false";
    
    if (isTrue || isFalse) {
      return {
        canAnswerConfidently: isTrue,
      };
    }
    
    // Fallback: try to extract boolean from JSON if present
    const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        canAnswerConfidently: Boolean(parsed.canAnswerConfidently),
      };
    }
    
    throw new Error("No valid boolean found in search need assessment response");
  } catch (error) {
    console.error("Failed to parse search need assessment response:", error);

    // Conservative fallback: assume we can answer confidently (no search)
    return {
      canAnswerConfidently: true,
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

    function detectResearchQuery(query: string): boolean {
      const researchKeywords = [
        "research",
        "academic",
        "comprehensive",
        "detailed analysis",
        "in-depth",
        "thorough",
        "study",
        "investigation",
        "examine",
        "analyze",
        "literature review",
        "systematic review",
      ];
      const lowerQuery = query.toLowerCase();
      return researchKeywords.some(keyword => lowerQuery.includes(keyword));
    }

    const searchMode = parsed.searchMode || (detectResearchQuery(userQuery) ? "deep" : "fast");

    return {
      shouldSearch: true, // Always true since we've already determined we need to search
      searchType: parsed.searchType || "search",
      searchMode,
      category: parsed.category || undefined,
      reasoning: parsed.reasoning || "No reasoning provided",
      confidence: 0.8, // Set a default high confidence since we're committing to search
      suggestedSources: parsed.suggestedSources || 12,
      suggestedQuery: parsed.suggestedQuery || userQuery,
    };
  } catch (error) {
    console.error("Failed to parse search strategy response:", error);

    function detectResearchQuery(query: string): boolean {
      const researchKeywords = [
        "research",
        "academic",
        "comprehensive",
        "detailed analysis",
        "in-depth",
        "thorough",
        "study",
        "investigation",
        "examine",
        "analyze",
        "literature review",
        "systematic review",
      ];
      const lowerQuery = query.toLowerCase();
      return researchKeywords.some(keyword => lowerQuery.includes(keyword));
    }

    const searchMode = detectResearchQuery(userQuery) ? "deep" : "fast";

    // If we can't parse the response, default to basic search
    return {
      shouldSearch: true, // Always true since we've already determined we need to search
      searchType: "search",
      searchMode,
      reasoning: "Fallback decision due to parsing error",
      confidence: 0.8, // Set a default high confidence since we're committing to search
      suggestedSources: 12,
      suggestedQuery: userQuery,
    };
  }
};
