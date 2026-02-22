import { ConvexError } from "convex/values";
import { getAuthUserId } from "./auth";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx, ActionCtx } from "../_generated/server";
import { api } from "../_generated/api";
import { getUserEffectiveModelWithCapabilities } from "./model_resolution";
import { MAX_USER_MESSAGE_CHARS } from "../constants";
import {
  ANONYMOUS_MESSAGE_LIMIT,
  MONTHLY_MESSAGE_LIMIT,
} from "../../shared/constants";

/**
 * Shared authentication and user validation utilities
 */

// Get authenticated user with consistent error handling
export async function getAuthenticatedUser(
  ctx: MutationCtx | QueryCtx,
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError("User not authenticated");
  }
  return userId;
}

// Get authenticated user and user data in one call
export async function getAuthenticatedUserWithData(
  ctx: MutationCtx | QueryCtx,
): Promise<{
  userId: Id<"users">;
  user: Doc<"users">;
}> {
  const userId = await getAuthenticatedUser(ctx);
  const user = await ctx.db.get("users", userId);
  if (!user) {
    throw new ConvexError("User not found");
  }
  return { userId, user };
}

// Get authenticated user and user data for actions (uses runQuery)
export async function getAuthenticatedUserWithDataForAction(
  ctx: ActionCtx,
): Promise<{
  userId: Id<"users">;
  user: Doc<"users">;
}> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError("User not authenticated");
  }
  const user = await ctx.runQuery(api.users.current, {});
  if (!user) {
    throw new ConvexError("User not found");
  }
  return { userId, user };
}

// Validate user authentication and return user data
export async function validateAuthenticatedUser(
  ctx: MutationCtx | QueryCtx,
): Promise<Doc<"users">> {
  const userId = await getAuthenticatedUser(ctx);
  const user = await ctx.db.get("users", userId);
  if (!user) {
    throw new ConvexError("User not found");
  }
  return user;
}

/**
 * Shared conversation access utilities
 */

// Check if user has access to conversation
export async function hasConversationAccess(
  ctx: MutationCtx | QueryCtx,
  conversationId: Id<"conversations">,
  allowShared: boolean = true,
): Promise<{ hasAccess: boolean; conversation: Doc<"conversations"> | null }> {
  try {
    const conversation = await ctx.db.get("conversations", conversationId);
    if (!conversation) {
      return { hasAccess: false, conversation: null };
    }

    // Check direct ownership
    if (conversation.userId) {
      const userId = await getAuthUserId(ctx);
      if (userId && conversation.userId === userId) {
        return { hasAccess: true, conversation };
      }
    }

    // Check shared access if allowed
    if (allowShared) {
      const sharedConversation = await ctx.db
        .query("sharedConversations")
        .withIndex("by_original_conversation", (q) =>
          q.eq("originalConversationId", conversationId),
        )
        .first();

      if (sharedConversation) {
        return { hasAccess: true, conversation };
      }
    }

    return { hasAccess: false, conversation };
  } catch {
    return { hasAccess: false, conversation: null };
  }
}

// Validate conversation access and throw if denied
export async function validateConversationAccess(
  ctx: MutationCtx | QueryCtx,
  conversationId: Id<"conversations">,
  allowShared: boolean = true,
): Promise<Doc<"conversations">> {
  const { hasAccess, conversation } = await hasConversationAccess(
    ctx,
    conversationId,
    allowShared,
  );
  if (!hasAccess || !conversation) {
    throw new ConvexError<string>("Access denied");
  }
  return conversation;
}

/**
 * Shared model resolution utilities
 */

// Get model with capabilities using query API
export async function resolveModelWithCapabilities(
  ctx: MutationCtx | QueryCtx,
  model?: string,
  provider?: string,
) {
  return await getUserEffectiveModelWithCapabilities(ctx, model, provider);
}

/**
 * Shared message utilities
 */

// Get message count for conversation
export async function getMessageCount(
  ctx: MutationCtx | QueryCtx,
  conversationId: Id<"conversations">,
): Promise<number> {
  return await ctx.runQuery(api.messages.getMessageCount, {
    conversationId,
  });
}

// Get conversation messages with consistent filtering
export async function getConversationMessages(
  ctx: MutationCtx | QueryCtx,
  conversationId: Id<"conversations">,
  includeMainBranchOnly: boolean = true,
) {
  let query = ctx.db
    .query("messages")
    .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
    .order("asc");

  if (includeMainBranchOnly) {
    query = query.filter((q) => q.eq(q.field("isMainBranch"), true));
  }

  return await query.collect();
}

/**
 * Shared error handling utilities
 */

// Standard error messages
export const ERROR_MESSAGES = {
  USER_NOT_AUTHENTICATED: "User not authenticated",
  USER_NOT_FOUND: "User not found",
  ACCESS_DENIED: "Access denied",
  CONVERSATION_NOT_FOUND: "Conversation not found",
  MESSAGE_NOT_FOUND: "Message not found",
  INVALID_INPUT: "Invalid input",
} as const;

// Create standardized errors
export function createError(
  message: keyof typeof ERROR_MESSAGES,
): ConvexError<string> {
  return new ConvexError(ERROR_MESSAGES[message]);
}

/**
 * Shared business logic utilities
 */

/**
 * Get the monthly message limit for a user.
 * Anonymous users have a lower limit than signed-in users.
 */
export function getUserMonthlyLimit(user: Doc<"users">): number {
  if (user.isAnonymous) {
    return ANONYMOUS_MESSAGE_LIMIT;
  }
  return user.monthlyLimit ?? MONTHLY_MESSAGE_LIMIT;
}

/**
 * Check if user can send a message to a free/built-in model.
 * Returns { canSend: boolean, remaining: number, limit: number }
 */
export function checkFreeModelUsage(user: Doc<"users">): {
  canSend: boolean;
  remaining: number;
  limit: number;
} {
  // Users with unlimited calls bypass limits
  if (user.hasUnlimitedCalls) {
    return { canSend: true, remaining: Number.MAX_SAFE_INTEGER, limit: 0 };
  }

  const limit = getUserMonthlyLimit(user);
  const sent = user.monthlyMessagesSent ?? 0;
  const remaining = Math.max(0, limit - sent);

  return {
    canSend: remaining > 0,
    remaining,
    limit,
  };
}

/**
 * Validate that user can use a free/built-in model.
 * Throws ConvexError if limit is reached.
 */
export function validateFreeModelUsage(user: Doc<"users">): void {
  const { canSend, limit } = checkFreeModelUsage(user);
  if (!canSend) {
    const userType = user.isAnonymous ? "anonymous" : "monthly";
    throw new ConvexError<string>(
      `You've reached your ${userType} limit of ${limit} free messages. ` +
        (user.isAnonymous
          ? "Sign in for more messages or add your own API keys."
          : "Add your own API keys for unlimited usage."),
    );
  }
}



// Create default conversation fields
export function createDefaultConversationFields(
  userId: Id<"users">,
  options: {
    title?: string;
    personaId?: Id<"personas">;
    sourceConversationId?: Id<"conversations">;
    profileId?: Id<"profiles">;
  } = {},
) {
  return {
    title: options.title || "New Conversation",
    userId: userId,
    personaId: options.personaId,
    profileId: options.profileId,
    sourceConversationId: options.sourceConversationId,
    isStreaming: false,
    isArchived: false,
    isPinned: false,
    tokenEstimate: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// Create default message fields
export function createDefaultMessageFields(
  conversationId: Id<"conversations">,
  userId: Id<"users">,
  options: {
    role: string;
    content: string;
    model?: string;
    provider?: string;
    attachments?: any[];
    reasoningConfig?: any;
    temperature?: number;
    status?:
      | "thinking"
      | "searching"
      | "reading_pdf"
      | "streaming"
      | "done"
      | "error";
  } = { role: "user", content: "" },
) {
  return {
    conversationId,
    userId,
    role: options.role,
    content: options.content,
    model: options.model,
    provider: options.provider,
    attachments: options.attachments,
    reasoningConfig: options.reasoningConfig,
    status: options.status,
    isMainBranch: true,
    createdAt: Date.now(),
    metadata:
      options.temperature !== undefined
        ? { temperature: options.temperature }
        : undefined,
  };
}

// Validate a user-authored message length against a global cap
export function validateUserMessageLength(content: string) {
  if (content && content.length > MAX_USER_MESSAGE_CHARS) {
    throw new ConvexError(
      `Your message is too long (${content.length} characters). The maximum allowed is ${MAX_USER_MESSAGE_CHARS}. Please attach a file or split the message into smaller parts.`,
    );
  }
}

/**
 * Maximum allowed conversation title length
 */
const MAX_TITLE_LENGTH = 500;

/**
 * Validate conversation title length
 * @throws ConvexError if title exceeds max length
 */
export function validateTitleLength(title: string | undefined | null): void {
  if (title && title.length > MAX_TITLE_LENGTH) {
    throw new ConvexError(
      `Title is too long (${title.length} characters). Maximum allowed is ${MAX_TITLE_LENGTH}.`,
    );
  }
}

/**
 * Shared streaming utilities
 */

// Set conversation streaming state
export async function setConversationStreaming(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
  isStreaming: boolean,
  messageId?: Id<"messages">,
): Promise<void> {
  await ctx.db.patch("conversations", conversationId, {
    isStreaming,
    ...(isStreaming
      ? { updatedAt: Date.now(), currentStreamingMessageId: messageId }
      : { currentStreamingMessageId: undefined }),
  });
}

// Set conversation streaming for actions (uses runMutation)
export async function setConversationStreamingForAction(
  ctx: ActionCtx,
  conversationId: Id<"conversations">,
  isStreaming: boolean,
  messageId?: Id<"messages">,
): Promise<void> {
  await ctx.runMutation(api.conversations.setStreaming, {
    conversationId,
    isStreaming,
    messageId,
  });
}

// Stop streaming for a conversation
export async function stopConversationStreaming(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
  options?: {
    content?: string;
    reasoning?: string;
  },
): Promise<void> {
  await setConversationStreaming(ctx, conversationId, false);

  // Also mark any streaming message as stopped
  const recentAssistantMessage = await ctx.db
    .query("messages")
    .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
    .filter((q) => q.eq(q.field("role"), "assistant"))
    .order("desc")
    .first();

  if (recentAssistantMessage) {
    const metadata = recentAssistantMessage.metadata as
      | Record<string, unknown>
      | null
      | undefined;
    // If the message doesn't have a finishReason, it's likely streaming
    if (!(metadata?.finishReason || metadata?.stopped)) {
      const updates: any = {
        status: "done",
        metadata: {
          ...metadata,
          finishReason: "user_stopped",
          stopped: true,
        },
      };
      
      // Save client overlay content (what user saw when they clicked Stop)
      if (options?.content !== undefined) {
        updates.content = options.content;
      }
      if (options?.reasoning !== undefined) {
        updates.reasoning = options.reasoning;
      }
      
      await ctx.db.patch("messages", recentAssistantMessage._id, updates);
    }
  }
}

/**
 * Shared pagination utilities
 */

// Apply pagination to any query
export async function applyPagination<T>(
  query: any,
  paginationOpts?: { cursor?: string; numItems?: number },
): Promise<{ page: T[]; isDone: boolean; continueCursor: string | null }> {
  if (!paginationOpts) {
    return {
      page: await query.collect(),
      isDone: true,
      continueCursor: null,
    };
  }

  return await query.paginate(paginationOpts);
}

// Create empty pagination result
export function createEmptyPaginationResult() {
  return {
    page: [],
    isDone: true,
    continueCursor: null,
  };
}

/**
 * Shared schema utilities
 */

// Sanitize schema keys for Convex (replaces $ with _)
// This is used to sanitize external schemas (like OpenAPI) that may contain reserved characters
export function sanitizeSchema(schema: any): any {
  if (Array.isArray(schema)) {
    return schema.map(sanitizeSchema);
  }
  if (schema !== null && typeof schema === "object") {
    const newObj: Record<string, any> = {};
    for (const [key, value] of Object.entries(schema)) {
      const newKey = key.startsWith("$") ? key.replace("$", "_") : key;
      newObj[newKey] = sanitizeSchema(value);
    }
    return newObj;
  }
  return schema;
}
