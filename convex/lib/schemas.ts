import { v } from "convex/values";

// Common attachment schema used across messages and conversations
export const attachmentSchema = v.object({
  type: v.union(v.literal("image"), v.literal("pdf"), v.literal("text")),
  url: v.string(),
  name: v.string(),
  size: v.number(),
  content: v.optional(v.string()),
  thumbnail: v.optional(v.string()),
  storageId: v.optional(v.id("_storage")),
});

// Extended attachment schema with mimeType for processing
export const attachmentWithMimeTypeSchema = v.object({
  type: v.union(v.literal("image"), v.literal("pdf"), v.literal("text")),
  url: v.string(),
  name: v.string(),
  size: v.number(),
  content: v.optional(v.string()),
  thumbnail: v.optional(v.string()),
  storageId: v.optional(v.id("_storage")),
  mimeType: v.optional(v.string()),
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
  v.literal("openrouter")
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
  stopped: v.optional(v.boolean()),
  searchQuery: v.optional(v.string()),
  searchFeature: v.optional(v.string()),
  searchCategory: v.optional(v.string()),
});

// Common args for model and provider
export const modelProviderArgs = {
  model: v.string(),
  provider: v.string(),
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
