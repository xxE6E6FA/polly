/**
 * Utilities for managing streaming state across conversations and messages
 */

import type { GenericQueryCtx, GenericMutationCtx } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";

type AnyCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>;

/**
 * Check if a conversation is currently streaming by examining its messages
 */
export async function isConversationStreaming(
  ctx: AnyCtx,
  conversationId: Id<"conversations">,
): Promise<boolean> {
  // Get the most recent assistant message in the conversation
  const recentMessage = await ctx.db
    .query("messages")
    .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
    .filter((q) => q.eq(q.field("role"), "assistant"))
    .order("desc")
    .first();

  if (!recentMessage) {
    return false;
  }

  // A message is considered streaming if it has no finishReason and no error status
  const metadata = recentMessage.metadata as any;
  const result =
    !metadata?.finishReason &&
    !metadata?.stopped &&
    recentMessage.status !== "error";
  return result;
}
