import { ConvexError, type Infer } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { withRetry } from "../../ai/error_handlers";
import { incrementUserMessageStats } from "../conversation_utils";
import type {
  attachmentSchema,
  extendedMessageMetadataSchema,
  imageGenerationSchema,
  messageStatusSchema,
  reasoningConfigSchema,
} from "../schemas";
import {
  getAuthenticatedUser,
  validateConversationAccess,
} from "../shared_utils";

export async function createHandler(
  ctx: MutationCtx,
  args: {
    conversationId: Id<"conversations">;
    role: string;
    content: string;
    status?: Infer<typeof messageStatusSchema>;
    model?: string;
    provider?: string;
    reasoningConfig?: Infer<typeof reasoningConfigSchema>;
    parentId?: Id<"messages">;
    isMainBranch?: boolean;
    reasoning?: string;
    sourceConversationId?: Id<"conversations">;
    useWebSearch?: boolean;
    attachments?: Infer<typeof attachmentSchema>[];
    metadata?: Infer<typeof extendedMessageMetadataSchema>;
    imageGeneration?: Infer<typeof imageGenerationSchema>;
  }
) {
  const userId = await getAuthenticatedUser(ctx);
  // Rolling token estimate helper
  const estimateTokens = (text: string) =>
    Math.max(1, Math.ceil((text || "").length / 4));

  // Strip large fields from attachments before storing in database
  // thumbnail: Base64 preview (can be >1MB on iOS), regenerate from storageId when needed
  // content: Text file content, fetch from storageId when needed
  // These fields are only needed for UI during upload, not for storage
  // Exception: video thumbnails must be preserved (can't regenerate from video URL at display time)
  const attachmentsForStorage = args.attachments?.map(
    ({ thumbnail, content, ...attachment }) => ({
      ...attachment,
      ...(thumbnail && attachment.type === "video" ? { thumbnail } : {}),
    })
  );

  // For assistant messages, snapshot the active persona so it's frozen at creation time
  let personaName: string | undefined;
  let personaIcon: string | undefined;
  if (args.role === "assistant") {
    const conversation = await ctx.db.get("conversations", args.conversationId);
    if (conversation?.personaId) {
      const persona = await ctx.db.get("personas", conversation.personaId);
      if (persona) {
        personaName = persona.name;
        personaIcon = persona.icon ?? undefined;
      }
    }
  }

  const messageId = await ctx.db.insert("messages", {
    ...args,
    attachments: attachmentsForStorage,
    userId,
    personaName,
    personaIcon,
    isMainBranch: args.isMainBranch ?? true,
    createdAt: Date.now(),
  });

  if (args.role === "user") {
    const conversation = await ctx.db.get("conversations", args.conversationId);
    if (conversation) {
      // Only increment stats if model and provider are provided
      if (args.model && args.provider) {
        await incrementUserMessageStats(
          ctx,
          conversation.userId,
          args.model,
          args.provider
        );
      }

      // Update rolling token estimate with user message content
      const delta = estimateTokens(args.content || "");
      await withRetry(
        async () => {
          const fresh = await ctx.db.get("conversations", args.conversationId);
          if (!fresh) {
            return;
          }
          await ctx.db.patch("conversations", args.conversationId, {
            tokenEstimate: Math.max(0, (fresh.tokenEstimate || 0) + delta),
            messageCount: (fresh.messageCount || 0) + 1,
          });
        },
        5,
        25
      );
    }
  } else {
    // For non-user messages, still update messageCount
    await withRetry(
      async () => {
        const fresh = await ctx.db.get("conversations", args.conversationId);
        if (!fresh) {
          return;
        }
        await ctx.db.patch("conversations", args.conversationId, {
          messageCount: (fresh.messageCount || 0) + 1,
        });
      },
      5,
      25
    );
  }

  return messageId;
}

export async function createUserMessageBatchedHandler(
  ctx: MutationCtx,
  args: {
    conversationId: Id<"conversations">;
    content: string;
    model?: string;
    provider?: string;
    reasoningConfig?: Infer<typeof reasoningConfigSchema>;
    parentId?: Id<"messages">;
    isMainBranch?: boolean;
    reasoning?: string;
    sourceConversationId?: Id<"conversations">;
    useWebSearch?: boolean;
    attachments?: Infer<typeof attachmentSchema>[];
    metadata?: Infer<typeof extendedMessageMetadataSchema>;
  }
) {
  const userId = await getAuthenticatedUser(ctx);

  const messageId = await ctx.db.insert("messages", {
    ...args,
    role: "user",
    userId,
    isMainBranch: args.isMainBranch ?? true,
    createdAt: Date.now(),
  });

  // Check if this is a built-in model
  const conversation = await ctx.db.get("conversations", args.conversationId);
  if (conversation) {
    if (args.model && args.provider) {
      await incrementUserMessageStats(
        ctx,
        conversation.userId,
        args.model,
        args.provider
      );
    }

    // Update messageCount for the conversation
    await withRetry(
      async () => {
        const fresh = await ctx.db.get("conversations", args.conversationId);
        if (!fresh) {
          return;
        }
        await ctx.db.patch("conversations", args.conversationId, {
          messageCount: (fresh.messageCount || 0) + 1,
        });
      },
      5,
      25
    );
  }

  return messageId;
}

export async function updateHandler(
  ctx: MutationCtx,
  args: {
    id: Id<"messages">;
    content?: string;
    reasoning?: string;
    patch?: unknown;
  }
) {
  const message = await ctx.db.get("messages", args.id);
  if (!message) {
    throw new Error("Message not found");
  }

  // Check access to the conversation this message belongs to (no shared access for mutations)
  if (process.env.NODE_ENV !== "test") {
    await validateConversationAccess(ctx, message.conversationId, false);
  }

  const { id, patch, ...directUpdates } = args;

  const updates = patch || directUpdates;

  const cleanUpdates = Object.fromEntries(
    Object.entries(updates).filter(([_, value]) => value !== undefined)
  );

  if (Object.keys(cleanUpdates).length > 0) {
    await ctx.db.patch("messages", id, cleanUpdates);
  }
}

export async function removeAttachmentHandler(
  ctx: MutationCtx,
  args: {
    messageId: Id<"messages">;
    attachmentName: string;
  }
) {
  const { messageId, attachmentName } = args;

  try {
    const message = await ctx.db.get("messages", messageId);
    if (!message) {
      throw new Error("Message not found");
    }

    // Check access to the conversation this message belongs to
    await validateConversationAccess(ctx, message.conversationId, false);

    // Find the attachment being removed to get its storageId
    const attachmentToRemove = (message.attachments || []).find(
      attachment => attachment.name === attachmentName
    );

    // Filter out the specific attachment by name
    const updatedAttachments = (message.attachments || []).filter(
      attachment => attachment.name !== attachmentName
    );

    // Update the message with the filtered attachments
    await ctx.db.patch("messages", messageId, {
      attachments: updatedAttachments,
    });

    // Also delete the corresponding userFiles entry to keep tables in sync
    // This prevents broken image links in the file library
    if (attachmentToRemove?.storageId) {
      const userFileEntry = await ctx.db
        .query("userFiles")
        .withIndex("by_message", q => q.eq("messageId", messageId))
        .filter(q => q.eq(q.field("storageId"), attachmentToRemove.storageId))
        .unique();

      if (userFileEntry) {
        await ctx.db.delete("userFiles", userFileEntry._id);
      }
    }
  } catch (error) {
    console.error("[removeAttachment] Error:", error);
    throw new ConvexError(
      `Failed to remove attachment from message ${messageId}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
