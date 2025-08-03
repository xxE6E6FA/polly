import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import {
  accountSchema,
  backgroundJobSchema,
  builtInModelSchema,
  conversationSchema,
  messageSchema,
  pdfTextCacheSchema,
  personaSchema,
  sessionSchema,
  sharedConversationSchema,
  userApiKeySchema,
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
    .searchIndex("search_content", {
      searchField: "content",
      filterFields: ["conversationId", "isMainBranch"],
    }),

  userApiKeys: defineTable(userApiKeySchema).index("by_user_provider", [
    "userId",
    "provider",
  ]),

  userModels: defineTable(userModelSchema).index("by_user", ["userId"]),

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
});
