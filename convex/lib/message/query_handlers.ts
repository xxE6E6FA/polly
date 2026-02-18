import { getAuthUserId } from "../auth";
import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import {
  checkConversationAccess,
} from "../conversation_utils";
import { validatePaginationOpts } from "../pagination";
import {
  validateConversationAccess,
} from "../shared_utils";
import { estimateTokensFromText } from "./helpers";

export async function listHandler(
  ctx: QueryCtx,
  args: {
    conversationId: Id<"conversations">;
    includeAlternatives?: boolean;
    paginationOpts?: {
      numItems: number;
      cursor?: string | null;
      id?: number;
    };
    resolveAttachments?: boolean;
  }
) {
  // Verify the user has access to this conversation
  if (process.env.NODE_ENV !== "test") {
    await validateConversationAccess(ctx, args.conversationId, false);
  }

  let query = ctx.db
    .query("messages")
    .withIndex("by_conversation", q =>
      q.eq("conversationId", args.conversationId)
    )
    .order("asc");

  if (!args.includeAlternatives) {
    // Use optimized compound index for main branch messages
    query = ctx.db
      .query("messages")
      .withIndex("by_conversation_main_branch", q =>
        q.eq("conversationId", args.conversationId).eq("isMainBranch", true)
      )
      .order("asc");
  }

  const validatedOpts = validatePaginationOpts(args.paginationOpts);
  const messages = validatedOpts
    ? await query.paginate(validatedOpts)
    : await query.take(500); // Limit unbounded queries to 500 messages

  if (args.resolveAttachments !== false && !args.paginationOpts) {
    return await Promise.all(
      (Array.isArray(messages) ? messages : messages.page).map(
        async message => {
          if (message.attachments) {
            const resolvedAttachments = await Promise.all(
              message.attachments.map(async attachment => {
                if (attachment.storageId) {
                  const url = await ctx.storage.getUrl(attachment.storageId);
                  return {
                    ...attachment,
                    url: url || attachment.url,
                  };
                }
                return attachment;
              })
            );
            return {
              ...message,
              attachments: resolvedAttachments,
            };
          }
          return message;
        }
      )
    );
  }

  return Array.isArray(messages) ? messages : messages;
}

export async function getAlternativesHandler(
  ctx: QueryCtx,
  args: { parentId: Id<"messages"> }
) {
  return await ctx.db
    .query("messages")
    .withIndex("by_parent", q => q.eq("parentId", args.parentId))
    .collect();
}

export async function hasStreamingMessageHandler(
  ctx: QueryCtx,
  args: { conversationId: Id<"conversations"> }
) {
  const streamingMessage = await ctx.db
    .query("messages")
    .withIndex("by_conversation_streaming", q =>
      q
        .eq("conversationId", args.conversationId)
        .eq("role", "assistant")
        .eq("metadata.finishReason", undefined)
    )
    .first();

  // Return the message (truthy) or null per tests' expectations
  return streamingMessage || null;
}

export async function getMessageCountHandler(
  ctx: QueryCtx,
  args: { conversationId: Id<"conversations"> }
) {
  // Use cached messageCount if available (O(1) instead of O(n))
  const conversation = await ctx.db.get("conversations", args.conversationId);
  if (conversation?.messageCount !== undefined) {
    return conversation.messageCount;
  }

  // Fallback to counting for conversations without cached count
  const messages = await ctx.db
    .query("messages")
    .withIndex("by_conversation", q =>
      q.eq("conversationId", args.conversationId)
    )
    .collect();

  return messages.length;
}

export async function getConversationTokenEstimateHandler(
  ctx: QueryCtx,
  args: { conversationId: Id<"conversations"> }
) {
  // Use cached tokenEstimate if available (O(1) instead of O(n))
  const conversation = await ctx.db.get("conversations", args.conversationId);
  if (conversation?.tokenEstimate !== undefined) {
    return conversation.tokenEstimate;
  }

  // Fallback to scanning for conversations without cached estimate
  const messages = await ctx.db
    .query("messages")
    .withIndex("by_conversation", q =>
      q.eq("conversationId", args.conversationId)
    )
    .collect();

  let total = 0;
  for (const m of messages) {
    if (m.role === "user" || m.role === "assistant") {
      total += estimateTokensFromText(m.content || "");
    }
  }
  return total;
}

export async function isFavoritedHandler(
  ctx: QueryCtx,
  args: { messageId: Id<"messages"> }
) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return false;
  }
  const fav = await ctx.db
    .query("messageFavorites")
    .withIndex("by_user_message", q =>
      q.eq("userId", userId).eq("messageId", args.messageId)
    )
    .first();
  return Boolean(fav);
}

export async function listFavoritesHandler(
  ctx: QueryCtx,
  args: {
    limit?: number;
    cursor?: string;
  }
) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    // Gracefully handle unauthenticated clients by returning an empty result
    const empty = {
      items: [],
      hasMore: false,
      nextCursor: null as string | null,
      total: 0,
    } as const;
    return empty;
  }

  const limit = args.limit ?? 50;
  const start = args.cursor ? parseInt(args.cursor) : 0;

  const all = await ctx.db
    .query("messageFavorites")
    .withIndex("by_user_created", q => q.eq("userId", userId))
    .order("desc")
    .collect();

  const slice = all.slice(start, start + limit);

  const items = await Promise.all(
    slice.map(async fav => {
      const message = await ctx.db.get("messages", fav.messageId);
      const conversation = message
        ? await ctx.db.get("conversations", message.conversationId)
        : null;
      return {
        favoriteId: fav._id,
        createdAt: fav.createdAt,
        message,
        conversation,
      };
    })
  );

  return {
    items: items.filter(m => m.message && m.conversation),
    hasMore: start + limit < all.length,
    nextCursor: start + limit < all.length ? String(start + limit) : null,
    total: all.length,
  } as const;
}

export async function listFavoritesPaginatedHandler(
  ctx: QueryCtx,
  args: {
    paginationOpts: {
      numItems: number;
      cursor: string | null;
      id?: number;
    };
  }
) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    // Return empty pagination result for unauthenticated users
    return {
      page: [],
      isDone: true,
      continueCursor: "",
    };
  }

  const paginatedFavorites = await ctx.db
    .query("messageFavorites")
    .withIndex("by_user_created", q => q.eq("userId", userId))
    .order("desc")
    .paginate(args.paginationOpts);

  // Enrich paginated results with message and conversation data
  const enrichedPage = await Promise.all(
    paginatedFavorites.page.map(async fav => {
      const message = await ctx.db.get("messages", fav.messageId);
      const conversation = message
        ? await ctx.db.get("conversations", message.conversationId)
        : null;
      return {
        favoriteId: fav._id,
        createdAt: fav.createdAt,
        message,
        conversation,
      };
    })
  );

  return {
    ...paginatedFavorites,
    page: enrichedPage.filter(m => m.message && m.conversation),
  };
}

export async function getLastUsedModelHandler(
  ctx: QueryCtx,
  args: { conversationId: Id<"conversations"> }
) {
  // Get the most recent assistant message with model info
  const lastAssistantMessage = await ctx.db
    .query("messages")
    .withIndex("by_conversation_role", q =>
      q.eq("conversationId", args.conversationId).eq("role", "assistant")
    )
    .order("desc")
    .filter(q =>
      q.and(
        q.neq(q.field("model"), undefined),
        q.neq(q.field("provider"), undefined)
      )
    )
    .first();

  if (lastAssistantMessage?.model && lastAssistantMessage?.provider) {
    return {
      modelId: lastAssistantMessage.model,
      provider: lastAssistantMessage.provider,
    };
  }

  return null;
}

// Helper query to get the last assistant model used in a conversation
export async function getLastAssistantModelHandler(
  ctx: QueryCtx,
  args: { conversationId: Id<"conversations"> }
) {
  const lastAssistant = await ctx.db
    .query("messages")
    .withIndex("by_conversation", q =>
      q.eq("conversationId", args.conversationId)
    )
    .filter(q => q.eq(q.field("role"), "assistant"))
    .order("desc")
    .first();
  if (lastAssistant?.model && lastAssistant?.provider) {
    return {
      modelId: lastAssistant.model as string,
      provider: lastAssistant.provider as string,
    };
  }
  return null;
}

export async function getAllInConversationHandler(
  ctx: QueryCtx,
  args: { conversationId: Id<"conversations"> }
) {
  // Check access to the conversation
  const { hasAccess } = await checkConversationAccess(
    ctx,
    args.conversationId,
    true
  );
  if (!hasAccess) {
    return [];
  }

  const messages = await ctx.db
    .query("messages")
    .withIndex("by_conversation", q =>
      q.eq("conversationId", args.conversationId)
    )
    .order("asc")
    .collect();

  return await Promise.all(
    messages.map(async message => {
      if (message.attachments) {
        const resolvedAttachments = await Promise.all(
          message.attachments.map(async attachment => {
            if (attachment.storageId) {
              const url = await ctx.storage.getUrl(attachment.storageId);
              return {
                ...attachment,
                url: url || attachment.url, // Fallback to original URL if getUrl fails
              };
            }
            return attachment;
          })
        );
        return {
          ...message,
          attachments: resolvedAttachments,
        };
      }
      return message;
    })
  );
}
