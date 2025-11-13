import { ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx, ActionCtx } from "../_generated/server";
import { api } from "../_generated/api";
import { getUserEffectiveModelWithCapabilities } from "./model_resolution";
import { MAX_USER_MESSAGE_CHARS } from "../constants";

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
  const user = await ctx.db.get(userId);
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
  const user = await ctx.db.get(userId);
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
    const conversation = await ctx.db.get(conversationId);
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

// Handle optional user authentication (returns null if not authenticated)
export async function getOptionalUser(
  ctx: MutationCtx | QueryCtx,
): Promise<Id<"users"> | null> {
  try {
    return await getAuthUserId(ctx);
  } catch {
    return null;
  }
}

/**
 * Shared database operation utilities
 */

// Check if user owns a resource (generic version removed due to type constraints)
export async function validateOwnership(
  _ctx: MutationCtx | QueryCtx,
  resourceUserId: Id<"users">,
  errorMessage: string = "Access denied",
): Promise<void> {
  // This function is currently a no-op but kept for interface compatibility
  // The actual validation should happen in mutations that check user access
  if (resourceUserId === undefined) {
    throw new ConvexError<string>(errorMessage);
  }
}

/**
 * Shared business logic utilities
 */

// Validate monthly message limits
export async function validateMonthlyMessageLimit(
  _ctx: MutationCtx | QueryCtx,
  user: Doc<"users">,
): Promise<void> {
  const monthlyLimit = user.monthlyLimit ?? 1000; // Default from shared constants
  const monthlyMessagesSent = user.monthlyMessagesSent ?? 0;
  if (monthlyMessagesSent >= monthlyLimit) {
    throw new ConvexError<string>(
      "Monthly built-in model message limit reached.",
    );
  }
}

// Validate monthly message limits for actions (no-op since actions don't have db access for validation)
export async function validateMonthlyMessageLimitForAction(
  _ctx: ActionCtx,
  user: Doc<"users">,
): Promise<void> {
  // For actions, we'll skip the validation since we can't reliably check/update the count
  // The actual validation should happen in mutations that process the messages
  const monthlyLimit = user.monthlyLimit ?? 1000;
  const monthlyMessagesSent = user.monthlyMessagesSent ?? 0;
  if (monthlyMessagesSent >= monthlyLimit) {
    throw new ConvexError<string>(
      "Monthly built-in model message limit reached.",
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
  } = {},
) {
  return {
    title: options.title || "New Conversation",
    userId: userId,
    personaId: options.personaId,
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
 * Shared streaming utilities
 */

// Set conversation streaming state
export async function setConversationStreaming(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
  isStreaming: boolean,
): Promise<void> {
  await ctx.db.patch(conversationId, {
    isStreaming,
    ...(isStreaming ? { updatedAt: Date.now() } : {}),
  });
}

// Set conversation streaming for actions (uses runMutation)
export async function setConversationStreamingForAction(
  ctx: ActionCtx,
  conversationId: Id<"conversations">,
  isStreaming: boolean,
): Promise<void> {
  await ctx.runMutation(api.conversations.setStreaming, {
    conversationId,
    isStreaming,
  });
}

// Stop streaming for a conversation
export async function stopConversationStreaming(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
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
      await ctx.db.patch(recentAssistantMessage._id, {
        status: "done",
        metadata: {
          ...metadata,
          finishReason: "stop",
          stopped: true,
        },
      });
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
