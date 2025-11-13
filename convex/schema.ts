import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  accountSchema,
  backgroundJobSchema,
  builtInModelSchema,
  conversationSchema,
  imageModelDefinitionSchema,
  messageFavoriteSchema,
  messageSchema,
  pdfTextCacheSchema,
  personaSchema,
  sessionSchema,
  sharedConversationSchema,
  userApiKeySchema,
  userFileSchema,
  userImageModelSchema,
  userModelSchema,
  userPersonaSettingsSchema,
  userSchema,
  userSettingsSchema,
} from "./lib/schemas";

export default defineSchema({
  ...authTables,

  users: defineTable(userSchema).index("email", ["email"]),

  accounts: defineTable(accountSchema).index("by_provider_account", [
    "provider",
    "providerAccountId",
  ]),

  sessions: defineTable(sessionSchema).index("by_session_token", [
    "sessionToken",
  ]),

  conversations: defineTable(conversationSchema)
    .index("by_user_recent", ["userId", "updatedAt"])
    .index("by_user_pinned", ["userId", "isPinned", "updatedAt"])
    .index("by_user_archived", ["userId", "isArchived", "updatedAt"])
    .index("by_created_at", ["createdAt"])
    // Branching-related indexes
    .index("by_root_updated", ["rootConversationId", "updatedAt"])
    .index("by_parent", ["parentConversationId", "updatedAt"])
    .index("by_branch", ["branchId", "updatedAt"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["userId", "isArchived"],
    }),

  sharedConversations: defineTable(sharedConversationSchema)
    .index("by_share_id", ["shareId"])
    .index("by_original_conversation", ["originalConversationId"])
    .index("by_user", ["userId"])
    .index("by_last_updated", ["lastUpdated"]),

  messages: defineTable(messageSchema)
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
    .index("by_created_at", ["createdAt"])
    .index("by_user_created", ["userId", "createdAt"])
    .searchIndex("search_content", {
      searchField: "content",
      filterFields: ["conversationId", "isMainBranch"],
    }),

  userApiKeys: defineTable(userApiKeySchema).index("by_user_provider", [
    "userId",
    "provider",
  ]),

  userModels: defineTable(userModelSchema).index("by_user", ["userId"]),

  userImageModels: defineTable(userImageModelSchema).index("by_user", [
    "userId",
  ]),

  imageModelDefinitions: defineTable(imageModelDefinitionSchema)
    .index("by_model_id", ["modelId"])
    .index("by_provider", ["provider"])
    .index("by_created_at", ["createdAt"]),

  builtInModels: defineTable(builtInModelSchema)
    .index("by_provider", ["provider"])
    .index("by_active", ["isActive", "createdAt"]),

  personas: defineTable(personaSchema)
    .index("by_user_active", ["userId", "isActive"])
    .index("by_built_in", ["isBuiltIn"]),

  userPersonaSettings: defineTable(userPersonaSettingsSchema).index(
    "by_user_persona",
    ["userId", "personaId"]
  ),

  // Conversation summaries for efficient context management
  conversationSummaries: defineTable({
    conversationId: v.id("conversations"),
    chunkIndex: v.number(), // Which chunk this summarizes (0, 1, 2, etc.)
    summary: v.string(),
    messageCount: v.number(), // How many messages this chunk contains
    firstMessageId: v.id("messages"), // First message in this chunk
    lastMessageId: v.id("messages"), // Last message in this chunk
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_conversation_chunk", ["conversationId", "chunkIndex"])
    .index("by_conversation_updated", ["conversationId", "updatedAt"]),

  userSettings: defineTable(userSettingsSchema)
    .index("by_user", ["userId"])
    .index("by_auto_archive_enabled", ["autoArchiveEnabled"]),

  backgroundJobs: defineTable(backgroundJobSchema)
    .index("by_user_and_type", ["userId", "type"])
    .index("by_user_and_status", ["userId", "status"])
    .index("by_user_and_category", ["userId", "category"])
    .index("by_status_and_created", ["status", "createdAt"])
    .index("by_user_updated", ["userId", "updatedAt"])
    .index("by_user_id_and_job_id", ["userId", "jobId"])
    .index("by_user_id", ["userId"])
    .index("by_job_id", ["jobId"]),

  pdfTextCache: defineTable(pdfTextCacheSchema)
    .index("by_cache_key", ["cacheKey"])
    .index("by_expires_at", ["expiresAt"]),

  messageFavorites: defineTable(messageFavoriteSchema)
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_user_message", ["userId", "messageId"])
    .index("by_user_conversation", ["userId", "conversationId", "createdAt"]),

  userFiles: defineTable(userFileSchema)
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_user_type_created", ["userId", "type", "createdAt"])
    .index("by_user_generated", ["userId", "isGenerated", "createdAt"])
    .index("by_storage_id", ["userId", "storageId"])
    .index("by_message", ["messageId"])
    .index("by_conversation", ["conversationId", "createdAt"]),
});
