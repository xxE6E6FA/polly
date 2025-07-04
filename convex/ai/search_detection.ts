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

export interface SelfAssessmentResult {
  canAnswerConfidently: boolean;
  reasoning: string;
  confidence: number;
  knowledgeGaps?: string[];
  temporalConcerns?: boolean;
}

export const generateSelfAssessmentPrompt = (
  context: SearchDecisionContext
): string => {
  return `You are an AI assistant evaluating whether you can answer a user's question confidently using only your training data, without needing to search the web.

Consider these factors:
1. **Knowledge Coverage**: Do you have sufficient information about this topic?
2. **Temporal Relevance**: Is this asking about current events, latest versions, or dynamic data that changes frequently?
3. **Answer Quality**: Would your answer be comprehensive and satisfactory without external sources?
4. **Confidence Level**: How certain are you about the accuracy of your knowledge on this topic?

Examples of questions you CAN answer confidently:
- "explain how react hooks work"
- "what is the difference between let and const in javascript"
- "how does machine learning work"
- "explain the concept of recursion"

Examples of questions you CANNOT answer confidently:
- "what's the latest version of react"
- "who is the current CEO of OpenAI"
- "what are the best javascript tutorials in 2024"
- "what happened in the news today"

OUTPUT (JSON only):
{
  "canAnswerConfidently": boolean,
  "reasoning": "brief explanation of why you can/cannot answer confidently",
  "confidence": 0.0-1.0,
  "knowledgeGaps": ["specific areas where you lack information"] (optional),
  "temporalConcerns": boolean (true if the question involves current/dynamic data)
}

USER QUERY: "${context.userQuery}"

JSON:`;
};

export const generateSearchDecisionPromptWithContext = (
  context: SearchDecisionContext
): string => {
  let prompt = `The LLM has determined it needs external data to answer this query. Determine the optimal search strategy.

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
- Keep core intent intact`;

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

export const parseSelfAssessment = (
  llmResponse: string
): SelfAssessmentResult => {
  try {
    // Extract JSON from the response
    const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in self-assessment response");
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
    console.error("Failed to parse self-assessment response:", error);

    // Conservative fallback: assume we cannot answer confidently
    return {
      canAnswerConfidently: false,
      reasoning: "Failed to parse self-assessment, defaulting to search",
      confidence: 0.3,
      temporalConcerns: true,
    };
  }
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
      shouldSearch: true, // Always true since we've already determined we need to search
      searchType: parsed.searchType || "search",
      category: parsed.category || undefined,
      reasoning: parsed.reasoning || "No reasoning provided",
      confidence: 0.8, // Set a default high confidence since we're committing to search
      suggestedSources: parsed.suggestedSources || 12,
      suggestedQuery: parsed.suggestedQuery || userQuery,
    };
  } catch (error) {
    console.error("Failed to parse LLM response:", error);

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

// Combined function that handles the two-step process
export const generateSearchDecisionWithSelfAssessment = (
  context: SearchDecisionContext
): {
  selfAssessmentPrompt: string;
  searchDecisionPrompt: string;
} => {
  return {
    selfAssessmentPrompt: generateSelfAssessmentPrompt(context),
    searchDecisionPrompt: generateSearchDecisionPromptWithContext(context),
  };
};

// Helper function to make the final decision based on self-assessment
export const makeFinalSearchDecision = (
  selfAssessment: SelfAssessmentResult,
  searchDecision: SearchDecision,
  userQuery: string
): SearchDecision => {
  // If the LLM can answer confidently, don't search
  if (selfAssessment.canAnswerConfidently && selfAssessment.confidence > 0.6) {
    return {
      shouldSearch: false,
      searchType: "search",
      reasoning: `LLM can answer confidently: ${selfAssessment.reasoning}`,
      confidence: selfAssessment.confidence,
      suggestedSources: 0,
      suggestedQuery: userQuery,
    };
  }

  // If the LLM cannot answer confidently, use the search decision
  // The search decision already has shouldSearch: true, so we just enhance the reasoning
  return {
    ...searchDecision,
    reasoning: `Self-assessment: ${selfAssessment.reasoning}. Search strategy: ${searchDecision.reasoning}`,
    confidence: selfAssessment.confidence, // Use self-assessment confidence as the primary confidence
  };
};
