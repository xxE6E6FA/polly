import type { Doc, Id } from "@convex/_generated/dataModel";

// ============================================================================
// CONVEX GENERATED TYPES RE-EXPORTS
// ============================================================================

export type { Doc, Id } from "../../convex/_generated/dataModel";

// ============================================================================
// CORE ENTITY TYPES
// ============================================================================

export type User = Doc<"users">;
export type Conversation = Doc<"conversations">;
export type Message = Doc<"messages">;

// ID types
export type ConversationId = Id<"conversations">;
export type MessageId = Id<"messages">;
export type UserId = Id<"users">;

// ============================================================================
// AI & MODEL TYPES
// ============================================================================

export type AIModel = Doc<"userModels">;
export type AIProviderType = "openai" | "anthropic" | "google" | "openrouter";

// ============================================================================
// TYPE SAFETY HELPERS
// ============================================================================

export function assertUnreachable(x: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(x)}`);
}

// Extended model type for capability detection
export type ModelForCapabilities = {
  modelId: string;
  provider: string;
  name?: string;
  contextLength?: number;
  contextWindow?: number;
  supportsReasoning?: boolean;
  supportsImages?: boolean;
  supportsTools?: boolean;
  supportsFiles?: boolean;
  inputModalities?: string[];
} & Partial<AIModel>;

export type AIProvider = {
  id: string;
  name: string;
  models: AIModel[];
  requiresApiKey: boolean;
  supportsImages: boolean;
  supportsStreaming: boolean;
};

export type OpenRouterModel = {
  id: string;
  name: string;
  description?: string;
  context_length: number;
  top_provider: {
    context_length: number;
    max_completion_tokens?: number;
    is_moderated?: boolean;
  };
  architecture: {
    modality?: string;
    tokenizer: string;
    instruct_type?: string;
    input_modalities?: string[];
    output_modalities?: string[];
  };
  supported_parameters?: string[];
  pricing?: {
    internal_reasoning?: string;
  };
  created?: number;
  hugging_face_id?: string;
  per_request_limits?: Record<string, unknown>;
};

export type GeminiApiModel = {
  name: string;
  baseModelId: string;
  version: string;
  displayName?: string;
  description?: string;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  supportedGenerationMethods?: string[];
  temperature?: number;
  maxTemperature?: number;
  topP?: number;
  topK?: number;
};

export type ModelCapability = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
};

// ============================================================================
// REASONING CONFIGURATION TYPES
// ============================================================================

export type ReasoningEffortLevel = "low" | "medium" | "high";

export type ReasoningConfig = {
  enabled: boolean;
  effort?: ReasoningEffortLevel;
  maxTokens?: number;
};

// ============================================================================
// CHAT & MESSAGING TYPES
// ============================================================================

export type MessageRole = "user" | "assistant" | "system" | "context";

export type ChatMessage = {
  id: string;
  role: MessageRole;
  content: string;
  reasoning?: string;
  model?: string;
  provider?: string;
  parentId?: string;
  isMainBranch: boolean;
  sourceConversationId?: ConversationId;
  useWebSearch?: boolean;
  attachments?: Attachment[];
  citations?: WebSearchCitation[];
  metadata?: {
    tokenCount?: number;
    reasoningTokenCount?: number;
    finishReason?: string;
    duration?: number;
    stopped?: boolean;
    searchQuery?: string;
    searchFeature?: string;
    searchCategory?: string;
    status?: "pending" | "error";
  };
  createdAt: number;
};

export type Attachment = {
  type: "image" | "pdf" | "text";
  url: string;
  name: string;
  size: number;
  content?: string;
  thumbnail?: string;
  storageId?: Id<"_storage">;
  mimeType?: string;
  language?: string;
};

// ============================================================================
// CHAT STRATEGY TYPES
// ============================================================================

export interface SendMessageParams {
  content: string;
  attachments?: Attachment[];
  personaId?: Id<"personas"> | null;
  reasoningConfig?: ReasoningConfig;
}

export interface ChatStrategy {
  sendMessage(params: SendMessageParams): Promise<void>;
  stopGeneration(): void;
  deleteMessage(messageId: string): Promise<void>;
  editMessage(messageId: string, content: string): Promise<void>;
  getMessages(): ChatMessage[];
  isStreaming?(): boolean;
  isLoading(): boolean;
  initialize?(): void;
  cleanup?(): void;
}

export interface ChatStrategyOptions {
  conversationId?: ConversationId;
  userId?: Id<"users">;
  onError?: (error: Error) => void;
  onConversationCreate?: (conversationId: ConversationId) => void;
  onStreamingStateChange?: (isStreaming: boolean) => void;
  initialMessage?: string;
  initialAttachments?: Attachment[];
  initialPersonaId?: Id<"personas">;
  initialReasoningConfig?: ReasoningConfig;
}

export type ChatMode = "regular" | "private";

export type CreateConversationParams = {
  firstMessage: string;
  sourceConversationId?: ConversationId;
  personaId?: Id<"personas"> | null;
  userId?: Id<"users">;
  attachments?: Attachment[];
  generateTitle?: boolean;
  reasoningConfig?: ReasoningConfig;
  contextSummary?: string;
};

// ============================================================================
// STREAMING TYPES
// ============================================================================

export type StreamOptions = {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  reasoningConfig?: ReasoningConfig;
};

export type StreamCallbacks = {
  onContent: (content: string) => void;
  onReasoning?: (reasoning: string) => void;
  onCitations?: (citations: WebSearchCitation[]) => void;
  onFinish: (finishReason: string) => void;
  onError: (error: Error) => void;
};

export type ChatStreamRequest = {
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
    attachments?: Attachment[];
  }>;
  model: ModelForCapabilities;
  apiKeys: APIKeys;
  options?: StreamOptions;
  callbacks: StreamCallbacks;
};

// ============================================================================
// ANTHROPIC CLIENT TYPES
// ============================================================================

export interface AnthropicStreamOptions {
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
    attachments?: Attachment[];
  }>;
  model: string;
  apiKey: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  reasoningConfig?: {
    effort?: "low" | "medium" | "high";
    maxTokens?: number;
  };
  abortSignal?: AbortSignal;
  callbacks: StreamCallbacks;
}

// ============================================================================
// SEARCH & CITATION TYPES
// ============================================================================

export type WebSearchCitation = {
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

// ============================================================================
// API KEYS TYPES
// ============================================================================

export type APIKeys = {
  openai?: string;
  anthropic?: string;
  google?: string;
  openrouter?: string;
};

// ============================================================================
// EXPORT TYPES
// ============================================================================

export type ExportData = {
  conversation: Doc<"conversations">;
  messages: Doc<"messages">[];
};

// ============================================================================
// ROUTE TYPES
// ============================================================================

export type RouteParams = {
  conversationId?: string;
  shareId?: string;
  id?: string;
};

// ============================================================================
// UI COMPONENT TYPES
// ============================================================================

export interface CodeBlockMatch {
  language: string;
  code: string;
  fullMatch: string;
  start: number;
  end: number;
}

export type FileUploadProgress = {
  file: File;
  progress: number;
  status: "pending" | "uploading" | "processing" | "complete" | "error";
  error?: string;
  attachment?: Attachment;
};

// ============================================================================
// CONVEX ACTION RESULT TYPES
// ============================================================================

export type CreateConversationResult = {
  conversationId: ConversationId;
  userId: UserId;
  isNewUser: boolean;
};

export type GetOrCreateUserResult = {
  userId: UserId;
  isNewUser: boolean;
};

export type CreateMessageResult = {
  userMessageId: Id<"messages">;
  assistantMessageId: Id<"messages">;
};

export type FetchedModel = {
  modelId: string;
  name: string;
  provider: string;
  contextWindow: number;
  supportsReasoning: boolean;
  supportsTools: boolean;
  supportsImages: boolean;
  supportsFiles: boolean;
};

export type CreateConversationArgs = {
  userId?: UserId;
  firstMessage: string;
  sourceConversationId?: ConversationId;
  personaId?: Id<"personas">;
  personaPrompt?: string;
  attachments?: Array<{
    type: "image" | "pdf" | "text";
    url: string;
    name: string;
    size: number;
    content?: string;
    thumbnail?: string;
    storageId?: Id<"_storage">;
    mimeType?: string;
  }>;
  generateTitle?: boolean;
  reasoningConfig?: {
    enabled: boolean;
    effort: "low" | "medium" | "high";
    maxTokens: number;
  };
  contextSummary?: string;
};
