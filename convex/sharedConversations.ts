import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import { paginationOptsSchema, validatePaginationOpts } from "./lib/pagination";
import { getAuthenticatedUser } from "./lib/shared_utils";

// Shared handler for conversation ownership validation
async function handleValidateConversationOwnership(
  ctx: MutationCtx | QueryCtx,
  conversationId: Id<"conversations">,
  userId: Id<"users">
): Promise<Doc<"conversations">> {
  const conversation = await ctx.db.get("conversations", conversationId);
  if (!conversation) {
    throw new ConvexError("Conversation not found");
  }

  if (conversation.userId !== userId) {
    throw new ConvexError("You can only access your own conversations");
  }

  return conversation;
}

// Shared handler for getting shared conversation by original conversation ID
async function handleGetSharedConversation(
  ctx: MutationCtx | QueryCtx,
  conversationId: Id<"conversations">
): Promise<Doc<"sharedConversations"> | null> {
  return await ctx.db
    .query("sharedConversations")
    .withIndex("by_original_conversation", q =>
      q.eq("originalConversationId", conversationId)
    )
    .first();
}

// Generate a cryptographically secure random share ID
function generateShareId(): string {
  // Use crypto.getRandomValues() for cryptographically secure randomness
  // This generates a 32-character hex string (128 bits of entropy)
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, "0")).join("");
}

// Share a conversation
export const shareConversation = mutation({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUser(ctx);
    const conversation = await handleValidateConversationOwnership(
      ctx,
      args.conversationId,
      userId
    );

    // Check if already shared
    const existingShare = await handleGetSharedConversation(
      ctx,
      args.conversationId
    );
    if (existingShare) {
      return existingShare.shareId;
    }

    // Get message count for this conversation
    const messageCount = await ctx.runQuery(api.messages.getMessageCount, {
      conversationId: args.conversationId,
    });

    const shareId = generateShareId();
    const now = Date.now();

    await ctx.db.insert("sharedConversations", {
      shareId,
      originalConversationId: args.conversationId,
      userId,
      title: conversation.title,
      sharedAt: now,
      lastUpdated: now,
      messageCount,
    });

    return shareId;
  },
});

// Update shared conversation (captures current state)
export const updateSharedConversation = mutation({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUser(ctx);
    const conversation = await handleValidateConversationOwnership(
      ctx,
      args.conversationId,
      userId
    );

    // Get the shared conversation record
    const sharedConversation = await handleGetSharedConversation(
      ctx,
      args.conversationId
    );
    if (!sharedConversation) {
      throw new ConvexError("Conversation is not currently shared");
    }

    // Get current message count
    const messageCount = await ctx.runQuery(api.messages.getMessageCount, {
      conversationId: args.conversationId,
    });

    // Update the shared conversation
    await ctx.db.patch("sharedConversations", sharedConversation._id, {
      title: conversation.title,
      lastUpdated: Date.now(),
      messageCount,
    });

    return sharedConversation.shareId;
  },
});

// Unshare a conversation
export const unshareConversation = mutation({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUser(ctx);
    await handleValidateConversationOwnership(ctx, args.conversationId, userId);

    // Find and delete the shared conversation record
    const sharedConversation = await handleGetSharedConversation(
      ctx,
      args.conversationId
    );
    if (sharedConversation) {
      await ctx.db.delete("sharedConversations", sharedConversation._id);
    }

    return true;
  },
});

// Get shared conversation status
export const getSharedStatus = query({
  args: {
    conversationId: v.string(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    shareId: string;
    sharedAt: number;
    lastUpdated: number;
    sharedMessageCount: number;
    currentMessageCount: number;
    hasNewMessages: boolean;
  } | null> => {
    try {
      const conversationId = args.conversationId as Id<"conversations">;
      const sharedConversation = await handleGetSharedConversation(
        ctx,
        conversationId
      );

      if (!sharedConversation) {
        return null;
      }

      // Get current message count to see if there are new messages
      const currentMessageCount: number = await ctx.runQuery(
        api.messages.getMessageCount,
        {
          conversationId,
        }
      );

      return {
        shareId: sharedConversation.shareId,
        sharedAt: sharedConversation.sharedAt,
        lastUpdated: sharedConversation.lastUpdated,
        sharedMessageCount: sharedConversation.messageCount,
        currentMessageCount,
        hasNewMessages: currentMessageCount > sharedConversation.messageCount,
      };
    } catch {
      // Invalid ID format or any other error - return null
      return null;
    }
  },
});

// Get shared conversation by share ID (public access)
export const getSharedConversation = query({
  args: {
    shareId: v.string(),
  },
  handler: async (ctx, args) => {
    const sharedConversation = await ctx.db
      .query("sharedConversations")
      .withIndex("by_share_id", q => q.eq("shareId", args.shareId))
      .first();

    if (!sharedConversation) {
      return null;
    }

    // Get the original conversation
    const conversation = await ctx.db.get(
      "conversations",
      sharedConversation.originalConversationId
    );
    if (!conversation) {
      return null;
    }

    // Get messages up to the shared count (capturing state at time of sharing/last update)
    const allMessages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", q =>
        q.eq("conversationId", sharedConversation.originalConversationId)
      )
      .filter(q => q.eq(q.field("isMainBranch"), true))
      .order("asc")
      .collect();

    // Only include messages up to the shared count, and strip attachments for privacy
    const sharedMessages = allMessages
      .slice(0, sharedConversation.messageCount)
      .map(message => ({
        ...message,
        attachments: undefined, // Remove attachments for privacy
      }));

    return {
      conversation: {
        ...conversation,
        title: sharedConversation.title,
      },
      messages: sharedMessages,
      sharedAt: sharedConversation.sharedAt,
      lastUpdated: sharedConversation.lastUpdated,
    };
  },
});

// List user's shared conversations
export const listUserSharedConversations = query({
  args: {
    paginationOpts: paginationOptsSchema,
  },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUser(ctx);

    const query = ctx.db
      .query("sharedConversations")
      .withIndex("by_user", q => q.eq("userId", userId))
      .order("desc");

    const validatedOpts = validatePaginationOpts(args.paginationOpts);
    return validatedOpts
      ? await query.paginate(validatedOpts)
      : await query.collect();
  },
});

// Dedicated pagination-only query for usePaginatedQuery
export const listUserSharedConversationsPaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
    sortField: v.optional(
      v.union(v.literal("title"), v.literal("sharedAt"), v.literal("expiresAt"))
    ),
    sortDirection: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUser(ctx);
    const sortField = args.sortField ?? "sharedAt";
    const sortDirection = args.sortDirection ?? "desc";

    // Choose the appropriate index based on sort field
    // expiresAt sorts by lastUpdated since expiry is calculated from it
    const getIndexName = () => {
      if (sortField === "title") {
        return "by_user_title";
      }
      if (sortField === "expiresAt") {
        return "by_user_last_updated";
      }
      return "by_user_shared_at";
    };
    const indexName = getIndexName();

    const query = ctx.db
      .query("sharedConversations")
      .withIndex(indexName, q => q.eq("userId", userId))
      .order(sortDirection);

    return await query.paginate(args.paginationOpts);
  },
});
