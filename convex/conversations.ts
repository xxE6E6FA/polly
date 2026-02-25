import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
// --- Action handlers ---
import {
  createBranchingConversationHandler,
  createConversationActionHandler,
  createUserMessageHandler,
  editAndResendMessageHandler,
  savePrivateConversationHandler,
  sendMessageHandler,
  startConversationHandler,
} from "./lib/conversation/action_handlers";
import {
  processBulkDelete,
  scheduleBackgroundBulkDelete,
  scheduleBackgroundImport,
} from "./lib/conversation/background_operations";
// --- Mutation handlers ---
import {
  bulkRemoveHandler,
  clearStreamingForMessageHandler,
  createConversationHandler,
  createEmptyHandler,
  createEmptyInternalHandler,
  createWithUserIdHandler,
  internalBulkRemoveHandler,
  internalGetHandler,
  internalPatchHandler,
  patchHandler,
  prepareAssistantRetryHandler,
  prepareEditAndResendHandler,
  prepareSendMessageHandler,
  prepareStartConversationHandler,
  removeHandler,
  setStreamingHandler,
  stopGenerationHandler,
} from "./lib/conversation/mutation_handlers";
// --- Query handlers ---
import {
  getByClientIdHandler,
  getBySlugHandler,
  getConversationLimitStatusHandler,
  getForExportHandler,
  getHandler,
  getWithAccessInfoHandler,
  listHandler,
  searchHandler,
  searchWithMatchesHandler,
} from "./lib/conversation/query_handlers";
import {
  editMessageHandler,
  retryFromMessageHandler,
} from "./lib/conversation/retry_handlers";
import { paginationOptsSchema } from "./lib/pagination";
import {
  attachmentSchema,
  extendedMessageMetadataSchema,
  messageRoleSchema,
  modelProviderArgs,
  providerSchema,
  reasoningConfigSchema,
  webCitationSchema,
} from "./lib/schemas";

// Re-export handlers for direct usage in tests
export {
  createConversationHandler,
  listHandler,
  searchHandler,
  searchWithMatchesHandler,
  getHandler,
  getWithAccessInfoHandler,
  getForExportHandler,
  patchHandler,
  savePrivateConversationHandler,
  stopGenerationHandler,
  clearStreamingForMessageHandler,
};

// =====================================================================
// QUERIES
// =====================================================================

export const list = query({
  args: {
    paginationOpts: paginationOptsSchema,
    includeArchived: v.optional(v.boolean()),
    archivedOnly: v.optional(v.boolean()),
    sortDirection: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    profileId: v.optional(v.id("profiles")),
    includeUnassigned: v.optional(v.boolean()),
  },
  handler: listHandler,
});

export const search = query({
  args: {
    searchQuery: v.string(),
    includeArchived: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: searchHandler,
});

export const searchWithMatches = query({
  args: {
    searchQuery: v.string(),
    limit: v.optional(v.number()),
    maxMatchesPerConversation: v.optional(v.number()),
    profileId: v.optional(v.id("profiles")),
    includeUnassigned: v.optional(v.boolean()),
  },
  handler: searchWithMatchesHandler,
});

export const get = query({
  args: { id: v.id("conversations") },
  handler: getHandler,
});

export const getWithAccessInfo = query({
  args: { id: v.id("conversations") },
  handler: getWithAccessInfoHandler,
});

/**
 * Get conversation by slug (clientId) with access info.
 * Supports both new UUID-based URLs and legacy Convex ID URLs.
 * First tries to find by clientId, then falls back to treating slug as Convex ID.
 */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: getBySlugHandler,
});

export const getForExport = query({
  args: {
    id: v.string(),
    limit: v.optional(v.number()),
  },
  handler: getForExportHandler,
});

/**
 * Find a conversation by its client-generated ID.
 * Used for optimistic navigation - client navigates immediately and polls for the conversation.
 */
export const getByClientId = query({
  args: {
    clientId: v.string(),
  },
  returns: v.union(v.id("conversations"), v.null()),
  handler: getByClientIdHandler,
});

/**
 * Get the context limit status for a conversation.
 * Returns token usage, effective limit, and whether the conversation is at/near the limit.
 */
export const getConversationLimitStatus = query({
  args: { conversationId: v.id("conversations") },
  handler: getConversationLimitStatusHandler,
});

export const internalGet = internalQuery({
  args: { id: v.id("conversations") },
  handler: internalGetHandler,
});

// =====================================================================
// MUTATIONS
// =====================================================================

export const createConversation = mutation({
  args: {
    title: v.optional(v.string()),
    personaId: v.optional(v.id("personas")),
    sourceConversationId: v.optional(v.id("conversations")),
    profileId: v.optional(v.id("profiles")),
    firstMessage: v.string(),
    attachments: v.optional(v.array(attachmentSchema)),
    model: v.optional(v.string()),
    provider: v.optional(providerSchema),
    reasoningConfig: v.optional(reasoningConfigSchema),
    temperature: v.optional(v.number()),
    topP: v.optional(v.number()),
    topK: v.optional(v.number()),
    frequencyPenalty: v.optional(v.number()),
    presencePenalty: v.optional(v.number()),
  },
  handler: createConversationHandler,
});

export const patch = mutation({
  args: {
    id: v.id("conversations"),
    updates: v.any(),
    setUpdatedAt: v.optional(v.boolean()),
  },
  handler: patchHandler,
});

// Internal mutation for system operations like title generation
export const internalPatch = internalMutation({
  args: {
    id: v.id("conversations"),
    updates: v.any(),
    setUpdatedAt: v.optional(v.boolean()),
    // Fields to explicitly delete. Required because Convex strips `undefined` from
    // function arguments, so passing { field: undefined } in `updates` won't work.
    clearFields: v.optional(v.array(v.string())),
  },
  handler: internalPatchHandler,
});

/**
 * Conditionally clear streaming state only if this message is the current streaming message.
 * This prevents race conditions where an old streaming action's finally block
 * could interfere with a new streaming action that has already started.
 */
export const clearStreamingForMessage = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    messageId: v.id("messages"),
  },
  handler: clearStreamingForMessageHandler,
});

export const createWithUserId = internalMutation({
  args: {
    title: v.optional(v.string()),
    userId: v.id("users"),
    personaId: v.optional(v.id("personas")),
    sourceConversationId: v.optional(v.id("conversations")),
    firstMessage: v.string(),
    attachments: v.optional(v.array(attachmentSchema)),
    useWebSearch: v.optional(v.boolean()),
    model: v.optional(v.string()),
    provider: v.optional(providerSchema),
    reasoningConfig: v.optional(reasoningConfigSchema),
  },
  handler: createWithUserIdHandler,
});

export const createEmptyInternal = internalMutation({
  args: {
    title: v.optional(v.string()),
    userId: v.id("users"),
    personaId: v.optional(v.id("personas")),
    clientId: v.optional(v.string()),
    profileId: v.optional(v.id("profiles")),
  },
  handler: createEmptyInternalHandler,
});

/**
 * Combined send-message mutation: all DB work in one transaction.
 * The action wrapper only needs auth + this single call.
 */
export const prepareSendMessage = internalMutation({
  args: {
    userId: v.id("users"),
    conversationId: v.id("conversations"),
    content: v.string(),
    model: v.optional(v.string()),
    provider: v.optional(v.string()),
    personaId: v.optional(v.id("personas")),
    attachments: v.optional(v.array(attachmentSchema)),
    reasoningConfig: v.optional(reasoningConfigSchema),
    temperature: v.optional(v.number()),
  },
  handler: prepareSendMessageHandler,
});

/**
 * Combined start-conversation mutation: create conversation + messages + schedule streaming.
 * The action wrapper only needs auth + this single call.
 */
export const prepareStartConversation = internalMutation({
  args: {
    userId: v.id("users"),
    clientId: v.string(),
    content: v.string(),
    personaId: v.optional(v.id("personas")),
    profileId: v.optional(v.id("profiles")),
    attachments: v.optional(v.array(attachmentSchema)),
    model: v.optional(v.string()),
    provider: v.optional(v.string()),
    reasoningConfig: v.optional(reasoningConfigSchema),
    temperature: v.optional(v.number()),
  },
  handler: prepareStartConversationHandler,
});

/**
 * Combined assistant-retry mutation: all DB work in one transaction.
 * Eliminates 4+N sequential round-trips.
 */
export const prepareAssistantRetry = internalMutation({
  args: {
    userId: v.id("users"),
    conversationId: v.id("conversations"),
    targetMessageId: v.id("messages"),
    messageIdsToDelete: v.array(v.id("messages")),
    model: v.optional(v.string()),
    provider: v.optional(v.string()),
    reasoningConfig: v.optional(reasoningConfigSchema),
    previousUserMessageIndex: v.number(),
    personaId: v.optional(v.id("personas")),
  },
  handler: prepareAssistantRetryHandler,
});

/**
 * Combined edit-and-resend mutation: all DB work in one transaction.
 * Eliminates 5-7 sequential round-trips.
 */
export const prepareEditAndResend = internalMutation({
  args: {
    userId: v.id("users"),
    conversationId: v.id("conversations"),
    userMessageId: v.id("messages"),
    newContent: v.string(),
    messageIdsToDelete: v.array(v.id("messages")),
    model: v.optional(v.string()),
    provider: v.optional(v.string()),
    personaId: v.optional(v.id("personas")),
    reasoningConfig: v.optional(reasoningConfigSchema),
    scheduleStreaming: v.optional(v.boolean()),
  },
  handler: prepareEditAndResendHandler,
});

/**
 * Create an empty conversation (fast mutation for immediate navigation).
 * Used by the home page to create a conversation before sending the first message.
 * Accepts a clientId for optimistic navigation - the client can navigate immediately
 * and poll for the conversation by clientId.
 */
export const createEmpty = mutation({
  args: {
    clientId: v.string(),
    personaId: v.optional(v.id("personas")),
    profileId: v.optional(v.id("profiles")),
  },
  returns: v.id("conversations"),
  handler: createEmptyHandler,
});

export const remove = mutation({
  args: { id: v.id("conversations") },
  handler: removeHandler,
});

export const bulkRemove = mutation({
  args: { ids: v.array(v.id("conversations")) },
  handler: bulkRemoveHandler,
});

/**
 * Internal bulk remove mutation for background job processing.
 * This bypasses auth checks because the calling action has already validated ownership.
 * The userId is passed explicitly rather than derived from auth context.
 */
export const internalBulkRemove = internalMutation({
  args: {
    ids: v.array(v.id("conversations")),
    userId: v.id("users"),
  },
  handler: internalBulkRemoveHandler,
});

export const stopGeneration = mutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.optional(v.string()),
    reasoning: v.optional(v.string()),
  },
  handler: stopGenerationHandler,
});

/**
 * Set conversation streaming state.
 * When starting streaming, optionally provide messageId to track which message is being streamed.
 * This helps prevent race conditions where old streaming actions interfere with new ones.
 */
export const setStreaming = mutation({
  args: {
    conversationId: v.id("conversations"),
    isStreaming: v.boolean(),
    messageId: v.optional(v.id("messages")),
  },
  handler: setStreamingHandler,
});

// =====================================================================
// ACTIONS
// =====================================================================

/**
 * Create a user message without triggering AI response (for image generation)
 *
 * Note: If this is the first user message in a conversation with a generic title
 * (like "Image Generation"), it will schedule title generation based on the user message.
 */
export const createUserMessage = action({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
    model: v.optional(v.string()),
    provider: v.optional(v.string()),
    personaId: v.optional(v.id("personas")),
    attachments: v.optional(v.array(attachmentSchema)),
    reasoningConfig: v.optional(reasoningConfigSchema),
    temperature: v.optional(v.number()),
  },
  returns: v.object({
    userMessageId: v.id("messages"),
  }),
  handler: createUserMessageHandler,
});

/**
 * Send a message with dynamic model and persona selection (moved from agent_conversations)
 */
export const sendMessage = action({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
    model: v.optional(v.string()),
    provider: v.optional(v.string()),
    personaId: v.optional(v.id("personas")),
    attachments: v.optional(v.array(attachmentSchema)),
    reasoningConfig: v.optional(reasoningConfigSchema),
    temperature: v.optional(v.number()),
    maxTokens: v.optional(v.number()),
    topP: v.optional(v.number()),
    frequencyPenalty: v.optional(v.number()),
    presencePenalty: v.optional(v.number()),
    topK: v.optional(v.number()),
    repetitionPenalty: v.optional(v.number()),
  },
  returns: v.object({
    userMessageId: v.id("messages"),
    assistantMessageId: v.id("messages"),
  }),
  handler: sendMessageHandler,
});

export const savePrivateConversation = action({
  args: {
    messages: v.array(
      v.object({
        role: messageRoleSchema,
        content: v.string(),
        createdAt: v.number(),
        model: v.optional(v.string()),
        provider: v.optional(providerSchema),
        reasoning: v.optional(v.string()),
        attachments: v.optional(v.array(attachmentSchema)),
        citations: v.optional(v.array(webCitationSchema)),
        metadata: v.optional(extendedMessageMetadataSchema),
      })
    ),
    title: v.optional(v.string()),
    personaId: v.optional(v.id("personas")),
  },
  handler: savePrivateConversationHandler,
});

/**
 * Start a new conversation with the first message (unified action).
 * Atomically creates the conversation and sends the first message.
 * Used by the home page for instant navigation with optimistic UI.
 */
export const startConversation = action({
  args: {
    clientId: v.string(),
    content: v.string(),
    personaId: v.optional(v.id("personas")),
    profileId: v.optional(v.id("profiles")),
    attachments: v.optional(v.array(attachmentSchema)),
    model: v.optional(v.string()),
    provider: v.optional(v.string()),
    reasoningConfig: v.optional(reasoningConfigSchema),
    temperature: v.optional(v.number()),
  },
  returns: v.object({
    conversationId: v.id("conversations"),
    userMessageId: v.id("messages"),
    assistantMessageId: v.id("messages"),
  }),
  handler: startConversationHandler,
});

export const editAndResendMessage = action({
  args: {
    messageId: v.id("messages"),
    newContent: v.string(),
    ...modelProviderArgs,
    reasoningConfig: v.optional(reasoningConfigSchema),
    temperature: v.optional(v.number()),
    maxTokens: v.optional(v.number()),
    topP: v.optional(v.number()),
    frequencyPenalty: v.optional(v.number()),
    presencePenalty: v.optional(v.number()),
    webSearchMaxResults: v.optional(v.number()),
  },
  returns: v.object({
    assistantMessageId: v.id("messages"),
  }),
  handler: editAndResendMessageHandler,
});

export const retryFromMessage = action({
  args: {
    conversationId: v.id("conversations"),
    messageId: v.id("messages"),
    retryType: v.optional(v.union(v.literal("user"), v.literal("assistant"))),
    ...modelProviderArgs,
    personaId: v.optional(v.id("personas")),
    reasoningConfig: v.optional(reasoningConfigSchema),
  },
  handler: retryFromMessageHandler,
});

export const editMessage = action({
  args: {
    conversationId: v.id("conversations"),
    messageId: v.id("messages"),
    newContent: v.string(),
    ...modelProviderArgs,
    reasoningConfig: v.optional(reasoningConfigSchema),
  },
  handler: editMessageHandler,
});

export const createBranchingConversation = action({
  args: {
    userId: v.optional(v.id("users")),
    firstMessage: v.string(),
    sourceConversationId: v.optional(v.id("conversations")),
    personaId: v.optional(v.id("personas")),
    personaPrompt: v.optional(v.string()),
    attachments: v.optional(v.array(attachmentSchema)),
    useWebSearch: v.optional(v.boolean()),
    generateTitle: v.optional(v.boolean()),
    reasoningConfig: v.optional(reasoningConfigSchema),
    contextSummary: v.optional(v.string()),
  },
  handler: createBranchingConversationHandler,
});

/**
 * Create conversation action wrapper (UI expects this)
 */
export const createConversationAction = action({
  args: {
    title: v.optional(v.string()),
    personaId: v.optional(v.id("personas")),
    profileId: v.optional(v.id("profiles")),
    model: v.optional(v.string()),
    provider: v.optional(v.string()),
    firstMessage: v.optional(v.string()),
    attachments: v.optional(v.array(attachmentSchema)),
    useWebSearch: v.optional(v.boolean()),
    reasoningConfig: v.optional(reasoningConfigSchema),
    temperature: v.optional(v.number()),
  },
  returns: v.union(
    v.object({
      conversationId: v.id("conversations"),
      userMessageId: v.id("messages"),
      assistantMessageId: v.id("messages"),
    }),
    v.object({
      conversationId: v.id("conversations"),
    })
  ),
  handler: createConversationActionHandler,
});

// Re-export background operations for API compatibility
export {
  scheduleBackgroundImport,
  scheduleBackgroundBulkDelete,
  processBulkDelete,
};
