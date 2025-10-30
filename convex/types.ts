import type { Id } from "./_generated/dataModel";

// ============================================================================
// CONVEX GENERATED TYPES RE-EXPORTS
// ============================================================================

export type { Doc, Id } from "./_generated/dataModel";

// ============================================================================
// MESSAGE & STREAMING TYPES
// ============================================================================

export type StreamMessage = {
  role: "user" | "assistant" | "system";
  content:
    | string
    | Array<{
        type: "text" | "image_url" | "file";
        text?: string;
        image_url?: { url: string };
        file?: { filename: string; file_data: string };
        attachment?: {
          storageId: Id<"_storage">;
          type: string;
          name: string;
          extractedText?: string;
          textFileId?: Id<"_storage">;
        };
      }>;
};

export type MessagePart = {
  type: "text" | "image_url" | "file";
  text?: string;
  image_url?: { url: string };
  file?: { filename: string; file_data: string };
  attachment?: {
    storageId: Id<"_storage">;
    type: string;
    name: string;
    extractedText?: string;
    textFileId?: Id<"_storage">;
  };
};

// ============================================================================
// CITATION & SEARCH TYPES
// ============================================================================

export type Citation = {
  type: "url_citation";
  url: string;
  title: string;
  cited_text?: string;
  snippet?: string;
  description?: string;
  image?: string;
  favicon?: string;
  siteName?: string;
  publishedDate?: string;
  author?: string;
};

export type WebSource = {
  url: string;
  title?: string;
  snippet?: string;
  description?: string;
};

export type OpenRouterCitation = {
  url: string;
  title?: string;
  text?: string;
  snippet?: string;
};

export type OpenRouterAnnotation = {
  type: string;
  url_citation?: {
    url: string;
    title?: string;
    content?: string;
  };
};

export type GoogleGroundingChunk = {
  content: string;
  web?: {
    uri: string;
    title?: string;
  };
};

// ============================================================================
// PROVIDER TYPES
// ============================================================================

export type ProviderType =
  | "openai"
  | "anthropic"
  | "google"
  | "groq"
  | "openrouter"
  | "polly"
  | "replicate"
  | "elevenlabs";

export type ProviderMetadata = {
  openrouter?: {
    citations?: OpenRouterCitation[];
    annotations?: OpenRouterAnnotation[];
  };
  google?: {
    groundingChunks?: GoogleGroundingChunk[];
  };
};

// ============================================================================
// STORAGE TYPES
// ============================================================================

export type StorageData = {
  blob: Blob;
  arrayBuffer: ArrayBuffer;
  base64: string;
  mimeType: string;
};

// ============================================================================
// STREAM PART TYPES
// ============================================================================

export type StreamPartType =
  | "text-delta"
  | "tool-call"
  | "tool-result"
  | "finish"
  | "error"
  | "reasoning"
  | string;

export interface StreamPart {
  type: StreamPartType;
  textDelta?: string;
  reasoning?: string;
}

export type FinishData = {
  text: string;
  finishReason: string | null | undefined;
  reasoning: string | null | undefined;
  providerMetadata: ProviderMetadata | undefined;
};

export interface StreamConfig {
  onContent?: (content: string) => void;
  onReasoning?: (reasoning: string) => void;
  onFinish?: (data: FinishData) => void;
  onError?: (error: Error) => void;
}

// ============================================================================
// REASONING CONFIGURATION TYPES
// ============================================================================

export type ReasoningEffortLevel = "low" | "medium" | "high";

export type ReasoningConfig = {
  effort?: ReasoningEffortLevel;
  maxTokens?: number;
};

export type OpenAIReasoningConfig = {
  reasoning: boolean;
};

export type GoogleReasoningConfig = {
  thinkingConfig: {
    includeThoughts: boolean;
    thinkingBudget?: number;
  };
};

export type AnthropicReasoningConfig = {
  thinking: {
    type: "enabled";
    budgetTokens: number;
  };
};

export type OpenRouterReasoningConfig = {
  reasoning: {
    effort?: "low" | "medium" | "high";
    max_tokens?: number;
    exclude?: boolean;
    enabled?: boolean;
  };
};

export type ProviderStreamOptions =
  | Record<string, never> // Empty object for non-reasoning models
  | { openai: { reasoning: boolean } }
  | {
      providerOptions: {
        google: {
          thinkingConfig: { thinkingBudget: number };
        };
      };
    }
  | { anthropic: { thinking: { type: "enabled"; budgetTokens: number } } }
  | {
      extraBody: {
        reasoning: {
          effort?: "low" | "medium" | "high";
          max_tokens?: number;
          exclude?: boolean;
          enabled?: boolean;
        };
      };
    };

// ============================================================================
// ERROR HANDLING TYPES
// ============================================================================

// ============================================================================
// SEARCH DETECTION TYPES
// ============================================================================

export type ExaFeatureType = "search" | "answer" | "similar";
export type SearchMode = "fast" | "auto" | "deep";

export interface SearchDecision {
  shouldSearch: boolean;
  searchQuery?: string;
  feature?: ExaFeatureType;
  searchMode?: SearchMode;
  category?: string;
  reason?: string;
  confidence?: number;
}

export interface SearchDecisionContext {
  userMessage: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  personaContext?: string;
}

// ============================================================================
// EXA SEARCH TYPES
// ============================================================================

export interface WebSearchArgs {
  query: string;
  numResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  startCrawlDate?: string;
  endCrawlDate?: string;
  startPublishedDate?: string;
  endPublishedDate?: string;
}

export interface WebSearchResult {
  url: string;
  title: string;
  snippet: string;
  publishedDate?: string;
  author?: string;
  score?: number;
}

// ============================================================================
// OPENROUTER CAPABILITIES TYPES
// ============================================================================

export interface OpenRouterModel {
  id: string;
  name: string;
  created: number;
  description?: string;
  context_length?: number;
  architecture?: {
    modality?: string;
    tokenizer?: string;
    instruct_type?: string;
  };
  pricing?: {
    prompt?: string;
    completion?: string;
    image?: string;
    request?: string;
  };
  top_provider?: {
    context_length?: number;
    max_completion_tokens?: number;
    is_moderated?: boolean;
  };
  per_request_limits?: {
    prompt_tokens?: string;
    completion_tokens?: string;
  };
}

export interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

// ============================================================================
// ANTHROPIC STREAM TYPES
// ============================================================================

export interface AnthropicStreamEvent {
  type: string;
  delta?: {
    text?: string;
    type?: string;
  };
  content_block?: {
    text?: string;
    type?: string;
  };
}

export interface AnthropicStreamCallbacks {
  onContent?: (content: string) => void;
  onReasoning?: (reasoning: string) => void;
  onFinish?: (finishReason: string) => void;
  onError?: (error: Error) => void;
}

// ============================================================================
// CONVERSATION UTILITY TYPES
// ============================================================================

export type StreamingActionResult = {
  success: boolean;
  error?: string;
};

export type MessageActionArgs = {
  conversationId: Id<"conversations">;
  messageId: Id<"messages">;
  content?: string;
};

export type ConversationDoc = {
  _id: Id<"conversations">;
  _creationTime: number;
  userId: Id<"users">;
  title: string;
  isArchived?: boolean;
  personaId?: Id<"personas">;
  personaPrompt?: string;
  shareId?: string;
  isShared?: boolean;
  sharedAt?: number;
  lastMessageAt?: number;
  messageCount?: number;
};

export type MessageDoc = {
  _id: Id<"messages">;
  _creationTime: number;
  conversationId: Id<"conversations">;
  role: "user" | "assistant" | "system" | "context";
  content: string;
  status?: "thinking" | "searching" | "streaming" | "done" | "error";
  reasoning?: string;
  model?: string;
  provider?: string;
  parentId?: Id<"messages">;
  isMainBranch: boolean;
  sourceConversationId?: Id<"conversations">;
  useWebSearch?: boolean;
  attachments?: Array<{
    type: string;
    url: string;
    name: string;
    size: number;
    content?: string;
    thumbnail?: string;
    storageId?: Id<"_storage">;
    mimeType?: string;
    extractedText?: string;
    textFileId?: Id<"_storage">;
  }>;
  citations?: Citation[];
  metadata?: {
    tokenCount?: number;
    reasoningTokenCount?: number;
    finishReason?: string;
    duration?: number;
    stopped?: boolean;
    searchQuery?: string;
    searchFeature?: string;
    searchCategory?: string;
  };
};

// ============================================================================
// MODEL CAPABILITIES CONFIG TYPES
// ============================================================================

export type PatternConfig = {
  patterns: string[];
  capabilities: Array<{
    name: string;
    supported: boolean;
  }>;
};

export type ProviderPatterns = {
  [providerName: string]: PatternConfig;
};
