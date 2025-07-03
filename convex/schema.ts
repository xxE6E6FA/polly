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
  // Authentication tables from Convex Auth
  ...authTables,

  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerified: v.optional(v.number()),
    emailVerificationTime: v.optional(v.number()),
    image: v.optional(v.string()),
    isAnonymous: v.optional(v.boolean()),
    messagesSent: v.optional(v.number()), // Total messages sent (for anonymous user limits)
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
    personaId: v.optional(v.id("personas")), // Null means default persona
    sourceConversationId: v.optional(v.id("conversations")),
    isStreaming: v.optional(v.boolean()),
    isPinned: v.optional(v.boolean()),
    isArchived: v.optional(v.boolean()), // New field for archiving
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    // Optimized indexes for common queries
    .index("by_user_recent", ["userId", "updatedAt"]) // For recent conversations
    .index("by_user_pinned", ["userId", "isPinned", "updatedAt"]) // For pinned conversations
    .index("by_user_archived", ["userId", "isArchived", "updatedAt"]) // For archived conversations
    .index("by_created_at", ["createdAt"]), // For cleanup operations

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
    .index("by_user", ["userId"]),

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
    // Web search citations
    citations: v.optional(v.array(webCitationSchema)),
    metadata: v.optional(messageMetadataSchema),
    createdAt: v.number(),
  })
    .index("by_conversation", ["conversationId", "createdAt"])
    .index("by_parent", ["parentId"])
    // Add optimized indexes for common query patterns
    .index("by_conversation_main_branch", [
      "conversationId",
      "isMainBranch",
      "createdAt",
    ])
    .index("by_conversation_role", ["conversationId", "role", "createdAt"])
    .index("by_created_at", ["createdAt"]), // For cleanup operations

  userApiKeys: defineTable({
    userId: v.id("users"),
    provider: providerSchema,
    // Server-side encryption (for server operations)
    encryptedKey: v.optional(v.array(v.number())),
    initializationVector: v.optional(v.array(v.number())),
    // Client-side encryption (end-to-end, like Whisper app)
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
    free: v.optional(v.boolean()), // Mark as free model
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_provider", ["userId", "provider"])
    .index("by_user_model_id", ["userId", "modelId"]),

  personas: defineTable({
    userId: v.optional(v.id("users")), // Null for built-in personas
    name: v.string(),
    description: v.string(),
    prompt: v.string(),
    icon: v.optional(v.string()), // Emoji or icon identifier
    isBuiltIn: v.boolean(),
    isActive: v.boolean(),
    order: v.optional(v.number()), // For sorting
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_active", ["userId", "isActive"])
    .index("by_built_in", ["isBuiltIn"]),

  userPersonaSettings: defineTable({
    userId: v.id("users"),
    personaId: v.id("personas"), // Reference to built-in persona
    isDisabled: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_persona", ["userId", "personaId"]),

  userSettings: defineTable({
    userId: v.id("users"),
    personasEnabled: v.optional(v.boolean()), // Null/undefined means enabled (default)
    defaultModelSelected: v.optional(v.boolean()), // Track if user explicitly selected default model
    openRouterSorting: v.optional(
      v.union(
        v.literal("default"),
        v.literal("price"),
        v.literal("throughput"),
        v.literal("latency")
      )
    ), // OpenRouter provider sorting preference
    anonymizeForDemo: v.optional(v.boolean()), // Blur user info for video demos
    // Conversation archiving settings
    autoArchiveEnabled: v.optional(v.boolean()), // Whether to automatically archive old conversations
    autoArchiveDays: v.optional(v.number()), // Number of days after which to archive conversations
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),
});
