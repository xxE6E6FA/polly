import { ConvexError } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { withRetry } from "../../ai/error_handlers";
import type { Infer } from "convex/values";
import type {
  extendedMessageMetadataSchema,
  messageStatusSchema,
  webCitationSchema,
} from "../schemas";

export async function updateMessageStatusHandler(
  ctx: MutationCtx,
  args: {
    messageId: Id<"messages">;
    status: Infer<typeof messageStatusSchema>;
  }
) {
  await withRetry(async () => {
    // Get current message to check if it's an assistant message
    const message = await ctx.db.get("messages", args.messageId);
    if (!message) {
      console.error(
        "[updateMessageStatus] Message not found:",
        args.messageId
      );
      return;
    }

    // Don't overwrite error status - if message already has an error, skip this update
    if (message.status === "error" && args.status !== "error") {
      return;
    }

    const updateData: {
      status:
        | "error"
        | "thinking"
        | "searching"
        | "reading_pdf"
        | "streaming"
        | "done";
      metadata?: Record<string, unknown>;
    } = {
      status: args.status,
    };

    // For assistant messages with status "done", ensure finishReason is set
    if (message.role === "assistant" && args.status === "done") {
      const currentMetadata = message.metadata || {};
      const finalFinishReason = currentMetadata.finishReason || "stop";
      updateData.metadata = {
        ...currentMetadata,
        finishReason: finalFinishReason,
      };
    }

    await ctx.db.patch("messages", args.messageId, updateData);
  });
}

export async function updateAssistantContentHandler(
  ctx: MutationCtx,
  args: {
    messageId: Id<"messages">;
    content?: string;
    appendContent?: string;
    status?: Infer<typeof messageStatusSchema>;
    reasoning?: string;
    appendReasoning?: string;
    citations?: Infer<typeof webCitationSchema>[];
    metadata?: Infer<typeof extendedMessageMetadataSchema>;
  }
) {
  const { messageId, appendContent, appendReasoning, ...updates } = args;

  const filteredUpdates = Object.fromEntries(
    Object.entries(updates).filter(([_, value]) => value !== undefined)
  );

  // Never overwrite "done" status - once a message is done, it stays done
  let finalUpdates = filteredUpdates;
  if (args.status && args.status !== "done") {
    const currentMessage = await ctx.db.get("messages", messageId);
    if (currentMessage?.status === "done") {
      // Don't overwrite "done" status with any other status
      const { status: _, ...updatesWithoutStatus } = filteredUpdates;
      finalUpdates = updatesWithoutStatus;
    }
  }

  if (!(appendContent || appendReasoning)) {
    if (Object.keys(finalUpdates).length === 0) {
      return { shouldStop: false };
    }
    const message = await ctx.db.get("messages", messageId);
    if (!message) {
      return { shouldStop: false };
    }
    await ctx.db.patch("messages", messageId, finalUpdates);
    const conversation = await ctx.db.get(
      "conversations",
      message.conversationId
    );
    return { shouldStop: !!conversation?.stopRequested };
  }

  return await withRetry(
    async () => {
      const message = await ctx.db.get("messages", messageId);
      if (!message) {
        // Don't throw error, just return silently as the message might have been finalized
        return;
      }

      const appendUpdates = { ...finalUpdates };

      // Never overwrite "done" status in append operations either
      let finalAppendUpdates = appendUpdates;
      if (
        args.status &&
        args.status !== "done" &&
        message.status === "done"
      ) {
        const { status: _, ...updatesWithoutStatus } = appendUpdates;
        finalAppendUpdates = updatesWithoutStatus;
      }

      if (appendContent) {
        finalAppendUpdates.content = (message.content || "") + appendContent;
      }
      if (appendReasoning) {
        finalAppendUpdates.reasoning =
          (message.reasoning || "") + appendReasoning;
      }

      await ctx.db.patch("messages", messageId, finalAppendUpdates);

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

export async function updateAssistantStatusHandler(
  ctx: MutationCtx,
  args: {
    messageId: Id<"messages">;
    status: Infer<typeof messageStatusSchema>;
    statusText?: string;
  }
) {
  const { messageId, status, statusText } = args;

  try {
    // Get current message to preserve existing metadata
    const message = await ctx.db.get("messages", messageId);
    if (!message) {
      console.error("[updateAssistantStatus] Message not found:", messageId);
      return;
    }

    // Build the update object
    const updateData: {
      status:
        | "error"
        | "thinking"
        | "searching"
        | "reading_pdf"
        | "streaming"
        | "done";
      statusText?: string;
      metadata?: Record<string, unknown>;
    } = {
      status: status as
        | "error"
        | "thinking"
        | "searching"
        | "reading_pdf"
        | "streaming"
        | "done",
      statusText,
    };

    // If setting status to "done", ensure finishReason is set for proper streaming detection
    if (status === "done") {
      const currentMetadata = message.metadata || {};
      const finalFinishReason = currentMetadata.finishReason || "stop";
      updateData.metadata = {
        ...currentMetadata,
        finishReason: finalFinishReason,
      };

      // Update finish reason for debugging
    }

    // Update the message status and statusText in database
    await ctx.db.patch("messages", messageId, updateData);
  } catch (error) {
    console.error(
      "[updateAssistantStatus] Message not found, messageId:",
      messageId,
      error
    );
    throw new ConvexError(
      `Message with id ${messageId} not found: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function updateMessageErrorHandler(
  ctx: MutationCtx,
  args: {
    messageId: Id<"messages">;
    error: string;
  }
) {
  const { messageId, error } = args;
  try {
    const message = await ctx.db.get("messages", messageId);
    if (!message) {
      console.error("[updateMessageError] Message not found:", messageId);
      return;
    }

    await ctx.db.patch("messages", messageId, {
      status: "error",
      error,
      metadata: {
        ...message.metadata,
        finishReason: "error",
      },
    });
  } catch (error) {
    console.error(
      "[updateMessageError] Failed to update message error:",
      messageId,
      error
    );
  }
}
