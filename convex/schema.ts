import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  attachmentSchema,
  messageRoleSchema,
  webCitationSchema,
  messageMetadataSchema,
  providerSchema,
} from "./lib/schemas";

export default defineSchema({
  ...authTables,

  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerified: v.optional(v.number()),
    emailVerificationTime: v.optional(v.number()),
    image: v.optional(v.string()),
    isAnonymous: v.optional(v.boolean()),
    messagesSent: v.optional(v.number()),
    createdAt: v.optional(v.number()),
    monthlyMessagesSent: v.optional(v.number()),
    monthlyLimit: v.optional(v.number()),
    lastMonthlyReset: v.optional(v.number()),
    hasUnlimitedCalls: v.optional(v.boolean()),
    conversationCount: v.optional(v.number()),
    totalMessageCount: v.optional(v.number()),
  }).index("email", ["email"]),

  accounts: defineTable({
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
  }).index("by_provider_account", ["provider", "providerAccountId"]),

  sessions: defineTable({
    sessionToken: v.string(),
    userId: v.id("users"),
    expires: v.number(),
  }).index("by_session_token", ["sessionToken"]),

  conversations: defineTable({
    title: v.string(),
    userId: v.id("users"),
    personaId: v.optional(v.id("personas")),
    sourceConversationId: v.optional(v.id("conversations")),
    isStreaming: v.optional(v.boolean()),
    isPinned: v.optional(v.boolean()),
    isArchived: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_recent", ["userId", "updatedAt"])
    .index("by_user_pinned", ["userId", "isPinned", "updatedAt"])
    .index("by_user_archived", ["userId", "isArchived", "updatedAt"])
    .index("by_created_at", ["createdAt"]),

  sharedConversations: defineTable({
    shareId: v.string(),
    originalConversationId: v.id("conversations"),
    userId: v.id("users"),
    title: v.string(),
    sharedAt: v.number(),
    lastUpdated: v.number(),
    messageCount: v.number(),
  })
    .index("by_share_id", ["shareId"])
    .index("by_original_conversation", ["originalConversationId"])
    .index("by_user", ["userId"])
    .index("by_last_updated", ["lastUpdated"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    role: messageRoleSchema,
    content: v.string(),
    reasoning: v.optional(v.string()),
    model: v.optional(v.string()),
    provider: v.optional(v.string()),
    parentId: v.optional(v.id("messages")),
    isMainBranch: v.boolean(),
    sourceConversationId: v.optional(v.id("conversations")),
    useWebSearch: v.optional(v.boolean()),
    attachments: v.optional(v.array(attachmentSchema)),
    citations: v.optional(v.array(webCitationSchema)),
    metadata: v.optional(messageMetadataSchema),
    createdAt: v.number(),
  })
    .index("by_conversation", ["conversationId", "createdAt"])
    .index("by_parent", ["parentId"])
    .index("by_conversation_main_branch", [
      "conversationId",
      "isMainBranch",
      "createdAt",
    ])
    .index("by_conversation_role", ["conversationId", "role", "createdAt"])
    .index("by_conversation_streaming", [
      "conversationId",
      "role",
      "metadata.finishReason",
    ])
    .index("by_created_at", ["createdAt"]),

  userApiKeys: defineTable({
    userId: v.id("users"),
    provider: providerSchema,
    encryptedKey: v.optional(v.array(v.number())),
    initializationVector: v.optional(v.array(v.number())),
    clientEncryptedKey: v.optional(v.string()),
    partialKey: v.string(),
    isValid: v.boolean(),
    createdAt: v.number(),
    lastValidated: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_provider", ["userId", "provider"]),

  userModels: defineTable({
    userId: v.id("users"),
    modelId: v.string(),
    name: v.string(),
    provider: v.string(),
    contextLength: v.number(),
    maxOutputTokens: v.optional(v.number()),
    supportsImages: v.boolean(),
    supportsTools: v.boolean(),
    supportsReasoning: v.boolean(),
    inputModalities: v.optional(v.array(v.string())),
    selected: v.optional(v.boolean()),
    free: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_provider", ["userId", "provider"])
    .index("by_user_model_id", ["userId", "modelId"])
    .index("by_user_selected", ["userId", "selected"]),

  personas: defineTable({
    userId: v.optional(v.id("users")),
    name: v.string(),
    description: v.string(),
    prompt: v.string(),
    icon: v.optional(v.string()),
    isBuiltIn: v.boolean(),
    isActive: v.boolean(),
    order: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_active", ["userId", "isActive"])
    .index("by_built_in", ["isBuiltIn"]),

  userPersonaSettings: defineTable({
    userId: v.id("users"),
    personaId: v.id("personas"),
    isDisabled: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_persona", ["userId", "personaId"]),

  userSettings: defineTable({
    userId: v.id("users"),
    personasEnabled: v.optional(v.boolean()),
    defaultModelSelected: v.optional(v.boolean()),
    openRouterSorting: v.optional(
      v.union(
        v.literal("default"),
        v.literal("price"),
        v.literal("throughput"),
        v.literal("latency")
      )
    ),
    anonymizeForDemo: v.optional(v.boolean()),
    autoArchiveEnabled: v.optional(v.boolean()),
    autoArchiveDays: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_auto_archive_enabled", ["autoArchiveEnabled"]),

  backgroundJobs: defineTable({
    jobId: v.string(),
    userId: v.id("users"),
    type: v.union(
      v.literal("export"),
      v.literal("import"),
      v.literal("bulk_archive"),
      v.literal("bulk_delete"),
      v.literal("conversation_summary"),
      v.literal("data_migration"),
      v.literal("model_migration"),
      v.literal("backup")
    ),
    category: v.union(
      v.literal("data_transfer"),
      v.literal("bulk_operations"),
      v.literal("ai_processing"),
      v.literal("maintenance")
    ),
    status: v.union(
      v.literal("scheduled"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    totalItems: v.number(),
    processedItems: v.number(),
    priority: v.union(
      v.literal("low"),
      v.literal("normal"),
      v.literal("high"),
      v.literal("urgent")
    ),
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

    manifest: v.optional(
      v.object({
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
      })
    ),
    fileStorageId: v.optional(v.id("_storage")),

    result: v.optional(
      v.object({
        totalImported: v.number(),
        totalProcessed: v.number(),
        errors: v.array(v.string()),
        conversationIds: v.optional(v.array(v.string())),
      })
    ),
  })
    .index("by_user_and_type", ["userId", "type"])
    .index("by_user_and_status", ["userId", "status"])
    .index("by_user_and_category", ["userId", "category"])
    .index("by_status_and_created", ["status", "createdAt"])
    .index("by_user_updated", ["userId", "updatedAt"])
    .index("by_job_id", ["jobId"]),
});
