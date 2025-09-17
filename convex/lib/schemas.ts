import { v } from "convex/values";
import { Infer } from "convex/values";

export const userModelSchema = v.object({
    userId: v.id("users"),
    modelId: v.string(),
    name: v.string(),
    provider: v.string(),

    contextLength: v.number(),
    maxOutputTokens: v.optional(v.number()),
    supportsImages: v.boolean(),
    supportsTools: v.boolean(),
    supportsReasoning: v.boolean(),
    supportsFiles: v.optional(v.boolean()),
    inputModalities: v.optional(v.array(v.string())),
    selected: v.optional(v.boolean()),
    free: v.optional(v.boolean()),
    createdAt: v.number(),
});

// Built-in models schema (global, not per-user)
export const builtInModelSchema = v.object({
    modelId: v.string(),
    name: v.string(),
    provider: v.string(),
    displayProvider: v.optional(v.string()),

    contextLength: v.number(),
    maxOutputTokens: v.optional(v.number()),
    supportsImages: v.boolean(),
    supportsTools: v.boolean(),
    supportsReasoning: v.boolean(),
    supportsFiles: v.optional(v.boolean()),
    inputModalities: v.optional(v.array(v.string())),
    free: v.boolean(),
    isActive: v.optional(v.boolean()), // Allow disabling built-in models
    createdAt: v.number(),
});

// Image models schema for Replicate image generation models
export const userImageModelSchema = v.object({
    userId: v.id("users"),
    modelId: v.string(),
    name: v.string(),
    provider: v.string(),
    description: v.optional(v.string()),
    
    // Image generation specific fields
    supportedAspectRatios: v.optional(v.array(v.string())),
    supportsUpscaling: v.optional(v.boolean()),
    supportsInpainting: v.optional(v.boolean()),
    supportsOutpainting: v.optional(v.boolean()),
    supportsImageToImage: v.optional(v.boolean()),
    supportsMultipleImages: v.optional(v.boolean()),
    supportsNegativePrompt: v.optional(v.boolean()),
    
    // Model metadata
    modelVersion: v.optional(v.string()),
    owner: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    
    selected: v.optional(v.boolean()),
    createdAt: v.number(),
});

// Full image model definition schema - stores complete model details
export const imageModelDefinitionSchema = v.object({
    modelId: v.string(),
    name: v.string(),
    provider: v.string(),
    description: v.string(),
    modelVersion: v.string(),
    owner: v.string(),
    tags: v.array(v.string()),
    
    // Image generation specific fields
    supportedAspectRatios: v.array(v.string()),
    supportsUpscaling: v.boolean(),
    supportsInpainting: v.boolean(),
    supportsOutpainting: v.boolean(),
    supportsImageToImage: v.boolean(),
    supportsMultipleImages: v.boolean(),
    supportsNegativePrompt: v.optional(v.boolean()),
    
    // Rich metadata not in userImageModels
    coverImageUrl: v.optional(v.string()),
    exampleImages: v.optional(v.array(v.string())),
    
    // Metadata
    createdAt: v.number(),
    lastUpdated: v.number(),
});

// Model schema for internal actions (handles both user models and built-in models)
export const modelForInternalActionsSchema = v.object({
    modelId: v.string(),
    name: v.string(),
    provider: v.string(),
    supportsReasoning: v.boolean(),
    supportsImages: v.optional(v.boolean()),
    supportsTools: v.optional(v.boolean()),
    supportsFiles: v.optional(v.boolean()),
    contextLength: v.optional(v.number()),
    // Fields that may exist on built-in models
    free: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
    // Fields that may exist on user models  
    selected: v.optional(v.boolean()),

    maxOutputTokens: v.optional(v.number()),
    inputModalities: v.optional(v.array(v.string())),
});

// Common attachment schema used across messages and conversations
export const attachmentSchema = v.object({
  type: v.union(v.literal("image"), v.literal("pdf"), v.literal("text")),
  url: v.string(),
  name: v.string(),
  size: v.float64(),
  content: v.optional(v.string()),
  thumbnail: v.optional(v.string()),
  storageId: v.optional(v.id("_storage")),
  mimeType: v.optional(v.string()), // Added for PDF processing support
  // PDF-specific fields for persistent text extraction
  textFileId: v.optional(v.id("_storage")), // Reference to stored text file
  extractedText: v.optional(v.string()), // Cached text extraction for PDFs (deprecated in favor of textFileId)
  extractionError: v.optional(v.string()), // Error message if extraction failed
  // Generated image metadata
  generatedImage: v.optional(v.object({
    isGenerated: v.boolean(),
    source: v.string(), // "replicate", etc.
    model: v.optional(v.string()),
    prompt: v.optional(v.string()),
  })),
});

// Reasoning configuration schema
export const reasoningConfigSchema = v.object({
  enabled: v.boolean(),
  effort: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
  maxTokens: v.optional(v.number()),
});

// Message role schema
export const messageRoleSchema = v.union(
  v.literal("user"),
  v.literal("assistant"),
  v.literal("system"),
  v.literal("context")
);

// Provider schema
export const providerSchema = v.union(
  v.literal("openai"),
  v.literal("anthropic"),
  v.literal("google"),
  v.literal("groq"),
  v.literal("openrouter"),
  v.literal("replicate"),
  v.literal("elevenlabs")
);

// Web search citation schema
export const webCitationSchema = v.object({
  type: v.literal("url_citation"),
  url: v.string(),
  title: v.string(),
  cited_text: v.optional(v.string()),
  snippet: v.optional(v.string()),
  description: v.optional(v.string()),
  image: v.optional(v.string()),
  favicon: v.optional(v.string()),
  siteName: v.optional(v.string()),
  publishedDate: v.optional(v.string()),
  author: v.optional(v.string()),
});

// Message metadata schema
export const messageMetadataSchema = v.object({
  tokenCount: v.optional(v.number()),
  reasoningTokenCount: v.optional(v.number()),
  finishReason: v.optional(v.string()),
  duration: v.optional(v.number()),
  thinkingDurationMs: v.optional(v.number()),
  stopped: v.optional(v.boolean()),
  searchQuery: v.optional(v.string()),
  searchFeature: v.optional(v.string()),
  searchCategory: v.optional(v.string()),
});

// Extended message metadata schema with status field
export const extendedMessageMetadataSchema = v.object({
  tokenCount: v.optional(v.number()),
  reasoningTokenCount: v.optional(v.number()),
  finishReason: v.optional(v.string()),
  duration: v.optional(v.number()),
  thinkingDurationMs: v.optional(v.number()),
  stopped: v.optional(v.boolean()),
  searchQuery: v.optional(v.string()),
  searchFeature: v.optional(v.string()),
  searchCategory: v.optional(v.string()),
  status: v.optional(v.union(v.literal("pending"), v.literal("error"))),
  webSearchCost: v.optional(v.number()),
  temperature: v.optional(v.number()),
  usage: v.optional(v.object({
    promptTokens: v.number(),
    completionTokens: v.number(),
    totalTokens: v.number(),
  })),
});

export const ttsAudioCacheEntrySchema = v.object({
  storageId: v.id("_storage"),
  voiceId: v.optional(v.string()),
  modelId: v.optional(v.string()),
  outputFormat: v.optional(v.string()),
  optimizeLatency: v.optional(v.string()),
  textHash: v.string(),
  createdAt: v.number(),
  mimeType: v.optional(v.string()),
  sizeBytes: v.optional(v.number()),
});

// Common args for model and provider
export const modelProviderArgs = {
  model: v.optional(v.string()),
  provider: v.optional(v.string()),
};

// Common args for conversation actions
export const conversationActionArgs = {
  conversationId: v.id("conversations"),
  ...modelProviderArgs,
};

// Common args for message creation
export const messageCreationArgs = {
  content: v.string(),
  attachments: v.optional(v.array(attachmentSchema)),
  useWebSearch: v.optional(v.boolean()),
};

// Conversation creation schema
export const conversationCreationSchema = v.object({
  title: v.string(),
  userId: v.id("users"),
  personaId: v.optional(v.id("personas")),
  sourceConversationId: v.optional(v.id("conversations")),
  isStreaming: v.optional(v.boolean()),
  isPinned: v.optional(v.boolean()),
  isArchived: v.optional(v.boolean()),
  createdAt: v.optional(v.number()),
  updatedAt: v.optional(v.number()),
});

// Complete message creation schema
export const messageCreationSchema = v.object({
  conversationId: v.id("conversations"),
  role: messageRoleSchema,
  content: v.string(),
  reasoning: v.optional(v.string()),
  model: v.optional(v.string()),
  provider: v.optional(providerSchema),
  reasoningConfig: v.optional(reasoningConfigSchema),
  parentId: v.optional(v.id("messages")),
  isMainBranch: v.optional(v.boolean()),
  sourceConversationId: v.optional(v.id("conversations")),
  useWebSearch: v.optional(v.boolean()),
  attachments: v.optional(v.array(attachmentSchema)),
  citations: v.optional(v.array(webCitationSchema)),
  metadata: v.optional(extendedMessageMetadataSchema),
  createdAt: v.optional(v.number()),
});

// Context message schema for AI interactions
export const contextMessageSchema = v.object({
  role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
  content: v.union(
    v.string(),
    v.array(
      v.object({
        type: v.union(v.literal("text"), v.literal("image_url"), v.literal("file")),
        text: v.optional(v.string()),
        image_url: v.optional(v.object({ url: v.string() })),
        file: v.optional(v.object({ 
          filename: v.string(), 
          file_data: v.string() 
        })),
        attachment: v.optional(v.object({
          storageId: v.id("_storage"),
          type: v.string(),
          name: v.string(),
        })),
      })
    )
  ),
});

// Reasoning configuration for AI interactions - matches reasoningConfigSchema
export const reasoningConfigForActionSchema = v.object({
  enabled: v.boolean(),
  effort: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
  maxTokens: v.optional(v.number()),
});

// Background job payload schemas
const exportPayload = v.object({ 
  includeAttachments: v.boolean(),
  conversationIds: v.optional(v.array(v.id("conversations")))
});

const importPayload = v.object({ 
  fileUrl: v.string(),
  fileName: v.optional(v.string()),
  originalFormat: v.optional(v.string())
});

const bulkArchivePayload = v.object({
  conversationIds: v.array(v.id("conversations"))
});

const bulkDeletePayload = v.object({
  conversationIds: v.array(v.id("conversations")),
  permanentDelete: v.optional(v.boolean())
});

const conversationSummaryPayload = v.object({
  conversationId: v.id("conversations"),
  messageRange: v.optional(v.object({
    startMessageId: v.optional(v.id("messages")),
    endMessageId: v.optional(v.id("messages"))
  }))
});

const migrationPayload = v.object({
  migrationVersion: v.string(),
  batchSize: v.optional(v.number())
});

// Discriminated union for payloads
export const jobPayloadSchema = v.union(
  v.object({ type: v.literal("export"), data: exportPayload }),
  v.object({ type: v.literal("import"), data: importPayload }),
  v.object({ type: v.literal("bulk_archive"), data: bulkArchivePayload }),
  v.object({ type: v.literal("bulk_delete"), data: bulkDeletePayload }),
  v.object({ type: v.literal("conversation_summary"), data: conversationSummaryPayload }),
  v.object({ type: v.literal("data_migration"), data: migrationPayload }),
  v.object({ type: v.literal("model_migration"), data: migrationPayload }),
  v.object({ type: v.literal("backup"), data: v.object({}) })
);

// Background job result schemas
const exportResult = v.object({
  fileStorageId: v.id("_storage"),
  fileSizeBytes: v.number(),
  totalConversations: v.number(),
  totalMessages: v.number()
});

const importResult = v.object({
  totalImported: v.number(),
  totalProcessed: v.number(),
  errors: v.array(v.string()),
  conversationIds: v.array(v.string())
});

const bulkOperationResult = v.object({
  totalProcessed: v.number(),
  successCount: v.number(),
  errorCount: v.number(),
  errors: v.array(v.string())
});

const summaryResult = v.object({
  summary: v.string(),
  tokenCount: v.optional(v.number()),
  model: v.optional(v.string())
});

const migrationResult = v.object({
  migratedCount: v.number(),
  skippedCount: v.number(),
  errorCount: v.number(),
  errors: v.array(v.string())
});

// Background job type schema
export const backgroundJobTypeSchema = v.union(
  v.literal("export"),
  v.literal("import"),
  v.literal("bulk_archive"),
  v.literal("bulk_delete"),
  v.literal("conversation_summary"),
  v.literal("data_migration"),
  v.literal("model_migration"),
  v.literal("backup")
);

// Background job category schema
export const backgroundJobCategorySchema = v.union(
  v.literal("data_transfer"),
  v.literal("bulk_operations"),
  v.literal("ai_processing"),
  v.literal("maintenance")
);

// Background job status schema
export const backgroundJobStatusSchema = v.union(
  v.literal("scheduled"),
  v.literal("processing"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("cancelled")
);

// Background job priority schema
export const backgroundJobPrioritySchema = v.union(
  v.literal("low"),
  v.literal("normal"),
  v.literal("high"),
  v.literal("urgent")
);

// OpenRouter sorting schema
export const openRouterSortingSchema = v.union(
  v.literal("default"),
  v.literal("price"),
  v.literal("throughput"),
  v.literal("latency")
);

// User schema
export const userSchema = v.object({
  name: v.optional(v.string()),
  email: v.optional(v.string()),
  emailVerified: v.optional(v.number()),
  emailVerificationTime: v.optional(v.number()),
  image: v.optional(v.string()),
  isAnonymous: v.optional(v.boolean()),
  messagesSent: v.optional(v.number()), // Total messages sent across all models
  createdAt: v.optional(v.number()),
  monthlyMessagesSent: v.optional(v.number()), // Monthly messages sent using built-in models
  monthlyLimit: v.optional(v.number()), // Monthly limit for built-in models
  lastMonthlyReset: v.optional(v.number()),
  hasUnlimitedCalls: v.optional(v.boolean()),
  conversationCount: v.optional(v.number()),
  totalMessageCount: v.optional(v.number()),
});

// Account schema
export const accountSchema = v.object({
  userId: v.id("users"),
  type: v.string(),
  provider: v.string(),
  providerAccountId: v.string(),
  refresh_token: v.optional(v.string()),
  access_token: v.optional(v.string()),
  expires_at: v.optional(v.number()),
  token_type: v.optional(v.string()),
  scope: v.optional(v.string()),
  id_token: v.optional(v.string()),
  session_state: v.optional(v.string()),
});

// Session schema
export const sessionSchema = v.object({
  sessionToken: v.string(),
  userId: v.id("users"),
  expires: v.number(),
});

// Conversation schema
export const conversationSchema = v.object({
  title: v.string(),
  userId: v.id("users"),
  personaId: v.optional(v.id("personas")),
  sourceConversationId: v.optional(v.id("conversations")),
  isStreaming: v.optional(v.boolean()),
  isPinned: v.optional(v.boolean()),
  isArchived: v.optional(v.boolean()),
  // Rolling token estimate (heuristic) used to trigger summarization
  tokenEstimate: v.optional(v.number()),
  // Legacy branching fields (for backward compatibility)
  activeBranchId: v.optional(v.string()),
  activeForkDefaultBranchId: v.optional(v.string()),
  activeForkRootId: v.optional(v.id("messages")),
  // New structured branching fields
  parentConversationId: v.optional(v.id("conversations")),
  branchFromMessageId: v.optional(v.id("messages")),
  branchId: v.optional(v.string()), // UUID for grouping related branches
  // Make optional for backward compatibility; new conversations should set this to self
  rootConversationId: v.optional(v.id("conversations")),
  createdAt: v.number(),
  updatedAt: v.number(),
});

// Shared conversation schema
export const sharedConversationSchema = v.object({
  shareId: v.string(),
  originalConversationId: v.id("conversations"),
  userId: v.id("users"),
  title: v.string(),
  sharedAt: v.number(),
  lastUpdated: v.number(),
  messageCount: v.number(),
});

// User API key schema
export const userApiKeySchema = v.object({
  userId: v.id("users"),
  provider: v.string(),
  encryptedKey: v.optional(v.array(v.number())),
  initializationVector: v.optional(v.array(v.number())),
  clientEncryptedKey: v.optional(v.string()),
  partialKey: v.string(),
  isValid: v.boolean(),
  createdAt: v.number(),
  lastValidated: v.optional(v.number()),
});

// Persona schema
export const personaSchema = v.object({
  userId: v.optional(v.id("users")),
  name: v.string(),
  description: v.string(),
  prompt: v.string(),
  icon: v.optional(v.string()),
  // TTS (ElevenLabs) persona-level overrides
  ttsVoiceId: v.optional(v.string()),
  // Advanced sampling parameters (optional)
  temperature: v.optional(v.number()),
  topP: v.optional(v.number()),
  topK: v.optional(v.number()),
  frequencyPenalty: v.optional(v.number()),
  presencePenalty: v.optional(v.number()),
  repetitionPenalty: v.optional(v.number()),
  // Whether advanced sampling is enabled
  advancedSamplingEnabled: v.optional(v.boolean()),
  isBuiltIn: v.boolean(),
  isActive: v.boolean(),
  order: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

// Persona import schema (without required fields)
export const personaImportSchema = v.object({
  name: v.string(),
  description: v.string(),
  prompt: v.string(),
  icon: v.optional(v.string()),
});

// User persona settings schema
export const userPersonaSettingsSchema = v.object({
  userId: v.id("users"),
  personaId: v.id("personas"),
  isDisabled: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

// User settings schema
export const userSettingsSchema = v.object({
  userId: v.id("users"),
  personasEnabled: v.optional(v.boolean()),
  defaultModelSelected: v.optional(v.boolean()),
  openRouterSorting: v.optional(openRouterSortingSchema),
  anonymizeForDemo: v.optional(v.boolean()),
  autoArchiveEnabled: v.optional(v.boolean()),
  autoArchiveDays: v.optional(v.number()),
  // TTS (ElevenLabs) settings
  ttsVoiceId: v.optional(v.string()),
  ttsModelId: v.optional(v.string()),
  ttsUseAudioTags: v.optional(v.boolean()),
  // removed voice hint
  ttsStabilityMode: v.optional(
    v.union(v.literal("creative"), v.literal("natural"), v.literal("robust"))
  ),
  createdAt: v.number(),
  updatedAt: v.number(),
});

// User settings update schema (without required fields)
export const userSettingsUpdateSchema = v.object({
  personasEnabled: v.optional(v.boolean()),
  defaultModelSelected: v.optional(v.boolean()),
  openRouterSorting: v.optional(openRouterSortingSchema),
  anonymizeForDemo: v.optional(v.boolean()),
  autoArchiveEnabled: v.optional(v.boolean()),
  autoArchiveDays: v.optional(v.number()),
  // TTS (ElevenLabs) settings
  ttsVoiceId: v.optional(v.string()),
  ttsModelId: v.optional(v.string()),
  ttsUseAudioTags: v.optional(v.boolean()),
  // removed voice hint
  ttsStabilityMode: v.optional(
    v.union(v.literal("creative"), v.literal("natural"), v.literal("robust"))
  ),
});

// Message status for production-grade AI chat
export const messageStatusSchema = v.union(
  v.literal("thinking"),
  v.literal("searching"), // New status for web search in progress
  v.literal("reading_pdf"), // New status for PDF processing
  v.literal("streaming"), 
  v.literal("done"),
  v.literal("error")
);

// Image generation schema
export const imageGenerationSchema = v.object({
  replicateId: v.optional(v.string()),
  status: v.optional(v.string()),
  output: v.optional(v.array(v.string())), // Array of image URLs from Replicate
  error: v.optional(v.string()),
  metadata: v.optional(v.object({
    duration: v.optional(v.number()),
    model: v.optional(v.string()),
    prompt: v.optional(v.string()),
    params: v.optional(v.object({
      aspectRatio: v.optional(v.string()),
      steps: v.optional(v.number()),
      guidanceScale: v.optional(v.number()),
      seed: v.optional(v.number()),
      negativePrompt: v.optional(v.string()),
      count: v.optional(v.number()),
    })),
  })),
});

// Message schema
export const messageSchema = v.object({
  conversationId: v.id("conversations"),
  role: v.string(),
  content: v.string(),
  status: v.optional(messageStatusSchema),
  statusText: v.optional(v.string()), // For custom status messages (e.g., PDF reading progress)
  reasoning: v.optional(v.string()),
  model: v.optional(v.string()),
  provider: v.optional(v.string()),
  reasoningConfig: v.optional(reasoningConfigSchema),
  parentId: v.optional(v.id("messages")),
  isMainBranch: v.boolean(),
  // Legacy branching field (for backward compatibility)
  branchId: v.optional(v.string()),
  sourceConversationId: v.optional(v.id("conversations")),
  useWebSearch: v.optional(v.boolean()),
  attachments: v.optional(v.array(attachmentSchema)),
  citations: v.optional(v.array(webCitationSchema)),
  metadata: v.optional(extendedMessageMetadataSchema),
  imageGeneration: v.optional(imageGenerationSchema), // Add image generation support
  ttsAudioCache: v.optional(v.array(ttsAudioCacheEntrySchema)),
  createdAt: v.number(),
  completedAt: v.optional(v.number()),
});



// Favorites schema for user-favorited messages
export const messageFavoriteSchema = v.object({
  userId: v.id("users"),
  messageId: v.id("messages"),
  conversationId: v.id("conversations"),
  createdAt: v.number(),
});

 
// Background job manifest schema (for database storage)
export const backgroundJobManifestSchema = v.object({
  totalConversations: v.number(),
  totalMessages: v.number(),
  conversationDateRange: v.object({
    earliest: v.number(),
    latest: v.number(),
  }),
  conversationTitles: v.array(v.string()),
  includeAttachments: v.boolean(),
  fileSizeBytes: v.optional(v.number()),
  version: v.string(),
});

// Background job result schema (for database storage)
export const backgroundJobResultSchema = v.object({
  totalImported: v.number(),
  totalProcessed: v.number(),
  errors: v.array(v.string()),
  conversationIds: v.optional(v.array(v.string())),
});

// Background job schema
export const backgroundJobSchema = v.object({
  jobId: v.string(),
  userId: v.id("users"),
  type: backgroundJobTypeSchema,
  category: backgroundJobCategorySchema,
  status: backgroundJobStatusSchema,
  totalItems: v.number(),
  processedItems: v.number(),
  priority: backgroundJobPrioritySchema,
  retryCount: v.number(),
  maxRetries: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  startedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  payload: v.optional(v.any()),
  error: v.optional(v.string()),
  conversationIds: v.optional(v.array(v.id("conversations"))),
  includeAttachments: v.optional(v.boolean()),
  manifest: v.optional(backgroundJobManifestSchema),
  fileStorageId: v.optional(v.id("_storage")),
  result: v.optional(backgroundJobResultSchema),
});

// Discriminated union for results
export const jobResultSchema = v.union(
  v.object({ type: v.literal("export"), data: exportResult }),
  v.object({ type: v.literal("import"), data: importResult }),
  v.object({ type: v.literal("bulk_archive"), data: bulkOperationResult }),
  v.object({ type: v.literal("bulk_delete"), data: bulkOperationResult }),
  v.object({ type: v.literal("conversation_summary"), data: summaryResult }),
  v.object({ type: v.literal("data_migration"), data: migrationResult }),
  v.object({ type: v.literal("model_migration"), data: migrationResult }),
  v.object({ type: v.literal("backup"), data: exportResult })
);

// PDF text extraction cache schema
export const pdfTextCacheSchema = v.object({
  cacheKey: v.string(), // Hash-based cache key for PDF content
  textFileId: v.id("_storage"), // Reference to stored extracted text
  extractedAt: v.number(), // Timestamp when text was extracted
  contentLength: v.number(), // Length of extracted text
  wordCount: v.number(), // Word count of extracted text
  expiresAt: v.number(), // Cache expiration timestamp
});

// ============================================================================
// TYPE ALIASES USING INFER
// ============================================================================

// Document types inferred from schemas
export type ConversationDoc = Infer<typeof conversationSchema>;
export type UserDoc = Infer<typeof userSchema>;
export type PersonaDoc = Infer<typeof personaSchema>;
export type UserSettingsDoc = Infer<typeof userSettingsSchema>;
export type UserModelDoc = Infer<typeof userModelSchema>;
export type BackgroundJobDoc = Infer<typeof backgroundJobSchema>;
export type SharedConversationDoc = Infer<typeof sharedConversationSchema>;
export type UserApiKeyDoc = Infer<typeof userApiKeySchema>;
export type UserPersonaSettingsDoc = Infer<typeof userPersonaSettingsSchema>;
export type PdfTextCacheDoc = Infer<typeof pdfTextCacheSchema>;

// Argument types inferred from schemas
export type CreateMessageArgs = Infer<typeof messageCreationSchema>;
export type CreateConversationArgs = Infer<typeof conversationCreationSchema>;
export type CreatePersonaArgs = Infer<typeof personaImportSchema>;
export type UpdateUserSettingsArgs = Infer<typeof userSettingsUpdateSchema>;
export type CreateUserModelArgs = Infer<typeof userModelSchema>;
