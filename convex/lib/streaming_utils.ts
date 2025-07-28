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
  conversationId: Id<"conversations">
): Promise<boolean> {
  // Get the most recent assistant message in the conversation
  const recentMessage = await ctx.db
    .query("messages")
    .withIndex("by_conversation", q => q.eq("conversationId", conversationId))
    .filter(q => q.eq(q.field("role"), "assistant"))
    .order("desc")
    .first();

  if (!recentMessage) {
    return false;
  }

  // A message is considered streaming if it has no finishReason and no error status
  const metadata = recentMessage.metadata as any;
  return !metadata?.finishReason && !metadata?.stopped && recentMessage.status !== "error";
}

/**
 * Find the currently streaming message in a conversation
 */
export async function findStreamingMessage(
  ctx: AnyCtx,
  conversationId: Id<"conversations">
): Promise<{ id: string; isStreaming: boolean } | null> {
  const recentMessage = await ctx.db
    .query("messages")
    .withIndex("by_conversation", q => q.eq("conversationId", conversationId))
    .filter(q => q.eq(q.field("role"), "assistant"))
    .order("desc")
    .first();

  if (!recentMessage) {
    return null;
  }

  const metadata = recentMessage.metadata as any;
  const isStreaming = !metadata?.finishReason && !metadata?.stopped && recentMessage.status !== "error";
  
  return isStreaming ? { id: recentMessage._id, isStreaming: true } : null;
}

/**
 * Storage for active streaming operations (in-memory, per-deployment)
 * Note: This is a fallback - the main stop mechanism should use message status
 */
const activeStreams = new Map<string, AbortController>();

export function setStreamActive(conversationId: string, abortController: AbortController) {
  console.log(`[streaming_utils] Registering stream for conversation: ${conversationId}`);
  activeStreams.set(conversationId, abortController);
}

export function abortStream(conversationId: string): boolean {
  console.log(`[streaming_utils] Attempting to abort stream for conversation: ${conversationId}`);
  const controller = activeStreams.get(conversationId);
  if (controller) {
    console.log(`[streaming_utils] Found and aborting stream for conversation: ${conversationId}. Signal aborted before: ${controller.signal.aborted}`);
    controller.abort();
    console.log(`[streaming_utils] Signal aborted after: ${controller.signal.aborted}`);
    activeStreams.delete(conversationId);
    return true;
  }
  console.log(`[streaming_utils] No active stream found for conversation: ${conversationId}. Active streams:`, Array.from(activeStreams.keys()));
  return false;
}

export function clearStream(conversationId: string) {
  console.log(`[streaming_utils] Clearing stream for conversation: ${conversationId}`);
  activeStreams.delete(conversationId);
}

export function isStreamActive(conversationId: string): boolean {
  return activeStreams.has(conversationId);
}
