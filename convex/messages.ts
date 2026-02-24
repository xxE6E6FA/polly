import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { paginationOptsSchema } from "./lib/pagination";
import {
  attachmentSchema,
  extendedMessageMetadataSchema,
  imageGenerationSchema,
  messageStatusSchema,
  providerSchema,
  reasoningConfigSchema,
  reasoningPartSchema,
  toolCallSchema,
  ttsAudioCacheEntrySchema,
  webCitationSchema,
} from "./lib/schemas";

export { refineAssistantMessageHandler } from "./lib/message/action_handlers";
export {
  estimateTokensFromText,
  handleGetMessageById,
  handleMessageDeletion,
} from "./lib/message/helpers";
// Re-export handler functions for test files
export {
  createHandler,
  createUserMessageBatchedHandler,
  removeAttachmentHandler,
  removeHandler,
  removeMultipleHandler,
  setBranchHandler,
  toggleFavoriteHandler,
  updateHandler,
} from "./lib/message/mutation_handlers";
export {
  getAllInConversationHandler,
  getAlternativesHandler,
  getConversationTokenEstimateHandler,
  getLastAssistantModelHandler,
  getLastUsedModelHandler,
  getMessageCountHandler,
  hasStreamingMessageHandler,
  isFavoritedHandler,
  listFavoritesHandler,
  listFavoritesPaginatedHandler,
  listHandler,
} from "./lib/message/query_handlers";

import { refineAssistantMessageHandler } from "./lib/message/action_handlers";
import { handleGetMessageById } from "./lib/message/helpers";
import {
  addAttachmentsHandler,
  addToolCallHandler,
  appendReasoningSegmentHandler,
  clearImageGenerationAttachmentsHandler,
  finalizeStreamHandler,
  finalizeToolResultHandler,
  getAllInConversationInternalHandler,
  getByReplicateIdHandler,
  internalAtomicUpdateHandler,
  internalGetAllInConversationHandler,
  internalGetByIdHandler,
  internalGetByIdQueryHandler,
  internalRemoveMultipleHandler,
  internalUpdateHandler,
  setTtsAudioCacheHandler,
  streamingFlushHandler,
  updateAssistantContentHandler,
  updateAssistantStatusHandler,
  updateContentHandler,
  updateImageGenerationHandler,
  updateMessageErrorHandler,
  updateMessageStatusHandler,
} from "./lib/message/internal_handlers";
// Import handlers for use in function registrations
import {
  createHandler,
  createUserMessageBatchedHandler,
  removeAttachmentHandler,
  removeHandler,
  removeMultipleHandler,
  setBranchHandler,
  toggleFavoriteHandler,
  updateHandler,
} from "./lib/message/mutation_handlers";
import {
  getAllInConversationHandler,
  getAlternativesHandler,
  getConversationTokenEstimateHandler,
  getLastAssistantModelHandler,
  getLastUsedModelHandler,
  getMessageCountHandler,
  hasStreamingMessageHandler,
  isFavoritedHandler,
  listFavoritesHandler,
  listFavoritesPaginatedHandler,
  listHandler,
} from "./lib/message/query_handlers";

/**
 * ============================================================================
 * ATTACHMENT STORAGE PATTERN (Convex Direct Reference Pattern)
 * ============================================================================
 *
 * Attachments are stored in TWO places and kept in sync:
 *
 * 1. PRIMARY: messages.attachments field (array)
 *    - Fast direct access when displaying messages (no joins needed)
 *    - This is the source of truth for what attachments belong to a message
 *
 * 2. SECONDARY: userFiles table (indexed)
 *    - Enables efficient file-centric queries:
 *      * "Show me all PDFs for this user"
 *      * "Show me all images in this conversation"
 *      * "Get file usage statistics"
 *    - Used for file management UI, not for message display
 *
 * WHY BOTH?
 * - Performance: Direct field access is ~1ms vs join queries
 * - Flexibility: Can query files independently of messages
 * - Convex pattern: Duplicating data is OK when kept in sync via ACID mutations
 *
 * See: https://stack.convex.dev/relationship-structures-let-s-talk-about-schemas
 * ============================================================================
 */

// ============================================================================
// Public mutations
// ============================================================================

export const create = mutation({
  args: {
    conversationId: v.id("conversations"),
    role: v.string(),
    content: v.string(),
    status: v.optional(messageStatusSchema),
    model: v.optional(v.string()),
    provider: v.optional(v.string()),
    reasoningConfig: v.optional(reasoningConfigSchema),
    parentId: v.optional(v.id("messages")),
    isMainBranch: v.optional(v.boolean()),
    reasoning: v.optional(v.string()),
    sourceConversationId: v.optional(v.id("conversations")),
    useWebSearch: v.optional(v.boolean()),
    attachments: v.optional(v.array(attachmentSchema)),
    metadata: v.optional(extendedMessageMetadataSchema),
    imageGeneration: v.optional(imageGenerationSchema),
  },
  handler: createHandler,
});

export const createUserMessageBatched = mutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
    model: v.optional(v.string()),
    provider: v.optional(v.string()),
    reasoningConfig: v.optional(reasoningConfigSchema),
    parentId: v.optional(v.id("messages")),
    isMainBranch: v.optional(v.boolean()),
    reasoning: v.optional(v.string()),
    sourceConversationId: v.optional(v.id("conversations")),
    useWebSearch: v.optional(v.boolean()),
    attachments: v.optional(v.array(attachmentSchema)),
    metadata: v.optional(extendedMessageMetadataSchema),
  },
  handler: createUserMessageBatchedHandler,
});

export const update = mutation({
  args: {
    id: v.id("messages"),
    content: v.optional(v.string()),
    reasoning: v.optional(v.string()),
    patch: v.optional(v.any()),
  },
  handler: updateHandler,
});

export const setBranch = mutation({
  args: {
    messageId: v.id("messages"),
    parentId: v.optional(v.id("messages")),
  },
  handler: setBranchHandler,
});

export const remove = mutation({
  args: { id: v.id("messages") },
  handler: removeHandler,
});

export const removeMultiple = mutation({
  args: { ids: v.array(v.id("messages")) },
  handler: removeMultipleHandler,
});

export const removeAttachment = mutation({
  args: {
    messageId: v.id("messages"),
    attachmentName: v.string(),
  },
  handler: removeAttachmentHandler,
});

// --- Favorites ---

export const toggleFavorite = mutation({
  args: {
    messageId: v.id("messages"),
  },
  handler: toggleFavoriteHandler,
});

// ============================================================================
// Public queries
// ============================================================================

export const list = query({
  args: {
    conversationId: v.id("conversations"),
    includeAlternatives: v.optional(v.boolean()),
    paginationOpts: paginationOptsSchema,
    resolveAttachments: v.optional(v.boolean()), // Only resolve when needed
  },
  handler: listHandler,
});

export const getAlternatives = query({
  args: { parentId: v.id("messages") },
  handler: getAlternativesHandler,
});

export const getById = query({
  args: { id: v.id("messages") },
  handler: (ctx, args) => handleGetMessageById(ctx, args.id, true),
});

export const getAllInConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: getAllInConversationHandler,
});

export const hasStreamingMessage = query({
  args: { conversationId: v.id("conversations") },
  handler: hasStreamingMessageHandler,
});

export const getMessageCount = query({
  args: { conversationId: v.id("conversations") },
  handler: getMessageCountHandler,
});

export const getConversationTokenEstimate = query({
  args: { conversationId: v.id("conversations") },
  handler: getConversationTokenEstimateHandler,
});

export const isFavorited = query({
  args: {
    messageId: v.id("messages"),
  },
  handler: isFavoritedHandler,
});

export const listFavorites = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: listFavoritesHandler,
});

/**
 * Paginated query for favorites using Convex's native pagination.
 * Use with usePaginatedQuery hook for efficient infinite scroll.
 */
export const listFavoritesPaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: listFavoritesPaginatedHandler,
});

export const getLastUsedModel = query({
  args: { conversationId: v.id("conversations") },
  handler: getLastUsedModelHandler,
});

// Helper query to get the last assistant model used in a conversation
export const getLastAssistantModel = query({
  args: { conversationId: v.id("conversations") },
  handler: getLastAssistantModelHandler,
});

// ============================================================================
// Internal mutations
// ============================================================================

export const internalUpdate = internalMutation({
  args: {
    id: v.id("messages"),
    content: v.optional(v.string()),
    reasoning: v.optional(v.string()),
    model: v.optional(v.string()),
    provider: v.optional(providerSchema),
    // Web search citations
    citations: v.optional(v.array(webCitationSchema)),
    metadata: v.optional(extendedMessageMetadataSchema),
    // Streaming state that must be clearable on retry
    toolCalls: v.optional(v.array(toolCallSchema)),
    attachments: v.optional(v.array(attachmentSchema)),
    reasoningParts: v.optional(v.array(reasoningPartSchema)),
    // Allow simple appends for streaming-like updates
    appendContent: v.optional(v.string()),
    appendReasoning: v.optional(v.string()),
    // Fields to explicitly delete from metadata. Required because Convex strips `undefined`
    // from function arguments, so passing { metadata: { field: undefined } } won't work.
    clearMetadataFields: v.optional(v.array(v.string())),
  },
  handler: internalUpdateHandler,
});

// Internal mutation to update message content and completion metadata
export const updateContent = internalMutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
    reasoning: v.optional(v.string()),
    finishReason: v.optional(v.string()),
    // Legacy usage field (keep for backward compatibility if needed, or map to new structure)
    usage: v.optional(
      v.object({
        promptTokens: v.number(),
        completionTokens: v.number(),
        totalTokens: v.number(),
      })
    ),
    // New rich metadata fields
    tokenUsage: v.optional(
      v.object({
        inputTokens: v.number(),
        outputTokens: v.number(),
        totalTokens: v.number(),
        reasoningTokens: v.optional(v.number()),
        cachedInputTokens: v.optional(v.number()),
      })
    ),
    providerMessageId: v.optional(v.string()),
    timestamp: v.optional(v.string()),
    warnings: v.optional(v.array(v.string())),
    citations: v.optional(v.array(webCitationSchema)),
    timeToFirstTokenMs: v.optional(v.number()),
    tokensPerSecond: v.optional(v.number()),
  },
  handler: updateContentHandler,
});

export const setTtsAudioCache = internalMutation({
  args: {
    messageId: v.id("messages"),
    entries: v.optional(v.array(ttsAudioCacheEntrySchema)),
  },
  handler: setTtsAudioCacheHandler,
});

export const internalAtomicUpdate = internalMutation({
  args: {
    id: v.id("messages"),
    content: v.optional(v.string()),
    reasoning: v.optional(v.string()),
    appendContent: v.optional(v.string()),
    appendReasoning: v.optional(v.string()),
    citations: v.optional(v.array(webCitationSchema)),
    metadata: v.optional(extendedMessageMetadataSchema),
  },
  handler: internalAtomicUpdateHandler,
});

export const internalGetById = internalMutation({
  args: { id: v.id("messages") },
  handler: internalGetByIdHandler,
});

/**
 * Append reasoning text to a specific segment of the message's reasoningParts.
 * Used by the streaming core to build interleaved reasoning/tool-call streams.
 *
 * When a tool call interrupts reasoning, the streaming core bumps the segment index
 * so the next reasoning flush creates a new segment. This produces a structured
 * timeline: [reasoning1, toolCall, reasoning2, toolCall, reasoning3, ...]
 */
export const appendReasoningSegment = internalMutation({
  args: {
    messageId: v.id("messages"),
    segmentIndex: v.number(),
    text: v.string(),
    startedAt: v.number(),
  },
  handler: appendReasoningSegmentHandler,
});

/**
 * Unified streaming flush: content + reasoning + optional status in one DB write.
 * Reduces mutation count during streaming by ~50%.
 */
export const streamingFlush = internalMutation({
  args: {
    messageId: v.id("messages"),
    appendContent: v.optional(v.string()),
    appendReasoning: v.optional(
      v.object({
        segmentIndex: v.number(),
        text: v.string(),
        startedAt: v.number(),
      })
    ),
    status: v.optional(messageStatusSchema),
  },
  handler: streamingFlushHandler,
});

/**
 * Unified stream finalization: metadata + status "done" + clear conversation streaming.
 * Replaces 3 separate mutations at end of streaming.
 */
export const finalizeStream = internalMutation({
  args: {
    messageId: v.id("messages"),
    conversationId: v.id("conversations"),
    metadata: extendedMessageMetadataSchema,
    citations: v.optional(v.array(webCitationSchema)),
  },
  handler: finalizeStreamHandler,
});

/**
 * Add a new tool call to a message during streaming.
 * Called when a tool-call chunk is received from the AI SDK.
 */
export const addToolCall = internalMutation({
  args: {
    messageId: v.id("messages"),
    toolCall: toolCallSchema,
  },
  handler: addToolCallHandler,
});

/**
 * Combined mutation: finalize a tool call result in a single DB write.
 * Updates tool call status, optionally writes citations, and sets message status.
 * This avoids 3 sequential round-trips that block the streaming onChunk handler.
 */
export const finalizeToolResult = internalMutation({
  args: {
    messageId: v.id("messages"),
    toolCallId: v.string(),
    toolStatus: v.union(v.literal("completed"), v.literal("error")),
    toolError: v.optional(v.string()),
    citations: v.optional(v.array(webCitationSchema)),
    messageStatus: messageStatusSchema,
  },
  handler: finalizeToolResultHandler,
});

export const internalGetAllInConversation = internalMutation({
  args: { conversationId: v.id("conversations") },
  handler: internalGetAllInConversationHandler,
});

// Internal variant of removeMultiple that skips access checks.
// Use when the caller has already validated conversation ownership.
export const internalRemoveMultiple = internalMutation({
  args: { ids: v.array(v.id("messages")) },
  handler: internalRemoveMultipleHandler,
});

// Production-grade mutations for message status management
export const updateMessageStatus = internalMutation({
  args: {
    messageId: v.id("messages"),
    status: messageStatusSchema,
  },
  handler: updateMessageStatusHandler,
});

export const updateAssistantContent = internalMutation({
  args: {
    messageId: v.id("messages"),
    content: v.optional(v.string()),
    appendContent: v.optional(v.string()),
    status: v.optional(messageStatusSchema),
    reasoning: v.optional(v.string()),
    appendReasoning: v.optional(v.string()),
    citations: v.optional(v.array(webCitationSchema)),
    metadata: v.optional(extendedMessageMetadataSchema),
  },
  handler: updateAssistantContentHandler,
});

export const updateAssistantStatus = internalMutation({
  args: {
    messageId: v.id("messages"),
    status: messageStatusSchema,
    statusText: v.optional(v.string()),
  },
  handler: updateAssistantStatusHandler,
});

export const updateMessageError = internalMutation({
  args: {
    messageId: v.id("messages"),
    error: v.string(),
    errorDetail: v.optional(v.string()),
  },
  handler: updateMessageErrorHandler,
});

export const addAttachments = internalMutation({
  args: {
    messageId: v.id("messages"),
    attachments: v.array(attachmentSchema),
  },
  handler: addAttachmentsHandler,
});

export const clearImageGenerationAttachments = internalMutation({
  args: {
    messageId: v.id("messages"),
  },
  handler: clearImageGenerationAttachmentsHandler,
});

export const updateImageGeneration = internalMutation({
  args: {
    messageId: v.id("messages"),
    replicateId: v.optional(v.string()),
    status: v.optional(v.string()),
    output: v.optional(v.array(v.string())),
    error: v.optional(v.string()),
    metadata: v.optional(
      v.object({
        duration: v.optional(v.number()),
        model: v.optional(v.string()),
        prompt: v.optional(v.string()),
        params: v.optional(
          v.object({
            aspectRatio: v.optional(v.string()),
            steps: v.optional(v.number()),
            guidanceScale: v.optional(v.number()),
            seed: v.optional(v.number()),
            negativePrompt: v.optional(v.string()),
            count: v.optional(v.number()),
          })
        ),
      })
    ),
  },
  handler: updateImageGenerationHandler,
});

// ============================================================================
// Internal queries
// ============================================================================

export const getByIdInternal = internalQuery({
  args: { id: v.id("messages") },
  handler: (ctx, args) => handleGetMessageById(ctx, args.id, false),
});

export const getAllInConversationInternal = internalQuery({
  args: { conversationId: v.id("conversations") },
  handler: getAllInConversationInternalHandler,
});

export const internalGetByIdQuery = internalQuery({
  args: { id: v.id("messages") },
  handler: internalGetByIdQueryHandler,
});

export const getByReplicateId = internalQuery({
  args: {
    replicateId: v.string(),
  },
  handler: getByReplicateIdHandler,
});

// ============================================================================
// Actions
// ============================================================================

// Refine an existing assistant message by running a targeted LLM transform
export const refineAssistantMessage = action({
  args: {
    messageId: v.id("messages"),
    mode: v.union(
      v.literal("custom"),
      v.literal("more_concise"),
      v.literal("add_details")
    ),
    instruction: v.optional(v.string()),
  },
  handler: refineAssistantMessageHandler,
});
