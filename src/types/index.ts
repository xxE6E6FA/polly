import type { Doc, Id } from "@convex/_generated/dataModel";

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
export type ImageModel = Doc<"userImageModels">;

/**
 * Capabilities resolved from models.dev cache at query time.
 * These are added to models via hydration.
 */
export type ModelCapabilities = {
  supportsTools: boolean;
  supportsImages: boolean;
  supportsReasoning: boolean;
  supportsFiles: boolean;
  contextLength: number;
  maxOutputTokens?: number;
  inputModalities: string[];
};

/**
 * A hydrated model with capabilities from models.dev.
 * This is what queries return after hydration.
 */
export type HydratedUserModel = Doc<"userModels"> & ModelCapabilities;
export type HydratedBuiltInModel = Doc<"builtInModels"> & ModelCapabilities;
export type HydratedModel = HydratedUserModel | HydratedBuiltInModel;
export type AIProviderType =
  | "openai"
  | "anthropic"
  | "google"
  | "groq"
  | "openrouter"
  | "polly"
  | "replicate"
  | "elevenlabs";

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
  supportsImageGeneration?: boolean;
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
// IMAGE GENERATION TYPES
// ============================================================================

export type GenerationMode = "text" | "image";

export type ImageGenerationParams = {
  prompt: string;
  model: string;
  width?: number;
  height?: number;
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
  steps?: number;
  guidanceScale?: number;
  seed?: number;
  negativePrompt?: string;
  count?: number; // Number of images to generate (1-4)
};

// Type aliases for Replicate types (no re-exports)
export type ReplicatePrediction = import("replicate").Prediction;
export type ReplicatePredictionStatus =
  import("replicate").Prediction["status"];

export type ImageGenerationResult = {
  id: string;
  status: ReplicatePredictionStatus;
  output?: string[];
  error?: string;
  progress?: number;
  metadata?: {
    model: string;
    prompt: string;
    params: ImageGenerationParams;
    duration?: number;
    cost?: number;
  };
};

// ============================================================================
// CHAT & MESSAGING TYPES
// ============================================================================

/**
 * Chat view status - represents the current state of the chat.
 * - `idle`: No active operation
 * - `loading`: Fetching messages or waiting for AI to start
 * - `streaming`: Actively receiving streamed AI response
 */
export type ChatStatus = "idle" | "loading" | "streaming";

export type MessageRole = "user" | "assistant" | "system" | "context";

/**
 * A single reasoning segment for interleaved reasoning/tool-call streams.
 * Each segment corresponds to a continuous block of thinking before a tool call interrupts.
 */
export type ReasoningPart = {
  text: string;
  startedAt: number;
};

/**
 * Tool call tracking for reasoning UI.
 * Represents a tool invocation during interleaved thinking.
 */
export type ToolCall = {
  id: string;
  name: string; // "webSearch", "conversationSearch"
  status: "running" | "completed" | "error";
  startedAt: number;
  completedAt?: number;
  args?: {
    query?: string;
    mode?: string;
    prompt?: string;
    imageModel?: string;
  };
  error?: string;
};

export type ChatMessage = {
  id: string;
  /**
   * Optional stable key for React reconciliation during optimistic → real message transitions.
   * When provided, this is used as the React key instead of `id` to prevent component remounting
   * and animation resets when transitioning from optimistic to server-persisted messages.
   */
  displayKey?: string;
  role: MessageRole;
  content: string;
  status?:
    | "thinking"
    | "searching"
    | "reading_pdf"
    | "streaming"
    | "done"
    | "error";
  statusText?: string; // For custom status messages (e.g., PDF reading progress)
  reasoning?: string;
  model?: string;
  provider?: string;
  parentId?: string;
  isMainBranch: boolean;
  sourceConversationId?: ConversationId;
  useWebSearch?: boolean;
  attachments?: Attachment[];
  citations?: WebSearchCitation[];
  reasoningParts?: ReasoningPart[]; // Interleaved reasoning segments
  toolCalls?: ToolCall[]; // Tool calls made during reasoning
  error?: string; // Error message for failed text-to-text requests
  // Persona snapshot — frozen at message creation time
  personaName?: string;
  personaIcon?: string;
  metadata?: {
    tokenCount?: number;
    finishReason?: string;
    duration?: number;
    thinkingDurationMs?: number;
    stopped?: boolean;
    searchQuery?: string;
    searchFeature?: string;
    searchCategory?: string;
    searchMode?: "instant" | "fast" | "auto" | "deep";
    status?: "pending" | "error";
  };
  imageGeneration?: {
    replicateId?: string;
    status?: "starting" | "processing" | "succeeded" | "failed" | "canceled";
    output?: string[]; // Array of image URLs from Replicate
    error?: string;
    progress?: number;
    metadata?: {
      duration?: number;
      model?: string;
      prompt?: string;
      params?: {
        aspectRatio?: string;
        steps?: number;
        guidanceScale?: number;
        seed?: number;
        negativePrompt?: string;
        count?: number;
      };
    };
    result?: ImageGenerationResult;
  };
  createdAt: number;
};

export type Attachment = {
  type: "image" | "pdf" | "text" | "audio" | "video";
  url: string;
  name: string;
  size: number;
  content?: string;
  thumbnail?: string;
  storageId?: Id<"_storage">;
  mimeType?: string;
  // PDF-specific fields
  textFileId?: Id<"_storage">; // Reference to stored extracted text (persistent)
  extractedText?: string;
  extractionError?: string; // For PDFs: error message if extraction failed
  extractionMetadata?: {
    extractedAt: number;
    wordCount: number;
    contentLength: number;
  };
  // Media dimensions for layout shift prevention
  width?: number;
  height?: number;
  // Generated image metadata
  generatedImage?: {
    isGenerated: boolean;
    source: string; // "replicate", etc.
    model?: string;
    prompt?: string;
  };
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

export type ChatMode = "regular" | "private";

export type CreateConversationParams = {
  firstMessage: string;
  sourceConversationId?: ConversationId;
  personaId?: Id<"personas"> | null;
  attachments?: Attachment[];
  generateTitle?: boolean;
  reasoningConfig?: ReasoningConfig;
  contextSummary?: string | null;
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
  // Provider-dependent extras
  topK?: number;
  repetitionPenalty?: number;
  reasoningConfig?: ReasoningConfig;
};

export type StreamTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
};

export type StreamCallbacks = {
  onContent: (content: string) => void;
  onReasoning?: (reasoning: string) => void;
  onCitations?: (citations: WebSearchCitation[]) => void;
  onFinish: (finishReason: string, tokenUsage?: StreamTokenUsage) => void;
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
  groq?: string;
  openrouter?: string;
  replicate?: string;
  elevenlabs?: string;
};

// ============================================================================
// EXPORT TYPES
// ============================================================================

export type ExportMessage = Omit<Doc<"messages">, "userId"> & {
  userId?: Id<"users">;
};

export type ExportData = {
  conversation: Doc<"conversations">;
  messages: ExportMessage[];
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
// MODEL MANAGEMENT TYPES
// ============================================================================

export type ToggleModelResult = {
  success: boolean;
  action?: "added" | "removed";
  error?: string;
  requiresConfirmation?: boolean;
  conflictingBuiltInModel?: {
    name: string;
    modelId: string;
    provider: string;
  };
  message?: string;
  overridesBuiltIn?: boolean;
};

export type ModelConflictCheck = {
  hasConflict: boolean;
  builtInModel: Doc<"builtInModels"> | null;
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
  isAvailable?: boolean;
};

export type FetchedImageModel = {
  modelId: string;
  name: string;
  provider: string;
  description?: string;
  modelVersion?: string;
  owner?: string;
  tags?: string[];
  supportedAspectRatios?: string[];
  supportsUpscaling?: boolean;
  supportsInpainting?: boolean;
  supportsOutpainting?: boolean;
  supportsImageToImage?: boolean;
  supportsMultipleImages?: boolean;
  supportsNegativePrompt?: boolean;
  coverImageUrl?: string;
  exampleImages?: string[];
};

export type CreateConversationArgs = {
  userId?: UserId;
  firstMessage: string;
  sourceConversationId?: ConversationId;
  personaId?: Id<"personas">;
  personaPrompt?: string;
  attachments?: Array<{
    type: "image" | "pdf" | "text" | "audio" | "video";
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
};
