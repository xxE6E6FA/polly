import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { withRetry } from "../../ai/error_handlers";
import type { Infer } from "convex/values";
import type {
  extendedMessageMetadataSchema,
  providerSchema,
  reasoningPartSchema,
  toolCallSchema,
  attachmentSchema,
  webCitationSchema,
} from "../schemas";

export async function internalUpdateHandler(
  ctx: MutationCtx,
  args: {
    id: Id<"messages">;
    content?: string;
    reasoning?: string;
    model?: string;
    provider?: Infer<typeof providerSchema>;
    citations?: Infer<typeof webCitationSchema>[];
    metadata?: Infer<typeof extendedMessageMetadataSchema>;
    toolCalls?: Infer<typeof toolCallSchema>[];
    attachments?: Infer<typeof attachmentSchema>[];
    reasoningParts?: Infer<typeof reasoningPartSchema>[];
    appendContent?: string;
    appendReasoning?: string;
    clearMetadataFields?: string[];
  }
) {
  const { id, appendContent, appendReasoning, clearMetadataFields, ...rest } =
    args;

  return await withRetry(async () => {
    // Check if message exists before patching
    const message = await ctx.db.get("messages", id);
    if (!message) {
      return; // Return silently instead of throwing
    }

    // Don't overwrite error status - if message already has an error, skip metadata updates
    if (message.status === "error" && rest.metadata) {
      // Still allow non-metadata updates (like model/provider changes)
      const { metadata: _metadata, ...nonMetadataUpdates } = rest;
      if (Object.keys(nonMetadataUpdates).length > 0) {
        const updates: Partial<Doc<"messages">> = { ...nonMetadataUpdates };
        if (appendContent) {
          updates.content = (message.content || "") + appendContent;
        }
        if (appendReasoning) {
          updates.reasoning = (message.reasoning || "") + appendReasoning;
        }
        return await ctx.db.patch("messages", id, updates);
      }
      return;
    }

    const updates: Partial<Doc<"messages">> = { ...rest };
    if (appendContent) {
      updates.content = (message.content || "") + appendContent;
    }
    if (appendReasoning) {
      updates.reasoning = (message.reasoning || "") + appendReasoning;
    }

    // Handle explicit metadata field deletions by merging with existing metadata
    // and setting fields to undefined (which Convex will delete from the document)
    if (clearMetadataFields && clearMetadataFields.length > 0) {
      const existingMetadata = (message.metadata || {}) as Record<
        string,
        unknown
      >;
      const newMetadata: Record<string, unknown> = {
        ...existingMetadata,
        ...(rest.metadata || {}),
      };
      for (const field of clearMetadataFields) {
        newMetadata[field] = undefined;
      }
      updates.metadata = newMetadata as typeof message.metadata;
    }

    return await ctx.db.patch("messages", id, updates);
  });
}

export async function updateContentHandler(
  ctx: MutationCtx,
  args: {
    messageId: Id<"messages">;
    content: string;
    reasoning?: string;
    finishReason?: string;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    tokenUsage?: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      reasoningTokens?: number;
      cachedInputTokens?: number;
    };
    providerMessageId?: string;
    timestamp?: string;
    warnings?: string[];
    citations?: Infer<typeof webCitationSchema>[];
    timeToFirstTokenMs?: number;
    tokensPerSecond?: number;
  }
) {
  const {
    messageId,
    usage,
    finishReason,
    tokenUsage,
    providerMessageId,
    timestamp,
    warnings,
    citations,
    timeToFirstTokenMs,
    tokensPerSecond,
    ...updates
  } = args;

  // Check if message exists before patching
  const message = await ctx.db.get("messages", messageId);
  if (!message) {
    return false; // Message not found
  }

  // Don't overwrite error status - if message already has an error, skip metadata updates
  if (message.status === "error") {
    return false;
  }

  // If message is already done/stopped and we are NOT just finishing it (i.e. we are still streaming content),
  // then we should stop.
  // If finishReason is provided in args, we are finishing it.
  // If message.metadata?.finishReason is already set, it was stopped by user.
  if (message.metadata?.finishReason && !finishReason) {
    return false; // Stopped by user
  }

  // Build the update object
  const updateData: Record<string, unknown> = {
    ...updates,
    completedAt: Date.now(),
  };

  if (citations) {
    updateData.citations = citations;
  }

  if (finishReason) {
    updateData.status = "done";
    updateData.metadata = {
      ...(message.metadata || {}),
      finishReason,
      ...(usage && { usage }),
      ...(tokenUsage && { tokenUsage }),
      ...(providerMessageId && { providerMessageId }),
      ...(timestamp && { timestamp }),
      ...(warnings && { warnings }),
      ...(timeToFirstTokenMs && { timeToFirstTokenMs }),
      ...(tokensPerSecond && { tokensPerSecond }),
    };
  }

  await ctx.db.patch("messages", messageId, updateData);

  // Update rolling token estimate for assistant final content
  const updated = await ctx.db.get("messages", messageId);
  if (updated && updated.role === "assistant") {
    const delta = Math.max(1, Math.ceil((updates.content || "").length / 4));
    await withRetry(
      async () => {
        const freshConv = await ctx.db.get(
          "conversations",
          updated.conversationId
        );
        if (!freshConv) {
          return;
        }
        await ctx.db.patch("conversations", updated.conversationId, {
          tokenEstimate: Math.max(0, (freshConv.tokenEstimate || 0) + delta),
        });
      },
      5,
      25
    );
  }

  return true;
}

export async function internalAtomicUpdateHandler(
  ctx: MutationCtx,
  args: {
    id: Id<"messages">;
    content?: string;
    reasoning?: string;
    appendContent?: string;
    appendReasoning?: string;
    citations?: Infer<typeof webCitationSchema>[];
    metadata?: Infer<typeof extendedMessageMetadataSchema>;
  }
) {
  const { id, appendContent, appendReasoning, ...updates } = args;

  const filteredUpdates = Object.fromEntries(
    Object.entries(updates).filter(([_, value]) => value !== undefined)
  );

  if (!(appendContent || appendReasoning)) {
    if (Object.keys(filteredUpdates).length === 0) {
      return { shouldStop: false };
    }
    const message = await ctx.db.get("messages", id);
    if (!message) {
      return { shouldStop: false };
    }
    await ctx.db.patch("messages", id, filteredUpdates);
    const conversation = await ctx.db.get(
      "conversations",
      message.conversationId
    );
    return { shouldStop: !!conversation?.stopRequested };
  }

  return await withRetry(
    async () => {
      const message = await ctx.db.get("messages", id);
      if (!message) {
        throw new Error(`Message with id ${id} not found`);
      }

      const appendUpdates = { ...filteredUpdates };

      if (appendContent) {
        appendUpdates.content = (message.content || "") + appendContent;
      }
      if (appendReasoning) {
        appendUpdates.reasoning = (message.reasoning || "") + appendReasoning;
      }

      await ctx.db.patch("messages", id, appendUpdates);

      // Check if stop was requested - return signal to caller
      const conversation = await ctx.db.get(
        "conversations",
        message.conversationId
      );
      return { shouldStop: !!conversation?.stopRequested };
    },
    5,
    25
  );
}

