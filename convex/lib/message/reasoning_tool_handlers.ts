import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { withRetry } from "../../ai/error_handlers";
import type { Infer } from "convex/values";
import type {
  messageStatusSchema,
  toolCallSchema,
  webCitationSchema,
} from "../schemas";

export async function appendReasoningSegmentHandler(
  ctx: MutationCtx,
  args: {
    messageId: Id<"messages">;
    segmentIndex: number;
    text: string;
    startedAt: number;
  }
) {
  const { messageId, segmentIndex, text, startedAt } = args;
  return await withRetry(
    async () => {
      const message = await ctx.db.get("messages", messageId);
      if (!message) {
        return { shouldStop: false };
      }

      const parts = message.reasoningParts ?? [];

      if (segmentIndex < parts.length) {
        // Append to existing segment
        const existing = parts[segmentIndex];
        if (existing) {
          parts[segmentIndex] = {
            text: existing.text + text,
            startedAt: existing.startedAt,
          };
        }
      } else {
        // Create new segment
        parts.push({ text, startedAt });
      }

      // Keep the flat `reasoning` string in sync for backward compat (search, export)
      const reasoning = parts.map(p => p.text).join("\n\n");

      await ctx.db.patch("messages", messageId, {
        reasoningParts: parts,
        reasoning,
      });

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

export async function addToolCallHandler(
  ctx: MutationCtx,
  args: {
    messageId: Id<"messages">;
    toolCall: Infer<typeof toolCallSchema>;
  }
) {
  const { messageId, toolCall } = args;
  const message = await ctx.db.get("messages", messageId);
  if (!message) {
    console.warn(`addToolCall: Message ${messageId} not found`);
    return;
  }

  const existingCalls = message.toolCalls ?? [];
  // Check if tool call with same ID already exists
  if (existingCalls.some(tc => tc.id === toolCall.id)) {
    return; // Already added, skip
  }

  await ctx.db.patch("messages", messageId, {
    toolCalls: [...existingCalls, toolCall],
  });
}

export async function finalizeToolResultHandler(
  ctx: MutationCtx,
  args: {
    messageId: Id<"messages">;
    toolCallId: string;
    toolStatus: "completed" | "error";
    toolError?: string;
    citations?: Infer<typeof webCitationSchema>[];
    messageStatus: Infer<typeof messageStatusSchema>;
  }
) {
  const { messageId, toolCallId, toolStatus, toolError, citations, messageStatus } = args;
  return await withRetry(
    async () => {
      const message = await ctx.db.get("messages", messageId);
      if (!message) {
        return;
      }

      // Update tool call status
      const toolCalls = message.toolCalls ?? [];
      const updatedCalls = toolCalls.map(tc => {
        if (tc.id === toolCallId) {
          return {
            ...tc,
            status: toolStatus,
            completedAt: Date.now(),
            ...(toolError && { error: toolError }),
          };
        }
        return tc;
      });

      // Single patch: tool calls + optional citations + message status
      await ctx.db.patch("messages", messageId, {
        toolCalls: updatedCalls,
        status: messageStatus,
        ...(citations && { citations }),
      });
    },
    5,
    25
  );
}
