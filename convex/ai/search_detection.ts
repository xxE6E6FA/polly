// Determine which Exa feature to use based on query type
export type ExaFeatureType = "search" | "answer" | "similar";
export type SearchMode = "instant" | "fast" | "auto" | "deep";

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
    Decide if this query REQUIRES web search. Output only "yes" or "no".

    SEARCH NEEDED (yes):
    - Current events, news, things happening now
    - Real-time data: prices, weather, scores, stock quotes
    - Recent releases: "latest iPhone", "new React features", "2024 election results"
    - Specific dates/facts you're uncertain about
    - Questions with "latest", "current", "today", "this week", "recent"
    - Verification of facts that may have changed

    NO SEARCH (no):
    - Coding help, debugging, technical explanations
    - How-to questions, tutorials, explanations
    - Established concepts, definitions, theory
    - Greetings, casual conversation
    - Creative writing, brainstorming
    - Math, logic, reasoning tasks
    - General knowledge that doesn't change

    Examples:
    "How do I use React hooks?" → no
    "What is the current price of Bitcoin?" → yes
    "Explain quantum computing" → no
    "Who won the Super Bowl 2024?" → yes
    "Write a Python function to sort a list" → no
    "What are Apple's latest product announcements?" → yes
    "What is recursion?" → no
    "Is GPT-5 released yet?" → yes

    Query: "${context.userQuery}"
    Answer (yes/no):
  `;
};

export const generateSearchStrategy = (
  context: SearchDecisionContext
): string => {
  return dedent`
    Create a search strategy for this query. Output JSON only.

    Query: "${context.userQuery}"

    Output format:
    {"type":"search|answer","mode":"instant|fast|deep","category":null|"news"|"company"|"github"|"research paper","query":"optimized search query"}

    Guidelines:
    - type "answer": Simple factual questions (who, what, when, how much)
    - type "search": Complex topics, comparisons, explanations (default)
    - mode "instant": Default for most queries, ultra-fast (<200ms)
    - mode "fast": Quick results (~350ms), use when instant is insufficient
    - mode "deep": Research, academic, comprehensive analysis
    - category: Only set if clearly applicable (news for current events, github for code/repos, company for business info)
    - query: Remove conversational filler, focus on key terms

    Examples:
    "What's the current Bitcoin price?" → {"type":"answer","mode":"instant","category":null,"query":"Bitcoin price USD"}
    "Latest news about OpenAI" → {"type":"search","mode":"instant","category":"news","query":"OpenAI news announcements"}
    "Comprehensive analysis of React vs Vue in 2024" → {"type":"search","mode":"deep","category":null,"query":"React vs Vue comparison 2024 performance features"}
    "Who is the CEO of Anthropic?" → {"type":"answer","mode":"instant","category":"company","query":"Anthropic CEO"}

    JSON:
  `;
};

export const parseSearchNeedAssessment = (
  llmResponse: string
): SearchNeedAssessment => {
  try {
    const trimmed = llmResponse.trim().toLowerCase();

    // Check for "yes" (needs search) or "no" (doesn't need search)
    if (trimmed === "yes" || trimmed.startsWith("yes")) {
      return { canAnswerConfidently: false }; // Needs search
    }
    if (trimmed === "no" || trimmed.startsWith("no")) {
      return { canAnswerConfidently: true }; // Can answer without search
    }

    // Legacy support for true/false responses
    if (trimmed === "true") {
      return { canAnswerConfidently: true };
    }
    if (trimmed === "false") {
      return { canAnswerConfidently: false };
    }

    // Fallback: look for keywords in the response
    if (trimmed.includes("search") || trimmed.includes("yes")) {
      return { canAnswerConfidently: false };
    }

    // Conservative default: no search
    return { canAnswerConfidently: true };
  } catch (error) {
    console.error("Failed to parse search need assessment:", error);
    return { canAnswerConfidently: true }; // Conservative: no search on error
  }
};

export const parseSearchStrategy = (
  llmResponse: string,
  userQuery: string
): SearchDecision => {
  // Helper to detect research queries for fallback
  const isResearchQuery = (query: string): boolean => {
    const keywords = [
      "research",
      "comprehensive",
      "in-depth",
      "analysis",
      "study",
      "examine",
      "compare",
    ];
    const lower = query.toLowerCase();
    return keywords.some(k => lower.includes(k));
  };

  try {
    // Extract JSON from the response
    const jsonMatch = llmResponse.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Support both old format (searchType/searchMode) and new format (type/mode)
    const searchType = parsed.type || parsed.searchType || "search";
    const searchMode =
      parsed.mode || parsed.searchMode || (isResearchQuery(userQuery) ? "deep" : "instant");
    const suggestedQuery = parsed.query || parsed.suggestedQuery || userQuery;

    return {
      shouldSearch: true,
      searchType: searchType as ExaFeatureType,
      searchMode: searchMode as SearchMode,
      category: parsed.category || undefined,
      reasoning: parsed.reasoning || "Search strategy determined",
      confidence: 0.8,
      suggestedSources: parsed.suggestedSources || 8,
      suggestedQuery,
    };
  } catch (error) {
    console.error("Failed to parse search strategy:", error);

    // Fallback: basic search with intelligent mode detection
    return {
      shouldSearch: true,
      searchType: "search",
      searchMode: isResearchQuery(userQuery) ? "deep" : "instant",
      reasoning: "Fallback due to parsing error",
      confidence: 0.8,
      suggestedSources: 8,
      suggestedQuery: userQuery,
    };
  }
};
